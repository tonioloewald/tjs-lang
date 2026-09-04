/**
 * Safe Eval and SafeFunction - VM-backed dynamic code execution
 *
 * Import this module explicitly when you need to execute code dynamically.
 * This pulls in the AJS transpiler and VM (~50KB gzipped).
 *
 * For static code (pre-transpiled), use the lite runtime instead.
 */

import { AgentVM } from '../vm/vm'
import { transpile } from './core'

// Singleton VM instance (lazy)
let _vm: AgentVM<Record<string, never>> | null = null
const getVM = () => (_vm ??= new AgentVM())

/**
 * Walk an AST and wrap return values in { __result: value } objects.
 * This lets Eval/SafeFunction return arbitrary values through the VM,
 * which enforces strict object returns for agent composability.
 */
function wrapReturnValues(node: any): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) wrapReturnValues(child)
    return
  }
  if (node.op === 'return' && 'value' in node) {
    node.value = { __result: node.value }
  }
  // Recurse into steps (seq), branches (if/else), etc.
  if (node.steps) wrapReturnValues(node.steps)
  if (node.then) wrapReturnValues(node.then)
  if (node.else) wrapReturnValues(node.else)
  if (node.body) wrapReturnValues(node.body)
}

/** Capabilities that can be injected into SafeFunction/Eval */
export interface SafeCapabilities {
  /** Fetch function for HTTP requests */
  fetch?: typeof globalThis.fetch
  /** Console for logging */
  console?: Pick<typeof console, 'log' | 'warn' | 'error'>
  /** Additional capabilities to expose */
  [key: string]: unknown
}

/** Options for Eval */
export interface EvalOptions {
  /** Code to evaluate (expression or statements with return) */
  code: string
  /** Context variables available to the code */
  context?: Record<string, unknown>
  /** Fuel budget (default: 1000) */
  fuel?: number
  /** Timeout in milliseconds (default: fuel * 10) */
  timeoutMs?: number
  /** Capabilities to inject (fetch, console, etc.) */
  capabilities?: SafeCapabilities
  /**
   * Maximum bytes of source accepted, refused BEFORE transpilation (default 64 KB).
   *
   * `fuel` and `timeoutMs` are properties of `vm.run`, and transpilation happens before it —
   * so neither bounds the compile. `preprocess` is super-linear in source length, and the
   * measured cost with `fuel: 10, timeoutMs: 1` was 0.1s at 50 KB, 0.8s at 200 KB, 3.9s at
   * 500 KB and ~145s at 1.8 MB, charging 0.2 fuel throughout. One request pins a core for
   * minutes at zero metered cost, which on a hosted endpoint is a denial-of-wallet as much as
   * a denial-of-service.
   *
   * The cap is on BYTES because that is the input the caller controls and the only quantity
   * knowable before the expensive step. Set `0` to disable — meaningful only when the source
   * is trusted, e.g. compiled from your own repository at build time.
   */
  maxSourceBytes?: number
}

/** Default source-length cap. 64 KB is far above any hand-written agent and transpiles in
 * well under a tenth of a second; the smallest payload that showed material cost was ~10×
 * this. */
export const DEFAULT_MAX_SOURCE_BYTES = 64 * 1024

/**
 * Refuse oversized source before it reaches the transpiler.
 *
 * Byte length, not `String.length`: the attacker supplies bytes, and a multi-byte payload
 * would otherwise buy several times the intended budget.
 */
function checkSourceSize(code: string, max: number, what: string): void {
  if (max <= 0) return
  const bytes = Buffer.byteLength(code, 'utf8')
  if (bytes > max) {
    throw new Error(
      `${what} is ${bytes} bytes, over the ${max}-byte limit. Transpilation runs BEFORE ` +
        `fuel and timeout apply, so oversized source is refused rather than metered. ` +
        `Raise or disable it with maxSourceBytes if the source is trusted.`
    )
  }
}

/**
 * Safely evaluate code in a sandboxed VM with fuel metering
 */
export async function Eval(options: EvalOptions): Promise<{
  result: unknown
  fuelUsed: number
  error?: { message: string }
}> {
  const {
    code,
    context = {},
    fuel = 1000,
    timeoutMs,
    capabilities = {},
    maxSourceBytes = DEFAULT_MAX_SOURCE_BYTES,
  } = options

  const vm = getVM()

  // Wrap code in a function - detect if it's an expression or has return
  const hasReturn = /\breturn\b/.test(code)
  const wrappedCode = hasReturn
    ? `function __eval() { ${code} }`
    : `function __eval() { return (${code}) }`

  try {
    // Inside the try, so an oversized payload comes back as `{ error }` like every other
    // rejection from this function. `Eval` does not throw — the hosted endpoints call it and
    // return `result.error` to the client — so a size check that threw would turn a refusal
    // into a 500 and, worse, into an unhandled rejection for anyone who never wrote a catch.
    // Deliberate asymmetry with `SafeFunction`, which throws on bad input already.
    checkSourceSize(code, maxSourceBytes, 'Eval source')

    const { ast } = transpile(wrappedCode)

    // Box return values in objects for VM strict-return compliance.
    // Walk AST and wrap each { op: 'return', value } into
    // { op: 'return', value: { __result: originalValue } }
    wrapReturnValues(ast)

    const vmResult = await vm.run(ast, context, {
      fuel,
      timeoutMs,
      capabilities,
    })

    // Unwrap the boxed result
    const raw = vmResult.result
    const result =
      raw && typeof raw === 'object' && '__result' in raw ? raw.__result : raw

    return {
      result,
      fuelUsed: vmResult.fuelUsed,
      error: vmResult.error
        ? { message: vmResult.error.message || String(vmResult.error) }
        : undefined,
    }
  } catch (err: any) {
    return {
      result: undefined,
      fuelUsed: fuel,
      error: { message: err.message || String(err) },
    }
  }
}

/** Options for SafeFunction */
export interface SafeFunctionOptions {
  /** Function body code */
  body: string
  /** Parameter names (in order) */
  params?: string[]
  /** Fuel budget per invocation (default: 1000) */
  fuel?: number
  /** Timeout in milliseconds (default: fuel * 10) */
  timeoutMs?: number
  /** Capabilities to inject (fetch, console, etc.) */
  capabilities?: SafeCapabilities
  /** Max bytes of `body` accepted, refused before transpilation. See EvalOptions. */
  maxSourceBytes?: number
}

/**
 * Create a reusable sandboxed function with fuel metering
 */
export async function SafeFunction(options: SafeFunctionOptions): Promise<
  (...args: unknown[]) => Promise<{
    result: unknown
    fuelUsed: number
    error?: { message: string }
  }>
> {
  const {
    body,
    params = [],
    fuel = 1000,
    timeoutMs,
    capabilities = {},
    maxSourceBytes = DEFAULT_MAX_SOURCE_BYTES,
  } = options

  const vm = getVM()

  checkSourceSize(body, maxSourceBytes, 'SafeFunction body')

  // Build function source with parameters
  const paramList = params.join(', ')
  const source = `function __safeFn(${paramList}) { ${body} }`

  // Pre-compile the AST (done once at creation time)
  const { ast } = transpile(source)

  // Box return values for VM strict-return compliance
  wrapReturnValues(ast)

  // Return a function that runs the pre-compiled AST
  return async (...args: unknown[]) => {
    const context: Record<string, unknown> = {}
    for (let i = 0; i < params.length; i++) {
      context[params[i]] = args[i]
    }

    try {
      const vmResult = await vm.run(ast, context, {
        fuel,
        timeoutMs,
        capabilities,
      })

      // Unwrap the boxed result
      const raw = vmResult.result
      const result =
        raw && typeof raw === 'object' && '__result' in raw ? raw.__result : raw

      return {
        result,
        fuelUsed: vmResult.fuelUsed,
        error: vmResult.error
          ? { message: vmResult.error.message || String(vmResult.error) }
          : undefined,
      }
    } catch (err: any) {
      return {
        result: undefined,
        fuelUsed: fuel,
        error: { message: err.message || String(err) },
      }
    }
  }
}
