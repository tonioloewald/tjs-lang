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

/** Introspect a sample's own enumerable keys → (key, typeof, method?) checks. */
export function probeShape(sample: Record<string, unknown>): Check[] {
  const checks: Check[] = []
  for (const key of Object.keys(sample)) {
    // skip identifier-unsafe keys (can't appear as `x.<key>` in emitted source)
    if (!/^[A-Za-z_$][\w$]*$/.test(key)) continue
    const type = typeof sample[key]
    checks.push({ key, type, kind: type === 'function' ? 'method' : 'value' })
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
  name: string
): string {
  const checks = probeShape(sample)
  const lines = checks.map((c) => `x.${c.key} !== undefined`)
  const typeLines = checks
    .filter((c) => c.type !== 'undefined')
    .map((c) => `typeof x.${c.key} === '${c.type}'`)
  const body = ['x != null', ...lines, ...typeLines].join(' && ')
  return `function is${name}(x) { return ${body} }`
}
