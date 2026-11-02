/**
 * Each of the language's named escapes works when it is the ONLY runtime thing a file uses,
 * in native TJS and in the JavaScript dialect (where converted files run). `needsRuntime` in
 * the emitter is a hand-kept list; it listed `LegacyDate` and not the equality or default
 * escapes, so a converted file whose only `==` became `DangerousLegacyEquals(a, b)` threw
 * `DangerousLegacyEquals is not defined`. Found by graduate-preserves.test.ts.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const run = (body: string, dialect: 'tjs' | 'js') => {
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return new Function(
      `${
        tjs(`function f(a, b) { return ${body} }`, { runTests: false, dialect })
          .code
      }\nreturn f`
    )()
  } finally {
    g.__tjs = prev
  }
}

const ESCAPES: [string, unknown[], unknown][] = [
  ['DangerousLegacyEquals(a, b)', ['5', 5], true],
  ['DangerousLegacyNot(a, b)', ['5', 5], false],
  ['LegacyExactly(a, b)', [1, 1], true],
  ['LegacyNotExactly(a, b)', [1, 2], true],
  ['LegacyTypeOf(a)', [null], 'object'],
  ['LegacyDate(a).getTime()', [0], 0],
  ['Is(a, b)', [[1], [1]], true],
  ['IsNot(a, b)', [[1], [2]], true],
]

describe('every named escape works alone', () => {
  for (const dialect of ['tjs', 'js'] as const)
    for (const [body, args, want] of ESCAPES)
      it(`${body} (dialect ${dialect})`, () => {
        expect(run(body, dialect)(...args)).toEqual(want)
      })
})
