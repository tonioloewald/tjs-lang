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

/**
 * `({ w, h }: Shape)`, the TypeScript spelling, is honoured (#3434): the argument is checked
 * against `Shape`, then destructured. The annotation used to be erased, with a comment
 * claiming it was "captured for metadata"; nothing captured it, so `d({ w: 'x' })` returned
 * NaN. It is the shape `fromTS` emits for every typed destructured TypeScript parameter, and
 * it is the only spelling that can name a type (`{ w: R }` in a pattern is a RENAME).
 */
describe('a TS-style destructured annotation is checked', () => {
  const load = loaders.standalone

  it('an inline shape', () => {
    const d = load(`function d({ w, h }: { w: 0, h: 0 }) { return w * h }`, 'd')
    expect(d({ w: 2, h: 3 })).toBe(6)
    const notARect = { w: 'x', h: 3 }
    const err = d(notARect)
    expect(err.path).toContain('d.w')
    expect(err.received).toBe(notARect)
  })

  it('a named Type, which a pattern cannot express', () => {
    const d = load(
      `Type R { example: { x: 0 } }\nfunction d({ x }: R) { return x }`,
      'd'
    )
    expect(d({ x: 4 })).toBe(4)
    const bad = { x: 'a' }
    expect(d(bad).received).toBe(bad)
    expect(d(bad).message).toContain('Expected R')
  })

  it('a rename, which native TJS leaves unchecked, is checked through the shape', () => {
    const d = load(`function d({ w: width }: { w: 0 }) { return width }`, 'd')
    expect(d({ w: 5 })).toBe(5)
    expect(d({ w: '5' }).name).toBe('MonadicError')
  })

  it('a default after the type is kept (it used to be erased with the type)', () => {
    const d = load(`const d = ({ a }: { a: 0 } = { a: 1 }) => a`, 'd')
    expect(d()).toBe(1)
    expect(d({ a: 2 })).toBe(2)
    expect(d({ a: 'z' }).name).toBe('MonadicError')
  })

  it('null, and a monadic error, as for any parameter', () => {
    const d = load(`function d({ w }: { w: 0 }) { return w }`, 'd')
    expect(d(null).name).toBe('MonadicError')
    const dbl = load(`function dbl(n: 0) { return n * 2 }`, 'dbl')
    const first = dbl('ten')
    expect(d(first)).toBe(first)
  })

  it('the metadata gives each member its declared type', () => {
    const r = tjs(`function d({ w, h }: { w: 0, h: '' }) { return w }`, {
      runTests: false,
    })
    expect(r.types.d.params.w.type.kind).toBe('integer')
    expect(r.types.d.params.h.type.kind).toBe('string')
  })

  it('the marker never reaches the output, checked or not', () => {
    for (const src of [
      // Not consumed by the emitter (an array pattern; a destructured parameter that is not
      // the only one): the annotation is erased as before, never shipped as a marker.
      `function f([a, b]: [0, 0]) { return a + b }`,
      `function g(x: 0, { b }: { b: 0 }) { return b }`,
      `const h = ({ a }: { a: 0 }, k = 1) => a + k`,
      `function d({ w }: { w: 0 }) { return w }`,
      `function d(! { w }: { w: 0 }) { return w }`, // unsafe: no checks
      `const d = ({ a }: { a: 0 } = { a: 1 }) => a`,
    ]) {
      const code = tjs(src, { runTests: false }).code
      expect(code).not.toContain('__tjs_shape')
    }
  })

  it('converted TypeScript is checked end to end (TjsStrict)', async () => {
    const { fromTS } = await import('./emitters/from-ts')
    const ts = `/* @tjs TjsStrict */
function area({ w, h }: { w: number; h: number }): number { return w * h }`
    const area = load(fromTS(ts, { emitTJS: true }).code, 'area')
    expect(area({ w: 2, h: 3 })).toBe(6)
    expect(area({ w: 'x', h: 3 }).name).toBe('MonadicError')
  })
})

/**
 * The converter writes GOOD TJS where native syntax can say it (#3434):
 * `({ w, h }: { w: number; h?: string })` -> `({ w: 0.0, h: '' | undefined })`. Where it
 * cannot (a rename, a named type, a default in the pattern), it keeps the TypeScript
 * spelling, which the compiler checks. Either way, converted code under TjsStrict refuses a
 * bad argument; before, every one of these was unchecked.
 */
describe('fromTS: destructured parameters', () => {
  const convert = async (ts: string) => {
    const { fromTS } = await import('./emitters/from-ts')
    return fromTS(`/* @tjs TjsStrict */\n${ts}`, { emitTJS: true }).code
  }
  const signature = (code: string, name: string) =>
    code.split('\n').find((l) => l.includes(`function ${name}(`))

  const cases: Array<{
    name: string
    ts: string
    emits: string
    good: unknown[]
    bad: unknown[]
  }> = [
    {
      name: 'a',
      ts: 'function a({ w, h }: { w: number; h: string }): number { return w }',
      emits: `({ w: 0.0, h: '' })`,
      good: [{ w: 1.5, h: 'x' }],
      bad: [{ w: 'x', h: 'x' }],
    },
    {
      name: 'b',
      ts: 'function b({ w, h }: { w: number; h?: string }): number { return w }',
      emits: `({ w: 0.0, h: '' | undefined })`,
      good: [{ w: 1 }],
      bad: [{ w: 1, h: 5 }],
    },
    {
      name: 'f',
      ts: 'function f({ xs, m }: { xs: number[]; m: { k: boolean } }): number { return xs.length }',
      emits: `({ xs: [0.0], m: { k: false } })`,
      good: [{ xs: [1.5], m: { k: true } }],
      bad: [{ xs: ['a'], m: { k: true } }],
    },
    {
      name: 'c',
      ts: 'function c({ w: width }: { w: number }): number { return width }',
      emits: `({ w: width }: { w: number })`, // a rename: kept as TypeScript
      good: [{ w: 2 }],
      bad: [{ w: '2' }],
    },
    {
      name: 'd',
      ts: 'interface R { x: number }\nfunction d({ x }: R): number { return x }',
      emits: `({ x }: R)`, // a named type: kept as TypeScript
      good: [{ x: 3 }],
      bad: [{ x: 'a' }],
    },
    {
      name: 'e',
      ts: 'function e({ h = 2 }: { h?: number }): number { return h }',
      emits: `({ h = 2 }: { h: number | undefined })`, // a pattern default: kept
      good: [{}],
      bad: [{ h: 'z' }],
    },
    {
      name: 'g',
      ts: 'function g({ w }: { w: number } = { w: 1 }): number { return w }',
      emits: `({ w }: { w: number } = { w: 1 })`, // the type is no longer dropped
      good: [],
      bad: [{ w: 'q' }],
    },
  ]

  for (const c of cases) {
    it(`${c.name}: emits ${c.emits}, and refuses a bad argument`, async () => {
      const code = await convert(c.ts)
      expect(signature(code, c.name)).toContain(c.emits)
      const f = loaders.standalone(code, c.name)
      expect(f(...c.good) instanceof Error).toBe(false)
      expect(f(...c.bad)?.name).toBe('MonadicError')
    })
  }
})

/**
 * AJS shares the parameter parser. At rc.7 it accepted `({ a }: T = d)` and silently
 * DROPPED the default (the whole tail after `:` was erased). The default is kept now, and
 * AJS refuses a defaulted destructured argument, as it already did for `({ a } = d)`: a
 * refusal, not a silent change of meaning. The typed form without a default still works.
 */
describe('AJS: a typed destructured parameter', () => {
  it('is accepted without a default', async () => {
    const { transpile } = await import('./index')
    expect(() =>
      transpile('function agent({ a }: { a: 0 }) { return { a } }')
    ).not.toThrow()
  })

  it('with a default is refused, as the untyped form is, never silently dropped', async () => {
    const { transpile } = await import('./index')
    const refusal = (src: string) => {
      try {
        transpile(src)
        return 'accepted'
      } catch (e: any) {
        return String(e.message).split(' at ')[0]
      }
    }
    const typed = refusal(
      'function agent({ a }: { a: 0 } = { a: 1 }) { return { a } }'
    )
    expect(typed).not.toBe('accepted')
    expect(typed).toBe(
      refusal('function agent({ a } = { a: 1 }) { return { a } }')
    )
  })
})
