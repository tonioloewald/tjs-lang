<!--{"parent": "ts-examples.md", "order": 4}-->
<!-- TODO review -->

# Advanced

These are the places where TypeScript's type system says the most and the runtime knows the
least. The examples in this section show what the converter (`fromTS`, which turns
TypeScript into TJS) keeps from each feature, and what is checked at run time afterwards.

One thing decides most of the answers. Converted code keeps JavaScript semantics, so by
default it checks nothing: it runs as it would after `tsc`. A file that starts with
`/* @tjs TjsStrict */` opts in, and then the types the converter kept are checked when a
function is called. A failed check does not throw: the call returns an error value (a
`MonadicError`, which is an `Error`).

The four examples, in order: Generic Functions shows which type parameters are kept and
which become `any`. Async Functions shows what an async function's parameters and resolved
value are checked against, and why a failed check resolves instead of rejecting. Classes
runs one class with and without `TjsStrict`: constructor and method parameters, `private`,
and calling a class without `new`. The Full Picture is a small order handler that puts it
all together.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Generic Functions](/ts-generic-functions/)
- [Async Functions](/ts-async-functions/)
- [Classes](/ts-classes/)
- [The Full Picture](/ts-the-full-picture/)
<!-- /toc -->

<!-- prettier-ignore-end -->

## What is checked after conversion

| TypeScript                                | As converted | With `TjsStrict`          | To get the check                                    |
| ----------------------------------------- | ------------ | ------------------------- | --------------------------------------------------- |
| `<T extends { id: number }>` (constraint) | not checked  | checked                   | add `TjsStrict`                                     |
| `<T>` (unconstrained)                     | not checked  | not checked (`any`)       | nothing to check: TJS checks values, not relations |
| async function parameters                 | not checked  | checked                   | add `TjsStrict`                                     |
| async function resolved value             | not checked  | not checked               | in native TJS, change `:!` to `:?`                  |
| class constructor and method parameters   | not checked  | checked                   | add `TjsStrict`                                     |
| parameter typed with an enum              | not checked  | not checked (`any`)       | in native TJS, write `(s: Status)`                  |
| discriminated union                       | not checked  | not checked               | in native TJS, one `Type` per variant               |

"Native TJS" means a `.tjs` file you write or keep yourself, rather than code converted from
TypeScript on the fly.

## Generics

A generic type parameter describes a relationship between types that no single value can
show, so the converter keeps what a value can show. A constraint becomes the example:
`byId<T extends { id: number }>(x: T)` converts to `byId(x: { id: 0.0 })`. Under
`TjsStrict`, `byId({ id: 'no' })` then returns a type error instead of running. An
unconstrained `<T>` becomes `any`, meaning nothing is checked at run time, and the converter
writes a comment above each function where that happened, such as
`/* TODO: TS types degraded — value: T, return: T */`. Search converted code for
`TS types degraded` to find them all.

## Async functions

`Promise<T>` describes a value that does not exist yet. The converter writes the resolved
type as a type-only return annotation: `async function load(n: number): Promise<string>`
becomes `async function load(n: number):! string`. `:!` states the type without checking
it, so the resolved value is documented, not validated, with or without `TjsStrict`. The
parameters are checked under `TjsStrict`, as any function's are.

## Classes

Constructor and method parameters keep their types, and under `TjsStrict` they are checked
when the constructor or method is called, as a function's are. `TjsStrict` changes two more
things: TypeScript's `private` becomes a real `#private` field, and the class is called
without `new`. [Classes](/ts-classes/) runs the same class both ways.

## Known gaps after conversion

Two TypeScript features convert, but conversion does not yet produce a check for them, even
under `TjsStrict`. The fix is to write the type in native TJS, not to turn on a mode.

**Enums.** Take two TypeScript enums, one string-valued and one numeric:

```typescript
enum Status {
  Active = 'active',
  Off = 'off',
}

enum Dir {
  Up,
  Down,
}

function describe(s: Status): string {
  return 'got ' + s
}
```

Each enum converts to a TJS `Enum`, a runtime object that holds the members and can check
whether a value is one of them (`Status.check(x)`). Members read as they do in TypeScript:
`Status.Active` is `'active'`, and the numeric enum keeps its reverse lookup (`Dir[1]` is
`'Down'`).

The parameter typed `Status` is not checked. The converter cannot yet use an enum as a
parameter type, so it drops the type and warns
`Unknown type 'Status' converted to 'any' - may need manual review`. The warning is printed
by `tjs convert` and returned in `fromTS(...).warnings`, and the converted code carries a
`TODO: TS types degraded — s: Status` comment above the function. `describe('bogus')` returns
`'got bogus'`, with `TjsStrict` or without.

To get the check, either call `Status.check(s)` yourself in the TypeScript, or take the file
to native TJS and write the parameter as `function describe(s: Status)`. There a value that
is not one of `Status`'s values returns a type error. See [Enums](/tjs-for-ts/#enums) for
the native form.

**Discriminated unions.** A type such as
`type Shape = { kind: 'circle'; r: number } | { kind: 'square'; side: number }` converts to
a `Type` (TJS's runtime type declaration) whose body is only the TypeScript, kept as a
`// TS:` comment. It has no example and no predicate, so it accepts any value, and
`area({ kind: 'tri' })` reaches the function body. The native TJS form declares one `Type`
per variant, with the discriminant made exact by `Exactly('circle')`, and a same-name
function for each; a value that matches no variant then returns an error. See
[Discriminated unions](/tjs-for-ts/#discriminated-unions).

For `T | null` and unions of string literals, see [Union Types](/ts-union-types/).
