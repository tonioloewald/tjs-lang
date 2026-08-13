/**
 * The live-heap ceiling holds ACROSS SCOPES.
 *
 * `maxHeapBytes` is the run's space budget, and the space it must bound is everything the
 * guest holds LIVE — not everything the outermost scope happens to hold. The ledger that
 * enforces it was keyed by bare variable NAME and shared by reference across child scopes,
 * so a child binding `x` was accounted as a REPLACEMENT of the parent's `x`: the parent's
 * size was subtracted while the parent's value stayed perfectly alive in the parent scope
 * object.
 *
 * That turns every child-scope binder into a way to buy budget back. `map`/`filter`/
 * `find`/`reduce` all take an `as` name the guest chooses, and `callLocal` binds parameter
 * names, so the guest picks the key — no hand-built AST required. Measured against a 6MB
 * cap before the fix: RSS +672MB, 112× over the ceiling it advertises.
 *
 * The invariant, stated so it cannot be satisfied by accident: **N distinct live values,
 * each shadowed once in a child scope, must still trip the cap.** Shadowing is not freeing.
 *
 * ## Why the release half is tested too
 *
 * The fix gives each scope its own ledger, which introduces the opposite failure: a scope
 * whose entries are never released leaks accounting, and a `map` over a few thousand items
 * would trip a ceiling it is nowhere near. That direction is FAIL-CLOSED (a spurious error,
 * not a bypass) but it is still a bug, and an untested release path is how a cap ends up
 * enforcing something nobody asked for. Both directions are asserted.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'

const VM = new AgentVM()

/** ~16KB each: 2000 numbers at 8 bytes, plus the array header. */
const CHUNK = 2000
const chunk = () => Array.from({ length: CHUNK }, (_, i) => i)

/**
 * Bind `n` distinct large values, shadowing each one inside a child scope immediately
 * after binding it. Every value stays live in the top scope for the whole run.
 */
function shadowingProgram(n: number) {
  const steps: any[] = []
  for (let i = 0; i < n; i++) {
    steps.push({
      op: 'varSet',
      key: `v${i}`,
      value: { $kind: 'arg', path: 'big' },
    })
    // A child scope binds the SAME name to a one-byte value. The parent's array is
    // untouched and unreachable from here — this frees nothing.
    steps.push({ op: 'map', items: [0], as: `v${i}`, steps: [] })
  }
  steps.push({ op: 'return', value: { ok: 1 } })
  return { op: 'seq', steps } as any
}

const SURVIVED = 'completed with ~128KB live under a 64KB cap'

describe('shadowing a name in a child scope does not free its budget', () => {
  it('the control trips: eight live values, no shadowing', async () => {
    // Establishes that the cap works at all on this program shape, so the attack case
    // below is measuring shadowing and not a broken apparatus.
    const steps: any[] = []
    for (let i = 0; i < 8; i++) {
      steps.push({
        op: 'varSet',
        key: `v${i}`,
        value: { $kind: 'arg', path: 'big' },
      })
    }
    steps.push({ op: 'return', value: { ok: 1 } })
    const res = await VM.run(
      { op: 'seq', steps } as any,
      { big: chunk() } as any,
      {
        fuel: 1e6,
        maxHeapBytes: 64 * 1024,
      }
    )
    expect(res.error?.message ?? SURVIVED).toMatch(/Heap limit exceeded/)
  })

  it('trips the ceiling despite every value being shadowed once', async () => {
    // 8 × ~16KB = ~128KB live against a 64KB cap. Before the fix each `map` handed back
    // the preceding `varSet`'s accounting, so the running total never rose above one
    // chunk and the run completed cleanly with 128KB held.
    const res = await VM.run(shadowingProgram(8), { big: chunk() } as any, {
      fuel: 1e6,
      maxHeapBytes: 64 * 1024,
    })
    expect(
      res.error?.message ?? SURVIVED,
      'child-scope shadowing bought budget back'
    ).toMatch(/Heap limit exceeded/)
  })

  it('still trips when the shadow is a callLocal parameter', async () => {
    // A second, INDEPENDENT vector: `callLocal` builds its scope by hand rather than via
    // `createChildScope`, so it kept the shared ledger after that was fixed. The guest
    // names helper parameters, so it picks the key here too.
    const steps: any[] = []
    for (let i = 0; i < 8; i++) {
      steps.push({
        op: 'varSet',
        key: `v${i}`,
        value: { $kind: 'arg', path: 'big' },
      })
      steps.push({ op: 'callLocal', name: `h${i}`, args: [0] })
    }
    steps.push({ op: 'return', value: { ok: 1 } })

    const helpers: Record<string, any> = {}
    for (let i = 0; i < 8; i++) {
      helpers[`h${i}`] = { paramNames: [`v${i}`], steps: [] }
    }

    const res = await VM.run(
      { op: 'seq', helpers, steps } as any,
      { big: chunk() } as any,
      { fuel: 1e6, maxHeapBytes: 64 * 1024 }
    )
    expect(res.error?.message ?? SURVIVED).toMatch(/Heap limit exceeded/)
  })
})

describe('a discarded scope releases its accounting', () => {
  it('a long map over small items does not accumulate to a false positive', async () => {
    // The opposite direction. Per-scope ledgers make this the new hazard: 5000 iterations
    // each binding one item must cost ONE item's worth of headroom at a time, not 5000.
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'map',
            items: Array.from({ length: 5000 }, (_, i) => i),
            as: 'item',
            steps: [],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      } as any,
      {} as any,
      { fuel: 1e6, maxHeapBytes: 64 * 1024 }
    )
    expect(res.error?.message ?? 'ok').toBe('ok')
  })

  it('a map binding a LARGE value per iteration still trips', async () => {
    // Release must not become amnesia: if a single iteration genuinely exceeds the cap,
    // the run must still stop. Guards against "release everything, account nothing".
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'map',
            items: [chunk(), chunk(), chunk()],
            as: 'item',
            steps: [],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      } as any,
      {} as any,
      { fuel: 1e6, maxHeapBytes: 8 * 1024 }
    )
    expect(res.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })

  it('surfaces the error instead of swallowing it inside the child scope', async () => {
    // The other half of this defect, and not in the original report: `createChildScope`
    // spread `error` into a DETACHED slot, and none of the eight call sites copied it
    // back. Every error raised inside any child scope vanished and the run reported
    // success — verified for the heap ceiling, `Unknown Atom`, and the `__proto__`
    // security guard, all of which surface correctly at top level.
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          { op: 'map', items: [1], as: 'i', steps: [{ op: 'noSuchAtom' }] },
          { op: 'return', value: { ok: 1 } },
        ],
      } as any,
      {} as any,
      { fuel: 1e5 }
    )
    expect(res.error?.message ?? 'swallowed').toMatch(/Unknown Atom/)
  })

  it('surfaces a security-guard rejection from inside a child scope', async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'map',
            items: [1],
            as: 'i',
            steps: [{ op: 'varSet', key: '__proto__', value: 1 }],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      } as any,
      {} as any,
      { fuel: 1e5 }
    )
    expect(res.error?.message ?? 'swallowed').toMatch(/forbidden/)
  })
})
