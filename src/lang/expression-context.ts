/**
 * Syntactic primitives — the layer between `strip-comments.ts` and the transforms.
 *
 * `strip-comments.ts` answers LEXICAL questions: where are the literals, where does this brace
 * close, split this on top-level commas. That closed the whole literal-blindness family. What
 * it cannot answer is SYNTACTIC: what does this token MEAN here. This module is where those
 * answers live, one exported question at a time.
 *
 * See `docs/parser-primitives.md` for why this layer exists and what belongs in it. The short
 * version: the remaining parse defects all reduce to two questions a regex cannot answer —
 * *where does this expression end* and *what does this `:` mean* — and a scanner that knows
 * characters but not grammar will keep getting them wrong in new ways.
 *
 * The rule that keeps this from becoming several half-parsers that disagree: ONE
 * implementation per question, exported from here, in the shape callers actually reach for.
 * That is the discipline that made the lexical layer work and the absence of which produced
 * the mess it replaced.
 */
import { maskLiterals } from '../strip-comments'

/**
 * Is the `:` at `colonIndex` the alternative of a ternary, rather than an annotation?
 *
 * TJS writes an arrow's return type as `(params): Type => body`, so a `:` after `)` is
 * ambiguous — it is an annotation, unless a ternary is still waiting for its alternative:
 *
 *     write: flag ? ((r) => f(r)) : (r) => { … }
 *                                 ^ this one
 *
 * Read as an annotation, the scanner consumed `(r)` as the return TYPE, matched the `=>`,
 * and deleted the ternary's alternative — leaving `((r) => f(r)) => {` , which is not
 * JavaScript. effect's `RpcServer.ts` and `commandExecutor.ts` both failed on it.
 *
 * A previous fix caught the sibling shape (`k ? (x, i) => f(a) : (x) => x`) by noticing that a
 * call's `(` follows its callee. That is a true rule and an incomplete one: here the `(`
 * follows `?`, because the consequent is a PARENTHESIZED EXPRESSION rather than a call. Asking
 * about the token to the left will always be a proxy for the question actually being asked.
 *
 * ## How it decides
 *
 * Walks backwards to the start of the enclosing expression, matching inner ternaries as it
 * goes: a `:` means one more alternative is owed a `?`, and a `?` pays the most recent debt.
 * The FIRST `?` that finds no debt outstanding is unmatched — so the colon we started from is
 * its alternative.
 *
 * Counting `?` and `:` and comparing totals is the version that does not work, and it is the
 * obvious version: in `{ write: flag ? (…) : (…) }` the property colon of `write:` is reached
 * before the loop can stop, so the totals come out equal and a real ternary reads as an
 * annotation. Matching as you go never reaches `write:` at all, because the `?` returns first.
 *
 * Deliberately NOT counted: `?.` (optional chaining), `??` (nullish), and `?:`/`?!` — the TJS
 * parameter safety markers. Each is a `?` that never wants a `:`, and counting one would
 * report a pending ternary that does not exist, which fails in the opposite direction: a real
 * return annotation left in place and emitted as JavaScript.
 */
export function isTernaryColon(source: string, colonIndex: number): boolean {
  return ternaryColons(source).has(colonIndex)
}
// One query is one O(n) pass. A caller asking about MANY colons in one source must compute
// `ternaryColons(source)` once and hold it — as `transformParenExpressions` does, in its own
// call frame. There is deliberately no process-global memo: one keyed by source string and
// cleared at 16 entries was thrashed by >16 nested distinct substrings, and the colon pass went
// quadratic again (1.7s at the cap; 0.14.0 final re-review 7, M-1). A cache is not a bound.
// It also retained up to 17 guest sources across runs and tenants.

/**
 * Every `:` in `source` that is a ternary's alternative, in ONE forward pass. Hold the result
 * for as long as you query the same source; it is not cached here (see above).
 *
 * The per-query backward walk (kept below as `isTernaryColonScan`, the reference) visited the
 * whole enclosing expression for every colon, so N colons in one expression cost O(N²): 64KB
 * of `():` took ~2s before fuel applied (0.14.0 final re-review 6, M-1). The rule it applies is
 * bracket matching in disguise — walking back, a `:` is a debt and a `?` pays one — so forward
 * it is a stack of `?`s per bracket frame:
 *
 * - an opener starts a new frame; a closer ends it (an UNMATCHED closer hides everything
 *   before it, so it starts a fresh frame);
 * - `;`, `,` and a MARKER `?` (no condition before it) clear the frame — the walk returns
 *   false on reaching any of them;
 * - `??`, `?.`, `?:`, `?!` are not ternary `?`s; `::` colons neither answer nor consume.
 *
 * Held equal to the backward walk at every `:` of a corpus by expression-context.test.ts.
 */
export function ternaryColons(source: string): Set<number> {
  const masked = maskLiterals(source)
  const out = new Set<number>()
  /** Pending ternary `?`s per bracket frame; the innermost frame is last. */
  const frames: number[] = [0]
  let prevNonWs = -1 // index of the last non-whitespace character before `i`
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i]
    const top = frames.length - 1
    if (c === '(' || c === '[' || c === '{') frames.push(0)
    else if (c === ')' || c === ']' || c === '}') {
      if (frames.length > 1) frames.pop()
      else frames[0] = 0
    } else if (c === ';' || c === ',') frames[top] = 0
    else if (c === '?') {
      const next = masked[i + 1]
      const skip =
        masked[i - 1] === '?' ||
        next === '?' ||
        next === '.' ||
        next === ':' ||
        next === '!'
      if (!skip) {
        const p = prevNonWs < 0 ? '' : masked[prevNonWs]
        if (prevNonWs < 0 || p === '(' || p === ',') frames[top] = 0 // a marker
        else frames[top]++
      }
    } else if (c === ':') {
      if (frames[top] > 0) out.add(i)
      if (masked[i - 1] !== ':' && masked[i + 1] !== ':' && frames[top] > 0)
        frames[top]--
    }
    if (!/\s/.test(c)) prevNonWs = i
  }
  return out
}

/** The backward walk — the REFERENCE the forward pass is tested against. @internal */
export function isTernaryColonScan(
  source: string,
  colonIndex: number
): boolean {
  const masked = maskLiterals(source)
  if (masked[colonIndex] !== ':') return false

  let depth = 0
  /** Alternatives seen so far that are still owed a `?`. */
  let owed = 0

  for (let i = colonIndex - 1; i >= 0; i--) {
    const c = masked[i]

    // Walking BACKWARDS, a closer opens and an opener closes.
    if (c === ')' || c === ']' || c === '}') {
      depth++
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      // An unmatched opener starts the enclosing expression. A ternary cannot span it, so
      // stop rather than reading tokens belonging to an outer scope.
      if (depth === 0) return false
      depth--
      continue
    }
    if (depth !== 0) continue

    // A statement or element boundary; a ternary never crosses one.
    if (c === ';' || c === ',') return false

    if (c === '?') {
      if (masked[i - 1] === '?') {
        i-- // `??`
        continue
      }
      if (masked[i + 1] === '?' || masked[i + 1] === '.') continue
      if (masked[i + 1] === ':' || masked[i + 1] === '!') continue
      // A ternary's `?` needs a CONDITION before it. When the previous token opens a group
      // or separates one, there is no condition, so this is a marker rather than an
      // operator — TJS writes the parameter safety markers as `(? a: 0)` and `(! a: 0)`,
      // with a space, which the adjacency checks above do not see.
      let k = i - 1
      while (k >= 0 && /\s/.test(masked[k])) k--
      if (k < 0 || masked[k] === '(' || masked[k] === ',') return false
      if (owed === 0) return true
      owed--
      continue
    }

    if (c === ':') {
      if (masked[i - 1] === ':' || masked[i + 1] === ':') continue
      owed++
    }
  }

  return false
}
