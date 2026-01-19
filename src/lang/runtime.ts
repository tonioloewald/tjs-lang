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
 * Error marker - identifies TJS error objects
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

/** Current runtime configuration */
let config: TJSConfig = {
  debug: false,
  safety: 'inputs',
  requireReturnTypes: false,
  maxStackSize: 100,
}

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
 * Get the type name for a value (fixed typeof)
 */
export function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  return typeof value
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

/**
 * TJS Runtime object - attached to globalThis.__tjs
 */
export const runtime = {
  version: TJS_VERSION,
  isError,
  error,
  composeErrors,
  typeOf,
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
  // Unsafe mode
  enterUnsafe,
  exitUnsafe,
  isUnsafeMode,
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
 */
export function emitClassWrapper(className: string): string {
  return `
// TJS class wrapper (callable without new)
if (typeof globalThis.__tjs?.wrapClass === 'function') {
  ${className} = globalThis.__tjs.wrapClass(${className})
}
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
