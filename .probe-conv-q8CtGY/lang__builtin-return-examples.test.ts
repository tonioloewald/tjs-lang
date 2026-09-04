function FunctionPredicate(n, s, b) {
  if (Array.isArray(s) && b) {
    const f = (...a) => FunctionPredicate(n, b(...a))
    f.typeParamNames = s.map((p) => (Array.isArray(p) ? p[0] : p))
    f.description = n
    f.__runtimeType = true
    return f
  }
  const spec = typeof s === 'function' ? {} : s || {}
  return {
    description: n,
    params: spec.params || {},
    returns: spec.returns,
    returnContract: spec.returnContract || 'assertReturns',
    check: (v) => typeof v === 'function',
    __runtimeType: true,
  }
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { FunctionPredicate }
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync } from 'node:fs'

import { join } from 'node:path'

import { fromTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 39 */
function builtinTypeNames() {
  const src = readFileSync(
    join('/Users/tonioloewald/tjs-lang/src/lang', 'emitters', 'from-ts.ts'),
    'utf8'
  )
  const table = src.slice(
    src.indexOf('// Binary / WASM'),
    src.indexOf("Promise: 'Promise.resolve(null)'")
  )
  return [...new Set([...table.matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]))]
}
builtinTypeNames.__tjs = {
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
  source: 'input.ts:39',
}
export {}

const SITES = [
  [
    'function declaration',
    (t) => `export function make(): ${t} { return null as any }`,
  ],
  [
    'class method',
    (t) => `export class A { make(): ${t} { return null as any } }`,
  ],
  [
    'overload signature',
    (t) =>
      `export declare function make(): ${t};\nexport declare function make(n: number): ${t};`,
  ],
]

describe('builtin return examples always produce parseable TJS', () => {
  const names = builtinTypeNames()
  it('the table was actually read', () => {
    expect(names.length).toBeGreaterThan(20)
    expect(names).toContain('Response')
    expect(names).toContain('AbortSignal')
  })
  for (const [siteName, build] of SITES) {
    it(`every builtin parses as a ${siteName} return type`, () => {
      const broken = []
      for (const type of names) {
        const src = build(type)
        try {
          const converted = fromTS(src, { emitTJS: true })
          tjs(converted.code, { filename: 'b.ts', runTests: false })
        } catch (e) {
          const line =
            fromTS(src, { emitTJS: true })
              .code.split('\n')
              .find((l) => l.includes('make')) ?? ''
          broken.push(`${type}: ${line.trim()}  (${e.message.split('\n')[0]})`)
        }
      }
      expect(broken).toEqual([])
    })
  }
  it('a return example that IS a valid annotation is still emitted', () => {
    const fn = fromTS('export function f(): number[] { return [1] }', {
      emitTJS: true,
    })
    expect(fn.code).toContain(':! [number]')

    const cb = fromTS(
      'export function f(): (n: number) => number { return (n) => n }',
      { emitTJS: true }
    )
    expect(cb.code).toContain(':! FunctionPredicate(')
    expect(() =>
      tjs(cb.code, { filename: 'b.ts', runTests: false })
    ).not.toThrow()
  })
})
