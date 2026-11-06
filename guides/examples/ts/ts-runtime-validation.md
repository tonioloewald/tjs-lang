<!--{"section": "ts", "type": "example", "group": "validation", "order": 1, "parent": "ts-validation.md"}-->
<!-- TODO review -->

# Runtime Validation

_Under TJS, your TypeScript parameter types become checks that run on every call._

In TypeScript, `divide(a: number, b: number)` is a promise the compiler checks against the
calls it can see. A call with a string from a form, or a value cast with `as any`, compiles
fine, and JavaScript then does whatever its coercion rules say: `'ten' / 2` is `NaN`, and
`NaN` travels on.

TypeScript run through TJS keeps plain JavaScript behaviour by default, so converting a file
changes nothing on its own. The comment `/* @tjs TjsStrict */` at the top of the file opts it
in to full TJS: every parameter type is checked on every call, and the rest of the TJS rules
apply too (`==` without coercion, for example). [TJS for TypeScript
Programmers](/tjs-for-ts/) covers what `TjsStrict` switches on, and [Converting a TypeScript
Project](/ts-converting-a-project/) describes the gentler route for a file you are migrating.

With the checks on, a bad argument is rejected where it enters: the function returns an
error value instead of running its body. That value is a `MonadicError`, TJS's error class,
a subclass of `Error` that is returned rather than thrown. Returning it means there is no
exception to unwind and no `try`/`catch` to forget: the error travels on as an ordinary value
until something checks for it. When the shared TJS runtime is installed, it also keeps a
record of recent errors (`__tjs.errors()`) in case nothing does.

```ts:inline
/* @tjs TjsStrict */

// In a real module: import { isMonadicError } from 'tjs-lang/runtime'
declare function isMonadicError(
  value: unknown
): value is Error & { path: string; expected?: string; actual?: string }

function divide(a: number, b: number): number {
  if (b === 0) return NaN
  return a / b
}

function half(n: number): number {
  console.log('half ran') // skipped when given an error
  return n / 2
}

// Valid calls work normally
console.log('10 / 2 =', divide(10, 2))
console.log('10 / 0 =', divide(10, 0))

// A bad argument is rejected: divide returns an error instead of running.
// tsc types the result as number, so widen it to say what can come back.
const result: number | Error = divide('ten' as any, 2)

if (isMonadicError(result)) {
  console.log('message:', result.message)
  console.log('path:', result.path)
  console.log('expected:', result.expected, 'actual:', result.actual)
}

// Skip the check, and the next checked function hands the error back
const halved = half(result as number)
console.log('halved is result:', halved === result)

// Operators and templates do not check: the error turns into text
console.log(`template: ${result}`)
console.log('plus one:', (result as number) + 1)
```

It prints:

```text
10 / 2 = 5
10 / 0 = NaN
message: Expected number for '<source>:8:divide.a', got string
path: <source>:8:divide.a
expected: number actual: string
halved is result: true
template: MonadicError: Expected number for '<source>:8:divide.a', got string
plus one: MonadicError: Expected number for '<source>:8:divide.a', got string1
```

## What to notice

- **The declared return type is not the whole truth.** `divide` says it returns `number`,
  but under `TjsStrict` any checked function can also return a `MonadicError`, and `tsc`
  cannot know that. Where a call can receive outside data, type the result as
  `number | Error` and test it with `isMonadicError`, as the example does; `tsc` then
  narrows it to the error inside the `if` and makes you deal with the union elsewhere.
- **Use `isMonadicError`, not `instanceof Error`.** `instanceof Error` is also true of any
  ordinary `Error`, so it cannot tell a rejected argument from some other failure.
  `isMonadicError` (exported by `tjs-lang/runtime`) matches only TJS errors, and it works
  across separate copies of the runtime, where `instanceof` can be false. The example
  declares it instead of importing it only because it runs on this page, where the TJS
  output already defines it.
- **The error says where it was rejected.** The message gives the type expected, the
  location of the check, and the type received. The location is
  `<source>:8:divide.a`: the file (shown as `<source>` here because the example has no
  file name; a real module shows its own), the line where `divide` is defined, and the
  function and parameter. It is the function that refused the value, not the call site, so
  it tells you which parameter of which function rejected it. The same parts are fields on
  the error: `path`, `expected` and `actual`.
- **A checked function hands an error straight back.** When a function receives a
  `MonadicError` for a checked parameter, it returns that same error immediately without
  running its body. That is why `half ran` never prints and `halved === result` is `true`.
  It depends on the parameter being checked: a parameter typed `any` checks nothing, so a
  function taking `any` runs and receives the error as an ordinary value.
- **`10 / 0` is not an error.** The types are right, so the check passes, and the
  function's own logic decides what to return. Runtime checks validate types, not
  business rules; those are still yours to write.

## The gotcha

Only checked parameters pass an error on. Everything else treats it as an ordinary object,
and that happens in two places:

- **Operators and templates in your own TJS code.** A template literal turns the error
  into its text, `MonadicError: Expected number for …`. `+ 1` does the same: an `Error`
  plus a number is string concatenation, not `NaN`, so the result is the message with a
  `1` stuck on the end. Either string goes on into whatever page, log or database it was
  built for.
- **Code that is not TJS.** A plain JavaScript library has no checks, so it receives the
  error as an object like any other and does whatever it does with it.

So check results at the edges of your TJS code, where they leave for a template, an
operator or a library that does not know about monadic errors:

```javascript
const total = divide(input.amount, input.parts)
if (isMonadicError(total)) {
  log.warn(total.message)
  return { status: 400, error: total.message }
}
render(`Each part: ${total}`)
```

## Cost and opting out

A check costs a little on every call. On a function that does almost nothing, a checked
call measures up to about twice an unchecked one; next to real work the difference is
noise ([Performance](/performance/) has the measurements). The checks are per file: a file
without `/* @tjs TjsStrict */` keeps plain JavaScript behaviour. In native `.tjs` code, a
`!` marker skips the check for one function; [Safety & Validation](/safety-validation/)
covers the per-function and per-file levels.
