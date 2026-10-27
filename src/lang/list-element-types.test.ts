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

describe('a declared Type keeps `| null` when it is promoted (rc.7 review)', () => {
  // Promotion replaced `{ unresolved: 'Book', nullable: true }` with a bare declared type, so
  // `Book | null` stopped admitting null wherever it was promoted.
  const BK = `Type Bk { example: { t: '' } }\n`

  it('a list of nullable Books', () => {
    const g = load(`${BK}function g(b: [Bk | null]) { return 'ok' }`, 'g')
    expect(g([null, { t: 'a' }])).toBe('ok')
    expect(isError(g([5]))).toBe(true)
  })

  it('a nullable Book member', () => {
    const f = load(
      `${BK}function f(s: { top: Bk | null }) { return 'ok' }`,
      'f'
    )
    expect(f({ top: null })).toBe('ok')
    expect(f({ top: { t: 'a' } })).toBe('ok')
    expect(isError(f({ top: 5 }))).toBe(true)
  })

  it('a nullable Book parameter', () => {
    const h = load(`${BK}function h(b: Bk | null) { return 'ok' }`, 'h')
    expect(h(null)).toBe('ok')
    expect(h({ t: 'a' })).toBe('ok')
    expect(isError(h(5))).toBe(true)
  })

  // fromTS inlines an interface as its shape (`[{ t: '' } | null]`), so this row never reaches
  // promotion: it pins the converted path's own nullable elements, not the fix above.
  it('converted TypeScript (TjsStrict) admits null elements too', async () => {
    const { fromTS } = await import('./emitters/from-ts')
    const ts = `/* @tjs TjsStrict */
interface Bk { t: string }
function g(b: (Bk | null)[]): string { return 'ok' }`
    const tjsSrc = fromTS(ts, { emitTJS: true }).code
    const g = load(tjsSrc, 'g')
    expect(g([null, { t: 'a' }])).toBe('ok')
    expect(isError(g([5]))).toBe(true)
  })
})

/**
 * A Type used as a DEFAULT VALUE is warned about (#3411). `function f(b = [Book])` makes the
 * example the default too, so `f()` passes the Type object itself, which the parameter's own
 * check refuses. `b: [Book]` (required) was meant.
 */
describe('a Type used as a default value', () => {
  const warningsOf = (src: string) =>
    tjs(src, { runTests: false }).warnings ?? []

  it('is warned about, naming the fix', () => {
    const w = warningsOf(`${BOOK}function f(b = [Book]) { return b }`)
    expect(
      w.some((m: string) =>
        m.includes("uses the Type 'Book' as a DEFAULT VALUE")
      )
    ).toBe(true)
    expect(w.some((m: string) => m.includes("write 'b: …'"))).toBe(true)
  })

  it('is not warned about for a required parameter or an ordinary default', () => {
    const w = warningsOf(
      `${BOOK}function g(c: [Book]) { return c }\nfunction h(x = 1) { return x }`
    )
    expect(w.some((m: string) => m.includes('DEFAULT VALUE'))).toBe(false)
  })
})
