/**
 * Ambient-contract spike — the "derive" step in miniature.
 *
 * `deriveShapeContract(sample, name)` turns an observed value (a real object
 * introspected from an ambient environment, or a synthetic stand-in) into a
 * predicate-cluster SOURCE: presence + `typeof` checks per own key. Feed the
 * source to `verifyPredicate`/`compilePredicate` and it's a certified, native,
 * serializable contract for "looks like this thing". The real tool would source
 * `sample` from a live browser probe (Claude-in-Chrome / the introspection
 * iframe) and scope it to the surface a program actually uses; this is just the
 * transform, so the whole loop is testable headlessly.
 *
 * See docs/ambient-contracts.md.
 */

/** A single derived check line. */
type Check = { key: string; type: string; kind: 'value' | 'method' }

export interface ProbeOptions {
  /**
   * Only probe these keys. STRONGLY recommended for host objects: the surface a
   * program actually uses, traced from the real environment. Without it we walk
   * the whole prototype chain, which for a DOM object is hundreds of props — a
   * huge, over-specified contract.
   */
  keys?: string[]
  /** How many prototype levels to walk when `keys` is not given. Default 3. */
  maxDepth?: number
}

/**
 * Introspect a sample's shape → (key, typeof, method?) checks.
 *
 * Host objects (DOM etc.) hide their real surface on the PROTOTYPE, non-
 * enumerable — `Object.keys(element.style)` is nearly empty even though
 * `typeof style.color === 'string'`. So we walk the prototype chain (or check a
 * scoped `keys` list) and read `typeof sample[key]`, not `Object.keys`.
 *
 * Caveat (noted in docs/ambient-contracts.md): reading an accessor invokes its
 * getter, which on a real DOM object can have side effects (e.g. `offsetWidth`
 * forces layout). A scoped `keys` list keeps this bounded; a stricter probe would
 * inspect property descriptors instead of reading. Getters that throw are skipped.
 */
export function probeShape(
  sample: Record<string, unknown>,
  opts: ProbeOptions = {}
): Check[] {
  const ident = /^[A-Za-z_$][\w$]*$/
  const record = (key: string, out: Check[], seen: Set<string>) => {
    if (seen.has(key) || key === 'constructor' || !ident.test(key)) return
    seen.add(key)
    let type: string
    try {
      type = typeof sample[key]
    } catch {
      return // accessor threw — skip
    }
    out.push({ key, type, kind: type === 'function' ? 'method' : 'value' })
  }

  const checks: Check[] = []
  const seen = new Set<string>()

  if (opts.keys) {
    for (const key of opts.keys) record(key, checks, seen)
    return checks
  }
  // Walk own props up the prototype chain (host objects live on the proto).
  let obj: object | null = sample
  let depth = 0
  const maxDepth = opts.maxDepth ?? 3
  while (obj && obj !== Object.prototype && depth <= maxDepth) {
    for (const key of Object.getOwnPropertyNames(obj)) record(key, checks, seen)
    obj = Object.getPrototypeOf(obj)
    depth++
  }
  return checks
}

/**
 * Emit a predicate-safe source cluster asserting `x` has the probed shape:
 * non-null, and each key present with the observed `typeof`. The last function
 * (`is<Name>`) is the entry, so the source drops straight into a `$predicate`.
 */
export function deriveShapeContract(
  sample: Record<string, unknown>,
  name: string,
  opts: ProbeOptions = {}
): string {
  const checks = probeShape(sample, opts)
  const lines = checks.map((c) => `x.${c.key} !== undefined`)
  const typeLines = checks
    .filter((c) => c.type !== 'undefined')
    .map((c) => `typeof x.${c.key} === '${c.type}'`)
  const body = ['x != null', ...lines, ...typeLines].join(' && ')
  return `function is${name}(x) { return ${body} }`
}
