/* tjs <- input.ts */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  createRuntime,
  isMonadicError,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

let savedTjs

beforeAll(() => {
  savedTjs = globalThis.__tjs
  globalThis.__tjs = createRuntime()
})

afterAll(() => {
  globalThis.__tjs = savedTjs
})

/* line 31 */
function compile(src, name) {
  const { code } = tjs(src)
  return new Function(code + `\nreturn ${name}`)()
}
compile.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    name: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:31',
}

describe('member-level validation of colon-form object params (Stage 0)', () => {
  const place = () =>
    compile(`function place(args: {x: 0, y: 0}) { return args }`, 'place')
  it('missing member is a MonadicError with the member path', () => {
    const r = place()({ x: 5 })
    expect(isMonadicError(r)).toBe(true)
    expect(r.path).toContain('place.args.y')
    expect(r.message).toContain('integer')
  })
  it('wrong member type is a MonadicError with the member path', () => {
    const r = place()({ x: 'five', y: 0 })
    expect(isMonadicError(r)).toBe(true)
    expect(r.path).toContain('place.args.x')
  })
  it('complete valid payload passes through untouched', () => {
    const payload = { x: 5, y: 9 }
    expect(place()(payload)).toBe(payload)
  })
  it('EXCESS members are ignored (policy belongs to the merge mode, not Stage 0)', () => {
    const r = place()({ x: 1, y: 2, z: 99 })
    expect(isMonadicError(r)).toBe(false)
    expect(r.z).toBe(99)
  })
  it('non-object still errors at the param path (pre-existing behavior kept)', () => {
    const r = place()(5)
    expect(isMonadicError(r)).toBe(true)
    expect(r.path).toContain('place.args')
    expect(r.path).not.toContain('args.x')
  })
  describe('nested shapes', () => {
    const fn = () =>
      compile(
        `function move(args: {pos: {x: 0, y: 0}, label: ''}) { return args }`,
        'move'
      )
    it('missing nested member: path reaches into the nesting', () => {
      const r = fn()({ pos: { x: 1 }, label: 'a' })
      expect(isMonadicError(r)).toBe(true)
      expect(r.path).toContain('move.args.pos.y')
    })
    it('wrong nested member type', () => {
      const r = fn()({ pos: { x: 1, y: 'nope' }, label: 'a' })
      expect(isMonadicError(r)).toBe(true)
      expect(r.path).toContain('move.args.pos.y')
    })
    it('nested member not an object: errors at the nested path, no crash', () => {
      for (const pos of [5, null, [1, 2]]) {
        const r = fn()({ pos, label: 'a' })
        expect(isMonadicError(r)).toBe(true)
        expect(r.path).toContain('move.args.pos')
      }
    })
    it('fully valid nested payload passes', () => {
      const payload = { pos: { x: 1, y: 2 }, label: 'go' }
      expect(fn()(payload)).toBe(payload)
    })
  })
  describe('member kinds', () => {
    it('float member accepts floats and integers; string member rejects numbers', () => {
      const f = compile(
        `function cfg(args: {speed: 1.5, name: ''}) { return args }`,
        'cfg'
      )
      expect(isMonadicError(f({ speed: 2, name: 'a' }))).toBe(false)
      expect(isMonadicError(f({ speed: 2.5, name: 'a' }))).toBe(false)
      const r = f({ speed: 1.5, name: 42 })
      expect(isMonadicError(r)).toBe(true)
      expect(r.path).toContain('cfg.args.name')
    })
    it('array member: array-ness AND element types are checked', () => {
      const f = compile(
        `function tag(args: {tags: ['']}) { return args }`,
        'tag'
      )
      expect(isMonadicError(f({ tags: ['a', 'b'] }))).toBe(false)
      expect(isMonadicError(f({ tags: 'a' }))).toBe(true)
      expect(isMonadicError(f({ tags: ['a', 42] }))).toBe(true)
    })
  })
  describe('scope guards — what Stage 0 must NOT change', () => {
    it('`=` form keeps plain-JS semantics when the MODE is off (dialect js)', () => {
      const src = `function place2(args = {x: 0, y: 0}) { return args }`
      const { code } = tjs(src, { dialect: 'js' })
      const f = new Function(code + '\nreturn place2')()
      expect(f({ x: 5 })).toEqual({ x: 5 })
      expect(f({ x: 's' })).toEqual({ x: 's' })
      expect(f()).toEqual({ x: 0, y: 0 })
    })
    it('primitive colon params unchanged', () => {
      const f = compile(`function inc(n: 0) { return n + 1 }`, 'inc')
      expect(f(4)).toBe(5)
      expect(isMonadicError(f('4'))).toBe(true)
    })
  })
})
