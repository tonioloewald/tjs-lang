/**
 * TJS Schema - Runtime type system for Typed JavaScript
 *
 * Builds on tosijs-schema to provide:
 * - Schema(x) callable for inference by example
 * - Schema.type(x) for "fixed typeof" (null returns 'null', not 'object')
 * - All tosijs-schema methods (string, number, object, array, etc.)
 *
 * Usage:
 *   Schema('hello')        // Schema matching string
 *   Schema(42)             // Schema matching number (integer)
 *   Schema(null)           // Schema matching null
 *   Schema(undefined)      // Schema matching undefined
 *   Schema([1, 2, 3])      // Schema matching array of integers
 *   Schema({name: 'Anne'}) // Schema matching object with name: string
 *
 *   Schema.type(null)      // 'null' (not 'object' like typeof)
 *   Schema.type(undefined) // 'undefined'
 *   Schema.type([])        // 'array' (not 'object' like typeof)
 *
 *   Schema.null.validate(x)      // true if x is null
 *   Schema.undefined.validate(x) // true if x is undefined
 */

import { s, type Base } from 'tosijs-schema'

/**
 * Get the "fixed" type of a value - unlike typeof, correctly handles null and arrays
 */
function getType(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * Infer a schema from an example value
 * This wraps tosijs-schema's s.infer() for consistency
 */
function infer(value: unknown): Base<unknown> {
  return s.infer(value)
}

// The base callable function
function schemaCallable(value: unknown): Base<unknown> {
  return infer(value)
}

// Add our custom methods
schemaCallable.type = getType
schemaCallable.infer = infer

// Create the Schema callable that proxies to s for all other properties
type SchemaCallable = {
  (value: unknown): Base<unknown>
  type: (value: unknown) => string
  infer: (value: unknown) => Base<unknown>
} & typeof s

/**
 * Schema - callable for inference, with all tosijs-schema methods attached
 * Uses a Proxy to delegate property access to tosijs-schema's s object
 */
export const Schema: SchemaCallable = new Proxy(schemaCallable as any, {
  get(target, prop) {
    // Our custom methods take precedence
    if (prop === 'type') return getType
    if (prop === 'infer') return infer
    // Delegate everything else to tosijs-schema's s
    return (s as any)[prop]
  },
  apply(target, thisArg, args) {
    // Make it callable - Schema(value) infers schema
    return infer(args[0])
  },
})

// Re-export useful types from tosijs-schema
export type { Base, Infer } from 'tosijs-schema'
