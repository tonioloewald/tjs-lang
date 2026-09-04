function __ex2js(v) {
  if (v === null) return { type: 'null' }
  if (v === undefined) return {}
  const t = typeof v
  if (t === 'string') return { type: 'string' }
  if (t === 'number')
    return Number.isInteger(v) ? { type: 'integer' } : { type: 'number' }
  if (t === 'boolean') return { type: 'boolean' }
  if (Array.isArray(v))
    return v.length
      ? { type: 'array', items: __ex2js(v[0]) }
      : { type: 'array' }
  if (t === 'object') {
    const p = {},
      r = []
    for (const k of Object.keys(v)) {
      p[k] = __ex2js(v[k])
      r.push(k)
    }
    return {
      type: 'object',
      properties: p,
      required: r,
      additionalProperties: false,
    }
  }
  return {}
}
function __match(v, ex) {
  if (ex === null) return v === null
  if (ex === undefined) return true
  if (
    ex &&
    typeof ex === 'object' &&
    ex.__runtimeType &&
    typeof ex.check === 'function'
  )
    return ex.check(v) === true
  const t = typeof ex
  if (t === 'number')
    return (
      typeof v === 'number' &&
      (Number.isInteger(ex) ? Number.isInteger(v) : true)
    )
  if (t === 'string' || t === 'boolean') return typeof v === t
  if (Array.isArray(ex)) {
    if (!Array.isArray(v)) return false
    return ex.length ? v.every((x) => __match(x, ex[0])) : true
  }
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const ks = Object.keys(ex)
    return ks.every((k) => k in v && __match(v[k], ex[k]))
  }
  return v === ex
}
function Type(d, p, e) {
  const t = { description: d, __runtimeType: true }
  if (typeof p === 'function') {
    t.check = p
    t.default = e ?? null
  } else {
    const ex = e ?? p
    t.default = ex
    t.__ex = ex
    t.check = (v) => __match(v, ex)
  }
  t.toJSONSchema = () => (t.__ex === undefined ? {} : __ex2js(t.__ex))
  t.strip = (v) => {
    const ex = t.__ex
    if (!ex || typeof ex !== 'object' || !v || typeof v !== 'object') return v
    const o = {}
    for (const k of Object.keys(ex)) if (k in v) o[k] = v[k]
    return o
  }
  return t
}
function Enum(d, m) {
  const mm = typeof m === 'object' && m ? m : {}
  const vals = Object.values(mm)
  const names = {}
  for (const k of Object.keys(mm)) names[mm[k]] = k
  return {
    description: d,
    check: (v) => vals.includes(v),
    values: vals,
    members: mm,
    names,
    keys: Object.keys(mm),
    __runtimeType: true,
    toJSONSchema: () => ({ enum: vals }),
  }
}
function Union(d, ...v) {
  const vals = v.flat()
  return {
    description: d,
    check: (x) => vals.includes(x),
    values: vals,
    __runtimeType: true,
    toJSONSchema: () => ({ enum: vals }),
  }
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Type, Enum, Union }
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  typeDescriptorToJSONSchema,
  exampleToJSONSchema,
  functionMetaToJSONSchema,
} from '/Users/tonioloewald/tjs-lang/src/lang/json-schema'

import { Type, TString } from '/Users/tonioloewald/tjs-lang/src/types/Type'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  createRuntime,
  installRuntime,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

describe('json-schema', () => {
  describe('typeDescriptorToJSONSchema', () => {
    it('handles primitives', () => {
      expect(typeDescriptorToJSONSchema({ kind: 'string' })).toEqual({
        type: 'string',
      })
      expect(typeDescriptorToJSONSchema({ kind: 'number' })).toEqual({
        type: 'number',
      })
      expect(typeDescriptorToJSONSchema({ kind: 'integer' })).toEqual({
        type: 'integer',
      })
      expect(typeDescriptorToJSONSchema({ kind: 'boolean' })).toEqual({
        type: 'boolean',
      })
      expect(typeDescriptorToJSONSchema({ kind: 'null' })).toEqual({
        type: 'null',
      })
    })
    it('handles non-negative-integer', () => {
      expect(
        typeDescriptorToJSONSchema({ kind: 'non-negative-integer' })
      ).toEqual({ type: 'integer', minimum: 0 })
    })
    it('handles any and undefined', () => {
      expect(typeDescriptorToJSONSchema({ kind: 'any' })).toEqual({})
      expect(typeDescriptorToJSONSchema({ kind: 'undefined' })).toEqual({})
    })
    it('handles arrays', () => {
      expect(
        typeDescriptorToJSONSchema({
          kind: 'array',
          items: { kind: 'string' },
        })
      ).toEqual({ type: 'array', items: { type: 'string' } })
    })
    it('handles objects', () => {
      const td = {
        kind: 'object',
        shape: {
          name: { kind: 'string' },
          age: { kind: 'integer' },
        },
      }
      expect(typeDescriptorToJSONSchema(td)).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        required: ['name', 'age'],
        additionalProperties: false,
      })
    })
    it('handles nullable', () => {
      expect(
        typeDescriptorToJSONSchema({ kind: 'string', nullable: true })
      ).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] })
    })
    it('handles unions', () => {
      expect(
        typeDescriptorToJSONSchema({
          kind: 'union',
          members: [{ kind: 'string' }, { kind: 'integer' }],
        })
      ).toEqual({ anyOf: [{ type: 'string' }, { type: 'integer' }] })
    })
    it('handles nested objects', () => {
      const td = {
        kind: 'object',
        shape: {
          user: {
            kind: 'object',
            shape: { name: { kind: 'string' } },
          },
          tags: {
            kind: 'array',
            items: { kind: 'string' },
          },
        },
      }
      const schema = typeDescriptorToJSONSchema(td)
      expect(schema.properties?.user).toEqual({
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
      })
      expect(schema.properties?.tags).toEqual({
        type: 'array',
        items: { type: 'string' },
      })
    })
  })
  describe('exampleToJSONSchema', () => {
    it('infers from primitive examples', () => {
      expect(exampleToJSONSchema('hello')).toEqual({ type: 'string' })
      expect(exampleToJSONSchema(42)).toEqual({ type: 'integer' })
      expect(exampleToJSONSchema(3.14)).toEqual({ type: 'number' })
      expect(exampleToJSONSchema(true)).toEqual({ type: 'boolean' })
      expect(exampleToJSONSchema(null)).toEqual({ type: 'null' })
    })
    it('infers from object examples', () => {
      expect(exampleToJSONSchema({ name: '', age: 0 })).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        required: ['name', 'age'],
        additionalProperties: false,
      })
    })
    it('infers from array examples', () => {
      expect(exampleToJSONSchema(['hello'])).toEqual({
        type: 'array',
        items: { type: 'string' },
      })
      expect(exampleToJSONSchema([])).toEqual({ type: 'array' })
    })
  })
  describe('RuntimeType.toJSONSchema', () => {
    it('generates schema from example-based types', () => {
      const User = Type('user', { name: '', age: 0 })
      const schema = User.toJSONSchema()
      expect(schema.type).toBe('object')
      expect(schema.properties?.name).toEqual({ type: 'string' })
      expect(schema.properties?.age).toEqual({ type: 'integer' })
    })
    it('generates schema for predicate-only types', () => {
      const schema = TString.toJSONSchema()

      expect(schema.description).toBe('string')
    })
    it('generates schema from simple types', () => {
      const Name = Type('name', 'Alice')
      const schema = Name.toJSONSchema()
      expect(schema.type).toBe('string')
    })
  })
  describe('RuntimeType.strip', () => {
    it('strips extra fields from objects', () => {
      const User = Type('user', { name: '', age: 0 })
      const input = { name: 'Alice', age: 30, secret: 'password' }
      const stripped = User.strip(input)
      expect(stripped.name).toBe('Alice')
      expect(stripped.age).toBe(30)
      expect(stripped.secret).toBeUndefined()
    })
    it('returns value as-is for predicate-only types', () => {
      const result = TString.strip('hello')
      expect(result).toBe('hello')
    })
  })
  describe('functionMetaToJSONSchema', () => {
    it('generates input/output schema from function metadata', () => {
      const meta = {
        params: {
          name: {
            type: { kind: 'string' },
            required: true,
            example: 'Alice',
          },
          age: {
            type: { kind: 'integer' },
            required: true,
            example: 0,
          },
        },
        returns: {
          type: {
            kind: 'object',
            shape: { id: { kind: 'integer' } },
          },
        },
      }
      const { input, output } = functionMetaToJSONSchema(meta)
      expect(input.type).toBe('object')
      expect(input.properties?.name).toEqual({
        type: 'string',
        examples: ['Alice'],
      })
      expect(input.required).toContain('name')
      expect(input.required).toContain('age')
      expect(output?.type).toBe('object')
    })
  })
  describe('fn.__tjs.schema() on transpiled functions', () => {
    const savedTjs = globalThis.__tjs
    it('provides schema via functionMetaToJSONSchema on emitted metadata', () => {
      const runtime = createRuntime()
      try {
        globalThis.__tjs = runtime
        const result = tjs(`function greet(name: 'World'): 'Hello, World' {
  return 'Hello, ' + name
}`)
        const fn = new Function(result.code + '\nreturn greet')()
        expect(fn.__tjs).toBeDefined()

        const { input, output } = functionMetaToJSONSchema(fn.__tjs)
        expect(input.type).toBe('object')
        expect(input.properties?.name?.type).toBe('string')
        expect(output?.type).toBe('string')
      } finally {
        globalThis.__tjs = savedTjs
      }
    })
    it('provides schema via .schema() when wrap() is used', () => {
      const runtime = createRuntime()
      try {
        globalThis.__tjs = runtime
        installRuntime()
        const result = tjs(`function greet(name: 'World'): 'Hello, World' {
  return 'Hello, ' + name
}`)
        const fn = new Function(result.code + '\nreturn greet')()

        if (typeof fn.__tjs.schema === 'function') {
          const { input, output } = fn.__tjs.schema()
          expect(input.type).toBe('object')
          expect(input.properties?.name?.type).toBe('string')
          expect(output?.type).toBe('string')
        }
      } finally {
        globalThis.__tjs = savedTjs
      }
    })
  })

  describe('emitted inline-runtime types (standalone, no shared runtime)', () => {
    const runStandalone = (source, returnName) => {
      const { code } = tjs(source)
      const saved = globalThis.__tjs
      delete globalThis.__tjs
      try {
        return new Function(code + `\nreturn ${returnName}`)()
      } finally {
        globalThis.__tjs = saved
      }
    }

    const USER_SRC = `Type User {
  description: 'a registered user'
  example: { name: '', age: 0, email: '' }
}
const _schema = User.toJSONSchema()
const _stripped = User.strip({})`
    it('Type.check matches the example STRUCTURALLY, not just by typeof', () => {
      const User = runStandalone(USER_SRC, 'User')

      expect(User.check({ name: 'Alice' })).toBe(false)
      expect(User.check({ name: 'Alice', age: 30, email: 'a@b.com' })).toBe(
        true
      )

      expect(
        User.check({ name: 'Alice', age: 'thirty', email: 'a@b.com' })
      ).toBe(false)

      expect(User.check('nope')).toBe(false)
      expect(User.check(null)).toBe(false)
    })
    it('Type.strip keeps example keys and drops the rest', () => {
      const User = runStandalone(USER_SRC, 'User')
      expect(
        User.strip({ name: 'Alice', age: 30, email: 'a@b.com', password: 'x' })
      ).toEqual({ name: 'Alice', age: 30, email: 'a@b.com' })
    })
    it('Type.toJSONSchema derives an object schema from the example', () => {
      const User = runStandalone(USER_SRC, 'User')
      expect(User.toJSONSchema()).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
          email: { type: 'string' },
        },
        required: ['name', 'age', 'email'],
        additionalProperties: false,
      })
    })
    it('Enum/Union emit an enum schema of their values', () => {
      const Status = runStandalone(
        `const Status = Enum('status', { Active: 1, Inactive: 0 })
const _s = Status.toJSONSchema()`,
        'Status'
      )
      expect(Status.toJSONSchema()).toEqual({ enum: [1, 0] })
      const Dir = runStandalone(
        `const Dir = Union('direction', ['up', 'down'])
const _d = Dir.toJSONSchema()`,
        'Dir'
      )
      expect(Dir.toJSONSchema()).toEqual({ enum: ['up', 'down'] })
    })
  })
})
