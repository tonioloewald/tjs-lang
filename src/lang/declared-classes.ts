/**
 * ONE definition of "a class declared in this source" and "a `new` on one of them".
 *
 * `new X` on a locally-declared class is an error in TJS (a class is CALLED, so the two
 * forms return the same object), and two independent implementations of that idea shipped
 * in the same release:
 *
 *   - `from-ts.ts:dropRedundantNew` REWRITES `new X(` -> `X(` — and required the paren.
 *   - `parser-transforms.ts:validateNoNew` REJECTS `new X` — and did not.
 *
 * So they disagreed on the paren-less form, and the disagreement was reachable through the
 * shipped CLI in two commands:
 *
 *     tjs convert pt.ts --emit-tjs    # leaves `const p = new Point;` verbatim
 *     tjs check pt.tjs                # exit 1: "`new Point()` is not allowed in TJS"
 *
 * The converter emitting source our own checker rejects is the worst possible failure for
 * a migration on-ramp: the user did what the tool said and the tool then blamed them.
 *
 * Two rules cannot agree by being written carefully twice. They agree by being one rule.
 */
import { maskLiterals } from '../strip-comments'

/**
 * Names declared `class X` in this source, scanned over a masked view so a `class Foo` in
 * a string or a comment is not one.
 *
 * Capitalised names only, matching both original implementations — a deliberate narrowing,
 * since the rule exists for classes TJS made callable and a lowercase `class x` is
 * vanishingly rare in the TypeScript this converts.
 */
export function declaredClassNames(source: string, masked?: string): string[] {
  const view = masked ?? maskLiterals(source)
  return [
    ...new Set(
      [...view.matchAll(/\bclass\s+([A-Z][A-Za-z0-9_$]*)/g)].map((m) => m[1])
    ),
  ]
}

/**
 * One alternation matching `new X` for any of `names`, with or without an argument list.
 *
 * Group 1 is the class name; group 2 is the opening paren when the call form was written.
 * A paren-less `new X` is a zero-argument construction, so it rewrites to `X()` — that is
 * the case the rewriter silently skipped.
 *
 * Built as ONE regex rather than one per name because the previous rewriter re-masked the
 * entire output once per class: quadratic in class count, and measured at 264ms of a 305ms
 * `fromTS` call for a 160-class file (87%). This runs in the browser playground.
 *
 * Names are sorted longest-first so the alternation cannot settle on a shorter prefix
 * (`Point` where `PointList` was written) before the trailing boundary is tested.
 */
export function newExpressionPattern(names: string[]): RegExp {
  const alt = [...names]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  return new RegExp(`(?<![A-Za-z0-9_$.])\\bnew\\s+(${alt})\\b(\\s*\\()?`, 'g')
}

/**
 * Rewrite `new X(…)` -> `X(…)` and `new X` -> `X()` for every class declared here.
 *
 * A `new X` followed by `.` is left alone: `new Point.Inner()` constructs a DIFFERENT
 * thing (a member of `Point`), and rewriting it would change meaning rather than preserve
 * it. Erring toward leaving code untouched is right for a rewriter — the checker will
 * still have its say.
 */
export function dropRedundantNew(code: string): string {
  const masked = maskLiterals(code)
  const names = declaredClassNames(code, masked)
  if (!names.length) return code

  const re = newExpressionPattern(names)
  let out = ''
  let last = 0
  for (const m of masked.matchAll(re)) {
    const at = m.index!
    const after = at + m[0].length
    // `new Point.Inner()` — not a construction of `Point`.
    if (!m[2] && code[after] === '.') continue
    out += code.slice(last, at) + (m[2] ? `${m[1]}(` : `${m[1]}()`)
    last = after
  }
  return out + code.slice(last)
}
