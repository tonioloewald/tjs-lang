/**
 * A typed TJS function accepts a tosijs model (the book's calculator).
 *
 * tosijs hands back proxies: `calculator.x` wraps a number. A function declared
 * `press(state: { x: 0 })` checked the PROXY and said "expected integer, got object" for a
 * perfectly good number. That is the friction TJS exists to remove, so a parameter's checks
 * read through `__tv` (the value a proxy wraps), while the body still receives the proxy,
 * so writes inside it update the model.
 *
 * The stand-in carries the key tosijs uses for a proxy's value, `Symbol.for('xin-value')`.
 * tosijs does not export it (tosijs#51), so `tosi-proxy-real.test.ts` checks the same
 * behaviour against REAL tosijs proxies under happy-dom: a rename upstream fails there.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const XV = Symbol.for('xin-value')
/**
 * A tosijs-like proxy around `v`: answers the marker with `v`, forwards everything else to it
 * (members come back as proxies too, as in tosijs), and converts to `v` for arithmetic.
 */
const box = (v: unknown): any =>
  new Proxy(Object(v ?? {}), {
    get(target, key) {
      if (key === XV) return v
      if (key === 'valueOf' || key === Symbol.toPrimitive) return () => v
      if (key === 'toString') return () => String(v)
      const member = Reflect.get(target, key)
      if (typeof member === 'function') return member.bind(v)
      return member !== undefined && typeof key === 'string'
        ? box(member)
        : member
    },
  })

const load = (src: string, name: string) =>
  new Function(`${tjs(src, { runTests: false }).code}\nreturn ${name}`)()

const isError = (v: any) => v instanceof Error

describe('a typed parameter is checked as the value a tosijs proxy wraps', () => {
  it('numbers and strings', () => {
    const f = load(`function f(n: 0, s: '') { return 'ok' }`, 'f')
    expect(f(box(1), box('a'))).toBe('ok')
    expect(isError(f(box('one'), 'a'))).toBe(true) // still checked: a string is not a number
    expect(isError(f(1, box(2)))).toBe(true)
  })

  it('an object shape, member by member', () => {
    const area = load(
      `function area(r: { w: 0, h: 0 }) { return r.w * r.h }`,
      'area'
    )
    expect(area(box({ w: 2, h: 3 }))).toBe(6)
    const missing = area(box({ w: 2 }))
    expect(isError(missing)).toBe(true)
    expect(missing.message).toContain('r.h')
  })

  it('a named Type', () => {
    const f = load(
      `Type Point { example: { x: 0, y: 0 } }\nfunction f(p: Point) { return 'ok' }`,
      'f'
    )
    expect(f(box({ x: 1, y: 2 }))).toBe('ok')
    expect(isError(f(box({ x: 'a', y: 2 })))).toBe(true)
  })

  it('a list', () => {
    const total = load(
      `function total(xs: [0]) { let t = 0\n for (const x of xs) t = t + x\n return t }`,
      'total'
    )
    expect(total(box([1, 2, 3]))).toBe(6)
    expect(isError(total(box(['a'])))).toBe(true)
  })

  it('an optional parameter', () => {
    const f = load(`function f(n = 0) { return 'ok' }`, 'f')
    expect(f(box(3))).toBe('ok')
    expect(f()).toBe('ok')
  })

  it('the body receives the proxy itself, so writes reach the model', () => {
    const f = load(
      `function f(state: { x: 0 }) { state.x = 42\n return state }`,
      'f'
    )
    const model: any = { [XV]: { x: 1 } }
    expect(f(model)).toBe(model)
    expect(model.x).toBe(42)
  })

  it('a hostile proxy cannot make the check throw', () => {
    const f = load(`function f(n: 0) { return 'ok' }`, 'f')
    const hostile = new Proxy(
      {},
      {
        get: (_t, k) => {
          if (k === XV) throw new Error('trap')
          return undefined
        },
      }
    )
    let threw = false
    let result: any
    try {
      result = f(hostile)
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    expect(isError(result)).toBe(true)
  })

  it('only tosijs proxies are unwrapped: not a Date, not a boxed primitive', () => {
    const n = load(`function f(n: 0) { return 'ok' }`, 'f')
    expect(isError(n(new Date(5)))).toBe(true)
    expect(isError(n({ valueOf: () => 5 }))).toBe(true)
    const s = load(`function f(s: '') { return 'ok' }`, 'f')
    expect(isError(s(new String('x')))).toBe(true)
  })
})

describe("a type's own check agrees with a parameter of that type", () => {
  const src = `Type Point { example: { x: 0, y: 0 } }\nconst P = Point`

  it('the inline stub (standalone emitted code)', () => {
    const P = load(src, 'P')
    expect(P.check(box({ x: 1, y: 2 }))).toBe(true)
    expect(P.check(box({ x: 'a', y: 2 }))).toBe(false)
  })

  it('the full runtime', async () => {
    const { installRuntime } = await import('./runtime')
    const g = globalThis as any
    const prev = g.__tjs
    installRuntime()
    try {
      const P = load(src, 'P')
      expect(P.check(box({ x: 1, y: 2 }))).toBe(true)
      expect(P.check(box({ x: 'a', y: 2 }))).toBe(false)
    } finally {
      g.__tjs = prev
    }
  })
})

/**
 * The three places the rc.7 CHANGELOG said a proxy was "not yet" seen through (#3406): a
 * proxy held inside a plain object or list, an overloaded function's dispatch, and a `:?`
 * return. Each is checked as the value it wraps; each body or caller still gets the proxy.
 */
describe('proxies inside values, overloads and checked returns', () => {
  it('a proxy inside a plain object or list', () => {
    const m = load(`function m(o: { a: 0 }) { return 'ok' }`, 'm')
    expect(m({ a: box(3) })).toBe('ok')
    const wrong = m({ a: box('x') })
    expect(isError(wrong)).toBe(true)
    expect(wrong.message).toContain('got string') // the wrapped value, not "object"
    const e = load(`function e(xs: [0]) { return 'ok' }`, 'e')
    expect(e([box(3), 4])).toBe('ok')
    expect(isError(e([box('x')]))).toBe(true)
    const s = load(`function s(xs: [{ t: '' }]) { return 'ok' }`, 's')
    expect(s([{ t: box('a') }])).toBe('ok')
  })

  it('overload dispatch', () => {
    const f = load(
      `function f(n: 0) { return 'num' }\nfunction f(s: '') { return 'str' }`,
      'f'
    )
    expect(f(box(3))).toBe('num')
    expect(f(box('a'))).toBe('str')
    expect(isError(f(box(true)))).toBe(true)
  })

  it('a checked return: checked through, and the caller gets the proxy', () => {
    const XV = Symbol.for('xin-value')
    const r = load(`function r(o: { n: 0 }):? 0 { return o.n }`, 'r')
    const out = r(box({ n: 3 }))
    expect(out[XV]).toBe(3)
    const bad = load(`function bad(o: { s: '' }):? 0 { return o.s }`, 'bad')
    expect(isError(bad(box({ s: 'x' })))).toBe(true)
  })
})
