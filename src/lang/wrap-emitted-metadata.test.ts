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
import { wrap, isError } from './runtime'

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
      const g = globalThis as any
      const f = wrapped(
        'Type P { example: { x: 0 } }\nfunction usesP(p: P) { return 1 }',
        'usesP',
        () => 'ok'
      )
      expect(f({ x: 1 })).toBe('ok')
      const notes = (g.__tjs?.records?.({ severity: 'notice' }) ?? []).map(
        (r: any) => r.message
      )
      expect(notes.some((m: string) => m.includes("named Type 'P'"))).toBe(true)
    })
  })
}
