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

/**
 * The key a tosijs proxy answers with the value it wraps (`tosiValue` in tosijs). A global
 * registry symbol, so recognising one needs no dependency on tosijs, and nothing that merely
 * has a `valueOf` (a `Date`, a class) is mistaken for one.
 *
 * Why this lives here: a tosijs model hands back proxies (`calculator.x` is a proxy around
 * the number), and JavaScript works with them dynamically (`calculator.x + 1` is a number).
 * TJS's own `==`, truthiness and `given` did not: `calculator.op == '+'` was false and
 * `if (calculator.op)` true for an empty op. A proxy is one more kind of box, so it is
 * unwrapped where boxes already are, and every operator built on this function agrees.
 */
export const TOSI_VALUE = Symbol.for('xin-value')

/**
 * Only the tosijs part: the value a tosijs proxy wraps, else the value itself, never throwing.
 *
 * What a type CHECK reads (the inline twin is `__tv` in emitters/js.ts): a parameter or
 * `Type.check` must accept a tosijs model, but must not start accepting a boxed primitive
 * (`new String('x')` is still not a string to a check), which is the rest of `unwrapBoxed`.
 */
export function unwrapTosi(v: unknown): unknown {
  if (v === null || (typeof v !== 'object' && typeof v !== 'function')) return v
  try {
    const wrapped = (v as any)[TOSI_VALUE]
    if (wrapped !== undefined) return wrapped
  } catch {
    // A proxy whose key read throws is checked as itself.
  }
  return v
}

/**
 * The VM's unwrap: boxed primitives only, by SLOT reads, running no host code (#3531).
 *
 * `String.prototype.valueOf.call(v)` succeeds only on a real String object (it reads the
 * internal slot) and throws on anything else WITHOUT consulting a getter, a Proxy trap or the
 * prototype chain, which `instanceof` and a property get both do. The sandbox needs no
 * tosijs see-through: guest values are membraned data, and a host object that reaches the
 * VM's equality (from an atom tagged `effects: 'pure'`) must not get to run code there.
 */
export function unwrapBoxedSlots(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v
  try {
    return String.prototype.valueOf.call(v)
  } catch {
    // not a String object: the brand check threw, and nothing ran
  }
  try {
    return Number.prototype.valueOf.call(v)
  } catch {
    // not a Number object: the brand check threw, and nothing ran
  }
  try {
    return Boolean.prototype.valueOf.call(v)
  } catch {
    // not a Boolean object: the brand check threw, and nothing ran
  }
  return v
}

/** The runtime implementation. */
export function unwrapBoxed(v: unknown): unknown {
  try {
    if (v !== null && (typeof v === 'object' || typeof v === 'function')) {
      const wrapped = (v as any)[TOSI_VALUE]
      if (wrapped !== undefined) return wrapped
    }
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
  // The symbol is looked up ONCE: `Symbol.for` is a registry lookup, and `__ub` runs at every
  // truthiness site in a .tjs file. Its own name, so it can share a scope with `__tv`'s.
  `const __ubxv=Symbol.for('xin-value');` +
  `function __ub(v){try{` +
  `if(v!==null&&(typeof v==='object'||typeof v==='function')){const w=v[__ubxv];if(w!==undefined)return w}` +
  `if(v instanceof String)return String.prototype.valueOf.call(v);` +
  `if(v instanceof Number)return Number.prototype.valueOf.call(v);` +
  `if(v instanceof Boolean)return Boolean.prototype.valueOf.call(v)` +
  `}catch{return v}return v}`
