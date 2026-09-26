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
import { parseAgentSource } from './parser-agent'
import { FORBIDDEN_KEYS_SET } from '../forbidden-keys'
import { parse as parseJS } from 'acorn'
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
  // A CALLBACK's `return` returns from the callback, not from the snippet, and boxing it
  // handed `map` a `{ __result }` per element: `[1, 2].map(v => { return v * k })` came back
  // `[null, null]`. Only the snippet's own control flow is walked.
  if (CALLBACK_OPS.has(node.op) && !node.loop) return
  // Recurse into steps (seq, scope, loops), branches (if/else), try/catch, etc. `try` and
  // `catch` were missing, so a `return` inside either went unboxed.
  if (node.steps) wrapReturnValues(node.steps)
  if (node.then) wrapReturnValues(node.then)
  if (node.else) wrapReturnValues(node.else)
  if (node.body) wrapReturnValues(node.body)
  if (node.try) wrapReturnValues(node.try)
  if (node.catch) wrapReturnValues(node.catch)
}

/** Ops whose `steps` are a callback body, with a `return` of their own — unless marked
 * `loop` (a for...of body, whose `return` IS the snippet's). */
const CALLBACK_OPS = new Set(['map', 'reduce', 'memoize', 'cache'])

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
/**
 * Every name used as an IDENTIFIER in a parsed program — references and bindings, including
 * inside template interpolations. Not a non-computed member property (`a.config`) or object
 * key (`{ config: 1 }`), which name no variable, and never a string literal. Iterative, so a
 * deeply nested (but size-capped) program cannot overflow the stack.
 */
function identifiersIn(program: unknown): Set<string> {
  const names = new Set<string>()
  const stack: any[] = [program]
  while (stack.length) {
    const n = stack.pop()
    if (!n || typeof n !== 'object') continue
    if (Array.isArray(n)) {
      for (const x of n) stack.push(x)
      continue
    }
    if (n.type === 'Identifier') names.add(n.name)
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue
      if (
        !n.computed &&
        ((n.type === 'MemberExpression' && k === 'property') ||
          (n.type === 'Property' && k === 'key' && !n.shorthand))
      )
        continue
      const v = n[k]
      if (v && typeof v === 'object') stack.push(v)
    }
  }
  return names
}

/** Does `code` parse, on its own, as ONE JavaScript expression? */
function parsesAsExpression(code: string): boolean {
  try {
    parseJS(`(\n${code}\n)`, { ecmaVersion: 'latest' })
    return true
  } catch {
    return false
  }
}

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

  try {
    // FIRST, and inside the try. Nothing may look at caller-supplied source before this line:
    // the previous fix scanned `code` for names before the gate, so a refused 10MB payload
    // cost ~1.5s of CPU and pinned ~316MB in the literal memos — the pre-fuel DoS the gate
    // exists to close, reintroduced by the fix for it (0.14.0 final re-review, B-1). Inside
    // the try because `Eval` does not throw: the hosted endpoints return `result.error` to the
    // client, so a throw would be a 500 (and an unhandled rejection for anyone without a catch).
    if (typeof code !== 'string') throw new Error('Eval code must be a string')
    checkSourceSize(code, maxSourceBytes, 'Eval source')

    // Expression or statements? An expression is anything that parses as one — which a body
    // containing `return` inside an arrow does, so a `return` token alone cannot decide it.
    // Statement form only when it will NOT parse as an expression and does return.
    const statements =
      !parsesAsExpression(code) && /\breturn\b/.test(maskLiterals(code))
    // Statements run in their own BLOCK, so code may declare a local — `let` or `const` —
    // with a context key's name and shadow it.
    const wrappedCode = statements
      ? `function __eval() { {\n${code}\n} }`
      : `function __eval() { return (\n${code}\n) }`
    // ONE parse: identifiers are read from it before the transform, and it is handed to
    // `transpile` rather than parsed again.
    const parsed = parseAgentSource(wrappedCode)
    const used = identifiersIn(parsed.ast)
    const { ast } = transpile(wrappedCode, { parsed })

    // Box return values in objects for VM strict-return compliance.
    // Walk AST and wrap each { op: 'return', value } into
    // { op: 'return', value: { __result: originalValue } }
    wrapReturnValues(ast)

    // The context reaches the code as VARIABLES, imported at the AST level — never as text.
    //
    // Context values must be declared: atoms resolve names from declared variables, so with a
    // bare wrapper `items.filter(…)` failed with "items is not an array" (0.14.0 docs review).
    // Declaring them as a destructured parameter put caller-controlled key text into the
    // transpiled source, unmeasured by the size cap (80k keys: 76s of pre-fuel transpile). Then
    // a TEXT scan for names ran before the gate, missed names inside template interpolations,
    // and could not see scopes (0.14.0 final re-review, B-1/M-1/M-2). Now: `varsImport`, the
    // step every attempt compiled to, emitted directly — no source to grow.
    //
    // Only keys the code uses as IDENTIFIERS, read from the parse (after the gate), which sees
    // template interpolations and does not see string literals. Importing EVERY key would be
    // worse than it looks: an AJS v1 AST stores a string literal and a variable reference the
    // same way, so a literal equal to an in-scope name reads the variable — with every request
    // argument imported, `?config=…` would redirect `storeGet('config')` in stored code.
    // (That ambiguity is the language's, tracked in TODO.md; this keeps Eval from widening it.)
    //
    // Never a reserved word, a forbidden prototype key, a builtin (`Math`, `JSON`,
    // `parseInt`…) or a global value (`NaN`, `undefined`): a request argument named `Math`
    // must not replace `Math` in stored code.
    const keys = Object.keys(context).filter(
      (k) =>
        used.has(k) &&
        IDENTIFIER.test(k) &&
        !RESERVED.has(k) &&
        !FORBIDDEN_KEYS_SET.has(k) &&
        !SHADOW_PROOF.has(k) &&
        !(k in builtins)
    )
    if (keys.length) (ast as any).steps.unshift({ op: 'varsImport', keys })
    const args = Object.fromEntries(keys.map((key) => [key, context[key]]))
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
