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

  it('release does not become amnesia: a value the GUEST binds still trips', async () => {
    // Guards against "release everything, account nothing". Note it binds inside the loop
    // BODY, which is where the guest actually allocates — see the note below on why the
    // loop VARIABLE is deliberately not the right probe for this.
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'map',
            items: [1, 2, 3],
            as: 'item',
            steps: [
              {
                op: 'varSet',
                key: 'held',
                value: { $kind: 'arg', path: 'big' },
              },
            ],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      } as any,
      { big: chunk() } as any,
      { fuel: 1e6, maxHeapBytes: 8 * 1024 }
    )
    expect(res.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })

  /**
   * What `maxHeapBytes` is FOR, written down because an earlier version of this file got
   * it wrong and the wrong version looked more secure.
   *
   * It bounds what the GUEST causes to be retained during a run. A large array written as
   * a LITERAL in the AST is not that: the host parsed and materialised it before `run()`
   * was ever called, so by the time any ceiling could speak, the memory is already
   * allocated and the ceiling cannot un-allocate it. Charging the guest for it is a
   * category error — and charging it once per loop iteration, which is what the code did,
   * is that error multiplied by N.
   *
   * The size of an accepted program is the host's decision, made before the run.
   * `maxHeapBytes` governs what happens after.
   */
  it('does not charge the guest for a literal the HOST already materialised', async () => {
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
    expect(res.error?.message ?? 'ok').toBe('ok')
  })

  it('but a guest-allocated array IS accounted, then iterating it is free', async () => {
    // The other side, and the reason aliasing the loop variable is correct rather than
    // merely cheaper: when the array comes from guest state it is already on the ledger,
    // so charging again for each item is double-counting.
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'data', value: { $kind: 'arg', path: 'big' } },
          { op: 'return', value: { ok: 1 } },
        ],
      } as any,
      { big: chunk() } as any,
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

/**
 * A loop VARIABLE aliases the array being iterated; an ACCUMULATOR does not.
 *
 * Accounting the loop item was wrong twice: it double-counted (the array is already on the
 * ledger, and the item is part of it), and because a fresh item can never hit the identity
 * fast path, every iteration ran a full `estimateBytes` walk. That made loop cost
 * size-sensitive, which `cost-invariant.test.ts` explicitly promises it is not — measured
 * against 0.13.0-beta.1, `filter` over 5000 records went from 101.2 fuel flat to 116.2
 * shallow and 166.2 deep. Budgets tuned on an earlier release started failing on unchanged
 * code, with nothing in the CHANGELOG to explain it.
 *
 * The exemption is "already retained elsewhere", NOT "in a loop". These tests pin both
 * halves, because the second is the one an over-eager version of this fix would break.
 */
describe('iteration bindings alias, accumulators do not', () => {
  const wide = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i, keep: i % 2 === 0 }))
  const deep = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: i,
      keep: i % 2 === 0,
      meta: { tags: ['a', 'b'], nested: { x: i, y: [1, 2, 3] } },
    }))

  const filterFuel = async (items: unknown[]) => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'filter',
            items,
            as: 'r',
            condition: {
              $expr: 'member',
              object: { $expr: 'ident', name: 'r' },
              property: 'keep',
            },
          },
          { op: 'return', value: { ok: 1 } },
        ],
      } as any,
      {} as any,
      { fuel: 1e7 }
    )
    expect(res.error?.message ?? 'ok').toBe('ok')
    return res.fuelUsed ?? 0
  }

  it('costs the same for shallow and deep items', async () => {
    // The invariant `cost-invariant.test.ts` declares for map/filter/reduce/find.
    const [shallow, nested] = [
      await filterFuel(wide(2000)),
      await filterFuel(deep(2000)),
    ]
    expect(`${shallow.toFixed(1)} / ${nested.toFixed(1)}`).toBe(
      `${shallow.toFixed(1)} / ${shallow.toFixed(1)}`
    )
  })

  it('a value built INSIDE the loop is still accounted', async () => {
    // The exemption covers the loop variable only. Anything the body binds goes through
    // the ordinary path, so the ceiling still applies where the guest allocates.
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'map',
            items: [1, 2, 3],
            as: 'i',
            steps: [
              {
                op: 'varSet',
                key: 'blob',
                value: { $kind: 'arg', path: 'big' },
              },
            ],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      } as any,
      { big: chunk() } as any,
      { fuel: 1e6, maxHeapBytes: 8 * 1024 }
    )
    expect(res.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })

  it("reduce's ACCUMULATOR is still accounted", async () => {
    // The case that makes `alias` a rule rather than a shortcut: an accumulator is rebuilt
    // each iteration and can grow without bound. Exempting it would reopen the
    // accumulate-until-OOM attack the ceiling exists to stop.
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'reduce',
            items: [1, 2, 3, 4],
            as: 'i',
            accumulator: 'acc',
            initial: [],
            steps: [
              {
                op: 'varSet',
                key: 'result',
                value: { $kind: 'arg', path: 'big' },
              },
            ],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      } as any,
      { big: chunk() } as any,
      { fuel: 1e6, maxHeapBytes: 8 * 1024 }
    )
    expect(res.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })
})
