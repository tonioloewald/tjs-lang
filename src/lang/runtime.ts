/**
 * TJS Runtime
 *
 * Monadic type checking at runtime:
 * - Functions validate inputs against __tjs metadata
 * - If any input is an error, pass it through (no work)
 * - Type mismatches return error objects
 * - Errors propagate through call chains
 *
 * This runtime is attached to globalThis.__tjs and shared across modules.
 */

import { validate, s } from 'tosijs-schema'
import {
  Type,
  isRuntimeType,
  Union,
  Generic,
  Enum,
  Nullable,
  Optional,
  TArray,
  // Built-in types
  TString,
  TNumber,
  TBoolean,
  TInteger,
  TPositiveInt,
  TNonEmptyString,
  TEmail,
  TUrl,
  TUuid,
  Timestamp,
  LegalDate,
  // Built-in generics
  TPair,
  TRecord,
  // Portable predicate helpers (future AJS builtins)
  isValidUrl,
  isValidTimestamp,
  isValidLegalDate,
} from '../types/Type'

// Re-export Type utilities for consumers
export {
  Type,
  isRuntimeType,
  Union,
  Generic,
  Enum,
  Nullable,
  Optional,
  TArray,
  TString,
  TNumber,
  TBoolean,
  TInteger,
  TPositiveInt,
  TNonEmptyString,
  TEmail,
  TUrl,
  TUuid,
  Timestamp,
  LegalDate,
  TPair,
  TRecord,
  isValidUrl,
  isValidTimestamp,
  isValidLegalDate,
}

// Version from package.json - injected at build time or imported
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json') as { version: string }

export const TJS_VERSION: string = pkg.version

/**
 * Parse semver version string into components
 */
function parseVersion(version: string): {
  major: number
  minor: number
  patch: number
} {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number)
  return { major, minor, patch }
}

/**
 * Compare two version strings
 * Returns: -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const va = parseVersion(a)
  const vb = parseVersion(b)

  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1
  return 0
}

/**
 * Check if two versions are compatible (same major version)
 */
export function versionsCompatible(a: string, b: string): boolean {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  return va.major === vb.major
}

/**
 * MonadicError - Internal error type for monadic error propagation
 *
 * This extends Error so:
 * 1. It's a real Error with proper stack traces
 * 2. User code can't accidentally process it as data (unlike { $error: true })
 * 3. It flows through function calls via instanceof checks
 *
 * NOT exported to user code - they just see Error instances.
 */
export class MonadicError extends Error {
  /** Path where the error occurred, e.g., "src/file.ts:42:greet.name" */
  readonly path: string
  /** Expected type */
  readonly expected?: string
  /** Actual type received */
  readonly actual?: string
  /** TJS call stack (only in debug mode) - shows source locations */
  readonly callStack?: string[]

  constructor(
    message: string,
    path: string,
    expected?: string,
    actual?: string,
    callStack?: string[]
  ) {
    super(message)
    this.name = 'MonadicError'
    this.path = path
    this.expected = expected
    this.actual = actual
    this.callStack = callStack
    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MonadicError)
    }
  }
}

/**
 * Create a type error for inline validation
 *
 * Called ONLY when a type check fails - no overhead on happy path.
 * Returns a MonadicError that propagates through the call chain.
 * In debug mode, captures the TJS call stack with source locations.
 *
 * @param path - Location of the error, e.g., "src/file.ts:42:greet.name"
 * @param expected - Expected type, e.g., "string"
 * @param value - The actual value that failed the check
 */
export function typeError(
  path: string,
  expected: string,
  value: unknown
): MonadicError {
  const actual = value === null ? 'null' : typeof value
  // Capture call stack in debug mode (getStack returns [] if not in debug mode)
  const stack = config.debug ? getStack() : undefined
  return new MonadicError(
    `Expected ${expected} for '${path}', got ${actual}`,
    path,
    expected,
    actual,
    stack
  )
}

/**
 * Check if a value is a MonadicError (for internal use)
 */
export function isMonadicError(value: unknown): value is MonadicError {
  return value instanceof MonadicError
}

/**
 * Error marker - identifies TJS error objects
 * @deprecated Use MonadicError instead. This interface is kept for backward compatibility.
 */
export interface TJSError {
  $error: true
  message: string
  /** Failure location - e.g., "greet.name" */
  path?: string
  /** Call stack in debug mode - e.g., ["main", "processUser", "greet.name"] */
  stack?: string[]
  expected?: string
  actual?: string
  cause?: Error | TJSError
  /** Source location for error reporting */
  loc?: { start: number; end: number }
  /** Multiple errors (when composing parameter errors) */
  errors?: TJSError[]
}

/**
 * Safety levels for runtime validation
 * - 'none': No validation unless explicitly forced with (?) or -?
 * - 'inputs': Validate inputs only (default) - outputs only with explicit -> or -?
 * - 'all': Validate both inputs and outputs unless explicitly skipped with (!) or -!
 */
export type SafetyLevel = 'none' | 'inputs' | 'all'

/**
 * Runtime configuration
 */
export interface TJSConfig {
  /** Enable debug mode - captures call stacks in errors */
  debug?: boolean
  /** Safety level for validation (default: 'inputs') */
  safety?: SafetyLevel
  /** Require explicit return types (error if -> not specified) */
  requireReturnTypes?: boolean
  /** Maximum call stack size to prevent memory issues (default: 100) */
  maxStackSize?: number
}

/** Default configuration values */
const DEFAULT_CONFIG: TJSConfig = {
  debug: false,
  safety: 'inputs',
  requireReturnTypes: false,
  maxStackSize: 100,
}

/** Current runtime configuration */
let config: TJSConfig = { ...DEFAULT_CONFIG }

/** Current call stack (only tracked in debug mode) */
const callStack: string[] = []

/** Unsafe mode depth - when > 0, skip validation in wrap() */
let unsafeDepth = 0

/**
 * Enter unsafe mode - disables validation for all wrapped function calls
 * Can be nested (uses depth counter)
 */
export function enterUnsafe(): void {
  unsafeDepth++
}

/**
 * Exit unsafe mode - re-enables validation when depth returns to 0
 */
export function exitUnsafe(): void {
  if (unsafeDepth > 0) unsafeDepth--
}

/**
 * Check if currently in unsafe mode
 */
export function isUnsafeMode(): boolean {
  return unsafeDepth > 0
}

/**
 * Configure TJS runtime
 */
export function configure(options: TJSConfig): void {
  config = { ...config, ...options }
}

/**
 * Get current configuration
 */
export function getConfig(): TJSConfig {
  return { ...config }
}

/**
 * Push a function onto the call stack (debug mode only)
 * Respects maxStackSize to prevent unbounded memory growth
 */
export function pushStack(name: string): void {
  if (config.debug && name) {
    callStack.push(name)
    // Enforce max stack size by removing oldest entries
    const maxSize = config.maxStackSize ?? 100
    while (callStack.length > maxSize) {
      callStack.shift()
    }
  }
}

/**
 * Pop a function from the call stack (debug mode only)
 */
export function popStack(): void {
  if (config.debug) {
    callStack.pop()
  }
}

/**
 * Get current call stack snapshot
 */
export function getStack(): string[] {
  return [...callStack]
}

/**
 * Reset runtime state to defaults
 *
 * Resets: config, callStack, unsafeDepth
 * Use this in test teardown to prevent state leaking between tests.
 */
export function resetRuntime(): void {
  config = { ...DEFAULT_CONFIG }
  callStack.length = 0
  unsafeDepth = 0
}

/**
 * Structural equality - the == that works
 *
 * Rules:
 * 1. If left has .Equals, call left.Equals(right)
 * 2. If right has .Equals, call right.Equals(left)
 * 3. Arrays/objects: recursive structural comparison
 * 4. Primitives: strict equality (no coercion)
 *
 * Usage: `a Is b` transforms to `Is(a, b)`
 */
export function Is(a: unknown, b: unknown): boolean {
  // Check for .Equals method
  if (
    a !== null &&
    typeof a === 'object' &&
    typeof (a as any).Equals === 'function'
  ) {
    return (a as any).Equals(b)
  }
  if (
    b !== null &&
    typeof b === 'object' &&
    typeof (b as any).Equals === 'function'
  ) {
    return (b as any).Equals(a)
  }

  // Identical references or primitives
  if (a === b) return true

  // null/undefined - strict
  if (a === null || b === null) return a === b
  if (a === undefined || b === undefined) return a === b

  // Different types - not equal (no coercion)
  if (typeof a !== typeof b) return false

  // Primitives that aren't === are not equal
  if (typeof a !== 'object') return false

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => Is(v, b[i]))
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false

  // Objects - structural comparison
  const keysA = Object.keys(a as object)
  const keysB = Object.keys(b as object)
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => Is((a as any)[k], (b as any)[k]))
}

/**
 * Structural inequality - the != that works
 *
 * Usage: `a IsNot b` transforms to `IsNot(a, b)`
 */
export function IsNot(a: unknown, b: unknown): boolean {
  return !Is(a, b)
}

/**
 * Check if a value is a TJS error
 */
export function isError(value: unknown): value is TJSError {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as any).$error === true
  )
}

/**
 * Create a TJS error
 * In debug mode, captures the current call stack
 */
export function error(
  message: string,
  details?: Partial<Omit<TJSError, '$error' | 'message'>>
): TJSError {
  const err: TJSError = {
    $error: true,
    message,
    ...details,
  }

  // In debug mode, capture the call stack
  if (config.debug && callStack.length > 0) {
    // Add the path to the stack if it exists
    const fullStack = details?.path
      ? [...callStack, details.path]
      : [...callStack]
    err.stack = fullStack
  }

  return err
}

/**
 * Compose multiple errors into a single error
 * Used when multiple parameters have errors
 */
export function composeErrors(errors: TJSError[], funcName?: string): TJSError {
  if (errors.length === 0) {
    return error('Unknown error')
  }
  if (errors.length === 1) {
    return errors[0]
  }

  // Build a message listing all failed parameters
  const paramNames = errors
    .map((e) => {
      // Extract param name from path (e.g., "func.paramName" -> "paramName")
      if (e.path) {
        const parts = e.path.split('.')
        return parts[parts.length - 1]
      }
      return 'unknown'
    })
    .join(', ')

  const message = `Multiple parameter errors in ${
    funcName || 'function'
  }: ${paramNames}`

  return error(message, {
    path: funcName,
    errors,
  })
}

/**
 * Get the type of a value
 *
 * Enhanced typeof that handles:
 * - null (returns 'null' not 'object')
 * - undefined (returns 'undefined')
 * - arrays (returns 'array' not 'object')
 * - native/platform types (returns constructor name for objects)
 *
 * For objects, returns the constructor name which enables pragmatic
 * native type checking (e.g., 'HTMLElement', 'Buffer', 'Event')
 */
export function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'

  const t = typeof value
  if (t !== 'object') return t

  // For objects, return constructor name for pragmatic native type checking
  // This enables checking for HTMLElement, Buffer, Event, etc.
  const constructorName = (value as object).constructor?.name
  if (constructorName && constructorName !== 'Object') {
    return constructorName
  }

  return 'object'
}

/**
 * Check if a value is an instance of a native/platform type by constructor name
 *
 * This enables pragmatic native type checking without shipping type definitions:
 * - isNativeType(el, 'HTMLElement') - DOM element check
 * - isNativeType(buf, 'Buffer') - Node.js Buffer check
 * - isNativeType(evt, 'Event') - DOM Event check
 * - isNativeType(map, 'Map') - Map instance check
 *
 * @param value - The value to check
 * @param typeName - The constructor name to match (e.g., 'HTMLElement', 'Buffer')
 * @returns true if value's constructor.name matches or is in prototype chain
 */
export function isNativeType(value: unknown, typeName: string): boolean {
  if (value === null || value === undefined) return false
  if (typeof value !== 'object' && typeof value !== 'function') return false

  // Check constructor name
  let proto = value
  while (proto !== null) {
    const constructorName = (proto as object).constructor?.name
    if (constructorName === typeName) return true
    proto = Object.getPrototypeOf(proto)
  }

  return false
}

/**
 * Check if a value matches an expected type
 *
 * @param value - The value to check
 * @param expected - Either a string type name ('string', 'number', etc.)
 *                   or a RuntimeType instance with .check() method
 * @param path - Optional path for error messages
 */
export function checkType(
  value: unknown,
  expected: string | { check: (v: unknown) => boolean; description: string },
  path?: string
): TJSError | null {
  // If value is already an error, propagate it
  if (isError(value)) return value

  // Handle RuntimeType instances (Type() results)
  if (
    typeof expected === 'object' &&
    expected !== null &&
    'check' in expected
  ) {
    if (expected.check(value)) return null
    return error(`Expected ${expected.description} but got ${typeOf(value)}`, {
      path,
      expected: expected.description,
      actual: typeOf(value),
    })
  }

  const actual = typeOf(value)

  // Handle special cases
  if (expected === 'any') return null
  if (expected === actual) return null

  // Number accepts both number types
  if (expected === 'number' && actual === 'number') return null
  if (expected === 'integer' && actual === 'number' && Number.isInteger(value))
    return null

  // Object matching (basic)
  if (expected === 'object' && actual === 'object') return null

  return error(`Expected ${expected} but got ${actual}`, {
    path,
    expected,
    actual,
  })
}

/** Type specifier - either a string name or a RuntimeType */
type TypeSpec = string | { check: (v: unknown) => boolean; description: string }

/** Parameter metadata with optional location */
interface ParamMeta {
  type: TypeSpec
  required: boolean
  default?: unknown
  loc?: { start: number; end: number }
}

/**
 * Validate function arguments against __tjs metadata
 * Returns first error found, or null if all valid
 */
export function validateArgs(
  args: Record<string, unknown>,
  meta: {
    params: Record<string, ParamMeta>
  },
  funcName?: string
): TJSError | null {
  for (const [name, param] of Object.entries(meta.params)) {
    const value = args[name]

    // Check if any arg is already an error - propagate first one
    if (isError(value)) return value

    // Check required
    if (param.required && value === undefined) {
      const expectedDesc =
        typeof param.type === 'string' ? param.type : param.type.description
      return error(`Missing required parameter '${name}'`, {
        path: funcName ? `${funcName}.${name}` : name,
        expected: expectedDesc,
        actual: 'undefined',
        loc: param.loc,
      })
    }

    // Skip type check for undefined optional params
    if (value === undefined) continue

    // Type check
    const typeError = checkType(
      value,
      param.type,
      funcName ? `${funcName}.${name}` : name
    )
    if (typeError) {
      // Add location info if available
      if (param.loc) {
        typeError.loc = param.loc
      }
      return typeError
    }
  }

  return null
}

/**
 * Function metadata with safety flags
 */
export interface FunctionMeta {
  params: Record<string, any>
  returns?: { type: any; safe?: boolean }
  /** Function marked with (!) - never validate inputs */
  unsafe?: boolean
  /** Function marked with (?) - always validate inputs */
  safe?: boolean
  /** Return type marked with -! - never validate output */
  unsafeReturn?: boolean
  /** Return type marked with -? - always validate output */
  safeReturn?: boolean
  /** Explicit function name for stack tracking (used when fn.name is empty) */
  name?: string
}

/**
 * Determine if we should validate inputs for this call
 */
function shouldValidateInputs(meta: FunctionMeta): boolean {
  // Per-function flags take precedence
  if (meta.unsafe) return false
  if (meta.safe) return true

  // Block-level override
  if (unsafeDepth > 0) return false

  // Global safety level
  return config.safety !== 'none'
}

/**
 * Determine if we should validate outputs for this call
 */
function shouldValidateOutputs(meta: FunctionMeta): boolean {
  // No return type declared = no validation
  if (!meta.returns) return false

  // Per-function return flags take precedence
  if (meta.unsafeReturn) return false
  if (meta.safeReturn) return true

  // Block-level override
  if (unsafeDepth > 0) return false

  // Global safety level: 'all' validates outputs, others don't by default
  return config.safety === 'all'
}

/**
 * Wrap a function with monadic type checking
 *
 * @param fn - The original function
 * @param meta - The __tjs metadata
 * @returns Wrapped function that validates inputs and propagates errors
 */
export function wrap<T extends (...args: any[]) => any>(
  fn: T,
  meta: FunctionMeta
): T {
  // Always attach metadata for introspection/autocomplete
  ;(fn as any).__tjs = meta

  // Determine if we need a wrapper at all
  const needsWrapper =
    // Has forced safety that requires validation
    meta.safe ||
    meta.safeReturn ||
    // Global safety requires validation (and not explicitly unsafe)
    (config.safety !== 'none' && !meta.unsafe) ||
    // Has return type that might need validation
    (meta.returns && config.safety === 'all' && !meta.unsafeReturn)

  if (!needsWrapper) {
    return fn
  }

  // Pre-compute flags at wrap time
  const hasReturns = !!meta.returns
  const metaUnsafe = !!meta.unsafe
  const metaSafe = !!meta.safe
  const metaUnsafeReturn = !!meta.unsafeReturn
  const metaSafeReturn = !!meta.safeReturn
  const paramEntries = Object.entries(meta.params)
  const paramCount = paramEntries.length
  // Use meta.name as fallback when fn.name is empty (anonymous functions)
  const funcName = fn.name || meta.name || 'anonymous'

  const wrapped = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    // Fast path: inside unsafe block, skip all validation
    if (unsafeDepth > 0) {
      return fn.apply(this, args)
    }

    // Compute validation flags
    const validateInputs = metaSafe || (!metaUnsafe && config.safety !== 'none')
    const validateOutputs =
      hasReturns &&
      (metaSafeReturn || (!metaUnsafeReturn && config.safety === 'all'))

    // Fast path: no validation needed
    if (!validateInputs && !validateOutputs) {
      return fn.apply(this, args)
    }

    // Fast path: check for error as first arg
    if (args.length > 0 && isError(args[0])) {
      return args[0] as ReturnType<T>
    }

    // Input validation
    if (validateInputs) {
      // Detect if single object arg (named params) vs positional
      const isNamedCall =
        args.length === 1 &&
        typeof args[0] === 'object' &&
        args[0] !== null &&
        !Array.isArray(args[0])

      // Collect all errors to compose them
      const collectedErrors: TJSError[] = []

      // Fast positional validation (avoids object allocation)
      if (!isNamedCall) {
        for (let i = 0; i < paramCount; i++) {
          const [name, param] = paramEntries[i]
          const value = args[i]

          // Check for error propagation (passed-in errors)
          if (isError(value)) {
            collectedErrors.push(value)
            continue
          }

          // Check required
          if (param.required && value === undefined) {
            collectedErrors.push(
              error(`Missing required parameter '${name}'`, {
                path: `${funcName}.${name}`,
                expected:
                  typeof param.type === 'string'
                    ? param.type
                    : param.type?.description || 'value',
                actual: 'undefined',
                loc: param.loc,
              })
            )
            continue
          }

          // Type check (skip undefined optional)
          if (value !== undefined) {
            const typeErr = checkType(value, param.type, `${funcName}.${name}`)
            if (typeErr) {
              if (param.loc) typeErr.loc = param.loc
              collectedErrors.push(typeErr)
            }
          }
        }
      } else {
        // Named args path (slower, but supports object destructuring)
        const namedArgs = args[0] as Record<string, unknown>
        for (let i = 0; i < paramCount; i++) {
          const [name, param] = paramEntries[i]
          const value = namedArgs[name]

          if (isError(value)) {
            collectedErrors.push(value)
            continue
          }

          if (param.required && value === undefined) {
            collectedErrors.push(
              error(`Missing required parameter '${name}'`, {
                path: `${funcName}.${name}`,
                expected:
                  typeof param.type === 'string'
                    ? param.type
                    : param.type?.description || 'value',
                actual: 'undefined',
                loc: param.loc,
              })
            )
            continue
          }

          if (value !== undefined) {
            const typeErr = checkType(value, param.type, `${funcName}.${name}`)
            if (typeErr) {
              if (param.loc) typeErr.loc = param.loc
              collectedErrors.push(typeErr)
            }
          }
        }
      }

      // If we collected any errors, compose and return them
      if (collectedErrors.length > 0) {
        return composeErrors(collectedErrors, funcName) as ReturnType<T>
      }
    }

    // Push onto call stack in debug mode
    pushStack(funcName)

    try {
      // Execute function
      const result = fn.apply(this, args)

      // Output validation
      if (validateOutputs && meta.returns && !isError(result)) {
        const returnError = checkType(
          result,
          meta.returns.type,
          `${funcName}()`
        )
        if (returnError) {
          popStack()
          return returnError as ReturnType<T>
        }
      }

      popStack()
      return result
    } catch (e) {
      popStack()
      // Convert thrown errors to TJS errors
      return error((e as Error).message || String(e), {
        path: funcName,
        cause: e as Error,
      }) as ReturnType<T>
    }
  }

  // Preserve function name and metadata
  Object.defineProperty(wrapped, 'name', { value: fn.name })
  ;(wrapped as any).__tjs = meta

  return wrapped as T
}

/**
 * Wrap a class to make it callable without `new`
 *
 * In TJS, classes can be instantiated without the `new` keyword:
 *   const obj = MyClass(args)  // equivalent to new MyClass(args)
 *
 * This eliminates a common source of errors where developers forget `new`.
 * Using explicit `new` still works but should be flagged by the linter.
 */
export function wrapClass<T extends new (...args: any[]) => any>(
  cls: T
): T & ((...args: ConstructorParameters<T>) => InstanceType<T>) {
  // Use a Proxy to intercept both `new Wrapper()` and `Wrapper()` calls
  const wrapped = new Proxy(cls, {
    // Called when using `new Wrapper(...)`
    construct(target, args, newTarget) {
      return Reflect.construct(target, args, newTarget)
    },
    // Called when using `Wrapper(...)` without new
    apply(target, _thisArg, args) {
      return Reflect.construct(target, args)
    },
  })

  // Preserve class name
  Object.defineProperty(wrapped, 'name', { value: cls.name })

  // Copy static properties and methods
  for (const key of Object.getOwnPropertyNames(cls)) {
    if (key !== 'length' && key !== 'name' && key !== 'prototype') {
      Object.defineProperty(
        wrapped,
        key,
        Object.getOwnPropertyDescriptor(cls, key)!
      )
    }
  }

  return wrapped as T & ((...args: ConstructorParameters<T>) => InstanceType<T>)
}

// ============================================================================
// SafeFunction and Eval - Safe replacements for Function and eval
// ============================================================================

/** Type specification - can be a RuntimeType, example value, or schema */
type TypeSpec = RuntimeType | unknown

/** Convert a type spec to a check function */
function typeSpecToCheck(spec: TypeSpec): (value: unknown) => boolean {
  if (isRuntimeType(spec)) {
    return (v) => spec.check(v)
  }
  // Infer schema from example value
  const schema = s.infer(spec)
  return (v) => validate(v, schema)
}

/** Capabilities that can be injected into SafeFunction/Eval */
export interface SafeCapabilities {
  /** Fetch function for HTTP requests */
  fetch?: typeof globalThis.fetch
  /** Console for logging */
  console?: typeof console
  /** Additional globals to expose */
  [key: string]: unknown
}

/** Options for SafeFunction */
export interface SafeFunctionOptions<
  TInputs extends Record<string, TypeSpec>,
  TOutput extends TypeSpec
> {
  /** Input parameter types (name -> type spec) */
  inputs: TInputs
  /** Output type spec */
  output: TOutput
  /** Function body code */
  body: string
  /** Timeout in milliseconds (default: 5000) */
  timeoutMs?: number
  /** Fuel budget (basic operation counting, not full VM) */
  fuel?: number
  /** Capabilities to inject (fetch, console, etc.) */
  capabilities?: SafeCapabilities
}

/**
 * Create a safe, typed async function from code
 *
 * @example
 * const add = await SafeFunction({
 *   inputs: { a: +0, b: +0 },
 *   output: +0,
 *   body: 'return a + b'
 * })
 * await add(1, 2) // 3
 *
 * // With capabilities
 * const fetcher = await SafeFunction({
 *   inputs: { url: '' },
 *   output: { data: [] },
 *   body: 'return await fetch(url).then(r => r.json())',
 *   capabilities: { fetch: globalThis.fetch },
 *   timeoutMs: 10000
 * })
 */
export async function SafeFunction<
  TInputs extends Record<string, TypeSpec>,
  TOutput extends TypeSpec
>(
  options: SafeFunctionOptions<TInputs, TOutput>
): Promise<(...args: unknown[]) => Promise<unknown>> {
  const { inputs, output, body, timeoutMs = 5000, capabilities = {} } = options

  // Build input validators
  const paramNames = Object.keys(inputs)
  const inputChecks = paramNames.map((name) => ({
    name,
    check: typeSpecToCheck(inputs[name]),
  }))
  const outputCheck = typeSpecToCheck(output)

  // Build capability names and values for injection
  const capNames = Object.keys(capabilities)
  const capValues = Object.values(capabilities)

  // Create the async function with capabilities injected
  // Wrap body in async IIFE to support await
  const asyncBody = `
    return (async () => {
      ${body}
    })()
  `
  // Function signature: capabilities first, then params
  const fn = new Function(...capNames, ...paramNames, asyncBody)

  // Return wrapped function with validation
  return async (...args: unknown[]): Promise<unknown> => {
    // Validate inputs
    for (let i = 0; i < inputChecks.length; i++) {
      const { name, check } = inputChecks[i]
      const value = args[i]
      if (!check(value)) {
        return error(`SafeFunction: invalid input '${name}'`, 'SafeFunction', {
          expected: name,
          received: value,
        })
      }
    }

    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('SafeFunction timeout')), timeoutMs)
    })

    try {
      // Call with capabilities first, then args
      const result = await Promise.race([
        fn(...capValues, ...args),
        timeoutPromise,
      ])

      // Validate output
      if (!outputCheck(result)) {
        return error('SafeFunction: invalid output', 'SafeFunction', {
          received: result,
        })
      }

      return result
    } catch (err: any) {
      return error(
        `SafeFunction error: ${err.message || err}`,
        'SafeFunction',
        { cause: err }
      )
    }
  }
}

/** Options for Eval */
export interface EvalOptions<TOutput extends TypeSpec> {
  /** Code to evaluate */
  code: string
  /** Context variables available to the code */
  context?: Record<string, unknown>
  /** Expected output type */
  output: TOutput
  /** Timeout in milliseconds (default: 5000) */
  timeoutMs?: number
  /** Capabilities to inject (fetch, console, etc.) */
  capabilities?: SafeCapabilities
}

/**
 * Safely evaluate code with typed context and output
 *
 * @example
 * const result = await Eval({
 *   code: 'a + b',
 *   context: { a: 1, b: 2 },
 *   output: +0
 * }) // 3
 *
 * // With capabilities
 * const data = await Eval({
 *   code: 'await fetch(url).then(r => r.json())',
 *   context: { url: 'https://api.example.com' },
 *   output: { items: [] },
 *   capabilities: { fetch: globalThis.fetch }
 * })
 */
export async function Eval<TOutput extends TypeSpec>(
  options: EvalOptions<TOutput>
): Promise<unknown> {
  const {
    code,
    context = {},
    output,
    timeoutMs = 5000,
    capabilities = {},
  } = options

  // Combine capabilities and context (capabilities take precedence)
  const allNames = [...Object.keys(capabilities), ...Object.keys(context)]
  const allValues = [...Object.values(capabilities), ...Object.values(context)]
  const outputCheck = typeSpecToCheck(output)

  // Wrap code in async IIFE to support await and return the expression
  // If code doesn't have 'return', treat it as an expression
  const hasReturn = /\breturn\b/.test(code)
  const asyncBody = hasReturn
    ? `return (async () => { ${code} })()`
    : `return (async () => { return (${code}) })()`

  const fn = new Function(...allNames, asyncBody)

  // Execute with timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Eval timeout')), timeoutMs)
  })

  try {
    const result = await Promise.race([fn(...allValues), timeoutPromise])

    // Validate output
    if (!outputCheck(result)) {
      return error('Eval: invalid output', 'Eval', {
        received: result,
      })
    }

    return result
  } catch (err: any) {
    return error(`Eval error: ${err.message || err}`, 'Eval', { cause: err })
  }
}

/**
 * Create an isolated TJS runtime instance
 *
 * Each call returns a fresh runtime with its own:
 * - config (debug, safety, etc.)
 * - callStack
 * - unsafeDepth
 *
 * The new instance inherits the current global config at creation time,
 * but subsequent changes are isolated.
 *
 * Use this to prevent state leaking between transpiled modules.
 */
export function createRuntime() {
  // Per-instance state - inherit current global config
  let instanceConfig: TJSConfig = { ...config }
  const instanceCallStack: string[] = []
  let instanceUnsafeDepth = 0

  // Per-instance stateful functions
  function instanceConfigure(options: TJSConfig): void {
    instanceConfig = { ...instanceConfig, ...options }
  }

  function instanceGetConfig(): TJSConfig {
    return { ...instanceConfig }
  }

  function instancePushStack(name: string): void {
    if (instanceConfig.debug && name) {
      instanceCallStack.push(name)
      const maxSize = instanceConfig.maxStackSize ?? 100
      while (instanceCallStack.length > maxSize) {
        instanceCallStack.shift()
      }
    }
  }

  function instancePopStack(): void {
    if (instanceConfig.debug) {
      instanceCallStack.pop()
    }
  }

  function instanceGetStack(): string[] {
    return [...instanceCallStack]
  }

  function instanceResetRuntime(): void {
    instanceConfig = { ...DEFAULT_CONFIG }
    instanceCallStack.length = 0
    instanceUnsafeDepth = 0
  }

  function instanceEnterUnsafe(): void {
    instanceUnsafeDepth++
  }

  function instanceExitUnsafe(): void {
    if (instanceUnsafeDepth > 0) instanceUnsafeDepth--
  }

  function instanceIsUnsafeMode(): boolean {
    return instanceUnsafeDepth > 0
  }

  function instanceTypeError(
    path: string,
    expected: string,
    value: unknown
  ): MonadicError {
    const actual = value === null ? 'null' : typeof value
    const stack = instanceConfig.debug ? instanceGetStack() : undefined
    return new MonadicError(
      `Expected ${expected} for '${path}', got ${actual}`,
      path,
      expected,
      actual,
      stack
    )
  }

  function instanceError(
    message: string,
    details?: Partial<Omit<TJSError, '$error' | 'message'>>
  ): TJSError {
    const err: TJSError = {
      $error: true,
      message,
      ...details,
    }
    if (instanceConfig.debug && instanceCallStack.length > 0) {
      const fullStack = details?.path
        ? [...instanceCallStack, details.path]
        : [...instanceCallStack]
      err.stack = fullStack
    }
    return err
  }

  return {
    version: TJS_VERSION,
    // Monadic error handling
    MonadicError,
    typeError: instanceTypeError,
    isMonadicError,
    // Legacy error handling
    isError,
    error: instanceError,
    composeErrors,
    typeOf,
    isNativeType,
    checkType,
    validateArgs,
    wrap,
    wrapClass,
    compareVersions,
    versionsCompatible,
    // Debug mode (instance-specific)
    configure: instanceConfigure,
    getConfig: instanceGetConfig,
    pushStack: instancePushStack,
    popStack: instancePopStack,
    getStack: instanceGetStack,
    resetRuntime: instanceResetRuntime,
    // Unsafe mode (instance-specific)
    enterUnsafe: instanceEnterUnsafe,
    exitUnsafe: instanceExitUnsafe,
    isUnsafeMode: instanceIsUnsafeMode,
    // Type system
    validate,
    infer: s.infer.bind(s),
    Type,
    isRuntimeType,
    Union,
    Generic,
    Enum,
    Nullable,
    Optional,
    TArray,
    TString,
    TNumber,
    TBoolean,
    TInteger,
    TPositiveInt,
    TNonEmptyString,
    TEmail,
    TUrl,
    TUuid,
    TPair,
    TRecord,
    // Safe eval/function
    SafeFunction,
    Eval,
    // Structural equality
    Is,
    IsNot,
  }
}

/** Type for runtime instances */
export type TJSRuntime = ReturnType<typeof createRuntime>

/**
 * TJS Runtime object - attached to globalThis.__tjs
 *
 * NOTE: This is a shared global instance. For isolated execution,
 * use createRuntime() instead.
 */
export const runtime = {
  version: TJS_VERSION,
  // Monadic error handling (new)
  MonadicError,
  typeError,
  isMonadicError,
  // Legacy error handling (deprecated)
  isError,
  error,
  composeErrors,
  typeOf,
  isNativeType,
  checkType,
  validateArgs,
  wrap,
  wrapClass,
  compareVersions,
  versionsCompatible,
  // Debug mode
  configure,
  getConfig,
  pushStack,
  popStack,
  getStack,
  resetRuntime,
  // Unsafe mode
  enterUnsafe,
  exitUnsafe,
  isUnsafeMode,
  // Factory for isolated instances
  createRuntime,
  // Type system (used by transpiled Type declarations)
  validate,
  infer: s.infer.bind(s),
  Type,
  isRuntimeType,
  Union,
  Generic,
  Enum,
  Nullable,
  Optional,
  TArray,
  // Built-in types
  TString,
  TNumber,
  TBoolean,
  TInteger,
  TPositiveInt,
  TNonEmptyString,
  TEmail,
  TUrl,
  TUuid,
  Timestamp,
  LegalDate,
  TPair,
  TRecord,
  // Safe eval/function
  SafeFunction,
  Eval,
  // Structural equality (used by == and != in TJS)
  Is,
  IsNot,
}

/**
 * Install runtime globally (idempotent, version-checked)
 *
 * Version handling:
 * - Same version: reuse existing (no warning)
 * - Compatible (same major): reuse existing, log info
 * - Incompatible (different major): warn, use newer version
 */
export function installRuntime(): typeof runtime {
  const g = globalThis as any

  if (g.__tjs) {
    const existingVersion = g.__tjs.version

    // Guard against polluted __tjs without proper version
    if (typeof existingVersion !== 'string') {
      g.__tjs = runtime
      return runtime
    }

    const comparison = compareVersions(TJS_VERSION, existingVersion)

    if (comparison === 0) {
      // Exact same version - just reuse
      return g.__tjs
    }

    if (versionsCompatible(TJS_VERSION, existingVersion)) {
      // Same major version - compatible, use newer
      if (comparison > 0) {
        console.info(
          `TJS runtime: upgrading ${existingVersion} → ${TJS_VERSION}`
        )
        g.__tjs = runtime
      } else {
        console.info(
          `TJS runtime: keeping ${existingVersion} (newer than ${TJS_VERSION})`
        )
      }
    } else {
      // Different major version - breaking change potential
      console.warn(
        `TJS runtime version conflict: ${existingVersion} vs ${TJS_VERSION} (major version mismatch)`
      )
      // Use the newer one but warn about potential issues
      if (comparison > 0) {
        console.warn(`Upgrading to ${TJS_VERSION} - check for breaking changes`)
        g.__tjs = runtime
      }
    }

    return g.__tjs
  }

  g.__tjs = runtime
  return runtime
}

/**
 * Generate runtime wrapper code for emitted JS
 * Skips wrapping for unsafe functions (marked with !)
 */
export function emitRuntimeWrapper(funcName: string): string {
  return `
// TJS runtime wrapper (skips unsafe functions)
if (typeof ${funcName}.__tjs === 'object' && !${funcName}.__tjs.unsafe && typeof globalThis.__tjs?.wrap === 'function') {
  ${funcName} = globalThis.__tjs.wrap(${funcName}, ${funcName}.__tjs)
}
`.trim()
}

/**
 * Generate class wrapper code for emitted JS
 * Makes classes callable without `new` keyword
 * Emits standalone JS - no runtime dependency
 */
export function emitClassWrapper(className: string): string {
  return `
// TJS: callable without new
${className} = new Proxy(${className}, { apply(t, _, a) { return Reflect.construct(t, a) } });
`.trim()
}

/**
 * Questions/Notes:
 *
 * Q1: Should wrap() be automatic or opt-in?
 *     Current: Must be explicitly wrapped
 *     Could: Auto-wrap all functions with __tjs metadata
 *
 * Q2: Performance overhead of validation?
 *     Need benchmarks comparing wrapped vs unwrapped
 *     Could have 'production' mode that skips validation
 *
 * Q3: Async function handling?
 *     wrap() should detect async and handle Promise returns
 *
 * Q4: Deep object validation?
 *     Currently only checks top-level type
 *     Could recursively validate object shapes
 */
