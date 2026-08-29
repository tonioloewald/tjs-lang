/**
 * Every builtin type the converter knows produces TJS that PARSES.
 *
 * `fromTS` carries a table of example values for builtin types (`Response` →
 * `new Response()`, `AbortSignal` → `AbortSignal.abort()`, …). Three separate sites turn
 * one of those into a return annotation, and only ONE of them filtered anything — with
 * `startsWith('new ')`, a test that names a spelling rather than the property it means.
 *
 * So two table entries slipped past it (`AbortSignal.abort()`, `Promise.resolve(null)` —
 * neither starts with `new`), and the other two sites, class members and overload
 * signatures, had no filter at all. The result was converter output that does not parse:
 *
 *     make():! new Response() {              // `new` is abolished in TJS
 *     make():! new URL('https://example.com') {
 *     make():! AbortSignal.abort() {         // a member call is not an annotation form
 *
 * Any class method returning a constructible Web API type. It surfaced only because a new
 * test file happened to declare `function sharedSignal(): AbortSignal`, and the dogfood
 * ratchet that would have caught it is gated behind `SKIP_BENCHMARKS`, which `test:fast`
 * and CI both set.
 *
 * A hand-written list of the broken ones would go stale the moment somebody adds a table
 * entry, so this drives EVERY name in the table through the converter, in all three
 * emission sites, and demands the output parse. Adding `Foo: 'Foo.of()'` to the table now
 * fails here instead of shipping.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fromTS } from './emitters/from-ts'
import { tjs } from './index'

/**
 * The builtin type names, read out of the source.
 *
 * Derived rather than restated: a second copy is a second thing to forget to update, which
 * is the shape of the bug this file exists for.
 */
function builtinTypeNames(): string[] {
  const src = readFileSync(
    join(import.meta.dir, 'emitters', 'from-ts.ts'),
    'utf8'
  )
  const table = src.slice(
    src.indexOf('// Binary / WASM'),
    src.indexOf("Promise: 'Promise.resolve(null)'")
  )
  return [...new Set([...table.matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]))]
}

/** The three places a return annotation is emitted, as source that exercises each. */
const SITES: Array<[string, (type: string) => string]> = [
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
    // A regex that matched nothing would make every case below vacuous.
    expect(names.length).toBeGreaterThan(20)
    expect(names).toContain('Response')
    expect(names).toContain('AbortSignal')
  })

  for (const [siteName, build] of SITES) {
    it(`every builtin parses as a ${siteName} return type`, () => {
      const broken: string[] = []
      for (const type of names) {
        const src = build(type)
        try {
          const converted = fromTS(src, { emitTJS: true })
          tjs(converted.code, { filename: 'b.ts', runTests: false })
        } catch (e: any) {
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
    // The other direction. Dropping every return annotation would pass everything above
    // and silently throw away the type information the converter exists to preserve.
    const fn = fromTS('export function f(): number[] { return [1] }', {
      emitTJS: true,
    })
    expect(fn.code).toContain(':! [number]')

    // `FunctionPredicate(…)` is a CALL and it parses, which is why the filter cannot
    // simply reject anything containing parentheses.
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
