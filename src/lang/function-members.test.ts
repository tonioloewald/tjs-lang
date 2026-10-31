/**
 * A function-valued member of a Type's example means "a function here" (#3595, from
 * tosijs-native). Both checkers refused EVERY value, one of exactly that shape included: the
 * inline matcher compared a function example by identity, and the full runtime's inference
 * has no schema for a function. Both runtimes, since they must agree (docs/type-identity.md).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

const SRC = `Type Point { example: { x: 0, y: 0 } }
Type Bridge { example: { call: (a) => 1, name: '', at: Point } }
function use(b: Bridge):! 0 { return 1 }
const __B = Bridge`

// Emitted code calls its own inline Type either way; the installed runtime changes only
// `__tjs` (typeError and friends). The runtime Type is tested directly below.
const runtimes = {
  standalone: () => undefined,
  'with a runtime installed': () => createRuntime(),
}

for (const [label, make] of Object.entries(runtimes)) {
  describe(`function-valued example members, emitted (${label})`, () => {
    const g = globalThis as any
    const prev = g.__tjs
    g.__tjs = make()
    const [use, Bridge] = new Function(
      `${tjs(SRC, { runTests: false }).code}\nreturn [use, __B]`
    )()
    g.__tjs = prev
    const good = { call: (a: number) => a, name: 'x', at: { x: 1, y: 2 } }

    it('accepts a value with a function there', () => {
      expect(Bridge.check(good)).toBe(true)
      expect(use(good)).toBe(1)
    })

    it('refuses a non-function there, or the member missing', () => {
      expect(Bridge.check({ ...good, call: 5 })).not.toBe(true)
      const { call: _call, ...noCall } = good
      expect(Bridge.check(noCall)).not.toBe(true)
    })

    it('a nested Type beside it is still checked', () => {
      expect(Bridge.check({ ...good, at: { x: 'one', y: 2 } })).not.toBe(true)
    })
  })
}

/**
 * The runtime `Type` (src/types/Type.ts), called directly: emitted code always calls its own
 * inline stub, so installing a full runtime does not reach this one.
 */
describe('function-valued example members (runtime Type, directly)', () => {
  it('accepts a function there, refuses a non-function or a missing one', async () => {
    const { Type } = await import('../types/Type')
    const Point = Type('Point', undefined, { x: 0, y: 0 })
    const Bridge = Type('Bridge', undefined, {
      call: (a: number) => a,
      name: '',
      at: Point,
    })
    const good = { call: (a: number) => a, name: 'x', at: { x: 1, y: 2 } }
    expect(Bridge.check(good)).toBe(true)
    expect(Bridge.check({ ...good, call: 5 })).not.toBe(true)
    const { call: _call, ...noCall } = good
    expect(Bridge.check(noCall)).not.toBe(true)
    expect(Bridge.check({ ...good, at: { x: 'one', y: 2 } })).not.toBe(true)
  })
})
