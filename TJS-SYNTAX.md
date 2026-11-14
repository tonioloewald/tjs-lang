<!--{"parent": "the-tjs-language.md", "order": 900}-->
<!-- TODO review -->

# TJS Syntax Reference

Every TJS construct, briefly, with what it does and a working example. It is ordered the way
you look things up: what goes in a signature first, then the rules a `.tjs` file follows,
then the rest of the language. For a guided introduction, start with
[Hello TJS](/hello-tjs/). New to programming? Start with
[Learn to Program](/learn-to-program/).

One idea runs through all of it. **The value after a colon is an example, not a type.**
`name: 'Alice'` means "a required string, for instance `'Alice'`"; it is not TypeScript's
string-literal type. The example tells TJS what to check at runtime, and it gives the docs
and the tests a real value to work with.

The examples on this page run in the page. Their output is shown in the comments.

## Parameters

A parameter's example decides what the function accepts. A call with the wrong kind of
value does not run the body:

```tjs:inline
function greet(name: 'Alice') { return `Hello, ${name}` }  // a required string
function scale(rate: 3.14) { return rate * 2 }             // any number
function repeat(count: 42) { return 'x'.repeat(count) }    // an integer (whole number)
function at(index: +0) { return ['a', 'b', 'c'][index] }   // a non-negative integer

console.log(greet('Ada'))                  // Hello, Ada
console.log(scale(2))                      // 4
console.log(repeat(3))                     // xxx
console.log(isMonadicError(greet(42)))     // true: 42 is not a string
console.log(isMonadicError(repeat(1.5)))   // true: repeat's example (42) is an integer
console.log(isMonadicError(at(-1)))        // true: at's example (+0) is non-negative
```

A refused call returns an error value instead of throwing. `isMonadicError(x)`, which TJS
provides, tells you whether you got one; [Errors](#errors) says what the error holds.

The numeric examples are ordinary JavaScript literals, read for what they show:

- a decimal example (`3.14`, `0.0`) accepts any number, integers included;
- an integer example (`42`, `0`) accepts only integers;
- a signed zero (`+0`) accepts only non-negative integers.

### Type names

Each numeric example also has a name, for when you want the type without choosing a value.
TypeScript's `string`, `number`, `boolean` and `null`, and unions of them, are real runtime
checks too:

```tjs:inline
function mix(rate: float, count: int, index: unsigned) {   // ≡ 3.14, 42, +0 (uint works too)
  return rate + count + index
}
function row(s: string, n: number, b: boolean, u: string | null) {
  return [s, n, b, u]
}

console.log(mix(0.5, 2, 3))                       // 5.5
console.log(isMonadicError(mix(0.5, 2, -3)))      // true
console.log(JSON.stringify(row('a', 1.5, true, null)))  // ["a",1.5,true,null]
console.log(isMonadicError(row('a', 1, true, 2))) // true
```

`float` and `number` both accept any number, like `3.14`; `int` is `42` and `unsigned` is
`+0`. `s: string` checks exactly what `s: ''` checks. `any`, `unknown`, `void` and `never`
stay unconstrained, because that is what they mean. A type name TJS cannot resolve degrades
to "accept anything" with a warning that suggests an example, one of the type names above,
or a `Type` with a predicate.

### Defaults, optional and nullable parameters

```tjs:inline
function hello(name = 'world') { return `hello, ${name}` }  // optional, defaults to 'world'
function opt(name?: '') { return name }                     // the same as name = ''
function count(n: number = 5) { return n }                  // checked as number, default 5
function find(id: 0 | null) { return id }                   // an integer or null
function render(doc = null) { return doc }                  // ANY value, default null

console.log(hello(), hello('Ada'))           // hello, world hello, Ada
console.log(isMonadicError(hello(7)))        // true: the default is also the example
console.log(JSON.stringify(opt()))           // ""
console.log(count(), count(2.5))             // 5 2.5
console.log(find(null), find(3))             // null 3
console.log(render({ title: 'x' }).title)    // x
```

**Unlike TypeScript, `x?: ''` does not leave `x` undefined:** it makes `x` optional and
defaults it to the example.

`name: Type = default` is TypeScript's spelling, and TJS accepts it: the argument is
checked against what comes after the colon, and the default is used when the argument is
missing. A default that fails its own check (`n: 0 = 'x'`) does not transpile. You need
this spelling when the check is narrower than the default alone: `mode = 'grant'` accepts
any string, while `mode: 'grant' | 'deny' = 'grant'` accepts only those two (see
[Literal unions](#literal-unions)).

A bare `null` or `undefined` default means "any value, defaulting to this". To accept
_only_ `null`, write `doc: null`.

### Object shapes and dictionary defaults

An object example is a shape: every member it shows is required and checked.

```tjs:inline
function createUser(user: { name: '', age: 0 }) { return user.name }

console.log(createUser({ name: 'Ada', age: 36 }))         // Ada
console.log(isMonadicError(createUser({ name: 'Ada' })))  // true: age is missing
```

An object-literal **default** is different: it is a _dictionary_. Each member has its own
default, a partial argument is merged with them, members are checked, and extra keys pass
through:

```tjs:inline
function place(args = { x: 0, y: 0 }) { return args }

console.log(JSON.stringify(place({ x: 5 })))        // {"x":5,"y":0}
console.log(JSON.stringify(place({ x: 1, z: 9 })))  // {"x":1,"z":9,"y":0}
console.log(isMonadicError(place({ x: 's' })))      // true
```

This is the one place where the same source means something different in TJS and in
JavaScript, which treats the object as one atomic default. For JavaScript's behaviour on a
single parameter, write `args = LegacyDefault({ x: 0, y: 0 })`. The full rules are in
[Dictionary Defaults](/dictionary-defaults/). A typed default (`p: Point = { x: 1, y: 2 }`)
is not a dictionary: a value passed for it must be a whole `Point`.

### Arrays and rest parameters

An array example gives the item type, and items are checked, not only arrayness. The
TypeScript suffix spelling works too:

```tjs:inline
function first(xs: [0]) { return xs[0] }            // an array of integers
function total(xs: number[]) { return xs.length }   // rewritten to [0.0]
function grid(rows: string[][]) { return rows.length }
function sum(...nums: [0]) { return nums.reduce((a, b) => a + b, 0) }

console.log(first([7, 8]), total([1.5, 2]), grid([['a']]))  // 7 2 1
console.log(isMonadicError(total(['x'])))                   // true
console.log(sum(1, 2, 3), isMonadicError(sum(1, 'x')))      // 6 true
```

`int[]` accepts only integers; `number[]` accepts any numbers. A mixed example
(`...args: ['', 0, true]`) is not a tuple: each item may be any of those types. A rest
parameter cannot have a default (`...xs: number[] = [1]` is an error), because it is always
bound, to `[]` when nothing is passed.

### Literal unions

A union whose members are all literals of the same type is a closed set of values. A union
of literals of different types is a union of their types:

- `'on' | 'off'` accepts only `'on'` and `'off'`;
- `0 | 1` accepts only `0` and `1`;
- `0 | ''` accepts any integer or any string;
- `0 | null` accepts any integer, or `null`.

```tjs:inline
function setMode(m: 'on' | 'off') { return m }
function either(x: 0 | '') { return x }

console.log(setMode('on'))                         // on
console.log(isMonadicError(setMode('maybe')))      // true
console.log(setMode(Object('on')) == 'on')         // true: membership is ==
console.log(either(1), either('s'))                // 1 s
console.log(isMonadicError(either(true)))          // true
```

Membership uses `==`, so a boxed primitive is a member, `+0 | +1` is the same set as `0 | 1`,
and `1 | 1.0` has one member. Use an `Enum` when the set wants a name, a description and
reverse lookup (see [Declarations](/declarations/)).

## Return annotations

A return annotation is an example too, and an example of a _result_ is a **worked
example**. During transpilation (by `tjs check`, `tjs test`, a build, or the `tjs()` API)
the function is called with its parameter examples, and the result must equal the
annotation: deep equality, not "the same type". That check is the function's **signature
test**. Three spellings say how much checking you want:

```tjs:inline
// `:`  a worked example: add(2, 3) runs during transpilation, and must be 5
function add(a: 2, b: 3): 5 { return a + b }

// `:!` the return TYPE only: nothing runs, the result is not checked
function getUser(id: 0):! { name: '', age: 0 } {
  return { name: 'Alice', age: 30 }
}

// `:?` the worked example AND a runtime check of every result
function half(n: 4):? 2 { return n / 2 }

console.log(add(2, 3), getUser(1).name, half(4))  // 5 Alice 2
console.log(isMonadicError(half(3)))              // true: 1.5 is not an integer
```

`function add(a: 0, b: 0): 0` passes only because `0 + 0` is `0`. The same function
annotated `: 0` with examples `2` and `3` does not transpile:

<!-- tjs-doc: expect-error -->

```tjs:static
function add(a: 2, b: 3): 0 { return a + b }   // add(2, 3) is 5, not 0
```

Running your code during transpilation raises fair questions. A signature test whose call
throws (because it needs a network, a host object or an import the transpiler cannot load)
is **inconclusive**, not a failure; see [Test blocks](#test-blocks). For a function with
side effects, or a result that would be awkward to write out, use `:!`, which runs nothing.
Converted TypeScript uses `:!` for every `: string`-style return type.

With a literal-union parameter, the signature test calls the function with the union's
first member, so `function pick(x: 'yes' | 'no'): 'yes'` passes and `: ''` would fail.

An `async` function's return example is never run as a test; with `:?` its resolved value
is checked (see [Async functions](#async-functions)).

## Safety markers

A `!` at the start of the parameter list turns validation off for that function:

```tjs:inline
function fastAdd(! a: 0, b: 0) { return a + b }

console.log(fastAdd(3, 4))       // 7
console.log(fastAdd('a', 'b'))   // ab: nothing was checked
```

Use it on hot internal functions whose inputs were checked at the boundary, never on
functions that receive outside data. It disables every check in the function; to relax one
parameter, give it a looser type (`x: any`).

A `?` in the same position (`function f(? a: 0)`) is accepted for compatibility and has no
effect: parameters are already checked by default, and in a file that turns checking off
with `safety none` (below) a `?` does not turn it back on.

### The `safety` directive

The first line of a file may set how much it checks at runtime:

<!-- tjs-doc: fragment -->

```tjs:static
safety none     // no validation; the signature metadata is still emitted
safety inputs   // validate function inputs (the default)
safety all      // accepted; checks the same as `safety inputs`
```

`safety none` is for code whose callers are already checked, and it is what converted
TypeScript defaults to. The metadata it keeps is the signature information TJS attaches to
each function (its `__tjs` property), which docs and tools read. `safety all` adds nothing
today: a result is checked at runtime only when its annotation says `:?`.

`safety` changes how much is checked, never what the code means, which is why it is not a
mode (see [The rules of `.tjs`](#the-rules-of-tjs)).

## The rules of `.tjs`

**The file extension is the gate**, the way ES modules made `"use strict"` implicit.
JavaScript source, in its own dialect (a `.js` file, or converted TypeScript), is always
accepted as JavaScript. A `.tjs` file opts into the stricter rules below, unconditionally.

| rule                                               | what `.tjs` does                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| equality                                           | `==`/`!=` do not coerce, unwrap boxed primitives, and keep `null == undefined`          |
| `typeof`                                           | `typeof null` is `'null'`                                                              |
| truthiness                                         | a boxed `false` (`Object(false)`) is falsy                                             |
| statements                                         | a line starting with `(`, `[` or `` ` `` begins a new statement (see below)            |
| classes                                            | called without `new`; `new` on a class declared in the file is an error                |
| `Date`                                             | `new Date` is not allowed; use `LegacyDate(x)`, or `Timestamp` from `tjs-lang`          |
| `var`                                              | not allowed; use `const` or `let`                                                      |
| `eval()`                                           | not allowed; `Eval()` is the sandboxed form (`new Function` is a warning)              |
| object-literal parameter defaults                  | dictionaries: per-member defaults, merged on a partial argument, validated             |
| a first bare assignment to an undeclared `Capital` | becomes `const`                                                                        |

`Timestamp` is TJS's date type (see [Built-in Types](/built-in-types/)), and `Eval()` runs
code in a sandbox (see [Safe Eval](/safe-eval/)). `Date.now()` is allowed, because it
returns a number; the compiler suggests `Timestamp.now()` or `performance.now()`.

There is no per-file switch for these rules. Older versions had nine mode directives that
turned rules on one at a time; they were removed, and writing one now is an error that
names the replacement.

### Statements and newlines

Semicolons are allowed, and most lines end where JavaScript would end them. The difference
is a line that starts with `(`, `[` or a backtick. JavaScript joins such a line to the one
before it (so `foo` followed by a line `(() => {})()` calls `foo`); TJS starts a new
statement there, and warns:

```tjs:inline
const total = [1, 2, 3]
  .map((x) => x * 2)          // a line starting with . continues
  .reduce((a, b) => a + b)
const inRange = total > 10 &&  // so does a line after a trailing operator
  total < 100

console.log(total, inRange)    // 12 true
```

A line still continues when the line before it ends with an operator, an opening bracket or
a comma. To continue onto a line that starts with `(` or `[`, end the previous line with
the operator or bracket, or put both on one line.

### Named escapes

A whole-file opt-out would also silence the _next_, accidental use, so each exception marks
one site, with a name you can grep for:

| you need                               | write                                                      |
| -------------------------------------- | ---------------------------------------------------------- |
| a real `Date`                          | `LegacyDate(x)`                                            |
| JavaScript's `==` / `!=`               | `DangerousLegacyEquals(a, b)` / `DangerousLegacyNot(a, b)` |
| JavaScript's `typeof` (null is object) | `LegacyTypeOf(x)`                                          |
| JavaScript's atomic parameter default  | `args = LegacyDefault({ x: 0, y: 0 })`                     |
| any of the above, from a `.ts` file    | nothing: conversion writes the named escape for you        |

```tjs:inline
console.log(0 == '', DangerousLegacyEquals(0, ''))   // false true
console.log(typeof null, LegacyTypeOf(null))         // null object
console.log(LegacyDate(0).toISOString())             // 1970-01-01T00:00:00.000Z

function f(args = { x: 0, y: 0 }) { return args }
function g(args = LegacyDefault({ x: 0, y: 0 })) { return args }
console.log(JSON.stringify(f({ x: 5 })), JSON.stringify(g({ x: 5 })))  // {"x":5,"y":0} {"x":5}
```

The names are long on purpose. React's `dangerouslySetInnerHTML` is the model: an escape
should cost a moment's thought and stand out in review, so there are no short aliases.
`var` and `eval` have no escape at all, the way strict mode removed `with`.

`LegacyExactly(a, b)` and `LegacyNotExactly(a, b)` also exist. They are exactly `===` and
`!==`, which TJS does not change, so you never need them.

`LegacyDefault` affects one parameter. Marking the whole function with `!` also keeps
JavaScript's atomic default, but it turns off all of that function's validation too.

**`unsafe <expression>` is deprecated.** The prefix (`unsafe new Date(ts)`) was the older
spelling of a site escape. It still parses, with a deprecation warning, and will be removed.
Write `LegacyDate(ts)` for a `Date`; for a class declared in the file, drop the `new`.

### Converted TypeScript

Converting TypeScript (`fromTS`, `tjs convert`) produces TJS source whose first line marks
where it came from:

<!-- tjs-doc: fragment -->

```tjs:static
/* tjs <- when.ts */

function when(ts: number) {
    return LegacyDate(ts);   // the TypeScript said: new Date(ts)
}
```

The annotation means "this file has JavaScript's semantics", which keeps every TypeScript
program working as it did. The converter also writes each place the code relies on
JavaScript's behaviour as a named escape: `new Date(x)` becomes `LegacyDate(x)`, a coercing
`v == 0` becomes `DangerousLegacyEquals(v, 0)`, a `typeof v === 'object'` that could meet
`null` becomes `LegacyTypeOf(v) === 'object'`, and an object-literal default becomes
`LegacyDefault({ … })`.

The two work together. The escapes mean the same thing under JavaScript's rules and TJS's,
so when you are ready, `graduate()` removes the annotation (which switches the file to the
`.tjs` rules) and the code still behaves the same. The one thing that cannot be preserved is
`eval` or `new Function`: then `graduate()` refuses, its result's `refused` field says why,
and the code comes back unchanged.

### Dialect: `TjsCompat` and `TjsStrict`

Two directives answer a different question from the rules: _which language is this file
written in?_ Normally the extension answers it and you write neither.

<!-- tjs-doc: fragment -->

```tjs:static
TjsCompat   // JavaScript semantics: ==, typeof, Date, var, defaults as in JS
TjsStrict   // full TJS, for TS-originated source (where the default is JavaScript semantics)
```

`TjsCompat` turns the rules in the table off, but it does not turn validation off:
parameters are still checked. Add `safety none` as well if you want neither. `TjsStrict`
turns every rule on, restores input validation in converted code (which defaults to
`safety none`), and makes a `Type` predicate that cannot be verified (see
[Declarations](#declarations)) an error instead of a warning.

Plain JavaScript (the `tjs()` API's `dialect: 'js'` option), TS-originated code and
[AJS](/ajs/), TJS's sandboxed agent language, get JavaScript semantics by default, so every
JavaScript program means what it meant (see [Design Principles](/PRINCIPLES/)).

## Declarations

TJS declarations are types that survive to runtime. Each one is a value you can call to
check a candidate. They are covered in full in [Declarations](/declarations/); this is the
syntax at a glance:

```tjs:inline
Type Name 'Alice'                       // from an example

Type User {
  description: 'a user'
  example: { name: '', age: 0 }
}

Type Even {
  example: 2
  predicate(x) { return x % 2 === 0 }
}

Enum Status 'request status' {          // the string is the description
  Pending = 'pending'
  Done = 'done'
}

Union Direction 'a direction' 'north' | 'south'   // description, then the members

Type Box<T> {
  example: { value: T }                 // T is checked at the value slot
}

FunctionPredicate Formatter {
  params: { input: '' }
  returns: ''
}

function unbox(b: Box<int>) { return b.value }

console.log(Name('Ada'), User({ name: 'Ada', age: 36 }), Even(3))  // true true false
console.log(Status('done'), Status.Done, Direction('east'))       // true done false
console.log(unbox({ value: 1 }))                                   // 1
console.log(isMonadicError(unbox({ value: 1.5 })))                 // true
console.log(Formatter((s) => s), Formatter(42))                    // true false
```

A predicate can also be written without a parameter, as `predicate { return Even % 2 === 0 }`:
inside it, the type's own name stands for the value being checked.

A predicate that is pure and synchronous (no loops, `await`, `new`, or effectful calls; use
`every`, `some`, `map` or recursion) is **verified** during transpilation and compiled to a
check with a step budget (fuel), so a hostile input cannot hang validation; recursion is
bounded by the same budget. One that cannot be verified still works, as a plain function.

`Type Box<T>` is a shape whose example mentions `T`; you fill `T` in a signature
(`b: Box<int>`). A `Generic` is a check that takes other checks as arguments when it runs:
`Boxed(0)` builds the check for a `T` whose example is `0`, and the predicate receives that
check as `T`. A `Generic` can carry a `declaration { … }` block of TypeScript that is copied
into the generated `.d.ts` and removed from the JavaScript:

```tjs:inline
Generic Boxed<T> {
  predicate(x, T) { return typeof x === 'object' && T(x.value) }
  declaration {
    value: T
    path: string
  }
}

console.log(Boxed(0)({ value: 1 }), Boxed(0)({ value: 'a' }), Boxed(0)(null))   // true false false
```

`typeof x === 'object'` is enough here, because in TJS `typeof null` is `'null'`.

**`FunctionPredicate` checks only that a value is a function.** Whether a function honours
its signature is something you learn by calling it, so `params` and `returns` are a
documented contract for tools, docs and `.d.ts` output; [Declarations](/declarations/) has
the details.

## Equality, `typeof` and truthiness

| operator      | meaning                                         | example                            |
| ------------- | ----------------------------------------------- | ---------------------------------- |
| `==`          | equality: no coercion, unwraps boxed primitives | `Object('x') == 'x'` is `true` |
| `!=`          | its negation                                    | `0 != ''` is `true`                |
| `===`         | identity, unchanged from JavaScript             | `obj === obj` is `true`            |
| `!==`         | not identical                                   | `{a:1} !== {a:1}` is `true`        |
| `Is(a, b)`    | deep structural equality                        | `Is({a:1}, {a:1})` is `true`       |
| `IsNot(a, b)` | its negation                                    | `IsNot([1,2], [2,1])` is `true`    |

```tjs:inline
console.log(Object('foo') == 'foo')       // true: unwraps
console.log(Object(false) == false)       // true
console.log(null == undefined)            // true: kept from JavaScript
console.log(0 == '', false == [])         // false false: no coercion
console.log(NaN == NaN, NaN === NaN)      // true false: === is JavaScript's

const a = { x: 1 }
const b = { x: 1 }
console.log(a == b)                       // false: objects compare by reference
console.log(Is(a, b))                     // true: structure
console.log(Is(new Set([1, 2]), new Set([2, 1])))  // true: Sets ignore order
console.log(IsNot([1, 2], [2, 1]))        // true

console.log(typeof null)                  // null
console.log(!!Object(false))              // false
console.log(Object(false) ? 'a' : 'b')    // b
```

`==` stays fast because it is not structural; deep comparison is O(n), so you ask for it
by name with `Is`. `Is` lets objects define their own equality: a `[tjsEquals]` method
(`Symbol.for('tjs.equals')`, exported from `tjs-lang/runtime`) is used first, then an
`.Equals` method, then the structural comparison. `==` never calls these hooks.

`a Is b` and `a IsNot b` also work as infix operators; the transpiler rewrites them to the
calls. The call form is the recommended spelling, because it reads the same wherever it
appears.

`typeof` is unchanged except for `null`. Every truthiness context (`if`, `!`, `&&`, `||`,
`?:`, loops) unwraps a boxed primitive first; `&&` and `||` still return one of their
operands, and `??` is untouched because it tests for `null`/`undefined`, not truthiness.
`LegacyTypeOf` restores JavaScript's `typeof`; boxed truthiness has no escape, because
nothing correct depends on it. [JS Footguns That TJS Quietly Fixes](/footguns/) has the
longer list.

## Control flow: `given`

`given` is TJS's dispatch statement. It replaces `switch`'s three hazards: arms do not fall
through, each arm has its own scope, and matching uses TJS's `==`.

```tjs:inline
function describe(kind: '') {
  given kind {
    'cat', 'dog' { return 'pet' }        // several values on one arm
    'lion', 'tiger' { return 'wild' }
  } else {
    return 'unknown'
  }
}

function label(level: 0) {
  let text = 'normal'
  given level {
    1 { text = 'low' }                   // an arm that does work, then continues
    3, 4 { text = 'high' }
  }                                      // no else: 2 matches nothing
  return text
}

console.log(describe('dog'), describe('tiger'), describe('emu'))  // pet wild unknown
console.log(label(1), label(2), label(4))                         // low normal high
```

Arm values can be any expression, and a `given` can be nested inside an arm. Arms compare
values; there are no ranges, guards or destructuring, so compute the value to compare (for
example `Math.floor(code / 100)`) or use `if`.

`switch` still works, with C's semantics exactly, and compiles with a warning that points
at `given`. `switch` is legal JavaScript that the `.tjs` rules do not ban, so TJS keeps
its meaning rather than quietly changing it, and gives the fixed construct a new name.
`given` is TJS syntax: it is not valid in `.js` files or in AJS. More examples are in
[Control Flow: given](/given-dispatch/), and the reasons for a new keyword are in
[Case study: fixing switch](/case-study-switch/).

## Test blocks

A `test` block states what the code does, and it runs during transpilation:

```tjs:inline
function slugify(title: 'Hello World'): 'hello-world' {
  return title.trim().toLowerCase().split(' ').join('-')
}

test 'slugify joins words with dashes' {
  expect(slugify('  Two Words ')).toBe('two-words')
  expect(slugify('A B C').split('-')).toEqual(['a', 'b', 'c'])
}

test 'slugify refuses a number' {
  expect(isMonadicError(slugify(42))).toBe(true)
}

test {
  // a test with no name, using assert
  assert(slugify('x') == 'x', 'a single word is unchanged')
}

console.log(slugify('Syntax Reference'))   // syntax-reference
```

**When they run.** The `tjs(source, { runTests })` transpiler API runs the tests and the
signature tests (every `:` return annotation) and throws if one fails, so the `tjs` CLI's
`check` and `test` commands and a build all stop on a failing test. Tests are removed from
the emitted JavaScript. Pass `runTests: false` to skip them, or `runTests: 'report'` to
collect the results in `testResults` without throwing. The Bun plugin does not run them on
import unless `TJS_RUN_TESTS=1` is set. A test body may use `await`; the command line runs
such tests after transpiling, as the page does.

**Matchers.** `expect(actual)` supports `toBe`, `toEqual`, `toContain` (substring for
strings, membership for arrays), `toThrow(message?)` (on a function),
`toBeTruthy`, `toBeFalsy`, `toBeNull`, `toBeUndefined`, `toBeGreaterThan`,
`toBeLessThan` and `toBeNaN`. `toBe` and `toEqual` both compare by deep equality. There is
no `.not`; write `expect(x == y).toBe(false)`. `assert(condition, message?)` is also
available; the message is what a failure reports.

**Inconclusive is not failure.** A signature test whose call throws, or a test that needs
something the transpiler cannot load (an import, a host object), is inconclusive and does
not stop the build. A test that runs and is wrong does. With `runTests: 'report'`, the
inconclusive ones are in `testResults`, marked `inconclusive: true`.

A `mock { … }` block holds setup code for the tests. What it declares is visible inside
every test:

```tjs:inline
function greet(name: 'Ada') { return `Hello, ${name}` }

mock {
  const visitors = ['Ada', 'Grace']
}

test 'greets every visitor' {
  expect(visitors.map((v) => greet(v))).toEqual(['Hello, Ada', 'Hello, Grace'])
}

console.log(greet('Grace'))   // Hello, Grace
```

Do not rely on a mock's state being reset between tests: when a test changes it, a later
test may see the change.

In a TypeScript file, the same blocks can be written inside a comment
(`/*test 'name' { … }*/`) so `tsc` ignores them.

## Errors

A type error is a **value**, not an exception. A call with a bad argument returns a
`MonadicError` (a subclass of `Error`), and a typed function that receives one returns it
unchanged without running its body, so an error travels to the end of a chain by itself:

```tjs:inline
function clean(name: ''): '' { return name.trim() }
function shout(text: ''): '' { return text.toUpperCase() }

const ok = shout(clean('  ada '))
const err = shout(clean(42))

console.log(ok)                    // ADA
console.log(isMonadicError(err))   // true
console.log(err.expected, err.actual)  // string number
console.log(err.path.endsWith('clean.name'))  // true: it names where it started
```

`isMonadicError(x)` is the check to use; it works across module boundaries. An error
carries `path` (file, line, function and parameter), `expected`, `actual` and a `message`
built from them. Using an error in a plain expression (`err.length`, `` `${err}` ``) does not
propagate it, so check before doing arithmetic or string work on a value that might be one.

### `try` without `catch`

A `try` block with no `catch` turns an exception into a returned `MonadicError`:

```tjs:inline
function parse(json: '{}'):! {} {
  try {
    return JSON.parse(json)
  }
}

console.log(parse('{"ok":true}').ok)       // true
console.log(isMonadicError(parse('nope'))) // true, and nothing was thrown
```

A `try` with a `catch` or `finally` is JavaScript's. A `throw`, or an exception from a
library, behaves as it does in JavaScript; TJS changes only how type errors are reported.

### Bang access: `x!.prop`

`x!.prop` reads a property, or returns a `MonadicError` when `x` is `null` or `undefined`.
Chains short-circuit at the first failure:

```tjs:inline
const user = { profile: null }

const name = user!.profile!.name
console.log(isMonadicError(name))   // true
console.log(name.message)           // Expected non-null for 'bang.name', got null

const found = { profile: { name: 'Ada' } }
console.log(found!.profile!.name)   // Ada
```

The path `bang.name` names the property that could not be read: `profile` was `null`, so
`.name` failed. Optional chaining (`?.`) returns `undefined` silently; `!.` produces an
error you can track.

Every type error is also kept by the runtime. `__tjs` is the runtime's global object:
`__tjs.errors()` lists recent type errors, and `__tjs.records()` lists everything the
runtime noted, warnings included. So an ignored error can still be found later; see
[Flight Recorder](/error-history/) and [Error Handling](/error-handling/).

## Classes

A class is called without `new`, and its methods and constructors validate their
parameters like functions:

```tjs:inline
class Box {
  constructor(v: 0) { this.v = v }
  scale(k: 0) { return this.v * k }
}

console.log(Box(2).scale(3))                      // 6
console.log(Box(2) instanceof Box)                // true
console.log(isMonadicError(Box('two')))           // true
console.log(isMonadicError(Box(2).scale('x')))    // true

const buf = new Float32Array(4)                   // built-ins still need new
console.log(buf.length, new Set([1, 2]).size)     // 4 2
```

**`new` on a class declared in the same file is an error.** `Box(2)` and `new Box(2)` build
the same object, so the keyword adds nothing. Built-in constructors are untouched, because
for them `new` matters: `new Float32Array(4)` is required. The exceptions are `new String`,
`new Number` and `new Boolean`, which are refused: they build an object wrapper, almost
always by mistake for `String(x)` and friends. `Object(x)` makes one deliberately.
Old-style `function` constructors are untouched too.

<!-- tjs-doc: expect-error -->

```tjs:static
class Point {
  constructor(x: 0.0, y: 0.0) { this.x = x; this.y = y }
}
const p = new Point(1, 2)   // error: call it, Point(1, 2)
```

Setters do not validate, because a setter's return value is discarded and a refusal would
silently drop the write.

**Watch platform callbacks.** When the caller ignores the return value, a refused call does
nothing visible (it is still recorded in `__tjs.records()`). The browser calls
`attributeChangedCallback(name, oldValue, newValue)` with `oldValue` set to `null` the first
time, so `old = ''` refuses that call. Write the default the platform actually passes; a
bare `null` default accepts any value:

<!-- tjs-doc: fragment -->

```tjs:static
attributeChangedCallback(name = '', old = null, value = null) { … }
```

### Polymorphic constructors

A class can declare several constructors; the call picks one by its arguments:

```tjs:inline
class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }
  constructor(coords: { x: 0.0, y: 0.0 }) {
    this.x = coords.x
    this.y = coords.y
  }
  get length() { return Math.hypot(this.x, this.y) }
}

console.log(Point(3, 4).length)                 // 5
console.log(Point({ x: 6, y: 8 }).length)       // 10
console.log(Point({ x: 6, y: 8 }) instanceof Point)  // true
```

The first constructor is the real one; the others become factories that produce instances
of the same class. See [Polymorphic Constructors](/polymorphic-constructors/).

## Polymorphic functions

Several declarations with the same name are merged into one function that dispatches on
its arguments:

```tjs:inline
function area(radius: 3.14) { return Math.PI * radius * radius }
function area(w: 0.0, h: 0.0) { return w * h }

console.log(area(1))                    // 3.141592653589793
console.log(area(3, 4))                 // 12
console.log(isMonadicError(area('x')))  // true: no variant matches
```

Dispatch is by arity first, then by how specific the types are, then by declaration order.
Two variants with the same types at the same arity do not transpile. See
[Polymorphic Functions](/polymorphic-functions/).

## `extend`: local class extensions

An `extend` block adds methods to a built-in type without touching its prototype, and they
apply **only where the receiver is written as a literal**. It suits helpers you call on
literals in your own file, such as string and array literals in a template or a table of
data:

```tjs:inline
extend String {
  shout() { return this.toUpperCase() + '!' }
}

extend Array {
  last() { return this[this.length - 1] }
}

console.log('hello'.shout())                       // HELLO!
console.log([3, 1, 4].last())                      // 4
console.log(typeof String.prototype.shout)         // undefined: nothing was patched
```

A call is rewritten during transpilation to an ordinary call with the receiver as `this`.
The receivers that are rewritten are a string or template literal, an array literal, and a
number literal. Write a number with its decimal point, `7.0.double()`: that is also valid
JavaScript, where `7.double()` is not. (`7.double()` works in TJS too, but do not rely on it in
code that may leave for JavaScript.) A call on anything else, a variable or a parenthesised
number such as `(7)`, is left as written and fails when it runs (`xs.last is not a
function`), because no prototype was changed. Use an ordinary function for values you pass
around. The full receiver table is in [Local Class Extensions](/local-extensions/).

Methods must use method syntax, since they need `this`; an arrow-function member is left
out. Several `extend` blocks for one type merge. Extension methods do not validate their
parameters. Extensions are file-local: an importing module never sees them.

## `const!`: compile-time immutability

`const!` declares a binding whose contents cannot be changed. The check happens during
transpilation and costs nothing at runtime: the output is a plain `const`.

```tjs:inline
const! config = { debug: false, port: 8080 }
const! items = [1, 2, 3]

console.log(config.port)              // 8080: reads are fine
console.log(items.map((x) => x * 2).join())  // 2,4,6: non-mutating methods are fine
```

<!-- tjs-doc: expect-error -->

```tjs:static
const! items = [1, 2, 3]
items.push(4)   // does not transpile
```

It catches property assignment, compound assignment (`+=`), `++`/`--`, `delete`, and the
mutating array methods (`push`, `pop`, `splice`, `shift`, `unshift`, `sort`, `reverse`,
`fill`) made directly through the name. It is shallow and it does not follow the value: a
nested write (`config.db.port = 1`), a second binding (`const c = config`) and a function
that receives the value can all still change it.

## Bare assignments

In `.tjs`, the first assignment to an undeclared name that starts with a capital letter
declares it as `const`:

```tjs:inline
Settings = { debug: true }   // becomes: const Settings = { debug: true }
console.log(Settings.debug)  // true
```

A second `Settings = …` in the same file does not transpile ("Identifier 'Settings' has
already been declared"), so declare `let Settings` yourself if it needs to change. A name
that is already declared is left alone. JavaScript, converted TypeScript and AJS are
unaffected.

## Doc comments: `/# … #/`

TJS's own doc comment is multi-line and **nestable**, and it can quote any syntax without
escaping. Its contents are markdown:

```tjs:inline
/#
## Comments in JavaScript

A block comment runs from /* to */, and that is fine to write here.
A nested doc comment works too: /# inner #/ with no escaping.
#/
function identity(a: 0): 0 { return a }

console.log(identity(7))   // 7
```

A JavaScript block comment cannot contain `*/`, so it cannot document comment syntax.
`/*# … */` still works as an ordinary comment, and is the convention in `.ts` files, where
`/# … #/` does not parse. JSDoc `/** … */` comments are read as docs too.

The newline after `/#` is required, and not as a style rule: a one-line `/# x #/` is a valid
JavaScript regular expression, so it stays one. Doc comments are blanked before any other
pass reads the source, so a `test`, `wasm function`, `Type` or marker written inside one is
inert. AJS has them too.

## Modules and imports

A `.tjs` file is an ES module. `import` and `export` mean what they mean in JavaScript, and a
function keeps its checks and its `__tjs` metadata across the boundary, so a caller in
another file cannot skip them:

<!-- tjs-doc: fragment -->

```tjs:static
// mymath.tjs
export function add(a: 0, b: 0): 0 { return a + b }

// app.tjs
import { isMonadicError } from 'tjs-lang/runtime'
import { add } from './mymath.tjs'

console.log(add(2, 3))                  // 5
console.log(isMonadicError(add('2', 3)))  // true: add checks its own inputs
```

`app.tjs` imports `isMonadicError` because it declares no typed function of its own, so its
emitted code carries no runtime that would provide it.

In Bun, preload `tjs-lang/bun-plugin` (in `bunfig.toml`) to import `.tjs` files directly;
for `Bun.build`, use `tjsPlugin` from `tjs-lang/bun-build-plugin`. Otherwise import the
emitted `.js`. A test that depends on an import the transpiler cannot load is inconclusive,
not failed. The playground resolves saved modules by name; see
[Local Module Imports](/local-module-imports/).

## Async functions

An `async` function's parameters are checked when it is called, as for any function. A type
error does not reject the promise: the promise **resolves** to the `MonadicError`. The
return example is never run as a test. With `:` or `:!` the resolved value is not checked;
with `:?` it is, and a wrong result resolves to a `MonadicError`:

```tjs:inline
async function loadScore(player: 'ada'): 30 {
  await new Promise((resolve) => setTimeout(resolve, 10))
  return player.length * 10
}

async function checkedScore(player: 'ada'):? 30 {
  return player                          // a string, not an integer
}

console.log(await loadScore('ada'))      // 30
const bad = await loadScore(42)          // resolves, does not reject
console.log(isMonadicError(bad))         // true
console.log(isMonadicError(await checkedScore('ada')))  // true: :? checked the result
```

So check the awaited value with `isMonadicError()` where you use it, and keep the return
example truthful, since docs and metadata show it. See [Async Functions](/async-functions/).

## WASM

TJS compiles WebAssembly during transpilation and embeds it in the output. There are two
forms: a `wasm function` at module scope, which other files can import, and a `wasm { }`
block inside an ordinary function, with an optional `fallback { }` for runtimes that cannot
run WebAssembly:

```tjs:inline
wasm function addInts(a: i32, b: i32): f64 {
  return a + b
}

function double(! arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) {
      arr[i] = arr[i] * 2.0
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
  return arr
}

console.log(addInts(2, 3))                                 // 5
console.log(double(new Float32Array([1, 2]), 2).join())   // 2,4
```

`wasm function` parameters use WebAssembly type names (`i32`, `f64`, `Float32Array`, …),
not examples. Today a wasm function returns `f64` or nothing; `: i32` and the other return
types are accepted, but the result still comes back as an `f64`.

A `wasm { }` block needs `arr: Float32Array` to know that `arr` is a typed array. TJS has
no runtime check for typed-array names, so in an ordinary function that parameter is
unchecked and transpiles with a warning. `double` is marked `!` to say so, and `!` turns off
the `len` check as well; leave it off to keep `len` checked and accept the warning.

`export wasm function` makes a library that other `.tjs` files compose into their own
module. Free variables in a `wasm { }` block become its parameters. A block that cannot
compile does not transpile. The `f32x4_*` SIMD intrinsics and `wasmBuffer()` (zero-copy
typed arrays in WebAssembly memory) are covered, with the supported subset and the current
limits, in [WASM in TJS](/DOCS-WASM/).

## `@tjs` annotations in TypeScript

A TypeScript file can carry `/* @tjs … */` comments that `fromTS` uses to enrich its TJS
output. `tsc` sees ordinary comments.

<!-- tjs-doc: fragment -->

```javascript
/* @tjs TjsStrict */                          // at the top: convert to full TJS
/* @tjs example: { name: 'Alice', age: 30 } */ // the example for the next interface or type
/* @tjs predicate(x) { return x.age >= 0 } */  // a predicate for the next interface or type
/* @tjs declaration { value: T } */           // the .d.ts declaration for the next generic
/* @tjs-skip */                               // do not convert the next interface or type
/* @tjs-unsafe */                             // before an expression: see below
```

`example`, `predicate`, `declaration` and `@tjs-skip` apply to the `interface` or `type`
declaration that follows them. `TjsStrict` is written at the top of the converted output
(see [Dialect](#dialect-tjscompat-and-tjsstrict)).

`/* @tjs-unsafe */` converts to the deprecated `unsafe` prefix, so the converted file warns.
You rarely need it: conversion already writes `LegacyDate(x)` for a `new Date(x)` and the
other named escapes listed under [Converted TypeScript](#converted-typescript).
