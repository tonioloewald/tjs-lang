<!--{"section": "ts", "type": "example", "group": "validation", "order": 5, "parent": "ts-validation.md"}-->
<!-- TODO review -->

# Embedded Tests

Write tests in comments that `tsc` ignores and TJS runs

TJS has inline `test '…' { … }` blocks, but that syntax is not TypeScript, and `tsc` would
reject a file that contained one. So a TypeScript file writes the same test inside a comment
that starts `/*test`. To `tsc` it is a comment.

TJS works on TypeScript by converting it: `tjs convert` turns a `.ts` file into TJS and then
into JavaScript (see [Converting a Project](/ts-converting-a-project/)), and the examples on
this page do the same conversion in the page. During that step TJS finds every `/*test`
comment and runs it against the converted module. The tests run at conversion time only.
They are not copied into the JavaScript that conversion writes, so importing that module
never runs them and they add nothing to its size.

The examples below run in the page. The example tests a helper that is not exported, which a
separate test file cannot reach. One test fails on purpose, so you can see what a failure
looks like.

```ts:inline
// Not exported: a separate test file could not import this.
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/*test 'clamp keeps a value inside the range' {
  expect(clamp(5, 0, 10)).toBe(5)
  expect(clamp(-3, 0, 10)).toBe(0)
  expect(clamp(42, 0, 10)).toBe(10)
}*/

export function percent(part: number, whole: number): number {
  if (whole === 0) return 0
  return clamp(Math.round((part / whole) * 100), 0, 100)
}

/*test 'percent rounds and never leaves 0..100' {
  expect(percent(1, 3)).toBe(33)
  expect(percent(5, 4)).toBe(100)
  expect(percent(1, 0)).toBe(0)
}*/

// FAILS ON PURPOSE: 2 of 3 rounds to 67 percent, not 66.
// Change 66 to 67 and the example reports every test passing.
/*test 'percent of two thirds' {
  expect(percent(2, 3)).toBe(66)
}*/

console.log('percent(1, 4) =', percent(1, 4))
```

The output shows `percent(1, 4) = 25`, then the test summary `2/3 inline tests passed`,
followed by `✗ percent of two thirds — Expected 66 but got 67`. The count is of `/*test`
blocks, not of `expect` calls: the first block holds three `expect` calls and counts once.
The example's `tjs tests` tab, beside its output, lists all three blocks, each marked
passed or failed. To run the same tests on your own files, see
[Running them from the command line](#running-them-from-the-command-line).

## What to notice

- **The test sits next to the code it tests.** No separate file, no import, no runner
  configuration. The test can see everything at the top level of the file, including
  functions that are not exported, like `clamp`.
- **`expect` is provided for you.** It is not imported; it exists inside every `/*test`
  block. The matchers are `toBe`, `toEqual`, `toContain`, `toThrow`, `toBeTruthy`,
  `toBeFalsy`, `toBeNull`, `toBeUndefined`, `toBeGreaterThan`, `toBeLessThan` and
  `toBeNaN`. `toBe` compares by deep equality, like `toEqual`. There is no `.not`, and no
  other Jest or Vitest matcher: one you try that is not on this list fails the test.
- **The first failing `expect` ends its test.** The rest of that block does not run, and
  the next block runs as normal.
- **The file is still valid TypeScript.** It passes `tsc --strict` unchanged. Nothing here
  needs a TJS-aware editor or compiler, so a team can add tests this way before anyone has
  decided to adopt TJS.

## A test runs the whole file

Running the tests means running the module. Its top-level code runs first, from top to
bottom, so the `console.log` in the example above prints before any test runs. Then the
tests run one at a time, in the order they appear in the file.

The tests run in the module's own scope. They see its top-level variables as the top level
left them, and a change one test makes is still there in the next test. Do not use
`await` in a test: in `tjs convert` an `await` in a test body stops every test in the file
from running (see [Gotchas](#gotchas)).

This happens whenever the tests run, and `tjs convert` runs them, so the file's top-level
code also runs at build time, while the file is converted. A network call or a file write
at the top level of a file you test this way happens during your build. Keep side effects
out of the top level of such files.

## Private class members too

TypeScript's `private` exists only at compile time: at runtime a private method is an
ordinary property, in TypeScript's own output and in TJS's. Since `tsc` never type-checks
the test body (it is a comment), a test can call a private method directly:

```ts:inline
export class Cart {
  private items: number[] = []

  add(price: number): void {
    this.items.push(price)
  }

  total(): number {
    return this.round(this.items.reduce((sum, p) => sum + p, 0))
  }

  private round(amount: number): number {
    return Math.round(amount * 100) / 100
  }
}

/*test 'round works in cents' {
  const cart = new Cart()
  expect(cart.round(0.1 + 0.2)).toBe(0.3)
}*/

/*test 'total adds what was added' {
  const cart = new Cart()
  cart.add(1.25)
  cart.add(2.5)
  expect(cart.total()).toBe(3.75)
}*/

const cart = new Cart()
cart.add(0.1)
cart.add(0.2)
console.log('total =', cart.total())
```

Both tests pass, and the log prints `total = 0.3`. In JavaScript, `0.1 + 0.2` is
`0.30000000000000004`; `round` takes it to whole cents, which is what both the first test
and the log check.

Two limits:

- **JavaScript's own `#private` fields stay out of reach.** They are private at runtime
  too. A test body that reads `cart.#items` does not compile, and in `tjs convert` that
  makes every test in the file inconclusive (see [Gotchas](#gotchas)). Test such a class
  through its public methods.
- **`TjsStrict` changes this.** Under `/* @tjs TjsStrict */` (the next section), a
  `private` field becomes a real `#private` field, so a test can no longer read
  `cart.items`. Private methods such as `round` stay ordinary methods, and a test can
  still call them. `TjsStrict` also refuses `new Cart()`: in TJS a class is called,
  `Cart()`, so this example has to drop `new` before it converts under `TjsStrict`.

## Testing the type checks

Converted TypeScript keeps JavaScript's semantics by default: it behaves exactly as
`tsc`'s output would, so converting a working program cannot break it. Its types are
carried along but not checked at runtime, so `add('2', 3)` returns `'23'` (see
[Introduction](/ts-intro/)). With `/* @tjs TjsStrict */` at the top of the file, every
parameter type is checked on every call (see [Runtime Validation](/ts-runtime-validation/)),
and a test can assert that a bad call is refused.

TJS does not throw on a bad argument. The call returns an error object, a `MonadicError`
(a subclass of `Error`), in place of the result, and does not run the function's body
(see [What a failed check returns](/ts-validation/#what-a-failed-check-returns)). So the
test inspects the returned value, not a thrown exception:

```ts:inline
/* @tjs TjsStrict */

function add(a: number, b: number): number {
  return a + b
}

/*test 'add returns a sum' {
  expect(add(2, 3)).toBe(5)
}*/

// tsc never sees this call: it is inside a comment.
/*test 'add refuses a string instead of adding it' {
  const result = add('2', 3)
  expect(result instanceof Error).toBe(true)
  expect(result.message).toContain('Expected number')
}*/

console.log('add(2, 3) =', add(2, 3))
```

Both tests pass. Delete the first line and the second test fails with
`Expected true but got false`: without `TjsStrict`, `add('2', 3)` is the string `'23'`.
The call is written `add('2', 3)`, not `add('2' as any, 3)`: a test body is JavaScript, and
`as any` would not compile there (see [Gotchas](#gotchas)).

## Running them from the command line

The `tjs` command comes with the `tjs-lang` package. It is a Bun program, so you need
[Bun](https://bun.sh) installed (see [Running TJS](/running-tjs/)):

```bash
bun add -d tjs-lang
bunx tjs convert percent.ts -o percent.js
```

`tjs convert` runs a file's embedded tests while converting it. For the first example
saved as `percent.ts`, the full output is:

```text
$ bunx tjs convert percent.ts -o percent.js
percent(1, 4) = 25
percent.ts: 2 passed, 1 failed
  ✗ 'percent of two thirds':29: Expected 66 but got 67
✓ percent.ts -> percent.js
```

The first line is the module's own `console.log`, run while converting. The number after a
failing test's name is its line in the converted TJS, which `tjs convert --emit-tjs` writes
out; it is not the line in your `.ts` file, so find a failing test by its name. A test with
no description is reported by its position, as `'embedded test 1'` and so on.

A file whose tests all pass prints no test summary at all; add `--verbose` to see
`✓ 2 tests passed`. The summary and the `✗` lines for a failure go to **stderr**.

`tjs convert` still writes the converted file and **exits 0 when a test fails**, and it has
no option to change that. In a build script, capture stderr and check the summary line:

```bash
tjs convert src/ -o dist/ 2>&1 | tee convert.log
if grep -qE ': [0-9]+ passed, [1-9][0-9]* failed' convert.log; then exit 1; fi
```

The pattern matches only the summary line, not a test whose name contains "failed". It
does not catch inconclusive tests, which print `inconclusive (not run …)` on stdout.
[Converting a Project](/ts-converting-a-project/) covers gating a whole tree.

There is no test-only command for TypeScript. `tjs test` and `tjs check` do exit 1 on a
failing test, but they read a `.ts` file as native TJS, not as converted TypeScript, so they
are not a safe substitute: on the `Cart` example, `tjs test` refuses `new Cart`. Use
`tjs convert` for `.ts` files.

## The TypeScript alternative

The usual TypeScript setup puts tests in a separate file run by Vitest or Jest:

```typescript
// percent.test.ts
import { describe, it, expect } from 'vitest'
import { percent } from './percent'

describe('percent', () => {
  it('rounds and never leaves 0..100', () => {
    expect(percent(1, 3)).toBe(33)
  })
})
```

That file can only import what the module exports, so `clamp` is out of reach unless you
export it for the tests' sake. Vitest also has in-source testing (an
`if (import.meta.vitest) { … }` block in the module itself), which can see private
functions; it needs `includeSource` in the Vitest config, a type reference for
`import.meta.vitest`, and a `define` in the production build to strip the block.

The `/*test` comment needs none of that: the comment is invisible to `tsc` and to every
bundler, and conversion leaves it out of the JavaScript it writes. What it does not give
you is a test runner's tooling: watch mode, coverage, mocking libraries, snapshot files,
`await` in a test, and an exit code that fails on a failed test. The two can live side by side.

## Gotchas

- **Spell it `/*test`, exactly.** No space after `/*`. A comment that starts `/* test` is
  an ordinary comment, and its "test" never runs, silently. If a test you wrote never seems
  to fail, check the spelling first. The shape is:

  ```text
  /*test 'description' {
    …
  }*/
  ```

  The description is optional and may use `'`, `"` or backticks; `/*test { … }*/` is a
  test without one. The closing `}` and the comment's `*/` may be separated only by
  whitespace.

- **The body is JavaScript, not TypeScript.** Nothing converts the inside of a comment, so
  `add('2' as any, 3)` or `const x: number = …` in a test body does not compile. One such
  body stops **every** test in the file: `tjs convert` reports them all as
  `inconclusive (not run)` rather than failed, and still exits 0. Write test bodies without
  type annotations. The same goes for a body that uses `await` or reads a `#private` field.
