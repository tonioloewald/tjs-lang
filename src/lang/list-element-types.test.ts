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
 * A Type in a DEFAULT is a value: the Type itself (#3411). Functions may take Types and
 * operate on them. Read as an example (`[Book]` = "a list of Books"), the parameter refused
 * its own default and every other Type passed in. The colon form keeps its meaning.
 */
describe('a Type used as a default value', () => {
  const SRC = `${BOOK}Type Point { example: { x: 0, y: 0 } }
function shelf(types = [Book]) { return types.length }
function accepts(t = Book, v = { title: 'a', pages: 1 }) { return t.check(v) }
function needsBooks(b: [Book]) { return b.length }
function opts(o = { types: [Book] }) { return o.types.length }
const __P = Point`
  const [shelf, accepts, needsBooks, opts, Point] = new Function(
    `${
      tjs(SRC, { runTests: false }).code
    }\nreturn [shelf, accepts, needsBooks, opts, __P]`
  )()

  it('the default is accepted, and so is any other Type', () => {
    expect(shelf()).toBe(1)
    expect(shelf([Point])).toBe(1)
    expect(accepts()).toBe(true)
    expect(accepts(Point, { x: 1, y: 2 })).toBe(true)
    expect(opts()).toBe(1)
  })

  it('a value that is not a Type is refused, and the message says Type', () => {
    expect(isError(shelf([5]))).toBe(true)
    expect(accepts(5).message).toMatch(/^Expected Type for /)
    expect(isError(opts({ types: [5] }))).toBe(true)
  })

  it('the colon form still means a value of that Type', () => {
    expect(needsBooks([{ title: 'a', pages: 1 }])).toBe(1)
    expect(isError(needsBooks([Point]))).toBe(true)
  })

  it('no warning: taking a Type is not a mistake', () => {
    expect(tjs(SRC, { runTests: false }).warnings ?? []).toEqual([])
  })
})
