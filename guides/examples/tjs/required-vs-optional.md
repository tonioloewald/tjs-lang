<!--{"section": "tjs", "type": "example", "group": "basics", "order": 2, "parent": "tjs-basics.md"}-->

# Required vs Optional

Difference between : and = in parameters

```tjs:inline
/#
## Required vs Optional Parameters

In TJS, the punctuation tells you everything:

| Syntax | Meaning |
|--------|---------|
| `param: 'value'` | **Required** - must be provided |
| `param = 'value'` | **Optional** - defaults to value |

The example value after `:` or `=` defines the type.
#/
test 'requires name and email' {
  const user = createUser('Alice', 'alice@test.com')
  expect(user.name).toBe('Alice')
  expect(user.age).toBe(0) // default
}

function createUser(
  name: 'anonymous',
  email: 'user@example.com',
  age = 0,
  admin = false
): { name: 'anonymous', email: 'user@example.com', age: 0, admin: false } {
  return { name, email, age, admin }
}

// Check the metadata
console.log('Params:', createUser.__tjs.params)
createUser('Alice', 'alice@example.com')
```

<!-- TODO review -->

## What to notice

In JavaScript every parameter is optional: leave one out and the function quietly gets
`undefined`, and the bug surfaces somewhere else, later. TJS makes the choice visible in the
signature, and the punctuation carries it:

- `name: 'anonymous'` is **required**. Calling `createUser()` with no name returns a
  `MonadicError` naming `createUser.name`; the body never runs.
- `age = 0` is **optional**. Leave it out and it is `0`. Pass a value and it is checked
  against the type of the default, so `createUser('Al', 'al@x.com', 'old')` is an error,
  not an age of `'old'`.

Either way the value after the punctuation does two jobs: it says what type the parameter
has, and it is the value the signature test calls the function with. The return example
`{ name: 'anonymous', email: 'user@example.com', age: 0, admin: false }` is what
`createUser('anonymous', 'user@example.com')` must return, and TJS checks that when the file
is transpiled.

`createUser.__tjs.params` prints the result: each parameter's type, whether it is required,
and its default.

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
console.log(describe(), describe(42), describe({ a: 1 }))
```

A default that fails its own type, such as `n: 0 = 'x'`, is a compile error.

## Things that trip people up

- **`= null` accepts any value.** A bare `null` (or `undefined`) default tells TJS nothing
  about the type, so it does not invent one: `describe(42)` and `describe({})` are both fine.
  If you mean "only `null`", write `thing: null`.
- **`name?: ''` is the TypeScript spelling of `name = ''`.** Both are optional and default
  to the empty string.
- **An object default is not atomic.** `opts = { x: 0, y: 0 }` merges a partial argument
  with the default member by member (`f({ x: 5 })` gets `{ x: 5, y: 0 }`). That is the
  subject of [Dictionary Defaults](/dictionary-defaults-example/), and
  `LegacyDefault({ x: 0, y: 0 })` gives you JavaScript's all-or-nothing default back for one
  parameter. `p: Point = { x: 1, y: 2 }`, a type plus a default, is atomic: a passed value
  must be a whole `Point`.
- **Order still matters.** As in JavaScript, arguments are positional. A required parameter
  after an optional one can only be reached by passing something for the optional one, so put
  required parameters first.
