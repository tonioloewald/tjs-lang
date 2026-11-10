<!--{"section": "tjs", "type": "example", "group": "basics", "order": 2, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Required vs Optional

In JavaScript every parameter is optional. Leave one out and the function quietly gets
`undefined`, and the bug surfaces somewhere else, later. TJS makes the choice part of the
signature, and one character carries it:

| Syntax            | Meaning                                         |
| ----------------- | ----------------------------------------------- |
| `param: 'value'`  | **Required.** The caller must pass it.          |
| `param = 'value'` | **Optional.** Leave it out and it is `'value'`. |

In both cases the value after the punctuation is an example, and the parameter accepts
anything of the example's type: `'value'` means any string, `false` any boolean. Numbers are
more precise than in JavaScript. An integer example such as `0` accepts only integers, while
a decimal example such as `0.0` accepts any number. You can also write a type name instead
of an example (`string`, `number`, `boolean`). [TJS Syntax](/TJS-SYNTAX/) has the full list.

A colon after the closing parenthesis means something else. The return annotation is not a
type but a worked example, and TJS tests it: it calls the function with the parameter
examples and checks that the result is exactly the annotation. The first example below uses
one.

```tjs:inline
/#
## Required vs Optional Parameters

`name` and `email` are required (`:`); `age` and `admin` are optional (`=`).
#/
// A /# … #/ block is documentation: the page shows it above the code.
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
// { name: 'Alice', email: 'alice@example.com', age: 0, admin: false }
console.log(createUser('Bob', 'bob@example.com', 42, true))
// { name: 'Bob', email: 'bob@example.com', age: 42, admin: true }

// A missing required parameter is an error, and the body never runs
const missing = createUser('Carol')
console.log(isMonadicError(missing), missing.message)
// true Expected string for '…createUser.email', got undefined

// An optional parameter is still checked when you pass it
const wrongAge = createUser('Dan', 'dan@example.com', 'old')
console.log(isMonadicError(wrongAge), wrongAge.message)
// true Expected integer for '…createUser.age', got string

// A test block runs when the file is transpiled, like the return example
test 'optional parameters default' {
  const user = createUser('Alice', 'alice@test.com')
  expect(user.age).toBe(0)
  expect(user.admin).toBe(false)
}
```

The `…` in each message stands for the file name and line, which depend on where the code
runs.

## What to notice

- `email: 'user@example.com'` is **required**. `createUser('Carol')` does not run the body
  with `email` set to `undefined`. It returns a `MonadicError`, an `Error` subclass whose
  message names `createUser.email`. The error is returned, not thrown, so nothing unwinds:
  the caller decides what to do with it. `isMonadicError(x)`, which TJS provides, tells you
  whether you got one; [Error Handling](/error-handling/) says more.
- `age = 0` is **optional**. Leave it out and it is `0`. Pass a value and it is checked
  against the type of the default. `0` is an integer example, so `'old'` is rejected rather
  than stored as an age, and so is `1.5`.
- The return annotation is checked when the file is transpiled, which happens before any of
  it runs (in the page, when the example loads; at the command line, under `tjs check`). TJS
  calls `createUser('anonymous', 'user@example.com')` and compares the result with
  `{ name: 'anonymous', email: 'user@example.com', age: 0, admin: false }`. If the body
  returned a different `age`, transpiling would fail. The optional parameters are left out
  of that call, so the example also shows their defaults.

TJS attaches a record of each function's signature to the function, as `__tjs`. Its
`params` entry describes every parameter:

```tjs:inline
function createUser(name: 'anonymous', age = 0) {
  return { name, age }
}

for (const [param, info] of Object.entries(createUser.__tjs.params)) {
  console.log(param, info.type.kind, info.required ? 'required' : 'optional', info.default)
}
// name string required null
// age integer optional 0
```

A required parameter has no default, so its `default` is `null`. The record keeps the
type of an example, not the example itself, which is why `'anonymous'` does not appear.
Tools such as the documentation generator and the JSON Schema exporter read this record;
you can too.

## Skipping an optional parameter

Arguments are positional, as in JavaScript. To reach a later parameter while leaving an
earlier optional one at its default, pass `undefined` for it. `null` does not mean "use the
default": it is a value, and it is checked like any other.

```tjs:inline
function pad(text: 'x', width = 4, fill = ' ') {
  return text.padStart(width, fill)
}

console.log(pad('7'))                              // "   7"
console.log(pad('7', undefined, '0'))              // "0007": width keeps its default
console.log(isMonadicError(pad('7', null)))        // true: null is not an integer
console.log(isMonadicError(pad(undefined)))        // true: undefined counts as missing
console.log(pad('7', 4, '0', 'extra'))             // "0007": extra arguments are ignored
```

Passing `undefined` to a required parameter is the same as leaving it out, so it is an
error. Extra arguments are ignored, as in JavaScript.

For the same reason, put required parameters first. TJS allows a required parameter after
an optional one, and does not warn, but then every call has to fill the optional slot,
usually with `undefined`, just to reach the required one. With
`function late(a = 1, b: 'x')` you must write `late(undefined, 'y')`, and `late('y')` is an
error, because `'y'` lands in `a` and `b` is missing.

## A type and a separate default

Sometimes the default is not a good example of the type. A mode that is either `'grant'` or
`'deny'` should default to `'grant'`, but `mode = 'grant'` would accept any string. Write the
type, then the default, the way TypeScript does.

Here the type is `'grant' | 'deny'`. A lone string example widens to "any string", but
string literals joined by `|` are a closed set: the parameter accepts exactly those values
(see [Literal unions](/TJS-SYNTAX/#literal-unions)).

```tjs:inline
// Optional, checked against the type, defaulting to the default
function setMode(mode: 'grant' | 'deny' = 'grant') {
  return mode
}

function repeat(text: 'ab', times: number = 2): 'abab' {
  return text.repeat(times)
}

console.log(setMode())                                // grant
console.log(setMode('deny'))                          // deny
console.log(isMonadicError(setMode('maybe')))         // true: not in the set

console.log(repeat('xy'))                             // xyxy
console.log(repeat('xy', 3))                          // xyxyxy
console.log(isMonadicError(repeat('xy', 'many')))     // true
```

A default that fails its own type, such as `n: 0 = 'x'`, stops the file from transpiling.
The message is:

```text
The default of 'n: 0 = 'x'' does not satisfy its own type. Change the default, or the type.
```

## Things that trip people up

**`= null` accepts any value.** A bare `null` (or `undefined`) default tells TJS nothing
about the type, so it does not invent one:

```tjs:inline
// A bare null default means "anything, defaulting to null"
function describe(thing = null) {
  return thing == null ? 'nothing' : typeof thing
}
console.log(describe(), describe(42), describe({ a: 1 })) // nothing number object
```

If you mean "only `null`", write `thing: null`, which is required and rejects everything
else.

- **`name?: ''` is the TypeScript spelling of `name = ''`.** TJS accepts it as written,
  so you may use either. Both are optional, default to the
  empty string, and reject a non-string.
- **An object default is not atomic.** `opts = { x: 0, y: 0 }` merges a partial argument
  with the default member by member (`f({ x: 5 })` gets `{ x: 5, y: 0 }`). That is the
  subject of [Dictionary Defaults](/dictionary-defaults-example/). To get JavaScript's
  all-or-nothing default back for one parameter, write `opts = LegacyDefault({ x: 0, y: 0 })`.
  A type plus a default is atomic too: with `Type Point { example: { x: 0, y: 0 } }`
  declared, `p: Point = { x: 1, y: 2 }` checks a passed value as a whole `Point`, so
  `{ x: 5 }` is rejected rather than filled in. Merging is what an untyped object default
  means; once you name a type, the argument has to be one.
