/**
 * Graduation — turn a CONVERTED file into a native TJS one.
 *
 * `fromTS` produces a file carrying a `tjs <- source` provenance comment, and it means **JS
 * semantics**: it is a faithful translation, so nothing about how the code behaves changes.
 * Graduating removes it, which opts the file into every TJS rule at once, and applies the
 * rewrites that are only correct once that has happened.
 *
 * Two steps, and they are only safe in this order:
 *
 * 1. **`new` on a locally-declared class is dropped.** In native TJS `class X {}` emits a
 *    Proxy-wrapped callable and `new X` is rejected outright; under the annotation a class is
 *    not callable and `new` is load-bearing. Doing this at conversion time shipped converted
 *    modules that could not be IMPORTED — a `static zero = new Thing(0)` field throws at
 *    module-evaluation time (#37).
 * 2. **`switch` becomes `given` where that provably means the same thing.** `given` is lowered
 *    only for native TJS, so this too is a graduation step and not a conversion one — emitting
 *    it from `fromTS` would produce a file that does not parse, which is #37's shape again
 *    with a different keyword.
 *
 * 3. **It must still compile.** Conversion (`emitters/from-ts-faithful.ts`) already wrote every
 *    JavaScript reliance in a spelling both semantics share (`DangerousLegacyEquals`,
 *    `LegacyTypeOf`, `LegacyDate`, `LegacyDefault`, `5.0`, hoisted `let`), so graduation
 *    preserves behaviour. What remains is what nothing can preserve (`eval`, `new Function`):
 *    graduation REFUSES, naming it, and returns the input unchanged.
 *
 * The one behaviour graduation deliberately changes: truthiness unwraps boxed primitives
 * (`new Boolean(false)` becomes falsy). No code relies on a boxed false being true on purpose.
 *
 * This lives in one place because it was previously three lines inlined in a test, which made
 * "what does graduation do?" a question you could only answer by reading a test — and made it
 * impossible for anything else to do the same thing without copying it.
 */
import { dropRedundantNew } from './declared-classes'
import { switchToGiven } from './switch-to-given'
import { tjs } from './core'

export interface GraduateResult {
  code: string
  /** One per `switch` left alone, saying why. Empty when everything converted. */
  notes: string[]
  /** How many `switch` statements became `given`. */
  upgraded: number
  /**
   * Why the file cannot graduate, when it cannot: the native-TJS error at the site (`eval`,
   * `new Function`, anything else native TJS refuses that conversion could not rewrite).
   * `code` is then the INPUT, unchanged: a converted file that runs beats a graduated one that
   * does not compile.
   */
  refused?: string
}

/** The `fromTS` provenance annotation, whose presence IS the JS-semantics opt-out. */
const ANNOTATION = /\/\* tjs <- [^*]*\*\/\n?/

export function graduate(source: string): GraduateResult {
  const native = dropRedundantNew(source.replace(ANNOTATION, ''))
  const given = switchToGiven(native)
  // Conversion writes every JavaScript reliance in a spelling both semantics share
  // (`from-ts-faithful.ts`), so what is left to fail here is what nothing can preserve.
  try {
    tjs(given.code, { runTests: false })
  } catch (e) {
    return {
      code: source,
      notes: given.notes,
      upgraded: 0,
      refused: String((e as Error).message).split('\n')[0],
    }
  }
  return { code: given.code, notes: given.notes, upgraded: given.rewritten }
}
