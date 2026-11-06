<!--{"section": "ts", "type": "example", "group": "intro", "order": 1, "parent": "ts-intro.md"}-->
<!-- TODO review -->

# Hello TypeScript

See a TypeScript type checked at run time.

TJS is a typed JavaScript whose types survive to run time as checks. It can also take a
TypeScript file and do the same with its annotations.

TypeScript checks the calls it can see. `greet(42)` is a compile error, but
`greet(42 as any)` is not, and neither is `greet(JSON.parse(text).name)`. Once the program
runs, the `string` annotation is gone and nothing stops the number. The function does not
crash, either: the template literal turns `42` into `'42'` and returns `Hello, 42!`. A crash
gets reported; a plausible wrong string goes quietly into a page, a log or a database.

The example is a plain TypeScript function plus one comment that switches the checks on.
The other two special comments, a doc comment and a test, are explained below.

```ts:inline
/*#
`greet` builds a greeting from a name. TJS reads this block as
markdown documentation for the file.
*/

// By default TJS converts TypeScript the way tsc does: the types are
// erased. This line asks it to keep them as runtime checks:
/* @tjs TjsStrict */

/*test 'greet builds a greeting' {
  expect(greet('ts')).toBe('Hello, ts!')
}*/

function greet(name: string): string {
  return `Hello, ${name}!`
}

// A correct call works as usual
console.log(greet('World'))

// Compiled by tsc, this prints "Hello, 42!".
// Under TJS, greet returns an error value instead of a greeting.
// `bad` is typed `any` because the error has fields `string` lacks.
const bad: any = greet(42 as any)
console.log('Bad call result:', bad)

console.log('is an error:', bad instanceof Error)
console.log('path:', bad.path)
console.log('expected:', bad.expected, 'actual:', bad.actual)
```

## What to look for in the output

The good call prints `Hello, World!`. The bad call does not print a greeting. It prints an
error, whose first line reads:

```text
Bad call result: MonadicError: Expected string for '<source>:14:greet.name', got number
```

The last three lines check what it is and read three of its fields:

```text
is an error: true
path: <source>:14:greet.name
expected: string actual: number
```

- `path` names the place the check failed: the file, the line of the declaration, the
  function and the parameter. The line, 14, counts from the first line of the code block.
  `<source>` stands in for the file name when there is none, as on this page. A real file
  shows its name, for example `greet.ts:14:greet.name`.
- `expected` is the declared type, and `actual` is the type of the value that arrived.

## What to notice

- **The bad call returns an error instead of throwing.** `greet(42 as any)` returns a
  `MonadicError`: an error returned as a value rather than thrown, so the program keeps
  running. It is a subclass of `Error`, so `instanceof Error` tells it from a greeting. In
  code that imports the TJS runtime, `isMonadicError(value)` from `tjs-lang/runtime` checks
  for this kind of error specifically.
- **An unchecked error is still visible.** If nobody checks `bad` and it gets turned into a
  string, it reads `MonadicError: Expected string for '…', got number`, not `Hello, 42!`. Use
  it as a string, as in `bad.toUpperCase()`, and it throws at that call.
- **The TypeScript signature no longer tells the whole story.** Under TJS, any checked
  function can also return an error value that its signature does not mention: `greet` says
  `string`, and `tsc` would let you call `.toUpperCase()` on the result. That is why the
  example types `bad` as `any`. As a `string`, `bad.path` would be a compile error.
- **`/* @tjs TjsStrict */` is the switch.** `tsc` sees an ordinary comment. Without it, TJS
  converts a TypeScript file the way `tsc` does: the types are erased, and the code keeps
  JavaScript's behaviour. With it, the file is converted to full TJS, so every parameter type
  becomes a runtime check. The `: string` return type is kept as documentation and is not
  checked. `TjsStrict` also gives the rest of the file TJS semantics, such as `==` without
  type coercion; [Converting a TypeScript
  Project](../../sections/ts-converting-a-project.md) lists what changes and a gentler route
  for existing code. Delete the line and run again: the bad call prints `Hello, 42!`, exactly
  as the compiled TypeScript would, and the last three lines print `false` and `undefined`.
- **The checks cost little.** On trivial function bodies a checked call measures about 1.5x
  an unchecked one, which disappears next to most real work. The [performance
  guide](../../performance.md) has the details.
- **The comments are part of the program.** `/*# … */` is documentation, rendered as
  markdown. `/*test '…' { … }*/` is a test that runs when TJS transpiles the file, and a
  failing test stops the transpile with `Transpile-time test failures`. The live example on
  this page skips tests; [Embedded Tests](ts-embedded-tests.md) shows them running. Both are
  comments to `tsc`, so the file is still valid TypeScript.
