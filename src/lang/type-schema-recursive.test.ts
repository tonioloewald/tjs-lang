/**
 * `.toJSONSchema()` on an exported Type, and on a recursive one (#4119 items 5 and 6).
 *
 * The schema helper was inlined only into a module that itself called `.toJSONSchema()`, so a
 * Type exported from one module and asked for its schema by another threw "not a function". And
 * a recursive Type's schema stopped after one level (`items: {}`); a recursion is now a `$ref`
 * into `$defs`.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const load = (src: string, names: string) =>
  new Function(
    tjs(src).code.replace(/^export /gm, '') + `\nreturn [${names}]`
  )()

describe('toJSONSchema', () => {
  it('an exported Type carries it, though its module never calls it', () => {
    const [P] = load('export Type P { example: { x: 0 } }', 'P')
    expect(P.toJSONSchema()).toMatchObject({
      type: 'object',
      properties: { x: { type: 'integer' } },
    })
  })

  it('a self-recursive Type refers to itself through $defs', () => {
    const [Node] = load(
      'export Type Node { example: { v: 0, kids: [Node] } }',
      'Node'
    )
    const s = Node.toJSONSchema()
    expect(s.properties.kids.items).toEqual({ $ref: '#/$defs/Node' })
    expect(s.$defs.Node.properties.kids.items).toEqual({ $ref: '#/$defs/Node' })
    expect(s.$defs.Node.properties.v).toEqual({ type: 'integer' })
  })

  it('mutual recursion', () => {
    const [A] = load(
      `export Type A { example: { b: B | null } }
export Type B { example: { a: A | null } }`,
      'A'
    )
    const s = A.toJSONSchema()
    expect(JSON.stringify(s)).toContain('#/$defs/')
    expect(Object.keys(s.$defs).length).toBeGreaterThan(0)
  })

  it('a reference that does not recurse stays inline (the other direction)', () => {
    const [Outer] = load(
      `export Type Inner { example: { n: 0 } }
export Type Outer { example: { i: Inner } }`,
      'Outer'
    )
    const s = Outer.toJSONSchema()
    expect(s.$defs).toBeUndefined()
    expect(s.properties.i.properties.n).toEqual({ type: 'integer' })
  })

  it('a module with no export and no call carries no schema helper', () => {
    expect(tjs('Type P { example: { x: 0 } }').code).not.toContain('__ex2js')
  })
})
