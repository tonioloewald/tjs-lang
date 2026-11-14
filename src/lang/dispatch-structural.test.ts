/**
 * An overload with an object example claims only objects shaped like it (#4111).
 *
 * The dispatcher checked an object example as "an object", so the first object variant claimed
 * every object: `g(o: { a: 1 })` declared before `g(c: Circle)` took `{ r: 2.0 }`, failed its own
 * check, and the Circle variant was never tried. Now each member of the example is checked, so
 * dispatch tries variants in order and the first whose example the arguments match wins. No
 * subclass or duck-typing restriction: an object with the members matches.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime, isMonadicError } from './runtime'

const load = (src: string, name: string) => {
  const saved = (globalThis as any).__tjs
  ;(globalThis as any).__tjs = createRuntime()
  try {
    return new Function(tjs(src).code + `\nreturn ${name}`)()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

const SRC = `
Type Circle { example: { r: 1.0 } }
function g(o: { a: 1 }) { return 'plain ' + o.a }
function g(c: Circle) { return 'circle ' + c.r }
`

describe('object overloads dispatch by shape', () => {
  it("an object with the first example's members takes the first variant", () => {
    expect(load(SRC, 'g')({ a: 5 })).toBe('plain 5')
  })
  it('a Circle falls through to the Circle variant', () => {
    expect(load(SRC, 'g')({ r: 2.0 })).toBe('circle 2')
  })
  it('extra members are fine: it is a shape, not an exact type', () => {
    expect(load(SRC, 'g')({ a: 1, extra: true })).toBe('plain 1')
  })
  it('nothing matching is still an error', () => {
    expect(isMonadicError(load(SRC, 'g')({ z: 1 }))).toBe(true)
  })
  it('nested examples are checked too', () => {
    // (two plain-object overloads are still refused as ambiguous at declaration; this pairs
    // a nested object example with a named Type)
    const h = load(
      `Type Tag { example: { at: '' } }\nfunction h(p: { at: { x: 0 } }) { return 'point' }\nfunction h(t: Tag) { return 'named' }`,
      'h'
    )
    expect(h({ at: { x: 3 } })).toBe('point')
    expect(h({ at: 'home' })).toBe('named')
  })
})
