<!--{"section": "ts", "type": "example", "group": "patterns", "order": 3, "parent": "ts-patterns.md"}-->
<!-- TODO review -->

# Union Types

"There may not be one" is the most common union in real code: a lookup that can miss, a
field that can be empty. TypeScript writes it `string | null`, and with `strictNullChecks`
on, the compiler makes you handle the `null` before you use the value. Once the program
runs, nothing checks it: a value from parsed JSON or a JavaScript caller can be anything.

The example below is TypeScript. On this page it goes through `fromTS`, the TypeScript to
TJS converter (`tjs convert` on the command line), and then through TJS to JavaScript, and
the result runs. The converter keeps each union. The first line, the `TjsStrict`
annotation, is a comment that `tsc` ignores and the converter reads: it makes this file
full TJS, so every parameter type becomes a check that runs on each call. `null` is then
accepted where the type allows it, and nowhere else. (See
[Turn on checks for one TypeScript file](../../../TJS-FOR-TS.md#turn-on-checks-for-one-typescript-file)
for what else `TjsStrict` changes.)

A failed check does not throw. The function returns an error value instead of its result:
a `MonadicError`, which is an `Error` subclass whose `.message` says what went wrong. That
is why the calls below test `instanceof Error` on a function declared to return `string`.

The page also covers the other two unions you meet in TypeScript: a closed set of string
literals, and a choice between types.

```ts:inline
// Converted TypeScript keeps JavaScript's behaviour until you opt in.
// The TjsStrict annotation turns the types below into runtime checks:
/* @tjs TjsStrict */

function findUser(id: number): string | null {
  // Simulated lookup
  if (id === 1) return 'Alice'
  if (id === 2) return 'Bob'
  return null
}

function greetOrWarn(name: string | null): string {
  if (name === null) {
    return 'User not found!'
  }
  return `Hello, ${name}!`
}

console.log('Find user 1:', findUser(1))
console.log('Find user 99:', findUser(99))

console.log('Greet user 1:', greetOrWarn(findUser(1)))
console.log('Greet user 99:', greetOrWarn(findUser(99)))

// `as any` stands in for a value TypeScript never saw: parsed JSON, a
// JavaScript caller, a cast elsewhere. Those are what the check catches.
// undefined is not null, so this returns an error value, not 'Hello, undefined!'
const missing = greetOrWarn(undefined as any)
console.log('Greet undefined:', missing instanceof Error ? missing.message : missing)

// Optional AND nullable: a string, null, or nothing at all
function greetAnyone(name?: string | null): string {
  return name == null ? 'Hello, whoever you are!' : `Hello, ${name}!`
}

console.log(greetAnyone(), '/', greetAnyone(null), '/', greetAnyone('Bob'))

// A union of string literals is a closed set
type Status = 'active' | 'inactive'

function label(status: Status): string {
  return status === 'active' ? 'Active' : 'Inactive'
}

console.log('label active:', label('active'))
const bad = label('archived' as any)
console.log('label archived:', bad instanceof Error ? bad.message : bad)

// A union of different types accepts any of its members
function describe(id: number | string): string {
  return `id ${id}`
}

console.log(describe(42), '/', describe('a-42'))
const wrong = describe(true as any)
console.log('describe true:', wrong instanceof Error ? wrong.message : wrong)
```

It prints:

```text
Find user 1: Alice
Find user 99: null
Greet user 1: Hello, Alice!
Greet user 99: User not found!
Greet undefined: Expected string for '<source>:12:greetOrWarn.name', got undefined
Hello, whoever you are! / Hello, whoever you are! / Hello, Bob!
label active: Active
label archived: Expected Status for '<source>:41:label.status', got string
id 42 / id a-42
describe true: Expected number | string for '<source>:50:describe.id', got boolean
```

Each message names the function, the parameter and the line it is declared on in the
TypeScript source, and the _type_ of what arrived (`got string`, not `got 'archived'`). For
`string | null` it says `Expected string`: `null` was allowed, so the string is what was
missing.

## What the converter writes

For the first two functions and `Status`, `fromTS` writes this TJS (the `/* line N */`
markers are left out):

```tjs:static
TjsStrict

function findUser(id: number):! string | null {
    // Simulated lookup
    if (id === 1)
        return 'Alice';
    if (id === 2)
        return 'Bob';
    return null;
}

function greetOrWarn(name: string | null):! string {
    if (name === null) {
        return 'User not found!';
    }
    return `Hello, ${name}!`;
}

Union Status 'Status' 'active' | 'inactive'
```

- **Parameter unions convert as written.** `name: string | null` stays
  `name: string | null`. TJS accepts bare type names such as `string` as well as examples.
- **Return types become `:!`.** A TJS return annotation is normally a worked example that
  is tested (`add(a: 2, b: 3): 5`). A TypeScript return type is a type, not an example, so
  the converter writes `:!`, which documents the result and checks nothing.
- **A named literal union becomes a `Union` declaration.** In
  `Union Status 'Status' 'active' | 'inactive'`, `Status` is the name, `'Status'` is a
  description (the converter reuses the name), and the rest are the members. It accepts those two strings and rejects every other one, including
  `'archived'`.
- **`name?: string | null` becomes `name: string | null | undefined`**, which accepts a
  string, `null`, or no argument, as `greetAnyone` shows.

## What is checked

With the `TjsStrict` annotation, **parameters are checked and return values are not.**
`findUser` could return `42` and nothing would complain, because its return annotation is
`:!`. If you need results checked, write the function in TJS and use `:?` on the return,
which runs the worked example and checks every result at run time (see
[Return types](../../../TJS-FOR-TS.md#return-types)).

Without the `TjsStrict` annotation, nothing is checked. Converted TypeScript keeps
JavaScript's behaviour by default, so delete the annotation and the three bad calls print
`Hello, undefined!`, `Inactive` and `id true`.

**The `null` test is plain JavaScript.** TypeScript narrows `name` to `string` after
`if (name === null) return …`. TJS has no static type checker, so there is nothing to
narrow: the `=== null` test is ordinary control flow. What TJS adds, with `TjsStrict`, is
the guarantee that `name` is a string or `null` when the function starts.

## The gotchas

**`null` is not `undefined`.** `string | null` accepts a string or `null` and rejects
`undefined`, as `greetOrWarn(undefined as any)` shows. That is usually what you meant,
because a missing value and a deliberately empty one are different facts. If a parameter
really may be either, make it optional as well as nullable, as `greetAnyone` does:
`name?: string | null`. Do not write `name: string | null | undefined`. A known converter
bug drops the `undefined` from that form, so it converts to `string | null` and rejects
`undefined` (card #3842, item 1, on the
[project board](https://virta.tosijs.net/host/#?virta.scope=tjs-lang)).

**Name your literal unions.** The converter turns a literal union into a `Union` only when
it is a named `type` alias. Written inline, it is not converted:

```text
function setStatus(status: 'active' | 'inactive'): string     // TypeScript

/* TODO: TS types degraded — status: 'active' | 'inactive' */  // converted TJS
function setStatus(status):! string
```

The parameter comes out with no type at all, so it accepts anything, even under
`TjsStrict`: `setStatus('archived')` returns `'archived'`. An interface field written the
same way becomes `status: any`. Search converted code for `TODO: TS types degraded` to find
these. The fix is to give the union a name, as `Status` has above, and use the name.

**Discriminated unions do not convert to a check.** A TypeScript union of object types,
such as `{ kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number }`, converts
to a `Type` that keeps the original as a comment and accepts any value. To get the check,
write it in TJS: one `Type` per variant, and one function per variant with the same name.

```tjs:inline
// Each variant is its own Type. Exactly('circle') means the string 'circle'
// and nothing else; a plain 'circle' would be an example of "any string".
Type Circle { example: { kind: Exactly('circle'), r: 1.0 } }
Type Rect { example: { kind: Exactly('rect'), w: 1.0, h: 1.0 } }

// Two functions with the same name merge into one that picks the
// declaration whose parameter type the argument matches.
function area(s: Circle) { return Math.PI * s.r ** 2 }
function area(s: Rect) { return s.w * s.h }

console.log(area({ kind: 'rect', w: 2, h: 3 }))
console.log(area({ kind: 'circle', r: 1 }).toFixed(4))

// A value that matches no variant is an error value, not a fall-through
const t = area({ kind: 'triangle', b: 2, h: 3 })
console.log(t instanceof Error ? t.message : t)
```

This prints `6`, then `3.1416`, then
`Expected no matching overload for 'area', got array of object`. TJS merges same-name
functions into one that calls the declaration whose parameter type the argument matches,
so there is no `switch` on `kind` to keep exhaustive. More in
[Discriminated unions](../../../TJS-FOR-TS.md#discriminated-unions) in TJS for TypeScript
Programmers.
