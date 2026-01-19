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
}

/**
 * Runtime configuration
 */
export interface TJSConfig {
  /** Enable debug mode - captures call stacks in errors */
  debug?: boolean
}

/** Current runtime configuration */
let config: TJSConfig = { debug: false }

/** Current call stack (only tracked in debug mode) */
const callStack: string[] = []

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
 */
export function pushStack(name: string): void {
  if (config.debug) {
    callStack.push(name)
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
 * Wrap a function with monadic type checking
 *
 * @param fn - The original function
 * @param meta - The __tjs metadata
 * @returns Wrapped function that validates inputs and propagates errors
 */
export function wrap<T extends (...args: any[]) => any>(
  fn: T,
  meta: { params: Record<string, any>; returns?: any }
): T {
  // Pre-compute param info at wrap time (not per-call)
  const paramEntries = Object.entries(meta.params)
  const paramCount = paramEntries.length
  const hasReturns = !!meta.returns
  const funcName = fn.name

  const wrapped = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    // Fast path: check for error as first arg
    if (args.length > 0 && isError(args[0])) {
      return args[0] as ReturnType<T>
    }

    // Detect if single object arg (named params) vs positional
    const isNamedCall =
      args.length === 1 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !Array.isArray(args[0])

    // Fast positional validation (avoids object allocation)
    if (!isNamedCall) {
      for (let i = 0; i < paramCount; i++) {
        const [name, param] = paramEntries[i]
        const value = args[i]

        // Check for error propagation
        if (isError(value)) return value as ReturnType<T>

        // Check required
        if (param.required && value === undefined) {
          return error(`Missing required parameter '${name}'`, {
            path: funcName ? `${funcName}.${name}` : name,
            expected:
              typeof param.type === 'string'
                ? param.type
                : param.type?.description || 'value',
            actual: 'undefined',
            loc: param.loc,
          }) as ReturnType<T>
        }

        // Type check (skip undefined optional)
        if (value !== undefined) {
          const typeErr = checkType(
            value,
            param.type,
            funcName ? `${funcName}.${name}` : name
          )
          if (typeErr) {
            if (param.loc) typeErr.loc = param.loc
            return typeErr as ReturnType<T>
          }
        }
      }
    } else {
      // Named args path (slower, but supports object destructuring)
      const namedArgs = args[0] as Record<string, unknown>
      for (let i = 0; i < paramCount; i++) {
        const [name, param] = paramEntries[i]
        const value = namedArgs[name]

        if (isError(value)) return value as ReturnType<T>

        if (param.required && value === undefined) {
          return error(`Missing required parameter '${name}'`, {
            path: funcName ? `${funcName}.${name}` : name,
            expected:
              typeof param.type === 'string'
                ? param.type
                : param.type?.description || 'value',
            actual: 'undefined',
            loc: param.loc,
          }) as ReturnType<T>
        }

        if (value !== undefined) {
          const typeErr = checkType(
            value,
            param.type,
            funcName ? `${funcName}.${name}` : name
          )
          if (typeErr) {
            if (param.loc) typeErr.loc = param.loc
            return typeErr as ReturnType<T>
          }
        }
      }
    }

    // Push onto call stack in debug mode
    pushStack(funcName)

    try {
      // Execute function
      const result = fn.apply(this, args)

      // Check result type if specified
      if (hasReturns && !isError(result)) {
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
 * TJS Runtime object - attached to globalThis.__tjs
 */
export const runtime = {
  version: TJS_VERSION,
  isError,
  error,
  typeOf,
  checkType,
  validateArgs,
  wrap,
  compareVersions,
  versionsCompatible,
  // Debug mode
  configure,
  getConfig,
  pushStack,
  popStack,
  getStack,
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
 */
export function emitRuntimeWrapper(funcName: string): string {
  return `
// TJS runtime wrapper
if (typeof ${funcName}.__tjs === 'object' && typeof globalThis.__tjs?.wrap === 'function') {
  ${funcName} = globalThis.__tjs.wrap(${funcName}, ${funcName}.__tjs)
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
