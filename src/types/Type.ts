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

import { validate, filter as schemaFilter, s, type Base } from 'tosijs-schema'
import { exampleToJSONSchema, type JSONSchemaObject } from '../lang/json-schema'

/** JSON Schema object type (simplified) */
type JSONSchema = {
  type?: string
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  required?: string[]
  [key: string]: unknown
}

/** Schema can be a tosijs-schema builder or a raw JSON Schema object */
type Schema = Base<any> | JSONSchema

/** A runtime type with description and validation */
export interface RuntimeType<T = unknown> {
  /** Human-readable description of the type */
  readonly description: string
  /** Check if a value matches this type. Returns true on pass, false on fail, or a reason string on fail. */
  check(value: unknown): boolean | string
  /** The underlying schema (if schema-based) */
  readonly schema?: Schema
  /** The predicate function (if predicate-based). May return a reason string on failure. */
  readonly predicate?: (value: unknown) => boolean | string
  /** Example value (for documentation and signature testing) */
  readonly example?: T
  /** Multiple example values (from schema metadata, for autocomplete hints) */
  readonly examples?: T[]
  /** Default value (for instantiation) */
  readonly default?: T
  /** Generate JSON Schema for this type */
  toJSONSchema(): JSONSchemaObject
  /** Strip a value down to only the fields matching this type's schema */
  strip(value: unknown): unknown
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
/**
 * Check if a value is a tosijs-schema builder (has .schema property)
 */
function isSchemaBuilder(value: unknown): value is Base<any> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'schema' in value &&
    typeof (value as any).schema === 'object'
  )
}

/**
 * Check if a value looks like a raw JSON Schema object
 */
function isJSONSchema(value: unknown): value is JSONSchema {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof (value as any).type === 'string'
  )
}

export function Type<T = unknown>(
  descriptionOrSchema: string | Schema,
  predicateOrSchemaOrExample?:
    | ((value: unknown) => boolean | string)
    | Schema
    | T
    | undefined,
  exampleArg?: T,
  defaultArg?: T
): RuntimeType<T> {
  // Parse arguments
  let description: string
  let predicate: ((value: unknown) => boolean | string) | undefined
  let schema: Schema | undefined
  let example: T | undefined = exampleArg
  let defaultValue: T | undefined = defaultArg

  if (typeof descriptionOrSchema === 'string') {
    // Form: Type(description, predicate/schema/example, example?, default?)
    description = descriptionOrSchema

    if (typeof predicateOrSchemaOrExample === 'function') {
      // Type(description, predicate, example?, default?)
      predicate = predicateOrSchemaOrExample as (
        value: unknown
      ) => boolean | string
      // If we have example, infer schema from it for the type guard in predicate
      if (example !== undefined) {
        schema = s.infer(example)
      }
    } else if (
      predicateOrSchemaOrExample === undefined &&
      example !== undefined
    ) {
      // Type(description, undefined, example, default?) - example provides schema
      schema = s.infer(example)
    } else if (isSchemaBuilder(predicateOrSchemaOrExample)) {
      // Type(description, schemaBuilder)
      schema = predicateOrSchemaOrExample
    } else if (isJSONSchema(predicateOrSchemaOrExample)) {
      // Type(description, jsonSchema)
      schema = predicateOrSchemaOrExample
    } else if (predicateOrSchemaOrExample !== undefined) {
      // Type(description, example) - second arg is the example/default, infer schema
      // This is the simple form: Type('Name', 'Alice')
      example = predicateOrSchemaOrExample as T
      defaultValue = example // In simple form, example IS the default
      schema = s.infer(example)
    } else {
      throw new Error(
        'Type(description) requires a predicate, schema, or example'
      )
    }
  } else {
    // Form: Type(schema) or Type(schemaBuilder)
    if (isSchemaBuilder(descriptionOrSchema)) {
      schema = descriptionOrSchema
    } else {
      schema = descriptionOrSchema as Schema
    }
    description = schemaToDescription(schema)
  }

  // Extract examples from schema metadata (if any)
  let examples: T[] | undefined
  if (schema) {
    const jsonSchema = (schema as any)?.schema ?? schema
    if (
      jsonSchema &&
      typeof jsonSchema === 'object' &&
      Array.isArray((jsonSchema as any).examples)
    ) {
      examples = (jsonSchema as any).examples as T[]
    }
  }

  // If no explicit example was provided, use first schema example for autocomplete
  if (example === undefined && examples && examples.length > 0) {
    example = examples[0]
  }

  // Build the check function
  // Returns true on pass, false on fail, or a reason string on fail
  const check = (value: unknown): boolean | string => {
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
    example,
    examples,
    default: defaultValue,
    toJSONSchema(): JSONSchemaObject {
      // If we have an underlying JSON Schema or builder, extract it
      if (schema) {
        const raw = (schema as any)?.schema ?? schema
        if (raw && typeof raw === 'object' && 'type' in raw) {
          return raw as JSONSchemaObject
        }
      }
      // Fall back to inferring from example
      if (example !== undefined) {
        return exampleToJSONSchema(example)
      }
      // Predicate-only types: best-effort from description
      return { description }
    },
    strip(value: unknown): unknown {
      if (schema) {
        return schemaFilter(value, schema)
      }
      // No schema — can't strip, return as-is
      return value
    },
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
export const TString = Type<string>('string', (v: unknown) => {
  if (typeof v === 'string') return true
  return `expected string, got ${v === null ? 'null' : typeof v}`
})

/** Number type */
export const TNumber = Type<number>('number', (v: unknown) => {
  if (typeof v === 'number') return true
  return `expected number, got ${v === null ? 'null' : typeof v}`
})

/** Boolean type */
export const TBoolean = Type<boolean>('boolean', (v: unknown) => {
  if (typeof v === 'boolean') return true
  return `expected boolean, got ${v === null ? 'null' : typeof v}`
})

/** Integer type */
export const TInteger = Type<number>('integer', (v: unknown) => {
  if (typeof v !== 'number')
    return `expected integer, got ${v === null ? 'null' : typeof v}`
  if (!Number.isInteger(v)) return `${v} is not an integer`
  return true
})

/** Positive integer type */
export const TPositiveInt = Type<number>('positive integer', (v: unknown) => {
  if (typeof v !== 'number')
    return `expected positive integer, got ${v === null ? 'null' : typeof v}`
  if (!Number.isInteger(v)) return `${v} is not an integer`
  if (v <= 0) return `${v} is not positive`
  return true
})

/** Non-empty string type */
export const TNonEmptyString = Type<string>(
  'non-empty string',
  (v: unknown) => {
    if (typeof v !== 'string')
      return `expected string, got ${v === null ? 'null' : typeof v}`
    if (v.length === 0) return 'string is empty'
    return true
  }
)

/** Email type (basic validation) */
export const TEmail = Type<string>('email address', (v: unknown) => {
  if (typeof v !== 'string')
    return `expected string, got ${v === null ? 'null' : typeof v}`
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    return `"${v}" is not a valid email`
  return true
})

/**
 * Check if a string is a valid URL (portable helper for predicates)
 * This will become an AJS builtin
 */
export const isValidUrl = (v: string): boolean => {
  try {
    new URL(v)
    return true
  } catch {
    return false
  }
}

/** URL type */
export const TUrl = Type<string>('URL', (v: unknown) => {
  if (typeof v !== 'string')
    return `expected string, got ${v === null ? 'null' : typeof v}`
  if (!isValidUrl(v)) return `"${v}" is not a valid URL`
  return true
})

/** UUID type */
export const TUuid = Type<string>('UUID', (v: unknown) => {
  if (typeof v !== 'string')
    return `expected string, got ${v === null ? 'null' : typeof v}`
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  )
    return `"${v}" is not a valid UUID`
  return true
})

/**
 * Check if a string is a valid ISO 8601 timestamp (portable helper for predicates)
 * This will become an AJS builtin
 */
export const isValidTimestamp = (v: string): boolean => {
  const d = new Date(v)
  return !isNaN(d.getTime()) && v.includes('T')
}

/**
 * Check if a string is a valid YYYY-MM-DD date (portable helper for predicates)
 * This will become an AJS builtin
 */
export const isValidLegalDate = (v: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v + 'T00:00:00Z')
  return !isNaN(d.getTime())
}

/** ISO 8601 timestamp string (e.g., "2024-01-15T10:30:00Z") */
export const Timestamp = Type<string>(
  'ISO 8601 timestamp',
  (v: unknown) => typeof v === 'string' && isValidTimestamp(v)
)

/** Legal date string in YYYY-MM-DD format */
export const LegalDate = Type<string>(
  'date (YYYY-MM-DD)',
  (v: unknown) => typeof v === 'string' && isValidLegalDate(v)
)

// ============================================================================
// Type Combinators
// ============================================================================

/** Create a nullable version of a type */
export function Nullable<T>(type: RuntimeType<T>): RuntimeType<T | null> {
  return Type<T | null>(
    `${type.description} or null`,
    (v: unknown) => v === null || type.check(v) === true
  )
}

/** Create an optional version of a type (nullable + undefined) */
export function Optional<T>(
  type: RuntimeType<T>
): RuntimeType<T | null | undefined> {
  return Type<T | null | undefined>(
    `${type.description} (optional)`,
    (v: unknown) => v === null || v === undefined || type.check(v) === true
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
      toJSONSchema: () => ({
        enum: values,
      }),
      strip: (value: unknown) => value,
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
  return Type(description, (v: unknown) =>
    types.some((t) => t.check(v) === true)
  )
}

/** Create an array type */
export function TArray<T>(itemType: RuntimeType<T>): RuntimeType<T[]> {
  return Type<T[]>(
    `array of ${itemType.description}`,
    (v: unknown) =>
      Array.isArray(v) && v.every((item) => itemType.check(item) === true)
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
    return (v) => param.check(v) === true
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

    return Type(desc, (value: unknown) => predicate(value, ...checks))
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
    toJSONSchema: () => ({
      enum: values as unknown[],
    }),
    strip: (value: unknown) => value,
    __runtimeType: true as const,
    members,
    names,
    values,
    keys,
  }

  return enumType
}

// =============================================================================
// FunctionPredicate - Runtime type for function signatures
// =============================================================================

/** Return contract levels in order of strictness */
export type ReturnContract = 'assertReturns' | 'returns' | 'checkedReturns'

/** Specification for a FunctionPredicate */
export interface FunctionPredicateSpec {
  /** Parameter types as example values */
  params?: Record<string, any>
  /** Return type as example value */
  returns?: any
  /** Return contract level */
  returnContract?: ReturnContract
}

/** A runtime type that validates function signatures */
// eslint-disable-next-line @typescript-eslint/ban-types
export interface FunctionPredicateType extends RuntimeType<Function> {
  /** Parameter specification */
  readonly params: Record<string, any>
  /** Return type specification */
  readonly returns?: any
  /** Return contract level */
  readonly returnContract: ReturnContract
}

/** A generic FunctionPredicate factory — call with type args to get a FunctionPredicateType */
export interface GenericFunctionPredicateType {
  (...typeArgs: TypeParam[]): FunctionPredicateType
  /** Type parameter names */
  readonly typeParamNames: string[]
  /** Description */
  readonly description: string
  /** Marker for runtime type detection */
  readonly __runtimeType: true
}

/** Infer a TypeDescriptor kind from an example value */
function kindOfExample(example: unknown): string | null {
  if (example === null) return 'null'
  if (example === undefined) return 'undefined'
  switch (typeof example) {
    case 'string':
      return 'string'
    case 'boolean':
      return 'boolean'
    case 'number':
      return Number.isInteger(example) ? 'integer' : 'number'
    case 'object':
      return Array.isArray(example) ? 'array' : 'object'
    default:
      return null
  }
}

/**
 * Create a runtime type for function signatures.
 *
 * Forms:
 *   FunctionPredicate(name, spec) - from a specification object
 *   FunctionPredicate(name, fn)   - from an existing typed function
 *
 * @example
 * const Callback = FunctionPredicate('Callback', {
 *   params: { x: 0, y: 0 },
 *   returns: 0,
 * })
 * Callback.check((a, b) => a + b) // true (typeof === 'function')
 * Callback.check(42)              // false
 *
 * @example
 * function add(a: 0, b: 0) -> 0 { return a + b }
 * const Adder = FunctionPredicate('Adder', add)
 * // Extracts params/returns from add.__tjs
 *
 * @example
 * // Generic form — returns a factory
 * const Creator = FunctionPredicate('Creator', [['T', {}]], (T) => ({
 *   params: { contents: [null] },
 *   returns: T,
 * }))
 * const HtmlCreator = Creator({})  // FunctionPredicateType with returns: {}
 */
export function FunctionPredicate(
  name: string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  specOrFn: FunctionPredicateSpec | Function | (string | [string, TypeParam])[],
  specBuilder?: (...typeArgs: any[]) => FunctionPredicateSpec
): FunctionPredicateType | GenericFunctionPredicateType {
  // Generic form: FunctionPredicate(name, typeParams, specBuilder)
  if (Array.isArray(specOrFn) && specBuilder) {
    const typeParams = specOrFn as (string | [string, TypeParam])[]

    // Extract param names and defaults
    const paramNames: string[] = []
    const defaults: (TypeParam | undefined)[] = []
    for (const tp of typeParams) {
      if (Array.isArray(tp)) {
        paramNames.push(tp[0])
        defaults.push(tp[1])
      } else {
        paramNames.push(tp)
        defaults.push(undefined)
      }
    }

    const factory = ((...typeArgs: TypeParam[]) => {
      // Resolve type args with defaults
      const resolved: any[] = paramNames.map((_, idx) =>
        idx < typeArgs.length ? typeArgs[idx] : defaults[idx]
      )
      const spec = specBuilder(...resolved)
      return FunctionPredicate(name, spec) as FunctionPredicateType
    }) as GenericFunctionPredicateType

    Object.defineProperties(factory, {
      typeParamNames: { value: paramNames, enumerable: true },
      description: { value: name, enumerable: true },
      __runtimeType: { value: true, enumerable: true },
    })

    return factory
  }

  /* eslint-disable @typescript-eslint/ban-types */
  return _createFunctionPredicate(
    name,
    specOrFn as FunctionPredicateSpec | Function
  )
  /* eslint-enable @typescript-eslint/ban-types */
}

/** Internal: create a non-generic FunctionPredicateType */
function _createFunctionPredicate(
  name: string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  specOrFn: FunctionPredicateSpec | Function
): FunctionPredicateType {
  let params: Record<string, any> = {}
  let returns: any = undefined
  let returnContract: ReturnContract = 'assertReturns'

  if (typeof specOrFn === 'function') {
    // Extract from function's __tjs metadata
    const meta = (specOrFn as any).__tjs
    if (meta) {
      // Build params from __tjs.params
      if (meta.params) {
        for (const [key, info] of Object.entries(meta.params)) {
          params[key] = (info as any)?.example ?? null
        }
      }
      // Extract return type
      if (meta.returns) {
        returns = (meta.returns as any)?.example ?? null
      }
      // Extract return contract from safety markers
      if (meta.safeReturn) returnContract = 'checkedReturns'
      else if (meta.unsafe) returnContract = 'assertReturns'
      else returnContract = 'returns'
    }
  } else {
    params = specOrFn.params ?? {}
    returns = specOrFn.returns
    returnContract = specOrFn.returnContract ?? 'assertReturns'
  }

  const fpType: FunctionPredicateType = {
    description: name,
    params,
    returns,
    returnContract,
    toJSONSchema: () => ({ description: name, type: 'function' as any }),
    strip: (value: unknown) => value,
    check: (value: unknown): boolean | string => {
      if (typeof value !== 'function')
        return `expected function, got ${
          value === null ? 'null' : typeof value
        }`

      // Structural validation: check arity and __tjs metadata
      const expectedArity = Object.keys(params).length
      if (expectedArity > 0) {
        // eslint-disable-next-line @typescript-eslint/ban-types
        const fn = value as Function
        const meta = (fn as any).__tjs
        if (meta?.params) {
          // Has TJS metadata — check param count matches
          const metaParamCount = Object.keys(meta.params).length
          if (metaParamCount !== expectedArity)
            return `expected ${expectedArity} params, got ${metaParamCount}`

          // Check param type kinds match where both sides have type info
          const expectedKeys = Object.keys(params)
          const metaKeys = Object.keys(meta.params)
          for (let i = 0; i < expectedKeys.length; i++) {
            const metaInfo = meta.params[metaKeys[i]]
            const expectedExample = params[expectedKeys[i]]
            if (metaInfo?.type?.kind && expectedExample !== undefined) {
              const expectedKind = kindOfExample(expectedExample)
              if (
                expectedKind &&
                metaInfo.type.kind !== expectedKind &&
                metaInfo.type.kind !== 'any'
              )
                return `param '${expectedKeys[i]}' expected ${expectedKind}, got ${metaInfo.type.kind}`
            }
          }
        }
      }

      return true
    },
    __runtimeType: true as const,
  }

  return fpType
}
