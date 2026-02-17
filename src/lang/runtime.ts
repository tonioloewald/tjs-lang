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
 * Well-known symbol for custom equality.
 *
 * Any object can implement `[tjsEquals](other)` to control how `==` / `Is()`
 * compares it. Useful for Proxies that should delegate equality to their target.
 *
 * Priority: tjsEquals symbol → .Equals method → structural comparison
 */
export const tjsEquals: unique symbol = Symbol.for('tjs.equals')

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
 * 1. If left has [tjsEquals], call left[tjsEquals](right)
 * 2. If right has [tjsEquals], call right[tjsEquals](left)
 * 3. If left has .Equals, call left.Equals(right)
 * 4. If right has .Equals, call right.Equals(left)
 * 5. Arrays/objects: recursive structural comparison
 * 6. Primitives: strict equality (no coercion)
 *
 * Usage: `a Is b` transforms to `Is(a, b)`
 */
export function Is(a: unknown, b: unknown): boolean {
  // Check for [tjsEquals] symbol protocol (highest priority)
  if (
    a !== null &&
    typeof a === 'object' &&
    typeof (a as any)[tjsEquals] === 'function'
  ) {
    return (a as any)[tjsEquals](b)
  }
  if (
    b !== null &&
    typeof b === 'object' &&
    typeof (b as any)[tjsEquals] === 'function'
  ) {
    return (b as any)[tjsEquals](a)
  }

  // Check for .Equals method (backward compat)
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

  // null and undefined are equal to each other (nullish equality)
  // This preserves the useful JS pattern: x == null checks for both
  if ((a === null || a === undefined) && (b === null || b === undefined)) {
    return true
  }

  // If only one is nullish, not equal
  if (a === null || a === undefined || b === null || b === undefined) {
    return false
  }

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
  if (
    expected === 'non-negative-integer' &&
    actual === 'number' &&
    Number.isInteger(value) &&
    (value as number) >= 0
  )
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
  returns?: { type: any; safe?: boolean; defaults?: Record<string, unknown> }
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
  /** Polymorphic dispatcher — skip wrapping, dispatch handles validation */
  polymorphic?: boolean
}

/**
 * Determine if we should validate inputs for this call
 * Reserved for future use with runtime validation modes
 */
function _shouldValidateInputs(meta: FunctionMeta): boolean {
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
 * Reserved for future use with runtime validation modes
 */
function _shouldValidateOutputs(meta: FunctionMeta): boolean {
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
  // Polymorphic dispatchers handle their own routing — no wrapping needed
  const needsWrapper =
    !meta.polymorphic && // Has forced safety that requires validation
    (meta.safe ||
      meta.safeReturn ||
      // Global safety requires validation (and not explicitly unsafe)
      (config.safety !== 'none' && !meta.unsafe) ||
      // Has return type that might need validation
      (meta.returns && config.safety === 'all' && !meta.unsafeReturn))

  if (!needsWrapper) {
    return fn
  }

  // Pre-compute flags at wrap time
  const hasReturns = !!meta.returns
  const metaUnsafe = !!meta.unsafe
  const metaSafe = !!meta.safe
  const metaUnsafeReturn = !!meta.unsafeReturn
  const metaSafeReturn = !!meta.safeReturn
  // Pre-compute return defaults (for `key = value` in return type signatures)
  // NOTE: applying defaults adds an Object.assign per call — may need benchmarking
  const returnDefaults = meta.returns?.defaults
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
        // Apply return defaults before validation
        const validated =
          returnDefaults && typeof result === 'object' && result !== null
            ? Object.assign({}, returnDefaults, result)
            : result
        const returnError = checkType(
          validated,
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
// SafeFunction and Eval - moved to ./eval.ts
// ============================================================================
//
// Eval and SafeFunction are in a separate module to keep the runtime lite.
// Import from 'tjs-lang/eval' when you need dynamic code execution.
//
// Runtime (this file): ~5KB gzipped - type checking, Is/IsNot, wrap, etc.
// Eval module:         ~27KB gzipped - adds transpiler + VM for dynamic code
// ============================================================================

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

  // Extension registry: typeName -> methodName -> fn
  const extensionRegistry = new Map<
    string,
    Map<string, (...args: any[]) => any>
  >()

  function instanceRegisterExtension(
    typeName: string,
    methodName: string,
    fn: (...args: any[]) => any
  ): void {
    if (!extensionRegistry.has(typeName)) {
      extensionRegistry.set(typeName, new Map())
    }
    extensionRegistry.get(typeName)!.set(methodName, fn)
  }

  function instanceResolveExtension(
    value: unknown,
    methodName: string
  ): ((...args: any[]) => any) | undefined {
    // Determine type name from value
    const t = typeof value
    let typeName: string
    if (value === null || value === undefined) return undefined
    if (t === 'string') typeName = 'String'
    else if (t === 'number') typeName = 'Number'
    else if (t === 'boolean') typeName = 'Boolean'
    else if (Array.isArray(value)) typeName = 'Array'
    else if (t === 'object') {
      // Check constructor name for class instances (including DOM classes)
      typeName = (value as any).constructor?.name || 'Object'
    } else {
      return undefined
    }

    // Walk prototype chain: HTMLInputElement -> HTMLElement -> Element -> Object
    let current: string | undefined = typeName
    while (current) {
      const methods = extensionRegistry.get(current)
      if (methods?.has(methodName)) {
        return methods.get(methodName)
      }
      // Walk up: try parent class (for DOM/custom class hierarchies)
      if (t === 'object' && !Array.isArray(value)) {
        const proto = Object.getPrototypeOf(
          current === typeName ? value : Object.getPrototypeOf(value)
        )
        current = proto?.constructor?.name
        if (current === 'Object' || current === typeName) break
      } else {
        break
      }
    }

    // Fallback: check 'Object' extensions
    const objectMethods = extensionRegistry.get('Object')
    if (objectMethods?.has(methodName)) {
      return objectMethods.get(methodName)
    }

    return undefined
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
    // Structural equality
    Is,
    IsNot,
    tjsEquals,
    // Extensions
    registerExtension: instanceRegisterExtension,
    resolveExtension: instanceResolveExtension,
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
