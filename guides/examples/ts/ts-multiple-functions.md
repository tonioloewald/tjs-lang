<!--{"section": "ts", "type": "example", "group": "intro", "order": 2, "parent": "ts-intro.md"}-->

# Multiple Functions

Multiple functions transpile correctly

<!-- TODO review -->

A real file has more than one function, and they call each other. The converter handles
each function on its own: every signature is converted, every function gets its own
metadata, and the bodies are left as they were. This example has no `TjsStrict` line, so
it shows the default: the converted file behaves exactly as the TypeScript compiler's
output would.

```ts:inline
// Multiple functions in one file

function add(a: number, b: number): number {
  return a + b
}

function multiply(a: number, b: number): number {
  return a * b
}

function greet(name: string, excited?: boolean): string {
  return excited ? `Hello, ${name}!` : `Hello, ${name}`
}

// Test them all
console.log('add(2, 3) =', add(2, 3))
console.log('multiply(4, 5) =', multiply(4, 5))
console.log('greet("World") =', greet('World'))
console.log('greet("World", true) =', greet('World', true))
```

<!-- TODO review -->

## What to notice

- **`excited?: boolean` stays optional.** It converts to a parameter whose type is
  `boolean | undefined`, so calling `greet('World')` with one argument is fine.
- **Return types become type-only returns.** `: number` converts to `:! number`. The `!`
  means "this is the type of the result, not a worked example": TJS records it and shows it
  in documentation, but does not call the function at build time to test it.
- **Nothing is checked yet.** Without `/* @tjs TjsStrict */`, a converted file keeps
  JavaScript's semantics, so `add('2', 3)` would return `'23'` here just as it would under
  `tsc`. Add the line at the top and run again with a bad call to see the difference.

<!-- TODO review -->

## The gotcha

TypeScript's `number` is one type. TJS has three numeric types: any number (`0.0`), an
integer (`0`) and a non-negative integer (`+0`). The converter maps `number` to "any
number", so nothing that ran before is rejected after conversion. If `count` really is a
count, narrowing it to an integer is a deliberate edit you make in the TJS, not something
the converter guesses.
