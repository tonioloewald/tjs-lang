<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 6, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Async Functions

Typed parameters on `async` functions, and how type errors travel through promises.

An `async function` in TJS is a JavaScript async function with a checked signature. The
parameters are validated when the function is called, the same as for any other TJS
function. The return annotation describes the value the promise _resolves_ to, not the
promise itself:

```tjs:inline
async function fetchUser(id: 'user-1'): { name: '', email: '' } {
  // Stands in for a real request
  await new Promise(resolve => setTimeout(resolve, 100))
  return {
    name: 'User ' + id,
    email: id + '@example.com'
  }
}

async function fetchUsers(ids: ['']): [{ name: '', email: '' }] {
  return Promise.all(ids.map(id => fetchUser(id)))
}

console.log(await fetchUsers(['alice', 'bob', 'charlie']))
```

There is no `Promise<…>` spelling. You `await` the call and get the value, so the
annotation shows the value. `Promise.all` composes as it does in JavaScript: `fetchUsers`
starts one `fetchUser` per id and waits for all of them, and its own `ids: ['']` parameter
is checked before any of them start.

The last line uses `await` outside any function. That is top-level await: it works in ES
modules and in the examples on this page, which run inside an async wrapper. A classic
`<script>` or a CommonJS file does not allow it; there, put the code in an `async`
function and call it.

## Type errors resolve; they do not reject

A type error in a synchronous TJS function is a returned value, a `MonadicError`. In an
async function the call still returns a promise, and that promise _resolves_ to the
`MonadicError`. It does not reject, so a `try`/`catch` around the `await` will not see it,
and in `Promise.all` one bad input is one error among the results rather than a rejection
that discards the good ones:

```tjs:inline
async function loadScore(player: 'ada'): 30 {
  await new Promise(resolve => setTimeout(resolve, 10))
  return player.length * 10
}

// A good call resolves to the value
console.log('loadScore("ada"):', await loadScore('ada'))

// A bad call does not throw: the promise RESOLVES to a MonadicError
const pending = loadScore(42)
console.log('is a promise:', pending instanceof Promise)
const result = await pending
console.log('resolved to:', String(result))
console.log('isMonadicError:', isMonadicError(result))

// In Promise.all, one bad input is one error value, not a rejection
const scores = await Promise.all([loadScore('bo'), loadScore(7), loadScore('cy')])
console.log('scores:', scores.map(s => isMonadicError(s) ? 'error' : s))
```

The habit is the same as for synchronous code: check the awaited value with
`isMonadicError()` where you use it.

A failure inside the body is different. A failed request, a `JSON.parse` of bad text or an
explicit `throw` is an ordinary JavaScript exception, and the promise rejects as it would
in JavaScript. TJS changes how _type_ errors are reported, nothing else.

## Errors pass through a chain of steps

When a TJS function receives a `MonadicError` as an argument, it returns that error
without running its body (see [Error Handling](/error-handling/)). Async functions do the
same, so a chain of awaited steps needs one check at the end, not one per step:

```tjs:inline
async function findUser(id: 'u1'): { id: '', name: '' } {
  await new Promise(resolve => setTimeout(resolve, 10))
  return { id, name: 'User ' + id }
}

async function greeting(user: { id: '', name: '' }): '' {
  return 'Hello, ' + user.name
}

// Good input: each step's resolved value feeds the next step
console.log(await greeting(await findUser('u1')))

// Bad input: findUser resolves to a MonadicError, and greeting
// hands that same error back instead of running its body
const err = await findUser(404)
const out = await greeting(err)
console.log('same error:', out === err)
console.log(String(out))
```

## Checking what comes back

By default the resolved value is not checked. Parameters are validated on the way in, but
an async function that returns the wrong shape hands it to the caller unchanged. To check
the result as well, write the return annotation with `:?`. The promise then resolves to a
`MonadicError` when the result does not match:

```tjs:inline
async function loadConfig(name: 'app'):? { port: 8080 } {
  await new Promise(resolve => setTimeout(resolve, 10))
  // A bug: for one name, the port comes back as a string
  return name === 'app' ? { port: 8080 } : { port: '8080' }
}

console.log('app:', await loadConfig('app'))
const bad = await loadConfig('legacy')
console.log('legacy is an error:', isMonadicError(bad))
console.log(String(bad))
```

The error names the field that failed (`loadConfig:return.port`). Use `:?` where a result
comes from somewhere you do not control, such as a server or a file; it costs a check on
every call.

## A real request

The same pieces with a real network call. This asks
[Open-Meteo](https://open-meteo.com) for the current temperature in Berlin. It needs no
API key and accepts requests from any page:

```tjs:inline
async function currentTemperature(
  latitude: 52.52,
  longitude: 13.41
):! { celsius: 0.0, time: '' } {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`
  const response = await fetch(url)
  if (!response.ok) {
    // A failed request is a real failure: throw, and the promise rejects
    throw new Error(`Open-Meteo answered ${response.status}`)
  }
  const data = await response.json()
  return { celsius: data.current.temperature_2m, time: data.current.time }
}

try {
  const berlin = await currentTemperature(52.52, 13.41)
  console.log(`Berlin: ${berlin.celsius}°C at ${berlin.time}`)
} catch (e) {
  console.log('request failed:', e.message)
}

// A type error never reaches the network: it resolves to a MonadicError
const wrong = await currentTemperature('Berlin', 13.41)
console.log(String(wrong))
```

Both kinds of failure appear here. A network or server failure rejects, so it is caught by
`try`/`catch`. A wrong argument resolves to a `MonadicError` before `fetch` is called. The
`:!` on the return says "this is the shape, do not treat it as a worked example": the
temperature changes, so no fixed value would be true.

For a larger program built on async calls, a client talking to a typed API, see the Full
Stack examples, starting with [the Todo API](/full-stack-demo-todo-api/).

## Gotchas

- **The return example is not run.** For a synchronous function, `: 30` is a worked
  example: the function is called with its parameter examples when the file is built, and
  the result must equal `30`. An async function's result is a promise, so the build does
  not run it, and an async return example that is wrong is not reported. Keep it truthful
  anyway; it is what the documentation and the metadata show.
- **Only `:?` checks the resolved value.** With `:` or `:!`, a wrong result reaches the
  caller unchanged.
- **`try`/`catch` does not see type errors.** It sees rejections, which come from the body.
  Check type errors with `isMonadicError()`.
- **AJS is different.** In AJS, network access and timers are capabilities the host passes
  in, and the same shapes are written with atoms; see the AJS book.
