<!--{"section": "ts", "type": "example", "group": "validation", "order": 4, "parent": "ts-validation.md"}-->

# Optional Parameters

Optional params work in TS and TJS

<!-- TODO review -->

TypeScript has two ways to make a parameter optional: `greeting?: string`, which may be
`undefined`, and `punctuation: string = '!'`, which has a default. Both convert, and both
keep their meaning. What TJS adds is that the distinction survives into the running
program: each function carries a description of its parameters, including which are
required and what the defaults are, and this example prints it.

```ts:inline
// Optional parameters: TS ? syntax or default values

function createGreeting(
  name: string,
  greeting?: string,
  punctuation: string = '!'
): string {
  const g = greeting ?? 'Hello'
  return `${g}, ${name}${punctuation}`
}

// All these work
console.log(createGreeting('World'))
console.log(createGreeting('World', 'Hi'))
console.log(createGreeting('World', 'Hey', '...'))

// The function carries its own parameter metadata at runtime
console.log('\nFunction metadata:')
for (const [param, info] of Object.entries(createGreeting.__tjs.params)) {
  const { required, default: fallback } = info as any
  console.log(`  ${param}: ${required ? 'required' : 'optional'}` +
    (fallback !== undefined && fallback !== null ? `, default ${JSON.stringify(fallback)}` : ''))
}
```

<!-- TODO review -->

## What to notice

- **`greeting?: string` converts to `greeting: string | undefined`.** The parameter is
  optional, and when it is present it must be a string.
- **`punctuation: string = '!'` keeps both halves.** TJS accepts TypeScript's spelling of a
  type plus a default: the parameter is optional, defaults to `'!'`, and a value that is
  passed must be a string. In native TJS you can also write just `punctuation = '!'`, where
  the default is the example and the type follows from it.
- **`__tjs` is metadata, not magic.** Every TJS function has a `__tjs` property describing
  its parameters and return type. Documentation, JSON Schema output and editor tooling all
  read it from the function itself, so they cannot drift from the code.

<!-- TODO review -->

## The gotcha

TJS keeps `null` and `undefined` apart. An optional parameter accepts `undefined`, because
that is what an omitted argument is, but it does not accept `null`: with `/* @tjs TjsStrict */`
at the top, `createGreeting('World', null)` returns an error. If a caller may pass `null` on
purpose, say so in the type: `greeting?: string | null`.

In native TJS one more difference matters: an _object_ default is a dictionary. In
`function f(opts = { x: 0, y: 0 })`, calling `f({ x: 5 })` gives `{ x: 5, y: 0 }`, each
member defaulted on its own. Converted TypeScript keeps JavaScript's all-or-nothing default
until you choose otherwise; see
[Converting a TypeScript Project](../../sections/ts-converting-a-project.md).
