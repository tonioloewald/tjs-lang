<!--{"section": "ts", "type": "example", "group": "patterns", "order": 3, "parent": "ts-patterns.md"}-->

# Union Types

Union types and nullable values

<!-- TODO review -->

"There may not be one" is the most common union in real code: a lookup that can miss, a
field that can be empty. TypeScript writes it `string | null`, and with `strictNullChecks`
on, the compiler makes you handle the `null` before you use the value. The converter keeps
the union, and with checking on, TJS enforces the same rule at run time: `null` is accepted
where the type says so, and nowhere else.

```ts:inline
// Union types: T | null, T | undefined

function findUser(id: number): string | null {
  // Simulated lookup
  if (id === 1) return 'Alice'
  if (id === 2) return 'Bob'
  return null
}

function greetOrWarn(name: string | null): string {
  if (name === null) {
    return 'User not found!'
  }
  return `Hello, ${name}!`
}

console.log('Find user 1:', findUser(1))
console.log('Find user 2:', findUser(2))
console.log('Find user 99:', findUser(99))

console.log('\nGreet user 1:', greetOrWarn(findUser(1)))
console.log('Greet user 99:', greetOrWarn(findUser(99)))
```

<!-- TODO review -->

## What to notice

- **The union converts as written.** `name: string | null` stays `name: string | null`,
  and `: string | null` on the return becomes the type-only `:! string | null`.
- **The `null` check is plain JavaScript.** TypeScript narrows `name` to `string` after
  `if (name === null) return …`; TJS has no compile-time narrowing to do, and needs none:
  the parameter was already checked when the function was called.

<!-- TODO review -->

## The gotcha

TJS keeps `null` and `undefined` apart. `string | null` accepts a string or `null`, and
rejects `undefined`: with `/* @tjs TjsStrict */` at the top, `greetOrWarn(undefined as any)`
returns an error instead of printing `Hello, undefined!`. That is usually what you meant,
because a missing value and a deliberately empty one are different facts. If a parameter
really may be either, make it optional as well as nullable: `name?: string | null`. (Spell
it that way rather than `name: string | null | undefined`, which the converter currently
narrows to `string | null`.)

A union of string literals, `'active' | 'inactive'`, is a closed set: TJS converts it to a
`Union` and rejects any other string. A union of different types, such as `number | string`,
accepts a value of any of its member types.
