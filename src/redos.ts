/**
 * ReDoS risk detection — a single, dependency-free star-height analyzer shared
 * by the predicate verifier (`src/lang/predicate.ts`) and the VM's `regexMatch`
 * atom (`src/vm/runtime.ts`). Both need to reject the same catastrophic
 * exponential-backtracking regex shapes; keeping ONE rigorous implementation
 * (rather than a second hand-rolled heuristic in the VM) means a shape the repo
 * knows how to catch can't be admitted in one place and rejected in the other.
 *
 * Zero imports on purpose: it must be safe to bundle into the lean standalone
 * `tjs-lang/vm` bundle.
 */

/**
 * Length of an *unbounded* quantifier at `pos` (`*`, `+`, `{n,}`, and their
 * lazy `?` variants), or 0 if the token there is not an unbounded quantifier.
 * Bounded quantifiers (`{n}`, `{n,m}`) return 0 — they can't drive exponential
 * blowup.
 */
export function unboundedQuantifierLen(pattern: string, pos: number): number {
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
 * (the classic `(a+)+`, `(a*)*`, `([a-z]+)*`, `(.*)*`, and the deeper-nested
 * `((a+))+` — the exponential-backtracking shapes). Fails closed: over-flagging
 * a safe pattern only costs a "verified" badge (predicate) or rejects a regex a
 * guest could have run safely (VM); certifying a dangerous one is the real harm.
 *
 * Not caught (documented limitation): *polynomial* ReDoS from adjacent
 * overlapping quantifiers (`\d+\d+$`, `a.*a.*a`) and alternation-overlap
 * (`(a|a)*`). The exponential class above is the one the safety story commits to.
 *
 * @returns a reason string if risky, else null.
 */
export function reDoSRisk(pattern: string): string | null {
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
 * Alternation-overlap catastrophe: `(a|a)+`, `(x|x)*` — two identical branches
 * under an unbounded quantifier, exponential on backtracking. `reDoSRisk` does
 * not model alternation, so the VM keeps this one supplementary heuristic on top
 * of the star-height analysis rather than regress on a shape it used to catch.
 */
export function alternationOverlapRisk(pattern: string): boolean {
  return /\(([^|)]+)\|\1\)[+*]/.test(pattern)
}
