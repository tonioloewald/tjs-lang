/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync } from 'node:fs'

import { join } from 'node:path'

import {
  expectFunction,
  testUtils,
} from '/Users/tonioloewald/tjs-lang/src/lang/tests'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 37 */
function documentedMatchers() {
  const src = readFileSync(
    join('/Users/tonioloewald/tjs-lang/src/lang', 'docs.ts'),
    'utf8'
  )

  const block = src.slice(
    src.indexOf('expect(x).toBe('),
    src.indexOf('export function prettifyTestBody')
  )
  return [
    ...new Set([...block.matchAll(/expect\(\w+\)\.(\w+)\(/g)].map((m) => m[1])),
  ]
}
documentedMatchers.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'array',
      items: {
        kind: 'string',
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:37',
}
export {}

/* line 52 */
function harnessExpect(source) {
  return new Function(`${source}\nreturn expect`)()
}
harnessExpect.__tjs = {
  params: {
    source: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:52',
}

describe('the documented matcher list is real', () => {
  const matchers = documentedMatchers()
  it('was actually extracted', () => {
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
    const implemented = Object.keys(harnessExpect(expectFunction)(1))
    expect(implemented.filter((m) => !matchers.includes(m))).toEqual([])
  })
  it('`testUtils` carries `assert` alongside them', () => {
    const utils = new Function(`${testUtils}\nreturn { assert, expect }`)()
    expect(() => utils.assert(true)).not.toThrow()
    expect(() => utils.assert(false, 'boom')).toThrow('boom')
  })
})

describe('the transpile-time runner has the same matchers', () => {
  const matchers = documentedMatchers()
  /** One inline test per matcher, each written so it PASSES when the matcher exists. */
  const USES = {
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
    expect(matchers.filter((m) => !(m in USES))).toEqual([])
  })
  for (const name of matchers) {
    it(`\`${name}\` runs in an inline test block`, () => {
      const r = tjs(``, {
        filename: 'h.tjs',
      })
      expect(r.testResults?.length ?? 0).toBe(1)

      expect(r.testResults?.[0]?.error ?? 'passed').toBe('passed')
      expect(r.testResults?.[0]?.passed).toBe(true)
    })
  }
})
