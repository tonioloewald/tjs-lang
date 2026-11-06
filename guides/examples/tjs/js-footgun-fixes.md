<!--{"section": "tjs", "order": 17, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# JS Footgun Fixes

Rename a `.js` file to `.tjs` and most of it means exactly what it meant before. A short
list of things changes, all on purpose, all at compile time, and none behind a switch. This
chapter is that list. It covers two items in full, truthiness of boxed primitives and
`typeof null`, and points to the chapter that owns each of the others.

```tjs:inline
/#
## Boxed false is false

`new Boolean(false)` is an object, and JavaScript calls every object truthy,
so in a `.js` file `if (new Boolean(false))` runs its body. In a `.tjs` file
every truthiness test unwraps a boxed primitive first.
#/

const no = new Boolean(false)
const empty = new String('')
const zero = new Number(0)

console.log(no ? 'truthy' : 'falsy')          // falsy   (JS: truthy)
console.log(Boolean(no), !no)                 // false true   (JS: true false)
console.log(empty ? 'truthy' : 'falsy')       // falsy   (JS: truthy)
console.log(zero ? 'truthy' : 'falsy')        // falsy   (JS: truthy)

// || and && still return one of their operands; only the decision changes
console.log(no || 'fallback')                 // fallback   (JS: [Boolean: false])
console.log(no && 'never')                    // [Boolean: false]

// ?? tests for null and undefined, not truthiness, so it is unchanged
console.log(no ?? 'fallback')                 // [Boolean: false]

let laps = 0
while (no) {                                  // loop conditions are tests too
  laps++
  break
}
console.log('laps:', laps)                    // 0   (JS: 1)

/#
## typeof null is 'null'

JavaScript's `typeof null` is `'object'`, a bug from the first version of the
language that was kept for compatibility. It is why `typeof x == 'object'`
checks so often let `null` through. In `.tjs` the answer is `'null'`, and
every other answer is unchanged.
#/

function kind(x) {
  if (typeof x == 'object') return 'an object'
  return typeof x
}
console.log(kind({}), '/', kind(null))        // an object / null   (JS: an object / an object)

test 'a boxed false is falsy everywhere' {
  expect(no ? 'truthy' : 'falsy').toBe('falsy')
  expect(!no).toBe(true)
  expect(Boolean(no)).toBe(false)
  expect(no || 'fallback').toBe('fallback')
}

test '?? is untouched' {
  expect(no ?? 'fallback').toBe(no)
}

test 'typeof null is null' {
  expect(typeof null).toBe('null')
  expect(typeof {}).toBe('object')
  expect(kind(null)).toBe('null')
}
```

## What to notice

The truthiness rule covers every place JavaScript asks "is this true?": `if`, `while`,
`for` and `do` conditions, `!`, `&&`, `||`, `? :`, and a direct call to `Boolean(x)`. The
transpiler rewrites each of those sites, so there is no library to call and nothing to
remember. `new Boolean(true)`, `new String('x')` and `new Number(1)` are still truthy, as
their values are.

`&&` and `||` keep JavaScript's value-returning behaviour. `no && 'never'` returns the boxed
`false` itself, because that operand decided the answer; it is not converted to a plain
`false`. Each operand is evaluated once, so side effects happen exactly as they would in
JavaScript.

A class can also say how it should be tested, with an `asCompared()` method that returns a
primitive. `==`, `Is` and truthiness all use it; [Honest Equality](/honest-equality/) shows
how.

Truthiness has no escape, because nothing correct depends on a boxed `false` being true.
For JavaScript's `typeof`, write `LegacyTypeOf(x)`; that and the other named escapes are
listed in [Honest Equality](/honest-equality/).

## What changes when you rename `.js` to `.tjs`

This is the complete list. Every item is a rewrite or a check the transpiler makes when it
compiles the file, so it costs nothing extra when the program runs.

| construct | in a `.js` file | in a `.tjs` file | covered in |
| --- | --- | --- | --- |
| `a == b`, `a != b` | converts types: `'5' == 5` is `true` | no conversion; boxed values unwrap; `null == undefined` and `NaN == NaN` are `true` | [Honest Equality](/honest-equality/) |
| `typeof null` | `'object'` | `'null'` | this chapter |
| `if (new Boolean(false))` and every other truthiness test | truthy | falsy | this chapter |
| a line starting with `(`, `[` or `` ` `` | may join the line above | starts a new statement (with a warning) | this chapter, below |
| `new Point(…)` for a class in the same file | how you construct it | compile error; write `Point(…)` | [Better Classes](/better-classes/) |
| `var` | function-scoped variable | compile error; use `let` or `const` | [What `.tjs` Refuses](/safer-code/) |
| `eval(…)` | runs a string as code in your scope | compile error; use the sandboxed `Eval` | [What `.tjs` Refuses](/safer-code/) |
| `new Date(…)` | a mutable, timezone-dependent object | compile error; use `Timestamp` / `LegalDate`, or `LegacyDate(x)` | [What `.tjs` Refuses](/safer-code/) |
| `function f(opts = { a: 1, b: 2 })` | the default is replaced whole by any argument | each member has its own default, merged into a partial argument | [Dictionary Defaults](/dictionary-defaults-example/) |
| `Limit = 3` with no declaration | a global (or an error in strict code) | `const Limit = 3` | this chapter, below |

What does **not** change: `===` and `!==` keep their exact JavaScript meaning, `??` and `?.`
are untouched, and so is everything not in the table: syntax, scoping of `let` and `const`,
modules, classes apart from `new`, async code, and the standard library.

Here are the three rows with no chapter of their own, plus two of the others so you can see
them run:

```tjs:inline
// A line starting with ( [ or ` begins a new statement.
// In a .js file the [1, 2] would index items[0], and this would crash.
const items = ['a', 'b']
const first = items[0]
[1, 2].forEach(n => console.log('line', n))
console.log('first:', first)                     // first: a

// A first assignment to an undeclared Capitalised name declares a const.
MaxRetries = 3
console.log('MaxRetries:', MaxRetries)           // MaxRetries: 3

// Object-literal defaults merge member by member.
function connect(opts = { host: 'localhost', port: 80 }) {
  return `${opts.host}:${opts.port}`
}
console.log(connect({ port: 8080 }))             // localhost:8080   (JS: undefined:8080)

// A class is called, not newed.
class Point {
  constructor(x: 0, y: 0) {
    this.x = x
    this.y = y
  }
}
const p = Point(1, 2)
console.log(p.x, p.y, p instanceof Point)        // 1 2 true
```

The first example also prints a warning, because a line that JavaScript would have joined to
the one above is exactly where the two languages disagree:

```text
Line 5 starts with `[`, which JavaScript would join to the previous line. TJS treats them
as separate statements. If you meant the continuation, put it on one line or start this
line with `;`.
```

Only `(`, `[` and `` ` `` at the start of a line trigger this. A line ending in an operator,
a comma or an open bracket still continues onto the next, so long expressions split across
lines work as they do in JavaScript.

## Gotchas

- **`Boolean` passed as a function is not rewritten.** The rewrite applies to a call written
  as `Boolean(x)`. `[new Boolean(false)].filter(Boolean)` hands the built-in `Boolean` to
  `filter`, and the built-in says a boxed `false` is truthy, so it is kept. Write
  `.filter(x => !!x)` instead; the `!!` is a truthiness test, so it is rewritten.
- **Library code keeps JavaScript's rules.** `Array.prototype.filter`, `Set`, `includes` and
  every other built-in run as they always have. Only the code in your `.tjs` file is
  rewritten.
- **A Capitalised name assigned twice is not reassigned.** The first bare assignment becomes
  `const`. A second one at the top level of the file is a compile error (`Identifier
  'MaxRetries' has already been declared`), and one inside a function declares a new local
  constant rather than changing the outer one. If the value is meant to change, declare it
  with `let`. Lowercase names are not affected: `count = 1` with no declaration is an error,
  as in any ES module.
- **Pasted JavaScript can change meaning.** Code that relied on `==` converting types
  (`if (input == 0)` to catch `''` as well), on `typeof x == 'object'` matching `null`, or on
  a boxed `false` being truthy behaves differently once it is in a `.tjs` file. The refusals
  in the table fail loudly; these three do not, so search for them when you port.
- **Only `.tjs` files change.** A `.js` file, and TypeScript converted with `fromTS`, keep
  JavaScript's semantics, so the same expression can mean different things in two files of
  one project. That is deliberate: TJS must accept every JavaScript program and run it as
  JavaScript would. Converting TypeScript writes the named escape wherever the code relies
  on JavaScript's behaviour, so converted code keeps its meaning.

The main documentation, outside this book, has a longer page,
[JS Footguns That TJS Quietly Fixes](/footguns/), which also covers the linter's warnings
about an uninitialised `let`.

<!-- TODO review: measured 2026-11-06 — `Limit = 4` inside a function, after a top-level
`Limit = 3`, emits `const Limit = 4` local to the function and leaves the outer value at 3,
silently. The gotcha above documents that; it may be a defect worth fixing instead. -->
