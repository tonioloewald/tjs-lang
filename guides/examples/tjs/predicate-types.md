<!--{"section": "tjs", "type": "example", "group": "advanced", "order": 30, "parent": "tjs-advanced.md"}-->
<!-- TODO review -->

# Predicate Types

A predicate type is a type that is a **function you can run**: it takes a value and returns
`true` or `false`. When the toolchain can prove the function is safe, the same function also
validates untrusted input without hanging, supplies autocomplete, and can travel inside a JSON
Schema.

"Safe" here means three things: the function has no side effects, gives the same answer for
the same input, and cannot run forever. The proof happens when the code is compiled, and
success is silent: a predicate that passes produces no warning.

The examples on this page that import `tjs-lang/css`, `tjs-lang/lang` or `tjs-lang/schema`
use real library code. To run one outside this page, install `tjs-lang` and run the file with
the `tjs` command (`tjs run file.tjs`). The `HexColor` example below has no imports.

```tjs:inline
/#
## A predicate is a function: call it

`isColor` answers whether a string is a valid CSS color, in any of its
forms: `#f00`, `rgb(1 2 3)`, `color-mix(in oklch, red, blue)` and 148
named keywords. `suggestColor` offers completions for a prefix, mined from
the same predicate.
#/

import { isColor, suggestColor } from 'tjs-lang/css'

console.log('validation:')
console.log('  #ff0000              ->', isColor('#ff0000'))
console.log('  rebeccapurple        ->', isColor('rebeccapurple'))
console.log('  rgb(255 128 0)       ->', isColor('rgb(255 128 0)'))
console.log('  notacolor            ->', isColor('notacolor'))
console.log('  #gggggg              ->', isColor('#gggggg'))

// It is an ordinary function, so it works anywhere a function does.
console.log('  filter ->', ['red', 'nope', '#0af'].filter(isColor))

// --- Completions are mined from the same predicate that validates ---
console.log('\nautocomplete from the same source:')
const forRe = suggestColor('re')
console.log('  "re"  ->', forRe.map((s) => `${s.value} (${s.kind})`).join(', '))
console.log('  "var" ->', suggestColor('var').map((s) => `${s.value} (${s.kind})`).join(', '))

// suggestColor has already checked its values. We check again here only to
// show the guarantee; you never need to do this yourself.
const allValid = forRe.every((s) => s.kind !== 'value' || isColor(s.value))
console.log('  every value suggestion is valid ->', allValid)

test 'the predicate accepts every CSS color form' {
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

The `/# … #/` block at the top is a TJS doc comment: markdown that renders above the code (see
[TJS Syntax](/tjs-syntax/)).

## What to notice

- **`isColor` is called like any function.** There is no schema object to build and no
  separate validate step. You can pass it to `filter`, as the example does, or to `every`,
  `some` and anything else that takes a test.
- **A suggestion is `{ value, kind }`, and `kind` is `'value'` or `'stub'`.** A value is a
  complete color (`red`). A stub is an open-ended prefix the user still has to finish, such as
  `var(--`, so it cannot be validated yet. `suggestColor` never offers a complete value that
  `isColor` would reject: the completions are mined from the predicate's own source (its
  keyword lists and `startsWith` guards), and each mined value is run back through the compiled
  predicate before it is returned. A completion list kept by hand beside a validator written by
  hand is two sources of truth that drift apart; this is one.

## Why JSON Schema needs this

JSON Schema describes structure well and computation not at all. It can say "a string". It
cannot say "a valid CSS color", because that is a grammar, not a shape. So real schemas end up
with a `pattern` that approximates the grammar badly, or give up and say `type: 'string'`. A
predicate is the missing half.

The verifier checks a **predicate cluster** (a few functions that may call each other) for
what it needs: no IO, no clock, no randomness, no loops, no `await`, no `new`. A cluster that
passes gets three things:

1. **It compiles to plain JavaScript with a fuel budget**, so validation costs a function
   call, and a hostile input cannot make it hang. Fuel is a step budget: the compiled code
   spends one unit each time a function in the cluster is entered (including each call of an
   `every` callback), and when the budget runs out the check stops. The default is 1,000,000
   per top-level call. What happens then is covered under "Limits worth knowing" below.
2. **It can be mined for completions**, as `suggestColor` shows.
3. **Its source can be carried in JSON Schema** under the `$predicate` keyword. A validator
   that does not know the keyword checks the structure and ignores it; one that does also runs
   the predicate.

The CSS validators in `tjs-lang/css` are all built this way.

## Writing your own

You do not need the CSS library to get a predicate type. A `Type` with a `predicate` is one,
and the transpiler runs the verifier over the predicate when it compiles the file. The block
has three fields: `description` is documentation, `example` says what a value looks like (here
a string, so non-strings fail before the predicate runs), and `predicate(x)` is the rule. The
Type's `.check(value)` method returns `true` or `false`. [Declarations](/declarations/) covers
the full `Type` syntax.

```tjs:inline
Type HexColor {
  description: 'a #rgb or #rrggbb color'
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

// The Type is a parameter type like any other.
function swatch(color: HexColor) {
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

This compiles with no warning, which means the predicate was verified. A call with a bad
argument does not throw: it returns a `MonadicError` describing the failure (see
[Error Handling](/error-handling/)). A `MonadicError` is an `Error`, so `instanceof Error`
detects it.

The predicate iterates with `every` rather than a `for` loop on purpose. Fuel is spent when a
function is entered, so an `every` callback pays for each element it visits. A loop body is
not a function, so its iterations would cost nothing, and the verifier does not certify loops.
Here is the same kind of check written with a loop:

```tjs:inline
Type Digits {
  example: '123'
  predicate(x) {
    if (typeof x !== 'string') return false
    for (const c of x) {
      if (!'0123456789'.includes(c)) return false
    }
    return true
  }
}

console.log(Digits.check('42'), Digits.check('4x'))   // true false
```

It still works: TJS never rejects a predicate it cannot verify (that would make legal
JavaScript illegal). It compiles it as a plain function and warns:

```text
Warning: Type 'Digits': predicate is not verifiable, compiled as a plain function
(not fuel-bounded, not safe on untrusted data) — Digits (2:4): loops are not allowed —
iterate with recursion or array methods (every/some/map/filter/reduce) so work stays
fuel-bounded
```

Prefer the verifiable style for anything that will see untrusted data.

## Regular expressions: two different paths

Whether a regex is allowed depends on where the predicate runs. The two answers differ
because the two paths run regexes on different engines.

| Where the predicate runs                         | Regex literal allowed? | Engine                     |
| ------------------------------------------------ | ---------------------- | -------------------------- |
| a `Type` predicate in a `.tjs` file              | no: unverified         | the host's native `RegExp` |
| `compilePredicate` (a library call)              | yes                    | tjs-lang's linear engine   |
| a `$predicate` validator (`tjs-lang/schema` etc) | yes                    | tjs-lang's linear engine   |

The **linear engine** is tjs-lang's own regex engine. Its time grows in step with the input
and the pattern, so no pattern can backtrack catastrophically, and each step it takes is
charged to the predicate's fuel.

**In a `Type` predicate, a regex makes the predicate unverifiable.** The transpiler writes the
verified predicate into your file as self-contained JavaScript, with no tjs-lang import, so it
cannot bring the linear engine along. A native regex match is one call that fuel cannot see
inside, so the predicate falls back to a plain function, with a warning that ends:

```text
regex /^#[0-9a-f]{3}$/ cannot be verified in an emitted guard: a native match is one call
that fuel cannot see inside. Write the check with string methods (includes, indexOf,
startsWith, split) to keep it verified, or accept an unverified predicate; compilePredicate
(a library call) can run regexes on the metered engine
```

This is the rule [Declarations](/declarations/) states for `Type`, and why its `Email` example
uses string methods.

**In the library paths, a regex literal is fine.** `compilePredicate` (from `tjs-lang/lang`)
takes the predicate source and a list of the function names you want back, and returns an
object of compiled functions keyed by those names. A pattern that backtracks catastrophically
in a normal engine answers at once here:

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

The last call is a genuine `false`: the linear engine finishes 100,000 characters well within
the default budget. With a smaller budget (`compilePredicate(source, ['isRun'], { fuel: 1000 })`)
the same call throws `PredicateFuelExhausted` instead.

The linear engine has no backreferences and no lookaround. `compilePredicate` throws at
compile time on a pattern that uses them, with a message such as
`regex /(a)\1/ is not supported by the linear regex engine: Backreferences are not supported`.

## Predicates in JSON Schema: `$predicate`

A `$predicate` is a JSON Schema keyword whose value is the source of a predicate cluster, as a
string. The last function in the source is the one the validator calls. (`compilePredicate`
does not use that rule, because you name the functions you want.)

A predicate-aware validator runs a `$predicate` source only if the host has said it trusts
that source. `tjs-lang/css` registers its own predicates as trusted when it is imported, so
its schemas work with no setup:

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
predicate engine registered on import, so its `validate(value, schema)` runs `$predicate` with
no wiring:

```tjs:inline
import { validate } from 'tjs-lang/schema'
import { cssColorSchema } from 'tjs-lang/css'

console.log(validate('rebeccapurple', cssColorSchema()))   // true
console.log(validate('notacolor', cssColorSchema()))       // false
```

**Your own predicate in a schema.** Write the source as a string, put it under `$predicate`,
and register it with `trustPredicate` (exported from `tjs-lang/schema` and `tjs-lang/lang`).
Until it is registered, the validator fails closed and logs why:

```tjs:inline
import { validate, trustPredicate } from 'tjs-lang/schema'

const source = `function isHex(s) {
  return s.length === 7 && s[0] === '#' &&
    s.slice(1).split('').every((c) => '0123456789abcdef'.includes(c))
}`
const schema = { type: 'string', $predicate: source }

console.log(validate('#ff8800', schema))   // false: not trusted yet

trustPredicate(source)
console.log(validate('#ff8800', schema))   // true
console.log(validate('#ff88zz', schema))   // false
console.log(validate(42, schema))          // false: not a string
```

The [Zod chapter](/ts-from-zod/) has a longer worked example.

**A `Type`'s own schema does not carry its predicate today.** `HexColor.toJSONSchema()` from
the example above returns `{}`, not even `{ type: 'string' }`. That is a gap, not a design
choice. To ship a predicate in a schema, write it as source and build the `$predicate` schema
yourself, as above.

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

## Which one to use

- **A `Type` with a `predicate`**: to check parameters and values in your own `.tjs` code. A
  bad parameter returns a `MonadicError`; `.check(v)` returns `false`. No regex literals.
- **`compilePredicate`**: for a standalone predicate function, regexes allowed. Returns
  `true`/`false`, and throws `PredicateFuelExhausted` when the budget runs out.
- **`validate` from `tjs-lang/schema`**: to check data against a JSON Schema that may carry
  `$predicate`. Returns `true`/`false`, including `false` for an untrusted source or an
  exhausted budget.
- **`compilePredicateSchema`**: when you want a reusable validator for one schema. Returns
  `{ valid, … }` per call; throws on an untrusted source or an exhausted budget.

See [Declarations](/declarations/) for the full `Type` syntax and the
[north-star note](/type-system-north-star/) for where `$predicate` is heading.
