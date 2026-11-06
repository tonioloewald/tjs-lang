<!--{"parent": "ts-examples.md", "order": 2}-->
<!-- TODO review -->

# Validation

TJS converts a `.ts` file (with `fromTS`) into JavaScript that can keep its types as checks
that run when the code does. Your source stays TypeScript; the conversion is a build step
([Converting a Project](/ts-converting-a-project/) shows the pipeline). Those runtime checks
are the reason to put TypeScript through TJS at all.

They are off by default. Converted TypeScript keeps JavaScript's behaviour and validates
nothing, so it runs exactly as `tsc` output would. A `/* @tjs TjsStrict */` comment at the
top of a file opts that file in to full TJS, and from then on every parameter type is a check
that runs on every call, including calls with data the compiler never saw: JSON, form input,
anything cast with `as any`. ([`@tjs` annotations](/TJS-FOR-TS/) lists the others.)

```ts:inline
/* @tjs TjsStrict */

function half(n: number): number {
  console.log('half ran') // never printed below
  return n / 2
}

const order = JSON.parse('{"count": "10"}') // a string where a number belongs

const result: any = half(half(order.count)) // the outer call receives an error
if (result instanceof Error) console.log('rejected:', result.message)
else console.log('result:', result)
```

This prints one line, `rejected: Expected number for '…half.n', got string`, and `half ran`
never appears: the inner call refused the string, and the outer call refused the error it
was handed. Delete the `TjsStrict` line and it prints `half ran` twice, then `result: 2.5`:
JavaScript coerced `'10'` to a number and nothing noticed. (`result` is typed `any` because
`tsc` believes `half` always returns a number; see below.)

## What a failed check returns

A failed check does not throw. The function returns a `MonadicError`, a subclass of `Error`
that names the parameter, the type it expected and what it got. Test for it with
`isMonadicError(value)`, imported from `tjs-lang/runtime`, or with `instanceof Error`.

This means a function declared `: string` can return an error object, and the TypeScript
signature does not say so. `tsc` still believes the result is a `string`. The checks are for
data that arrives at run time, where `tsc` was never going to see it; test the result with
`isMonadicError` at the places where such data comes in.

Inside TJS code, an error passed on does not cause new ones. A checked function that receives
a `MonadicError` where it expects a typed value returns that error unchanged without running
its body. A parameter typed `any` or `unknown` is not checked, so a function with one runs
its body with the error as an ordinary value. Outside TJS (plain JavaScript, a library,
string concatenation) a `MonadicError` is an ordinary `Error` object, and nothing stops it
from being treated as data. That boundary is where you test for it.

## What it checks, and what it costs

Parameters are checked; return types are not. `fromTS` writes a TypeScript return type as a
type-only annotation, so a function that returns the wrong type returns it unchecked.

Primitive types, interfaces and object types (each member is checked; extra keys pass
through), and unions of those are checked. Types with no runtime form degrade to `any` and
check nothing: unconstrained generics (`<T>`), unions of literal values (`'a' | 'b'`),
utility types such as `Partial<T>`, and enum-typed parameters. The converter marks each one
with a `TODO: TS types degraded` comment, so you can find every check it could not make.
[TJS for TypeScript Programmers](/TJS-FOR-TS/) has the full table.

A check is cheap, and its cost is paid by the function being called, on every call. The
[Performance Guide](/performance/) shows the shape of that cost and how to skip the checks in
a function where you have measured a problem.

## The examples

<!-- prettier-ignore-start -->

<!-- toc -->
- [Runtime Validation](/ts-runtime-validation/)
- [Object Validation](/ts-object-validation/)
- [Optional Parameters](/ts-optional-parameters/)
- [Embedded Tests](/ts-embedded-tests/)
<!-- /toc -->

<!-- prettier-ignore-end -->

- **Runtime Validation**: primitive parameters checked on every call, and an error passed on
  without running the next function.
- **Object Validation**: an interface checked as a whole shape.
- **Optional Parameters**: `?` and `= default` survive conversion, and `undefined` is not
  `null`.
- **Embedded Tests**: the other way TJS checks a TypeScript file. Tests are written inside
  `/*test … */` comments, which `tsc` ignores; TJS runs them when it compiles the file, not
  when your code is called.
