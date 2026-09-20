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

/** The brand. Every runtime type and verified predicate is `instanceof` this. */
export class Predicate {}
Object.setPrototypeOf(Predicate.prototype, Function.prototype)

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
  for (const [k, v] of Object.entries(facts)) if (!(k in p)) (p as any)[k] = v
  return p
}
