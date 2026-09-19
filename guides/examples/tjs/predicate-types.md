<!--{"section":"tjs","type":"example","group":"advanced","order":30}-->

# Predicate Types

A type that is a **function you can run** — and, because it is verified safe, one that can
also validate, autocomplete, and travel as JSON Schema.

```tjs
/#
## The gap this fills

JSON Schema describes STRUCTURE well and computation not at all. "A string"
it can say. "A valid CSS colour" it cannot — that is `#f00`, `rgb(1 2 3)`,
`color-mix(in oklch, red, blue)` and 148 named keywords, which is a grammar,
not a shape.

So every real schema ends up with a `pattern` that is a bad approximation,
or gives up and says `type: 'string'`.

A **predicate** is the missing half: an ordinary function returning true or
false. The interesting part is not that you can write one — it is what
becomes possible once the toolchain can PROVE the function is safe.

## Verified-safe means three things follow

A predicate cluster is checked to be pure, synchronous and composable: no IO,
no clock, no randomness, no unbounded regex backtracking. Given that proof:

1. **It compiles to native JavaScript** — validation costs a function call,
   not an interpreter.
2. **It can be MINED for completions.** The verifier already knows the
   keyword sets and `startsWith` guards inside the predicate, so autocomplete
   comes from the same source as validation and cannot disagree with it.
3. **It serialises into JSON Schema** as the `$predicate` keyword. Naive
   validators see ordinary structure and ignore it; aware ones run the
   predicate. Progressive enhancement, not a fork.

That last point is the strategic one: types stop being erased annotations and
become portable, executable artifacts. See `docs/type-system-north-star.md`.

## `tjs-lang/css` is this made real

Not a toy — the CSS validators are built from verified predicates, and
`suggestColor` mines its completions from the same predicate that validates.
The suggestions are guaranteed valid because they are run through the
compiled predicate before being offered.
#/

import { isColor, suggestColor } from 'tjs-lang/css'

// --- A predicate is just a function: run it ---
console.log('validation:')
console.log('  #ff0000              ->', isColor('#ff0000'))
console.log('  rebeccapurple        ->', isColor('rebeccapurple'))
console.log('  rgb(255 128 0)       ->', isColor('rgb(255 128 0)'))
console.log('  notacolor            ->', isColor('notacolor'))
console.log('  #gggggg              ->', isColor('#gggggg'))

// --- Completions are MINED from the same predicate that validates ---
// Not a separate hand-maintained list, so the two cannot drift apart.
console.log('\nautocomplete from the same source:')
const forRe = suggestColor('re')
console.log('  "re" ->', forRe.map((s) => s.value).join(', '))

// Every suggestion is run through the compiled predicate before being offered,
// so an invalid completion is not something this API can produce.
const allValid = forRe.every((s) => s.kind !== 'value' || isColor(s.value))
console.log('  all suggestions valid ->', allValid)

test 'the predicate accepts every CSS colour form' {
  expect(isColor('#ff0000')).toBe(true)
  expect(isColor('rebeccapurple')).toBe(true)
  expect(isColor('rgb(255 128 0)')).toBe(true)
}

test 'and rejects near-misses' {
  expect(isColor('notacolor')).toBe(false)
  expect(isColor('#gggggg')).toBe(false)
}

test 'completions come from the predicate, and are all valid' {
  const suggestions = suggestColor('re')
  expect(suggestions.length > 0).toBe(true)
  // The guarantee: mined values are run through the compiled predicate.
  expect(suggestions.every((s) => s.kind !== 'value' || isColor(s.value))).toBe(
    true
  )
}

test 'suggestions are relevant to the prefix' {
  const values = suggestColor('re').map((s) => s.value)
  expect(values).toContain('red')
}
```
