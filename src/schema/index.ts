/**
 * `tjs-lang/schema` — tosijs-schema, pre-wired with predicate support.
 *
 * A drop-in for `tosijs-schema` that additionally evaluates the `$predicate`
 * keyword: importing this module registers tjs-lang's verified predicate engine
 * as the evaluator, so JSON-Schema validation is predicate-aware **out of the
 * box** — no manual `setPredicateEvaluator` call. Everything tosijs-schema
 * exports is re-exported here, so this is the only import a consumer needs:
 *
 * ```ts
 * import { s, validate } from 'tjs-lang/schema'
 * // a schema whose node carries `$predicate` now validates computationally
 * ```
 *
 * Why it lives here and not in tosijs-schema: tjs-lang depends on tosijs-schema,
 * so the reverse would be a circular dependency. This entry sits on the side of
 * the graph that may know about both — it's the "batteries-included" packaging
 * of the two.
 *
 * Registration is a global (tosijs-schema keeps one evaluator), so importing
 * this module makes `$predicate` work for tosijs-schema usage app-wide, even in
 * code that imports `tosijs-schema` directly. Call `setPredicateEvaluator(null)`
 * to opt back out, or `installPredicateSupport(opts)` to re-install with custom
 * options (fuel budget, atom-aware effects, etc.).
 */
import { setPredicateEvaluator, getPredicateEvaluator } from 'tosijs-schema'
import {
  createPredicateEvaluator,
  type PredicateEvaluatorOptions,
} from '../lang/predicate'

// The full tosijs-schema surface (s, validate, filter, diff, types,
// setPredicateEvaluator, getPredicateEvaluator, PredicateEvaluator, …).
export * from 'tosijs-schema'
// The evaluator factory, for advanced/custom wiring.
export {
  createPredicateEvaluator,
  type PredicateEvaluatorOptions,
} from '../lang/predicate'

let installed = false

/**
 * Register tjs-lang's predicate engine as tosijs-schema's `$predicate` evaluator.
 * Called automatically when this module is imported; exposed so callers can
 * re-install with custom {@link PredicateEvaluatorOptions} (e.g. a smaller fuel
 * budget, or an atom-aware effectful set) after opting out.
 */
export function installPredicateSupport(
  opts?: PredicateEvaluatorOptions
): void {
  setPredicateEvaluator(createPredicateEvaluator(opts))
  installed = true
}

/** True once predicate support has been installed (and not since cleared). */
export function predicateSupportInstalled(): boolean {
  return installed && getPredicateEvaluator() !== null
}

// Batteries included: wire the engine up on import.
installPredicateSupport()
