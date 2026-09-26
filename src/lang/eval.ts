/**
 * Safe Eval and SafeFunction - VM-backed dynamic code execution
 *
 * Import this module explicitly when you need to execute code dynamically.
 * This pulls in the AJS transpiler and VM (~50KB gzipped).
 *
 * For static code (pre-transpiled), use the lite runtime instead.
 */

import { AgentVM, setTranspiler } from '../vm/vm'
import { transpile } from './core'
import { FORBIDDEN_KEYS_SET } from '../forbidden-keys'
import { maskLiterals } from '../strip-comments'
import { builtins } from '../vm/runtime'
import { BUILTIN_GLOBALS, BUILTIN_OBJECTS } from './emitters/ast'

// This entry exists to execute SOURCE, so it must supply the transpiler the VM no longer
// imports for itself (see `setTranspiler` in `../vm/vm` — injected so `tjs-lang/vm-ast` can
// ship without a parser). Done explicitly, and at module scope, rather than leaning on some
// other module having been evaluated first: `src/index.ts` learned that lesson the hard way.
// `Eval`/`SafeFunction` already transpile before calling `run()`, so this is belt-and-braces
// for any path here that hands the VM a string.
setTranspiler(transpile as (source: string) => { ast: unknown })

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
  /**
   * HTTP access for the `httpFetch` atom. **Return the response BODY as plain data** — parsed
   * JSON, or text — **not a `Response`**: every capability return crosses a `structuredClone`
   * membrane before it reaches guest code, and a `Response` cannot be cloned, so it is rejected.
   * So `capabilities: { fetch: globalThis.fetch }` never works; wrap it:
   *
   * ```ts
   * fetch: (url, init) => fetch(url, init).then((r) => r.json())
   * ```
   *
   * This used to be typed `typeof globalThis.fetch`, which invited exactly that call, and the
   * README's own example made it (0.14.0 docs review). TypeScript cannot forbid it —
   * `Promise<Response>` is assignable to `Promise<unknown>` — so the contract lives here.
   */
  fetch?: (url: string, init?: Record<string, unknown>) => Promise<unknown>
  /** Console for logging */
  console?: Pick<typeof console, 'log' | 'warn' | 'error'>
  /** Additional capabilities to expose */
  [key: string]: unknown
}

/** A context key that can be declared as a parameter name. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
/** Every identifier-shaped token in a source (run over the literal-masked view). */
const IDENTIFIER_TOKEN = /[A-Za-z_$][A-Za-z0-9_$]*/g
/** Names a context key may never rebind: global values and the VM's builtins. */
const SHADOW_PROOF = new Set([
  'NaN',
  'Infinity',
  'undefined',
  'globalThis',
  ...BUILTIN_OBJECTS,
  ...BUILTIN_GLOBALS,
])
/** Reserved words that are identifiers lexically but cannot name a parameter. */
const RESERVED = new Set(
  'break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof let new null return super switch this throw true try typeof var void while with yield await implements interface package private protected public static arguments eval'.split(
    ' '
  )
)

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

  // Wrap code in a function - detect if it's an expression or has return.
  //
  // The context keys are DECLARED as a destructured parameter. The wrapper used to take no
  // parameters, so context values reached plain expressions (`items.length`) through a fallback
  // but not ATOMS: `items.filter(…)` failed with "filter: items is not an array", because atoms
  // resolve names from declared variables. `SafeFunction` declares its params and never had the
  // problem; every documented example happened to avoid it (0.14.0 docs review). Only keys usable
  // as identifiers can be declared — any other key was never nameable in the code anyway — and
  // the forbidden prototype keys never become variables.
  //
  // Only keys the code NAMES are declared (0.14.0 final review, B-1 + m-1). Declaring every key
  // put caller-controlled text into the transpiled source with nothing measuring it — 80k keys
  // and a one-line body took 7–22s to transpile, before fuel or timeout applied, and hosted
  // endpoints pass request arguments as the context. A key the code never names is unreachable
  // anyway; with this filter each declared name appears in `code`, so the signature is bounded
  // by the source the size cap already measures. Names are found on the literal-masked view, so
  // a key mentioned only inside a string is not declared.
  //
  // A key never shadows a builtin (`Math`, `JSON`, `parseInt`…) or a global value (`NaN`,
  // `undefined`): a request argument named `Math` must not replace `Math` inside stored code.
  const masked = maskLiterals(code)
  const named = new Set(masked.match(IDENTIFIER_TOKEN) ?? [])
  const params = Object.keys(context).filter(
    (k) =>
      named.has(k) &&
      IDENTIFIER.test(k) &&
      !RESERVED.has(k) &&
      !FORBIDDEN_KEYS_SET.has(k) &&
      !SHADOW_PROOF.has(k) &&
      !(k in builtins)
  )
  const signature = params.length ? `{ ${params.join(', ')} }` : ''
  // Tested on the masked view: `'return'` inside a string is not a return statement.
  const hasReturn = /\breturn\b/.test(masked)
  // Statements go in their own BLOCK, so the code may declare a local with a context key's name
  // (`let y = 2` with `context: { y }`) and shadow it, as it could before keys were declared.
  const wrappedCode = hasReturn
    ? `function __eval(${signature}) { {\n${code}\n} }`
    : `function __eval(${signature}) { return (\n${code}\n) }`

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

    // Only the DECLARED keys: the VM validates arguments against the declared parameters, so an
    // undeclared key (not an identifier, or a forbidden prototype key) would reject the whole
    // call — and no code could name one anyway.
    const args = Object.fromEntries(params.map((key) => [key, context[key]]))
    const vmResult = await vm.run(ast, args, {
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
