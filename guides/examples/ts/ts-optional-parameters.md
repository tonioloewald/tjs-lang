<!--{"section": "ts", "type": "example", "group": "validation", "order": 4, "parent": "ts-validation.md"}-->
<!-- TODO review -->

# Optional Parameters

`?` and `= default` both survive conversion, `undefined` is not `null`, and every function
can tell you at runtime which of its parameters are required.

TypeScript has two ways to make a parameter optional: `greeting?: string`, which may be
`undefined`, and `punctuation: string = '!'`, which has a default. Both convert to TJS, and
both keep their meaning.

By default, converted TypeScript validates nothing: it behaves exactly like the JavaScript
`tsc` would emit. That is deliberate. Conversion should not change what your program does,
and full TJS changes more than validation (for example, `==` stops coercing, and object
defaults merge, as described at the end of this page). The first line of the example,
`/* @tjs TjsStrict */`, opts this one file in to full TJS, and the types become checks that
run on every call.

Whether or not you opt in, each function also carries a description of its parameters at
runtime: which are required, and what the defaults are. The example shows both.

```ts:inline
/* @tjs TjsStrict */

function createGreeting(
  name: string,
  greeting?: string,
  punctuation: string = '!'
): string {
  const g = greeting ?? 'Hello'
  return `${g}, ${name}${punctuation}`
}

// Every way TypeScript allows you to call it still works
console.log(createGreeting('World'))
console.log(createGreeting('World', 'Hi'))
console.log(createGreeting('World', undefined, '?'))
console.log(createGreeting('World', 'Hey', '...'))

// In real code, bad values arrive from parsed JSON, from JavaScript callers, or through
// `any`; `as any` stands in for that here. Calls that bypass TypeScript's checks now fail
// when they run. The error is returned, not thrown.
function show(result: unknown) {
  // `unknown` accepts anything, including the returned error
  console.log(result instanceof Error ? `error: ${result.message}` : result)
}
show(createGreeting('World', null as any)) // optional means "may be undefined", not "may be null"
show(createGreeting('World', 42 as any))
show(createGreeting('World', 'Hi', 3 as any))

// The function carries its own parameter metadata at runtime
console.log('\nFunction metadata:')
for (const [param, info] of Object.entries((createGreeting as any).__tjs.params)) {
  const { required, default: fallback } = info as any
  console.log(
    `  ${param}: ${required ? 'required' : 'optional'}` +
      (!required && 'default' in (info as any) ? `, default ${JSON.stringify(fallback)}` : '')
  )
}
```

It prints:

```text
Hello, World!
Hi, World!
Hello, World?
Hey, World...
error: Expected string | undefined for '<source>:3:createGreeting.greeting', got null
error: Expected string | undefined for '<source>:3:createGreeting.greeting', got number
error: Expected string for '<source>:3:createGreeting.punctuation', got number

Function metadata:
  name: required
  greeting: optional
  punctuation: optional, default "!"
```

The start of each error message names the source, the line of the function and the
parameter that failed.

## What the converter writes

Here is the signature before and after conversion:

```javascript
// TypeScript
function createGreeting(name: string, greeting?: string, punctuation: string = '!'): string

// TJS, as the converter writes it
function createGreeting(name: string, greeting: string | undefined, punctuation = '!'):! string
```

TJS describes types with example values: `name: 'Alice'` means "a string, like this one".
A bare type name such as `string` is also accepted and means the same thing, which is why
the converter can leave `name: string` as it is. The `:!` before the return type means "this
is the type of the result, not a worked example to test".

## What to notice

- **`greeting?: string` becomes `greeting: string | undefined`.** The parameter is
  optional, and when it is present it must be a string. The metadata records it as
  `required: false`.
- **`punctuation: string = '!'` becomes `punctuation = '!'`.** A default does two jobs in
  TJS: it is the value you get when the argument is omitted, and it is the example that sets
  the type. So the parameter is optional, defaults to `'!'`, and a value that is passed must
  be a string. That is why `3` is refused.
- **Errors are returned, not thrown.** A failed check makes the call return an error
  value instead of running the body, so the next line still runs. The value is a
  `MonadicError`, which extends `Error`: it has a `message`, plus `path` (where the check
  failed), `expected` and `actual`. Test for it with `instanceof Error`, as the example does,
  or with `isMonadicError` from `tjs-lang/runtime`.
- **The declared return type does not mention the error.** `createGreeting` is still typed
  as returning `string`, so TypeScript will let a caller call `.toUpperCase()` on an error.
  Check where untrusted data enters your program, a parsed response or a form, rather than
  after every call: an error passed into another checked TJS function comes straight back
  out, so a chain of calls can be checked once at the end.
- **Remove the `/* @tjs TjsStrict */` line** (you can edit the example above) and the three
  bad calls print `Hello, World!`, `42, World!` and `Hi, World3`: plain JavaScript
  behaviour. The metadata is there either way.

## The metadata

Every TJS function has a `__tjs` property. Its `params` entry maps each parameter name to a
description. For `punctuation` it is:

```javascript
{ type: { kind: 'string' }, required: false, default: '!' }
```

`greeting` has `required: false` and no `default` key; `name` has `required: true`. A
required parameter also carries `default: null`, which is why the example prints a default
only for optional parameters. Next to `params`, `__tjs` holds `returns` (the return type)
and `source` (the file and line).

`__tjs` is added by the transpiler, so TypeScript does not know about it; that is what the
`as any` casts are for. To turn it into something standard, `functionMetaToJSONSchema(fn.__tjs)`
from `tjs-lang/lang` gives a JSON Schema for the function's input and output, built from the
code that is actually running. [From Zod to TJS](../../sections/ts-from-zod.md) uses it.

## The gotcha: `null` that used to work

With `strictNullChecks`, TypeScript already refuses `null` for `greeting?: string`. What
changes under `TjsStrict` is that the rule is now enforced at runtime. The body uses `??`,
which treats `null` like `undefined`, so in the plain JavaScript output
`createGreeting('World', null)` quietly printed `Hello, World!`. Under `TjsStrict` the same
call returns an error, as the example shows.

An optional parameter accepts `undefined`, because that is what an omitted argument is, but
not `null`. If a caller may pass `null` on purpose, say so in the type:
`greeting?: string | null`.

## `TjsStrict` also changes object defaults

Under `TjsStrict` an _object_ default becomes a dictionary default: each member is
defaulted separately, and a partial argument is merged with the defaults. In
`function f(opts = { x: 0, y: 0 })`, calling `f({ x: 5 })` gives `{ x: 5, y: 0 }`. Without
`TjsStrict`, converted TypeScript keeps JavaScript's all-or-nothing default and gives
`{ x: 5 }`. This is a behaviour change, so check your object defaults when you opt a file
in. See [Converting a TypeScript Project](../../sections/ts-converting-a-project.md).
