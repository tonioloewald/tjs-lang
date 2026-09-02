/**
 * Advice about `switch` — the construct we decided NOT to change.
 *
 * This file once rewrote `switch` in native `.tjs` (#43): implicit `break`, per-arm scope,
 * multi-value cases, an `Eq`-keyed discriminant. Then the change was measured, and the
 * measurement retired it.
 *
 * Shown the identical program as `.js`, a model traced it 5/5. Shown it as `.tjs` — same
 * text, fixed semantics — it applied C fallthrough **5 times out of 5, confidently**. Both
 * controls were 100%, so it was not difficulty: the file extension carries nothing to a
 * reader, and the shape still said "C switch". A fix nobody can see is a hazard, not a fix.
 *
 * Changing the SHAPE removed every confident wrong answer. Keeping the NAME while changing
 * the shape was worse than either — the model stalled instead of concluding. So the fix moved
 * to `given` (`given-transform.ts`), which looks as different as it behaves, and `switch`
 * keeps JavaScript's semantics exactly. Nothing silently changes meaning, converted code is
 * untouched, and what was a trap becomes a diagnostic.
 *
 * `docs/case-study-switch.md` records the decision, including the measurement that reversed
 * a shipped change and the keyword ranking that turned out to be noise.
 */

import type { Program } from 'acorn'

/**
 * Rewrite every `switch` in the program to native-TJS semantics.
 *
 * Returns source patches (same contract as `rewriteBoolCoercion`) plus warnings for arms
 * whose implicit fallthrough has changed meaning. Patches never overlap: each touches either
 * a discriminant, one case header, or one arm body, and those spans are disjoint by
 * construction.
 */
/**
 * `switch` is not rewritten — it is ADVISED about.
 *
 * This file once rewrote `switch` in place (#43): implicit `break`, per-arm scope,
 * multi-value cases, and an `Eq`-keyed discriminant. Then the change was measured, and the
 * measurement retired it. Shown the identical program as `.js` a model traced it 5/5; shown
 * it as `.tjs` it applied C fallthrough **5/5, confidently**. Both controls were 100%, so it
 * was not difficulty — the file extension carries nothing to a reader, and the shape still
 * said "C switch".
 *
 * Changing the SHAPE removed every confident wrong answer. Keeping the NAME while changing
 * the shape was worse than either: the model stalled instead of concluding. So the fix moved
 * to `given`, which looks as different as it behaves, and `switch` keeps C semantics exactly.
 *
 * Nothing silently changes meaning, converted code is unaffected, and the construct that was
 * a hazard becomes a diagnostic. `docs/case-study-switch.md` records the whole decision.
 */
export function switchAdvice(ast: Program, source: string): string[] {
  const out: string[] = []
  const seen = new Set<number>()

  const visit = (node: any): void => {
    if (!node || typeof node !== 'object' || !node.type) return
    if (node.type === 'SwitchStatement' && !seen.has(node.start)) {
      seen.add(node.start)
      const disc = source.slice(node.discriminant.start, node.discriminant.end)
      // A `given` LOWERS to a switch before acorn sees the source, so by the time this walk
      // runs the two are indistinguishable as AST — and every `given` was being told to use
      // `given`. Worse, the advice quoted the lowering back at the author:
      //
      //     given __tjs.swKey(x) {
      //
      // which is not something anyone can write, and which leaks an internal helper into a
      // user-facing message. It also failed `tjs check --max-warnings 0`, so adopting the
      // construct the advice recommends broke the build.
      //
      // `__tjs.swKey` is emitted ONLY by the lowering, so the discriminant identifies the
      // source construct exactly. Checked on the discriminant rather than by threading
      // offsets through, because it cannot drift: if the lowering stops emitting `swKey`,
      // this stops matching, and the lowering owns both.
      if (/^__tjs\s*\.\s*swKey\s*\(/.test(disc)) return
      const arms = (node.cases as any[]).filter(
        (c) => c.consequent.length > 0
      ).length
      out.push(
        `\`switch\` here keeps JavaScript's semantics — arms fall through unless you write ` +
          `\`break\`, and they share one scope. \`given\` is the .tjs form and fixes both:\n` +
          `  given ${disc} {\n` +
          `    'first', 'second' { … }   // several values, no fallthrough\n` +
          `  } else { … }\n` +
          `It compares the way \`==\` does rather than \`===\`, and each arm has its own scope. ` +
          `(${arms} arm${arms === 1 ? '' : 's'} here.)`
      )
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      const child = node[key]
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === 'object' && child.type) visit(child)
    }
  }

  visit(ast)
  return out
}
