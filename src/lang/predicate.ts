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
  // TJS-injected pure helpers. Native-TJS predicate bodies are rewritten before
  // they reach the verifier: `==`/`!=` → `Eq`/`NotEq`, the explicit `Is`/`IsNot`
  // operators → `Is`/`IsNot`, `typeof x` → `TypeOf(x)`. All are pure, total
  // functions (footgun-free equality / structural equality / safe typeof), so a
  // predicate that uses TJS equality still verifies as predicate-safe.
  'Eq',
  'NotEq',
  'Is',
  'IsNot',
  'TypeOf',
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
 * A match at `pattern[pos]` for an *unbounded* quantifier (`*`, `+`, `{n,}` and
 * their lazy `?` variants) — the repetitions that drive backtracking blowups.
 * `?`, `{n}` and `{n,m}` are bounded, so they don't count. Returns the consumed
 * length, or 0 if there's no unbounded quantifier here.
 */
function unboundedQuantifierLen(pattern: string, pos: number): number {
  const c = pattern[pos]
  let len = 0
  if (c === '*' || c === '+') {
    len = 1
  } else if (c === '{') {
    // `{n,}` is unbounded; `{n}` / `{n,m}` are bounded.
    const m = pattern.slice(pos).match(/^\{\d+,\}/)
    if (m) len = m[0].length
  }
  if (len === 0) return 0
  // A trailing `?` makes it lazy — still unbounded, still backtracks.
  if (pattern[pos + len] === '?') len++
  return len
}

/**
 * Conservative ReDoS detector: flags a regex whose **star height is ≥ 2** — an
 * unbounded quantifier nested inside a group that is itself unbounded-quantified
 * (the classic `(a+)+`, `(a*)*`, `([a-z]+)*`, `(.*)*` exponential-backtracking
 * shapes). A predicate verifier should fail closed: over-flagging a safe pattern
 * only costs it its "verified" badge (it still runs), whereas certifying a
 * dangerous one is a broken safety promise.
 *
 * Not caught (known limitation, documented): *polynomial* ReDoS from adjacent
 * overlapping quantifiers (`\d+\d+$`, `a.*a.*a`) and alternation-overlap
 * (`(a|a)*`). The exponential class above is the one the safety story commits to.
 *
 * @returns a reason string if risky, else null.
 */
function reDoSRisk(pattern: string): string | null {
  // Per-group frame: did this group contain an unbounded quantifier?
  const stack: Array<{ hadUnbounded: boolean }> = []
  let i = 0
  let inClass = false
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '\\') {
      i += 2 // skip an escaped char (regex escapes are 2 chars here)
      continue
    }
    if (inClass) {
      if (c === ']') inClass = false
      i++
      continue
    }
    if (c === '[') {
      inClass = true
      i++
      continue
    }
    if (c === '(') {
      stack.push({ hadUnbounded: false })
      i++
      continue
    }
    if (c === ')') {
      const frame = stack.pop() ?? { hadUnbounded: false }
      const qlen = unboundedQuantifierLen(pattern, i + 1)
      if (qlen > 0) {
        // This group is itself unbounded-repeated. If it already contained an
        // unbounded quantifier, that's star height ≥ 2 → catastrophic.
        if (frame.hadUnbounded)
          return 'an unbounded quantifier is nested inside another (e.g. `(a+)+`)'
        // The parent group now contains an unbounded repetition (this group).
        if (stack.length) stack[stack.length - 1].hadUnbounded = true
        i += 1 + qlen
        continue
      }
      // No quantifier on this group, but if it contained an unbounded
      // repetition, that repetition lives in the parent's scope too — propagate
      // so `((a+))+` is caught the same as `(a+)+`.
      if (frame.hadUnbounded && stack.length)
        stack[stack.length - 1].hadUnbounded = true
      i++
      continue
    }
    // An unbounded quantifier on a plain atom at the current nesting level.
    const qlen = unboundedQuantifierLen(pattern, i)
    if (qlen > 0) {
      if (stack.length) stack[stack.length - 1].hadUnbounded = true
      i += qlen
      continue
    }
    i++
  }
  return null
}

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
      Literal(n: any) {
        // Regex literals are the one primitive fuel can't bound: a single
        // `.match`/`.test`/`.replace` is opaque to the function-entry fuel hook,
        // so a catastrophic-backtracking pattern could hang on hostile input.
        // Certifying it "safe" would be a false guarantee, so flag it. (Dynamic
        // `RegExp(...)` is already rejected — `RegExp` isn't a pure global and
        // `new` is banned — so only literals need analysis.)
        if (n.regex && typeof n.regex.pattern === 'string') {
          const risk = reDoSRisk(n.regex.pattern)
          if (risk)
            flag(
              `regex /${n.regex.pattern}/ risks catastrophic backtracking (ReDoS): ${risk}. A single match is not fuel-bounded, so it can't be certified predicate-safe — simplify the pattern or validate without it.`,
              n
            )
        }
      },
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

// --- suggestion mining (#4: autocomplete companion) -------------------------

export interface Suggestion {
  value: string
  /**
   * `'value'` — a concrete candidate (a keyword/literal the predicate accepts);
   * `'stub'`  — a partial completion to keep typing (e.g. `var(--`, `calc(`),
   *             mined from a `startsWith(...)` guard. TS's `string` fallback
   *             offers neither; a finite TS union offers only `'value'`.
   */
  kind: 'value' | 'stub'
}

export interface SuggestOptions extends CompilePredicateOptions {
  /** Only return candidates relevant to the text typed so far. */
  prefix?: string
  /** Cap the number of suggestions (default 50). */
  limit?: number
  /**
   * Run each mined *value* through the compiled entry predicate and keep only
   * those that actually pass — so completions are guaranteed valid, not merely
   * enumerated. Default true when the cluster is predicate-safe; stubs are never
   * validated (they're partial by construction).
   */
  validate?: boolean
  /** Entry predicate to validate against (default: last top-level function). */
  entry?: string
}

const isStringLiteral = (n: any): n is { value: string } =>
  n && n.type === 'Literal' && typeof n.value === 'string'

/**
 * Mine a predicate cluster's source for autocomplete candidates. Two sources:
 *   - **values** — string literals compared with `==`/`===` and members of
 *     array literals (the keyword sets a predicate checks membership against).
 *   - **stubs** — the argument of a `.startsWith(...)` guard, surfaced as a
 *     partial completion (`var(--`, `calc(`) the user keeps typing.
 *
 * Pure syntactic mining over the parsed source — no execution. By default the
 * mined *values* are then run through the compiled entry predicate, so the
 * returned set is exactly what the predicate accepts (a literal that only ever
 * appears in a `!=` / negative context is dropped). This is the autocomplete
 * win over a TS `string` fallback (which suggests nothing) and over a finite TS
 * union (which can't offer the open-ended `var(--`/`calc(` stubs).
 */
export function suggest(
  source: string,
  opts: SuggestOptions = {}
): Suggestion[] {
  let ast: any
  try {
    ast = acorn.parse(source, { ecmaVersion: 'latest' })
  } catch {
    return []
  }

  const values = new Set<string>()
  const stubs = new Set<string>()
  walk.simple(ast, {
    BinaryExpression(n: any) {
      if (n.operator === '==' || n.operator === '===') {
        if (isStringLiteral(n.left)) values.add(n.left.value)
        if (isStringLiteral(n.right)) values.add(n.right.value)
      }
    },
    ArrayExpression(n: any) {
      for (const el of n.elements) if (isStringLiteral(el)) values.add(el.value)
    },
    CallExpression(n: any) {
      const callee = n.callee
      if (callee.type !== 'MemberExpression' || callee.computed) return
      const method = callee.property.name
      const arg = n.arguments[0]
      if (!isStringLiteral(arg)) return
      if (method === 'startsWith') stubs.add(arg.value)
      // `.includes('x')` / `.endsWith('x')` aren't standalone completions:
      // includes-arg is a substring, endsWith-arg is a tail — skip both.
    },
  })

  // Validate mined values against the predicate unless told not to / unsafe.
  let accept: ((v: string) => boolean) | null = null
  if (opts.validate !== false) {
    const verified = verifyPredicate(source, opts)
    if (verified.safe && verified.predicates.length) {
      const entry =
        opts.entry ?? verified.predicates[verified.predicates.length - 1]
      try {
        const mod = compilePredicate(source, [entry], opts)
        const fn = mod[entry]
        accept = (v) => {
          try {
            return fn(v) === true
          } catch {
            return false // fuel exhaustion / runtime miss → not a suggestion
          }
        }
      } catch {
        accept = null // not compilable → fall back to raw mining
      }
    }
  }

  const out: Suggestion[] = []
  for (const v of values)
    if (!accept || accept(v)) out.push({ value: v, kind: 'value' })
  for (const s of stubs) out.push({ value: s, kind: 'stub' })

  let filtered = out
  if (opts.prefix) {
    const p = opts.prefix
    filtered = out.filter(
      (s) =>
        s.value.startsWith(p) || (s.kind === 'stub' && p.startsWith(s.value))
    )
  }
  filtered.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'value' ? -1 : 1) ||
      a.value.localeCompare(b.value)
  )
  return opts.limit ? filtered.slice(0, opts.limit) : filtered
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

export interface EmitPredicateResult {
  /** True iff the cluster passed predicate-safety verification. */
  safe: boolean
  /**
   * When `safe`, a self-contained JS **expression** that evaluates to the guard
   * function `(...args) => boolean`. Inline it directly into transpiler output —
   * it carries its own fuel counter (no global `__fuel`, no runtime dependency
   * on the predicate engine or the `PredicateFuelExhausted` class). Undefined
   * when `!safe`.
   */
  code?: string
  /** Verifier diagnostics (the reasons, when `!safe`). */
  diagnostics: PredicateDiagnostic[]
}

/**
 * Verify a predicate cluster and, if safe, emit a **self-contained source
 * expression** for its guard — the transpile-time counterpart to
 * `compilePredicate` (which evals to live closures). This is what lets a
 * verified `Type`/`FunctionPredicate` predicate compile to a fuel-bounded native
 * guard in standalone output: no import of this module, no shared runtime.
 *
 * Fuel model mirrors `compilePredicate` (function-entry `__fuel()` bounds all
 * iteration since loops are rejected), but because a guard answers a boolean
 * question, a runaway input **returns `false`** ("not a valid instance of this
 * type") instead of throwing — DoS-safe validation that never crashes the caller.
 * A deep-recursion stack overflow is the same runaway signal, normalized the
 * same way.
 *
 * The runtime effectful-global shadow that `compilePredicate` applies is omitted
 * here on purpose: a `safe` cluster provably references no effectful global (the
 * static verifier guarantees it), so the shadow would only bloat emitted output.
 *
 * @param source      the predicate cluster (one or more `function` declarations)
 * @param entryName   which declared function is the guard entry point
 * @param opts        verify options + `fuel` budget (default 1,000,000)
 */
export function emitVerifiedPredicate(
  source: string,
  entryName: string,
  opts: CompilePredicateOptions = {}
): EmitPredicateResult {
  const result = verifyPredicate(source, opts)
  if (!result.safe) {
    return { safe: false, diagnostics: result.diagnostics }
  }
  if (!result.predicates.includes(entryName)) {
    return {
      safe: false,
      diagnostics: [
        {
          predicate: entryName,
          message: `entry predicate '${entryName}' not found in the verified cluster`,
          line: 0,
          column: 0,
        },
      ],
    }
  }

  const budget = opts.fuel ?? 1_000_000
  const instrumented = injectFuel(source)

  // A self-contained IIFE: fuel counter in a closure, guard entry re-armed per
  // top-level call, runaway (fuel or stack) → `false`.
  const code =
    `(() => {` +
    `let __f = 0;` +
    `const __fuel = () => { if (--__f < 0) throw new RangeError('tjs:predicate-fuel'); };` +
    `${instrumented}` +
    `return (...__a) => {` +
    `__f = ${budget};` +
    `try { return !!${entryName}(...__a); }` +
    `catch (e) {` +
    `if (e instanceof RangeError && /tjs:predicate-fuel|stack/i.test(e.message)) return false;` +
    `throw e;` +
    `}` +
    `};` +
    `})()`

  return { safe: true, code, diagnostics: [] }
}

// --- $predicate evaluator (#6: the tosijs-schema integration point) ---------

export interface PredicateEvaluatorOptions extends CompilePredicateOptions {
  /**
   * Called once per source that fails to verify/compile. Default: `console.warn`.
   * The evaluator fails **closed** on such a source (returns `false`), so an
   * unverifiable `$predicate` can never validate a value as `true`.
   */
  onUnsafe?: (source: string, error: Error) => void
}

/**
 * Build a pluggable `$predicate` evaluator: `(source, value) => boolean`.
 *
 * This is the bridge for a predicate-aware JSON-Schema validator that lives in
 * another package (e.g. `tosijs-schema`, which cannot depend on `tjs-lang` — the
 * dependency runs the other way). Such a validator stays zero-dep and exposes a
 * hook; a consumer that has this engine injects an evaluator built here.
 *
 * Each distinct source is verified + compiled **once** and cached, so repeated
 * validation is just a native call. Semantics match `compilePredicateSchema`:
 * the LAST top-level function is the entry; a source that isn't predicate-safe
 * (or throws / exhausts fuel at runtime) yields `false` — never a thrown error
 * mid-validation, never a silent pass.
 */
export function createPredicateEvaluator(
  opts: PredicateEvaluatorOptions = {}
): (source: string, value: unknown) => boolean {
  const { onUnsafe, ...compileOpts } = opts
  const cache = new Map<string, ((value: unknown) => boolean) | null>()
  const warned = new Set<string>()

  return (source: string, value: unknown): boolean => {
    let fn = cache.get(source)
    if (fn === undefined) {
      try {
        const names = verifyPredicate(source, compileOpts).predicates
        const entry = names[names.length - 1]
        if (!entry) throw new Error('$predicate declares no function')
        const mod = compilePredicate(source, [entry], compileOpts)
        fn = mod[entry] as (value: unknown) => boolean
      } catch (e) {
        fn = null // fail closed
        if (!warned.has(source)) {
          warned.add(source)
          const err = e instanceof Error ? e : new Error(String(e))
          if (onUnsafe) onUnsafe(source, err)
          else
            console.warn(
              `[tjs-lang] $predicate not verifiable — failing closed: ${err.message}`
            )
        }
      }
      cache.set(source, fn)
    }
    if (fn === null) return false
    try {
      return fn(value) === true
    } catch {
      return false // fuel exhaustion / runtime miss → not valid
    }
  }
}
