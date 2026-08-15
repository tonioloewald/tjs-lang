/**
 * ONE definition of "unwrap a boxed primitive", for the runtime and for emitted code.
 *
 * A leaf module with no dependencies, following `src/forbidden-keys.ts` and
 * `src/redos.ts`: the fact lives here once, and the inline copy is GENERATED from the
 * same text rather than written out again.
 *
 * ## Why this needed extracting
 *
 * The logic existed six times at three hardening levels, and the copies measurably
 * disagreed — on shipped semantics, because emitted code calls `Is`/`Eq` **bare**, so the
 * inline stub always wins (`docs/type-identity.md`). Two verified divergences:
 *
 * ```
 * class Liar extends Number { valueOf() { return 999 } }
 * Is(new Liar(1), 999)      shared: false    emitted: true   <- ran the hostile method
 *
 * const p = new Proxy({}, { getPrototypeOf: () => Boolean.prototype })
 * p == true                 shared: false    emitted: THREW  <- out of `==`
 * ```
 *
 * The second is the worse one: a `==` that throws breaks the language's central promise
 * that errors are RETURNED, not thrown.
 *
 * ## The two hardenings, and why each is load-bearing
 *
 * 1. **Read the internal slot via the prototype method, never `v.valueOf()`.** A subclass
 *    can override `valueOf`; a slot read cannot be intercepted, so it can neither run user
 *    code nor lie about the value.
 * 2. **Fail soft**, because `instanceof` can lie too: a Proxy with a `Symbol.hasInstance`
 *    or `getPrototypeOf` trap passes the guard and then makes the slot read throw a raw
 *    `TypeError`. A value that will not yield a primitive slot simply is not a boxed
 *    primitive, so it is returned unchanged.
 *
 * The hardening was applied by hand to three copies in an earlier pass — and, as the
 * review put it, to the copies emitted code does not run.
 */

/** The runtime implementation. */
export function unwrapBoxed(v: unknown): unknown {
  try {
    if (v instanceof String) return String.prototype.valueOf.call(v)
    if (v instanceof Number) return Number.prototype.valueOf.call(v)
    if (v instanceof Boolean) return Boolean.prototype.valueOf.call(v)
  } catch {
    // `instanceof` lied — a trap, not a boxed primitive.
    return v
  }
  return v
}

/**
 * The SAME logic as an emittable source string, named `__ub`.
 *
 * Kept beside the function it mirrors so a change to one is a visibly incomplete change
 * unless the other moves with it, and pinned by `src/unwrap-boxed.test.ts`, which runs
 * this text and the function above against the same hostile corpus and demands identical
 * answers. That is the part that makes "two copies" safe: they are checked against each
 * other, not merely written carefully.
 */
export const UNWRAP_BOXED_SOURCE =
  `function __ub(v){try{` +
  `if(v instanceof String)return String.prototype.valueOf.call(v);` +
  `if(v instanceof Number)return Number.prototype.valueOf.call(v);` +
  `if(v instanceof Boolean)return Boolean.prototype.valueOf.call(v)` +
  `}catch{return v}return v}`
