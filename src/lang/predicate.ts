/**
 * Predicate-safety verifier.
 *
 * A *predicate* is a pure, synchronous function of its inputs. A cluster of
 * predicates is **predicate-safe** iff every function in it uses only pure
 * constructs and calls only pure builtins, pure globals, or other
 * predicate-safe predicates — a closure property, so the cluster is safe iff
 * each function is. Verified predicates have "earned" the native fast path:
 * they compile to plain synchronous JS where ergonomic composition
 * (`isHex(v) || isVar(v)`, `tokens.every(isToken)`, recursion) just works.
 *
 * This is pure static analysis over the parsed source, so it has none of the VM
 * interpreter's restrictions (calls-in-expressions, named callbacks) — it
 * accepts the ergonomic source and certifies it. The serializable AJS AST stays
 * the portable form (the "missing computational half" of JSON Schema); native
 * JS is the execution form.
 *
 * Effect classification of atoms comes from the VM's `effects` tag — pass
 * `effectfulFromAtoms(registry)` for atom-aware checking; without it, atom calls
 * still fail closed as "unknown reference". See `experiments/predicates/` for
 * the CSS torture set and `src/vm/atom-effects.test.ts` for the drift guard.
 */
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

export interface PredicateDiagnostic {
  /** Name of the predicate the problem is in. */
  predicate: string
  message: string
  line: number
  column: number
}

export interface PredicateVerifyResult {
  safe: boolean
  /** Names of the top-level functions found (the predicate cluster). */
  predicates: string[]
  diagnostics: PredicateDiagnostic[]
}

export interface VerifyPredicateOptions {
  /**
   * Names that are effectful and must not be called — IO atoms + JS IO globals.
   * Compose from the atom registry with `effectfulFromAtoms`. The built-in JS IO
   * globals are always included.
   */
  effectful?: Set<string>
  /**
   * Externally-verified predicate names this source may compose with (a shared
   * registry), in addition to the functions declared in `source`.
   */
  knownPredicates?: Set<string>
}

// --- the safe substrate -----------------------------------------------------

/** Pure deterministic globals callable by bare name. */
const PURE_GLOBALS = new Set([
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURIComponent',
  'decodeURIComponent',
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
])

/** Namespaces whose static methods are pure (with effectful exceptions below). */
const PURE_NAMESPACES = new Set([
  'Math',
  'JSON',
  'Object',
  'Array',
  'String',
  'Number',
])

/** Static members that are NOT pure even on a pure namespace. */
const EFFECTFUL_STATICS = new Set(['Math.random', 'Date.now'])

/**
 * Instance methods known to be pure regardless of receiver type. A method call
 * whose method name isn't here (and whose receiver isn't a pure namespace) is
 * flagged — so `x.then()`, `obj.fetch()`, `arr.push()` (mutates) don't pass.
 */
const PURE_INSTANCE_METHODS = new Set([
  // string
  'startsWith',
  'endsWith',
  'includes',
  'indexOf',
  'lastIndexOf',
  'slice',
  'substring',
  'substr',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'trimStart',
  'trimEnd',
  'split',
  'replace',
  'replaceAll',
  'match',
  'matchAll',
  'charAt',
  'charCodeAt',
  'codePointAt',
  'padStart',
  'padEnd',
  'repeat',
  'concat',
  'at',
  'normalize',
  'search',
  'localeCompare',
  // array (non-mutating)
  'every',
  'some',
  'map',
  'filter',
  'reduce',
  'reduceRight',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flat',
  'flatMap',
  'join',
  'keys',
  'entries',
  'values',
  'forEach',
  // regexp
  'test',
  'exec',
  // number / shared
  'toFixed',
  'toPrecision',
  'toString',
  'valueOf',
  'hasOwnProperty',
])

/** JS globals that perform IO / are nondeterministic / have side effects. */
const EFFECTFUL_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Date',
  'console',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'queueMicrotask',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'document',
  'window',
  'globalThis',
  'self',
  'process',
  'require',
  'eval',
  'Function',
  'import',
  'crypto',
  'performance',
  'navigator',
]

/**
 * Build the effectful-name set from a VM atom registry: every atom tagged
 * `effects: 'io'`, plus the built-in JS IO globals. This is how the verifier
 * consumes the atom-effects classification (the keystone).
 */
export function effectfulFromAtoms(
  atoms: Record<string, { op?: string; effects?: 'pure' | 'io' }>
): Set<string> {
  const set = new Set(EFFECTFUL_GLOBALS)
  for (const [name, atom] of Object.entries(atoms)) {
    if (atom?.effects === 'io') set.add(atom.op ?? name)
  }
  return set
}

// --- the verifier -----------------------------------------------------------

/**
 * Verify every top-level function declaration in `source` is predicate-safe.
 * Returns all diagnostics; `safe` is true iff there are none (closure property).
 */
export function verifyPredicate(
  source: string,
  opts: VerifyPredicateOptions = {}
): PredicateVerifyResult {
  const effectful = opts.effectful ?? new Set(EFFECTFUL_GLOBALS)
  let ast: any
  try {
    ast = acorn.parse(source, { ecmaVersion: 'latest', locations: true })
  } catch (e: any) {
    return {
      safe: false,
      predicates: [],
      diagnostics: [
        {
          predicate: '<source>',
          message: `parse error: ${e.message}`,
          line: e.loc?.line ?? 0,
          column: e.loc?.column ?? 0,
        },
      ],
    }
  }

  const predicateNames = new Set<string>(opts.knownPredicates ?? [])
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' && node.id)
      predicateNames.add(node.id.name)
  }

  const diagnostics: PredicateDiagnostic[] = []

  for (const fn of ast.body) {
    if (fn.type !== 'FunctionDeclaration' || !fn.id) continue
    const pname = fn.id.name
    const flag = (message: string, n: any) =>
      diagnostics.push({
        predicate: pname,
        message,
        line: n?.loc?.start?.line ?? 0,
        column: n?.loc?.start?.column ?? 0,
      })

    const loop = (n: any) =>
      flag(
        'loops are not allowed — iterate with recursion or array methods (every/some/map/filter/reduce) so work stays fuel-bounded',
        n
      )
    walk.simple(fn, {
      AwaitExpression(n: any) {
        flag('`await` not allowed — predicates must be synchronous', n)
      },
      NewExpression(n: any) {
        flag('`new` not allowed in a predicate (non-pure construction)', n)
      },
      WhileStatement: loop,
      DoWhileStatement: loop,
      ForStatement: loop,
      ForInStatement: loop,
      ForOfStatement: loop,
      CallExpression(n: any) {
        const callee = n.callee
        // Bare call: f(...)
        if (callee.type === 'Identifier') {
          const name = callee.name
          if (effectful.has(name))
            flag(`'${name}' is effectful — not allowed in a predicate`, callee)
          else if (predicateNames.has(name)) {
            /* composition with another predicate — OK */
          } else if (PURE_GLOBALS.has(name)) {
            /* pure global — OK */
          } else {
            flag(
              `unknown reference '${name}' — not a predicate or pure builtin`,
              callee
            )
          }
          return
        }
        // Method call: recv.method(...)
        if (callee.type === 'MemberExpression' && !callee.computed) {
          const method = callee.property.name
          const recv = callee.object
          if (recv.type === 'Identifier' && effectful.has(recv.name)) {
            flag(`'${recv.name}.${method}' is effectful`, callee)
          } else if (
            recv.type === 'Identifier' &&
            PURE_NAMESPACES.has(recv.name)
          ) {
            if (EFFECTFUL_STATICS.has(`${recv.name}.${method}`))
              flag(`'${recv.name}.${method}' is nondeterministic`, callee)
            // else pure namespace method — OK
          } else if (!PURE_INSTANCE_METHODS.has(method)) {
            flag(
              `method '.${method}()' is not a known pure method`,
              callee.property
            )
          }
          return
        }
        // Anything else (computed member, call-of-call, etc.) — be conservative.
        flag('unsupported call form in a predicate', callee)
      },
    })
  }

  return {
    safe: diagnostics.length === 0,
    predicates: [...predicateNames],
    diagnostics,
  }
}

/** Format diagnostics for a thrown error / log. */
export function formatPredicateDiagnostics(d: PredicateDiagnostic[]): string {
  return d
    .map((x) => `  ${x.predicate} (${x.line}:${x.column}): ${x.message}`)
    .join('\n')
}

/** Thrown when a predicate exceeds its fuel budget (likely a pathological input). */
export class PredicateFuelExhausted extends Error {
  constructor(budget: number) {
    super(`predicate exceeded its fuel budget (${budget})`)
    this.name = 'PredicateFuelExhausted'
  }
}

export interface CompilePredicateOptions extends VerifyPredicateOptions {
  /** Max fuel per top-level predicate call (default 1,000,000). */
  fuel?: number
}

/**
 * Inject `__fuel()` at every function-body entry and comma-wrap expression-body
 * arrows, by splicing at source offsets (no codegen needed). Because loops are
 * rejected, function-entry fuel bounds all iteration: recursion costs fuel per
 * call, and array-method callbacks (`xs.every(p)`) cost fuel per element via the
 * callback's own entry.
 */
function injectFuel(source: string): string {
  const ast = acorn.parse(source, { ecmaVersion: 'latest' }) as any
  // Each edit: [offset, text]. Applied descending so offsets stay valid.
  const edits: Array<[number, string]> = []
  const enterBlockBody = (n: any) => edits.push([n.body.start + 1, '__fuel();'])
  walk.simple(ast, {
    FunctionDeclaration: enterBlockBody,
    FunctionExpression: enterBlockBody,
    ArrowFunctionExpression(n: any) {
      if (n.body.type === 'BlockStatement') {
        edits.push([n.body.start + 1, '__fuel();'])
      } else {
        // expression-body arrow: `x => EXPR`  →  `x => (__fuel(), EXPR)`
        edits.push([n.body.start, '(__fuel(), '])
        edits.push([n.body.end, ')'])
      }
    },
  })
  edits.sort((a, b) => b[0] - a[0])
  let out = source
  for (const [off, text] of edits)
    out = out.slice(0, off) + text + out.slice(off)
  return out
}

/**
 * Verify, then compile the cluster to native synchronous JS functions —
 * **fuel-bounded and global-shadowed**. Throws (with located diagnostics) at
 * definition time if not predicate-safe.
 *
 * Each compiled predicate runs with a fresh fuel budget; a runaway input throws
 * `PredicateFuelExhausted` rather than hanging. The effectful globals are
 * shadowed to `undefined` as defense-in-depth beneath the static verifier.
 *
 * NOTE: preserves JS semantics (no structural-`==` rewrite yet — a future
 * opt-in). Emission is offset-spliced source, not a full AJS-AST→JS codegen.
 */
export function compilePredicate(
  source: string,
  exportNames: string[],
  opts: CompilePredicateOptions = {}
): Record<string, (...args: any[]) => any> {
  const result = verifyPredicate(source, opts)
  if (!result.safe)
    throw new Error(
      `Not predicate-safe:\n${formatPredicateDiagnostics(result.diagnostics)}`
    )

  const budget = opts.fuel ?? 1_000_000
  const instrumented = injectFuel(source)

  // Shadow the effectful globals to undefined (defense-in-depth under the
  // verifier), and inject the fuel hook. `new Function` params shadow globals.
  // Exclude reserved words that can't be parameter names (still verifier-rejected).
  const shadowed = EFFECTFUL_GLOBALS.filter(
    (g) => g !== 'import' && g !== 'eval' && g !== 'arguments'
  )
  const factory = new Function(
    '__fuel',
    ...shadowed,
    `"use strict";\n${instrumented}\n;return { ${exportNames.join(', ')} };`
  )

  let fuel = 0
  const fuelHook = () => {
    if (--fuel < 0) throw new PredicateFuelExhausted(budget)
  }
  const raw = factory(fuelHook, ...shadowed.map(() => undefined))

  // Each top-level call gets a fresh budget; inner composed calls share it.
  // A stack overflow (deep recursion past the JS frame limit before fuel runs
  // out) is the same "runaway" signal, so normalize it to PredicateFuelExhausted.
  const wrapped: Record<string, (...args: any[]) => any> = {}
  for (const name of exportNames) {
    const fn = raw[name]
    wrapped[name] = (...args: any[]) => {
      fuel = budget
      try {
        return fn(...args)
      } catch (e) {
        if (e instanceof RangeError && /stack/i.test(e.message))
          throw new PredicateFuelExhausted(budget)
        throw e
      }
    }
  }
  return wrapped
}
