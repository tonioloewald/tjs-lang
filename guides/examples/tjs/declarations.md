<!--{"section": "tjs", "order": 3, "parent": "the-tjs-language.md"}-->
<!-- TODO review -->

# Declarations

Types that survive to runtime: `Type`, `Enum`, `Union`, `Generic`, `FunctionPredicate`.

TypeScript's types vanish when the code runs. TJS declarations do not. Each one is a
**value**: a function you call on a candidate, and it answers `true` or `false`. These are
TJS keywords, not JavaScript. They work in `.tjs` files, and the transpiler turns each one
into an ordinary JavaScript value.

| Declaration         | Looks like                                  | Calling it asks                    |
| ------------------- | ------------------------------------------- | ---------------------------------- |
| `Type`              | `Type Name 'Alice'`                         | "is this shaped like the example?" |
| `Enum`              | `Enum Status 'status' { Done = 'done' }`    | "is this one of the members?"      |
| `Union`             | `Union Dir 'a direction' 'n' \| 's'`        | "is this one of these values?"     |
| `Generic`           | `Generic NonEmpty<T> { … }`                 | builds a type for each `T` you give it |
| `FunctionPredicate` | `FunctionPredicate F { params: … returns: … }` | "is this a function?"           |

The last row is different from the others. At runtime a `FunctionPredicate` in a `.tjs` file
only checks that the value is a function. Its real job is to write down what parameters the
function takes and what it returns.

Each section below declares what it uses, so every example is a complete program you can
edit and run. The examples state their claims as tests: `test 'name' { … }` holds checks,
and `expect(a).toBe(b)` says `a` should be `b` (`.toEqual` compares arrays and objects by
their contents). The tests run when the example runs. [Checking Your Work](/checking-your-work/)
teaches them from the start.

## `Type` — from an example

The simplest declaration is a name and an example. The example is not a type annotation.
`'Alice'` is one string the type accepts, and TJS works out the shape from it: `Name`
accepts any string, so `'Bob'` passes, and a number does not.

```tjs:inline {"view": "code"}
Type Name 'Alice'

test 'a Type is callable, and check is the same function' {
  expect(Name('Bob')).toBe(true)
  expect(Name(42)).toBe(false)
  expect(Name.check === Name).toBe(true)
}
```

A type also has a `check` property. It is the same function, not a second one, so
`Name.check(x)` and `Name(x)` always agree. It exists for code that expects a validator
object with a `check` method.

That was the one-line form. The block form, `Type User { … }`, takes the example under
`example:` and can add a `description:`. An object example declares a shape:

```tjs:inline {"view": "code"}
Type User {
  description: 'a user'
  example: { name: '', age: 0 }
}

test 'an object example checks the shape' {
  expect(User({ name: 'Ada', age: 36 })).toBe(true)
  expect(User({ name: 'Ada' })).toBe(false)
  expect(User({ name: 'Ada', age: 36.5 })).toBe(false)
  expect(User({ name: 'Ada', age: 36, admin: true })).toBe(true)
  expect(User.description).toBe('a user')
}
```

Every member of the example is required, so a user with no `age` fails. Extra keys are
allowed. And `age: 0` means an integer, so `36.5` fails; the next section says why.

## What an example can say

The transpiler reads an example as _source_, before it is evaluated, with the same rules as
a [function parameter's example](/TJS-SYNTAX/). So `0` means an integer and `0.0` a float
(even though `0.0 === 0` as a value), `+0` a non-negative integer, `'' | undefined` an
optional member, and an all-literal union such as `'fast' | 'slow'` a closed set of values:

```tjs:inline {"view": "code"}
Type Order {
  example: {
    price: 0.0,
    qty: +0,
    note: '' | undefined,
    mode: 'fast' | 'slow',
  }
}

test 'an example is read as source, not just as a value' {
  expect(Order({ price: 9.99, qty: 2, mode: 'fast' })).toBe(true)
  expect(Order({ price: 9.99, qty: -1, mode: 'fast' })).toBe(false)
  expect(Order({ price: 9.99, qty: 2, mode: 'medium' })).toBe(false)
  expect(Order({ price: 9.99, qty: 2, mode: 'slow', note: 'gift' })).toBe(true)
}
```

A float example accepts integers too, since every integer is a number: `price: 10` passes.

Only the value positions are read this way: object values, array elements and union
members. A function call inside an example, such as `Math.round(1.0)`, is run, and its
result (`1`) becomes the example. The `.0` the source wrote is gone, so that slot means an
integer.

## Predicates — when an example is not enough

An example says what a value looks like, not what it must satisfy. A `predicate` adds the
rule. In the block form, `predicate { … }`, the type's own name stands for the value being
checked, so `return Even % 2 === 0` reads as "Even is a value where value % 2 is 0". The
body needs `return`, as a function body does:

```tjs:inline {"view": "code"}
Type Even {
  example: 2
  predicate { return Even % 2 === 0 }
}

Type Positive {
  example: 1
  predicate { return Positive > 0 }
}

test 'a predicate adds the rule the example cannot state' {
  expect(Even(4)).toBe(true)
  expect(Even(3)).toBe(false)
  expect(Positive(-1)).toBe(false)
}

test 'the example is still checked' {
  expect(Even('x')).toBe(false)
  expect(Positive(1.5)).toBe(false)
}
```

The predicate is checked in addition to the example, not instead of it. `Positive(1.5)` is
greater than zero, but the example `1` is an integer, so it fails.

The function form, `predicate(x) { … }`, names the value explicitly. The two forms mean the
same thing; use the function form when the body reads better with a short name. Because the
example `'user@example.com'` already rules out anything that is not a string, the predicate
can use string methods straight away:

```tjs:inline {"view": "code"}
Type Email {
  description: 'an email address'
  example: 'user@example.com'
  predicate(x) {
    if (x.includes(' ')) return false
    const at = x.indexOf('@')
    return at > 0 && at === x.lastIndexOf('@') && x.lastIndexOf('.') > at + 1 && !x.endsWith('.')
  }
}

test 'the function form takes the value as a parameter' {
  expect(Email('ada@example.com')).toBe(true)
  expect(Email('not an address')).toBe(false)
  expect(Email(42)).toBe(false)
}
```

Keep predicates pure (no side effects, the same answer for the same input) and synchronous,
and avoid regex literals. Then TJS compiles the predicate to a guard with a step budget, so
no input can make validation hang. A predicate that breaks those rules still works, as a
plain function, and `tjs check` warns that it is not bounded.

Why not regex: the guard is emitted as self-contained JavaScript, so a regex in it would run
on the host's own regex engine, which can take a very long time on some inputs (`/a*a*c/` on
a long string of `a`s). `Email` uses string methods for that reason. The library route,
`compilePredicate` and the `$predicate` JSON-Schema keyword, runs regexes on TJS's own
bounded engine instead; see [Predicate Types](/predicate-types/).

## A declaration serialises to its facts

Types are values, so they end up inside other values: a form description, a config object,
an API's schema. When that data is sent as JSON, `JSON.stringify` would normally drop a
function without a word. A TJS type does not vanish: it serialises to its facts, and the
code that checks values is left out.

```tjs:inline {"view": "code"}
Type User {
  description: 'a user'
  example: { name: '', age: 0 }
}

test 'a type serialises to its facts, not its code' {
  const facts = JSON.parse(JSON.stringify({ field: User }))
  expect(facts.field.description).toBe('a user')
  expect(facts.field.default).toEqual({ name: '', age: 0 })
  expect('check' in facts.field).toBe(false)
}
```

`JSON.stringify(User)` gives the description, the example (as `default`), and two internal
fields whose names start with `__`.

## `Enum` — a named set

An `Enum` names its members, so the set can be referred to by name, listed, and looked up
in both directions. That is also what makes it useful to an editor: the allowed values are
right there to offer as completions.

The string after the name, `'request status'`, is the description, and it is required. Each
member is a name with `= value`; a member written with no value gets a number, counting up
from `0`.

```tjs:inline {"view": "code"}
Enum Status 'request status' {
  Pending = 'pending'
  Active = 'active'
  Done = 'done'
}

test 'an Enum carries its whole set of values' {
  expect(Status('active')).toBe(true)
  expect(Status('lost')).toBe(false)
  expect(Status.members.Done).toBe('done')
  expect(Status.names['pending']).toBe('Pending')
  expect(Status.values).toEqual(['pending', 'active', 'done'])
}
```

`members` maps each name to its value, `names` maps each value back to its name, and
`values` lists the values in order.

## `Union` — an anonymous set

A `Union` is a closed set of literal values with no names to look up. In
`Union Direction 'cardinal' 'north' | …`, the first string, `'cardinal'`, is the
description; the members follow it, separated by `|`.

Use an `Enum` when the set wants names and reverse lookup. Use a `Union`, or a union written
straight into a parameter (`m: 'on' | 'off'`), when it does not.

```tjs:inline {"view": "code"}
Union Direction 'cardinal' 'north' | 'south' | 'east' | 'west'

test 'a Union accepts exactly its values' {
  expect(Direction('north')).toBe(true)
  expect(Direction('northeast')).toBe(false)
  expect(Direction('cardinal')).toBe(false)
}
```

## Using a declaration in a signature

A declared name can stand wherever an example can. Write it after the colon and the
parameter is checked against the declaration, so the shape is stated once and every
function that takes it agrees.

A call that does not match does not run the body. It returns a `MonadicError`, a value that
describes what went wrong, instead of throwing. `isMonadicError(x)` tells you whether `x` is
one, and like `test` and `expect` it is available in every `.tjs` file without an import.
[Error Handling](/error-handling/) covers these values.

```tjs:inline {"view": "code"}
Type Point {
  example: { x: 0.0, y: 0.0 }
}

function dist(a: Point, b: Point): 0.0 {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

test 'a declared type checks a parameter' {
  expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  expect(isMonadicError(dist({ x: 0 }, { x: 3, y: 4 }))).toBe(true)
}
```

The integer points pass, because a float example accepts integers. The return example `0.0`
says the result is a float, which is what `Math.hypot` returns.

A return example is usually also a test: TJS calls the function with its parameters'
examples and compares the answer (see the [syntax reference](/TJS-SYNTAX/)). A parameter
written as a declared name supplies no example value, so `dist` gets no such test. The
`test` block is what checks its answers.

## Families of types: `Type<T>` and `Generic`

Some types are families: a box of numbers, a box of strings. TJS has two ways to declare
one, and the choice is about how much the example can say.

**`Type<T>`, when the example says where `T` goes.** `{ value: T }` checks `T` at `value`;
`[T]` checks every element. No predicate is needed. Apply it in a signature with angle
brackets. Inside the brackets you write a type name: `int`, `number`, `string`, `boolean`
and the others the [syntax reference](/TJS-SYNTAX/) lists.

```tjs:inline {"view": "code"}
Type Box<T> {
  example: { value: T }
}

Type List<T> {
  example: [T]
}

function unbox(b: Box<int>) {
  return b.value
}

function count(items: List<int>) {
  return items.length
}

test 'a parameterised Type applied in a signature' {
  expect(unbox({ value: 1 })).toBe(1)
  expect(isMonadicError(unbox({ value: 1.5 }))).toBe(true)
}

test '[T] checks every element, and an empty list has none to fail' {
  expect(count([1, 2])).toBe(2)
  expect(isMonadicError(count([1, 1.5]))).toBe(true)
  expect(count([])).toBe(0)
}
```

**`Generic`, when membership needs a rule.** An example cannot say "at least one element":
as the last test shows, `[T]` accepts an empty array. A `Generic` needs no example, only a
predicate. The predicate receives the value as `x` and the type argument as `T`, and `T` is
a function: `T(v)` checks one element.

Use the `Generic` in a signature with a type name, as with `Type<T>`. Or call it directly
with an _example_ of the type argument, `NonEmpty('')` for strings, and it returns a type:

```tjs:inline {"view": "code"}
Generic NonEmpty<T> {
  description: 'an array with at least one element, every element a T'
  predicate(x, T) {
    return Array.isArray(x) && x.length > 0 && x.every((v) => T(v))
  }
}

function first(names: NonEmpty<string>) {
  return names[0]
}

test 'a Generic instance is itself a type' {
  const Names = NonEmpty('')
  expect(Names(['Ada'])).toBe(true)
  expect(Names([])).toBe(false)
  expect(Names([1])).toBe(false)
}

test 'a Generic applied in a signature' {
  expect(first(['Ada', 'Grace'])).toBe('Ada')
  expect(isMonadicError(first([]))).toBe(true)
}
```

Reach for `Type<T>` first. It is shorter, its example documents the shape, and there is no
predicate to get wrong. Move to `Generic` when the rule is something an example cannot
show.

## `FunctionPredicate` — a function's type

`FunctionPredicate` declares a **signature**: the parameters a function takes, in order, and
what it returns. In a `.tjs` file the runtime check is only "is this a function?", because
whether a function keeps its promise is something you learn by calling it. The declaration's
value is the written-down contract, which tools, docs and `.d.ts` output can read.

```tjs:inline {"view": "code"}
FunctionPredicate Formatter {
  params: { input: '' }
  returns: ''
}

test 'a FunctionPredicate checks callability and carries the contract' {
  expect(Formatter((s) => s.toUpperCase())).toBe(true)
  expect(Formatter('not a function')).toBe(false)
  expect(Object.keys(Formatter.params)).toEqual(['input'])
}
```

A `FunctionPredicate` cannot yet stand as a parameter's type. Write `f: Formatter` in a
signature and `tjs check` warns that `Formatter` could not be resolved to a runtime type,
and the parameter goes unchecked.

## Ready-made types

You do not have to declare every common type yourself. The `tjs-lang` package exports
types for common strings and numbers, among them `TEmail`, `TUrl`, `TUuid`, `TPositiveInt`
and `TNonEmptyString`, and the `Timestamp` and `LegalDate` modules for working with dates.
(TJS refuses `new Date()`, because a `Date` object is mutable and depends on the time zone;
`LegacyDate(x)` is the named escape when you need one.) They are imports, not part of the
language: a `.tjs` file does not see them until it imports them.

This snippet is not live, because the page cannot run an import:

```javascript
import { TEmail, TPositiveInt } from 'tjs-lang'

TEmail('ada@example.com') // true
TPositiveInt(0) // '0 is not positive'
```

Note the second answer. These types answer `true`, or a string saying why the value failed,
where a type declared in a `.tjs` file answers `false`. A reason string is truthy, so test
the result with `=== true`, never with `if (TPositiveInt(n))`.

[Built-in Types and Dates](/built-in-types/) covers all of them.

## Declared in the file, or imported from the library

The declarations above, written in a `.tjs` file, are built by a small runtime the
transpiler puts into that file. The same constructors (`Type`, `FunctionPredicate` and the
rest) can also be imported from `tjs-lang`. Two practical differences:

- If your code tests `x instanceof Predicate` or reads a type's `.example`, use the library
  constructors. Types declared in a `.tjs` file are not `Predicate` instances, and they keep
  their example under an internal name.
- The library's `FunctionPredicate` checks more. Given a TJS function, it compares the
  function's declared parameters with the signature, and answers with a reason such as
  `'expected 1 params, got 2'` instead of `true`.

A `Type` declared from an example gives the same answers either way. [Type Identity](/type-identity/)
maps every case.
