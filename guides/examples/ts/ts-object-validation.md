<!--{"section": "ts", "type": "example", "group": "validation", "order": 3, "parent": "ts-validation.md"}-->

# Object Validation

Object types are validated at runtime

<!-- TODO review -->

Most bad data is not the wrong primitive. It is an object with the wrong thing in one of its
members: an age that arrived as `"thirty"`, an id that is `null`, a field that was renamed on
the server. A TypeScript `interface` describes the shape, and then disappears. Converted with
`TjsStrict`, the interface becomes a TJS `Type`, and every function that takes one checks the
whole shape, members included.

```ts:inline
// Converted TypeScript keeps JavaScript's behaviour until you opt in. This one
// line opts in to full TJS, which turns the types into runtime checks:
/* @tjs TjsStrict */

// Object types become runtime checks

interface User {
  name: string
  age: number
}

function greetUser(user: User): string {
  return `Hello, ${user.name}! You are ${user.age} years old.`
}

// Valid object works
const alice = { name: 'Alice', age: 30 }
console.log(greetUser(alice))

// Non-object fails validation
const badInput = greetUser('not an object' as any)
console.log('String input:', badInput)

// Members are checked too, not just "is it an object"
const wrongAge = greetUser({ name: 'Bob', age: 'thirty' } as any)
console.log('Wrong member type:', wrongAge)
```

<!-- TODO review -->

## What to notice

- **`interface User` became a type with an example.** The converter writes
  `Type User { example: { name: '', age: 0.0 } }`: an example object of the right shape.
  TJS checks a value against it member by member.
- **`alice` was never declared as a `User`.** It is a plain object literal. Like
  TypeScript, TJS cares about shape, not about where a value came from, so any object with a
  string `name` and a numeric `age` passes.
- **Both failures are caught at the same place**, the parameter of `greetUser`, before the
  body runs. The body never sees a `User` that is not one.

<!-- TODO review -->

## The gotcha

The error for a failed object names the type (`Expected User … got object`), not the member
that was wrong. For a type declared with `interface`, finding the bad member is still your
job. Extra members, on the other hand, are allowed: `{ name: 'Ann', age: 3, admin: true }`
passes, just as TypeScript lets a wider object through a variable. If extra members could do
harm (written straight to a database, say), strip them with the type's `strip` method before
storing; see [Validating JSON at the Boundary](../../sections/ts-json-boundary.md).
