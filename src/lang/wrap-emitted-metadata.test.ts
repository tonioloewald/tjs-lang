/**
 * `wrap(fn, meta)` reads the metadata TJS actually emits (#3496).
 *
 * `wrap` is documented to take "the __tjs metadata", and refused every call given it:
 * `wrap((a, b) => a + b, add.__tjs)(1, 2)` returned "Multiple parameter errors", because its
 * `checkType` understood kind NAMES (`'number'`) and RuntimeType objects, while `__tjs`
 * carries transpiler descriptors (`{ kind: 'integer' }`). Each row takes the metadata from a
 * real transpile, both `tjs().types` and the emitted function's own `__tjs`.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import {
  wrap,
  isError,
  createRuntime,
  installRuntime,
  record,
  records,
} from './runtime'

const metaOf = (src: string, name: string) => {
  const r = tjs(src, { runTests: false })
  const emitted = new Function(`${r.code}\nreturn ${name}`)()
  return { types: r.types[name] as any, emitted: emitted.__tjs }
}

for (const source of ['types', 'emitted'] as const) {
  describe(`wrap() with ${source} metadata`, () => {
    const wrapped = (src: string, name: string, impl: (...a: any[]) => any) =>
      wrap(impl, metaOf(src, name)[source])

    it('primitives: a good call runs, a bad one is refused', () => {
      const add = wrapped(
        'function add(a: 0, b: 0): 0 { return a + b }',
        'add',
        (a, b) => a + b
      )
      expect(add(1, 2)).toBe(3)
      expect(isError(add('x', 2))).toBe(true)
      expect(isError(add(1.5, 2))).toBe(true) // integer example
    })

    it('an object shape, member by member', () => {
      const area = wrapped(
        'function area(r: { w: 0, h: 0 }) { return 1 }',
        'area',
        (r) => r.w * r.h
      )
      expect(area({ w: 2, h: 3 })).toBe(6)
      expect(isError(area({ w: 2 }))).toBe(true)
    })

    it('a list, a union and a literal union', () => {
      const f = wrapped(
        "function f(xs: [''], u: 0 | '', m: 'a' | 'b') { return 1 }",
        'f',
        () => 'ok'
      )
      expect(f(['x'], 1, 'a')).toBe('ok')
      expect(isError(f([1], 1, 'a'))).toBe(true)
      expect(isError(f(['x'], true, 'a'))).toBe(true)
    })

    it('a lone destructured parameter takes one object (named by the metadata)', () => {
      const d = wrapped(
        'function d({ w: 0, h: 0 }) { return w * h }',
        'd',
        (o) => o.w * o.h
      )
      expect(d({ w: 2, h: 3 })).toBe(6)
      expect(isError(d({ w: 'x', h: 3 }))).toBe(true)
    })

    it('a destructured parameter beside others (#3443) lines up by position', () => {
      const area3 = wrapped(
        'function area3({ w: 0, h = 2 }, k: 0) { return w * h + k }',
        'area3',
        (o, k) => o.w * (o.h ?? 2) + k
      )
      expect(area3({ w: 2, h: 3 }, 1)).toBe(7)
      expect(area3({ w: 2 }, 1)).toBe(5)
      expect(isError(area3({ w: 'x' }, 1))).toBe(true)
    })

    it('a named Type cannot be resolved from metadata: passed, and recorded', () => {
      const f = wrapped(
        // A name per variant: the notice is recorded once per site per PROCESS, so a shared
        // name let whichever row ran first take the only record (randomized order found it).
        `Type P_${source} { example: { x: 0 } }\nfunction usesP(p: P_${source}) { return 1 }`,
        'usesP',
        () => 'ok'
      )
      expect(f({ x: 1 })).toBe('ok')
      // The module's own ring: it always has the notice, whatever another test left on
      // the global (the mirror into an installed instance is pinned below).
      const notes = records({ severity: 'notice' }).map((r: any) => r.message)
      expect(
        notes.some((m: string) => m.includes(`named Type 'P_${source}'`))
      ).toBe(true)
    })
  })
}

/**
 * The module-level recorder mirrors into an installed instance (CI found this by test order):
 * `wrap()` records into the runtime module's own ring, and with `globalThis.__tjs =
 * createRuntime()` (the documented setup) nothing read that ring, so the notice was lost.
 * Instances already mirrored into the global; the module recorder was the one sink without.
 */
describe('a module-level notice reaches an installed runtime instance', () => {
  it('is visible through globalThis.__tjs.records()', () => {
    const g = globalThis as any
    const prev = g.__tjs
    g.__tjs = createRuntime()
    try {
      const f = wrap(
        () => 'ok',
        metaOf(
          'Type Q { example: { x: 0 } }\nfunction usesQ(q: Q) { return 1 }',
          'usesQ'
        ).types
      )
      expect(f({ x: 1 })).toBe('ok')
      const notes = g.__tjs
        .records({ severity: 'notice' })
        .map((r: any) => r.message)
      expect(notes.some((m: string) => m.includes("named Type 'Q'"))).toBe(true)
    } finally {
      g.__tjs = prev
    }
  })

  it('and installRuntime() (the module itself on the global) does not loop', () => {
    const g = globalThis as any
    const prev = g.__tjs
    g.__tjs = undefined
    try {
      installRuntime()
      record({ source: 'app', severity: 'notice', message: 'once' })
      expect(
        records({ source: 'app' }).filter((r) => r.message === 'once').length
      ).toBe(1)
    } finally {
      g.__tjs = prev
    }
  })
})

/**
 * The emitted `__tjs` keeps what a descriptor says, not only its kind: `serializeType` copied
 * a fixed field list that left out `typeName` (so a `declared` type did not say which), the
 * `unresolved` text, and a function type's signature.
 */
describe("emitted __tjs keeps a descriptor's content", () => {
  it('matches tjs().types for named, function and degraded types', () => {
    const { types, emitted } = metaOf(
      `Type R { example: { x: 0 } }
function f(r: R, cb: (n: 0) => '', s: Foo.Bar) { return 1 }`,
      'f'
    )
    const strip = (t: any): any =>
      JSON.parse(JSON.stringify(t, (k, v) => (k === 'loc' ? undefined : v)))
    for (const k of ['r', 'cb', 's'])
      expect(strip(emitted.params[k].type)).toEqual(strip(types.params[k].type))
    expect(emitted.params.r.type.typeName).toBe('R')
  })
})
