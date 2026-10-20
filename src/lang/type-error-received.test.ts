/**
 * A type error carries the ARGUMENT it refused, as `err.received`: the thing that was passed
 * and found wanting. When a member fails (`area({ w: 3 })`, no `h`), that is the whole
 * object, not the member's `undefined`: the error is that this is not a rect.
 *
 * Only TJS's own errors propagate through a typed function. An `Error` the caller made is
 * refused like any other wrong value, and the type error said "got object" and nothing
 * more: the receiver could not see what it got. Now the refused value rides along,
 * non-enumerable, so logging or `JSON.stringify` of the error never walks it (it may be
 * large or cyclic).
 *
 * Every construction site is checked: the inline stub (standalone emitted code), the
 * installed global runtime, a `createRuntime()` instance, and the callback-shape checks.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime, typeError } from './runtime'

/**
 * STANDALONE: the emitted code with no global runtime, so it binds its own inline copy. Bun's
 * test preload installs the full runtime globally, and emitted code binds `__tjs` from it at
 * load time, so a plain `new Function` here tests the RUNTIME, not the stub. (The first version
 * of this file did exactly that: reverting the stub left every row green.)
 */
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

const DOUBLE = `function double(n: 0) { return n * 2 }`

describe('err.received is the refused value', () => {
  it('the inline stub: a user-made Error is refused, and carried', () => {
    const double = load(DOUBLE, 'double')
    const mine = new Error('my own mistake')
    const err = double(mine)
    expect(err.name).toBe('MonadicError')
    expect(err.received).toBe(mine)
    expect(err.received.message).toBe('my own mistake')
  })

  it('a missing member: received is the ARGUMENT that lacks it, not the member', () => {
    // "You were supposed to give me a rect; this is not a rect." The failure is the thing
    // passed, which was missing a height; the member's value is just `undefined`.
    const area = load(`function area(r: { w: 0, h: 0 }) { return 1 }`, 'area')
    const notARect = { w: 3 }
    const err = area(notARect)
    expect(err.path).toContain('r.h')
    expect(err.received).toBe(notARect)
  })

  it('however deep the member, and whichever parameter', () => {
    const deep = load(
      `function deep(o: { a: { b: { c: 0 } } }) { return 1 }`,
      'deep'
    )
    const o = { a: { b: {} } }
    expect(deep(o).received).toBe(o)
    const second = load(
      `function second(a: 0, r: { w: 0 }) { return 1 }`,
      'second'
    )
    const r = {}
    expect(second(1, r).received).toBe(r)
  })

  it('a list, and a list of shapes: the list', () => {
    const shapes = load(
      `function shapes(xs: [{ t: '' }]) { return 1 }`,
      'shapes'
    )
    const xs = [{ t: 'a' }, {}]
    expect(shapes(xs).received).toBe(xs)
  })

  it('a dictionary default: the dictionary', () => {
    const dict = load(`function dict(o = { w: 0, h: 0 }) { return 1 }`, 'dict')
    const o = { w: 'x' }
    expect(dict(o).received).toBe(o)
  })

  it('a TJS error still propagates unchanged (it is not wrapped)', () => {
    const double = load(DOUBLE, 'double')
    const first = double('ten')
    expect(first.received).toBe('ten')
    expect(double(first)).toBe(first)
  })

  it('the global runtime typeError: the argument when given, else the value', () => {
    const v = { big: [1, 2, 3] }
    expect(typeError('p', 'integer', v).received).toBe(v)
    const arg = { a: 'x' }
    expect(typeError('p.a', 'integer', 'x', undefined, arg).received).toBe(arg)
  })

  it('a createRuntime() instance', () => {
    const rt = createRuntime() as any
    const v = Symbol('v')
    expect(rt.typeError('p', 'integer', v).received).toBe(v)
    const arg = { a: v }
    expect(rt.typeError('p.a', 'integer', v, undefined, arg).received).toBe(arg)
  })

  it('the full runtime, installed, through emitted code', async () => {
    const { installRuntime } = await import('./runtime')
    const g = globalThis as any
    const prev = g.__tjs
    installRuntime()
    try {
      const double = new Function(
        `${tjs(DOUBLE, { runTests: false }).code}\nreturn double`
      )()
      const mine = new Error('x')
      expect(double(mine).received).toBe(mine)
      const area = new Function(
        `${
          tjs(`function area(r: { w: 0, h: 0 }) { return 1 }`, {
            runTests: false,
          }).code
        }\nreturn area`
      )()
      const notARect = { w: 3 }
      expect(area(notARect).received).toBe(notARect)
    } finally {
      g.__tjs = prev
    }
  })

  it('a callback of the wrong shape: received is the callback', () => {
    const [cb, run] = load(
      `function cb(x: '') { return x }\nfunction run(f: (n: 0) => 0) { return f(1) }`,
      '[cb, run]'
    )
    const err = run(cb)
    expect(err.message).toContain('callback declares arg0 as string')
    expect(err.received).toBe(cb)
  })
})

describe('received never weighs on serialization', () => {
  it('is not enumerable, so JSON.stringify skips a cyclic value', () => {
    const double = load(DOUBLE, 'double')
    const cyclic: any = { name: 'loop' }
    cyclic.self = cyclic
    const err = double(cyclic)
    expect(err.received).toBe(cyclic)
    expect(Object.keys(err)).not.toContain('received')
    expect(() => JSON.stringify(err)).not.toThrow()
  })

  it('is the same shape from the stub and the runtime', () => {
    const stub = load(DOUBLE, 'double')('x')
    const real = typeError('p', 'integer', 'x')
    const desc = (e: any) => {
      const d = Object.getOwnPropertyDescriptor(e, 'received')!
      return {
        enumerable: d.enumerable,
        writable: d.writable,
        configurable: d.configurable,
      }
    }
    expect(desc(stub)).toEqual(desc(real))
  })
})
