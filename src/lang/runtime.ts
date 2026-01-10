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

export const TJS_VERSION = '0.1.0'

/**
 * Error marker - identifies TJS error objects
 */
export interface TJSError {
  $error: true
  message: string
  path?: string // e.g. "add.a" for param 'a' of function 'add'
  expected?: string
  actual?: string
  cause?: Error | TJSError
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
 */
export function error(
  message: string,
  details?: Partial<Omit<TJSError, '$error' | 'message'>>
): TJSError {
  return {
    $error: true,
    message,
    ...details,
  }
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
 */
export function checkType(
  value: unknown,
  expected: string,
  path?: string
): TJSError | null {
  // If value is already an error, propagate it
  if (isError(value)) return value

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

/**
 * Validate function arguments against __tjs metadata
 * Returns first error found, or null if all valid
 */
export function validateArgs(
  args: Record<string, unknown>,
  meta: {
    params: Record<
      string,
      { type: string; required: boolean; default?: unknown }
    >
  },
  funcName?: string
): TJSError | null {
  for (const [name, param] of Object.entries(meta.params)) {
    const value = args[name]

    // Check if any arg is already an error - propagate first one
    if (isError(value)) return value

    // Check required
    if (param.required && value === undefined) {
      return error(`Missing required parameter '${name}'`, {
        path: funcName ? `${funcName}.${name}` : name,
        expected: param.type,
        actual: 'undefined',
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
    if (typeError) return typeError
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
  const wrapped = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    // Convert positional args to named args if needed
    const paramNames = Object.keys(meta.params)
    const namedArgs: Record<string, unknown> =
      args.length === 1 && typeof args[0] === 'object' && args[0] !== null
        ? args[0]
        : Object.fromEntries(paramNames.map((name, i) => [name, args[i]]))

    // Check for errors in args first
    for (const value of Object.values(namedArgs)) {
      if (isError(value)) return value as ReturnType<T>
    }

    // Validate types
    const validationError = validateArgs(namedArgs, meta, fn.name)
    if (validationError) return validationError as ReturnType<T>

    // Execute function
    try {
      const result = fn.apply(this, args)

      // Check result type if specified
      if (meta.returns && !isError(result)) {
        const returnError = checkType(result, meta.returns.type, `${fn.name}()`)
        if (returnError) return returnError as ReturnType<T>
      }

      return result
    } catch (e) {
      // Convert thrown errors to TJS errors
      return error((e as Error).message || String(e), {
        path: fn.name,
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
}

/**
 * Install runtime globally (idempotent, version-checked)
 */
export function installRuntime(): typeof runtime {
  const g = globalThis as any

  if (g.__tjs) {
    // Already installed - check version compatibility
    if (g.__tjs.version !== TJS_VERSION) {
      console.warn(
        `TJS runtime version mismatch: ${g.__tjs.version} vs ${TJS_VERSION}`
      )
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
