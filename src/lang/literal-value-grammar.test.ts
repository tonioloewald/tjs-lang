/**
 * `parseLiteralValue` accepts exactly a literal, and never a prototype key (#2263, #2264).
 *
 * It rebuilds TJS example values from untrusted text (examples, defaults) without evaluating.
 * Two gaps: it never checked that the literal was the WHOLE input, so `0; globalThis.__X__ = 1`
 * was accepted as `0`; and it rebuilt objects with plain assignment, so
 * `{ __proto__: { polluted: 1 } }` chose the rebuilt object's prototype (Object.keys empty,
 * `polluted` readable through `in`). It now consults `src/forbidden-keys.ts`, the canonical list.
 */
import { describe, it, expect } from 'bun:test'
import { parseLiteralValue } from './literal-value'

describe('parseLiteralValue grammar', () => {
  for (const text of ['0; globalThis.__X__ = 1', '0 /* c */ ; x', "'a' + 'b'"])
    it(`refuses ${text}`, () => {
      expect(parseLiteralValue(text).ok).toBe(false)
    })
  for (const text of [
    '{ __proto__: { polluted: 1 } }',
    '{ "__proto__": { p: 1 } }',
    '{ constructor: 1 }',
    '{ a: { prototype: 1 } }',
  ])
    it(`refuses the prototype key in ${text}`, () => {
      const r = parseLiteralValue(text) as any
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/is not allowed as a key/)
    })
  it('a literal with whitespace or a trailing comment is accepted (the other direction)', () => {
    for (const [text, value] of [
      ['  [1, 2]  ', [1, 2]],
      ['0 // a comment', 0],
      ["{ a: 1, b: ['x'] } /* c */", { a: 1, b: ['x'] }],
    ] as const) {
      const r = parseLiteralValue(text) as any
      expect(r.ok).toBe(true)
      expect(r.value).toEqual(value)
    }
  })
})
