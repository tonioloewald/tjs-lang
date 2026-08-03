/**
 * Canonical form for verified predicates — the keystone.
 *
 * A verified predicate is already special: pure, total (fuel-bounded), serializable,
 * and composable. Giving it a **canonical form** makes it an *identity*, and that one
 * move is what lets the same object serve several roles at once:
 *
 *  - **cache key** — two predicates that differ only in formatting, whitespace, comments
 *    or local variable names are the *same* predicate, so they hash to the same key.
 *    Without canonicalization every reformat busts the cache.
 *  - **pushdown payload** — the normalized AST is the thing you send to `store.query`
 *    so filtering happens at the data instead of dragging rows to the code.
 *  - **auth object** — a permission *is* a predicate; a canonical form gives it a stable
 *    identity you can grant, revoke, compare and log.
 *  - **safe-macro substrate** — a normal form is what you splice into, not text.
 *
 * ## What canonicalization does, and deliberately doesn't
 *
 * **Does:** strip source positions, comments and raw literal spellings; alpha-rename
 * *bound* names (parameters and locals) to positional `$0, $1, …` so naming is not
 * identity; emit keys in a fixed order so serialization is deterministic.
 *
 * **Doesn't reorder operands.** `a && b` → `b && a` is tempting for commutative
 * normalization and it is *wrong to do here*: canonicalization must be a
 * meaning-preserving rewrite, and reordering is a claim about totality and cost, not
 * just purity. A canonicalizer that is also an optimizer is a canonicalizer you cannot
 * trust as an auth object. Two predicates that differ by operand order are simply two
 * predicates.
 *
 * **Free identifiers are preserved.** A reference to another predicate or a global is
 * semantically load-bearing — renaming it would merge genuinely different predicates.
 *
 * ## Verification is a precondition, not an option
 *
 * The canonical form is only *meaningful* for a predicate that has been verified pure:
 * identity implies "same input ⇒ same result", which an impure predicate doesn't
 * satisfy no matter how identical its syntax. So `canonicalizePredicate` verifies first
 * and refuses to mint a key for an unverified cluster.
 */
import * as acorn from 'acorn'
import { verifyPredicate, type VerifyPredicateOptions } from './predicate'

export interface CanonicalPredicate {
  /** Deterministic serialization of the normalized AST — the ground-truth identity. */
  canonical: string
  /** The normalized AST itself (the pushdown / splice payload). */
  ast: unknown
  /**
   * Short digest of `canonical`, for use as a cache key.
   *
   * **Non-cryptographic** (FNV-1a, 32-bit). Fine for cache bucketing, where a collision
   * costs a miss. NOT sufficient where an adversary picks the input — cache *poisoning*
   * or an auth decision needs collision resistance, so hash `canonical` yourself with
   * SHA-256 (`crypto.subtle.digest`) for those. Naming this `key` and leaving the
   * strength implicit is exactly the kind of claim that rots into a vulnerability.
   */
  key: string
  /** The entry predicate this canonical form describes. */
  entry: string
}

export class PredicateNotVerifiedError extends Error {
  constructor(public diagnostics: string[]) {
    super(
      `Cannot canonicalize an unverified predicate: identity implies purity, and an ` +
        `impure predicate with identical syntax can still return different results. ` +
        `Fix the diagnostics first:\n  ${diagnostics.join('\n  ')}`
    )
    this.name = 'PredicateNotVerifiedError'
  }
}

/** FNV-1a. Non-cryptographic by construction — see `CanonicalPredicate.key`. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/** AST fields that carry position/formatting, never meaning. */
const NOISE = new Set([
  'start',
  'end',
  'loc',
  'range',
  'raw', // literal *spelling*: 1e3 vs 1000 is the same value
  'comments',
  'leadingComments',
  'trailingComments',
])

/**
 * Walk a function's AST renaming bound identifiers positionally.
 *
 * Scope handling is intentionally simple: predicates are pure, loop-free, and small
 * (the verifier rejects everything else), so a flat per-function binding map is
 * sufficient — there are no closures over mutable state to get wrong.
 */
function buildRenames(fn: any): Map<string, string> {
  const renames = new Map<string, string>()
  let n = 0
  const bind = (name: string) => {
    if (!renames.has(name)) renames.set(name, `$${n++}`)
  }
  for (const p of fn.params ?? []) collectPatternNames(p).forEach(bind)
  // Locals: `const`/`let` declarations anywhere in the body.
  const stack: any[] = [fn.body]
  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (node.type === 'VariableDeclarator')
      collectPatternNames(node.id).forEach(bind)
    for (const k of Object.keys(node)) {
      const v = (node as any)[k]
      if (Array.isArray(v)) stack.push(...v)
      else if (v && typeof v === 'object') stack.push(v)
    }
  }
  return renames
}

function collectPatternNames(pat: any): string[] {
  if (!pat) return []
  switch (pat.type) {
    case 'Identifier':
      return [pat.name]
    case 'ObjectPattern':
      return pat.properties.flatMap((p: any) =>
        collectPatternNames(p.value ?? p.argument)
      )
    case 'ArrayPattern':
      return pat.elements.flatMap((e: any) => collectPatternNames(e))
    case 'AssignmentPattern':
      return collectPatternNames(pat.left)
    case 'RestElement':
      return collectPatternNames(pat.argument)
    default:
      return []
  }
}

/** Strip noise, apply renames, and emit with deterministic key order. */
function normalize(node: any, renames: Map<string, string>): any {
  if (Array.isArray(node)) return node.map((n) => normalize(n, renames))
  if (!node || typeof node !== 'object') return node

  const out: Record<string, unknown> = {}
  for (const k of Object.keys(node).sort()) {
    if (NOISE.has(k)) continue
    out[k] = normalize(node[k], renames)
  }
  // Rename only BOUND identifiers; a free one (another predicate, a pure global)
  // is part of the meaning.
  if (node.type === 'Identifier' && renames.has(node.name)) {
    out.name = renames.get(node.name)
  }
  // Field names are LITERALS, not variables — alpha-renaming one changes what the
  // predicate reads. The two node types spell it differently, and that is the whole bug:
  // a MemberExpression keeps it on `.property`, an ObjectExpression Property keeps it on
  // `.key`. This guarded both on `node.property`, which a Property does not have, so the
  // Property arm was DEAD and every object-literal key was alpha-renamed:
  // `{ n: 10 }` canonicalized to `{ $0: 10 }` while the sibling `limits.n` correctly kept
  // `n`. The canonical AST therefore read a field the source never named — and
  // `storeQueryWhere` forwards this AST VERBATIM to `store.queryPredicate`, which is the
  // silent-filter-failure its own comment calls "an authorization bug".
  if (!node.computed && node.property?.type === 'Identifier') {
    out.property = normalize(
      { ...node.property, __literalKey: true },
      new Map()
    )
  }
  if (node.type === 'Property' && !node.computed) {
    if (node.key?.type === 'Identifier') {
      out.key = normalize({ ...node.key, __literalKey: true }, new Map())
    }
    // Shorthand `{ n }` is ONE token standing for two different things: a literal key and
    // a variable reference. They canonicalize differently (the key is fixed, the value is
    // renamed), so the shorthand must be expanded or the emitted form would claim a key
    // and a value that no longer match.
    if (node.shorthand) out.shorthand = false
  }
  return out
}

/**
 * Canonicalize a verified predicate cluster.
 *
 * @param source predicate cluster source (same shape `verifyPredicate` accepts)
 * @param opts   `entry` selects the predicate (default: last top-level function),
 *               plus the usual verification options.
 * @throws PredicateNotVerifiedError if the cluster isn't predicate-safe.
 */
export function canonicalizePredicate(
  source: string,
  opts: VerifyPredicateOptions & { entry?: string } = {}
): CanonicalPredicate {
  const verdict = verifyPredicate(source, opts)
  if (!verdict.safe) {
    throw new PredicateNotVerifiedError(
      verdict.diagnostics.map((d) => `${d.predicate}: ${d.message}`)
    )
  }

  const ast: any = acorn.parse(source, { ecmaVersion: 'latest' })
  const fns = ast.body.filter(
    (n: any) => n.type === 'FunctionDeclaration' && n.id
  )
  if (!fns.length) throw new Error('No predicate function found in source')
  const entryName = opts.entry ?? fns[fns.length - 1].id.name
  const entry = fns.find((f: any) => f.id.name === entryName)
  if (!entry) throw new Error(`Entry predicate '${entryName}' not found`)

  // Canonicalize the entry AND everything it composes with, so a cluster's identity
  // covers the helpers it depends on — otherwise two clusters with the same entry but
  // different helper bodies would collide.
  const parts = fns.map((fn: any) => {
    const renames = buildRenames(fn)
    // The function's own name is free (callable by name), so it is NOT renamed.
    return normalize(fn, renames)
  })
  const payload = { entry: entryName, cluster: parts }
  const canonical = JSON.stringify(payload)

  return { canonical, ast: payload, key: fnv1a(canonical), entry: entryName }
}

/** Convenience: just the cache key. Same caveats as `CanonicalPredicate.key`. */
export function predicateKey(
  source: string,
  opts?: VerifyPredicateOptions & { entry?: string }
): string {
  return canonicalizePredicate(source, opts).key
}
