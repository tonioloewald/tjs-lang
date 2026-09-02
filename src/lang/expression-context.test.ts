/**
 * The colon-disambiguation primitive (`docs/parser-primitives.md`, primitive #2).
 *
 * Tested directly rather than only through the transforms, because the whole point of the
 * layer is that the question has ONE answer that can be examined on its own. A primitive only
 * reachable through its caller is not a primitive, it is a private helper with extra steps.
 *
 * Both directions matter and fail differently. A ternary read as an annotation DELETES a
 * branch of the program (the bug); an annotation read as a ternary leaves TJS syntax in the
 * emitted JavaScript. The second is louder, which is exactly why it needs pinning too — a
 * guard that errs safe in one direction tends to be tuned until it errs safe in neither.
 */
import { describe, it, expect } from 'bun:test'
import { isTernaryColon } from './expression-context'

/** Index of the colon marked by `^` on the line below the source. */
const at = (src: string, marker: string) =>
  src.indexOf(marker) + marker.indexOf(':')

describe('isTernaryColon', () => {
  const ternaries: Array<[string, string, string]> = [
    [
      'parenthesized consequent — the shape that broke RpcServer.ts',
      'const o = { write: flag ? ((r) => f(r)) : (r) => g(r) }',
      ') : (',
    ],
    ['plain ternary', 'const x = a ? b : c', ' : '],
    ['arrow consequent', 'const x = a ? (r) => 1 : (r) => 2', ' : ('],
    ['inside a call argument', 'f(a ? b : c)', ' : '],
    ['after a property colon', 'const o = { k: a ? b : c }', ' : c'],
  ]
  for (const [label, src, marker] of ternaries) {
    it(`says YES: ${label}`, () => {
      expect(isTernaryColon(src, at(src, marker))).toBe(true)
    })
  }

  const notTernaries: Array<[string, string, string]> = [
    ['an arrow return type', 'const f = (a) : 0 => a', ') : 0'],
    ['an object property', 'const o = { a: 1 }', 'a: 1'],
    ['a property before a ternary', 'const o = { k: a ? b : c }', 'k: a'],
    [
      'a return type after optional chaining',
      'const f = (a) : 0 => a?.b',
      ') : 0',
    ],
    ['a return type after nullish', 'const f = (a) : 0 => a ?? 1', ') : 0'],
  ]
  for (const [label, src, marker] of notTernaries) {
    it(`says NO: ${label}`, () => {
      expect(isTernaryColon(src, at(src, marker))).toBe(false)
    })
  }

  it('matches inner ternaries rather than counting totals', () => {
    // `a ? b : c ? d : e` — the SECOND colon belongs to the second ternary. A version that
    // counted `?` and `:` and compared totals gets this right by luck and gets
    // `{ write: flag ? x : y }` wrong, because the property colon lands in the total.
    const src = 'const x = a ? b : c ? d : e'
    // +1 — `indexOf(' : ')` finds the SPACE. The first version of this test asserted on a
    // space and got `false`, which is correct behaviour for the question it actually asked.
    expect(isTernaryColon(src, src.indexOf(' : c') + 1)).toBe(true)
    expect(isTernaryColon(src, src.lastIndexOf(' : ') + 1)).toBe(true)
  })

  it('a colon inside a literal is not a colon', () => {
    // The lexical layer underneath must still be doing its job.
    const src = "const f = (a) => 'x ? y : z'"
    expect(isTernaryColon(src, src.indexOf(' : z'))).toBe(false)
  })

  it('is not confused by a safety marker', () => {
    // `(? a: 0)` — the TJS parameter safety marker is a `?` that never takes an alternative.
    const src = 'function f(? a: 0) { return a }'
    expect(isTernaryColon(src, src.indexOf('a: 0') + 1)).toBe(false)
  })
})
