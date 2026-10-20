/**
 * A type error carries the value it refused, as `err.received`.
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

const load = (src: string, name: string) =>
  new Function(`${tjs(src, { runTests: false }).code}\nreturn ${name}`)()

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

  it('a missing member: received is what the member held', () => {
    const area = load(`function area(r: { w: 0, h: 0 }) { return 1 }`, 'area')
    const err = area({ w: 3 })
    expect(err.path).toContain('r.h')
    expect('received' in err).toBe(true)
    expect(err.received).toBeUndefined()
  })

  it('a TJS error still propagates unchanged (it is not wrapped)', () => {
    const double = load(DOUBLE, 'double')
    const first = double('ten')
    expect(first.received).toBe('ten')
    expect(double(first)).toBe(first)
  })

  it('the global runtime typeError', () => {
    const v = { big: [1, 2, 3] }
    expect(typeError('p', 'integer', v).received).toBe(v)
  })

  it('a createRuntime() instance', () => {
    const rt = createRuntime() as any
    const v = Symbol('v')
    expect(rt.typeError('p', 'integer', v).received).toBe(v)
  })

  it('the full runtime, installed, through emitted code', async () => {
    const { installRuntime } = await import('./runtime')
    const g = globalThis as any
    const prev = g.__tjs
    installRuntime()
    try {
      const double = load(DOUBLE, 'double')
      const mine = new Error('x')
      expect(double(mine).received).toBe(mine)
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
