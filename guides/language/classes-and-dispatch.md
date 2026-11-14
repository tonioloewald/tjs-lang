<!--{"parent": "the-tjs-language.md", "order": 20}-->
<!-- TODO review -->

# Classes and Dispatch

Most programs choose what to do from what they are given. In JavaScript you write that
choice by hand: an `if (typeof x === 'number') … else …` ladder at the top of a function, a
constructor that sniffs its arguments, a `switch` on a string. TJS gives you three
constructs that make the choice for you, and checks each branch with the same example rules
as every other TJS signature:

- **polymorphic functions**: several declarations of one function, chosen by the arguments;
- **polymorphic constructors**: several ways to build one class;
- **`given`**: a dispatch statement on a value, without `switch`'s hazards.

Two smaller fixes to classes come first, because the rest of the chapter uses them: a TJS
class is called without `new`, and an `extend` block adds methods to a built-in type without
patching its prototype.

The examples assume you know how a colon example works: `x: 0.0` means "a number, for
example 0.0", `n: 0` means "an integer", `s: ''` means "a string". If that is new, read
[Types by Example](/types-by-example/) first.

## Classes without `new`

### The problem

A JavaScript class must be built with `new`. Forget it and you get an exception:

```javascript
class Box {
  constructor(w, h) {
    this.w = w
    this.h = h
  }
}

const b = Box(2, 3) // TypeError: Class constructor Box cannot be invoked without 'new'
```

The older spelling is worse. A constructor written as a plain `function` can be called
without `new`, and in sloppy-mode code `this` is then the global object, so the
"constructor" writes `w` and `h` onto `window` and returns `undefined`:

```javascript
function OldBox(w, h) {
  this.w = w
  this.h = h
}

const b = OldBox(2, 3) // b is undefined, and window.w is now 2
```

Neither form checks what it is given: `new Box('two', 3)` builds a box whose width is a
string, and the mistake surfaces somewhere else, later.

TJS fixes the first form and leaves the second alone (see the last rule below). For new code,
write a class.

### Calling a class constructs it

In a `.tjs` file, every class you declare can be called like a function. The call builds a
real instance: `instanceof` holds and the methods are on the prototype, exactly as if `new`
had been used.

```tjs:inline
class Box {
  constructor(w: 0, h: 0) {
    this.w = w
    this.h = h
  }

  area() {
    return this.w * this.h
  }
}

const b = Box(2, 3)
console.log('area:', b.area()) // 6
console.log('a Box?', b instanceof Box) // true

// map passes (value, index, array), so this builds Box(2, 0) and Box(3, 1)
const boxes = [2, 3].map(Box)
console.log('areas:', boxes.map((x) => x.area()).join(', ')) // 0, 3

// Built-in classes are untouched: they still need `new`.
const samples = new Float32Array(4)
console.log('samples:', samples.length) // 4

test 'calling a class builds an instance' {
  expect(Box(2, 3) instanceof Box).toBe(true)
  expect(Box(2, 3).area()).toBe(6)
  expect([2, 3].map((w) => Box(w, 2).area())).toEqual([4, 6])
}
```

Because a class is callable, it also works anywhere a function does, as `[2, 3].map(Box)`
shows. Watch the arguments when you do that. A class with one constructor, like a function
with one declaration, ignores extra arguments, as JavaScript always has; but its second
parameter receives whatever the caller passes second, here the index. Wrap it,
`xs.map((w) => Box(w, 2))`, when the arguments the caller passes are not the ones you mean.
(Polymorphic functions and constructors, below, are stricter: they count the arguments.)

### `new` on your own class is an error

If `Box(2, 3)` and `new Box(2, 3)` built the same object, every reader would have to wonder
whether they differ, and code would mix the two. So on a class declared in the same file,
TJS refuses `new`:

<!-- tjs-doc: expect-error -->

```tjs:static
class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }
}

const p = new Point(1, 2) // compile error: write Point(1, 2)
```

The message says what to do: "`new Point` is not allowed in TJS — a class is CALLED, so
`Point(…)` does exactly what `new Point(…)` does and returns the same object. Drop the
keyword."

The rule is checked per file, against the classes that file declares:

- **Built-ins keep `new`.** `new Map()`, `new Set()` and `new Float32Array(4)` need it,
  because JavaScript requires it.
- **`new String`, `new Number` and `new Boolean` are refused.** They build object wrappers,
  almost always by mistake. [Equality](/equality/) explains why a wrapper is a trap.
- **Classes from elsewhere keep JavaScript's rules.** A class imported from a plain `.js`
  module, and a class in converted TypeScript, still take `new`. (A file converted from
  TypeScript keeps JavaScript's semantics until you remove its conversion marker; see
  [Converting a project](/ts-converting-a-project/).) A TJS class imported into plain
  JavaScript accepts both `Point(1, 2)` and `new Point(1, 2)`.
- **An old-style `function` constructor is not changed.** It still needs `new`, and nothing
  warns you when you leave it out. What saves you is that a `.tjs` file is an ES module, and
  module code always runs in strict mode: `this` is `undefined` in a plain call, so
  `OldBox(2, 3)` throws a `TypeError` instead of writing to the global object.

### Constructors and methods check their parameters

A typed parameter on a constructor, a method, a static method or a private method is checked
exactly as it would be on a function. A wrong argument does not run the body: the call
returns a `MonadicError`, TJS's error value, and from a constructor that means you get an
error instead of a half-built object.

The examples test for it with `isMonadicError(x)`, which is available in every `.tjs` file
without an import (elsewhere, import it from `tjs-lang/runtime`):

```tjs:inline
class Box {
  constructor(w: 0, h: 0) {
    this.w = w
    this.h = h
  }

  scale(by: 0) {
    return Box(this.w * by, this.h * by)
  }
}

const bad = Box('two', 3)
console.log('a Box?', bad instanceof Box) // false
console.log('an error?', isMonadicError(bad)) // true

const half = Box(2, 3).scale(0.5)
console.log('scale(0.5) refused?', isMonadicError(half)) // true: by is an integer

test 'a refused constructor returns an error, not an instance' {
  expect(isMonadicError(Box('two', 3))).toBe(true)
  expect(Box(2, 3).scale(2).w).toBe(4)
}
```

These checks cost a little on every call, and you can switch them off where that matters.
[Safety and Validation](/safety-markers/) covers both; [Errors as Values](/errors-as-values/)
covers what to do with the error you get back.

Validation covers parameters, not fields. Assigning `box.w = 'oops'` after construction is
ordinary JavaScript and is not checked.

### Setters do not validate

A setter is the one place where a typed parameter checks nothing. TJS reports a bad
argument by returning an error, and an assignment throws away whatever the setter returns.
If the setter refused, the write would vanish and nobody would hear about it. So the
setter's body always runs, and the example on its parameter is documentation:

```tjs:inline
class Gauge {
  #level = 0

  get level() {
    return this.#level
  }

  set level(value: 0.0) {
    this.#level = value
  }

  setLevel(value: 0.0) {
    this.#level = value
    return this
  }
}

const g = Gauge()
g.level = 'high'
console.log('after g.level = "high":', g.level) // high: the setter did not check

const refused = g.setLevel('high')
console.log('setLevel("high") refused?', isMonadicError(refused)) // true

test 'setters run; methods check' {
  const h = Gauge()
  h.level = 'x'
  expect(h.level).toBe('x')
  expect(isMonadicError(h.setLevel('x'))).toBe(true)
}
```

When a write must be refused, you have two choices. Offer a method such as `setLevel`, whose
result the caller can inspect. Or check inside the setter and **throw**: an assignment has no
result to carry an error, so an exception is the only way the code doing the write finds out.
A wrong type assigned to a property is a programmer's bug, which is what exceptions are for
(see "When to throw anyway" in [Errors as Values](/errors-as-values/)):

```tjs:inline
class Dial {
  #level = 0

  get level() {
    return this.#level
  }

  set level(value: 0.0) {
    if (typeof value !== 'number') {
      throw new TypeError(`level must be a number, got ${typeof value}`)
    }
    this.#level = value
  }
}

const d = Dial()
d.level = 0.5
let message = ''
try {
  d.level = 'high'
} catch (e) {
  message = e.message
}
console.log(message) // level must be a number, got string
console.log(d.level) // 0.5: the bad write did not happen

test 'the setter throws on a bad write' {
  const x = Dial()
  expect(() => {
    x.level = 'high'
  }).toThrow()
  expect(x.level).toBe(0)
}
```

### Watch platform callbacks

The same quiet failure can happen in a method that the platform calls and whose return
value nobody reads. The browser calls a custom element's
`attributeChangedCallback(name, oldValue, newValue)` with `oldValue` set to `null` the first
time an attribute is set.

Here the parameters are written with `=`, as defaults. In TJS a default is also an example:
`old = ''` means "optional, and a string when given". JavaScript would apply the default only
for `undefined` and never refuse a call; TJS checks any value that is passed, and `null` is a
value, not a string. So `old = ''` refuses that first call: the body never runs, and the
browser ignores the error it got back. (The refusal is still recorded by the runtime's flight
recorder, `__tjs.records()`; see [Errors as Values](/errors-as-values/).)

The fix is `old = null`. A default of `null` gives the check no type to compare against, so
it accepts any value, `null` included. Note that the colon form means something else:
`old: null` is a required parameter whose example is `null`, and it accepts `null` and nothing
else. [Dictionary Defaults](/defaults/) has more on defaults.

The example below plays the browser's part by calling the callback directly:

```tjs:inline
class Strict {
  constructor() {
    this.seen = []
  }

  attributeChangedCallback(name = '', old = '', value = '') {
    this.seen.push(name)
  }
}

class Fixed {
  constructor() {
    this.seen = []
  }

  attributeChangedCallback(name = '', old = null, value = null) {
    this.seen.push(name)
  }
}

// What the browser does the first time `size` is set:
const a = Strict()
a.attributeChangedCallback('size', null, '3')
console.log('Strict saw:', a.seen.length) // 0: the call was refused

const b = Fixed()
b.attributeChangedCallback('size', null, '3')
console.log('Fixed saw:', b.seen.length) // 1

test 'write the default the platform passes' {
  const s = Strict()
  expect(isMonadicError(s.attributeChangedCallback('size', null, '3'))).toBe(true)
  const f = Fixed()
  f.attributeChangedCallback('size', null, '3')
  expect(f.seen).toEqual(['size'])
}
```

The rule: for a callback, write the defaults the caller actually passes, not the ones you
wish it passed.

## `extend` blocks

### The problem

Method-call syntax reads well: `'hello'.shout()`, `[3, 1, 4].last()`. The way JavaScript
offers to get it for a built-in type is to patch the prototype,
`String.prototype.shout = function () { … }`. That changes `String` for every piece of code
in the page: your libraries, their libraries, and any future JavaScript that adds a method of
the same name with different behaviour. It has happened: the array method now called `flat`
was going to be `flatten`, until a popular library's incompatible `Array.prototype.flatten`
forced the standard to pick another name.

An `extend` block gives you the method-call syntax in one file, with nothing patched. It has
one large limit, so here it is up front: **it works only when the receiver is written out as
a literal**, as in `'hello'.shout()`. A call on a variable, `name.shout()`, is not rewritten
and fails. That makes `extend` a tool for helpers on literals: string and array constants in
tests, data tables, templates, small scripts. For values you keep in variables, write an
ordinary function.

### Methods on literals, with nothing patched

An `extend` block declares methods for a built-in type. The transpiler rewrites each call on
a literal into an ordinary function call with the literal as `this`:

```tjs:inline
extend String {
  shout() {
    return this.toUpperCase() + '!'
  }
}

extend Array {
  last() {
    return this[this.length - 1]
  }
}

console.log('hello'.shout()) // HELLO!
console.log([3, 1, 4].last()) // 4
console.log(typeof String.prototype.shout) // undefined: nothing was patched

test 'extensions work on literals without patching' {
  expect('hi'.shout()).toBe('HI!')
  expect([1, 2, 3].last()).toBe(3)
  expect(typeof String.prototype.shout).toBe('undefined')
  expect(typeof Array.prototype.last).toBe('undefined')
}
```

`'hello'.shout()` becomes, roughly, `__ext_String.shout.call('hello')`: a plain call on a
plain object that belongs to this file.

### Why only literals

> **Only a call whose receiver is written out as a literal is rewritten.** That means a
> string or template literal, an array literal, or a number literal such as `7.5`. A call on
> a variable, `xs.last()`, is left exactly as written, and since no prototype was changed it
> fails when it runs with a `TypeError`: `xs.last is not a function`.

The rewrite runs on the text of the file before any type information exists. It sees
`xs.last()` as a name followed by `.last()`, with no way to know what `xs` holds, so it acts
only where the text itself shows the type.

```tjs:inline
extend Array {
  last() {
    return this[this.length - 1]
  }
}

const xs = [3, 1, 4]

let failure = ''
try {
  xs.last()
} catch (e) {
  failure = e instanceof TypeError ? 'TypeError' : 'other'
}
console.log('xs.last():', failure) // TypeError

// Spreading into a literal works, at the cost of a copy:
console.log([...xs].last()) // 4

// For values you pass around, write an ordinary function.
function lastOf(items: [0]) {
  return items[items.length - 1]
}
console.log(lastOf(xs)) // 4

test 'a variable receiver is not rewritten' {
  expect(failure).toBe('TypeError')
  expect([...xs].last()).toBe(4)
  expect(lastOf(xs)).toBe(4)
}
```

Chained calls hit the same limit: in `'a'.shout().shout()` the second receiver is a call
result, not a literal, so only the first call is rewritten. The full receiver table is in
[Local Class Extensions](/local-extensions/), which also lists two receivers the current
transform rewrites wrongly; those are bugs, not rules.

### Rules

- **Method syntax only.** Methods use `this`, so they must be written as methods:
  `last() { … }`. Writing `last() => …` is a compile error ("Arrow functions are not allowed
  in extend blocks"). Writing `last = () => …` or `last: () => …` compiles but defines
  nothing: the block is read for method declarations, and anything else in it is skipped
  without a warning.
- **Blocks merge.** Several `extend String` blocks add up, so you can group extensions by
  topic.
- **No parameter validation.** Inside `extend`, `clamp(min: 0.0, max: 1.0)` gives `min` and
  `max` defaults but does not check them. If the arguments matter, check them in the body or
  write an ordinary function.
- **File-local.** Extensions apply only to calls in the file that declares them. A module
  that imports yours never sees them, and there is no way to share an `extend` block.
- **A name a built-in already uses replaces it on literals only.** `extend Array { map(f) {…} }`
  changes `[1].map(f)` but not `xs.map(f)`. Pick names the built-in types do not use.

## Polymorphic functions

### The problem

A function that accepts more than one kind of input usually starts with a ladder:

```javascript
function area(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a * b
  if (typeof a === 'number' && b === undefined) return Math.PI * a * a
  if (a && typeof a === 'object') return a.w * a.h
  throw new TypeError('area: unsupported arguments')
}
```

The ladder hides three functions inside one. None of them has a signature a tool can read,
the checks are hand-written, and the order of the tests is a bug waiting to happen.

### Same name, several declarations

In TJS you write the three functions separately, with the same name. The transpiler merges
them into one function, the **dispatcher**, which looks at the arguments of each call and
runs the declaration they fit:

```tjs:inline
function area(radius: 1.0) {
  return Math.PI * radius * radius
}

function area(w: 1.0, h: 1.0) {
  return w * h
}

function area(rect: { w: 1.0, h: 1.0 }) {
  return rect.w * rect.h
}

console.log(area(1).toFixed(4)) // 3.1416
console.log(area(3, 4)) // 12
console.log(area({ w: 3, h: 4 })) // 12

test 'each call reaches the declaration it fits' {
  expect(area(3, 4)).toBe(12)
  expect(area({ w: 2, h: 5 })).toBe(10)
  expect(Math.round(area(1) * 100)).toBe(314)
}
```

Behind the scenes the declarations are renamed `area$1`, `area$2` and `area$3` (the
**variants**), and a new `area` chooses among them. Each variant is still an ordinary TJS
function: it validates its own parameters, and a return annotation on it is a worked example
that is tested, as it would be on a lone function (see [Testing](/testing/)).

The dispatcher chooses with a quick check of each argument's type: a number, an integer, a
string, an object, a named `Type`. The variant it picks then checks its parameters in full.
If that full check fails (an object without `w`, say), you get the variant's error; the
dispatcher does not go back and try another variant.

Dispatch happens when the function is called, from the values actually passed. That is the
difference from overloading in Java or C++, which choose at compile time from declared types:
in TJS a value parsed from JSON, whose type you only learn at runtime, still reaches the right
variant.

### The order variants are tried in

1. **Number of arguments.** A variant matches only a call with exactly as many arguments as
   it has parameters. `area(1, 2, 3)` matches nothing.
2. **How specific the types are.** Among variants with the same number of parameters, the
   narrower one is tried first. A non-negative integer (`+0`) is narrower than an integer
   (`0`), which is narrower than any other declared type (a number, a string, an object, a
   named `Type`), and any declared type is narrower than an untyped parameter.
3. **Declaration order.** When two variants are equally specific and a call fits both, the
   one declared first wins.

Step 2 means that when the variants have the same number of parameters, the order you write
them in does not matter. Here the widest is declared first on purpose:

```tjs:inline
function kind(n: 0.0) {
  return 'number'
}

function kind(n: 0) {
  return 'integer'
}

function kind(n: +0) {
  return 'count'
}

function kind(x) {
  return 'something else'
}

console.log(kind(1.5), kind(-3), kind(42), kind('hi'))
// number integer count something else

test 'the narrowest matching variant wins' {
  expect(kind(42)).toBe('count')
  expect(kind(-3)).toBe('integer')
  expect(kind(1.5)).toBe('number')
  expect(kind(null)).toBe('something else')
}
```

`42` fits the first three variants and goes to `+0`, the narrowest. The untyped variant fits
everything, so it is tried last and catches whatever the others refuse.

> **A known bug: keep variants with the same number of parameters together.** The current
> transpiler applies step 2 only to variants that sit next to each other in the file. A
> variant with a different parameter count declared between them stops the reordering:
>
> ```javascript
> function size(n: 0.0) { return 'number' }
> function size(a: 0, b: 0) { return 'two' }
> function size(n: 0) { return 'integer' }
>
> size(3) // 'number', where step 2 says 'integer'
> ```
>
> Moving `size(n: 0)` up next to `size(n: 0.0)`, or declaring the narrower variant first,
> gives `'integer'`.

### When nothing matches

The dispatcher does not throw, and it does not guess the closest variant. It returns a
`MonadicError` whose message says "no matching overload":

```tjs:inline
function area(radius: 1.0) {
  return Math.PI * radius * radius
}

function area(w: 1.0, h: 1.0) {
  return w * h
}

const wrong = area('big')
console.log(isMonadicError(wrong)) // true
console.log(wrong.message)
// Expected no matching overload for 'area', got array of string

test 'no match is an error value' {
  expect(isMonadicError(area(1, 2, 3))).toBe(true)
  expect(isMonadicError(area('big'))).toBe(true)
}
```

The message is built from TJS's general "Expected X for Y, got Z" template, which is why it
reads oddly: what was expected is "no matching overload" for `area`. What it got describes
the whole argument list, which the dispatcher checks as one array; so "array of string" means
"string arguments", here the single `'big'`. Two strings would read the same way, and
`area(1, 'x')` gives "array of number | string".

If an argument is already a `MonadicError`, the dispatcher hands that error back unchanged.
That is not special to dispatchers: every typed parameter in TJS does the same, so in a chain
of calls the error you end up with names the first thing that went wrong. "How errors travel"
in [Errors as Values](/errors-as-values/) covers the rule.

The same rule about counting arguments catches callbacks: `[1, 2].map(kind)` passes three
arguments to each call, so every call matches nothing. Wrap it: `xs.map((x) => kind(x))`.

### Two variants must be distinguishable

Two variants with the same number of parameters and the same type at every position do not
transpile. Only types count: renaming a parameter does not make a new signature, and
`(x: '')` and `(x: 'a')` are the same signature, because both mean "a string".

<!-- tjs-doc: expect-error -->

```tjs:static
function label(id: 0) {
  return 'by id'
}

// Same signature as the first (one integer): the file does not transpile
function label(index: 0) {
  return 'by index'
}
```

The error reads: "Polymorphic function 'label': variants 1 and 2 have ambiguous signatures
(same parameter types at every position). Overloads must differ by arity or parameter types."

### Telling objects apart by shape

The dispatcher compares types, and every object example has the same type: object. It does
not look at the keys. So `perimeter(c: { radius: 1.0 })` and
`perimeter(r: { w: 1.0, h: 1.0 })` are the same signature, and the file is rejected as
ambiguous. (Inside a lone function an object example does check the keys; only the
dispatcher cannot tell two of them apart.)

Name each shape with a `Type`. The block form, `Type Circle { example: { radius: 1.0 } }`,
declares a type named `Circle` whose values look like its example, and the name can then
stand in a signature wherever an example can. Two named types are two signatures, and the
dispatcher calls the first variant whose type accepts the argument:

```tjs:inline
Type Circle {
  example: { radius: 1.0 }
}

Type Rect {
  example: { w: 1.0, h: 1.0 }
}

function perimeter(c: Circle) {
  return 2 * Math.PI * c.radius
}

function perimeter(r: Rect) {
  return 2 * (r.w + r.h)
}

console.log(perimeter({ w: 3, h: 4 })) // 14
console.log(perimeter({ radius: 1 }).toFixed(2)) // 6.28

test 'named types dispatch by shape' {
  expect(perimeter({ w: 3, h: 4 })).toBe(14)
  expect(isMonadicError(perimeter({ side: 2 }))).toBe(true)
}
```

A `Type` built from an example accepts extra keys, so an object with `radius`, `w` and `h`
fits both; the two are equally specific, and `Circle`, declared first, wins.

Name **every** object variant when you dispatch on shape. A plain object example is as
specific as a named type, and its quick check accepts any object, so a variant with
`(o: { a: 1 })` declared before `(c: Circle)` claims every object, circles included, and then
refuses the circle because it has no `a`. [Types by Example](/types-by-example/) covers how a
`Type` checks a value, and the other ways to declare one.

### The metadata shows every variant

Every TJS function carries its signature as data, in a `__tjs` property: that is what
documentation generators, editor autocomplete and `tjs check` (the command-line checker)
read, and what your own code can read to describe or route calls. A dispatcher's own
signature is "any arguments"; the types live on the variants, and the dispatcher's `__tjs`
names them. `tjs check` lists each variant separately, as `area$1(radius: number)`,
`area$2(w: number, h: number)` and so on, and generated docs do the same.

```tjs:inline
function show(n: 0.0) {
  return 'number ' + n
}

function show(s: '') {
  return 'text ' + s
}

test 'the dispatcher lists its variants' {
  expect(show.__tjs.polymorphic).toBe(true)
  expect(show.__tjs.variants).toEqual(['show$1', 'show$2'])
}
```

This example prints nothing; its result is the passing test. The test reads the metadata
rather than a top-level `console.log` because of where the dispatcher is placed: the
transpiler writes it at the end of the file, after everything else. The function itself is
hoisted, so calling `show` works anywhere, but the line that attaches `show.__tjs` runs only
when execution reaches the end. A `test` block runs after the whole file, and a module that
imports `show` runs after this module has finished loading, so both see the metadata.

### Other rules

- **Dispatch looks at types, not values.** It is for "a number or a string", not for "zero
  or not zero". Branch on values with `if` or with [`given`](#given), below.
- **A default does not make a parameter optional to the dispatcher.** With
  `function opt(a: 0, b = 1)`, the call `opt(1)` matches nothing, because the argument count
  must match exactly. Declare a one-parameter variant for that call.
- **No rest parameters in any variant.** Dispatch starts by counting arguments, and a rest
  parameter takes any number, so it would match every count. Declaring one is a transpile
  error.
- **All variants sync, or all async.** Mixing them is a transpile error, since a caller could
  not know whether it gets a value or a promise.
- **Variants merge within one file.** Marking any variant `export` exports the dispatcher;
  the numbered variants stay private.
- **Dispatch costs a check per call**: the dispatcher tests the variants in order until one
  fits.

## Polymorphic constructors

JavaScript allows one `constructor` per class. A class that can be built "from three numbers
or from a hex string" grows a type test at the top of that constructor, or static factories
such as `Color.fromHex()`. In TJS each way of building the object is its own constructor:

```tjs:inline
class Color {
  constructor(r: 0, g: 0, b: 0) {
    this.r = r
    this.g = g
    this.b = b
  }

  constructor(hex: '#ff8800') {
    const n = parseInt(hex.slice(1), 16)
    this.r = (n >> 16) & 255
    this.g = (n >> 8) & 255
    this.b = n & 255
  }

  toString() {
    return `rgb(${this.r}, ${this.g}, ${this.b})`
  }
}

const orange = Color('#ff8800')
console.log(orange.toString()) // rgb(255, 136, 0)
console.log(Color(0, 128, 255).toString()) // rgb(0, 128, 255)
console.log(orange instanceof Color) // true

// '#ff8800' means "a string", so any string gets in:
console.log(Color('red').toString()) // rgb(0, 0, 237): parseInt read 'ed' as hex

test 'both constructors build a Color' {
  expect(Color('#000010').b).toBe(16)
  expect(Color(1, 2, 3) instanceof Color).toBe(true)
  expect(Color('#ffffff') instanceof Color).toBe(true)
}
```

The example `'#ff8800'` shows a reader what kind of string to pass, but as a check it means
only "a string", like every lone string example. `Color('red')` is accepted and builds a
colour from whatever `parseInt` makes of it. To check the format, see
[A named type checks the format](#a-named-type-checks-the-format) below.

How it works:

- **The first constructor is the real one.** It stays the class's JavaScript constructor,
  and calling the class with its arguments is an ordinary construction: field initialisers
  run, private fields exist, and in a subclass `super()` runs as usual.
- **The others become factories.** Each creates an empty object with the class's prototype,
  then runs that constructor's body on it. So `instanceof` holds and every method, inherited
  ones included, is there. Nothing else runs: **no field initialisers, no private fields, and
  no parent constructor.** A factory body cannot call `super()` (that is a compile error), so
  it must assign every field itself, including the ones the parent would have set. A class
  with `#private` fields should have only one constructor: on a factory-built object the
  private field does not exist, and a method that reads it throws a `TypeError`.
- **A dispatcher chooses, then the chosen constructor validates.** The dispatcher picks the
  first constructor, in the order written, whose parameter count matches and whose
  parameters pass the quick check (a number, integer, string, boolean, array or object, or a
  named `Type`). That constructor then checks its parameters in full, as any function does.
- **When nothing fits**, the call returns a `MonadicError` ("no matching constructor"), as a
  polymorphic function does.

A subclass can have several constructors on those terms. Here the second constructor sets
`name`, which the first leaves to `Shape`:

```tjs:inline
class Shape {
  constructor(name: 'shape') {
    this.name = name
  }

  describe() {
    return `${this.name}, area ${this.area()}`
  }
}

class Square extends Shape {
  constructor(side: 1.0) {
    super('square')
    this.side = side
  }

  constructor(spec: { side: 1.0 }) {
    // A factory: no super(), so set what Shape would have set
    this.name = 'square'
    this.side = spec.side
  }

  area() {
    return this.side * this.side
  }
}

console.log(Square(2).describe()) // square, area 4
console.log(Square({ side: 3 }).describe()) // square, area 9
console.log(Square({ side: 3 }) instanceof Shape) // true

test 'both constructors build a full Square' {
  expect(Square({ side: 3 }).name).toBe('square')
  expect(Square({ side: 3 }).area()).toBe(9)
  expect(Square(2) instanceof Shape).toBe(true)
}
```

### A named type checks the format

A named `Type` works in a constructor as it does in a function: the dispatcher runs the
type's check, so a constructor can accept only values of a given shape or format. A `Type`
with a `predicate` adds a test of your own to the example's type check:

```tjs:inline
Type Hex {
  example: '#ff8800'
  predicate(x) {
    return (
      x.length === 7 &&
      x.startsWith('#') &&
      x
        .slice(1)
        .split('')
        .every((c) => '0123456789abcdefABCDEF'.includes(c))
    )
  }
}

class Color {
  constructor(r: 0, g: 0, b: 0) {
    this.r = r
    this.g = g
    this.b = b
  }

  constructor(hex: Hex) {
    const n = parseInt(hex.slice(1), 16)
    this.r = (n >> 16) & 255
    this.g = (n >> 8) & 255
    this.b = n & 255
  }
}

console.log(Color('#ff8800').g) // 136
console.log(isMonadicError(Color('red'))) // true
console.log(Color('red').message)
// Expected no matching constructor for 'Color', got array of string

test 'only a hex string reaches the hex constructor' {
  expect(Color('#000010').b).toBe(16)
  expect(isMonadicError(Color('red'))).toBe(true)
  expect(isMonadicError(Color('#12345'))).toBe(true)
}
```

The same works for objects. `constructor(c: Circle)` and `constructor(r: Rect)`, with the
`Type`s from the polymorphic-functions section, build from either shape.
[Declarations](/declarations/) explains `predicate` and the other parts of a `Type` block.

### Units at the boundary

A constructor is a good place to normalise input. Here a temperature is stored in Celsius
however it arrives:

```tjs:inline
class Temperature {
  constructor(celsius: 0.0) {
    this.celsius = celsius
  }

  constructor(reading: { value: 0.0, unit: 'C' | 'F' }) {
    this.celsius =
      reading.unit === 'F' ? ((reading.value - 32) * 5) / 9 : reading.value
  }
}

console.log(Temperature(21.5).celsius) // 21.5
console.log(Temperature({ value: 212, unit: 'F' }).celsius) // 100

const kelvin = Temperature({ value: 300, unit: 'K' })
console.log('unit K refused?', isMonadicError(kelvin)) // true
const warm = Temperature('warm')
console.log('"warm" refused?', isMonadicError(warm)) // true

test 'every reading becomes Celsius' {
  expect(Temperature({ value: 32, unit: 'F' }).celsius).toBe(0)
  expect(Temperature({ value: 300, unit: 'K' }) instanceof Temperature).toBe(false)
}
```

`'C' | 'F'` follows a rule worth stating, because it differs from `hex: '#ff8800'` above. A
lone string example widens to "any string". A **union of string examples** does not: it is a
closed set, and the unit must be exactly `'C'` or `'F'`. A union of examples of *different*
types, such as `0 | ''` at the end of this chapter, is a union of the types: any integer or
any string. "Unions, optional and nullable values" in [Types by Example](/types-by-example/)
covers all three cases.

The two refusals come from different steps. `'warm'` is a string and no constructor takes a
string, so the dispatcher finds nothing. `{ value: 300, unit: 'K' }` is an object, so the
dispatcher picks the second constructor, whose own check refuses the unit.

### Where constructors differ from functions

Constructor dispatch is simpler than function dispatch, and the differences matter when you
design the signatures:

- **No ambiguity check, and no specificity ordering.** Two constructors with the same
  parameter types are accepted, and the first always wins. With `constructor(n: 0.0)`
  before `constructor(n: 0)`, an integer goes to the first. Put the narrower one first.
- **Plain object examples are told apart only by being objects.** Two constructors that each
  take one object example, such as `{ radius: 1.0 }` and `{ w: 1.0, h: 1.0 }`, never reach the
  second: the first accepts every object. Use named `Type`s, as above, or distinguish them by
  argument count or primitive type, or take one object and branch inside, as `Temperature`
  does on `unit`.
- **Only the first constructor is a real construction**, as described under "How it works":
  factories skip field initialisers, private fields and `super()`.

## `given`

### The problem

`switch` has three hazards that every JavaScript developer has met:

1. **Fall-through.** A `case` without `break` runs on into the next one.
2. **One shared scope.** All the cases declare into a single block, so `let label` in two
   cases is a redeclaration error.
3. **`===` matching.** In a `.tjs` file, where `==` has TJS's meaning, a `switch` compares
   differently from `==` on the next line.

The second hazard stops the file from compiling at all:

<!-- tjs-doc: expect-error -->

```tjs:static
function describe(animal: '') {
  switch (animal) {
    case 'cat':
      let label = 'pet'
      return label
    case 'lion':
      let label = 'wild' // Identifier 'label' has already been declared
      return label
  }
}
```

### Arms, values and `else`

`given` takes a value and a list of **arms**. Each arm is one or more values, separated by
commas, and a block to run when the value matches one of them. `else` runs when no arm
matches. The first matching arm wins, its block runs, and control continues after the
`given`. There is no fall-through, so an arm never needs `break`. You may still write one,
but it ends the `given`, not an enclosing loop; "Arms that do work" below has the details.

```tjs:inline
function sound(animal: '') {
  given animal {
    'cat' { return 'meow' }
    'dog', 'wolf' { return 'woof' }
  } else {
    return '...'
  }
}

console.log(sound('cat'), sound('wolf'), sound('emu')) // meow woof ...

test 'several values per arm, else for the rest' {
  expect(sound('dog')).toBe('woof')
  expect(sound('wolf')).toBe('woof')
  expect(sound('emu')).toBe('...')
}
```

Here is the same choice written both ways. The `switch` has the fall-through bug most people
write at least once; the `given` cannot have it, and because each arm is its own `{ }` block,
both arms can declare `label`, which the `switch` above could not:

```tjs:inline
function withSwitch(animal: '') {
  let result = 'unknown'
  switch (animal) {
    case 'cat':
      result = 'pet' // no break: runs on into the next case
    case 'lion':
      result = 'wild'
  }
  return result
}

function withGiven(animal: '') {
  let result = 'unknown'
  given animal {
    'cat' {
      const label = 'pet'
      result = label
    }
    'lion' {
      const label = 'wild'
      result = label
    }
  }
  return result
}

console.log('switch:', withSwitch('cat')) // wild: wrong
console.log('given: ', withGiven('cat')) // pet

test 'given arms do not fall through' {
  expect(withSwitch('cat')).toBe('wild')
  expect(withGiven('cat')).toBe('pet')
  expect(withGiven('lion')).toBe('wild')
}
```

TJS compiles `withSwitch`, with a warning that points at `given`.

### Arms that do work, and nesting

An arm does not have to return. It is a block; when it finishes, control continues after the
`given`. Arm values can be any expression, including named constants, and the `else` is
optional. A `given` can sit inside an arm or an `else`:

```tjs:inline
const LOW = 1
const HIGH = 3

function priority(level: 0) {
  let label = 'normal'
  given level {
    LOW { label = 'low' }
    HIGH, 4 { label = 'high' }
  }
  return label + ' priority'
}

function httpText(code: 200) {
  given code {
    200, 204 { return 'ok' }
    404 { return 'not found' }
  } else {
    given Math.floor(code / 100) {
      5 { return 'server error' }
    } else {
      return 'other'
    }
  }
}

console.log(priority(1), '|', priority(2), '|', priority(4))
// low priority | normal priority | high priority
console.log(httpText(204), '|', httpText(503), '|', httpText(302))
// ok | server error | other

test 'arms that continue, and a nested given' {
  expect(priority(2)).toBe('normal priority')
  expect(priority(3)).toBe('high priority')
  expect(httpText(404)).toBe('not found')
  expect(httpText(500)).toBe('server error')
}
```

`httpText` shows the pattern for ranges. `given` has no ranges, guards or destructuring: arms
compare values, they are not patterns. To match "any 5xx code", compute the value you want to
compare, here `Math.floor(code / 100)`, or use `if`.

**Inside a loop, watch `break`.** `continue` goes to the next iteration as usual, but a
`break` in an arm ends the `given`, not the loop, because `given` is built on `switch`. Code
moved from an `if` inside a loop is where this bites. To leave the loop from an arm, use
`return` or a labelled `break`.

### Matching uses TJS `==`

An arm matches when the value `==` the arm's value, with TJS's meaning of `==`: no type
coercion, `null` and `undefined` match each other, and a boxed primitive matches its plain
value. [Equality](/equality/) explains the rules.

```tjs:inline
function check(value) {
  given value {
    200 { return 'the number 200' }
    null { return 'nothing' }
  } else {
    return 'no match'
  }
}

console.log(check(200)) // the number 200
console.log(check('200')) // no match: no coercion
console.log(check(undefined)) // nothing: null == undefined

test 'given matches with TJS ==' {
  expect(check('200')).toBe('no match')
  expect(check(undefined)).toBe('nothing')
  expect(check(Object(200))).toBe('the number 200')
}
```

### Why `switch` still means what it meant

`switch` compiles in a `.tjs` file with C's semantics exactly, fall-through and all, plus a
warning that suggests `given`. TJS accepts every JavaScript program with the same meaning
(see [Design Principles & Invariants](/PRINCIPLES/)), so quietly changing what `switch` does
would break code pasted from JavaScript, and a reader who saw `case` labels would assume the
old rules anyway. The fixed construct needed a new shape and a new name so that nobody could
mistake one for the other. The measurements behind that decision are in the
[case study on fixing `switch`](/case-study-switch/).

Converting TypeScript or JavaScript to TJS leaves `switch` alone. A converted file starts
with a marker that keeps JavaScript's semantics; removing it, which the converter's tooling
calls **graduating** the file, makes it native TJS. Only then is a `switch` rewritten to
`given`, and only where that provably means the same thing (see
[Converting a project](/ts-converting-a-project/)).

`given` is TJS syntax. It is not valid in a `.js` file, and it is not part of
[AJS](/ajs/), the sandboxed agent language.

## Which one?

The three constructs answer different questions:

- **A polymorphic function** when the inputs differ in **type or number**: a radius or a
  width and height, a string or a `Rect`. Each variant gets its own signature, its own checks
  and its own entry in the docs.
- **`given`** when the input is one type and the behaviour depends on its **value**: a status
  code, a command name, a unit.
- **One function with a union parameter** when the kinds of input differ but the work does
  not. `x: 0 | ''` accepts an integer or a string, checks that, and lets one body handle
  both:

```tjs:inline
function tag(id: 0 | '') {
  return `#${id}`
}

console.log(tag(7), tag('main')) // #7 #main
console.log(isMonadicError(tag(true))) // true

test 'a union parameter: one body, two types' {
  expect(tag(7)).toBe('#7')
  expect(tag('main')).toBe('#main')
}
```

If you find yourself writing `if (typeof id === 'number')` inside that body, the inputs need
different work, and two variants of a polymorphic function will say so more clearly.
