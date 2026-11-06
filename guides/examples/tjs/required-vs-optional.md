<!--{"section": "tjs", "type": "example", "group": "basics", "order": 2, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Required vs Optional

Difference between `:` and `=` in parameters

In JavaScript every parameter is optional. Leave one out and the function quietly gets
`undefined`, and the bug surfaces somewhere else, later. TJS makes the choice part of the
signature, and one character carries it:

| Syntax            | Meaning                                         |
| ----------------- | ----------------------------------------------- |
| `param: 'value'`  | **Required.** The caller must pass it.          |
| `param = 'value'` | **Optional.** Leave it out and it is `'value'`. |

In both cases the value after the punctuation is an example, and its type is the
parameter's type.

```tjs:inline
/#
## Required vs Optional Parameters

`name` and `email` are required (`:`); `age` and `admin` are optional (`=`).
#/
function createUser(
  name: 'anonymous',
  email: 'user@example.com',
  age = 0,
  admin = false
): { name: 'anonymous', email: 'user@example.com', age: 0, admin: false } {
  return { name, email, age, admin }
}

// Optional parameters left out take their defaults
console.log(createUser('Alice', 'alice@example.com'))
console.log(createUser('Bob', 'bob@example.com', 42, true))

// A missing required parameter is an error, and the body never runs
const missing = createUser('Carol')
console.log(missing instanceof Error, missing.message)

// An optional parameter is still checked when you pass it
const wrongAge = createUser('Dan', 'dan@example.com', 'old')
console.log(wrongAge instanceof Error, wrongAge.message)

test 'optional parameters default' {
  const user = createUser('Alice', 'alice@test.com')
  expect(user.age).toBe(0)
  expect(user.admin).toBe(false)
}
```

## What to notice

- `email: 'user@example.com'` is **required**. `createUser('Carol')` does not run the body
  with `email` set to `undefined`; it returns a `MonadicError` whose message names
  `createUser.email`. The error is returned, not thrown, so the caller can check it with
  `instanceof Error` (or `isMonadicError`).
- `age = 0` is **optional**. Leave it out and it is `0`. Pass a value and it is checked
  against the type of the default, which is an integer, so `'old'` is rejected rather than
  stored as an age.
- The return annotation is a worked example, not a type. TJS calls
  `createUser('anonymous', 'user@example.com')` when the file is transpiled and checks that
  it returns exactly `{ name: 'anonymous', email: 'user@example.com', age: 0, admin: false }`.
  If the body returned a different `age`, the file would fail to compile. The optional
  parameters are left out of that call, so the example also shows their defaults.

Every function records what its signature says in `__tjs.params`:

```tjs:inline
function createUser(name: 'anonymous', age = 0) {
  return { name, age }
}

for (const [param, info] of Object.entries(createUser.__tjs.params)) {
  console.log(param, info.type.kind, info.required ? 'required' : 'optional', info.default)
}
```

This prints `name string required null` and `age integer optional 0`. Tools such as the
documentation generator and the JSON Schema exporter read this record; you can too.

## Skipping an optional parameter

Arguments are positional, as in JavaScript. To reach a later parameter while leaving an
earlier optional one at its default, pass `undefined` for it. `null` does not mean "use the
default": it is a value, and it is checked like any other.

```tjs:inline
function pad(text: 'x', width = 4, fill = ' ') {
  return text.padStart(width, fill)
}

console.log(pad('7'))                      // "   7"
console.log(pad('7', undefined, '0'))      // "0007": width keeps its default
console.log(pad('7', null) instanceof Error) // true: null is not an integer
```

For the same reason, put required parameters first. A required parameter after an
optional one can only be reached by passing something for the optional one.

## A type and a separate default

Sometimes the default is not a good example of the type. A mode that is either `'grant'` or
`'deny'` should default to `'grant'`, but `mode = 'grant'` would accept any string. Write the
type, then the default, the way TypeScript does:

```tjs:inline
// Optional, checked against the type, defaulting to the default
function setMode(mode: 'grant' | 'deny' = 'grant') {
  return mode
}

function repeat(text: 'ab', times: number = 2): 'abab' {
  return text.repeat(times)
}

console.log(setMode())                       // grant
console.log(setMode('deny'))                 // deny
console.log(setMode('maybe') instanceof Error) // true: not in the set

console.log(repeat('xy'))                    // xyxy
console.log(repeat('xy', 3))                 // xyxyxy
console.log(repeat('xy', 'many') instanceof Error) // true

// A bare null default means "anything, defaulting to null"
function describe(thing = null) {
  return thing == null ? 'nothing' : typeof thing
}
console.log(describe(), describe(42), describe({ a: 1 })) // nothing number object
```

A default that fails its own type, such as `n: 0 = 'x'`, is a compile error: "The default
of 'n: 0 = 'x'' does not satisfy its own type."

## Things that trip people up

- **`= null` accepts any value.** A bare `null` (or `undefined`) default tells TJS nothing
  about the type, so it does not invent one: `describe(42)` and `describe({})` are both fine.
  If you mean "only `null`", write `thing: null`, which is required and rejects everything
  else.
- **`name?: ''` is the TypeScript spelling of `name = ''`.** Both are optional, default to
  the empty string, and reject a non-string.
- **An object default is not atomic.** `opts = { x: 0, y: 0 }` merges a partial argument
  with the default member by member (`f({ x: 5 })` gets `{ x: 5, y: 0 }`). That is the
  subject of [Dictionary Defaults](/dictionary-defaults-example/), and
  `LegacyDefault({ x: 0, y: 0 })` gives you JavaScript's all-or-nothing default back for one
  parameter. `p: Point = { x: 1, y: 2 }`, a type plus a default, is atomic: a passed value
  must be a whole `Point`.
