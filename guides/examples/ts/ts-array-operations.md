<!--{"section": "ts", "type": "example", "group": "patterns", "order": 1, "parent": "ts-patterns.md"}-->
<!-- TODO review -->

# Arrays: Checking Every Element

A `number[]` that holds a string gives a wrong answer in TypeScript. With TjsStrict, the
same `number[]` checks every element and returns an error that names the bad one.

An array type in TypeScript says something about every element, and nothing checks any of
them at run time. Data that arrives as `any` (from `JSON.parse`, a fetch, a cast) is
accepted as `number[]` without a look inside. One string in the list turns `reduce` into
string concatenation, and the wrong answer comes out with no error anywhere.

The examples on this page run through the TS→TJS converter: `fromTS` from
`tjs-lang/lang/from-ts`, or `tjs convert` on the command line (see
[Converting a project](../../sections/ts-converting-a-project.md)). It turns `number[]`
into `[number]`, TJS's array type with a bare type name as its element.

By default the converter keeps JavaScript's behaviour: the types become metadata and
nothing is checked. That default is deliberate. TJS must run any JavaScript (or converted
TypeScript) unchanged, so checks are something a file opts into. The opt-in is the comment
`/* @tjs TjsStrict */` at the top of a `.ts` file. TypeScript reads it as an ordinary
comment; the converter reads it as "convert this file to full TJS", including input
validation. It applies to that one file only.

The first example below has no annotation and shows the bug. The second adds the comment.

## Without checks

```ts:inline
function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0)
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}

function filterPositive(numbers: number[]): number[] {
  return numbers.filter((n) => n > 0)
}

const data = [-1, 2, -3, 4, 5, -6, 7]
console.log('Sum:', sum(data))
console.log('Average:', average(data))
console.log('Positive only:', filterPositive(data))

// JSON.parse returns `any`, so TypeScript accepts this as number[].
// One element is a string.
const scores: number[] = JSON.parse('[1, "2", 3]')
// stringify so the quotes show: the result is a string
console.log('Sum of scores:', JSON.stringify(sum(scores)))
console.log('Average of scores:', average(scores))
```

The output:

```text
Sum: 8
Average: 1.1428571428571428
Positive only: [ 2, 4, 5, 7 ]
Sum of scores: "123"
Average of scores: 41
```

The first three lines are right. The last two are wrong, and nothing says so.
`sum(scores)` returns the string `"123"`: `0 + 1` is `1`, then `1 + '2'` is `'12'`, then
`'12' + 3` is `'123'`. `average` divides that string by 3, JavaScript converts it back to
a number, and the result is `41`. The real average is 2. A `NaN` would at least look
broken; `41` looks like an answer.

## With TjsStrict

The same three functions, with the annotation added at the top.

Under TjsStrict a bad call returns an error object instead of a number. That means the
TypeScript return type `number` no longer describes every outcome, so the code below types
each result `any` in order to read the error's fields: `path`, `expected`, `actual` and
`message`.

```ts:inline
/* @tjs TjsStrict */

function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0)
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}

function filterPositive(numbers: number[]): number[] {
  return numbers.filter((n) => n > 0)
}

const scores: number[] = JSON.parse('[1, "2", 3]')

const total: any = sum(scores)
console.log('is an error:', total instanceof Error)
console.log('path:', total.path)
console.log('expected:', total.expected, 'actual:', total.actual)
console.log('message:', total.message)

const mean: any = average(scores)
console.log('average path:', mean.path)

const positive: any = filterPositive(scores)
console.log('filterPositive path:', positive.path)

// Good data is unaffected
console.log('Sum:', sum([1, 2, 3]), 'Average:', average([1, 2, 3]))
console.log('Empty:', sum([]), average([]))
```

The output:

```text
is an error: true
path: <source>:3:sum.numbers[1]
expected: number actual: string
message: Expected number for '<source>:3:sum.numbers[1]', got string
average path: <source>:7:average.numbers[1]
filterPositive path: <source>:12:filterPositive.numbers[1]
Sum: 6 Average: 2
Empty: 0 0
```

- **The error names the element.** A path reads file, line, function, parameter and index.
  `<source>` stands for the file name; an inline snippet like this one has none, so it gets
  that label (from the CLI you would see the file's name). The line is the line in the
  TypeScript source where the function is declared, counted from the top of the block
  including the `@tjs` comment: `sum` is on line 3, `average` on 7, `filterPositive` on
  12. `[1]` is the `"2"`. `expected` is the element type, `actual` is what was there.
- **The bad call returns an error; it does not throw.** `total` is a `MonadicError`: a
  value TJS returns in place of throwing. It is an `Error`, so `instanceof Error` finds it,
  and `isMonadicError(x)` from `tjs-lang/runtime` tests for it specifically. Because nothing
  throws, the lines after it still run. See
  [Runtime Validation](./ts-runtime-validation.md) for what to do with one.
- **Each checked function checks its own input.** `average(scores)` fails at
  `average.numbers[1]`, before it ever calls `sum`. On good data, `average` checks the
  array and then `sum` checks it again.
- **An empty array is a valid `number[]`.** `sum([])` is `0`, as in TypeScript.

## What to notice

- **Array methods are untouched.** `reduce`, `filter` and the arrow functions convert as
  they are; only the signatures change. The bodies run exactly as they would after `tsc`.
- **The check covers the whole array, every call.** Checking an array costs time
  proportional to its length, and in the example above a good array is walked twice, once
  by `average` and once by `sum`. Next to the work most functions do with an array, that is
  usually noise; skip it only where profiling shows it matters. The
  [Performance Guide](../../performance.md) says how to measure.
- **The return type is not checked.** The converter writes the signature as
  `function sum(numbers: [number]):! number`. The `:!` marks a type-only return: TJS
  records it for documentation and does not test or validate what the function returns.
  The checks are on the way in. (In native TJS a plain `:` return is different; see below.)

## Skipping the check in a hot path

A converted `.ts` file has no per-function opt-out: TjsStrict turns checks on for the
whole file, and TypeScript has no syntax for TJS's `!` marker. If one function in a
TjsStrict file must not be checked, the choices are to leave that file without TjsStrict,
or to make it native TJS.

Native TJS means a `.tjs` file you write and maintain as TJS, not converted TypeScript.
[Converting a project](../../sections/ts-converting-a-project.md) describes how a
converted file graduates to one. Two pieces of TJS syntax appear in the example below,
and both read like TypeScript but are not:

- **A colon value is an example, not a literal type.** `numbers: [0.0]` means "an array
  whose elements are like `0.0`". `0.0` is a float, which accepts any number; `[0]` would
  mean an array of integers, and `1.5` would be refused. This is the same type the
  converter writes as `[number]`, spelled the native way.
- **A return example is a tested worked example.** `: 0.0` on `average` means TJS calls
  `average` with the parameter examples (`[0.0]`) when the file is checked and expects
  `0.0` back, which it gets. The converter writes `:!` precisely so that a TypeScript
  return type is not run as a test.

Put `!` before a parameter to turn off the check on that one function. The usual case is
an inner function whose callers have already checked the data:

```tjs:static
// Checked: called with data from outside
function average(numbers: [0.0]): 0.0 {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}

// Not checked: its callers are trusted to have checked the input
function sum(! numbers: [0.0]): 0.0 {
  return numbers.reduce((a, b) => a + b, 0)
}

console.log(average([1, 2, 3]))
console.log(sum([1, '2', 3]))
console.log(average([1, '2', 3]).message)
```

The output:

```text
2
123
Expected number for '<source>:2:average.numbers[1]', got string
```

`average` checks its input and catches the string. The direct `sum([1, '2', 3])` call
prints `123`: the original bug is back. `!` is a promise you make about every caller, and
nothing enforces it, so any caller that does not check its own input reintroduces the
silent wrong answer. (`! numbers` and `!numbers` are both accepted; the docs write it with
a space.)

See [Safety & Validation](../tjs/safety-validation.md) for the per-file and per-function
levels, and [Array Types](../tjs/array-types.md) for the TJS array syntax in full.
