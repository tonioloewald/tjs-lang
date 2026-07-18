/**
 * Spike A table suite — the executable form of docs/dictionary-defaults.md §5/§7.
 *
 * Every semantic rule in the spec appears here as a table row or an invariant
 * test. Exit criterion (spec §10): OQ2–OQ4 resolved by evidence from this
 * table. The suite is written to survive into the Stage 2 implementation —
 * only the import should change.
 *
 * Also encodes the MODE GATE contract (§3): what plain-JS semantics produce
 * for the same calls, as the behavior `dialect: 'js'` must preserve.
 */
import { describe, it, expect } from 'bun:test'
import {
  buildDescriptor,
  merge,
  required,
  MergeError,
  type ExcessPolicy,
} from './merge'

const STRIP = { excess: 'strip' as ExcessPolicy }

/** Template used throughout — nested, mixed kinds, an array, a nullable. */
const template = {
  pos: { x: 0, y: 0 },
  label: '',
  tags: ['a'],
  parent: null, // §5.2: example null ⇒ admits null (nullable any)
  visible: true,
}
const descriptor = buildDescriptor(template)

const m = (payload: any, options: any = STRIP) =>
  merge(descriptor, template, payload, options)

describe('spike A: dictionary defaults (docs/dictionary-defaults.md)', () => {
  describe('§5.2 trigger matrix — absent / undefined / null / present', () => {
    const rows: Array<{
      name: string
      payload: any
      expectKey: string
      expectValue: any
    }> = [
      {
        name: 'absent key fills',
        payload: { label: 'hi' },
        expectKey: 'visible',
        expectValue: true,
      },
      {
        name: 'present-undefined fills (treated as absent)',
        payload: { visible: undefined, label: 'hi' },
        expectKey: 'visible',
        expectValue: true,
      },
      {
        name: 'present value wins over default',
        payload: { visible: false },
        expectKey: 'visible',
        expectValue: false,
      },
      {
        name: 'falsy present values win (0)',
        payload: { pos: { x: 0, y: 9 } },
        expectKey: 'pos',
        expectValue: { x: 0, y: 9 },
      },
      {
        name: "falsy present values win ('')",
        payload: { label: '' },
        expectKey: 'label',
        expectValue: '',
      },
      {
        name: 'null is a real value where admitted',
        payload: { parent: null },
        expectKey: 'parent',
        expectValue: null,
      },
      {
        name: 'nullable member accepts non-null too (example-null ⇒ any)',
        payload: { parent: { id: 1 } },
        expectKey: 'parent',
        expectValue: { id: 1 },
      },
    ]
    for (const row of rows) {
      it(row.name, () => {
        const out = m(row.payload)
        expect(out).not.toBeInstanceOf(MergeError)
        expect((out as any)[row.expectKey]).toEqual(row.expectValue)
      })
    }

    it('null where NOT admitted is a type error, never silently replaced', () => {
      const out = m({ label: null })
      expect(out).toBeInstanceOf(MergeError)
      expect((out as MergeError).path).toBe('args.label')
    })

    it('present wrong-type member errors with a path', () => {
      const out = m({ visible: 'yes' })
      expect(out).toBeInstanceOf(MergeError)
      expect((out as MergeError).message).toContain("'args.visible'")
    })
  })

  describe('§5.3 recursion — per-key, per-level; arrays are values', () => {
    it('nested partial merges per key (the spec headline example)', () => {
      const out = m({ pos: { x: 5 } })
      expect(out).toEqual({
        pos: { x: 5, y: 0 },
        label: '',
        tags: ['a'],
        parent: null,
        visible: true,
      })
    })

    it('deep nesting merges at every level', () => {
      const t = { a: { b: { c: 1, d: 2 }, e: 3 } }
      const out = merge(buildDescriptor(t), t, { a: { b: { c: 9 } } }, STRIP)
      expect(out).toEqual({ a: { b: { c: 9, d: 2 }, e: 3 } })
    })

    it('payload arrays REPLACE default arrays wholesale (no index merge)', () => {
      const out = m({ tags: ['x', 'y', 'z'] })
      expect((out as any).tags).toEqual(['x', 'y', 'z'])
      const out2 = m({ tags: [] })
      expect((out2 as any).tags).toEqual([]) // shorter than default: still wholesale
    })

    it('array elements are checked against the example element', () => {
      const out = m({ tags: ['ok', 42] })
      expect(out).toBeInstanceOf(MergeError)
      expect((out as MergeError).path).toBe('args.tags[1]')
    })

    it('nested wrong shape errors with a nested path', () => {
      const out = m({ pos: { x: 'five' } })
      expect(out).toBeInstanceOf(MergeError)
      expect((out as MergeError).path).toBe('args.pos.x')
    })
  })

  describe('§5.4 excess keys — the three candidate policies (OQ2 evidence)', () => {
    it("'strip': result has exactly the declared shape; hook sees each key", () => {
      const seen: string[] = []
      const out = merge(
        descriptor,
        template,
        { label: 'hi', treshold: 0.5 }, // the classic typo
        { excess: 'strip', onExcess: (p) => seen.push(p) }
      )
      expect(out).not.toBeInstanceOf(MergeError)
      expect('treshold' in (out as any)).toBe(false)
      expect(seen).toEqual(['args.treshold']) // the flight-recorder seam
    })

    it("'error': excess key is a type error with its path", () => {
      const out = m({ label: 'hi', treshold: 0.5 }, { excess: 'error' })
      expect(out).toBeInstanceOf(MergeError)
      expect((out as MergeError).path).toBe('args.treshold')
    })

    it("'passthrough': excess keys survive into the result", () => {
      const out = m({ label: 'hi', treshold: 0.5 }, { excess: 'passthrough' })
      expect((out as any).treshold).toBe(0.5)
    })

    it("'strip' on a COMPLETE payload still strips (shape guarantee beats I3)", () => {
      const full = {
        pos: { x: 1, y: 2 },
        label: 'l',
        tags: ['t'],
        parent: null,
        visible: false,
        extra: 1,
      }
      const out = m(full)
      expect(out).not.toBe(full) // stripping forces a fresh object
      expect('extra' in (out as any)).toBe(false)
    })
  })

  describe('§5.5 top-level absence', () => {
    it('no payload ⇒ fresh full default, not the template itself', () => {
      const out = m(undefined)
      expect(out).toEqual(template)
      expect(out).not.toBe(template)
      expect((out as any).pos).not.toBe(template.pos) // I2 at the top level
    })
  })

  describe('§5.6 prototype safety', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      it(`rejects a payload carrying '${key}'`, () => {
        // JSON.parse is the realistic vector — a literal {__proto__: …} sets
        // the prototype instead of creating an own key.
        const payload = JSON.parse(`{"label":"hi","${key}":{"polluted":1}}`)
        const out = m(payload)
        expect(out).toBeInstanceOf(MergeError)
        expect(({} as any).polluted).toBeUndefined() // Object.prototype untouched
      })
    }

    it('non-enumerable and inherited keys do not participate', () => {
      const payload = Object.create({ inherited: 1 })
      payload.label = 'hi'
      Object.defineProperty(payload, 'hidden', { value: 2, enumerable: false })
      const out = m(payload)
      expect(out).not.toBeInstanceOf(MergeError)
      expect(
        'inherited' in (out as any) &&
          Object.prototype.hasOwnProperty.call(out, 'inherited')
      ).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(out, 'hidden')).toBe(false)
    })
  })

  describe('required members (OQ1 stand-in: required(example) wrapper)', () => {
    const rt = { id: required(''), retries: 3 }
    const rd = buildDescriptor(rt)

    it('absent required ⇒ error; present ⇒ type-checked', () => {
      const absent = merge(rd, rt, { retries: 1 }, STRIP)
      expect(absent).toBeInstanceOf(MergeError)
      expect((absent as MergeError).path).toBe('args.id')

      const wrong = merge(rd, rt, { id: 42 }, STRIP)
      expect(wrong).toBeInstanceOf(MergeError)

      const ok = merge(rd, rt, { id: 'abc' }, STRIP)
      expect(ok).toEqual({ id: 'abc', retries: 3 })
    })

    it('no-arg call with a required member ⇒ error (cannot default it)', () => {
      const out = merge(rd, rt, undefined, STRIP)
      expect(out).toBeInstanceOf(MergeError)
    })

    it('required-undefined is absent (fills nothing, errors)', () => {
      const out = merge(rd, rt, { id: undefined, retries: 1 }, STRIP)
      expect(out).toBeInstanceOf(MergeError)
    })

    it('required OBJECT member: presence required, nested defaults still fill', () => {
      const t2 = { conn: required({ host: '', port: 80 }) }
      const d2 = buildDescriptor(t2)
      expect(merge(d2, t2, {}, STRIP)).toBeInstanceOf(MergeError)
      expect(merge(d2, t2, { conn: { host: 'x' } }, STRIP)).toEqual({
        conn: { host: 'x', port: 80 },
      })
    })
  })

  describe('§7.4 invariants', () => {
    it('I1: never writes template or payload (both deep-frozen)', () => {
      const frozenTemplate = Object.freeze({
        pos: Object.freeze({ x: 0, y: 0 }),
        label: '',
        tags: Object.freeze(['a']),
      }) as any
      const fd = buildDescriptor(frozenTemplate)
      const frozenPayload = Object.freeze({
        pos: Object.freeze({ x: 5 }),
      }) as any
      // 'use strict' modules throw on frozen writes — completing without a
      // throw IS the assertion.
      const out = merge(fd, frozenTemplate, frozenPayload, STRIP)
      expect(out).toEqual({ pos: { x: 5, y: 0 }, label: '', tags: ['a'] })
    })

    it('I2: outputs never alias mutable template substructure', () => {
      const out = m({ label: 'hi' }) as any // pos + tags filled from template
      expect(out.pos).not.toBe(template.pos)
      expect(out.tags).not.toBe(template.tags)
      out.pos.x = 999
      out.tags.push('mutated')
      expect(template.pos.x).toBe(0)
      expect(template.tags).toEqual(['a'])
    })

    it('I3: complete valid payload returns BY REFERENCE (zero allocation)', () => {
      const full = {
        pos: { x: 1, y: 2 },
        label: 'l',
        tags: ['t'],
        parent: null,
        visible: false,
      }
      const out = m(full)
      expect(out).toBe(full) // identity, not equality — the hot path
    })

    it('I3 recursion: complete nested payloads stay by-reference too', () => {
      const inner = { x: 1, y: 2 }
      const full = {
        pos: inner,
        label: 'l',
        tags: ['t'],
        parent: null,
        visible: false,
      }
      const out = m(full) as any
      expect(out.pos).toBe(inner)
    })
  })

  describe('§3 mode gate — the JS semantics dialect:"js" must preserve (OQ4)', () => {
    it('plain JS: partial payload leaves members undefined (the footgun)', () => {
      // The behavior the mode REPLACES in native tjs, and must NOT touch in
      // dialect:'js'. Encoded so the gate has an executable reference.
      const jsPlace = (args = { x: 0, y: 0 }) => args
      expect(jsPlace({ x: 5 } as any)).toEqual({ x: 5 } as any)
      expect((jsPlace({ x: 5 } as any) as any).y).toBeUndefined()
    })

    it('plain JS: non-dictionary defaults are untouched by the feature', () => {
      // OQ4: (x = 0), (list = []) keep JS semantics — merge only triggers on
      // object-literal defaults. Nothing to merge here; reference behavior.
      const f = (x = 0, list: unknown[] = []) => ({ x, list })
      expect(f()).toEqual({ x: 0, list: [] })
      expect(f(5)).toEqual({ x: 5, list: [] })
    })
  })
})
