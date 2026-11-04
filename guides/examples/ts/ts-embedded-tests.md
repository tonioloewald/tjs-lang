<!--{"section": "ts", "type": "example", "group": "validation", "order": 1, "parent": "ts-validation.md"}-->

# Embedded Tests

Write tests in comments that survive TypeScript compilation

<!-- TODO review -->

TJS has inline `test '…' { … }` blocks, but that syntax is not TypeScript, and `tsc` would
reject a file that contained one. So a TypeScript file writes the same test inside a comment
that starts `/*test`. To `tsc` it is a comment; TJS finds it, keeps it through conversion,
and runs it when the file is transpiled.

```ts:inline
// Embedded tests live inside /*test ... */ comments
// These survive TypeScript compilation and are extracted by TJS!

function add(a: number, b: number): number {
  return a + b
}

/*test 'adds positive numbers' {
  expect(add(2, 3)).toBe(5)
}*/

/*test 'adds negative numbers' {
  expect(add(-1, -2)).toBe(-3)
}*/

/*test 'handles zero' {
  expect(add(0, 5)).toBe(5)
  expect(add(5, 0)).toBe(5)
}*/

function multiply(a: number, b: number): number {
  return a * b
}

/*test 'multiplies numbers' {
  expect(multiply(3, 4)).toBe(12)
  expect(multiply(-2, 3)).toBe(-6)
}*/

// Try it: change an expected value above and run again.
// These tests run at transpile time, giving you immediate feedback.

console.log('add(10, 20) =', add(10, 20))
console.log('multiply(5, 6) =', multiply(5, 6))
```

<!-- TODO review -->

## What to notice

- **The test sits next to the code it tests.** No separate file, no import, no runner
  configuration. The test can see everything in the file, including functions that are
  not exported.
- **The tests run when the file is transpiled, not when it runs.** Change `toBe(5)` to
  `toBe(6)` and the transpile reports `Expected 6 but got 5`. On the command line,
  `tjs convert` prints the same result per file (`0 passed, 1 failed`, with the test's
  name and line). Note that it still writes the converted file and exits successfully, so
  in a build script, read its output rather than relying on the exit code.
- **The file is still valid TypeScript.** Nothing here needs a TJS-aware editor or
  compiler. A team can add tests this way before anyone has decided to adopt TJS.

<!-- TODO review -->

## The gotcha

The comment must start exactly `/*test`, with no space after `/*`, followed by an optional
description in quotes and a block in braces, and the block's closing `}` must be followed
by the comment's `*/`, with nothing but whitespace between them. A comment that starts
`/* test` is an ordinary comment, and its "test" never runs, silently. If a test you wrote
never seems to fail, check the spelling first.
