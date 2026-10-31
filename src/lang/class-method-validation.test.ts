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
    expect(Box.of(3).v).toBe(3) // a class constructing itself from its own body (#3608)
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

/**
 * A class can call itself from its own body (#3608): inside the body the name is the raw
 * class, not the callable wrapper, so `Box(v)` threw. It now goes through the wrapper, which
 * also keeps an overloaded constructor dispatching.
 */
describe('a class calling itself from its own body', () => {
  it('from a static and an instance method', () => {
    const Box = load(`class Box { constructor(v: 0) { this.v = v }
  static of(v: 0) { return Box(v) }
  twice() { return Box(this.v * 2) } }`)
    expect(Box.of(3).v).toBe(3)
    expect(Box(4).twice().v).toBe(8)
    expect(Box.of(3) instanceof Box).toBe(true)
    expect(Object.keys(Box)).toEqual([]) // the back-reference is not enumerable
  })

  it('with overloaded constructors, through the dispatcher', () => {
    const g = globalThis as any
    const prev = g.__tjs
    g.__tjs = undefined
    const P = new Function(
      `${
        tjs(
          `class P {
  constructor(x: 0, y: 0) { this.x = x; this.y = y }
  constructor(s: '') { const [a, b] = s.split(','); this.x = +a; this.y = +b }
  static parse(s: '') { return P(s) }
  static at(x: 0, y: 0) { return P(x, y) } }`,
          { runTests: false }
        ).code
      }\nreturn P`
    )()
    g.__tjs = prev
    expect({ ...P.parse('3,4') }).toEqual({ x: 3, y: 4 })
    expect({ ...P.at(1, 2) }).toEqual({ x: 1, y: 2 })
  })

  it('a parameter of the same name is left alone', () => {
    const Box = load(`class Box { constructor(v: 0) { this.v = v }
  static run(Box) { return Box(5) } }`)
    expect(Box.run((n: number) => n * 10)).toBe(50)
  })
})

/**
 * The callable-class wrapper finds the class's end over the MASKED source (literal
 * blindness): a `}` in a string or regex inside a method put the wrapper inside the class
 * body, where it parsed as a class FIELD, so the class was never made callable.
 */
describe('a brace inside a string or regex does not end the class', () => {
  it('the class is callable and grows no stray field', () => {
    const g = globalThis as any
    const prev = g.__tjs
    g.__tjs = undefined
    const Fmt = new Function(
      `${
        tjs(
          `class Fmt {
  brace(s: '') { return s + '}' }
  regex(s: '') { return /[}]/.test(s) }
  after(n: 0) { return n }
}`,
          { runTests: false }
        ).code
      }\nreturn Fmt`
    )()
    g.__tjs = prev
    const f = Fmt()
    expect(f.brace('a')).toBe('a}')
    expect(f.regex('x}')).toBe(true)
    expect(f.after(3)).toBe(3)
    expect(Object.keys(f)).toEqual([])
  })
})

/**
 * The self-call rewrite resolves the callee by SCOPE (rc.10 review): it fired on any `Box(…)`
 * inside the class body, so a method that bound its own `Box` called `Box.__tjs_callable`, which
 * its local does not have. Every binding form between the call and the class body shadows.
 */
describe('a shadowed class name inside the body is left alone', () => {
  const run = (method: string) =>
    load(`class Box { constructor(v: 0) { this.v = v }\n  ${method} }`)(1).m()
  const cases: [string, string][] = [
    ['a local const', 'm() { const Box = (x) => x * 10; return Box(2) }'],
    ['a let in a block', 'm() { { let Box = (x) => x * 10; return Box(2) } }'],
    // No `var` row: native TJS refuses `var`, and only native TJS wraps classes.
    [
      'an inner function declaration',
      'm() { function Box(x) { return x * 10 } return Box(2) }',
    ],
    [
      'a destructured param',
      'm({ Box } = { Box: (x) => x * 10 }) { return Box(2) }',
    ],
    ['a default param', 'm(Box = (x) => x * 10) { return Box(2) }'],
    ['a rest param', 'm(...Box) { return 20 }'],
    [
      'a catch param',
      'm() { try { throw (x) => x * 10 } catch (Box) { return Box(2) } }',
    ],
    [
      'a for-of binding',
      'm() { for (const Box of [(x) => x * 10]) return Box(2) }',
    ],
    ['an arrow param', 'm() { return ((Box) => Box(2))((x) => x * 10) }'],
  ]
  for (const [what, method] of cases)
    it(what, () => expect(run(method)).toBe(20))

  it('a string naming the wrapper does not make an unwrapped class look wrapped', () => {
    // Literal blindness: the gate was a substring test over the source, and under
    // dialect 'js' a class is never wrapped, so the rewrite would call a property it lacks.
    const out = tjs(
      `const note = "Box, '__tjs_callable'"\nclass Box { static of(v) { return Box(v) } }`,
      { runTests: false, dialect: 'js' }
    ).code
    expect(out).not.toContain('__tjs_callable(')
  })

  it('an unshadowed self-call still goes through the wrapper', () => {
    const Box = load(`class Box { constructor(v: 0) { this.v = v }
  static of(v: 0) { const other = 1; return Box(v + other - 1) } }`)
    expect(Box.of(3).v).toBe(3)
  })
})
