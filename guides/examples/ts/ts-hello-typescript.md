<!--{"section": "ts", "type": "example", "group": "intro", "order": 1, "parent": "ts-intro.md"}-->

# Hello TypeScript

See how TypeScript types become TJS example-based types

<!-- TODO review -->

TypeScript checks the calls it can see. `greet(42)` is a compile error, but
`greet(42 as any)` is not, and neither is `greet(JSON.parse(text).name)`. Once the program
runs, the `string` annotation is gone and nothing stops the number. This example is a plain
TypeScript function, plus one comment that asks TJS to keep the annotation and check it.

```ts:inline
/*#
# TypeScript:

Types are compile-time only
TJS: Types become runtime validation!

Markdown doc comments in ts are supported, and
inline tests can be embedded in comment blocks.
*/

// Converted TypeScript keeps JavaScript's behaviour until you opt in. This one
// line opts in to full TJS, which turns the types into runtime checks:
/* @tjs TjsStrict */

/*test 'this is a tjs test block' {
  expect(greet('ts')).toBe('Hello, ts!')
}*/

function greet(name: string): string {
  return `Hello, ${name}!`
}

// This works - correct type
console.log(greet('World'))

// In pure TS, this would crash at runtime
// In TJS, you get a clean error object
console.log('Bad call result:', greet(42 as any))
```

<!-- TODO review -->

## What to notice

- **The bad call returns a value.** `greet(42 as any)` does not throw. It returns a
  `MonadicError` that names the function, the parameter and both types: expected `string`,
  got `number`. The program keeps running, and the error is there to be checked.
- **`/* @tjs TjsStrict */` is the switch.** `tsc` sees an ordinary comment. TJS reads it
  as "this file is full TJS", which makes every parameter type a runtime check. Delete the
  line and run again: the bad call prints `Hello, 42!`, exactly as the compiled TypeScript
  would.
- **The comments are part of the program.** `/*# … */` is documentation, rendered as
  markdown. `/*test '…' { … }*/` is a test that runs when the file is transpiled. Both are
  comments to `tsc`, so the file is still valid TypeScript.

<!-- TODO review -->

## The gotcha

The comment in the code says pure TypeScript "would crash". This particular function would
not: a template literal turns `42` into `'42'` and returns `Hello, 42!`. That is the more
dangerous outcome. A crash gets reported; a plausible wrong string goes into a page, a log
or a database. Runtime checks catch both.
