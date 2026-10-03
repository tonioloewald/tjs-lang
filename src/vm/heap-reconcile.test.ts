/**
 * The heap ceiling measures what is LIVE (docs/reviews/0.14.0-rc.2-rereview-3.md).
 *
 * The estimate only grows and is reconciled against a true measurement before any run fails,
 * so both of the third re-review's directions are pinned here, through `transpile()`:
 *   - no ESCAPE: bytes reachable from an outer binding count after the inner scope ends (B1);
 *   - no FALSE REJECTION: bytes that are gone stop counting, however they were charged (M1).
 * And the measurement's completeness — every scope a root, every root released — because a
 * root the measurement cannot see is memory the ceiling cannot see.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { defineAtom } from './runtime'

const CAP = { maxHeapBytes: 1_000_000, fuel: 5_000_000 }
const run = (src: string, opts: Record<string, unknown> = CAP) =>
  new AgentVM().run(transpile(src).ast, {}, opts)

describe('no escape: bytes still reachable are still counted', () => {
  it('rows built in a loop body and pushed onto an outer array (B1)', async () => {
    const r = await run(`function f() {
      let rows = []
      let k = 0
      while (k < 50) {
        let r = []
        rows.push(r)
        let i = 0
        while (i < 400) { r.push('x'.repeat(1000) + i); i = i + 1 }
        k = k + 1
      }
      return { n: rows.length }
    }`)
    expect(r.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })

  it('a helper that pushes into its parameter (B1, second variant)', async () => {
    const r = await run(`function fill(a: ['']) {
      let i = 0
      while (i < 400) { a.push('x'.repeat(1000) + i); i = i + 1 }
      return 0
    }
    function f() {
      let rows = []
      let k = 0
      while (k < 50) { let r = []; rows.push(r); fill(r); k = k + 1 }
      return { n: rows.length }
    }`)
    expect(r.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })

  it('the error reports the MEASURED live heap', async () => {
    const r = await run(`function f() {
      let rows = []
      let i = 0
      while (i < 2000) { rows.push('x'.repeat(1000) + i); i = i + 1 }
      return { n: rows.length }
    }`)
    // ~1MB live at the moment it tripped — not a cumulative charge of many MB
    expect(r.error?.message ?? '').toMatch(/holds ~1MB/)
  })
})

describe('memo caches are measured roots', () => {
  // A value held ONLY by a memo cache — never bound to a name — is reachable for the rest of
  // the (sub-)program. Ten distinct keys × ~200KB, unbound, inside a sub-agent, under 1MB.
  const lit = (value: unknown) => ({ $expr: 'literal', value })
  const memoLoop = {
    $ajs: 2,
    op: 'seq',
    steps: [
      { op: 'varSet', key: 'k', value: lit(0) },
      {
        op: 'while',
        condition: {
          $expr: 'binary',
          op: '<',
          left: { $expr: 'ident', name: 'k' },
          right: lit(10),
        },
        body: [
          {
            op: 'memoize',
            key: {
              $expr: 'binary',
              op: '+',
              left: lit('key'),
              right: { $expr: 'ident', name: 'k' },
            },
            steps: [
              {
                op: 'return',
                value: {
                  $expr: 'binary',
                  op: '+',
                  left: {
                    $expr: 'methodCall',
                    object: lit('x'),
                    method: 'repeat',
                    arguments: [lit(100_000)],
                  },
                  right: { $expr: 'ident', name: 'k' },
                },
              },
            ],
          },
          {
            op: 'varAssign',
            key: 'k',
            value: {
              $expr: 'binary',
              op: '+',
              left: { $expr: 'ident', name: 'k' },
              right: lit(1),
            },
          },
        ],
      },
      { op: 'return', value: { ok: lit(true) } },
    ],
  }

  it('in a sub-agent (agentRun)', async () => {
    const r = await new AgentVM().run(
      {
        $ajs: 2,
        op: 'seq',
        steps: [
          { op: 'agentRun', agentId: lit(memoLoop), input: lit({}) },
          { op: 'return', value: { ok: lit(true) } },
        ],
      } as any,
      {},
      CAP
    )
    expect(r.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })
})

describe('no false rejection: bytes that are gone stop counting', () => {
  it('pushes through a for-of alias, in a loop whose rows are discarded (M1)', async () => {
    const r = await run(`function f() {
      let k = 0
      let total = 0
      while (k < 1000) {
        let rows = [[], []]
        for (const row of rows) { row.push('x'.repeat(1000)) }
        total = total + rows.length
        k = k + 1
      }
      return { total }
    }`)
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ total: 2000 })
  })

  it('re-binding a large value many times', async () => {
    const r = await run(`function f() {
      let big = 'x'.repeat(120000)
      let k = 0
      // SIZED TO THE HONEST PEAK (it was 200000 chars before in-flight memory counted; the rc.2
      // sixth re-review asked for it back, and this records why not). Per iteration, until the
      // assignment lands, three things are reachable: the old value, the repeat, and the sum —
      // and V8 may flatten the sum's rope later, copying its whole length while the repeat is
      // still held by it. At 200000 characters that is 3 × 400KB = 1.2MB under a 1MB cap: a
      // genuine peak, so refusing it is right. At 120000 it is ~720KB, which must fit.
      while (k < 100) { big = 'y'.repeat(120000) + k; k = k + 1 }
      return { n: big.length }
    }`)
    expect(r.error).toBeUndefined()
  })

  it('one OBJECT held under many names counts once', async () => {
    // Objects are deduplicated by identity. A long STRING aliased under many names still counts
    // once per name: equal strings may or may not share memory, and deduplicating by VALUE would
    // let 2000 distinct equal strings count as one. An over-count, so it fails closed.
    const r = await run(`function f() {
      let a = []
      let i = 0
      while (i < 300) { a.push('x'.repeat(1000) + i); i = i + 1 }
      let b = a
      let c = a
      let d = a
      return { n: d.length }
    }`)
    expect(r.error).toBeUndefined()
  })
})

describe('the measurement sees every live scope, and only live ones', () => {
  it('scopes opened by sub-programs that FAIL are released too', async () => {
    // A caught failure keeps the run going, so a root leaked on the error path would stay
    // counted for the rest of it.
    const sizes: number[] = []
    const count = defineAtom(
      'count',
      s.object({}),
      s.any,
      async (_i: any, ctx: any) => {
        sizes.push(ctx.heapRoots.size)
      },
      { effects: 'pure' }
    )
    const code = { transpile: (src: string) => transpile(src).ast }
    const failing = transpile(
      `function g() { let a = [1].map(x => x); Error('boom'); return { a } }`
    ).ast
    const { ast } = transpile(`function f({ sub }) {
      count({})
      try { let r = runCode({ code: 'function g() { let a = [1].map(x => x); Error("boom"); return { a } }' }) } catch (e) { let t = 1 }
      try { let r = agentRun({ agentId: sub, input: {} }) } catch (e) { let t = 2 }
      try { let m = [1, 2].map(x => { Error('in map'); return x }) } catch (e) { let t = 3 }
      count({})
      return { ok: true }
    }`)
    const r = await new AgentVM({ count }).run(
      ast,
      { sub: failing },
      { capabilities: { code } }
    )
    expect(r.error).toBeUndefined()
    expect(sizes.length).toBe(2)
    expect(sizes[1]).toBe(sizes[0])
  })

  it('every scope a program opens is released by the time it ends', async () => {
    let before = -1
    let after = -1
    const probe = (set: (n: number) => void) =>
      defineAtom(
        set === setBefore ? 'rootsBefore' : 'rootsAfter',
        s.object({}),
        s.any,
        async (_i: any, ctx: any) => {
          set(ctx.heapRoots.size)
        },
        { effects: 'pure' }
      )
    function setBefore(n: number) {
      before = n
    }
    function setAfter(n: number) {
      after = n
    }
    const code = { transpile: (src: string) => transpile(src).ast }
    const { ast } = transpile(`function helper(n: 0) { let q = n * 2; return q }
    function f() {
      rootsBefore({})
      let xs = [1, 2, 3].map(x => x * 2)
      let t = 0
      for (const x of xs) { if (x > 2) { t = t + x } }
      let k = 0
      while (k < 2) { k = k + 1 }
      try { let y = 1 } catch (e) { t = 0 }
      let h = helper(3)
      let r = runCode({ code: 'function g() { let z = [1].map(v => v); return { z } }' })
      let m = memoize({ key: 'k', steps: [] })
      rootsAfter({})
      return { t, h }
    }`)
    const vm = new AgentVM({
      rootsBefore: probe(setBefore),
      rootsAfter: probe(setAfter),
    })
    const r = await vm.run(ast, {}, { capabilities: { code } })
    expect(r.error).toBeUndefined()
    expect(before).toBeGreaterThan(0)
    expect(after).toBe(before)
  })
})

describe('rebinding an already-measured value is O(1) (rc.2 cumulative review M1)', () => {
  const program = (n: number) =>
    transpile(
      `function f() { let o = { items: [] }\n let i = 0\n while (i < ${n}) { o.items.push({ k: i })\n let p = o\n i = i + 1 }\n return { n: o.items.length } }`
    ).ast

  it('an alias per loop iteration scales linearly in fuel', async () => {
    const fuel = async (n: number) =>
      (
        await new AgentVM().run(
          program(n),
          {},
          { fuel: 1e7, timeoutMs: 600_000 }
        )
      ).fuelUsed
    const a = await fuel(1000)
    const b = await fuel(4000)
    // linear: ~4x; the re-walk per alias was ~11x (1628 -> 18515)
    expect(b / a).toBeLessThan(5)
  })

  it('aliases do not let a run hold more than the ceiling', async () => {
    // many DISTINCT 100KB strings, each bound then aliased: the ceiling still binds
    const r = await new AgentVM().run(
      transpile(
        `function f() { let keep = []\n let i = 0\n while (i < 200) { let s = { v: 'x'.repeat(50000) + i }\n let alias = s\n keep.push(alias)\n i = i + 1 }\n return { n: keep.length } }`
      ).ast,
      {},
      { fuel: 1e7, maxHeapBytes: 2_000_000, timeoutMs: 600_000 }
    )
    expect(r.error?.message ?? 'admitted').toMatch(/Heap limit/)
  })
})

describe('a reconcile forgets which values were measured (cumulative review 2)', () => {
  it('a value taken out of every root, then rebound after a reconcile, is counted again', async () => {
    // `arr.pop()` leaves V with no root while it is in flight; the second `repeat` in the same
    // array literal forces a reconcile, which drops V from the estimate; then `w` binds V. Without
    // the reset in `reconcileHeap`, the value fast path charged one pointer, and m1 + m2 fit under
    // the cap on top of a 400KB value the estimate no longer held: the run returned normally while
    // holding ~1.2MB under a 1MB ceiling.
    const r = await new AgentVM().run(
      transpile(
        `function f() { let arr = []\n let v = { s: 'x'.repeat(200000) }\n arr.push(v)\n v = null\n let w = [arr.pop(), 'y'.repeat(200000)][0]\n let m1 = 'z'.repeat(200000)\n let m2 = 'q'.repeat(200000)\n return { a: 1, b: 1 } }`
      ).ast,
      {},
      { fuel: 1e7, maxHeapBytes: 1_000_000 }
    )
    expect(r.error?.message ?? 'escaped the ceiling').toMatch(/Heap limit/)
  })
})
