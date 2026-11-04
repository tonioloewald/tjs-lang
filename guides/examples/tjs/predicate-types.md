<!--{"section": "tjs", "type": "example", "group": "advanced", "order": 30, "parent": "tjs-advanced.md"}-->

# Predicate Types

A type that is a **function you can run** — and, because it is verified safe, one that can
also validate, autocomplete, and travel as JSON Schema.

```tjs:inline
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

<!-- TODO review -->
## What to notice

- **`isColor` is called like any function.** There is no schema object to build and no
  `validate(schema, value)` indirection: a predicate is a value test you can hand to `filter`,
  `every`, a parameter, or a `Type`.
- **`suggestColor` never offers anything `isColor` would reject.** The completions are mined
  out of the predicate's own source (its keyword lists and `startsWith` guards), and each mined
  value is run back through the compiled predicate before it is returned. A hand-maintained
  completion list beside a hand-written validator is two sources of truth; this is one.
- **The import is real library code**, not a stub written for the page. `tjs-lang/css` is
  built entirely from verified predicates, and its `verifyCss()` re-checks every cluster.

<!-- TODO review -->
## Writing your own

You do not need the CSS library to get a predicate type. A `Type` with a `predicate` is one,
and the transpiler runs the predicate-safety verifier over its body when it compiles. This
example is self-contained:

```tjs:inline
Type HexColor {
  description: 'a #rgb or #rrggbb colour'
  example: '#ff0000'
  predicate(x) {
    return (
      typeof x === 'string' &&
      (x.length === 4 || x.length === 7) &&
      x[0] === '#' &&
      x.slice(1).split('').every((c) => '0123456789abcdefABCDEF'.includes(c))
    )
  }
}

// The Type is a parameter type like any other. The return annotation is a
// worked example: swatch('#ff0000') must return exactly this string.
function swatch(color: HexColor): 'swatch #ff0000' {
  return `swatch ${color}`
}

console.log('HexColor.check:')
for (const v of ['#f00', '#ff8800', 'red', '#ggg', 42]) {
  console.log(`  ${JSON.stringify(v).padEnd(10)} -> ${HexColor.check(v)}`)
}

console.log('\nas a parameter type:')
console.log('  swatch("#0af") ->', swatch('#0af'))
const bad = swatch('blue')
console.log(
  '  swatch("blue") ->',
  bad instanceof Error ? 'MonadicError: ' + bad.message : bad
)
```

The predicate iterates with `every` rather than a `for` loop on purpose. A predicate the
verifier can certify (pure, synchronous, no loops, no `await`, no `new`, no IO) compiles to a
fuel-bounded guard, so a pathological input makes it answer `false` instead of hanging your
validation. Write the same check with a `for` loop and it still works, because TJS never
rejects a predicate it cannot verify (that would make legal JavaScript illegal); it simply runs
as an ordinary, unbounded function. Prefer the verifiable style for anything that will see
untrusted data.

<!-- TODO review -->
## Limits worth knowing

- **"Verified" is a promise about your own code, not a sandbox.** Verified predicates compile
  to native JavaScript, and no syntactic check makes native JavaScript safe against a
  *hostile author*. So the JSON-Schema `$predicate` paths (`compilePredicateSchema`,
  `createPredicateEvaluator`) run a predicate source only if the host registered it with
  `trustPredicate` or opted in with `trustAllPredicates`; anything else fails closed. Do not
  accept predicate source from users and expect the verifier to protect you.
- **Regex literals inside a predicate run on tjs-lang's own linear engine**, not the host's,
  so a catastrophic-backtracking pattern cannot hang a certified predicate. That engine has no
  backreferences or lookaround.
- **The first example imports `tjs-lang/css`**, so it needs a host that can resolve that
  package. The `HexColor` example has no imports and runs anywhere.

See [Declarations](/declarations/) for the full `Type` syntax and the
[north-star note](/type-system-north-star/) for where `$predicate` is heading.
