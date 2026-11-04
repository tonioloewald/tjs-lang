<!--{"section": "tjs", "order": 16, "parent": "tjs-basics.md"}-->

# Polymorphic Functions

Multiple function declarations with the same name, automatically dispatched by argument types

Define multiple versions of a function with the same name but different
parameter signatures. TJS automatically dispatches to the right one based
on the number and types of arguments.

Like Swift/Obj-C method overloading, but at the source level.

```tjs:static
// Same name, different arities
function describe(value: 0) {
  return 'number: ' + value
}

function describe(value: '') {
  return 'string: ' + value
}

function describe(value: true) {
  return 'boolean: ' + value
}

test 'dispatch by type' {
  expect(describe(42)).toBe('number: 42')
  expect(describe('hello')).toBe('string: hello')
  expect(describe(true)).toBe('boolean: true')
}

// Different arities
function area(radius: 3.14) {
  return Math.PI * radius * radius
}

function area(width: 0.0, height: 0.0) {
  return width * height
}

test 'dispatch by arity' {
  expect(Math.round(area(1))).toBe(3)
  expect(area(3, 4)).toBe(12)
}
```

<!-- TODO review -->
## What to notice

Each declaration is an ordinary TJS function with its own typed parameters. When a name is
declared more than once, the transpiler merges the declarations into one **dispatcher**: a
single `describe` that looks at the arguments it was given and calls the variant whose
signature they fit. The variants keep their own validation, documentation and signature
tests, so `describe(value: 0)` is still checked as "an integer" inside its own body.

Dispatch is decided in a fixed order:

1. **Arity** — how many arguments were passed. `area(1)` can only be the one-argument variant.
2. **Type specificity** — among variants with the same arity, the narrower type wins. An
   integer argument prefers `0` over `0.0`; a non-integer can only match `0.0`.
3. **Declaration order** — the tie-breaker when two variants are equally specific.

The type you would otherwise test by hand with `typeof` and `Array.isArray` at the top of a
function is now the signature, which is also what the documentation shows.

<!-- TODO review -->
## Integer and float as separate variants

Because the example value carries the numeric kind, `0` and `0.0` are different signatures,
and you can give whole numbers and fractions different behaviour:

```tjs:inline
function format(n: 0) {
  return `${n} (whole)`
}

function format(n: 0.0) {
  return `${n.toFixed(2)} (fraction)`
}

console.log(format(42))
console.log(format(1.5))

// No variant takes a string, so the dispatcher returns an error value
const miss = format('ten')
console.log('format("ten") ->', miss instanceof Error ? miss.message : miss)
```

When no variant fits, the call does not throw and does not fall through to the "closest"
variant: it returns a `MonadicError` ("no matching overload"), exactly as a single function
returns one for a bad argument.

<!-- TODO review -->
## Gotchas

- **Two variants must be distinguishable.** If two declarations have the same arity and the
  same types at every position, the transpiler refuses the file ("ambiguous signatures"). Only
  the parameter *types* count, so renaming a parameter does not make a new signature, and
  `(x: '')` and `(x: 'a')` are the same signature: both are "a string".

<!-- tjs-doc: expect-error -->

```tjs:static
function label(id: 0) { return 'by id' }
function label(index: 0) { return 'by index' } // same signature: rejected
```

- **Dispatch looks at types, not values.** Overloading is for "a number or a string", not for
  "zero or not zero". Branch on values inside one function, or with
  [`given`](/given-dispatch/).
- Classes get the same treatment for constructors: see
  [Polymorphic Constructors](/polymorphic-constructors/).
