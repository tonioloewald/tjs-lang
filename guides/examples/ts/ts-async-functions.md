<!--{"section": "ts", "type": "example", "group": "advanced", "order": 2, "parent": "ts-advanced.md"}-->

# Async Functions

Async/await works naturally

<!-- TODO review -->

An async function returns a `Promise`, so TypeScript annotates it `Promise<string>`. The
value worth describing is the string the promise resolves to; the promise itself is the same
for every async function. The converter unwraps the annotation: `Promise<string>` becomes
`string`, the type of what the function produces when it finishes. Everything else about
`async` and `await` is plain JavaScript and converts unchanged.

```ts:inline
// Async functions work naturally
// Promise<T> is unwrapped to T in return type

async function fetchData(url: string): Promise<string> {
  // Simulated fetch
  await new Promise(r => setTimeout(r, 100))
  return `Data from ${url}`
}

async function fetchMultiple(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(fetchData))
}

// Run the async functions
async function main() {
  console.log('Fetching single...')
  const single = await fetchData('/api/users')
  console.log('Result:', single)

  console.log('\nFetching multiple...')
  const multiple = await fetchMultiple(['/api/a', '/api/b', '/api/c'])
  console.log('Results:', multiple)
}

main()
```

<!-- TODO review -->

## What to notice

- **The return annotations are unwrapped.** `fetchData` converts to
  `async function fetchData(url: string):! string`, and `fetchMultiple` to `:! [string]`:
  "resolves to a string", "resolves to an array of strings". Native TJS writes async
  functions the same way.
- **`Promise.all(urls.map(fetchData))` passes a TJS function as a callback.** It works as
  any function would. `map` also passes an index and the array, and TJS ignores extra
  arguments just as JavaScript does.

<!-- TODO review -->

## The gotcha

An async function's parameters are checked when it is called, but the result of a failed
check still arrives the async way. With `/* @tjs TjsStrict */` at the top,
`fetchData(42 as any)` does not throw and does not reject: it returns a promise that
_resolves_ to a `MonadicError`. So `await fetchData(42 as any)` gives you the error as a
value, and a `.catch()` handler never sees it. Check the awaited result, the same way you
would check the result of an ordinary function.
