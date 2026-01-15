/**
 * Type() - Runtime type definitions with descriptions and validation
 *
 * Forms:
 *   Type(description, predicate) - full form with custom validation
 *   Type(description, schema) - schema-based validation
 *   Type(schema) - schema only, self-documenting
 *
 * Usage:
 *   const ZipCode = Type('5-digit US zip code', (s) => /^\d{5}$/.test(s))
 *   const Email = Type('valid email', s.string.email)
 *   const Age = Type(s.number.min(0).max(150))
 *
 *   ZipCode.check('12345') // true
 *   ZipCode.check('abc') // false
 *   ZipCode.description // '5-digit US zip code'
 */

import { validate, type Schema } from 'tosijs-schema'

/** A runtime type with description and validation */
export interface RuntimeType<T = unknown> {
  /** Human-readable description of the type */
  readonly description: string
  /** Check if a value matches this type */
  check(value: unknown): value is T
  /** The underlying schema (if schema-based) */
  readonly schema?: Schema
  /** The predicate function (if predicate-based) */
  readonly predicate?: (value: unknown) => boolean
  /** Brand for type identification */
  readonly __runtimeType: true
}

/** Check if a value is a RuntimeType */
export function isRuntimeType(value: unknown): value is RuntimeType {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__runtimeType' in value &&
    (value as any).__runtimeType === true
  )
}

/**
 * Create a runtime type with description and validation
 *
 * @overload Type(description, predicate) - custom validation function
 * @overload Type(description, schema) - schema-based validation
 * @overload Type(schema) - schema only
 */
export function Type<T = unknown>(
  descriptionOrSchema: string | Schema,
  predicateOrSchema?: ((value: unknown) => boolean) | Schema
): RuntimeType<T> {
  // Parse arguments
  let description: string
  let predicate: ((value: unknown) => boolean) | undefined
  let schema: Schema | undefined

  if (typeof descriptionOrSchema === 'string') {
    // Form: Type(description, predicate) or Type(description, schema)
    description = descriptionOrSchema

    if (typeof predicateOrSchema === 'function') {
      // Type(description, predicate)
      predicate = predicateOrSchema
    } else if (predicateOrSchema !== undefined) {
      // Type(description, schema)
      schema = predicateOrSchema as Schema
    } else {
      throw new Error('Type(description) requires a predicate or schema')
    }
  } else {
    // Form: Type(schema)
    schema = descriptionOrSchema as Schema
    description = schemaToDescription(schema)
  }

  // Build the check function
  const check = (value: unknown): value is T => {
    if (predicate) {
      return predicate(value)
    }
    if (schema) {
      return validate(value, schema)
    }
    return false
  }

  return {
    description,
    check,
    schema,
    predicate,
    __runtimeType: true as const,
  }
}

/**
 * Generate a description from a schema
 */
function schemaToDescription(schema: Schema): string {
  // tosijs-schema wraps JSON schema in .schema property
  const jsonSchema = (schema as any)?.schema ?? schema

  // Handle schema objects with type property
  if (jsonSchema && typeof jsonSchema === 'object' && 'type' in jsonSchema) {
    const s = jsonSchema as any
    switch (s.type) {
      case 'string':
        if (s.format) return `string (${s.format})`
        if (s.pattern) return `string matching ${s.pattern}`
        if (s.minLength !== undefined && s.maxLength !== undefined)
          return `string (${s.minLength}-${s.maxLength} chars)`
        return 'string'
      case 'number':
      case 'integer':
        if (s.minimum !== undefined && s.maximum !== undefined)
          return `${s.type} (${s.minimum}-${s.maximum})`
        if (s.minimum !== undefined) return `${s.type} >= ${s.minimum}`
        if (s.maximum !== undefined) return `${s.type} <= ${s.maximum}`
        return s.type
      case 'boolean':
        return 'boolean'
      case 'array':
        return 'array'
      case 'object':
        return 'object'
      case 'null':
        return 'null'
    }
  }

  // Fallback
  return 'value'
}

// ============================================================================
// Built-in Types
// ============================================================================

/** String type */
export const TString = Type<string>('string', (v) => typeof v === 'string')

/** Number type */
export const TNumber = Type<number>('number', (v) => typeof v === 'number')

/** Boolean type */
export const TBoolean = Type<boolean>('boolean', (v) => typeof v === 'boolean')

/** Integer type */
export const TInteger = Type<number>(
  'integer',
  (v) => typeof v === 'number' && Number.isInteger(v)
)

/** Positive integer type */
export const TPositiveInt = Type<number>(
  'positive integer',
  (v) => typeof v === 'number' && Number.isInteger(v) && v > 0
)

/** Non-empty string type */
export const TNonEmptyString = Type<string>(
  'non-empty string',
  (v) => typeof v === 'string' && v.length > 0
)

/** Email type (basic validation) */
export const TEmail = Type<string>(
  'email address',
  (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
)

/** URL type */
export const TUrl = Type<string>('URL', (v) => {
  if (typeof v !== 'string') return false
  try {
    new URL(v)
    return true
  } catch {
    return false
  }
})

/** UUID type */
export const TUuid = Type<string>(
  'UUID',
  (v) =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
)

// ============================================================================
// Type Combinators
// ============================================================================

/** Create a nullable version of a type */
export function Nullable<T>(type: RuntimeType<T>): RuntimeType<T | null> {
  return Type<T | null>(
    `${type.description} or null`,
    (v) => v === null || type.check(v)
  )
}

/** Create an optional version of a type (nullable + undefined) */
export function Optional<T>(
  type: RuntimeType<T>
): RuntimeType<T | null | undefined> {
  return Type<T | null | undefined>(
    `${type.description} (optional)`,
    (v) => v === null || v === undefined || type.check(v)
  )
}

/** Create a union of types */
export function Union<T extends RuntimeType[]>(
  ...types: T
): RuntimeType<T[number] extends RuntimeType<infer U> ? U : never> {
  const description = types.map((t) => t.description).join(' | ')
  return Type(description, (v) => types.some((t) => t.check(v))) as any
}

/** Create an array type */
export function TArray<T>(itemType: RuntimeType<T>): RuntimeType<T[]> {
  return Type<T[]>(
    `array of ${itemType.description}`,
    (v) => Array.isArray(v) && v.every((item) => itemType.check(item))
  )
}
