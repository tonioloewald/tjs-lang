/**
 * `switch` in native `.tjs` is Swift's, not C's (#43).
 *
 * Four defects, all inherited from C, all fixed together because they are one design
 * mistake wearing four faces:
 *
 * | # | C/JS | native `.tjs` |
 * | - | ---- | ------------- |
 * | 1 | `case` compares with `===`, disagreeing with `==` in the same file | compares with `Eq` |
 * | 2 | multiple values sharing a block is only expressible AS fallthrough | `case 'a', 'b':` |
 * | 3 | fallthrough is the DEFAULT, so correctness needs `break` on every arm | opt-in `fallthrough` |
 * | 4 | all arms share ONE scope, so `let` leaks and `const` collides | per-arm scope |
 *
 * Two of these have shipped in `eslint:recommended` as errors for over a decade
 * (`no-fallthrough`, `no-case-declarations`). The ecosystem decided the defaults were wrong
 * long ago and has been hand-patching ever since, because the language cannot change. This
 * is the layer that can.
 *
 * ## Both new syntaxes are already valid JavaScript, which is why this is safe
 *
 * The repo's dominant defect class is literal blindness — a pass that mis-reads code merely
 * *mentioning* the syntax it scans for. This transform runs no scanner at all:
 *
 *   - `case 'a', 'b', 'c':` parses as a **SequenceExpression**. Free.
 *   - `fallthrough` parses as an **ExpressionStatement** wrapping an Identifier. Free.
 *
 * So acorn locates every construct exactly, and the only source arithmetic is finding the
 * `:` after a case test — done over the MASKED view, because a block comment sitting between
 * the test and its colon can contain a colon of its own, which is otherwise exactly the trap
 * this paragraph is about. (Writing that example out literally closed this comment early on
 * the first attempt, which is the defect class demonstrating itself inside its own
 * description. Hence the prose.)
 *
 * ## Why the discriminant is normalised rather than each case compared
 *
 * The obvious reading of "make `case` use `Eq`" is `switch (true) { case Eq(d, 'a'): … }`.
 * It is correct and it is the wrong trade: it forfeits the engine's jump table for every
 * switch, which is the one real objection to this change. Normalising the DISCRIMINANT
 * through the same chain `Eq` walks — `asCompared`, then boxed-primitive unwrap — leaves
 * literal cases literal, so the jump table survives and the cost is O(1) per switch rather
 * than O(cases).
 *
 * Rewriting to an if-chain, the other obvious approach, is a trap worth naming: `break`
 * inside a `switch` breaks the switch, but inside an `if` it breaks the enclosing LOOP.
 * That transform silently changes control flow in any switch inside a loop.
 *
 * `swKey` closes the two gaps that normalisation alone would leave, so `case` agrees with
 * `==` exactly rather than approximately: `undefined` and `null` are one key (as `Eq` says),
 * and `NaN` gets a sentinel so `case NaN:` matches (`Eq(NaN, NaN)` is true; `===` says no).
 * Both are handled on the case side too, since we control those literals at emit.
 *
 * ## The one behaviour change, and why it warns rather than errors
 *
 * A non-empty arm that neither terminates nor says `fallthrough` used to fall through and
 * now does not. That is the whole compatibility surface, and it is deliberately a WARNING:
 * erroring would demand `break` back, which is the ceremony item 3 exists to remove. Empty
 * arms still stack (`case 'a': case 'b':`), so the overwhelmingly common use of fallthrough
 * — case-stacking — is untouched and silent.
 */

import type { Program, Node } from 'acorn'
import { parse as looseParse } from 'acorn-loose'
import { maskLiterals } from '../strip-comments'

export interface SwitchPatch {
  start: number
  end: number
  newText: string
}

export interface SwitchWarning {
  /** Byte offset of the arm whose fallthrough was implicit. */
  start: number
  message: string
}

export interface SwitchRewrite {
  patches: SwitchPatch[]
  warnings: SwitchWarning[]
}

/** Statements after which control cannot reach the next arm. */
const JUMPS = new Set([
  'ReturnStatement',
  'ThrowStatement',
  'BreakStatement',
  'ContinueStatement',
])

/**
 * Does control leave the arm here, so that nothing can reach the next one?
 *
 * This is `no-fallthrough`'s analysis, and it is deliberately ARM-LEVEL — the distinction
 * the issue's implementation note calls out. A `break` inside a loop inside a case means
 * "exit the loop" and must keep meaning that, so it is only a terminator when it is the
 * arm's own last statement, never when it is buried in a nested breakable.
 *
 * Recursive through blocks and if/else because `if (a) return x; else return y` genuinely
 * terminates. Getting this wrong is not a correctness bug — an unreachable `break` is
 * harmless — but it would emit a WARNING about a fallthrough that cannot happen, and a
 * diagnostic that cries wolf is the thing #40 was about.
 */
function terminates(stmt: any): boolean {
  if (!stmt || typeof stmt !== 'object') return false
  if (JUMPS.has(stmt.type)) return true
  if (stmt.type === 'BlockStatement') {
    return terminates(stmt.body[stmt.body.length - 1])
  }
  if (stmt.type === 'IfStatement') {
    // Only when BOTH arms leave — an `if` with no `else` always has a path through.
    return (
      !!stmt.alternate &&
      terminates(stmt.consequent) &&
      terminates(stmt.alternate)
    )
  }
  return false
}

/** `fallthrough` as a statement — the opt-in keyword, parsed as a bare identifier. */
function isFallthrough(stmt: Node | undefined): boolean {
  const s = stmt as any
  return (
    s?.type === 'ExpressionStatement' &&
    s.expression?.type === 'Identifier' &&
    s.expression.name === 'fallthrough'
  )
}

/**
 * A case test that is already its own comparison key, so it needs no `swKey` call and can
 * stay a literal for the jump table.
 *
 * `undefined` and `NaN` are deliberately EXCLUDED even though they are literal-ish: both
 * are rewritten to their key form instead, because `Eq` treats `undefined` as `null` and
 * `NaN` as equal to itself, and `===` — which is what `switch` still uses underneath —
 * agrees with neither.
 */
function isSelfKeyingLiteral(test: any): boolean {
  if (test?.type !== 'Literal') return false
  const v = test.value
  return (
    v === null ||
    typeof v === 'string' ||
    typeof v === 'boolean' ||
    typeof v === 'bigint' ||
    (typeof v === 'number' && !Number.isNaN(v))
  )
}

/**
 * Rewrite every `switch` in the program to native-TJS semantics.
 *
 * Returns source patches (same contract as `rewriteBoolCoercion`) plus warnings for arms
 * whose implicit fallthrough has changed meaning. Patches never overlap: each touches either
 * a discriminant, one case header, or one arm body, and those spans are disjoint by
 * construction.
 */
export function rewriteSwitch(ast: Program, source: string): SwitchRewrite {
  const patches: SwitchPatch[] = []
  const warnings: SwitchWarning[] = []
  // Comments and string contents blanked, offsets preserved — so a `:` inside either cannot
  // be mistaken for the one closing a case clause.
  const masked = maskLiterals(source)

  function visit(node: any): void {
    if (!node || typeof node !== 'object' || !node.type) return

    if (node.type === 'SwitchStatement') rewriteOne(node)

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      const child = node[key]
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === 'object' && child.type) visit(child)
    }
  }

  function rewriteOne(sw: any): void {
    // ANCHOR EVERY INSERTION IN GAP TEXT — after a `(`, after a `:`, before the next
    // `case`. Never at the start or end of an expression.
    //
    // Two failures taught this, and both were silent corruption rather than an error:
    //
    // 1. Wrapping an arm body by REPLACING its text clobbered any `switch` nested inside it
    //    (`src/rbac/rules.tjs` became `export func{ if (…`), because the outer patch
    //    re-emitted source the inner patches had also claimed.
    // 2. Zero-width insertions fixed that but hit a subtler one: `bool-coercion` replaces a
    //    whole ternary as a SPANNING patch, and `js.ts` adjusts insertion offsets by
    //    subtracting the length of every deletion starting before them. An insertion sitting
    //    exactly ON a deletion's end boundary is indistinguishable from one inside it, so a
    //    closing `}` after `return a ? b : c` was relocated to BEFORE the ternary.
    //
    // Gap text is claimed by nobody, so neither failure is reachable from it.
    const at = (pos: number, text: string) =>
      patches.push({ start: pos, end: pos, newText: text })

    // 1. The discriminant walks the same chain `Eq` does — wrapped using the `switch`'s own
    //    parentheses. Literal cases stay literal, so the jump table survives.
    const dOpen = masked.lastIndexOf('(', sw.discriminant.start)
    const dClose = masked.indexOf(')', sw.discriminant.end)
    if (dOpen !== -1 && dClose !== -1) {
      at(dOpen + 1, '__tjs.swKey(')
      at(dClose, ')')
    }

    const cases = sw.cases as any[]
    cases.forEach((c, idx) => {
      const colon = c.test ? masked.indexOf(':', c.test.end) : -1
      if (c.test && colon !== -1) {
        const values: any[] =
          c.test.type === 'SequenceExpression' ? c.test.expressions : [c.test]
        // 2. `case a, b:` becomes stacked clauses by rewriting the COMMAS — the only text
        //    between the expressions, and gap text by definition.
        const commas: number[] = []
        for (let i = 0; i + 1 < values.length; i++) {
          const comma = masked.indexOf(',', values[i].end)
          if (comma !== -1 && comma < values[i + 1].start) commas.push(comma)
        }
        // A value that is not already its own key is wrapped. The CLOSING paren goes at the
        // following comma (or the clause's colon) — gap text, never the expression's end.
        values.forEach((v, i) => {
          if (isSelfKeyingLiteral(v)) return
          const close = i < commas.length ? commas[i] : colon
          at(v.start, '__tjs.swKey(')
          at(close, ')')
        })
        for (const comma of commas) {
          patches.push({ start: comma, end: comma + 1, newText: ': case ' })
        }
      }

      // 3 & 4. Arm scope and no implicit fallthrough. The braces go in the gaps AROUND the
      //    arm — after its colon, and immediately before the next clause — so the body's own
      //    statements (and anything nested in them) are never touched.
      const body = c.consequent as any[]
      if (body.length === 0) return // empty arms still stack — that IS multi-value, old style

      const last = body[body.length - 1]
      const isLastCase = idx === cases.length - 1
      const openAt = colon !== -1 ? colon + 1 : body[0].start
      // Before the next clause, or before the switch's closing brace for the final arm.
      const closeAt = isLastCase
        ? masked.lastIndexOf('}', sw.end)
        : cases[idx + 1].start

      if (isFallthrough(last)) {
        // Explicit cascade: delete the keyword, scope what remains, add no `break`.
        patches.push({ start: last.start, end: last.end, newText: '' })
        at(openAt, ' {')
        at(closeAt, '} ')
        return
      }

      // The `break` we add is what makes fallthrough opt-in. Unnecessary on the final arm
      // (nothing follows it) and on an arm that already leaves.
      const needsBreak = !terminates(last) && !isLastCase
      if (needsBreak) {
        warnings.push({
          start: c.start,
          message:
            'This case falls through implicitly. In native .tjs, `switch` no longer falls ' +
            'through by default (#43) — this arm now ends here. Write `fallthrough` as the ' +
            'last statement if the cascade was intended; if a `break` was simply missing, ' +
            'the new behaviour is what you wanted and this warning is the fix landing. ' +
            'Stacked empty cases (`case a: case b:`) and multi-value `case a, b:` are ' +
            'unaffected.',
        })
      }
      at(openAt, ' {')
      at(closeAt, needsBreak ? '; break; } ' : '} ')
    })
  }

  visit(ast)
  return { patches, warnings }
}

/**
 * Give every non-empty `switch` arm its own braces, so the source can be PARSED at all.
 *
 * Item 4 of #43 — per-arm scope — cannot be delivered by the transform above, because it
 * never gets to run:
 *
 *     case 'a': const y = 1 …
 *     case 'b': const y = 2 …     SyntaxError: Identifier 'y' has already been declared
 *
 * That is not an acorn limitation to route around. A switch body is ONE block scope in
 * JavaScript, so this is a spec-mandated early error and acorn is correct; TJS is the thing
 * changing. The repair therefore has to happen before the strict parse, which means finding
 * case boundaries in source that strict acorn refuses.
 *
 * `acorn-loose` does it exactly — verified on the colliding shape above, which it parses
 * with correct positions and correct arm bodies, no degradation. It is already a shipped
 * dependency for the same reason (scope extraction has to work on half-typed editor
 * buffers).
 *
 * Called ONLY after a strict parse has already failed, so the normal path pays nothing, and
 * the caller keeps the original error if the repaired source still will not parse — a repair
 * attempt must never replace a real syntax error with a confusing one.
 *
 * Braces go in GAP text (after the arm's colon, before the next clause) for the same reason
 * the transform above does: nothing else claims those positions.
 */
export function braceSwitchArms(source: string): string | null {
  let ast: any
  try {
    ast = looseParse(source, { ecmaVersion: 'latest' })
  } catch {
    return null
  }
  const masked = maskLiterals(source)
  const inserts: Array<[number, string]> = []

  const walk = (n: any): void => {
    if (!n || typeof n !== 'object' || !n.type) return
    if (n.type === 'SwitchStatement') {
      const cases = n.cases ?? []
      cases.forEach((c: any, i: number) => {
        const body = c.consequent ?? []
        if (body.length === 0) return
        // Already a single block — the author braced it by hand, so leave it alone.
        if (body.length === 1 && body[0].type === 'BlockStatement') return
        const colon = masked.indexOf(':', c.test ? c.test.end : c.start)
        if (colon === -1) return
        const close =
          i < cases.length - 1
            ? cases[i + 1].start
            : masked.lastIndexOf('}', n.end)
        if (close <= colon) return
        inserts.push([colon + 1, ' {'], [close, '} '])
      })
    }
    for (const k of Object.keys(n)) {
      if (k === 'type' || k === 'start' || k === 'end') continue
      const c = n[k]
      if (Array.isArray(c)) c.forEach(walk)
      else if (c && typeof c === 'object' && c.type) walk(c)
    }
  }
  walk(ast)
  if (inserts.length === 0) return null

  inserts.sort((a, b) => b[0] - a[0])
  let out = source
  for (const [pos, text] of inserts)
    out = out.slice(0, pos) + text + out.slice(pos)
  return out
}
