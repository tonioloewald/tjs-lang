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
  } = options

  const vm = getVM()

  // Wrap code in a function - detect if it's an expression or has return
  const hasReturn = /\breturn\b/.test(code)
  const wrappedCode = hasReturn
    ? `function __eval() { ${code} }`
    : `function __eval() { return (${code}) }`

  try {
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
  } = options

  const vm = getVM()

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
