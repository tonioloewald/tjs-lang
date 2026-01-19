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

import { validate, s, type Base, type JSONSchema } from 'tosijs-schema'

/** Schema can be a tosijs-schema builder or a raw JSON Schema object */
type Schema = Base<any> | JSONSchema

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

/**
 * Create a union type
 *
 * Two forms:
 *   Union(...types: RuntimeType[]) - combine existing types
 *   Union(description, values) - create literal union from values
 *
 * @example
 * // From RuntimeTypes
 * const StringOrNumber = Union(TString, TNumber)
 *
 * // From literal values (used by TJS syntax)
 * const Direction = Union('cardinal direction', ['up', 'down', 'left', 'right'])
 */
export function Union<T extends unknown[]>(
  descriptionOrType: string | RuntimeType,
  valuesOrType?: T | RuntimeType,
  ...restTypes: RuntimeType[]
): RuntimeType {
  // New form: Union(description, values[])
  if (typeof descriptionOrType === 'string' && Array.isArray(valuesOrType)) {
    const description = descriptionOrType
    const values = valuesOrType as unknown[]
    const valueSet = new Set(values)

    const result: RuntimeType & { values: unknown[] } = {
      description,
      check: (v: unknown): v is T[number] => valueSet.has(v),
      __runtimeType: true as const,
      values, // Expose values for introspection
    }
    return result
  }

  // Old form: Union(...types: RuntimeType[])
  const types: RuntimeType[] = []
  if (isRuntimeType(descriptionOrType)) {
    types.push(descriptionOrType)
  }
  if (isRuntimeType(valuesOrType)) {
    types.push(valuesOrType as RuntimeType)
  }
  types.push(...restTypes)

  const description = types.map((t) => t.description).join(' | ')
  return Type(description, (v) => types.some((t) => t.check(v)))
}

/** Create an array type */
export function TArray<T>(itemType: RuntimeType<T>): RuntimeType<T[]> {
  return Type<T[]>(
    `array of ${itemType.description}`,
    (v) => Array.isArray(v) && v.every((item) => itemType.check(item))
  )
}

// ============================================================================
// Generic Types
// ============================================================================

/** Type parameter - can be a RuntimeType, schema, or example value */
export type TypeParam = RuntimeType | Base<any> | JSONSchema | unknown

/** Generic type factory */
export interface GenericType<TParams extends string[] = string[]> {
  /** Instantiate the generic with concrete type arguments */
  (...typeArgs: TypeParam[]): RuntimeType
  /** The type parameter names */
  readonly params: TParams
  /** Description template */
  readonly description: string
}

/**
 * Convert a type param to a check function
 */
function typeParamToCheck(param: TypeParam): (value: unknown) => boolean {
  if (isRuntimeType(param)) {
    return (v) => param.check(v)
  }
  // Check if it's a schema builder (has .schema property)
  if (param && typeof param === 'object' && 'schema' in param) {
    return (v) => validate(v, param as Base<any>)
  }
  // It's an example value - infer schema using s.infer
  const schema = s.infer(param)
  return (v) => validate(v, schema)
}

/**
 * Create a generic (parameterized) type factory
 *
 * @param params Array of type parameter names, with optional defaults: ['T', ['U', defaultSchema]]
 * @param predicate Function receiving (value, ...typeChecks) where typeChecks are validation functions
 * @param description Human-readable description template (type params will be substituted)
 *
 * @example
 * // Pair<T, U>
 * const Pair = Generic(
 *   ['T', 'U'],
 *   (x, checkT, checkU) =>
 *     Array.isArray(x) && x.length === 2 && checkT(x[0]) && checkU(x[1]),
 *   'Pair<T, U>'
 * )
 *
 * // Usage: Pair(TString, TNumber) creates a type for [string, number]
 * // Or with examples: Pair('', 0)
 */
export function Generic<TParams extends string[]>(
  params: (string | [string, TypeParam])[],
  predicate: (
    value: unknown,
    ...typeChecks: Array<(v: unknown) => boolean>
  ) => boolean,
  description: string
): GenericType<TParams> {
  // Extract param names and defaults
  const paramNames: string[] = []
  const defaults: (TypeParam | undefined)[] = []

  for (const p of params) {
    if (typeof p === 'string') {
      paramNames.push(p)
      defaults.push(undefined)
    } else {
      paramNames.push(p[0])
      defaults.push(p[1])
    }
  }

  // The factory function
  const factory = (...typeArgs: TypeParam[]): RuntimeType => {
    // Resolve type arguments, using defaults where not provided
    const checks = paramNames.map((_, i) => {
      const arg = i < typeArgs.length ? typeArgs[i] : defaults[i]
      if (arg === undefined) {
        // No arg and no default - accept anything
        return () => true
      }
      return typeParamToCheck(arg)
    })

    // Build description with substituted types
    let desc = description
    paramNames.forEach((name, i) => {
      const arg = i < typeArgs.length ? typeArgs[i] : defaults[i]
      let typeStr = 'any'
      if (isRuntimeType(arg)) {
        typeStr = arg.description
      } else if (arg !== undefined) {
        typeStr = typeof arg === 'string' ? 'string' : JSON.stringify(arg)
      }
      desc = desc.replace(new RegExp(`\\b${name}\\b`, 'g'), typeStr)
    })

    return Type(desc, (value) => predicate(value, ...checks))
  }

  ;(factory as any).params = paramNames as TParams
  ;(factory as any).description = description

  return factory as GenericType<TParams>
}

// ============================================================================
// Built-in Generic Types
// ============================================================================

/** Pair<T, U> - 2-element tuple */
export const TPair = Generic(
  ['T', 'U'],
  (x, checkT, checkU) =>
    Array.isArray(x) && x.length === 2 && checkT(x[0]) && checkU(x[1]),
  'Pair<T, U>'
)

/** Record<V> - object with string keys and values of type V */
export const TRecord = Generic(
  ['V'],
  (x, checkV) =>
    typeof x === 'object' &&
    x !== null &&
    !Array.isArray(x) &&
    Object.values(x).every(checkV),
  'Record<string, V>'
)

// ============================================================================
// Enum Types
// ============================================================================

/** Enum type with bidirectional lookup */
export interface EnumType<
  T extends Record<string, string | number> = Record<string, string | number>
> extends RuntimeType<T[keyof T]> {
  /** The enum members as { Name: value } */
  readonly members: T
  /** Reverse lookup: value -> name */
  readonly names: Record<string | number, string>
  /** Get all valid values */
  readonly values: Array<T[keyof T]>
  /** Get all member names */
  readonly keys: Array<keyof T>
}

/**
 * Create an enum type with bidirectional lookup
 *
 * @param description Human-readable description
 * @param members Object mapping names to values { Pending: 0, Active: 1 }
 *
 * @example
 * const Status = Enum('task status', { Pending: 0, Active: 1, Done: 2 })
 * Status.check(0)        // true
 * Status.check('done')   // false
 * Status.members.Pending // 0
 * Status.names[0]        // 'Pending'
 * Status.values          // [0, 1, 2]
 * Status.keys            // ['Pending', 'Active', 'Done']
 *
 * const Color = Enum('CSS color', { Red: 'red', Green: 'green', Blue: 'blue' })
 * Color.check('red')     // true
 * Color.members.Red      // 'red'
 */
export function Enum<T extends Record<string, string | number>>(
  description: string,
  members: T
): EnumType<T> {
  const values = Object.values(members) as Array<T[keyof T]>
  const valueSet = new Set(values)
  const keys = Object.keys(members) as Array<keyof T>

  // Build reverse lookup
  const names: Record<string | number, string> = {}
  for (const [key, value] of Object.entries(members)) {
    names[value] = key
  }

  const enumType: EnumType<T> = {
    description,
    check: (v: unknown): v is T[keyof T] => valueSet.has(v as T[keyof T]),
    __runtimeType: true as const,
    members,
    names,
    values,
    keys,
  }

  return enumType
}
