/**
 * A destructured parameter is checked as the ARGUMENT it destructures (#3432).
 *
 * `function d({ w: 0, h: 0 })` expects one thing, an object with a `w` and an `h`. Anything
 * else is a type error carrying what arrived, and a monadic error passes through unchanged:
 * the same rule as every other parameter. The emitted code used to destructure in the
 * parameter list, so the argument had no name: an error passed in became a new "got
 * undefined" error, `null` THREW ("Cannot destructure"), and `received` could only be a
 * member. Now the argument is named, checked, then destructured in the body.
 *
 * The second half pins what must NOT change: defaults, `.length`, extra arguments (`map`
 * passes an index), `this`, async, methods and closures over the destructured names.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

/** Standalone emitted code (no global runtime), and the same with the full runtime. */
const loaders = {
  standalone: (src: string, name: string) => {
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
  },
  runtime: (src: string, name: string) =>
    new Function(`${tjs(src, { runTests: false }).code}\nreturn ${name}`)(),
}

for (const [mode, load] of Object.entries(loaders)) {
  describe(`a destructured parameter is checked as its argument (${mode})`, () => {
    const fn = () => load(`function d({ w: 0, h: 0 }) { return w * h }`, 'd')
    const arrow = () => load(`const d = ({ w: 0, h: 0 }) => w * h`, 'd')

    for (const [form, make] of [
      ['function', fn],
      ['arrow', arrow],
    ] as const) {
      it(`${form}: accepts a matching object`, () => {
        expect(make()({ w: 2, h: 3 })).toBe(6)
      })

      it(`${form}: a missing member's error carries the whole argument`, () => {
        const notARect = { w: 3 }
        const err = make()(notARect)
        expect(err.name).toBe('MonadicError')
        expect(err.path).toContain('d.h')
        expect(err.received).toBe(notARect)
      })

      it(`${form}: null is a type error, not a throw`, () => {
        let threw = false
        let err: any
        try {
          err = make()(null)
        } catch {
          threw = true
        }
        expect(threw).toBe(false)
        expect(err.name).toBe('MonadicError')
        expect('received' in err && err.received === null).toBe(true)
      })

      it(`${form}: no argument at all is a type error, not a throw`, () => {
        const err = make()()
        expect(err.name).toBe('MonadicError')
      })

      it(`${form}: a monadic error passes through unchanged`, () => {
        const dbl = load(`function dbl(n: 0) { return n * 2 }`, 'dbl')
        const first = dbl('ten')
        expect(make()(first)).toBe(first)
      })

      it(`${form}: a user's Error is refused, and carried`, () => {
        const mine = new Error('mine')
        const err = make()(mine)
        expect(err.name).toBe('MonadicError')
        expect(err.received).toBe(mine)
      })
    }
  })
}

describe('what the rewrite must not change', () => {
  const load = loaders.standalone

  it('an optional member keeps its default', () => {
    const d = load(`function d({ w: 0, h = 2 }) { return w * h }`, 'd')
    expect(d({ w: 3 })).toBe(6)
    expect(d({ w: 3, h: 5 })).toBe(15)
  })

  it('a default for the whole argument still applies', () => {
    const e = load(`const e = ({ a = 1 } = {}) => a`, 'e')
    expect(e()).toBe(1)
    expect(e({ a: 4 })).toBe(4)
  })

  it('.length is unchanged', () => {
    expect(load(`function d({ w: 0 }) { return w }`, 'd').length).toBe(1)
    expect(load(`const e = ({ a = 1 } = {}) => a`, 'e').length).toBe(0)
  })

  it('extra arguments are ignored (map passes an index)', () => {
    const xs = load(
      `function xs(items: [{ x: 0 }]) { return items.map(({ x: 0 }) => x * 2) }`,
      'xs'
    )
    expect(xs([{ x: 1 }, { x: 2 }])).toEqual([2, 4])
  })

  it('the body can reassign and close over the names', () => {
    const d = load(
      `function d({ w: 0 }) { const get = () => w\n w = w + 1\n return get() }`,
      'd'
    )
    expect(d({ w: 1 })).toBe(2)
  })

  it('async functions and methods', async () => {
    const a = load(`async function a({ w: 0 }) { return w + 1 }`, 'a')
    expect(await a({ w: 1 })).toBe(2)
    expect((await a({ w: 'x' })).name).toBe('MonadicError')
    const C = load(
      `class C { m({ w: 0 }) { return this.k + w } }\nC.prototype.k = 10`,
      'C'
    )
    expect(new C().m({ w: 1 })).toBe(11)
  })

  it('arguments[0] is still the argument', () => {
    const d = load(`function d({ w: 0 }) { return arguments[0] }`, 'd')
    const o = { w: 1 }
    expect(d(o)).toBe(o)
  })
})
