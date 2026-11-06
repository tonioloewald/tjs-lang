<!--{"section": "ts", "type": "example", "group": "intro", "order": 2, "parent": "ts-intro.md"}-->
<!-- TODO review -->

# Multiple Functions

Once runtime checks are on, every function in a converted file guards its own inputs, so a
bad value is caught by the function you called, and the error names it, rather than
surfacing as a wrong answer three calls further in.

A real file has more than one function, and they call each other. The TS → TJS converter
(`fromTS`, which runs on the example below before it executes) handles each function on
its own: every signature is converted, every function gets a `__tjs` property describing
its parameters and return type (TJS uses it for validation and documentation), and the
function bodies are left as they were.

Converted TypeScript keeps JavaScript's behaviour by default, so code that ran before
conversion still runs the same way afterwards. The runtime checks are opt-in: one comment,
`/* @tjs TjsStrict */`, at the top of the file. The first example leaves it out, so it
shows the default, bad calls included.

```ts:inline
// Multiple functions in one file, calling each other

function add(a: number, b: number): number {
  return a + b
}

function multiply(a: number, b: number): number {
  return a * b
}

// lineTotal is built from the other two
function lineTotal(price: number, quantity: number, shipping: number): number {
  return add(multiply(price, quantity), shipping)
}

function greet(name: string, excited?: boolean): string {
  return excited ? `Hello, ${name}!` : `Hello, ${name}`
}

// Prints a result with its type, or an error's message
function show(value: any): string {
  return value instanceof Error
    ? `error: ${value.message}`
    : `${value} (${typeof value})`
}

console.log('add(2, 3) =', show(add(2, 3)))
console.log('lineTotal(4, 5, 2) =', show(lineTotal(4, 5, 2)))
console.log('greet("World") =', greet('World'))
console.log('greet("World", true) =', greet('World', true))

// Each converted function carries a description of its own signature
console.log('excited required?', greet.__tjs.params.excited.required)

// Bad calls. The compiler would reject add('2', 3), so the string arrives
// the way real data does: typed `any`, from JSON or a form field.
const fromForm: any = '2'
console.log("add('2', 3) =", show(add(fromForm, 3)))
console.log("lineTotal(4, 5, '2') =", show(lineTotal(4, 5, fromForm)))
console.log("greet('World', '2') =", greet('World', fromForm))
```

## What to notice

- **Each signature converts one for one.** In the converted TJS the signatures read:

  ```javascript
  function add(a: number, b: number):! number {
  function lineTotal(price: number, quantity: number, shipping: number):! number {
  function greet(name: string, excited: boolean | undefined):! string {
  ```

- **`excited?: boolean` stays optional.** It converts to `excited: boolean | undefined`.
  In TJS a colon parameter is normally required, but the `| undefined` in the union is
  what marks this one optional, and `greet.__tjs.params.excited.required` is `false`. So
  `greet('World')` with one argument is a valid call.
- **Return types become type-only returns.** In native TJS, a return annotation such as
  `: 5` is a worked example: TJS calls the function with its parameter examples at build
  time and checks that the result is `5`. A TypeScript `: number` is a type, not an
  example, so the converter writes `:! number`. The `!` opts out of that build-time test;
  TJS records the type and shows it in documentation.
- **Nothing is checked yet.** The bad calls print `23 (string)` and `202 (string)`: the
  strings `"23"` and `"202"`, just as they would under `tsc`. Checks sit at function
  boundaries, not inside bodies, and none are on, so in `lineTotal` the string travels
  through to `add` and turns it into string concatenation. The wrong answer comes out of a
  function nobody called directly. `greet('World', '2')` accepts a string for `excited` too.

## Turn the checks on

Here is the same file with `/* @tjs TjsStrict */` as its first line:

```ts:inline
/* @tjs TjsStrict */
// The same functions, with runtime checks turned on

function add(a: number, b: number): number {
  return a + b
}

function multiply(a: number, b: number): number {
  return a * b
}

function lineTotal(price: number, quantity: number, shipping: number): number {
  return add(multiply(price, quantity), shipping)
}

function greet(name: string, excited?: boolean): string {
  return excited ? `Hello, ${name}!` : `Hello, ${name}`
}

function show(value: any): string {
  return value instanceof Error
    ? `error: ${value.message}`
    : `${value} (${typeof value})`
}

console.log('lineTotal(4, 5, 2) =', show(lineTotal(4, 5, 2)))
console.log('greet("World") =', greet('World'))

const fromForm: any = '2'
console.log("add('2', 3) =", show(add(fromForm, 3)))
console.log("lineTotal(4, 5, '2') =", show(lineTotal(4, 5, fromForm)))
console.log("greet('World', '2') =", show(greet('World', fromForm)))
```

The good calls print what they printed before. The three bad calls now return a
`MonadicError`: an error value TJS returns instead of throwing. It extends `Error`, which
is how `show` recognises it, and the example prints:

```text
add('2', 3) = error: Expected number for '<source>:4:add.a', got string
lineTotal(4, 5, '2') = error: Expected number for '<source>:12:lineTotal.shipping', got string
greet('World', '2') = error: Expected boolean | undefined for '<source>:16:greet.excited', got string
```

Each message names the location as `file:line:function.parameter`. `<source>` stands in
for the file name, which an example in the page does not have; in a real project it is
the file's path.

The second message is the one that matters in a multi-function file. The string is
rejected at `lineTotal`'s own boundary, and the error names `lineTotal.shipping`: the
function the caller actually called and the argument it got wrong. It never reaches
`add`, so you do not have to work backwards from a wrong total to find where it came from.
Because the errors are returned, not thrown, the lines after them still run; see
[Runtime Validation](./ts-runtime-validation.md) for how to test for one.

## The gotcha

`number` converts to "any number". TJS can also say "integer" or "non-negative integer",
but the converter never narrows on its own, so no number that TypeScript accepted (`2.5`,
say, or `-1`) is rejected after conversion. If `quantity` really is a count, narrowing it
is an edit you make in the converted TJS: replace `quantity: number` with the example
`quantity: 0` (an integer) or `quantity: +0` (a non-negative integer). The full list of
numeric forms is in the [TJS for TypeScript Programmers](../../../TJS-FOR-TS.md)
conversion reference.
