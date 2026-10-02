/**
 * docs/reviews/0.14.0-rc.2-rereview-4.md — the root model, pinned through `transpile()`.
 *
 * The heap ceiling resets its estimate to a measurement of the registered roots, so it is
 * sound only if every holder of guest values is a root (B1) and the measurement counts every
 * slot (B2); it rejects fairly only if the measurement excludes what a bind replaces (M1).
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'

const CAP = { maxHeapBytes: 1_000_000, fuel: 5_000_000 }
const run = (src: string) => new AgentVM().run(transpile(src).ast, {}, CAP)
const TRIPPED = /Heap limit exceeded/

describe('B1: an atom holding guest values while guest steps run holds them as a root', () => {
  const nums = `let items = []; let i = 0; while (i < 2000) { items.push(i); i = i + 1 }`

  it('map, result discarded', async () => {
    const r = await run(`function f() {
      ${nums}
      items.map(x => 'x'.repeat(100000) + x)
      return { n: 1 }
    }`)
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })

  it('map, block-bodied callback, result bound — trips INSIDE the map', async () => {
    const r = await run(`function f() {
      ${nums}
      let out = items.map(x => { let s = 'x'.repeat(100000) + x; return s })
      return { n: out.length }
    }`)
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
    // measured near the cap, not after holding the whole ~400MB result
    expect(r.error?.message ?? '').toMatch(/holds ~1MB/)
  })

  it('reduce, a growing accumulator', async () => {
    const r = await run(`function f() {
      ${nums}
      let acc = items.reduce((a, x) => a.concat(['y'.repeat(1000) + x]), [])
      return { n: acc.length }
    }`)
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })

  it('every atom that runs guest steps has been reviewed for held values', () => {
    // A RATCHET: a new atom that runs nested steps must be added here after deciding what it
    // holds in JS locals while they run. Each entry says what it holds and how it is rooted.
    const REVIEWED: Record<string, string> = {
      seq: 'holds nothing between steps',
      scope: 'holds nothing; its scope is a registered state',
      callLocal:
        'arguments are bound into the helper scope before its steps run',
      map: '`results`, via holdRoot',
      // Defence in depth: each iteration WRITES the accumulator into its (registered) scope
      // before anything is charged, so dropping the box is an equivalent mutant today.
      reduce: 'the accumulator, via holdRoot (boxed)',
      agentRun: 'its state, memo and args, via newScopeState/ownRoots',
      runCode: 'its state, memo and args, via newScopeState/ownRoots',
      memoize: 'nothing until the body returns; the stored result is charged',
      cache: 'nothing until the body returns',
    }
    const src = readFileSync(join(import.meta.dir, 'runtime.ts'), 'utf8')
    const found: string[] = []
    const re = /export const \w+ = defineAtom\(\s*'(\w+)'/g
    const starts = [...src.matchAll(re)]
    starts.forEach((m, i) => {
      const body = src.slice(m.index!, starts[i + 1]?.index ?? src.length)
      if (/seq\.exec\(|seqAtom\.exec\(/.test(body)) found.push(m[1])
    })
    expect(found.length).toBeGreaterThan(5) // apparatus
    expect(found.filter((op) => !(op in REVIEWED))).toEqual([])
    expect(Object.keys(REVIEWED).filter((op) => !found.includes(op))).toEqual(
      []
    )
  })
})

describe('B2: every slot costs a pointer, whatever it holds', () => {
  it('holey arrays', async () => {
    const r = await run(`function f() {
      let keep = []
      let k = 0
      while (k < 10) { keep.push(Array.from({ length: 400000 })); k = k + 1 }
      return { n: keep.length }
    }`)
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })

  it('an array of repeat references to one object', async () => {
    const r = await run(`function f() {
      let o = { a: 1 }
      let keep = []
      let k = 0
      while (k < 10) { keep.push(Array.from({ length: 400000 }).fill(o)); k = k + 1 }
      return { n: keep.length }
    }`)
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })
})

describe('M1: the value a bind replaces is not live', () => {
  it('an immutable-update string loop under the cap', async () => {
    // SIZED TO THE HONEST PEAK (it was 290000 chars before in-flight memory counted; the rc.2
    // sixth re-review asked for it back, and this records why not). Until the assignment lands
    // the old string, the slice, and the sum are all reachable; even with V8's best case — the
    // slice a view, the sum a rope — flattening the sum copies its length while the old string
    // is live: 2 × 580KB ≈ 1.16MB under a 1MB cap at 290000. At 140000: ~840KB, which must fit.
    const r = await run(`function f() {
      let s = 'x'.repeat(140000)
      let i = 0
      while (i < 50) { s = s.slice(1) + 'a'; i = i + 1 }
      return { n: s.length }
    }`)
    expect(r.error).toBeUndefined()
  })

  it('an immutable-update array loop under the cap', async () => {
    const r = await run(`function f() {
      let a = []
      let i = 0
      while (i < 300) { a = a.concat(['x'.repeat(800) + i]); i = i + 1 }
      return { n: a.length }
    }`)
    expect(r.error).toBeUndefined()
  })
})

describe('M2: `var` is function-scoped, in every block', () => {
  const table: Array<[string, unknown]> = [
    [`function f() { if (true) { var q = 5 } return { q } }`, { q: 5 }],
    [
      `function f() { var v = 1; if (true) { var v = 2 } return { v } }`,
      { v: 2 },
    ],
    [`function f() { try { var z = 1 } catch (e) {} return { z } }`, { z: 1 }],
    [
      `function f() { var i = 0; while (i < 3) { var t = i; i = i + 1 } return { i, t } }`,
      { i: 3, t: 2 },
    ],
    [`function f({ x }) { var x = x + 1; return { x } }`, { x: 6 }],
  ]
  for (const [src, want] of table)
    it(src, async () => {
      const r = await new AgentVM().run(transpile(src).ast, { x: 5 })
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual(want)
    })
})

describe('rc.2 fifth re-review (docs/reviews/0.14.0-rc.2-rereview-5.md)', () => {
  describe('M1: a callback is a function boundary for `var`', () => {
    const table: Array<[string, unknown]> = [
      [
        `function f() { let y = 10; let r = [1].map(x => { var y = x; return y }); return { y, r } }`,
        { y: 10, r: [1] },
      ],
      [
        `function f() { const y = 10; let r = [1].map(x => { var y = x; return y }); return { y, r } }`,
        { y: 10, r: [1] },
      ],
      [
        `function f() { var y = 10; let r = [1, 2].reduce((a, x) => { var y = a + x; return y }, 0); return { y, r } }`,
        { y: 10, r: 3 },
      ],
      [
        `function f() { let r = [1, 2].map(x => { if (x > 1) { var k = x } return k }); return { r } }`,
        { r: [null, 2] },
      ],
    ]
    for (const [src, want] of table)
      it(src, async () => {
        const r = await new AgentVM().run(transpile(src).ast, {})
        expect(r.error).toBeUndefined()
        expect(r.result).toEqual(want)
      })

    it('a for...of head that would assign an OUTER binding is refused, not mistranslated', () => {
      expect(() =>
        transpile(`function f() { for (var x of [1, 2]) {} return { x } }`)
      ).toThrow(/needs `const` or `let`/)
      expect(() =>
        transpile(
          `function f() { let x = 0; for (x of [1, 2]) {} return { x } }`
        )
      ).toThrow(/needs `const` or `let`/)
    })
  })

  it('M2: a helper parameter bind over the heap cap fails the run', async () => {
    const r = await new AgentVM().run(
      transpile(`function h(a: []) { return a.length }
      function f() {
        let t = h(Array.from({ length: 200000 }))
        let after = 'ran on'
        return { t, after }
      }`).ast,
      {},
      CAP
    )
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })
})
