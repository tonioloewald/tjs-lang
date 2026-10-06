<!--{"section": "tjs", "order": 3, "parent": "the-tjs-language.md"}-->

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

Each section below declares what it uses, so every block is a complete program. The `test`
blocks state what the declaration does; they run when the file is transpiled.

## `Type` — from an example

The simplest declaration is a name and an example. The example is not a type annotation; it
is a _witness_, a value the type must accept, and TJS infers the shape from it.

```tjs:static
Type Name 'Alice'

test 'a Type is callable, and check is the same function' {
  expect(Name('Bob')).toBe(true)
  expect(Name(42)).toBe(false)
  expect(Name.check === Name).toBe(true)
}
```

An object example declares a shape, and the block form gives the type a description:

```tjs:static
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

```tjs:static
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

The function form, `predicate(x) { … }`, names the value explicitly:

```tjs:static
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

A predicate that is pure and synchronous is **verified** when it is transpiled and compiled
to a fuel-bounded guard, so a hostile input cannot hang validation; it simply fails. One that
cannot be verified still works, as a plain function.

A regex makes a predicate unverifiable here: a native match is one call that fuel cannot see
inside, so a pattern like `/a*a*c/` could stall validation on a long input. `Email` above
uses string methods instead, and is verified.

## A declaration serialises to its facts

Because a declaration is a function, `JSON.stringify` would normally drop it without a word.
It does not: a type serialises to its facts. The implementation is left out, and so is
anything else that is a function.

```tjs:static
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

```tjs:static
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

```tjs:static
Union Direction 'cardinal' 'north' | 'south' | 'east' | 'west'

test 'a Union accepts exactly its literals' {
  expect(Direction('north')).toBe(true)
  expect(Direction('northeast')).toBe(false)
}
```

## `Generic` — a family of types

A `Generic` is a _factory_: give it a type argument and it returns a predicate. The type
parameter arrives in the predicate as a check; call it on the part it governs.

```tjs:static
Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
}

test 'a Generic instance is itself a predicate' {
  const IntBox = Box(0)
  expect(IntBox({ value: 7 })).toBe(true)
  expect(IntBox({ value: 'seven' })).toBe(false)
  expect(IntBox(null)).toBe(false)
}
```

## `FunctionPredicate` — a function's type

`FunctionPredicate` declares a **signature**: the parameters a function takes and what it
returns. At runtime the check is only "is this a function?", because whether a function
honours its signature is something you learn by calling it. The declaration's value is as a
documented contract that tools, docs and `.d.ts` output can read.

```tjs:static
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

## One thing that differs by where the type comes from

Types declared in a `.tjs` file, like every one above, come from the file's own small
runtime. The same constructors imported from the `tjs-lang` library produce values that are
additionally `instanceof Predicate` and name the witness `example` (the inline runtime calls
it `__ex`). The verdicts are the same either way; see _Type Identity_ for the full map.
