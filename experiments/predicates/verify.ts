/**
 * PoC: predicate-safe verifier + native runner.
 *
 * Thesis: a *predicate* is a pure, synchronous function of its inputs. If a
 * cluster of predicates is verified to use only pure builtins + other
 * predicate-safe predicates (no IO, no async, no escape), it has "earned" the
 * native fast path — it can compile to plain synchronous JS, where the
 * ergonomic composition (`isHex(v) || isVar(v)`, `tokens.every(isToken)`) just
 * works, instead of being contorted through the sandboxed VM interpreter.
 *
 * `predicate-safe` is a closure property, defined recursively:
 *   safe(f) ⟺ f uses only pure constructs AND every name it calls is a pure
 *             builtin, a pure global, or itself predicate-safe.
 * Verification is a transitive, cycle-safe AST walk — the static-analysis twin
 * of the callLocal/helper resolution (cycles ⇒ "already trusted", like the
 * helper transform's in-progress set), so recursive/mutually-recursive
 * predicates are fine.
 *
 * This is a spike: member calls are treated as pure (a production verifier
 * would whitelist receiver+method); fuel injection for runtime CPU-bounding is
 * a follow-up. The point is to prove "ergonomic composition in → verified-safe,
 * native-fast out" on the case TS/JSON-Schema most spectacularly fail: CSS.
 */
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

export interface PredicateDiagnostic {
  predicate: string
  message: string
  line: number
  column: number
}

export interface VerifyResult {
  safe: boolean
  predicates: string[]
  diagnostics: PredicateDiagnostic[]
}

/** Pure, deterministic globals a predicate may call by bare name. */
const PURE_GLOBALS = new Set([
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Math',
  'JSON',
])

/**
 * Names that perform IO / are effectful — calling any of these makes a function
 * NOT predicate-safe. This now derives from the real atom `effects: 'io'` tag
 * (the keystone): pass `effectfulFrom(atomRegistry)`. The literals here are the
 * non-atom globals a predicate also must not call.
 */
const NON_ATOM_EFFECTFUL = ['fetch', 'sleep', 'now', 'Date']

/**
 * Convenience default when no atom registry is supplied: non-atom globals plus
 * the well-known IO atom names. `effectfulFrom(registry)` is the authoritative,
 * tag-driven source — prefer it.
 */
const DEFAULT_EFFECTFUL = new Set([
  ...NON_ATOM_EFFECTFUL,
  'httpFetch',
  'storeGet',
  'storeSet',
  'storeQuery',
  'storeVectorSearch',
  'llmPredict',
  'agentRun',
  'transpileCode',
  'runCode',
  'random',
  'uuid',
  'storeVectorize',
  'storeSearch',
  'storeVectorAdd',
  'llmPredictBattery',
  'llmVision',
])

/**
 * Build the effectful-name set from a VM atom registry: every atom tagged
 * `effects: 'io'` (plus the non-atom globals). This is how the predicate
 * verifier consumes the atom-effects classification.
 */
export function effectfulFrom(
  atoms: Record<string, { op?: string; effects?: 'pure' | 'io' }>
): Set<string> {
  const set = new Set(NON_ATOM_EFFECTFUL)
  for (const [name, atom] of Object.entries(atoms)) {
    if (atom?.effects === 'io') set.add(atom.op ?? name)
  }
  return set
}

/**
 * Verify every top-level function in `source` is predicate-safe. Because safety
 * is a closure property, the whole cluster is safe iff each function is — so the
 * transitive check is automatic: a call to another function in the set is fine,
 * a call to anything effectful/unknown is not.
 */
export function verifyPredicates(
  source: string,
  opts: { effectful?: Set<string> } = {}
): VerifyResult {
  const effectful = opts.effectful ?? DEFAULT_EFFECTFUL
  const ast = acorn.parse(source, {
    ecmaVersion: 'latest',
    locations: true,
  }) as any

  // The predicate set = every top-level function declaration.
  const predicateNames = new Set<string>()
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' && node.id)
      predicateNames.add(node.id.name)
  }

  const diagnostics: PredicateDiagnostic[] = []

  for (const fn of ast.body) {
    if (fn.type !== 'FunctionDeclaration' || !fn.id) continue
    const pname = fn.id.name
    const at = (n: any) => ({
      line: n?.loc?.start?.line ?? 0,
      column: n?.loc?.start?.column ?? 0,
    })
    const flag = (message: string, n: any) =>
      diagnostics.push({ predicate: pname, message, ...at(n) })

    walk.simple(fn, {
      AwaitExpression(n: any) {
        flag('`await` not allowed — predicates must be synchronous', n)
      },
      NewExpression(n: any) {
        flag('`new` not allowed in a predicate (non-pure construction)', n)
      },
      CallExpression(n: any) {
        const callee = n.callee
        // Method calls (v.startsWith(...), xs.every(...), /re/.test(v),
        // Object.keys(o), Math.max(...)) are pure builtins in this spike.
        if (callee.type !== 'Identifier') return
        const name = callee.name
        if (effectful.has(name))
          flag(`'${name}' performs IO — not allowed in a predicate`, callee)
        else if (predicateNames.has(name)) {
          /* composition with another predicate — the Lego case, OK */
        } else if (PURE_GLOBALS.has(name)) {
          /* pure global, OK */
        } else {
          flag(
            `unknown reference '${name}' — not a predicate or pure builtin`,
            callee
          )
        }
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
export function formatDiagnostics(d: PredicateDiagnostic[]): string {
  return d
    .map((x) => `  ${x.predicate} (${x.line}:${x.column}): ${x.message}`)
    .join('\n')
}

/**
 * Verify, then compile the predicate cluster to native synchronous JS functions.
 * Throws (with located diagnostics) at "definition time" if not predicate-safe —
 * so an IO-using "predicate" never even compiles.
 */
export function compilePredicates(
  source: string,
  exports: string[],
  opts?: { effectful?: Set<string> }
): Record<string, (...args: any[]) => any> {
  const result = verifyPredicates(source, opts)
  if (!result.safe) {
    throw new Error(
      `Not predicate-safe:\n${formatDiagnostics(result.diagnostics)}`
    )
  }
  // The cluster is verified pure/synchronous → native fast path. In native JS
  // the ergonomic composition (calls in expressions, named callbacks, recursion)
  // works directly — which is the whole point.

  const factory = new Function(`${source}\n;return { ${exports.join(', ')} };`)
  return factory()
}
