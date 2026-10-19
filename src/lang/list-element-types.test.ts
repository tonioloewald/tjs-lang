/**
 * A list parameter checks its elements against their type, including a named Type and an
 * object shape (#3403).
 *
 * `function many(books: [Book])` accepted `[{ title: 'C' }]` and even `[5]`: the named type
 * was resolved for a lone `b: Book` (and, since #45, for union members), but inside a list it
 * stayed `{ kind: 'any', unresolved: 'Book' }`, so nothing was checked. And a literal
 * `[{ title: '', pages: 0 }]` checked only that each element was an object. Lists of
 * primitives (`[0.0]`, `['']`) were always checked per element.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const load = (src: string, name: string) =>
  new Function(`${tjs(src, { runTests: false }).code}\nreturn ${name}`)()
const isError = (v: any) => v instanceof Error

const BOOK = `Type Book { example: { title: '', pages: 0 } }\n`

describe('a list of a named Type checks every element', () => {
  const many = load(
    `${BOOK}function many(books: [Book]) { return 'ok' }`,
    'many'
  )

  it('accepts a list of Books, and an empty list', () => {
    expect(
      many([
        { title: 'A', pages: 10 },
        { title: 'B', pages: 20 },
      ])
    ).toBe('ok')
    expect(many([])).toBe('ok')
  })

  it('refuses an element that is not a Book', () => {
    expect(isError(many([{ title: 'A', pages: 10 }, { title: 'C' }]))).toBe(
      true
    )
    expect(isError(many([5]))).toBe(true)
  })

  it('the metadata names the type', () => {
    const r = tjs(`${BOOK}function many(books: [Book]) { return 'ok' }`, {
      runTests: false,
    })
    expect(r.types.many.params.books.type.items).toEqual({
      kind: 'declared',
      typeName: 'Book',
    })
  })

  it('a named Type inside an object shape is resolved too', () => {
    const shelf = load(
      `${BOOK}function shelf(s: { name: '', top: Book }) { return 'ok' }`,
      'shelf'
    )
    expect(shelf({ name: 'x', top: { title: 'A', pages: 1 } })).toBe('ok')
    expect(isError(shelf({ name: 'x', top: { title: 'A' } }))).toBe(true)
  })
})

describe('a list of object shapes checks each element member by member', () => {
  const lit = load(
    `function lit(books: [{ title: '', pages: 0 }]) { return 'ok' }`,
    'lit'
  )

  it('accepts matching elements', () => {
    expect(lit([{ title: 'A', pages: 1 }])).toBe('ok')
    expect(lit([{ title: 'A', pages: 1, extra: true }])).toBe('ok') // extra parts are fine
  })

  it('refuses an element missing a part, or with a part of the wrong kind', () => {
    expect(isError(lit([{ title: 'A', pages: 1 }, { title: 'C' }]))).toBe(true)
    expect(isError(lit([{ title: 'A', pages: 'many' }]))).toBe(true)
  })

  it('nested shapes and nested lists', () => {
    const f = load(
      `function f(rows: [{ id: 0, tags: [''], at: { x: 0 } }]) { return 'ok' }`,
      'f'
    )
    expect(f([{ id: 1, tags: ['a'], at: { x: 2 } }])).toBe('ok')
    expect(isError(f([{ id: 1, tags: [3], at: { x: 2 } }]))).toBe(true)
    expect(isError(f([{ id: 1, tags: ['a'], at: { x: 'two' } }]))).toBe(true)
  })
})
