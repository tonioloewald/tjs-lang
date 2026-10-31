/**
 * Class methods validate their parameters, the constructor included (#3598, from
 * tosijs-native). They were only stripped of annotations, so `class Box { constructor(v: 0)
 * }` built a Box from `Box('s')`, where the same signature on a function returns a
 * MonadicError. Standalone emitted code (no global runtime).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const SRC = `class Base { constructor(n: 0) { this.n = n } }
class Box extends Base {
  constructor(v: 0, label = 'box') { super(v); this.v = v; this.label = label }
  set(n: 0) { this.v = n; return this }
  set size(s: 0) { this._s = s }
  get size() { return this._s }
  static of(v: 0) { return Box(v) }
  loose(x) { return x }
  pick({ w: 0, h = 2 }) { return w * h }
}`

const load = (src: string, dialect?: 'js') => {
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return new Function(
      `${
        tjs(src, { runTests: false, ...(dialect ? { dialect } : {}) }).code
      }\nreturn Box`
    )()
  } finally {
    g.__tjs = prev
  }
}
const isError = (v: any) => v instanceof Error

describe('class method parameters are validated', () => {
  const Box = load(SRC)

  it('the constructor, in a derived class that calls super()', () => {
    expect(Box(5).v).toBe(5)
    expect(Box(5).label).toBe('box')
    const err = Box('s')
    expect(isError(err)).toBe(true)
    expect(err.message).toContain('Box.constructor.v')
  })

  it('an ordinary method and a static one', () => {
    expect(Box(5).set(7).v).toBe(7)
    expect(isError(Box(5).set('x'))).toBe(true)
    expect(isError(Box.of('q'))).toBe(true) // refused before the body runs
    // (Box.of(3) cannot construct: inside the class body the name is the raw class, not the
    // callable wrapper, so \`Box(v)\` there throws. A separate defect, #3608.)
  })

  it('a destructured method parameter is checked as its argument', () => {
    expect(Box(1).pick({ w: 3 })).toBe(6)
    expect(isError(Box(1).pick(null))).toBe(true)
  })

  it('untyped methods are untouched, and setters are not checked', () => {
    expect(Box(1).loose('anything')).toBe('anything')
    const b = Box(1)
    b.size = 4
    expect(b.size).toBe(4)
    // A setter's return value is discarded, so a refusal would silently DROP the write.
    b.size = 's' as any
    expect(b.size).toBe('s')
  })

  it("dialect 'js' validates nothing, methods included", () => {
    const JsBox = load(
      `class Box { constructor(v) { this.v = v }\n set(n) { this.v = n; return this } }`,
      'js'
    )
    expect(new JsBox('s').v).toBe('s')
  })
})
