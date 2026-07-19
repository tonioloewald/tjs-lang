/**
 * Stage 1 of dictionary defaults (docs/dictionary-defaults.md): the
 * TjsDictDefaults MODE — merge-on-partial for `=` object-literal params,
 * emitted as shape-specialized code (Spike B conclusion).
 *
 * `(args = {x: 0, y: 0})` in NATIVE tjs now has WebIDL-dictionary semantics:
 * each member individually defaulted, partial payloads merged per-member
 * (recursively), members type-checked, excess keys stripped with a
 * flight-recorder notice (once per site), prototype-pollution keys rejected.
 * The end-to-end twin of the Spike A table suite
 * (experiments/dictionary-defaults/merge.demo.test.ts).
 *
 * MODE GATE (spec §3, PRINCIPLES.md): under `dialect: 'js'` and `TjsCompat`
 * the JS-legal `=` form keeps plain-JS atomic semantics EXACTLY — those tests
 * are the subset-invariant guards here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { tjs } from './index'
import { createRuntime, isMonadicError } from './runtime'

let savedTjs: any
beforeAll(() => {
  savedTjs = (globalThis as any).__tjs
  ;(globalThis as any).__tjs = createRuntime()
})
afterAll(() => {
  ;(globalThis as any).__tjs = savedTjs
})

const compile = (src: string, name: string, opts?: any) => {
  const { code } = tjs(src, opts)
  return new Function(code + `\nreturn ${name}`)()
}

const FLAT = `function place(args = {x: 0, y: 0}) { return args }`
const NESTED = `function move(args = {pos: {x: 0, y: 0}, label: ''}) { return args }`

describe('dictionary defaults — the TjsDictDefaults mode (Stage 1)', () => {
  describe('merge-on-partial (native tjs)', () => {
    it('partial payload merges per member (the headline)', () => {
      const place = compile(FLAT, 'place')
      expect(place({ x: 5 })).toEqual({ x: 5, y: 0 })
      expect(place({ y: 7 })).toEqual({ x: 0, y: 7 })
    })

    it('no-arg and explicit-undefined get the full default, fresh per call', () => {
      const place = compile(FLAT, 'place')
      const a = place()
      const b = place(undefined)
      expect(a).toEqual({ x: 0, y: 0 })
      expect(b).toEqual({ x: 0, y: 0 })
      expect(a).not.toBe(b) // fresh object per call — mutation cannot leak
    })

    it('present-undefined member fills (treated as absent)', () => {
      const place = compile(FLAT, 'place')
      expect(place({ x: undefined, y: 3 })).toEqual({ x: 0, y: 3 })
    })

    it('falsy present members win over defaults', () => {
      const f = compile(
        `function f(args = {n: 5, s: 'hi', b: true}) { return args }`,
        'f'
      )
      expect(f({ n: 0, s: '', b: false })).toEqual({ n: 0, s: '', b: false })
    })

    it('complete payload returns BY REFERENCE (I3 — zero allocation)', () => {
      const place = compile(FLAT, 'place')
      const full = { x: 1, y: 2 }
      expect(place(full)).toBe(full)
    })

    it('wrong member type is a MonadicError with a precise path', () => {
      const place = compile(FLAT, 'place')
      const r = place({ x: 'five' })
      expect(isMonadicError(r)).toBe(true)
      expect(r.path).toContain('place.args.x')
    })

    it('non-object payload errors at the param path', () => {
      const place = compile(FLAT, 'place')
      expect(isMonadicError(place(5))).toBe(true)
      expect(isMonadicError(place([1, 2]))).toBe(true)
      expect(isMonadicError(place(null))).toBe(true)
    })

    it('example-null member: fills null when absent, admits any value', () => {
      const f = compile(
        `function f(args = {parent: null, n: 1}) { return args }`,
        'f'
      )
      expect(f({ n: 2 })).toEqual({ parent: null, n: 2 })
      expect(f({ parent: { id: 1 }, n: 2 })).toEqual({
        parent: { id: 1 },
        n: 2,
      })
      expect(f({ parent: null, n: 2 })).toEqual({ parent: null, n: 2 })
    })
  })

  describe('recursion', () => {
    it('nested partial merges per key, per level', () => {
      const move = compile(NESTED, 'move')
      expect(move({ pos: { x: 5 } })).toEqual({
        pos: { x: 5, y: 0 },
        label: '',
      })
    })

    it('nested wrong type errors with the nested path', () => {
      const move = compile(NESTED, 'move')
      const r = move({ pos: { x: 'five' } })
      expect(isMonadicError(r)).toBe(true)
      expect(r.path).toContain('move.args.pos.x')
    })

    it('nested non-object errors at the member path', () => {
      const move = compile(NESTED, 'move')
      for (const pos of [5, null, [1]]) {
        const r = move({ pos })
        expect(isMonadicError(r)).toBe(true)
        expect(r.path).toContain('move.args.pos')
      }
    })

    it('complete nested payload stays by-reference', () => {
      const move = compile(NESTED, 'move')
      const full = { pos: { x: 1, y: 2 }, label: 'go' }
      expect(move(full)).toBe(full)
    })

    it('filled nested defaults are FRESH per call (no cross-call aliasing)', () => {
      const move = compile(NESTED, 'move')
      const first = move({ label: 'a' })
      first.pos.x = 999
      const second = move({ label: 'b' })
      expect(second.pos.x).toBe(0) // the template cannot be corrupted
    })
  })

  describe('arrays are values', () => {
    const SRC = `function tag(args = {tags: [''], n: 0}) { return args }`

    it('payload array replaces the default wholesale; absent fills fresh', () => {
      const tag = compile(SRC, 'tag')
      expect(tag({ n: 1, tags: ['x', 'y'] })).toEqual({
        n: 1,
        tags: ['x', 'y'],
      })
      const filled = tag({ n: 1 })
      expect(filled.tags).toEqual([''])
      filled.tags.push('mutated')
      expect(tag({ n: 2 }).tags).toEqual(['']) // fresh fill each call
    })

    it('array elements are checked against the example element', () => {
      const tag = compile(SRC, 'tag')
      const r = tag({ tags: ['ok', 42], n: 1 })
      expect(isMonadicError(r)).toBe(true)
    })
  })

  describe('excess keys: strip + flight-recorder notice (spec §5.4)', () => {
    it('excess keys are stripped from the result', () => {
      const place = compile(FLAT, 'place')
      const out = place({ x: 1, y: 2, treshold: 0.5 })
      expect(isMonadicError(out)).toBe(false)
      expect(out).toEqual({ x: 1, y: 2 })
      expect('treshold' in out).toBe(false)
    })

    it('stripping records a notice ONCE per site, and never changes behavior', () => {
      const rt = (globalThis as any).__tjs
      rt.clearRecords?.()
      // The once-guard is keyed by source site (file:line:fn.param). Under the
      // test harness every compile of FLAT shares the '<source>' placeholder
      // site, so an earlier test already tripped it — reset for a clean read.
      delete (globalThis as any).__tjsDDNoticed
      const place = compile(FLAT, 'place')
      place({ x: 1, y: 2, extra: 1 })
      place({ x: 1, y: 2, extra: 2 }) // second call: no second record
      const notices = (rt.records?.({ severity: 'notice' }) ?? []).filter(
        (r: any) => String(r.message).includes('extra')
      )
      expect(notices.length).toBe(1)
    })

    it('prototype-pollution keys are rejected outright', () => {
      const place = compile(FLAT, 'place')
      const payload = JSON.parse('{"x":1,"y":2,"__proto__":{"polluted":1}}')
      const r = place(payload)
      expect(isMonadicError(r)).toBe(true)
      expect(({} as any).polluted).toBeUndefined()
    })
  })

  describe('invariants', () => {
    it('I1: never writes the payload (deep-frozen payload works)', () => {
      const move = compile(NESTED, 'move')
      const frozen = Object.freeze({ pos: Object.freeze({ x: 5 }), label: 'a' })
      const out = move(frozen as any)
      expect(out).toEqual({ pos: { x: 5, y: 0 }, label: 'a' })
      expect((frozen as any).pos.y).toBeUndefined() // untouched
    })
  })

  describe('purity restriction (spec §6.1)', () => {
    it('an impure member in an object-literal default is a COMPILE error', () => {
      expect(() =>
        tjs(`function f(args = {x: mkX(), y: 0}) { return args }`)
      ).toThrow(/pure literal|dictionary default/i)
    })

    it('a non-literal default is NOT claimed by the feature (OQ4)', () => {
      // `args = live` is not an object literal — plain JS semantics, no error.
      const f = compile(
        `const live = { a: 1 }
function g(args = live) { return args }`,
        'g'
      )
      expect(f()).toEqual({ a: 1 })
      expect(f({ b: 2 })).toEqual({ b: 2 }) // atomic JS default, untouched
    })

    it('non-dictionary defaults keep JS semantics (OQ4)', () => {
      const f = compile(
        `function h(x = 0, list = []) { return { x, list } }`,
        'h'
      )
      expect(f()).toEqual({ x: 0, list: [] })
      expect(f(5)).toEqual({ x: 5, list: [] })
    })
  })

  describe('MODE GATE — dialect js / TjsCompat keep plain-JS semantics', () => {
    it("dialect: 'js' — atomic defaults, no merge, no member checks, no purity error", () => {
      const f = compile(FLAT, 'place', { dialect: 'js' })
      expect(f({ x: 5 })).toEqual({ x: 5 }) // y stays undefined — the JS footgun, preserved
      expect(f({ x: 's' })).toEqual({ x: 's' })
      expect(f()).toEqual({ x: 0, y: 0 })
      // impure default: legal JS, must stay legal
      expect(() =>
        tjs(`function f2(args = {x: Date.now()}) { return args }`, {
          dialect: 'js',
        })
      ).not.toThrow()
    })

    it('TjsCompat directive disables the mode', () => {
      const f = compile(`TjsCompat\n${FLAT}`, 'place')
      expect(f({ x: 5 })).toEqual({ x: 5 })
    })
  })
})

describe('deep-partial .d.ts for dictionary-default params (Stage 3)', () => {
  it('native: caller-facing type is deep-partial (members optional, recursively)', async () => {
    const { generateDTS } = await import('./index')
    const src = `export function place(args = {pos: {x: 0, y: 0}, label: ''}) { return args }`
    const result = tjs(src)
    const dts = generateDTS(result as any, src)
    // A caller passing {pos: {x: 5}} is valid tjs — the dts must admit it.
    expect(dts).toContain(
      'args?: { pos?: { x?: number; y?: number }; label?: string }'
    )
  })

  it("dialect 'js': members stay required (atomic JS default — partial is NOT valid)", async () => {
    const { generateDTS } = await import('./index')
    const src = `export function place(args = {pos: {x: 0, y: 0}, label: ''}) { return args }`
    const result = tjs(src, { dialect: 'js' })
    const dts = generateDTS(result as any, src)
    expect(dts).toContain(
      'args?: { pos: { x: number; y: number }; label: string }'
    )
  })
})
