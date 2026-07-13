/**
 * `tjs-lang/editors` — editor-support primitives, free of any editor framework.
 *
 * Everything here depends only on acorn (a real tjs-lang dependency). No
 * CodeMirror, no Monaco, no Ace — so a consumer building their own editor
 * integration, or a doc system embedding live examples, can use the language
 * machinery without pulling a framework in behind it.
 *
 * This exists because it was NOT exported: tosijs-ui hand-rolled its own,
 * weaker, line-based version of `collectScopeSymbols` for exactly this purpose
 * (GitHub #10). Language machinery belongs to the language; a downstream repo
 * re-deriving it is a bug in our export map, not in their code.
 *
 * The framework-specific integrations remain at `tjs-lang/editors/codemirror`,
 * `/monaco`, `/ace`.
 */

export {
  collectScopeSymbols,
  type ScopeSymbol,
  type SymbolOrigin,
} from './scope-symbols'

export {
  introspectValue,
  type IntrospectMember,
  INTROSPECT_VALUE_SOURCE,
} from './introspect-value'

import { collectScopeSymbols } from './scope-symbols'

/**
 * Build an epilogue that hands a run's top-level bindings to a callback.
 *
 * The problem this solves: to offer *real* member completions (`app.` →
 * whatever `app` actually is, proxies and all) you need the live values the
 * example produced. Re-running the code in a hidden iframe to get them doubles
 * every side effect. Capturing them **in-run** does not — you just need to know
 * which names to capture, which is what `collectScopeSymbols` knows.
 *
 * Appending the returned string to already-transformed code calls
 * `captureVar({ name: value, … })` with every top-level binding, in the run's
 * own scope. Returns `''` when there is nothing to capture, so it is safe to
 * append unconditionally.
 *
 * Names are filtered to plain identifiers — a binding whose name isn't a valid
 * identifier cannot be referenced in the epilogue without generating a syntax
 * error in someone else's program, and a scope-capture helper that can break the
 * code it observes is not worth having.
 *
 * @param source     the example's source (pre- or post-transform; we only read names)
 * @param captureVar the identifier of the callback in scope at the epilogue
 */
export function scopeCaptureEpilogue(
  source: string,
  captureVar: string
): string {
  const names = [
    ...new Set(
      collectScopeSymbols(source)
        .filter((s) => s.kind !== 'parameter')
        .map((s) => s.name)
        .filter((n) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n))
    ),
  ]

  if (names.length === 0) return ''

  const pairs = names.map((n) => `${n}`).join(', ')
  return `\ntry { ${captureVar}({ ${pairs} }) } catch {}\n`
}
