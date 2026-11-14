<!--{"parent": "the-tjs-language.md", "order": 50}-->
<!-- TODO review -->

# Equality and the Footguns TJS Removes

You know the jokes: `[] == false`, `typeof null === 'object'`, `NaN != NaN`. Nobody defends
them, and JavaScript can never change them, because changing them would break code that has
run unchanged for decades. TJS can, because a `.tjs` file is a new kind of file: nothing
written before it existed depends on what it means.

This chapter covers everything a `.tjs` file changes about JavaScript's everyday semantics:
what each change is, why it was made, and the named escape that gets the old behaviour back
where you really need it. It has two halves. The first is equality: `==`, `===`, and `Is` for
comparing contents. The second is the other footguns: `typeof null`, boxed `false`,
`new String` and `new Date`, `var`, `eval`, lines that start with a bracket, and two smaller
rules.

Two rules that also change in a `.tjs` file have chapters of their own: calling a class
without `new` is in [Classes and Dispatch](/classes-and-dispatch/), and object-literal
parameter defaults are in [Dictionary Defaults](/defaults/).

Some examples end with a `test '…' { … }` block. It runs alongside the example and checks
what the example claims, using `expect(…)` assertions; [Testing](/testing/) covers it.

## The file extension is the gate

Here is one line of JavaScript:

```javascript
console.log('5' == 5, typeof null)
```

Save it as `plain.js` and `tjs run plain.js` prints `true object`. Save the same line as
`plain.tjs` and `tjs run plain.tjs` prints `false null`. Nothing in the file asked for the
difference; the extension did.

This is how JavaScript itself has handled the problem before. Strict mode removed `with` and
silent assignment to undeclared names, but only for code that opted in with `"use strict"`.
ES modules then made strict mode the default for every module, so choosing to write a module
was the opt-in. In the same way, choosing `.tjs` is the opt-in to the rules in this chapter.
A `.js` file in the same project keeps JavaScript's rules, so you can move a codebase over one
file at a time.

There are no switches inside a file to turn individual rules off. Exceptions are made one site
at a time, with the named escapes this chapter introduces.

## Honest `==` and `!=`

TJS's `==` is `===` with three changes: a boxed primitive is unwrapped before comparing,
`null` equals `undefined`, and `NaN` equals `NaN`. We'll call this _honest equality_: it never
converts one type into another, and it never gives a surprising answer about a value and
itself. `!=` is its negation.

The practical rule follows from that: **in a `.tjs` file, write `==` and `!=`.** Reach for
`===` only when you specifically need to tell a box from its value, or `NaN` from `NaN`. If
your editor or linter enforces "always use `===`" (ESLint's `eqeqeq`, for example), turn that
rule off for `.tjs` files; it guards against a conversion TJS no longer does.

The first difference you will notice is that nothing is converted. Two values of different
types are not equal:

```tjs
console.log('5' == 5)       // false   (JS: true)
console.log(0 == '')        // false   (JS: true)
console.log(false == [])    // false   (JS: true)
console.log(1 != '1')       // true    (JS: false)
console.log('5' == '5')     // true
```

The three changes from `===` follow.

### Boxed primitives are unwrapped

A _boxed primitive_ is an object wrapping a primitive value: what `Object('x')` returns, as
opposed to the plain string `'x'`. They are rare in modern code but turn up from older
libraries. JavaScript's `===` compares the box rather than its contents, so a boxed `'x'` is
never `===` to `'x'`. TJS's `==` looks inside. (TJS refuses `new String`, `new Number` and
`new Boolean`, as covered later in this
chapter; `Object(x)` is how you make a box on purpose.)

```tjs
const boxed = Object('x')

console.log(boxed == 'x')                 // true
console.log(Object(42) == 42)             // true
console.log(Object(false) == false)       // true
console.log(Object('x') == Object('x'))   // true: both boxes unwrap to 'x'
console.log(boxed === 'x')                // false: === still compares the box
```

### `null == undefined` is kept

JavaScript's `==` does one conversion that people rely on: `null == undefined` is `true`, so
`x == null` checks for "no value" in one test. TJS keeps it. Neither equals anything else:

```tjs
console.log(null == undefined)   // true
console.log(null == 0)           // false
console.log(undefined == '')     // false

function describe(x) {
  return x == null ? 'nothing' : `got ${x}`
}
console.log(describe(null), '/', describe(undefined), '/', describe(0))
// nothing / nothing / got 0
```

### `NaN == NaN` is true

`NaN` is not equal to itself in JavaScript, under either operator. That is what IEEE 754
floating point specifies, but it means `x == x` is not always true, and that `[NaN]` cannot
find its own element with a comparison. In TJS, `NaN == NaN` is `true`, so `x == x` always
holds. `===` keeps JavaScript's answer. Zero is not affected: `0 == -0` is `true`, as it is
in JavaScript.

```tjs
const bad = Number('oops')

console.log(bad == NaN)          // true
console.log(bad == bad)          // true    (JS: false)
console.log(bad === bad)         // false   (=== is unchanged)
console.log(0 == -0)             // true: only NaN changes
```

### Not structural

For any object that is not a box, `==` asks whether the two sides are the very same object. It
does not look inside:

```tjs
const point = { x: 1 }

console.log(point == point)            // true: the same object
console.log({ x: 1 } == { x: 1 })      // false: two objects
console.log([1, 2] != [1, 2])          // true: two arrays
```

This is deliberate. If `==` compared contents, every comparison of two objects would walk
both of them, and a line that looks free could cost time proportional to the size of the
data, with nothing in the code to show it. So `==` stays constant-time, and deep comparison
has its own name, `Is`, covered below.

## `===` is identity, unchanged

`===` and `!==` mean exactly what they mean in JavaScript: no conversion, a box is not its
contents, and `NaN === NaN` is `false`. For two ordinary objects, `===` and `==` give the same
answer, so the only reasons to write `===` in a `.tjs` file are the two cases above: a box
compared with its value, and `NaN` compared with itself.

## `Is` and `IsNot` for structure

When you do want to compare contents, ask for it by name. `Is(a, b)` walks both values and
compares them deeply; `IsNot(a, b)` is its negation. Both are built in; a `.tjs` file needs no
import to use them.

```tjs
const people = [{ name: 'Ada' }, { name: 'Alan' }]
const wanted = { name: 'Ada' }

console.log(people.includes(wanted))            // false: no such object
console.log(people.some(p => Is(p, wanted)))    // true: same contents

console.log(Is([1, [2, 3]], [1, [2, 3]]))       // true: nested arrays
console.log(Is({ a: { b: 1 } }, { a: { b: 1 } }))  // true: nested objects
console.log(Is([1, 2], [2, 1]))                 // false: arrays are ordered
console.log(Is(new Set([1, 2]), new Set([2, 1])))  // true: Sets are not
console.log(Is(new Map([['a', 1]]), new Map([['a', 1]])))  // true
console.log(Is(5, '5'))                         // false: no conversion
console.log(IsNot({ a: 1 }, { a: 2 }))          // true

test 'Is compares contents, == compares identity' {
  expect(Is({ a: 1, b: [2] }, { a: 1, b: [2] })).toBe(true)
  expect({ a: 1 } == { a: 1 }).toBe(false)
  expect(Is([1, 2], [2, 1])).toBe(false)
}
```

At the leaves `Is` uses `==`'s rules, so it never converts types, `Is(NaN, NaN)` is `true`,
and `Is([null], [undefined])` is `true`. Plain objects are compared key by key, arrays element
by element in order, `Set`s by membership in any order, and `Map`s by their entries.

The details a working developer asks about first:

| case                                   | what `Is` does                                                        |
| -------------------------------------- | --------------------------------------------------------------------- |
| `Set` of objects                       | membership is by identity, as `Set.has` decides it: `Is(new Set([{k: 1}]), new Set([{k: 1}]))` is `false` |
| `Map` keys and values                  | keys by identity (as `Map.has`); values deeply                        |
| instances of different classes         | prototypes are not compared, so two classes with the same fields are equal |
| a key whose value is `undefined`       | still a key: `Is({ a: undefined }, {})` is `false`                    |
| `Date`                                 | equal when they hold the same time                                    |
| cycles                                 | handled: two structures that loop back on themselves the same way are equal |
| custom hooks on nested values          | called at every level, not only the top                               |

### Your own equality

Sometimes two objects should count as equal even though their fields differ: a value that
caches a formatted string, say, or a number kept modulo 10. A class can tell `Is` what
equality means for it, with an `Equals` method.

Two things in the next example come from other chapters. `constructor(n: 0)` uses a _colon
example_: `n` is a number, for example `0`, and calls are checked against that
([Types by Example](/types-by-example/)). And `Mod10(1)` has no `new`, because a `.tjs` file
constructs its own classes by calling them ([Classes and Dispatch](/classes-and-dispatch/)).

```tjs
class Mod10 {
  constructor(n: 0) {
    this.n = n
  }
  Equals(other) {
    return other instanceof Mod10 && other.n % 10 == this.n % 10
  }
}

const one = Mod10(1)
const eleven = Mod10(11)

console.log(Is(one, eleven))    // true: Equals says 1 and 11 agree mod 10
console.log(one == eleven)      // false: == never calls Equals
console.log(Is(one, Mod10(2)))  // false
```

`Is(a, b)` looks for a hook in this order, and uses the first one it finds:

1. a method keyed by the symbol `tjsEquals` on `a`, then on `b`;
2. an `Equals` method on `a`, then on `b`;
3. failing both, the structural comparison.

So when both operands have a hook, the left one decides. `Is(a, b)` and `Is(b, a)` agree only
if your hook gives the same answer from either side, which is your job, not the language's.
Return a boolean: `Is` hands back whatever the hook returns.

The symbol form exists for objects that might have an ordinary data property called `Equals`,
such as a record whose fields come from outside your code. `tjsEquals` is
`Symbol.for('tjs.equals')`, so you can make it yourself in any file, `.tjs` or `.js`, with
that one line. JavaScript code can also import it with
`import { tjsEquals } from 'tjs-lang/runtime'`.

```tjs
const tjsEquals = Symbol.for('tjs.equals')

const canonical = { x: 1, y: 2 }
const view = {
  [tjsEquals](other) {
    return Is(canonical, other)
  },
}

console.log(Is(view, { x: 1, y: 2 }))   // true
console.log(Is({ x: 1, y: 2 }, view))   // true: the hook works on either side
console.log(view == canonical)          // false: == runs none of it
```

`==` never calls either hook. It runs none of your code, so it stays fast and cannot throw.

### The infix form

You can also write `a Is b` and `a IsNot b`, and the transpiler turns them into the calls:

```tjs
const a = [1, 2]
const box = { items: [1, 2] }

if (a Is [1, 2]) console.log('same contents')   // same contents
console.log(box.items IsNot [2, 1])              // true
```

Each operand must be a name, a property or call chain (`box.items`, `list.at(0)`), or a
literal. When another operator touches an operand, as in `a + 1 Is b`, precedence would
decide what is being compared, so the transpiler refuses the line and asks you to write the
call with the operands you mean. The call form works everywhere without that rule, so prefer
it.

### `Is` is not free

`Is` walks both values, so its cost grows with the data, for the reason given under
_Not structural_, above. The name makes that cost visible where you write it. Use
`Is` where you mean "same contents", such as tests and change detection, rather than as a
habit in hot loops.

## When you need JavaScript's `==`

Usually, when code relies on JavaScript's conversion, the better fix is to convert explicitly:
`Number(field) == 5` says what it means. The escape is for the case where you must preserve
existing behaviour exactly, such as legacy code ported line for line, whose callers depend on
`0` matching `''` in ways nobody has mapped. For those comparisons, write
`DangerousLegacyEquals(a, b)`, or `DangerousLegacyNot(a, b)` for `!=`:

```tjs
console.log(DangerousLegacyEquals('5', 5))    // true: conversion and all
console.log(DangerousLegacyEquals(0, ''))     // true
console.log(DangerousLegacyNot(0, ''))        // false
console.log('5' == 5)                         // false: the rest of the file is unchanged
```

The names are long on purpose. React's `dangerouslySetInnerHTML` is the model: an escape
should cost a moment's thought, stand out in review, and be easy to search for. There are no
short aliases. They are _dangerous_ rather than merely legacy because JavaScript's conversion
calls `valueOf()` or `toString()` on an object operand, so a comparison can run code nobody
wrote for that purpose.

The names follow the operators, which is easier to remember than to guess:

| operator | escape                                      |
| -------- | ------------------------------------------- |
| `==`     | `DangerousLegacyEquals(a, b)`               |
| `!=`     | `DangerousLegacyNot(a, b)`                  |
| `typeof` | `LegacyTypeOf(x)` (below)                   |
| `new Date(x)` | `LegacyDate(x)` (below)                |

There is no way to turn honest equality off for a whole `.tjs` file. A file-wide opt-out
made for one comparison would also silence the next comparison, the one written by accident.
A named escape marks exactly the site that needs it, and every other `==` in the file stays
honest.

## The other footguns

The rest of the rules follow the same pattern: a JavaScript behaviour that causes bugs, the
TJS behaviour, and, where one is needed, a named way back.

### `typeof null` is `'null'`

`typeof null` is `'object'` in JavaScript, a bug from the language's first version kept for
compatibility. It is why `typeof x === 'object'` so often lets `null` through, and the next
line crashes reading a property of `null`. In TJS the answer is `'null'`, and every other
answer is unchanged. `LegacyTypeOf(x)` is JavaScript's `typeof`:

```tjs
function nameOf(x) {
  if (typeof x === 'object') return x.name    // JS: crashes when x is null
  return 'no name'
}

console.log(nameOf({ name: 'Ada' }))   // Ada
console.log(nameOf(null))              // no name
console.log(typeof null)               // null
console.log(typeof {}, typeof 42)      // object number
console.log(LegacyTypeOf(null))        // object
```

### A boxed `false` is falsy

JavaScript says every object is truthy, including a boxed `false`, a boxed `0` and a boxed
`''`. So `if (Object(false))` runs its body. In a `.tjs` file every truthiness test unwraps a
boxed primitive first: `if`, `while`, `for` and `do` conditions, `!`, `&&`, `||`, `? :`, and a
call written `Boolean(x)`.

```tjs
const no = Object(false)

console.log(no ? 'truthy' : 'falsy')    // falsy   (JS: truthy)
console.log(!no, Boolean(no))           // true false
console.log(Object(0) ? 'yes' : 'no')   // no
console.log(Object('') ? 'yes' : 'no')  // no

// && and || still return one of their operands; only the decision changes
console.log(no || 'fallback')           // fallback
console.log((no && 'never') === no)     // true: && returned the box itself

// ?? tests for null and undefined, not truthiness, so it is untouched
console.log((no ?? 'fallback') === no)  // true

test 'a boxed false is falsy' {
  expect(!no).toBe(true)
  expect(no || 'x').toBe('x')
  expect(no ?? 'x').toBe(no)
}
```

Each operand is still evaluated once, so side effects happen exactly as in JavaScript. A
boxed `true`, `1` or `'x'` stays truthy, as its value is.

There is no escape for this one. We know of no correct program that depends on a boxed
`false` being true.

### `new String`, `new Number` and `new Boolean` are refused

`new Boolean(x)` is almost always a slip for `Boolean(x)`: the author wanted a boolean and got
an object. TJS refuses the three constructors:

<!-- tjs-doc: expect-error -->

```tjs:static
const label = new String('total')
// error: `new String(x)` is not allowed in TJS: it builds an object wrapper, which is
// truthy even when it holds false or 0. Use `String(x)` for the value, or `Object(x)` when
// you deliberately want the object.
```

When you do want a wrapper, `Object(x)` makes one, and says so. That is why every example in
this chapter that needs a boxed value uses it.

### `new Date` is refused

A JavaScript `Date` is mutable (`d.setMonth(…)` changes it for everyone holding it), counts
months from 0, and answers most questions in the timezone of whatever machine runs the code.
`new Date(…)` is a compile error in a `.tjs` file, and the error says what to use instead:

<!-- tjs-doc: expect-error -->

```tjs:static
const now = new Date()
// error: `new Date()` is not allowed in TJS — the Date object is mutable and
// timezone-dependent.
//
//   import { Timestamp } from 'tjs-lang'
//   const t = Timestamp.now()          // wall-clock, epoch ms
//   const t = Timestamp.from(iso)      // parse
//
// Or `performance.now()` for a monotonic counter — no import needed. To keep Date
// deliberately: `LegacyDate(x)` — named and greppable, like every other escape in this
// language.
```

For moments in time, use `Timestamp` (a number of milliseconds) or, for calendar dates,
`LegalDate` (a `'YYYY-MM-DD'` string), both imported from `tjs-lang`;
[Built-in Types](/built-in-types/) covers them. When a library needs a real `Date`,
`LegacyDate(x)` does exactly what `new Date(x)` does and needs no import. `Date.now()`
returns a number, so it is allowed, with a warning that suggests `Timestamp.now()` or, for
elapsed time, `performance.now()`.

```tjs
const d = LegacyDate('2024-01-15T00:00:00Z')
console.log(d instanceof Date, d.getUTCFullYear())   // true 2024
console.log(typeof Date.now())                       // number
```

### `var` is refused

`var` is scoped to the whole function rather than its block, it is hoisted (readable before
the line that declares it, as `undefined`), and it can be declared twice without complaint.
`let` and `const` cover every legitimate use without those behaviours, so `var` is a compile
error, with no escape:

<!-- tjs-doc: expect-error -->

```tjs:static
var total = 0
// error: `var` is not allowed in TJS — use `const` or `let`.
// …followed by a paragraph explaining why there is no escape.
```

### `eval` is refused

`eval(code)` runs a string with your program's privileges and can read and write the local
variables around the call. That access is the dangerous part, and no renamed `eval` could drop
it and still be `eval`. So `eval` is a compile error, with no escape:

<!-- tjs-doc: expect-error -->

```tjs:static
const answer = eval('6 * 7')
// error: `eval()` is not allowed in TJS. Use `Eval()` from the TJS runtime for sandboxed
// evaluation — fuel-metered, capability-injected, and unable to reach this scope.
// …followed by a paragraph explaining why there is no escape.
```

The `Eval` the error means is imported from `tjs-lang/eval`. It runs code in a sandbox, sees
only the values you pass it, and stops when its fuel runs out. [Safe Eval](/safe-eval/)
covers it.

`new Function(…)` is not refused, but the compiler warns about it, because it also runs a
string with full access to globals. For code you did not write, use `SafeFunction` from the
same module (see [Safe Eval](/safe-eval/)). It cannot see globals, so it is not a drop-in swap
for code that relies on them.

### A line starting with `(`, `[` or a backtick starts a statement

JavaScript inserts a missing semicolon only when the next line cannot continue the current
one. A line starting with `(`, `[` or a backtick always can, so JavaScript joins it to the
line above:

```javascript
const items = ['a', 'b']
const first = items[0]
[1, 2].forEach(n => console.log(n))
// JavaScript reads lines 2 and 3 as: const first = items[0][1, 2].forEach(…)
// [1, 2] is a comma expression meaning [2], so this is 'a'[2].forEach: a TypeError.
```

In a `.tjs` file, such a line starts a new statement, and the compiler warns, because this is
exactly where TJS and JavaScript disagree about what the code means:

```tjs
const items = ['a', 'b']
const first = items[0]
[1, 2].forEach(n => console.log('line', n))
console.log('first:', first)
// line 1
// line 2
// first: a
```

```text
Line 3 starts with `[`, which JavaScript would join to the previous line. TJS treats them
as separate statements. If you meant the continuation, put it on one line or start this
line with `;`.
```

The warning's last sentence runs two remedies together, and they answer different intents:

- **You meant one expression:** put it on one line (`const x = grid[0][1]`).
- **You meant two statements**, as TJS read it: start the second line with `;`
  (`;[1, 2].forEach(…)`). That changes nothing about the meaning; it makes the separation
  explicit, and the warning goes away.

A line still continues when the line before it ends with an operator, a comma or an opening
bracket, and a line starting with `.` continues the expression above it, so method chains and
long expressions split across lines work as they always have.

## Two smaller rules

These two are not removed footguns. One is a convenience, and the other exists only in the
linter today.

### A first assignment to a Capitalised name is a `const`

In a module, assigning to a name nobody declared is a `ReferenceError`. In a `.tjs` file, the
first assignment to an undeclared name that starts with a capital letter declares it as a
`const`. It saves the keyword on the most common declaration there is, a named constant,
using the capital as the signal that it is meant to stay put:

```tjs
MaxRetries = 3                       // becomes: const MaxRetries = 3
console.log('retries:', MaxRetries)  // retries: 3
```

The rule applies in any scope: inside a function, the first `Limit = 5` declares a `const`
local to that function. Because the result is a `const`, a second `MaxRetries = …` in the same
scope does not compile; declare the name with `let` if it needs to change. A name that is
already declared is left alone. Lowercase names keep JavaScript's behaviour: assigning to an
undeclared one is still a `ReferenceError`.

There is a cost. A misspelling such as `Maxretries = 4` now quietly declares a second
constant, with no warning, where JavaScript would have thrown. If you rely on that error to
catch typos in capitalised names, declare your constants with `const`.

### `let` with no value is flagged by the linter

This rule is lint-only: it comes from the `lint()` function exported by `tjs-lang/lang`.
`tjs check` and `tjs run` do not run the linter, so a bare `let x` compiles and runs without comment
there.

`let x` on its own gives no hint whether you forgot the value, mean to assign it later, or
want it to be `undefined`. The linter's `safe-assign-let-needs-type` rule asks for either an
initializer or a colon example, which says what kind of value the variable will hold
([Types by Example](/types-by-example/)):

```tjs
let count = 0             // fine: the initializer says it is a number
let result: ''            // fine: the example says it is a string
result = 'done'
console.log(count, result)  // 0 done
```

Without those, the linter warns:

```text
let x          // warning: 'let x' has no initializer or type annotation
let y = null   // warning: initialized to null with no type annotation
```

A companion rule, `safe-assign-no-nullish`, warns when a `let` that has a type (from its
initializer or example) is later assigned a literal `undefined` or `null`.

## Gotchas

### Library methods keep JavaScript's rules

TJS rewrites the operators written in your file. Built-in methods are JavaScript code, so
`includes`, `indexOf`, `Set`, `Map` and the rest compare the way JavaScript does, and not even
consistently with each other. When the difference matters, compare with `==` or `Is` yourself:

```tjs
const list = [1, 2, 3]
const boxed = Object(1)

console.log(boxed == 1)                    // true: your code, TJS rules
console.log(list.includes(boxed))          // false: JavaScript's method
console.log(list.some(x => x == boxed))    // true

console.log([NaN].includes(NaN))           // true
console.log([NaN].indexOf(NaN))            // -1: two methods, two rules
```

The same applies to `Boolean` passed as a function: `.filter(Boolean)` hands the built-in to
`filter`, and the built-in says a boxed `false` is truthy. Write `.filter(x => !!x)`; the `!!`
is in your file, so it follows TJS's rules.

### Where else `==` is used

TJS uses honest equality wherever it compares values for you, not only where you write `==`.
`Is` uses it at the leaves. A literal-union parameter such as `kind: 'cat' | 'dog'` tests
membership with it ([Types by Example](/types-by-example/)). And `given`, below, matches its
arms with it.

### `switch` compares with `===`

`switch` keeps JavaScript's semantics exactly, including `===` comparison and fallthrough, so
`switch (Object('cat'))` never reaches `case 'cat':`. The compiler warns on every `switch` in
a `.tjs` file and suggests `given`, TJS's statement for choosing code by value. It compares
with `==`, and its arms never fall through:

```tjs
function sound(animal) {
  given animal {
    'cat' { return 'meow' }
    'dog' { return 'woof' }
  } else {
    return '?'
  }
}

console.log(sound(Object('cat')), sound('dog'), sound('emu'))  // meow woof ?
```

Choosing code by value is _dispatch_, which is why `given` is covered with classes and
overloaded functions in [Classes and Dispatch](/classes-and-dispatch/).

### Only `.tjs` files get these rules

A `.js` file keeps JavaScript's semantics, because TJS must run every JavaScript program
unchanged. So does [AJS](/ajs/), the sandboxed agent language. And so does TypeScript
converted to TJS with `tjs convert`, until you _graduate_ it: remove the conversion
annotation the converter writes at the top, so the file is treated as native TJS. The
converter writes the named escapes wherever the code relies on JavaScript's behaviour, so the
file keeps its meaning either way (see [TJS for TypeScript developers](/TJS-FOR-TS/)).

Two directives change which language a file is treated as. `TjsCompat` at the top of a `.tjs`
file declares it JavaScript: the rules in this chapter are off, though parameters with colon
examples are still checked at runtime. `TjsStrict` at the top of converted TypeScript turns
every rule on, and also turns on runtime checking of parameters, which converted code
otherwise skips. You rarely need either; the [syntax reference](/TJS-SYNTAX/) has the details.

The rules belong to the file where the code is written, not to where the values came from. A
`.tjs` function comparing values from a `.js` module uses TJS's `==`; a `.js` module comparing
values from a `.tjs` module uses JavaScript's.

Pasted JavaScript is where this bites. Code that relied on `==` converting (`if (input == 0)`
to catch `''` too), on `typeof x === 'object'` matching `null`, or on a boxed `false` being
truthy behaves differently in a `.tjs` file, and nothing fails loudly. The refusals (`var`,
`eval`, `new Date`, `new String`) stop the build; these do not, so look for them when you
port.

## Summary

| JavaScript                    | in a `.tjs` file                                    | the way back                                        |
| ----------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `==` / `!=` convert           | no conversion, boxes unwrap, `NaN == NaN`, not deep | `DangerousLegacyEquals(a, b)` / `DangerousLegacyNot(a, b)` |
| `===` / `!==`                 | unchanged                                           | not needed                                          |
| deep comparison               | `Is(a, b)` / `IsNot(a, b)`                          | not needed: a new feature                           |
| `typeof null`                 | `'null'`                                            | `LegacyTypeOf(x)`                                   |
| boxed `false` is truthy       | falsy in every truthiness test                      | none                                                |
| `new String(x)` etc.          | refused                                             | `Object(x)` for a deliberate wrapper                |
| `new Date(x)`                 | refused                                             | `LegacyDate(x)`, or `Timestamp` / `LegalDate`       |
| `Date.now()`                  | allowed, with a warning                             | `Timestamp.now()` or `performance.now()`            |
| `var`                         | refused                                             | none: `let` and `const`                             |
| `eval(code)`                  | refused                                             | none: `Eval()` is the sandboxed tool                |
| `new Function(code)`          | allowed, with a warning                             | `SafeFunction` for untrusted code (not a drop-in)   |
| line starting `(` `[` `` ` `` | starts a new statement, with a warning              | to continue, put it on one line; to separate, start it with `;` |
| `switch`                      | unchanged (`===`, fallthrough), with a warning      | `given` compares with `==`, no fallthrough          |
| `Capital = 1` undeclared      | `const Capital = 1`                                 | declare it with `let`                               |
| `let x` with no value         | lint warning (`lint()` only)                        | give it a value or a colon example                  |
