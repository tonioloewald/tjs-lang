<!--{"section": "tjs", "type": "example", "group": "advanced", "order": 30, "parent": "tjs-advanced.md"}-->
<!-- TODO review -->

# Predicate Types

A predicate type is a type that is a **function you can run**. When the toolchain can prove
the function is safe, the same function also validates untrusted input without hanging,
supplies autocomplete, and can travel inside a JSON Schema.

```tjs:inline
/#
## The gap this fills

JSON Schema describes STRUCTURE well and computation not at all. It can say
"a string". It cannot say "a valid CSS colour": that is `#f00`,
`rgb(1 2 3)`, `color-mix(in oklch, red, blue)` and 148 named keywords, which
is a grammar, not a shape. So real schemas end up with a `pattern` that
approximates the grammar badly, or give up and say `type: 'string'`.

A **predicate** is the missing half: an ordinary function that returns true
or false. What matters is what becomes possible once the toolchain can PROVE
the function is safe.

## What verification buys

A predicate cluster (a few functions that call each other) is checked to be
pure, synchronous and composable: no IO, no clock, no randomness, no loops,
no `await`, no `new`. Given that proof:

1. **It compiles to native JavaScript** with a fuel bound, so validation
   costs a function call and a hostile input makes it answer `false` instead
   of hanging.
2. **It can be mined for completions.** The keyword sets and `startsWith`
   guards inside the predicate become autocomplete suggestions, so the
   completions come from the same source as the validation.
3. **Its source can be carried in JSON Schema** under the `$predicate`
   keyword. A validator that does not know the keyword checks the structure
   and ignores it; one that does also runs the predicate.

## `tjs-lang/css` is built this way

The CSS validators in `tjs-lang/css` are verified predicates, and
`suggestColor` mines its completions from the same predicate `isColor` runs.
Each suggestion is run through the compiled predicate before it is offered.
#/

import { isColor, suggestColor } from 'tjs-lang/css'

// --- A predicate is a function: call it ---
console.log('validation:')
console.log('  #ff0000              ->', isColor('#ff0000'))
console.log('  rebeccapurple        ->', isColor('rebeccapurple'))
console.log('  rgb(255 128 0)       ->', isColor('rgb(255 128 0)'))
console.log('  notacolor            ->', isColor('notacolor'))
console.log('  #gggggg              ->', isColor('#gggggg'))

// --- Completions are mined from the same predicate that validates ---
console.log('\nautocomplete from the same source:')
const forRe = suggestColor('re')
console.log('  "re" ->', forRe.map((s) => s.value).join(', '))

// Every suggestion is run through the compiled predicate before it is offered.
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
  expect(suggestions.every((s) => s.kind !== 'value' || isColor(s.value))).toBe(
    true
  )
}

test 'suggestions are relevant to the prefix' {
  const values = suggestColor('re').map((s) => s.value)
  expect(values).toContain('red')
}
```

## What to notice

- **`isColor` is called like any function.** There is no schema object to build and no
  `validate(schema, value)` step: a predicate is a test you can hand to `filter`, `every`, a
  parameter, or a `Type`.
- **`suggestColor` never offers anything `isColor` would reject.** The completions are mined
  from the predicate's own source (its keyword lists and `startsWith` guards), and each mined
  value is run back through the compiled predicate before it is returned. A completion list
  kept by hand beside a validator written by hand is two sources of truth that drift apart;
  this is one.
- **The import is real library code**, not a stub written for this page. `tjs-lang/css` is
  built entirely from verified predicates, and its `verifyCss()` re-checks every cluster.

## Writing your own

You do not need the CSS library to get a predicate type. A `Type` with a `predicate` is one,
and the transpiler runs the predicate-safety verifier over its body when it compiles the file.
This example has no imports:

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

The predicate iterates with `every` rather than a `for` loop on purpose. Loops are outside
what the verifier certifies, because their work is not fuel-bounded. Write the same check
with a `for` loop and it still works: TJS never rejects a predicate it cannot verify (that
would make legal JavaScript illegal). It compiles it as a plain function and warns:

```text
Warning: Type 'Digits': predicate is not verifiable, compiled as a plain function
(not fuel-bounded, not safe on untrusted data) — Digits (2:4): loops are not allowed —
iterate with recursion or array methods (every/some/map/filter/reduce) so work stays
fuel-bounded
```

Prefer the verifiable style for anything that will see untrusted data.

## Regular expressions: two different paths

Whether a regex is allowed depends on where the predicate runs, and the two paths give
opposite answers. They do not contradict each other; they run on different engines.

**In a `Type` predicate in a `.tjs` file, a regex makes the predicate unverifiable.** The
transpiler emits the verified predicate as self-contained native JavaScript, and that output
cannot carry tjs-lang's own regex engine. A native regex match is one call that fuel cannot
see inside, so the predicate falls back to a plain function, with a warning that ends:

```text
regex /^#[0-9a-f]{3}$/ cannot be verified in an emitted guard: a native match is one call
that fuel cannot see inside. Write the check with string methods (includes, indexOf,
startsWith, split) to keep it verified, or accept an unverified predicate; compilePredicate
(a library call) can run regexes on the metered engine
```

This is the rule [Declarations](/declarations/) states for `Type`, and why its `Email` example
uses string methods.

**In the library paths, a regex literal is fine.** `compilePredicate` (from `tjs-lang/lang`)
and every `$predicate` evaluator compile the predicate together with tjs-lang's linear regex
engine, which charges each step to the predicate's fuel. A pattern that backtracks
catastrophically in a normal engine answers at once here:

```tjs:inline
import { compilePredicate } from 'tjs-lang/lang'

// /^(a+)+$/ against "aaa…a!" takes exponential time in a backtracking engine.
const { isRun } = compilePredicate(
  `function isRun(s) { return typeof s === 'string' && /^(a+)+$/.test(s) }`,
  ['isRun']
)

console.log(isRun('aaaa'))                      // true
console.log(isRun('a'.repeat(30) + '!'))        // false, immediately
console.log(isRun('a'.repeat(100000) + '!'))    // false
```

The linear engine has no backreferences and no lookaround; a pattern that uses them is
refused.

## Predicates in JSON Schema: `$predicate`

A `$predicate` is a JSON Schema keyword whose value is the source of a predicate cluster; the
last function in the source is the entry. `tjs-lang/css` builds such schemas for you:

```tjs:inline
import { cssColorSchema } from 'tjs-lang/css'
import { compilePredicateSchema } from 'tjs-lang/lang'

const schema = cssColorSchema()
console.log(Object.keys(schema))   // [ "type", "title", "$predicate" ]
console.log(schema.type)           // string

// A validator that knows $predicate runs it...
const aware = compilePredicateSchema(schema)
console.log(aware('red').valid, aware('notacolor').valid)   // true false

// ...one that does not checks only the structure: any string passes.
const naive = compilePredicateSchema(schema, { ignorePredicates: true })
console.log(naive('notacolor').valid)                        // true
```

That is progressive enhancement: one schema, which other JSON Schema tools accept and check
loosely, and which a predicate-aware validator checks exactly.

**`tjs-lang/schema` is the batteries-included consumer.** It is tosijs-schema with tjs-lang's
predicate engine registered on import, so its `validate` runs `$predicate` with no wiring:

```tjs:inline
import { validate } from 'tjs-lang/schema'
import { cssColorSchema } from 'tjs-lang/css'

console.log(validate('rebeccapurple', cssColorSchema()))   // true
console.log(validate('notacolor', cssColorSchema()))       // false
```

To put your own predicate in a schema, register its source with `trustPredicate` (see the
[Zod chapter](/ts-from-zod/) for a worked example, and the trust limit below).

**A `Type`'s own schema does not carry its predicate today.** `HexColor.toJSONSchema()` from
the example above returns `{}`: a declared `Type` exports its structure, not its predicate. To
ship a predicate in a schema, write it as source and build the `$predicate` node yourself.

## Limits worth knowing

- **"Verified" is a promise about your own code, not a sandbox.** Verified predicates compile
  to native JavaScript, and no syntactic check makes native JavaScript safe against a
  _hostile author_. So the `$predicate` paths (`compilePredicateSchema`,
  `createPredicateEvaluator`, `tjs-lang/schema`'s `validate`) run a predicate source only if
  the host registered it with `trustPredicate` or opted in with `trustAllPredicates`. Anything
  else fails closed: `compilePredicateSchema` throws, and `validate` returns `false`. Never pass
  predicate source you received as data to `trustPredicate`.
- **A verified predicate is bounded, not fast by fiat.** Fuel stops a runaway predicate; it
  does not make an expensive one cheap. A `Type` check or a `tjs-lang/schema` `validate` that
  runs out of fuel answers `false`; a function from `compilePredicate` or
  `compilePredicateSchema` throws `PredicateFuelExhausted` (exported from `tjs-lang/lang`), so
  catch it if you call those on untrusted input.
- **The examples that import `tjs-lang/css`, `tjs-lang/lang` or `tjs-lang/schema` need a host
  that can resolve those packages.** The `HexColor` example has no imports and runs anywhere.

See [Declarations](/declarations/) for the full `Type` syntax and the
[north-star note](/type-system-north-star/) for where `$predicate` is heading.
