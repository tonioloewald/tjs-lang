<!--{"parent": "the-tjs-language.md", "order": 10}-->
<!-- TODO review -->

# Types by Example

In TJS, a value you write where a type would go becomes the check. `age: 0` means "an
integer, for example 0", and a call that passes `'old'` is refused. This chapter shows that
rule at work on every kind of example, then shows that a declared type is an ordinary value
your own code can read: its description, its example, its JSON Schema.

Examples are not the only source of checks. Type names such as `int` and predicates (a
function that says yes or no) also make checks, and both appear below. The declaration forms
themselves (`Type` with a block, predicates, `Enum`, `Union`, `Generic`, `FunctionPredicate`)
are taught in [Declarations](/declarations/). If you have not read it yet, the block form
`Type X { example: ... }` is all you need for this chapter.

## Why examples

In TypeScript, a type annotation is gone by the time the code runs. `age: number` cannot stop
`createUser('Ada', -1)` arriving from a form or an API. So projects add a schema library and
describe the same shape a second time, once for the compiler and once for the runtime, and
then keep the two in step by hand.

TJS writes the shape once, as an example, and keeps it:

```tjs
function createUser(name: 'anonymous', age: +0) {
  return { name, age }
}

console.log(createUser('Ada', 36))   // { name: 'Ada', age: 36 }

const refused = createUser('Ada', -1)
console.log(isMonadicError(refused)) // true
console.log(refused.message)
// Expected non-negative-integer for '…createUser.age', got number
```

`name: 'anonymous'` says "a string, for example `'anonymous'`". `age: +0` says "a
non-negative integer, for example 0". Those examples are the documentation (a reader sees a
real value), the check (`-1` is refused), and data for tools: editor autocomplete, and the
JSON Schema export shown in [What a type gives you](#what-a-type-gives-you-besides-the-check).

A refused call does not throw and does not run the body. It returns an error value, which
`isMonadicError` recognises; [Errors as Values](/errors-as-values/) explains why. The path in
the message starts with the file name and line, shortened to `…` on this page.

## How each kind of example becomes a check

The transpiler reads an example's **source text**, not only its value. That is why TJS can
tell things apart that JavaScript cannot: `0.0 === 0` is true, so a library that only
received the value could never know whether you meant "any number" or "an integer". TJS
sees the `.0` you typed.

| Example                | Accepts                                               |
| ---------------------- | ----------------------------------------------------- |
| `'Alice'`, `''`        | any string                                            |
| `true`, `false`        | any boolean                                           |
| `null`                 | only `null`                                           |
| `42`, `0`, `-1`        | any integer                                           |
| `3.14`, `0.0`          | any number, integers included                         |
| `+0`                   | any non-negative integer                              |
| `{ name: '', age: 0 }` | an object with every shown member; extra keys allowed |
| `[0]`                  | an array whose every element is an integer            |
| `[]`                   | any array; elements unchecked                         |
| `'S' \| 'M' \| 'L'`    | exactly those values                                  |
| `0 \| ''`              | any integer or any string                             |
| `'' \| undefined`      | a string, or absent                                   |
| `0 \| null`            | an integer, or `null`                                 |

The same rules apply wherever an example appears: a parameter, a member of an object
example, an array element, a return value, or a `Type`'s example. The sections below run
each row.

### Strings, booleans and null

A string or boolean example stands for its whole type. `null` stands only for itself:

```tjs
function greet(name: 'Alice') { return `Hello, ${name}` }
function flag(on: true) { return on }
function nothing(x: null) { return x }

console.log(greet('Bob'))                       // Hello, Bob
console.log(flag(false))                        // false: true is an example of a boolean
console.log(isMonadicError(flag('yes')))        // true
console.log(nothing(null))                      // null
console.log(isMonadicError(nothing(undefined))) // true: null is not undefined
```

### Numbers

JavaScript has one number type. TJS reads three from how the example is written:

```tjs
function repeat(count: 3) { return 'x'.repeat(count) }   // an integer
function scale(rate: 1.5) { return rate * 2 }            // any number
function at(index: +0) { return ['a', 'b', 'c'][index] } // a non-negative integer

console.log(repeat(2))                      // xx
console.log(isMonadicError(repeat(2.5)))    // true
console.log(scale(4))                       // 8: an integer is a number too
console.log(at(2))                          // c
console.log(isMonadicError(at(-1)))         // true
console.log(isMonadicError(at(1.5)))        // true

console.log(0.0 === 0)  // true: as values they are the same, which is why TJS reads source
```

Pick the example for the general case. `rate: 2` would forbid `1.5`; if a value can ever be
fractional, write its example with a decimal point.

The rules at the edges:

- A minus sign does not narrow anything. `-1` means any integer and `-1.5` any number; there
  is no example for "negative only".
- A number example (`1.5`) accepts `NaN`, `Infinity` and `-Infinity`, because they are of
  type `number`. An integer example refuses all three.
- An integer example accepts any whole number, including ones beyond
  `Number.MAX_SAFE_INTEGER`, where JavaScript can no longer count exactly.
- `+` works on integers only. Do not write `+1.5`: today it is read as a non-negative
  integer, and refuses `1.5` itself. For "a number, never negative", use a `Type` with a
  predicate ([Declarations](/declarations/)).

### Return examples

A return position takes an example too, after the parameter list. There it means more than
a type. During transpilation (by `tjs check`, a build, or the playground), TJS calls the
function with its parameter examples and compares the result with the return example, by
value. That built-in test is the function's **signature test**:

```tjs
function add(a: 2, b: 3): 5 { return a + b }   // add(2, 3) runs, and must be 5

function makeUser(name: 'Ada'):! { name: '', age: 0 } {
  return { name, age: 36 }
}

console.log(add(10, 20))                 // 30: the return example is not a limit
console.log(makeUser('Grace').name)      // Grace
console.log(isMonadicError(add(2, 'x'))) // true: the parameters are still checked
```

A parameter example says only what type the argument has; `a: 2` accepts `10`. A return
example is a **worked example**: `add(2, 3)` must actually produce `5`. Get the arithmetic
wrong and the file does not transpile:

```text
function scaled(n: 2): 0 { return n * 10 }

✗ Transpile-time test failures:
  Function signature example is inconsistent:
    Expected 0 at 'scaled', got 20
```

When you mean only the type of the result, write `:!` instead of `:`. Nothing runs, so it
suits functions with side effects and results that would be awkward to write out, like
`makeUser` above. `:?` runs the signature test and also checks every result at runtime.
[Testing](/testing/) covers signature tests in full, including the ones that cannot run.

### Type names

Sometimes there is no natural example, or you would rather say the type outright. Each
numeric example has a name, and TypeScript's own names work as runtime checks too:

```tjs
function mix(count: int, rate: float, index: unsigned) {
  return count * rate + index
}
function row(s: string, n: number, b: boolean, either: string | number) {
  return [s, n, b, either]
}

console.log(mix(2, 0.5, 3))                        // 4
console.log(isMonadicError(mix(2.5, 0.5, 3)))      // true: count is an int
console.log(isMonadicError(mix(2, 0.5, -3)))       // true: index is unsigned
console.log(row('a', 1.5, true, 7))                // [ 'a', 1.5, true, 7 ]
console.log(isMonadicError(row(1, 1, true, 7)))    // true
console.log(isMonadicError(row('a', 1, true, {}))) // true
```

`int` means the same as `42`, `float` and `number` the same as `3.14`, `unsigned` the same as
`+0`, and `string` the same as `''`. `any` and `unknown` accept anything, because that is what
they mean. Unions of names (`string | number`) and the array suffix (`number[]`, `string[]`)
work. Other TypeScript forms do not: generics such as `Record<string, number>`,
`Array<number>` or `Promise<T>` are syntax errors, as are `any[]` and `unknown[]`, and `Date`
is not a type name TJS knows. The full list is in [Type names](/TJS-SYNTAX/#type-names).

A name TJS cannot resolve does not stop the file. The parameter accepts anything, and
`tjs check` warns, roughly:

```text
⚠ 'x: Foo' could not be resolved to a runtime type, so it is unchecked (best effort). For
  real runtime safety give an example (x: 3), a sound type (x: number), or a predicate:
    Type Foo { predicate(v) { return typeof v === 'object' && v !== null } }
```

The last line suggests a `Type` with a predicate, a form taught in
[Declarations](/declarations/). A name you declared yourself with `Type` resolves, of course;
that is the subject of [Naming a shape](#naming-a-shape) below.

### Objects

An object example is a shape. Every member it shows is required and checked by its own
example, and a value may carry members the example does not mention:

```tjs
function label(item: { name: 'box', size: { w: 0, h: 0 } }) {
  return `${item.name} ${item.size.w}x${item.size.h}`
}

console.log(label({ name: 'crate', size: { w: 3, h: 4 } }))              // crate 3x4
console.log(label({ name: 'crate', size: { w: 3, h: 4 }, colour: 'red' })) // extras are fine
console.log(label({ name: 'crate' }).message)
// Expected object for '…label.item.size', got undefined
console.log(label({ name: 'crate', size: { w: 3.5, h: 4 } }).message)
// Expected integer for '…label.item.size.w', got number
```

The error names the exact member that failed. A shape says what must be there, not what
must not; TJS does not invent exact object types that TypeScript does not have. A type's
`strip` method (below) removes top-level keys its example does not name.

[Object Types](/object-types/) has more worked examples.

### Arrays

An array example gives the element type, and every element is checked. One sample element
is enough:

```tjs
function total(prices: [0.0]) { return prices.reduce((a, b) => a + b, 0) }
function count(xs: number[]) { return xs.length }   // rewritten to [0.0]
function tags(xs: ['', 0]) { return xs.length }      // each element: a string or an integer
function rows(grid: [[0]]) { return grid.length }    // an array of arrays of integers
function anyList(xs: []) { return xs.length }        // any array at all

console.log(total([9.99, 5]))                    // 14.99
console.log(total([]))                           // 0: an empty array has nothing to fail
console.log(total([1, '2']).message)
// Expected number for '…total.prices[1]', got string
console.log(count([1.5, 2]))                     // 2
console.log(tags([1, 'a', 2, 'b']))              // 4: any order, any length
console.log(isMonadicError(tags([true])))        // true
console.log(isMonadicError(rows([[1], [2.5]])))  // true: the inner elements are checked
console.log(anyList([1, 'a', null]))             // 3
console.log(isMonadicError(anyList('abc')))      // true: it must still be an array
```

`number[]` is the TypeScript spelling, kept so pasted code works; it means `[0.0]`, any
numbers, and `int[]` means `[0]`. An empty example `[]` checks only that the value is an
array.

A mixed example such as `['', 0]` is **not a tuple**: it does not mean "a string, then an
integer". It means every element is one of those types. There is no example for a tuple; to
require one, declare a `Type` with a predicate that checks the length and each position.
[Array Types](/array-types/) covers rest parameters and more.

### Unions, optional and nullable values

`|` combines examples. What it means depends on what it combines:

- a union is a **closed set** only when every member is a literal of the same type:
  `'S' | 'M' | 'L'` accepts those three strings and nothing else, and `0 | 1` only 0 and 1;
- otherwise it is a **union of types**: `0 | ''` accepts any integer or any string, because
  a set needs every member to be the same type;
- `| undefined` makes a member **optional**, and `| null` makes it **nullable**.

```tjs
function order(item: {
  size: 'S' | 'M' | 'L',
  qty: 0 | '',
  note: '' | undefined,
  coupon: 0 | null,
}) {
  return item.size
}

console.log(order({ size: 'M', qty: 2, coupon: null }))         // M: note may be absent
console.log(order({ size: 'L', qty: 'two', note: 'gift', coupon: 7 }))  // L
console.log(isMonadicError(order({ size: 'XL', qty: 2, coupon: null })))   // true
console.log(isMonadicError(order({ size: 'M', qty: 2 })))                  // true: coupon is required
console.log(isMonadicError(order({ size: 'M', qty: 2, coupon: null, note: null }))) // true
```

`coupon: 0 | null` must be present, but may be `null`. `note: '' | undefined` may be left
out, but `null` is not `undefined`, so `note: null` is refused. Set membership compares values
with TJS's `==` ([Equality](/equality/)), so the source spelling of a number does not survive
into a set: `0 | 1` and `+0 | +1` are the same set.

A single literal is not a set. `'S'` on its own means "any string", like every string
example. To accept exactly one value, write a `Type` with a predicate
([Declarations](/declarations/)).

To combine a closed set with another type, name the set first. `Size | 0` accepts `'S'`,
`'M'`, `'L'` or any integer:

```tjs
Type Size = 'S' | 'M' | 'L'

function pick(x: Size | 0) { return x }

console.log(pick('M'), pick(12))           // M 12
console.log(isMonadicError(pick('XL')))    // true
console.log(isMonadicError(pick(1.5)))     // true
```

Written inline, as `'S' | 'M' | 0`, a mixed union currently means different things depending
on the order of its members (`0 | 'S' | 'M'` accepts any string), so do not rely on it.

`| undefined` works on a parameter too: `function f(x: '' | undefined)` can be called as
`f()`. A parameter can also be made optional with a default, `name = 'world'`, which TJS
spells `name?: ''` as well. Unlike TypeScript's `?`, that does not leave `name` undefined: it
defaults it to the example, so `name?: ''` means the same as `name = ''`.
[Dictionary Defaults](/defaults/) has the rules for defaults.

## Naming a shape

Writing `{ x: 0.0, y: 0.0 }` in five signatures works until one copy changes. A `Type` gives
the example a name, and a declared name can stand wherever an example can:

```tjs
Type Point {
  description: 'a point on the plane'
  example: { x: 0.0, y: 0.0 }
}

function dist(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

console.log(dist({ x: 0, y: 0 }, { x: 3, y: 4 }))         // 5
console.log(isMonadicError(dist({ x: 0 }, { x: 3, y: 4 }))) // true
console.log(Point({ x: 1, y: 2 }), Point({ x: 1 }))       // true false
```

Note the difference in the last line. A **type called on a value returns a boolean**: `true`
or `false`, nothing else. A **function with a typed parameter returns an error value** when
the argument fails, as `dist` does.

[Declarations](/declarations/) teaches the block form, predicates and the other declarations.
What it leaves out is the one-line alias, for when a type is only an example:

```tjs
Type Price = 0.0
Type Quantity 'how many, never negative' = +0
Type Nickname = '' | undefined
Type Size = 'S' | 'M' | 'L'

console.log(Price(9.99), Price('9.99'))     // true false
console.log(Quantity(3), Quantity(-1))      // true false
console.log(Quantity.description)           // how many, never negative
console.log(Nickname(undefined), Nickname(7)) // true false
console.log(Size('M'), Size('XL'))          // true false
```

`Type Name = example` is the one-liner to use. An optional string after the name is the
description. The value after `=` can be anything an example can be, unions included. (Without
the `=`, a string after the name is the example, not a description; the
[reference](/TJS-SYNTAX/#declarations) has that older form.)

## Types that refer to types

A shape is often made of other shapes. A falling piece in a game is a list of cells, and a
cell is a row and a column. Write the inner type's name inside the outer type's example:

```tjs
Type Piece {
  description: 'a falling piece: the cells it covers'
  example: { colour: 'purple', cells: [Cell] }
}

Type Cell {
  description: 'a row and a column on the board'
  example: { row: 0, column: 0 }
}

console.log(Piece({ colour: 'cyan', cells: [{ row: 0, column: 1 }, { row: 1, column: 1 }] }))
// true
console.log(Piece({ colour: 'cyan', cells: [{ row: 0, column: 'b' }] }))
// false: every cell is checked against Cell
console.log(Piece({ colour: 'cyan', cells: [] }))
// true: an empty list has no cells to fail

function cellCount(p: Piece) { return p.cells.length }
console.log(cellCount({ colour: 'red', cells: [{ row: 2, column: 3 }] }))  // 1
```

`Piece` mentions `Cell` before `Cell` is declared, and that is fine. A bare name in an
example is a **lazy reference**: it is looked up when a value is checked, not when the type is
declared, so declaration order does not matter.

A reference works inside a parameter's example too:

```tjs
Type Cell { example: { row: 0, column: 0 } }

function place(p: { at: Cell }) { return p.at.row }
function count(cells: [Cell]) { return cells.length }

console.log(place({ at: { row: 3, column: 4 } }))                 // 3
console.log(isMonadicError(place({ at: { row: 3, column: 'x' } }))) // true
console.log(isMonadicError(count([{ row: 1 }])))                   // true: column is missing
```

### `Cell.example` means the type

Many people reach for `Cell.example`, meaning "an example of a cell". Inside an example, TJS
reads it that way: `X.example` is a reference to the type `X`. In ordinary code, outside an
example, `Cell.example` is `undefined`; a type has no property by that name. (The `example:`
line in a declaration is where you write the example; it does not become a property.)

`Cell.default` is different: it is the example _value_, a plain `{ row: 0, column: 0 }`. As
an example it describes the same shape, but it carries only the shape. Anything else the
type knows, such as a predicate, is lost. Here `Cell` also requires the cell to be on a
10-by-20 board:

```tjs
Type Cell {
  example: { row: 0, column: 0 }
  predicate(c) { return c.row < 20 && c.column < 10 }
}

Type ByType { example: { at: Cell.example } }
Type ByValue { example: { at: Cell.default } }

const offBoard = { at: { row: 50, column: 0 } }
console.log(ByType(offBoard))   // false: Cell's predicate ran
console.log(ByValue(offBoard))  // true: only the shape was checked
console.log(ByValue({ at: { row: 'x', column: 0 } }))  // false: the shape still counts
```

Refer to the type (`Cell` or `Cell.example`) when you mean the type.

### References and expressions in a type's example

An example in a `Type` can hold more than literals. The rule:

- **Names and dotted paths are references**, read each time a value is checked: `Cell`,
  `Cell.example`, `shapes.Cell`, `Math.PI`. If what they read is a type, the value is checked
  against that type. Otherwise the value read becomes the example.
- **Anything else is an expression**, evaluated once, when the type is declared: a call such
  as `Math.round(1.0)`, or a computed member such as `sizes[0]`. Its result becomes the
  example.

Either way, when the example comes from a value rather than from text, the source rules no
longer apply, because there is no source left to read. `Math.PI` is a fractional number, so
it means "any number". `Math.round(1.0)` returns `1`, so it means "integer", whatever the
`.0` inside the call suggests:

```tjs
Type Cell { example: { row: 0, column: 0 } }
const shapes = { Cell }

Type Mixed {
  example: {
    at: shapes.Cell,          // a reference to a type
    angle: Math.PI,           // a reference to a number: any number
    n: Math.round(1.0),       // a call, evaluated: 1, an integer
  }
}

const ok = { at: { row: 1, column: 2 }, angle: 0.5, n: 2 }
console.log(Mixed(ok))                                    // true
console.log(Mixed({ ...ok, at: { row: 'x', column: 0 } })) // false: checked against shapes.Cell
console.log(Mixed({ ...ok, n: 1.5 }))                      // false: the example is the value 1
```

A **parameter's** example is narrower: it must be a literal, a type name, a declared type, or
an object or array built from those. A call or a dotted path in a parameter example is not
evaluated; see the gotchas below for what happens instead. Put the expression in a `Type` and
use its name in the signature.

### A reference that reads `undefined` is unchecked

A misspelt name does not crash the module, because TJS accepts any JavaScript and an
unreadable example has to degrade somehow. The member goes **unchecked**, and the runtime
records a warning.

The runtime is available as `globalThis.__tjs`. Its `records()` method returns the flight
recorder: a list of everything the runtime noticed while the page ran, such as type errors
and warnings ([Runtime Configuration](/runtime-configuration/) covers it). Filter it for the
warning about this type:

```tjs
Type Board { example: { cells: [Celll] } }   // a typo: there is no Celll

console.log(Board({ cells: ['anything'] }))  // true: the elements are unchecked

const warnings = globalThis.__tjs
  .records({ severity: 'warning' })
  .filter((r) => r.message.includes('Celll'))
console.log(warnings[0].message)
// A Type example names 'Celll', which is not defined (or is undefined) where the type is
// checked, so that member is UNCHECKED.
```

It is a warning, not an error, so nothing fails loudly. Check the recorder (or your tests)
when a type seems to accept too much.

`tjs check` does not report this misspelling, though it does warn about an unresolved name in
a parameter. The difference is when the name is read. A parameter's type is resolved while
the file transpiles, so the checker knows at once that `Foo` means nothing. A reference in a
`Type` example is read only when a value is checked, after the program has run; `Celll`
could be defined by then, by code later in the file or by another module, so the checker
cannot know in advance that it will be missing.

### Recursive types

Because references are lazy, a type can mention itself. A tree is a value and a list of
trees:

```tjs
Type Tree {
  example: { value: 0, kids: [Tree] }
}

const ok = { value: 1, kids: [{ value: 2, kids: [] }, { value: 3, kids: [{ value: 4, kids: [] }] }] }
const bad = { value: 1, kids: [{ value: 2, kids: [{ value: 'x', kids: [] }] }] }

console.log(Tree(ok))   // true
console.log(Tree(bad))  // false: the check reaches the grandchild
```

What TJS refuses is a type made of nothing but itself. `Type T = T` would accept every value,
so it is a syntax error: "`T` is defined only in terms of itself".

For a larger example of types referring to one another, see the [Tetris](/tetris/) capstone
in Part I, whose pieces, cells and board are a small family of shapes.

## What a type gives you besides the check

A declared type is a value, and the facts in its declaration are properties you can read.

```tjs
Type Order {
  description: 'one line of an order'
  example: {
    sku: 'A-1',
    qty: +0,
    price: 0.0,
    size: 'S' | 'M' | 'L',
    note: '' | undefined,
  }
}

console.log(Order.check === Order)  // true: one function under two names
console.log(Order.description)      // one line of an order
console.log(Order.default)
// { sku: 'A-1', qty: 0, price: 0, size: 'S', note: '' }
```

- **`.check`** is the type itself under another name. It exists for code that expects a
  validator object with a `check(value)` method, such as a table of validators keyed by field
  name, or code written against the `Type` objects that the `tjs-lang` library builds.
- **`.description`** is the description you wrote, or the type's name if you wrote none.
- **`.default`** is the example as a value. A union contributes its first member, so `size`
  is `'S'`. One caution: for a type whose example refers to other types, `.default` is wrong
  at the moment. It holds the referenced type object instead of that type's default value,
  so do not rely on `.default` for such types yet.

### `toJSONSchema()`

Tools that have never heard of TJS (an API gateway, a form library, a model's structured
output) understand JSON Schema. Every type writes itself out as one, and the source rules
survive into it:

```tjs
Type Order {
  example: {
    sku: 'A-1',
    qty: +0,
    price: 0.0,
    size: 'S' | 'M' | 'L',
    note: '' | undefined,
  }
}

console.log(JSON.stringify(Order.toJSONSchema(), null, 2))
```

The output, abridged:

```text
{
  "type": "object",
  "properties": {
    "sku":   { "type": "string" },
    "qty":   { "type": "integer", "minimum": 0 },
    "price": { "type": "number" },
    "size":  { "enum": ["S", "M", "L"] },
    "note":  { "type": "string" }
  },
  "required": ["sku", "qty", "price", "size"],
  "additionalProperties": false
}
```

`+0` became an integer with `minimum: 0`, `0.0` became `number`, the closed set became an
`enum`, and the optional `note` was left out of `required`. The last line,
`additionalProperties: false`, disagrees with the check; see the gotchas below.

### `strip(value)`

`strip` returns a copy without the **top-level** keys the example does not name. It does not
reach into nested objects, and it does not validate:

```tjs
Type Account {
  example: { name: '', profile: { bio: '' } }
}

const body = { name: 'Ada', isAdmin: true, profile: { bio: 'hi', password: 'x' } }
console.log(Account.strip(body))
// { name: 'Ada', profile: { bio: 'hi', password: 'x' } }

const partial = Account.strip({ isAdmin: true })
console.log(partial, Account(partial))  // {} false
```

`isAdmin` went, but `password`, inside the nested `profile`, stayed. And a value missing
`name` comes out still missing it, so check before or after stripping when the shape matters.

Because `strip` is shallow, it is not on its own a way to keep secrets out of a response. To
strip a nested object, give it a type of its own and strip each level:

```tjs
Type Profile { example: { bio: '' } }
Type Account { example: { name: '', profile: Profile } }

const body = { name: 'Ada', isAdmin: true, profile: { bio: 'hi', password: 'x' } }
const clean = { ...Account.strip(body), profile: Profile.strip(body.profile) }

console.log(clean)           // { name: 'Ada', profile: { bio: 'hi' } }
console.log(Account(clean))  // true
```

### A function's signature as data

Functions keep their signatures too. Every TJS function carries a `__tjs` property, a
description of its parameters and return type built from the same examples. (This is the
function's own metadata, unrelated to the runtime at `globalThis.__tjs` used above.)

```tjs
Type Point { example: { x: 0.0, y: 0.0 } }

function moveBy(p: Point, dx: 0.0, dy = 0.0) {
  return { x: p.x + dx, y: p.y + dy }
}

console.log(JSON.stringify(moveBy.__tjs.params.dx))
// {"type":{"kind":"number"},"required":true,"default":null}
console.log(JSON.stringify(moveBy.__tjs.params.dy))
// {"type":{"kind":"number"},"required":false,"default":0}
console.log(JSON.stringify(moveBy.__tjs.params.p.type))
// {"kind":"declared","typeName":"Point"}
```

The toolchain turns that into JSON Schema for a whole function with
`functionMetaToJSONSchema`, which is exported by `tjs-lang/lang`. It is a library import, so
this is code for a module of your own rather than a live example:

```javascript
import { functionMetaToJSONSchema } from 'tjs-lang/lang'

const { input } = functionMetaToJSONSchema(moveBy.__tjs)
// { type: 'object',
//   properties: { p: {}, dx: { type: 'number' }, dy: { type: 'number' } },
//   required: ['p', 'dx'] }
```

Notice `p: {}`. A parameter written as a declared name is exported as "anything", because
the metadata records only the name `Point`, not its shape. If the schema is going to a tool
that enforces it, write that parameter's shape inline or merge in `Point.toJSONSchema()`
yourself. [Types at Runtime](/schema-validation/) walks through every kind of descriptor
`__tjs` can hold.

## Gotchas

**An example is a value, so pick a representative one.** `email: 'user@example.com'` makes
the parameter a string. It does not make it an email address; `'hello'` passes. When a rule
matters beyond the type, declare a `Type` with a predicate. [Declarations](/declarations/)
builds an `Email` type that way, and [Predicate Types](/predicate-types/) goes further.

**The exported schema rejects extra keys the check accepts.** `Order({ ...line, gift: true })`
is `true`, but `Order.toJSONSchema()` says `additionalProperties: false`, on nested objects
too, so a JSON Schema validator given that schema refuses the same value. Types declared in a
`.tjs` file currently write `additionalProperties: false`. Before handing the schema to a
strict validator, set `additionalProperties` to `true` on every object in it;
[Types at Runtime](/schema-validation/) shows a function that does it.

**A declared name supplies no example, so there is no signature test.** The signature test
calls the function with its parameter examples, and `Point` is a type, not an example value.
So `function g(p: Point): 0 { return 1 }` transpiles even though `1` is not `0`: the return
example is never compared with anything. Write a test block instead; see [Testing](/testing/).

**A call or dotted path in a parameter example is silently unchecked.** Written in a
parameter, `n: Math.round(1.0)` or `n: limits.max` is not evaluated, and today the parameter
accepts anything without a warning (`tjs check` reports it as `any`). Put the expression in a
`Type` and use the type's name.

**A typed default is not a dictionary.** A plain object default, `p = { x: 1, y: 2 }`, is a
_dictionary default_: a partial argument is merged with it, so missing members are filled in.
The TypeScript-style typed default, `p: Point = { x: 1, y: 2 }`, is different. It makes `p`
optional, but a value passed for it must be a whole `Point`; nothing is filled in. Both are
taught in [Dictionary Defaults](/defaults/).

**Choosing an overload by type is a different feature.** Several functions with one name,
picked by their arguments' types, are covered in [Classes and Dispatch](/classes-and-dispatch/).
