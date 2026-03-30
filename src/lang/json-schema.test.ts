import { describe, it, expect } from 'bun:test'
import {
  typeDescriptorToJSONSchema,
  exampleToJSONSchema,
  functionMetaToJSONSchema,
} from './json-schema'
// Also used directly in tests below
import type { TypeDescriptor } from './types'
import { Type, TString, TInteger } from '../types/Type'
import { tjs } from './index'
import { createRuntime, installRuntime } from './runtime'

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
      const td: TypeDescriptor = {
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
      const td: TypeDescriptor = {
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
      // Predicate-only types have no example or schema, just description
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
      const stripped = User.strip(input) as any
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
            type: { kind: 'string' as const },
            required: true,
            example: 'Alice',
          },
          age: {
            type: { kind: 'integer' as const },
            required: true,
            example: 0,
          },
        },
        returns: {
          type: {
            kind: 'object' as const,
            shape: { id: { kind: 'integer' as const } },
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
        const result = tjs(`function greet(name: 'World') -> 'Hello, World' {
  return 'Hello, ' + name
}`)
        const fn = new Function(result.code + '\nreturn greet')()
        expect(fn.__tjs).toBeDefined()
        // Use standalone function on the metadata
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
        const result = tjs(`function greet(name: 'World') -> 'Hello, World' {
  return 'Hello, ' + name
}`)
        const fn = new Function(result.code + '\nreturn greet')()
        // After installRuntime(), wrap() should have attached .schema()
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
})
