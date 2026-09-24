/**
 * `Predicate` — the brand every runtime type and verified predicate carries.
 *
 * A leaf module on purpose. Both `types/Type.ts` (the declaration forms) and
 * `lang/predicate.ts` (verified predicate clusters) need the brand, and `lang/predicate.ts`
 * ships in the lean `tjs-lang/css` bundle — importing all of `Type.ts` for one class would
 * drag the whole type system in behind it.
 *
 * ## Why predicates are functions
 *
 * A predicate is an **ordinary callable carrying facts**, not an object with a callable
 * `check`. Three consequences, and the first is what makes this worth doing at all:
 *
 *   - A verified plain function becomes a predicate by **attaching properties**. No wrapping,
 *     no lifting into a different shape, no two populations to reconcile: `isColor` and
 *     `Type('age', 0)` are the same kind of thing.
 *   - **`check` IS the function**, so there is one implementation that cannot drift from
 *     itself.
 *   - **`instanceof` comes from a real prototype chain**, not `Symbol.hasInstance` standing in
 *     for one.
 *
 * `Predicate.prototype` links to `Function.prototype` so predicates keep `call`/`apply`/`bind`
 * and read as ordinary functions to everything that does not know better.
 */

/**
 * The brand. Every runtime type and verified predicate is `instanceof` this.
 *
 * **Claimed through a shape-versioned global slot**, exactly as `MonadicError` is
 * (`docs/runtime-fusion.md`: *code fuses, data unions*). Six published bundles each carry their
 * own copy of this module, so without the slot `tjs-lang`'s `Predicate` and `tjs-lang/css`'s
 * would be different classes — and `isColor instanceof Predicate` would be **false** for a
 * consumer who imported the brand from one and the predicate from the other. Measured before
 * fixing: `Object.getPrototypeOf(main.Type('Age',0)) !== Object.getPrototypeOf(css.isColor)`.
 *
 * Fusing is sound here for the same reason it is for `MonadicError`: this class is a pure
 * brand with no behaviour, so every copy is observationally identical and which one wins is
 * immaterial. Keyed by SHAPE (`_1`), not by release — keying on the version would mint a new
 * slot every release and fuse nothing.
 */
class PredicateBrand {}
Object.setPrototypeOf(PredicateBrand.prototype, Function.prototype)

const PREDICATE_SLOT = '__tjs_Predicate_1'
const g = globalThis as any
export const Predicate: typeof PredicateBrand = (g[PREDICATE_SLOT] ??=
  PredicateBrand)
/** The instance type, so `Predicate` still works in type position. */
export type Predicate = PredicateBrand

/** What a predicate carries beyond deciding. All optional — the minimum is `check`. */
export interface PredicateFacts {
  description?: string
  toJSONSchema?: () => Record<string, unknown>
  strip?: (value: unknown) => unknown
  [key: string]: unknown
}

/**
 * Brand an ordinary function as a `Predicate`, filling in the defaults.
 *
 * ## Arity is part of the contract, and this is where it is enforced
 *
 * A predicate **decides about one value**. A function taking two is a *relation* — "is `val`
 * valid **for** `prop`" — and branding one makes `instanceof Predicate` mean "callable and
 * boolean-ish" rather than "decides about a value", which is the only thing the brand is good
 * for. So a function declaring more than one parameter is returned **untouched**: not branded,
 * not half-branded, still perfectly callable as itself.
 *
 * This lives here rather than at each call site because it did not, and drifted immediately.
 * `src/css/index.ts` hand-excluded its one binary export with a comment, while
 * `compilePredicate` — the public API that *produces* functions of exactly that shape — branded
 * every cluster export unconditionally. The consequence was not cosmetic: `checkType` dispatches
 * on the presence of `check`, and branding sets `check` to the function itself, so a branded
 * binary relation was invoked with one argument and its second parameter silently `undefined`.
 * Measured before the fix — `checkType(v, differsFrom)` returned `null` for every `v` tried: a
 * validator that always says yes, with no diagnostic.
 *
 * **Arity 0 is branded.** `(...args) => …` and `() => …` both report `0`, so zero means
 * *unknown*, not *not a predicate*; refusing it would break legitimate predicates to catch a
 * shape the arity cannot distinguish. The caller that most needed this — `compilePredicate` —
 * wraps each export in a rest-args fuel closure, so it now copies the underlying arity onto the
 * wrapper. A rule reading a number the wrapper had erased would decide nothing.
 *
 * Declining is silent because the author's intent is unknowable and the absence of the brand is
 * the observable a consumer has to check anyway. `src/lang/predicate-arity.test.ts` pins it.
 *
 * The minimum is **one member**: `check`, which is the function itself. Everything else has a
 * sensible default, so a verified predicate needs to supply nothing:
 *
 * | member | default |
 * | --- | --- |
 * | `check` | the function |
 * | `description` | the function's name |
 * | `toJSONSchema` | `{ $predicate: … }` — claims no structure, which is exactly the progressive-enhancement story: naive validators see "anything", aware ones run the predicate |
 * | `strip` | identity — you cannot strip what you cannot describe |
 * | `example` / `values` | **absent**. Presence IS the capability, so a bare predicate simply does not generate or enumerate |
 *
 * `name` is set when given because it is real introspection — what autocomplete, documentation
 * and error messages show. `length` is inherited from `Function` and says nothing useful.
 */
export function brandPredicate<F extends (...args: any[]) => any>(
  fn: F,
  name?: string,
  facts: PredicateFacts = {}
): F {
  // A relation, not a predicate. Hand it back exactly as it arrived — see the arity note above.
  if (fn.length > 1) return fn

  const p = fn as any
  Object.setPrototypeOf(p, Predicate.prototype)
  if (name)
    Object.defineProperty(p, 'name', { value: name, configurable: true })
  p.check = p
  p.__runtimeType = true
  p.description ??= facts.description ?? p.name ?? 'predicate'
  // No structure claimed: a predicate knows how to DECIDE, not how to describe a shape.
  p.toJSONSchema ??=
    facts.toJSONSchema ?? (() => ({ $predicate: { name: p.name } }))
  p.strip ??= facts.strip ?? ((value: unknown) => value)
  // `toJSON` because a predicate is a FUNCTION, and `JSON.stringify` drops functions —
  // silently, returning `undefined`. Without this, making runtime types callable would have
  // been a quiet data-loss break for anyone persisting or transmitting a type, which is the
  // worst kind: no error, just a missing value somewhere downstream. Serialises the
  // enumerable facts, which is what an object-shaped type serialised to before.
  // NON-ENUMERABLE: as an own enumerable key it changed `Object.keys` and spread (0.14.0
  // re-review) — and worse, a spread COPY carried a toJSON closed over the original, so the copy
  // serialised the original's facts. JSON.stringify looks the method up, so it still finds it.
  if (!('toJSON' in p))
    Object.defineProperty(p, 'toJSON', {
      configurable: true,
      writable: true,
      value: () => {
        // Serialise the FACTS, not the implementation. Excluded, each for a reason:
        //   check      — the function itself; spreading it recurses through this method
        //   toJSON     — likewise
        //   schema     — a tosijs-schema object with internal cycles; it is why
        //                `JSON.stringify(Type(…))` THREW before types were callable, so a
        //                serialisable type is new capability rather than restored behaviour
        //   functions  — `toJSONSchema`/`strip`/`predicate` are behaviour, and JSON drops
        //                functions anyway; omitting them keeps the output clean

        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(p)) {
          if (k === 'check' || k === 'schema') continue
          if (typeof v === 'function') continue
          out[k] = v
        }
        return out
      },
    })

  for (const [k, v] of Object.entries(facts)) if (!(k in p)) (p as any)[k] = v
  return p
}
