/**
 * Every documented matcher works, in every runner that runs inline tests.
 *
 * There were two `expect` harnesses — `tests.ts` `expectFunction` and a near-copy inlined
 * in `emitters/js-tests.ts` — and they drifted in OPPOSITE directions: the first had
 * `toThrow` and no `toBeNaN`, the second `toBeNaN` and no `toThrow`. So which matchers a
 * user got depended on which entry point ran their test, and nothing in the source
 * distinguishes them: `tjs test file.tjs` failed with
 * `expect(...).toThrow is not a function` on a test that passed in the playground, and the
 * exact mirror image for `toBeNaN`. `docs.ts` `prettifyTestBody` renders BOTH, so both
 * halves of the divergence were documented as working.
 *
 * It stayed hidden because `tjs test <file>` only started running inline tests this release
 * (`9619d02`) — before that it printed "No .test.tjs files found" and exited 0, so half the
 * divergence had no reachable code path.
 *
 * `js-tests.ts` now injects `expectFunction` rather than copying it, which makes the two
 * runners the same harness by construction. That is the real fix; this file is what stops
 * the copy coming back, and it closes the other gap too — a matcher can no longer be
 * documented without being implemented, or implemented without being documented.
 *
 * The list is derived from `docs.ts`, not written out here. A hand-maintained third list
 * would be a third thing to drift.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expectFunction, testUtils } from './tests'
import { tjs } from './index'

/**
 * The matchers `prettifyTestBody`'s docblock promises, read out of the source.
 *
 * That docblock is the user-facing contract — it is what `bun run docs` renders — so it is
 * the right authority for "what should exist".
 */
function documentedMatchers(): string[] {
  const src = readFileSync(join(import.meta.dir, 'docs.ts'), 'utf8')
  // Anchored at the first example line, NOT at the paragraph above it — that paragraph
  // reads `expect(actual).matcher(expected)`, and a scan starting there harvests
  // "matcher" as if it were one.
  const block = src.slice(
    src.indexOf('expect(x).toBe('),
    src.indexOf('export function prettifyTestBody')
  )
  return [
    ...new Set([...block.matchAll(/expect\(\w+\)\.(\w+)\(/g)].map((m) => m[1])),
  ]
}

/** Evaluate the harness string and hand back its `expect`. */
const harnessExpect = (source: string) =>
  new Function(`${source}\nreturn expect`)() as (
    a: unknown
  ) => Record<string, (...args: unknown[]) => void>

describe('the documented matcher list is real', () => {
  const matchers = documentedMatchers()

  it('was actually extracted', () => {
    // A regex that matched nothing would make every assertion below vacuous.
    expect(matchers.length).toBeGreaterThanOrEqual(11)
    expect(matchers).toContain('toThrow')
    expect(matchers).toContain('toBeNaN')
  })

  for (const name of matchers) {
    it(`\`${name}\` is implemented in the shared harness`, () => {
      expect(typeof harnessExpect(expectFunction)(1)[name]).toBe('function')
    })
  }

  it('nothing is implemented but undocumented', () => {
    // The other direction. A matcher that works but is not in the docblock will not be
    // rendered by `prettifyTestBody`, so a passing test documents itself as something
    // else — and the next person to add one has no reason to look at docs.ts.
    const implemented = Object.keys(harnessExpect(expectFunction)(1))
    expect(implemented.filter((m) => !matchers.includes(m))).toEqual([])
  })

  it('`testUtils` carries `assert` alongside them', () => {
    const utils = new Function(`${testUtils}\nreturn { assert, expect }`)() as {
      assert: (c: unknown, m?: string) => void
    }
    expect(() => utils.assert(true)).not.toThrow()
    expect(() => utils.assert(false, 'boom')).toThrow('boom')
  })
})

describe('the transpile-time runner has the same matchers', () => {
  // Driven through the PUBLIC path — a `test '…' { }` block transpiled and run — because
  // that is the arrangement that was broken. Asserting on the harness string alone would
  // not have caught it: both strings existed and both were fine in isolation.
  const matchers = documentedMatchers()

  /** One inline test per matcher, each written so it PASSES when the matcher exists. */
  const USES: Record<string, string> = {
    toBe: 'expect(1).toBe(1)',
    toEqual: 'expect({ a: 1 }).toEqual({ a: 1 })',
    toBeTruthy: 'expect(1).toBeTruthy()',
    toBeFalsy: 'expect(0).toBeFalsy()',
    toBeNull: 'expect(null).toBeNull()',
    toBeUndefined: 'expect(undefined).toBeUndefined()',
    toContain: 'expect([1, 2]).toContain(2)',
    toThrow: "expect(() => { throw new Error('x') }).toThrow()",
    toBeGreaterThan: 'expect(2).toBeGreaterThan(1)',
    toBeLessThan: 'expect(1).toBeLessThan(2)',
    toBeNaN: 'expect(NaN).toBeNaN()',
  }

  it('every documented matcher has a case here', () => {
    // Otherwise adding a matcher to docs.ts silently adds no coverage.
    expect(matchers.filter((m) => !(m in USES))).toEqual([])
  })

  for (const name of matchers) {
    it(`\`${name}\` runs in an inline test block`, () => {
      const r = tjs(`test 'uses ${name}' {\n  ${USES[name]}\n}`, {
        filename: 'h.tjs',
      })
      expect(r.testResults?.length ?? 0).toBe(1)
      // The error is surfaced rather than swallowed: `toThrow is not a function` is a
      // failure whose message names the missing matcher, and that message is the whole
      // point of this test.
      expect(r.testResults?.[0]?.error ?? 'passed').toBe('passed')
      expect(r.testResults?.[0]?.passed).toBe(true)
    })
  }
})
