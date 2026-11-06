<!--{"parent": "TJS-FOR-TS.md", "order": 1}-->
<!-- TODO review -->

# TypeScript Examples

TypeScript in, TJS out: each example is real TypeScript, converted and run.

Every example in this section is ordinary TypeScript. The page does to it what you would do
to your own code, in two steps. `fromTS` (the converter, exported from
`tjs-lang/lang/from-ts`) turns the TypeScript into TJS; the TJS compiler then turns that
into JavaScript, which is what runs. So the pipeline is TS → TJS → JS. For what TJS itself
is, start at [TJS for TypeScript Developers](/tjs-for-ts/).

The examples are live. Open one's code with its **view/edit code** button, change it, and
choose **Refresh** from the example menu (or press ⌘R in the editor) to run it again.

## Faithful or checked

One line decides what you are looking at: `/* @tjs TjsStrict */` at the top of the file.

Without it, converted TypeScript keeps JavaScript's behaviour, and the file runs exactly as
`tsc` output would. That is the default so that converting a project cannot change what it
does: you can convert everything first and turn checking on one file at a time. The types
are not thrown away. Each converted function gets a `__tjs` property describing its
parameters and return type, which documentation and schema tools can read; nothing checks
calls against it.

With the line, the file becomes full TJS. Every parameter type is a check that runs on every
call, and TJS's other rules apply too: `==` stops coercing, `private` becomes real privacy,
and a class declared in the file is called without `new`. [TJS for TypeScript
Developers](/tjs-for-ts/) lists the differences.

This page calls the first kind **faithful** and the second **checked**. Every example that
demonstrates a rejection is checked. Delete the `TjsStrict` line from one and run it again to
see the same bad call go through unchecked; add the line to a faithful one to see what it
would have caught.

## When a check fails

Take a two-line function and a bad call. `tsc` rejects the call, so the example hides it
from `tsc` with `as any`, which is what a value arriving from JSON or an untyped library
looks like at runtime:

```typescript
/* @tjs TjsStrict */
function greet(name: string): string {
  return `Hello, ${name}!`
}

console.log(String(greet(42 as any)))
```

The function does not throw. It returns a `MonadicError`, a value that says which parameter
was wrong, what type it expected and what it got:

```text
MonadicError: Expected string for 'greet.ts:2:greet.name', got number
```

`greet.ts` is the file, `2` the line and `greet.name` the parameter. Code converted
without a file name, as in the live examples, shows `<source>` in its place.

Errors are values in TJS so that a bad argument cannot unwind the stack through code that
was never written to catch anything. The cost, when you migrate, is that a caller which
ignores the return value now carries on with an error object where it expected a string or
a number. So check it: `MonadicError` extends `Error`, so `result instanceof Error` works
anywhere, and code that imports the runtime can use
`import { isMonadicError } from 'tjs-lang/runtime'`. While debugging, call
`installRuntime()` and then `configure({ throwTypeErrors: true })`, both from the same
module, and a failed check throws instead. (Without `installRuntime()` the converted code
uses its own built-in copy of the runtime and ignores `configure`.)

A checked function that receives an error as an argument returns that error untouched
instead of running, so one bad value does not set off a chain of new ones:

```typescript
const r = greet(42 as any)
shout(r) === r // true, if shout is a checked function too
```

A faithful function does not do this. It receives the error as an ordinary value and runs
with it.

## The examples

The examples are grouped into four sections, from the basics of conversion to the parts of
TypeScript that have no runtime meaning. In the tables, **both** means the example shows the
same code twice: first faithful, then with the `TjsStrict` line.

### [Introduction](/ts-intro/)

What conversion does to a function, and how TypeScript's type names become runtime types.

| Example                                         | Kind     | What it shows                                             |
| ----------------------------------------------- | -------- | --------------------------------------------------------- |
| [Hello TypeScript](/ts-hello-typescript/)       | checked  | one function, one rejected call                           |
| [Multiple Functions](/ts-multiple-functions/)   | faithful | what conversion does to a file, and where the line would go |
| [Type Transformation](/ts-type-transformation/) | faithful | how TypeScript's type names become TJS examples           |

### [Validation](/ts-validation/)

The payoff: types that are checked when the program runs, and tests written in `/*test '…'
{ … }*/` comments, which `tsc` ignores and TJS runs.

| Example                                         | Kind    | What it shows                                                       |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------- |
| [Runtime Validation](/ts-runtime-validation/)   | checked | primitive parameters checked on every call                          |
| [Object Validation](/ts-object-validation/)     | checked | an interface checked as a whole shape                               |
| [Optional Parameters](/ts-optional-parameters/) | checked | `?` and default values                                              |
| [Embedded Tests](/ts-embedded-tests/)           | both    | `/*test` comments run either way; the last one tests a rejected call |

### [Patterns](/ts-patterns/)

Arrays, nested objects and nullable values, the shapes most real code is made of.

| Example                                   | Kind    | What it shows                                     |
| ----------------------------------------- | ------- | ------------------------------------------------- |
| [Array Operations](/ts-array-operations/) | both    | the same functions without checks, then with them |
| [Nested Objects](/ts-nested-objects/)     | checked | interfaces that refer to interfaces               |
| [Union Types](/ts-union-types/)           | checked | `T \| null` and unions of string literals         |

### [Advanced](/ts-advanced/)

Generics, async functions and classes, where TypeScript's types and the runtime part ways
most.

| Example                                     | Kind    | What it shows                                                          |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| [Generic Functions](/ts-generic-functions/) | both    | what survives of a type parameter                                      |
| [Async Functions](/ts-async-functions/)     | checked | a failed check resolves to a `MonadicError`; the promise does not reject |
| [Classes](/ts-classes/)                     | both    | the faithful class, then the checked one, which is called without `new`  |
| [The Full Picture](/ts-the-full-picture/)   | checked | everything above in one file                                           |

## Seeing the converted code

Open an example's code panel (the **view/edit code** button) and pick its **JS** tab to see
the JavaScript that ran. The panel has no tab for the TJS in between; where it matters, the
example's own sections ("What to notice", "What the converter writes") quote the TJS that
`fromTS` produced. To see it for your own file, run the converter that ships with the
`tjs-lang` package (see [Converting a Project](/ts-converting-a-project/)):

```bash
bunx tjs convert --emit-tjs greet.ts
```

The real output also carries a `/* tjs <- greet.ts */` header and `/* line N */` markers
(Converting a Project explains them), so the TJS quoted in the examples is trimmed.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Introduction](/ts-intro/)
- [Validation](/ts-validation/)
- [Patterns](/ts-patterns/)
- [Advanced](/ts-advanced/)
<!-- /toc -->

<!-- prettier-ignore-end -->
