/**
 * Regression guards for #21: exponential blowup in deep-equal/format on
 * shared-reference object graphs (same defect class as oven-sh/bun#34178,
 * which killed machines via OOM).
 *
 * A DAG built as `{a: n, b: n}` per level has O(depth) distinct nodes but a
 * 2^depth unfolded tree. Pre-fix:
 *   - `format()`/`JSON.stringify` re-expanded shared refs: 21MB at depth 20,
 *     704MB at 25, OOM at 28 (under bun/JSC, which has no string-length cap).
 *   - `deepEqual`/`Is` walked all 2^depth paths: ~61s at depth 30.
 *   - distinct-but-CYCLIC graphs recursed infinitely (stack overflow).
 *
 * Five injected/exported copies share the invariant (deliberate copies for
 * bundle-isolation): tests.ts expectFunction, js-tests.ts __deepEqual and
 * __format (formatValue), runtime.ts Is, and the emitted inline Is in js.ts.
 * This file exercises each through its public path.
 *
 * CALIBRATION MATTERS — a regression must fail CLEANLY, never kill the
 * machine that runs the suite:
 *   - time cases run at depth 30 under a 10s bun-test timeout (fixed: ms;
 *     regressed: ~60s -> clean timeout failure)
 *   - the memory case runs at depth 22 and asserts the failure MESSAGE is
 *     under the format cap (fixed: tiny; regressed: an ~88MB string -> loud
 *     length-assertion failure, survivable). Never use the OOM depths here.
 */
import { describe, it, expect } from 'bun:test'
import { expectFunction } from './tests'
import { Is } from './runtime'
import { tjs } from './index'

/** O(depth) nodes, 2^depth unfolded paths. The exact shape from bun#34178. */
function dag(depth: number, leaf: unknown = 1): any {
  let n: any = { leaf }
  for (let i = 0; i < depth; i++) n = { a: n, b: n }
  return n
}

// format caps output at 16KB; headroom for the "Expected … but got …" wrapper.
const MESSAGE_CAP = 40_000

describe('dag safety (#21)', () => {
  describe('expectFunction (tests.ts) — the injected test-block expect', () => {
    const makeExpect = () =>
      new Function(expectFunction + '\nreturn expect')() as (a: any) => any

    it('passing toEqual on two deep DAGs returns promptly', () => {
      const ex = makeExpect()
      ex(dag(30)).toEqual(dag(30)) // regressed: ~61s -> timeout below
    }, 10_000)

    it('failing toEqual on a deep DAG produces a bounded message', () => {
      const ex = makeExpect()
      let message = ''
      try {
        ex(dag(22)).toEqual(1) // regressed: format() allocates ~88MB
      } catch (e: any) {
        message = e.message
      }
      expect(message.length).toBeGreaterThan(0)
      expect(message.length).toBeLessThan(MESSAGE_CAP)
    }, 10_000)

    it('failing toEqual on a TRUE CYCLE still formats (JSON.stringify throws on cycles)', () => {
      const ex = makeExpect()
      const cyc: any = { v: 1 }
      cyc.self = cyc
      let message = ''
      try {
        ex(cyc).toEqual(1)
      } catch (e: any) {
        message = e.message
      }
      // Pre-fix, format() died inside JSON.stringify (TypeError: cyclic) and
      // the useful assertion message was lost.
      expect(message).toContain('Expected')
      expect(message.length).toBeLessThan(MESSAGE_CAP)
    })

    it('deepEqual still distinguishes structurally UNEQUAL DAGs', () => {
      const ex = makeExpect()
      // Same shape, different leaf — memoization must not blur real differences.
      expect(() => ex(dag(12, 1)).toEqual(dag(12, 2))).toThrow(/Expected/)
    })
  })

  describe('runtime Is() — user-facing structural equality', () => {
    it('compares two deep DAGs promptly', () => {
      expect(Is(dag(30), dag(30))).toBe(true) // regressed: ~61s -> timeout
    }, 10_000)

    it('distinguishes structurally unequal DAGs', () => {
      expect(Is(dag(12, 1), dag(12, 2))).toBe(false)
    })

    it('terminates on distinct-but-cyclic graphs (was: stack overflow)', () => {
      const a: any = { v: 1 }
      a.self = a
      const b: any = { v: 1 }
      b.self = b
      expect(Is(a, b)).toBe(true)
    })
  })

  describe('emitted inline Is — standalone code, no shared runtime', () => {
    it('compares two deep DAGs promptly', () => {
      const { code } = tjs(`function same(a, b) { return Is(a, b) }`)
      const saved = (globalThis as any).__tjs
      delete (globalThis as any).__tjs // force the inline stub
      try {
        const same = new Function(code + '\nreturn same')()
        expect(same(dag(30), dag(30))).toBe(true) // regressed: timeout
        expect(same(dag(12, 1), dag(12, 2))).toBe(false)
      } finally {
        ;(globalThis as any).__tjs = saved
      }
    }, 10_000)
  })

  describe('transpile-time harness (__deepEqual/__format in js-tests.ts)', () => {
    // A test block whose assertion compares DAGs exercises the harness's
    // injected __deepEqual; a failing one exercises __format (formatValue).
    const DAG_SOURCE = (depth: number, fail: boolean) => `
function mkdag(depth: 5) {
  let n = { leaf: 1 }
  let i = 0
  while (i < depth) {
    n = { a: n, b: n }
    i = i + 1
  }
  return n
}

test 'dag comparison' {
  expect(mkdag(${depth})).toEqual(${fail ? '1' : `mkdag(${depth})`})
}
`

    it('a passing DAG comparison in a test block completes promptly', () => {
      const result = tjs(DAG_SOURCE(30, false), { runTests: 'report' })
      const t = (result.testResults || []).find(
        (r: any) => r.description === 'dag comparison'
      )
      expect(t?.passed).toBe(true) // regressed: ~61s -> timeout below
    }, 10_000)

    it('a failing DAG comparison reports a bounded error message', () => {
      const result = tjs(DAG_SOURCE(22, true), { runTests: 'report' })
      const t = (result.testResults || []).find(
        (r: any) => r.description === 'dag comparison'
      )
      expect(t?.passed).toBe(false)
      expect((t?.error || '').length).toBeGreaterThan(0)
      expect((t?.error || '').length).toBeLessThan(MESSAGE_CAP)
    }, 10_000)
  })
})
