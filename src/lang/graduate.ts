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
 * This lives in one place because it was previously three lines inlined in a test, which made
 * "what does graduation do?" a question you could only answer by reading a test — and made it
 * impossible for anything else to do the same thing without copying it.
 */
import { dropRedundantNew } from './declared-classes'
import { switchToGiven } from './switch-to-given'

export interface GraduateResult {
  code: string
  /** One per `switch` left alone, saying why. Empty when everything converted. */
  notes: string[]
  /** How many `switch` statements became `given`. */
  upgraded: number
}

/** The `fromTS` provenance annotation, whose presence IS the JS-semantics opt-out. */
const ANNOTATION = /\/\* tjs <- [^*]*\*\/\n?/

export function graduate(source: string): GraduateResult {
  const native = dropRedundantNew(source.replace(ANNOTATION, ''))
  const given = switchToGiven(native)
  return { code: given.code, notes: given.notes, upgraded: given.rewritten }
}
