/**
 * A checked return (`:?`) is checked like a parameter (#3408).
 *
 * Two gaps: named Types were resolved only for PARAMETERS, so `:? Book`, `:? [Book]` and
 * `:? { top: Book }` checked nothing; and the return check tested only the outer kind, so
 * even `:? { top: 0 }` returned `{ top: 'x' }` unrefused.
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
const refused = (v: any) => v instanceof Error

describe('a checked return resolves named Types', () => {
  it(':? Book', () => {
    const f = load(
      `${BOOK}function f(x: 0):? Book { return x ? { t: 'a' } : 5 }`,
      'f'
    )
    expect(refused(f(1))).toBe(false)
    expect(refused(f(0))).toBe(true)
    expect(f(0).message).toContain('Book')
  })

  it(':? [Book]', () => {
    const f = load(
      `${BOOK}function f(x: 0):? [Book] { return x ? [{ t: 'a' }] : [5] }`,
      'f'
    )
    expect(refused(f(1))).toBe(false)
    expect(refused(f(0))).toBe(true)
  })

  it(':? { top: Book }', () => {
    const f = load(
      `${BOOK}function f(x: 0):? { top: Book } { return x ? { top: { t: 'a' } } : { top: 5 } }`,
      'f'
    )
    expect(refused(f(1))).toBe(false)
    expect(refused(f(0))).toBe(true)
  })
})

describe('a checked return checks members', () => {
  it(':? { top: 0 } refuses { top: "x" } and names the member', () => {
    const f = load(
      `function f(x: 0):? { top: 0 } { return x ? { top: 1 } : { top: 'x' } }`,
      'f'
    )
    expect(f(1)).toEqual({ top: 1 })
    const err = f(0)
    expect(refused(err)).toBe(true)
    expect(err.path).toContain(':return.top')
  })
})

describe('what stays unchecked', () => {
  it(':! is the opt-out', () => {
    const f = load(`${BOOK}function f(x: 0):! Book { return 5 }`, 'f')
    expect(f(1)).toBe(5)
  })

  it('a union with a member that cannot be resolved', () => {
    const f = load(`${BOOK}function f(x: 0):? Book | Mystery { return 5 }`, 'f')
    expect(f(1)).toBe(5)
  })
})
