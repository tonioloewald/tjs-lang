<!--{"section": "tjs", "order": 17, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# JS Footgun Fixes

Rename a `.js` file to `.tjs` and most of it means exactly what it meant before. A short
list of things changes, all on purpose. The transpiler makes each change when it compiles
the file, so there is no runtime library to load and no option to turn them on or off. This
chapter is that list. It covers a few items in full and points to the chapter that owns
each of the others.

A `.tjs` file is always an ES module, so it runs in strict mode, as any module does.

## What changes when you rename `.js` to `.tjs`

| construct | in a `.js` file | in a `.tjs` file | covered in |
| --- | --- | --- | --- |
| `a == b`, `a != b` | converts types: `'5' == 5` is `true` | no conversion, so `'5' == 5` is `false`; boxed values unwrap; `null == undefined` is `true`, and so is `NaN == NaN`, so `x == x` always holds | [Honest Equality](/honest-equality/) |
| `typeof null` | `'object'` | `'null'` | this chapter |
| `if (new Boolean(false))` and every other truthiness test | truthy | falsy | this chapter |
| `function f(x = 0)` | any value is accepted; the default is used only for `undefined` | the default is also the parameter's type example, so `f(1.5)` returns a type error (`0` is an integer) | [Required vs Optional](/required-vs-optional/) |
| `function f(opts = { a: 1, b: 2 })` | the default is replaced whole by any argument | each member has its own default, merged into a partial argument | [Dictionary Defaults](/dictionary-defaults-example/) |
| a line starting with `(`, `[` or `` ` `` | may join the line above | starts a new statement (with a warning) | this chapter, below |
| `MaxRetries = 3`, a Capitalised name with no declaration | a global (or an error in strict code) | `const MaxRetries = 3` | this chapter, below |
| `new Point(…)` for a class in the same file | how you construct it | compile error; write `Point(…)` | [Better Classes](/better-classes/) |
| `var` | function-scoped variable | compile error; use `let` or `const` | [What `.tjs` Refuses](/safer-code/) |
| `eval(…)` | runs a string as code in your scope | compile error; use the sandboxed `Eval` | [What `.tjs` Refuses](/safer-code/) |
| `new Date(…)` | a mutable, timezone-dependent object | compile error; use TJS's date types `Timestamp` / `LegalDate` ([Built-in Types](/built-in-types/)), or `LegacyDate(x)` | [What `.tjs` Refuses](/safer-code/) |

What does **not** change: `===` and `!==` keep their exact JavaScript meaning, and `??` and
`?.` are untouched. Apart from the rows above, scoping of `let` and `const`, modules,
classes, async code and the standard library behave as they do in JavaScript. `switch`
keeps its JavaScript meaning too (arms fall through, and they share one scope), but the
compiler warns and suggests `given`; see [Given Dispatch](/given-dispatch/).

`.tjs` also adds syntax: colon examples on parameters (`x: 0`), `test` blocks, and `/# … #/`
doc comments. A renamed `.js` file contains none of them, so they change nothing in it. The
examples below use the last two: a `/# … #/` block is rendered as prose, and `test` blocks
run when the example runs, with their results shown under its output.

## Boxed false, and typeof null

A boxed primitive is the object that `new Boolean(…)`, `new String(…)` or `new Number(…)`
makes, or that `Object(x)` makes from a primitive. Modern code rarely creates one on
purpose; they turn up in older code and occasionally from a library. JavaScript calls every
object truthy, so a boxed `false` is true. TJS fixes it so the truthiness rule has no
holes.

```tjs:inline
/#
## Boxed false is false

`new Boolean(false)` is an object, so in a `.js` file `if (new Boolean(false))`
runs its body. In a `.tjs` file every truthiness test unwraps a boxed primitive
first.
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
  break                                       // so the JS version doesn't loop forever
}
console.log('laps:', laps)                    // 0   (JS: 1)

/#
## typeof null is 'null'

JavaScript's `typeof null` is `'object'`, a bug from the first version of the
language that was kept for compatibility. It is why a `typeof x === 'object'`
check so often lets `null` through, and the next line reads a property of `null`
and crashes. In `.tjs` the answer is `'null'`, and every other answer is
unchanged.
#/

function nameOf(x) {
  if (typeof x === 'object') return x.name    // JS: crashes on null here
  return 'no name'
}
console.log(nameOf({ name: 'Ada' }), '/', nameOf(null))   // Ada / no name

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
  expect(nameOf(null)).toBe('no name')
}
```

### What to notice

The truthiness rule covers every place JavaScript asks "is this true?": `if`, `while`,
`for` and `do` conditions, `!`, `&&`, `||`, `? :`, and a direct call to `Boolean(x)`. The
transpiler rewrites each of those sites, so there is nothing to call and nothing to
remember. `new Boolean(true)`, `new String('x')` and `new Number(1)` are still truthy, as
their values are.

`&&` and `||` keep JavaScript's value-returning behaviour. `no && 'never'` returns the boxed
`false` itself, because that operand decided the answer; it is not converted to a plain
`false`. Each operand is evaluated once, so side effects happen exactly as they would in
JavaScript.

Classes can opt in to this unwrapping too; see [Honest Equality](/honest-equality/).

TJS keeps JavaScript's old behaviour available under long, explicit names, called escapes:
`LegacyTypeOf(x)` is JavaScript's `typeof`, `DangerousLegacyEquals(a, b)` its `==`, and
`LegacyDate(x)` its `new Date`. [Honest Equality](/honest-equality/) lists the operator
escapes and [What `.tjs` Refuses](/safer-code/) covers `LegacyDate`. Truthiness has no
escape: we know of no correct program that depends on a boxed `false` being true.

## The two rows covered here

Here are the two rows with no chapter of their own, plus two of the others so you can see
them run:

```tjs:inline
// A line starting with ( [ or ` begins a new statement.
// A .js file reads lines 2 and 3 as one: items[0][1, 2].forEach(…).
// The comma makes [1, 2] mean [2], so that is 'a'[2].forEach, which is
// undefined.forEach, a TypeError.
const items = ['a', 'b']
const first = items[0]
[1, 2].forEach(n => console.log('line', n))
console.log('first:', first)                     // first: a

// A first assignment to an undeclared Capitalised name declares a const,
// so a constant needs no keyword.
MaxRetries = 3
console.log('MaxRetries:', MaxRetries)           // MaxRetries: 3

// Object-literal defaults merge member by member.
function connect(opts = { host: 'localhost', port: 80 }) {
  return `${opts.host}:${opts.port}`
}
console.log(connect({ port: 8080 }))             // localhost:8080   (JS: undefined:8080)

// A class is called, not newed.
class Point {
  constructor(x, y) {
    this.x = x
    this.y = y
  }
}
const p = Point(1, 2)
console.log(p.x, p.y, p instanceof Point)        // 1 2 true
```

The line-start example produces this compile warning, shown with the transpiler's output,
because a line that JavaScript would have joined to the one above is exactly where the two
languages disagree:

```text
Line 7 starts with `[`, which JavaScript would join to the previous line. TJS treats them
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
  `.filter(x => !!x)` instead; the `!!` is a truthiness test in your file, so it is
  rewritten.
- **Library code keeps JavaScript's rules.** Only the code in your `.tjs` file is
  rewritten. A callback you write, such as `x => !!x`, follows TJS's rules even when
  `filter` calls it; the built-in `Boolean`, or any other function from outside the file,
  follows JavaScript's.
- **A Capitalised name assigned twice is not reassigned.** The first bare assignment becomes
  `const`. A second one at the top level of the file is a compile error (`Identifier
  'MaxRetries' has already been declared`). One inside a function declares a new local
  constant instead of changing the outer one, with no error or warning: after
  `function bump() { MaxRetries = 4 }` and `bump()`, the outer `MaxRetries` silently stays
  `3`. If the value is meant to change, declare it with `let`. Lowercase names are not
  affected: `count = 1` with no declaration is a ReferenceError when it runs (the compiler
  does not catch it), as in any ES module.
- **Pasted JavaScript can change meaning.** Code that relied on `==` converting types
  (`if (input == 0)` to catch `''` as well), on `typeof x === 'object'` matching `null`, on
  a boxed `false` being truthy, or on a plain default like `x = 0` accepting any value
  behaves differently once it is in a `.tjs` file. The refusals in the table fail loudly;
  these four do not, so search for them when you port.
- **Only `.tjs` files change.** A `.js` file, and TypeScript converted to TJS (with
  `fromTS`; see TJS for TypeScript developers), keep JavaScript's semantics, so the same
  expression can mean different things in two files of one project. That is deliberate:
  TJS must accept every JavaScript program and run it as JavaScript would. Converting
  TypeScript writes an escape wherever the code relies on JavaScript's behaviour, so
  converted code keeps its meaning: `a == b` becomes `DangerousLegacyEquals(a, b)`.

The main documentation, outside this book, has a longer page,
[JS Footguns That TJS Quietly Fixes](/footguns/), with more JavaScript footguns, including
the warnings TJS gives for a `let` that is never given a value.

<!-- TODO review: measured 2026-11-06 — `Limit = 4` inside a function, after a top-level
`Limit = 3`, emits `const Limit = 4` local to the function and leaves the outer value at 3,
silently. The gotcha above documents that; it may be a defect worth fixing instead. -->
