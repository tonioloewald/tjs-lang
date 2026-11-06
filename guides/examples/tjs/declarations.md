<!--{"section": "tjs", "order": 3, "parent": "the-tjs-language.md"}-->
<!-- TODO review -->

# Declarations

Types that survive to runtime: `Type`, `Enum`, `Union`, `Generic`, `FunctionPredicate`.

TypeScript's types vanish when the code runs. TJS declarations do not: each one is a
**value**, and the value is a _predicate_, a function you call with a candidate that
answers whether it belongs. `check` is that same function, not a second implementation, and
the predicate carries its facts with it: a `name`, a `description`, the example it was
declared from, and, for an `Enum`, the whole domain.

| Declaration         | Declares                     | The predicate answers                             |
| ------------------- | ---------------------------- | ------------------------------------------------- |
| `Type`              | a shape, from an example     | "is this shaped like the example?"                |
| `Enum`              | a named set of values        | "is this one of the members?"                     |
| `Union`             | an anonymous set of literals | "is this one of these?"                           |
| `Generic`           | a family of types            | returns a predicate per type argument             |
| `FunctionPredicate` | a function _signature_       | "is this a function?", and documents the contract |

The last row is the one to read twice: a `FunctionPredicate` describes a **function's
type**. It is not a predicate _over values_ in the sense the rest of this chapter uses.

Each section below declares what it uses, so every example is a complete program you can
edit and run. The `test` blocks state what the declaration does, and they run when the
example runs.

## `Type` — from an example

The simplest declaration is a name and an example. The example is not a type annotation; it
is a _witness_, a value the type must accept, and TJS infers the shape from it.

```tjs:inline {"view": "code"}
Type Name 'Alice'

test 'a Type is callable, and check is the same function' {
  expect(Name('Bob')).toBe(true)
  expect(Name(42)).toBe(false)
  expect(Name.check === Name).toBe(true)
}
```

An object example declares a shape, and the block form gives the type a description:

```tjs:inline {"view": "code"}
Type User {
  description: 'a user'
  example: { name: '', age: 0 }
}

test 'an object example checks the shape' {
  expect(User({ name: 'Ada', age: 36 })).toBe(true)
  expect(User({ name: 'Ada' })).toBe(false)
  expect(User.description).toBe('a user')
}
```

## Predicates — when an example is not enough

An example says what a value looks like, not what it must satisfy. A `predicate` adds the
rule. In the block form, `predicate { … }`, the TYPE NAME stands for the value under test, so
it reads as a definition, and `return` is required, as in any JavaScript block:

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
```

The function form, `predicate(x) { … }`, names the value explicitly. The two forms mean the
same thing; use the function form when the body reads better with a short name:

```tjs:inline {"view": "code"}
Type Email {
  description: 'an email address'
  example: 'user@example.com'
  predicate(x) {
    if (typeof x !== 'string' || x.includes(' ')) return false
    const at = x.indexOf('@')
    return at > 0 && at === x.lastIndexOf('@') && x.lastIndexOf('.') > at + 1 && !x.endsWith('.')
  }
}

test 'the function form takes the value as a parameter' {
  expect(Email('ada@example.com')).toBe(true)
  expect(Email('not an address')).toBe(false)
}
```

A predicate that is pure and synchronous is **verified** when it is transpiled, and compiled
to a fuel-bounded guard, so a hostile input cannot hang validation; it fails instead. A
predicate that cannot be verified still works, as a plain function, and `tjs check` warns
that it is not fuel-bounded.

A regex literal makes a predicate in a `.tjs` file unverifiable. The verified guard is
emitted as self-contained JavaScript, and it cannot carry the VM's linear regex engine, so a
regex in it would run on the host's backtracking engine. A native match is one call that
fuel cannot see inside, and a pattern like `/a*a*c/` can stall on a long input. `Email`
above uses string methods for that reason, and is verified. The library paths are
different: `compilePredicate` and the `$predicate` JSON-Schema keyword run regex literals on
the linear engine, metered by fuel, so a regex there does not cost verification. See
[Predicate Types](/predicate-types/).

## A declaration serialises to its facts

Because a declaration is a function, `JSON.stringify` would normally drop it without a word.
It does not: a type serialises to its facts. The implementation is left out, and so is
anything else that is a function.

```tjs:inline {"view": "code"}
Type User {
  description: 'a user'
  example: { name: '', age: 0 }
}

test 'a type serialises to its facts, not its code' {
  const facts = JSON.parse(JSON.stringify({ field: User }))
  expect(facts.field.description).toBe('a user')
  expect('check' in facts.field).toBe(false)
}
```

## `Enum` — a named set

An `Enum` names its members, so the set can be referred to by name, enumerated, and
reverse-looked-up. That is also what makes it useful to an editor: the domain is right there
to offer as completions.

```tjs:inline {"view": "code"}
Enum Status 'request status' {
  Pending = 'pending'
  Active = 'active'
  Done = 'done'
}

test 'an Enum carries its whole domain' {
  expect(Status('active')).toBe(true)
  expect(Status('lost')).toBe(false)
  expect(Status.members.Done).toBe('done')
  expect(Status.names['pending']).toBe('Pending')
  expect(Status.values).toEqual(['pending', 'active', 'done'])
}
```

## `Union` — an anonymous set

A `Union` is a closed set of literals with no names to look up. Use an `Enum` when the set
wants a name, a description and reverse lookup; use a `Union`, or a literal union written
straight into a parameter (`m: 'on' | 'off'`), when it does not.

```tjs:inline {"view": "code"}
Union Direction 'cardinal' 'north' | 'south' | 'east' | 'west'

test 'a Union accepts exactly its literals' {
  expect(Direction('north')).toBe(true)
  expect(Direction('northeast')).toBe(false)
}
```

## Using a declaration in a signature

A declared name can stand wherever an example can. Write it after the colon and the
parameter is checked against the declaration, so the shape is stated once and every
function that takes it agrees. A call that does not match returns an error value instead of
running the body:

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

The return example `0.0` says the result is a float, which is what `Math.hypot` returns.
Write `: 0` and you would be promising an integer. A return example is normally also a
worked example, run when the file is transpiled, but that needs an example value for every
parameter, and a parameter written as a declared name does not supply one. So `dist` gets no
signature test; the `test` block is what checks its answers.

## Families of types: `Type<T>` and `Generic`

Some types are families: a box of numbers, a box of strings. TJS has two ways to declare
one, and the choice is about how much the example can say.

**`Type<T>`, when the example says where `T` goes.** `{ value: T }` checks `T` at `value`;
`[T]` checks every element. No predicate is needed. Apply it in a signature with angle
brackets, and a type name such as `int` becomes the check for that slot:

```tjs:inline {"view": "code"}
Type Box<T> {
  example: { value: T }
}

function unbox(b: Box<int>) {
  return b.value
}

test 'a parameterised Type applied in a signature' {
  expect(unbox({ value: 1 })).toBe(1)
  expect(isMonadicError(unbox({ value: 1.5 }))).toBe(true)
}
```

**`Generic`, when membership needs a rule.** An example cannot say "at least one element",
so `[T]` accepts an empty array. A `Generic` is a _factory_ with a predicate: the type
argument arrives in the predicate as a check, and you call it on the part it governs. Give
the factory an example of the type argument (`NonEmpty('')`) and it returns a predicate; or
use it in a signature, as with `Type<T>`:

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

test 'a Generic instance is itself a predicate' {
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

`FunctionPredicate` declares a **signature**: the parameters a function takes and what it
returns. At runtime the check is only "is this a function?", because whether a function
honours its signature is something you learn by calling it. The declaration's value is as a
documented contract that tools, docs and `.d.ts` output can read.

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

## What an example can say

A `Type` example is read by the transpiler as _source_ before it is evaluated, with the same
rules as a parameter. So `0.0` means a float (even though `0.0 === 0` as a value), `+0` a
non-negative integer, `'' | undefined` an optional member, and an all-literal union such as
`'fast' | 'slow'` a closed set:

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

Only type positions (object values, array elements, union members) are read this way. A
call inside an example, such as `f(1.0)`, is evaluated, and its result is the example, so
whatever the source said about it is lost.

## Ready-made types

You do not have to declare every common type yourself. The `tjs-lang` library exports
predicates for common strings and numbers, among them `TEmail`, `TUrl`, `TUuid`,
`TPositiveInt` and `TNonEmptyString`, and the `Timestamp` and `LegalDate` modules for dates
(raw `Date` is not allowed in `.tjs`). They are imports, not part of the language: a `.tjs`
file does not see them until it imports them.

```javascript
import { TEmail, TPositiveInt } from 'tjs-lang'

TEmail('ada@example.com') // true
TPositiveInt(0) // '0 is not positive'
```

Note the second answer. These types answer `true`, or a string saying why the value
failed, where a type declared in a `.tjs` file answers `false`. A reason string is truthy,
so test the result with `=== true`, never with `if (TPositiveInt(n))`.

A chapter on the built-in types is planned.

## One thing that differs by where the type comes from

Types declared in a `.tjs` file, like every one above, come from the file's own small
runtime. The same constructors imported from the `tjs-lang` library produce values that are
additionally `instanceof Predicate` and name the witness `example` (the inline runtime calls
it `__ex`). A type declared from an example gives the same verdicts either way; see
[Type Identity](/type-identity/) for the full map.
