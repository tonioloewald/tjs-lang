/**
 * A type error names the contract and the place (#3407).
 *
 * Three messages named the mechanism or contradicted themselves: a member of a named Type
 * said "Expected declared"; a list of shapes said "Expected array of object …, got array of
 * object", naming neither the element nor the member; and a dictionary-default member said
 * "Expected array … got array of number".
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const load = (src: string, name: string) => {
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return new Function(
      `${tjs(src, { runTests: false }).code}\nreturn ${name}`
    )()
  } finally {
    g.__tjs = prev
  }
}
const BOOK = "Type Book { example: { t: '' } }\n"

describe('error labels', () => {
  it("a member of a named Type names the Type, not 'declared'", () => {
    const f = load(`${BOOK}function f(s: { top: Book }) { return 1 }`, 'f')
    expect(f({ top: 5 }).message).toMatch(/^Expected Book for '.*f\.s\.top'/)
  })

  it('a list of shapes names the element and the member', () => {
    const f = load(`function f(xs: [{ t: '' }]) { return 1 }`, 'f')
    const list = [{ t: 'a' }, { t: 5 }]
    const err = f(list)
    expect(err.message).toMatch(
      /^Expected string for '.*f\.xs\[1\]\.t', got number/
    )
    expect(err.received).toBe(list)
  })

  it('a list of a named Type names the element', () => {
    const f = load(`${BOOK}function f(xs: [Book]) { return 1 }`, 'f')
    expect(f([{ t: 'a' }, 5]).message).toMatch(
      /^Expected Book for '.*f\.xs\[1\]'/
    )
  })

  it('a list of primitives names the element', () => {
    const f = load(`function f(xs: [0]) { return 1 }`, 'f')
    expect(f([1, 2, 'three']).message).toMatch(
      /^Expected integer for '.*f\.xs\[2\]'/
    )
  })

  it('a dictionary-default member names its element type', () => {
    const f = load(`function f(o = { xs: [''] }) { return 1 }`, 'f')
    expect(f({ xs: [1] }).message).toMatch(
      /^Expected array of string for '.*f\.o\.xs'/
    )
  })

  it('a monadic error inside a list still passes through', () => {
    const f = load(`function f(xs: [{ t: '' }]) { return 1 }`, 'f')
    const dbl = load(`function dbl(n: 0) { return n * 2 }`, 'dbl')
    const first = dbl('ten')
    expect(f([{ t: 'a' }, first])).toBe(first)
  })
})
