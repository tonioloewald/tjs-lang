<!--{"section": "ts", "type": "example", "group": "advanced", "order": 1, "parent": "ts-advanced.md"}-->

# Generic Functions

Generics transpile with warnings (best-effort)

<!-- TODO review -->

A generic type parameter is a promise about a relationship: `identity<T>(value: T): T` says
the result has the same type as the argument, whatever that type is. No single value can
show a relationship, so there is nothing for a runtime check to look at. TJS checks what a
value can show and says plainly what it could not convert. This example runs as before; what
changes is in the TJS the converter writes.

```ts:inline
// Generic functions: TJS handles them best-effort.
// An unconstrained type parameter becomes 'any', and the converter marks
// each one with a "TS types degraded" comment in the TJS it writes.

function identity<T>(value: T): T {
  return value
}

function first<T>(items: T[]): T | undefined {
  return items[0]
}

function wrap<T>(value: T): { value: T } {
  return { value }
}

// These work at runtime
console.log('identity(42):', identity(42))
console.log('identity("hello"):', identity('hello'))
console.log('first([1,2,3]):', first([1, 2, 3]))
console.log('wrap({ x: 1 }):', wrap({ x: 1 }))
```

<!-- TODO review -->

## What to notice

The converter writes, for `identity` and `first`:

```tjs:static
/* TODO: TS types degraded — value: T, return: T */
function identity(value) {
  return value
}

/* TODO: TS types degraded — return: T | undefined */
function first(items: [any]) {
  return items[0]
}
```

- **What can be checked, is.** `first` still checks that `items` is an array; only the
  element type is unknown.
- **What cannot, is marked.** Each `TODO: TS types degraded` comment names a parameter or
  return that became `any`. Search the converted code for them: they are the places where
  TypeScript was carrying information that TJS now does not check.
- **A constraint is information.** `function first<T extends { id: number }>(items: T[])`
  converts to an array of `{ id: number }`, and that is checked: an item whose `id` is a
  string is rejected. Defaults work the same way: `<T = string>` uses `string`.

<!-- TODO review -->

## The gotcha

TJS has no function-level generics, and does not need them to run this code: these functions
work on any value, which is exactly what `any` says. Where you want a _container_ whose
contents are checked, TJS has parameterized types instead, and they do check at run time:

```tjs:static
Type Box<T> {
  example: { value: T }
}

function unbox(b: Box<int>) {
  return b.value
}
// unbox({ value: 1 })   -> 1
// unbox({ value: 1.5 }) -> MonadicError
```

The example says where the parameter goes (`value: T`), so `Box<int>` checks that `value`
is an integer without a hand-written predicate.
