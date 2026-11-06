<!--{"section": "ts", "type": "example", "group": "advanced", "order": 2, "parent": "ts-advanced.md"}-->
<!-- TODO review -->

# Async Functions

The converter keeps only what the promise resolves to. Under `TjsStrict`, a bad argument
makes the promise resolve to an error. It does not reject.

An async function always returns a `Promise`, so TypeScript annotates it
`Promise<string>`. Every async function returns a Promise, so the wrapper carries no
information; the `string` inside is what matters. `fromTS`, the converter from TypeScript
to TJS, unwraps it:

```text
async function fetchData(url: string): Promise<string>   // TypeScript
async function fetchData(url: string):! string           // TJS, after fromTS
```

`:!` declares the return type without checking it (more on that below). It is not a
non-null assertion. Everything else about `async` and `await` is plain JavaScript and
converts unchanged.

By default a converted file keeps JavaScript semantics and checks nothing at run time;
`/* @tjs TjsStrict */` turns its parameter types into runtime checks. That changes how a
bad argument shows up. This example opts in, then makes two good calls and three bad ones.

```ts:inline
// One line opts this converted file in to runtime checks
// on parameter types (see Runtime Validation):
/* @tjs TjsStrict */

async function fetchData(url: string): Promise<string> {
  await new Promise(r => setTimeout(r, 100)) // stands in for a real fetch
  return `Data from ${url}`
}

async function fetchMultiple(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(fetchData))
}

async function main() {
  console.log('single:', await fetchData('/api/users'))
  console.log('multiple:', await fetchMultiple(['/api/a', '/api/b', '/api/c']))

  // A bad argument. `as any` stands in for data from JSON or a form,
  // which tsc never sees. If the promise rejected, bad would be this string.
  const bad: any = await fetchData(42 as any).catch(() => 'caught (does not happen)')
  console.log('bad is an Error:', bad instanceof Error)
  console.log('message:', bad.message)

  // Through fetchMultiple, the whole batch fails up front.
  const batch: any = await fetchMultiple(['/api/a', 42 as any])
  console.log('batch:', batch.message)

  // Through a raw map, each element is checked on its own call, and
  // Promise.all does not short-circuit: the error is one of the values.
  const mixed: any[] = await Promise.all(['/api/a', 42 as any].map(fetchData))
  console.log('mixed:', mixed.map(r => (r instanceof Error ? 'error' : r)))
}

main()
```

The output:

```text
single: Data from /api/users
multiple: [ "Data from /api/a", "Data from /api/b", "Data from /api/c" ]
bad is an Error: true
message: Expected string for '<source>:5:fetchData.url', got number
batch: Expected string for '<source>:10:fetchMultiple.urls[1]', got number
mixed: [ "Data from /api/a", "error" ]
```

In each message, `<source>` stands for the file name (run the converted file with
`tjs run ex.tjs` and it reads `ex.tjs`), and the number is the line of the function in the
snippet.

## What to notice

- **Both return annotations are unwrapped.** `fetchMultiple` converts to
  `async function fetchMultiple(urls: [string]):! [string]`: "resolves to an array of
  strings". `[string]` is not a tuple: in TJS it means an array of strings, the same thing
  as `string[]`. A bare type name like `string` is allowed in TJS and stays as written.
- **The good calls behave exactly as they would after `tsc`.** Without the `TjsStrict`
  line they print the same thing, and so do the bad calls: `fetchData(42)` would resolve to
  `'Data from 42'`.
- **`fetchMultiple` checks every element.** The batch call fails on `urls[1]` before
  `fetchData` is called at all. The raw `map` in the last call goes straight to `fetchData`,
  so only the bad element fails and the good one still runs.

## The gotcha: a failed check resolves, it does not reject

TJS reports a type error by returning it as a value (a `MonadicError`, a subclass of
`Error`), not by throwing it. In an async function, that returned value becomes what the
promise resolves to. So `fetchData(42 as any)` returns a promise that _resolves_ to a
`MonadicError`. That is why the `.catch()` in the example never runs and `bad` is the error
itself, and why `Promise.all` in the last call resolves normally with the error as one of
its values.

If your TypeScript relies on `.catch()` or `try`/`catch` around `await` to handle bad
input, that handler will not see a TJS type error. Check the awaited value instead, as you
would the result of an ordinary function. `instanceof Error` works, because `MonadicError`
extends `Error`, but it is also true for any `Error` your own code returns. To ask only
"is this a TJS type error?", use `isMonadicError`:

```javascript
import { isMonadicError } from 'tjs-lang/runtime'

const result = await fetchData(input)
if (isMonadicError(result)) {
  // result.message names the parameter and what it got
}
```

Errors your own code throws, and rejections from things like a real `fetch`, still reject
as usual.

## Return types are declared, not checked

An async function that resolves to the wrong type is not caught, under `TjsStrict` or not.
TJS has three ways to write a return type:

- `:!` declares the type and checks nothing. This is what `fromTS` writes for every return
  type.
- `:?` checks the value at run time. On an async function, a wrong resolved value then
  becomes a `MonadicError`, like a bad argument.
- `:` is a worked example, run once at build time as a test. Build-time examples run
  synchronously, so on an async function it is not run.

To use `:?`, take the file on to native TJS: a `.tjs` file with the conversion annotation
removed. To test an async function from a `.ts` file, see Embedded Tests.
