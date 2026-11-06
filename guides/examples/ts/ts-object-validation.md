<!--{"section": "ts", "type": "example", "group": "validation", "order": 3, "parent": "ts-validation.md"}-->
<!-- TODO review -->

# Object Validation

Most bad data is not the wrong primitive. It is an object with the wrong thing in one of its
members: an age that arrived as `"thirty"`, or a field that was renamed on the server and so
is missing. A TypeScript `interface` describes the shape, and then disappears when the code
is compiled. In TJS the shape survives and is checked every time a function receives one.

The example below is TypeScript. Before it runs, it goes through the TypeScript-to-TJS
converter (`fromTS`). The `/* @tjs TjsStrict */` comment on its first line tells the
converter to emit full TJS, with runtime checks, instead of keeping JavaScript's behaviour.
The converter turns `interface User` into a TJS `Type`: TJS's runtime type, a value that can
check other values (see [Declarations](/declarations/)).

```ts:inline
// Converted TypeScript keeps JavaScript's behaviour until you opt in. This one
// line opts in to full TJS, which turns the types into runtime checks:
/* @tjs TjsStrict */

interface User {
  name: string
  age: number
}

function greetUser(user: User): string {
  return `Hello, ${user.name}! You are ${user.age} years old.`
}

// A plain object of the right shape passes
const alice = { name: 'Alice', age: 30 }
console.log(greetUser(alice))

// Extra members are allowed: `admin` is not part of User, and this still passes
console.log(greetUser({ name: 'Ann', age: 41, admin: true }))

// A non-object fails
const badInput = greetUser('not an object' as any)
console.log('String input:', badInput)

// Members are checked too, not only "is it an object"
const wrongAge = greetUser({ name: 'Bob', age: 'thirty' } as any)
console.log('Wrong member type:', wrongAge)

// A missing member fails the same way
const noAge = greetUser({ name: 'Bob' } as any)
console.log('Missing member:', noAge)
```

The first two calls print their greetings. The last three do not throw, and the body of
`greetUser` never runs. Each returns a `MonadicError`, TJS's error value: TJS returns type
errors instead of throwing them. Their messages are:

```text
Expected User for '…:10:greetUser.user', got string
Expected User for '…:10:greetUser.user', got object
Expected User for '…:10:greetUser.user', got object
```

The `…` stands for the source file's name, and `10` is the line where `greetUser` is
declared; then come the function and the parameter. Yes, the last two say "got object": the message names the type
that failed, not the member that was wrong (see [The gotcha](#the-gotcha) below).

`MonadicError` extends `Error`, so `instanceof Error` is true. To ask only "is this a TJS type
error?", import `isMonadicError` from `tjs-lang/runtime` and call `isMonadicError(result)`.
[Error Handling](/error-handling/) covers errors as values in full.

## What to notice

- **`interface User` became a `Type`.** The converter writes:

  ```text
  Type User {
    example: { name: '', age: 0.0 }
  }
  ```

  This is the block form of `Type`. `example` is the value that candidates are checked
  against; the block can also carry other fields, such as a `description` or a
  `predicate` (see [Declarations](/declarations/)).

  Inside the example, members are written as example values: `name: ''` is "a string" and
  `age: 0.0` is "a number". In TJS `0` is an integer example, which rejects `30.5`, and
  `0.0` is a float example, which accepts any number. The converter writes TypeScript's
  `number` as `0.0` so it keeps TypeScript's meaning. On a parameter the converter keeps the
  type name instead (`age: number`), and the two spellings check the same thing (see
  [Type Transformation](/ts-type-transformation/)). TJS checks a value against the example
  member by member.

- **`alice` was never declared as a `User`.** It is a plain object literal. Like
  TypeScript, TJS cares about shape, not about where a value came from, so any object with a
  string `name` and a numeric `age` passes.
- **Extra members pass.** The second call carries `admin: true`, which `User` never
  mentions, and it succeeds. TJS has no excess-property check, so the extra member passes
  even when the literal is written inline in the call, where TypeScript would complain.
- **All three failures are caught at the same place**, the parameter of `greetUser`, before
  the body runs. The body never sees a `User` that is not one. The `as any` casts that
  silence the TypeScript compiler make no difference at run time.
- **Nested shapes are checked all the way down.** A member whose type is another interface,
  or an array of strings, is checked recursively, and an optional member (`age?: number`)
  may be left out. See [Nested Objects](/ts-nested-objects/) and
  [Optional Parameters](/ts-optional-parameters/).

## Dropping extra members: `strip`

Letting extra members through is usually what you want, but not when the object goes
somewhere that trusts every key, such as a database row. A `Type` is also a value with
methods. `User.check(value)` returns `true` or `false` directly, with no `MonadicError`
involved, and `User.strip(value)` returns a copy with only the declared members.

This example is TJS, not TypeScript, because a TypeScript interface is not a value: writing
`User.strip(signup)` in a `.ts` file is a compile error. Use `strip` in TJS code, or in a
file once it has been graduated (turned from converted TypeScript into a native TJS file;
see [Converting a TypeScript Project](/ts-converting-a-project/)).

```tjs:inline
// What the converter wrote for `interface User`:
Type User {
  example: { name: '', age: 0.0 }
}

const signup = { name: 'Ann', age: 41, admin: true }

console.log(User.check(signup))
console.log(JSON.stringify(User.strip(signup)))

// strip does not validate: it keeps the declared members as they are
const bad = { name: 'Bob', age: 'thirty' }
console.log(User.check(bad))
console.log(JSON.stringify(User.strip(bad)))
```

This prints `true`, then `{"name":"Ann","age":41}`, then `false`, then
`{"name":"Bob","age":"thirty"}`. The `admin` flag is gone from the first stripped copy. The
second shows that `strip` only removes keys; it does not check what is left. Call `check`
first, or pass the stripped value to a function that takes a `User`.

## The gotcha

The error for a failed object names the type and the parameter
(`Expected User for '…greetUser.user', got object`), not the member that was wrong. An
inline object shape does name the member: a TypeScript parameter written as
`user: { name: string; age: number }` reports `Expected number for '…greet.user.age', got
string`. For a named `Type`, `User.check` on the whole value tells you only that it fails.
To find the bad member, check the members one at a time, or log the payload next to the
error.
For more on checking data where it enters a program, including `check` and `strip` on JSON
payloads, see [Validating JSON at the Boundary](/ts-json-boundary/).
