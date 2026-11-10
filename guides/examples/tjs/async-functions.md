<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 6, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Async Functions

Typed parameters on `async` functions, and how type errors travel through promises.

An `async function` in TJS is a JavaScript async function with a checked signature. The
parameters are validated when the function is called, the same as for any other TJS
function. The return annotation describes the value the promise _resolves_ to, not the
promise itself.

As everywhere in TJS, the value after a colon is an _example_, not a type. `id: 'user-1'`
means "`id` is a string, for instance `'user-1'`"; it does not mean only `'user-1'` is
accepted. `ids: ['user-1']` means an array of strings, of any length. See
[TJS Syntax](/tjs-syntax/) for the full rules.

```tjs:inline
async function fetchUser(id: 'user-1'): { name: 'User user-1', email: 'user-1@example.com' } {
  // Stands in for a real request
  await new Promise(resolve => setTimeout(resolve, 100))
  return {
    name: 'User ' + id,
    email: id + '@example.com'
  }
}

async function fetchUsers(ids: ['user-1']): [{ name: 'User user-1', email: 'user-1@example.com' }] {
  return Promise.all(ids.map(id => fetchUser(id)))
}

console.log(await fetchUsers(['alice', 'bob', 'charlie']))
```

There is no `Promise<…>` spelling. You `await` the call and get the value, so the
annotation shows the value. `Promise.all` composes as it does in JavaScript: `fetchUsers`
starts one `fetchUser` per id and waits for all of them, and its own `ids` parameter is
checked before any of them start.

The last line uses `await` outside any function. That is top-level await: it works in ES
modules and in the examples on this page, which run inside an async wrapper. A classic
`<script>` or a CommonJS file does not allow it; there, put the code in an `async`
function and call it.

## Three kinds of return annotation

A return annotation can be written three ways. They mean the same thing on async and
synchronous functions, except that an async function's example is never run:

- `: value` is a worked example. For a synchronous function, TJS calls the function with
  its parameter examples when it transpiles the file (as `tjs check` does) and reports a failure if the result does not equal the value. For an async function
  this test is skipped. Either way, the result is not checked when the program runs.
- `:? value` also checks the result on every call, and returns an error value (a
  `MonadicError`, described in the next section) in place of a result of the wrong type.
- `:! value` describes the type only: no test and no runtime check.

The examples on this page keep their `:` values true even though they are not run, because
the value is what the documentation and the type metadata show.

## Type errors resolve; they do not reject

When a TJS function gets an argument of the wrong type, it does not throw. It returns a
`MonadicError` object describing what went wrong (see [Error Handling](/error-handling/)).
In an async function the call still returns a promise, and that promise _resolves_ to the
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
// String() prints the error's one-line message; logging the object prints a stack trace
console.log('resolved to:', String(result))
console.log('isMonadicError:', isMonadicError(result))

// In Promise.all, one bad input is one error value, not a rejection
const scores = await Promise.all([loadScore('bo'), loadScore(7), loadScore('cy')])
console.log('scores:', scores.map(s => isMonadicError(s) ? 'error' : s))
```

The habit is the same as for synchronous code: check the awaited value with
`isMonadicError()` where you use it. TJS provides `isMonadicError` in every `.tjs` file
with no import; plain JavaScript code imports it from `tjs-lang/runtime`.

All of this assumes the default settings. `configure({ throwTypeErrors: true })`, a
debugging option, makes type errors throw; then the promise rejects and `try`/`catch` does
see them.

A failure inside the body is different. A failed request, a `JSON.parse` of bad text or an
explicit `throw` is an ordinary JavaScript exception, and the promise rejects as it would
in JavaScript. In async code TJS changes only how _type_ errors are reported; exceptions
behave as they do in JavaScript.

## Errors pass through a chain of steps

When a TJS function receives a `MonadicError` for a typed parameter, it returns that error
without running its body. The idea is the same as `?.` in JavaScript: once one step has
failed, the steps after it pass the failure along instead of failing again with a
confusing message, and the error that comes out is the one that started it. Async
functions do the same, so a chain of awaited steps needs one check at the end, not one per
step:

```tjs:inline
async function findUser(id: 'u1'): { id: 'u1', name: 'User u1' } {
  await new Promise(resolve => setTimeout(resolve, 10))
  return { id, name: 'User ' + id }
}

async function greeting(user: { id: 'u1', name: 'User u1' }): 'Hello, User u1' {
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

// Forgetting the inner await: greeting is handed a Promise, not a user,
// and reports a type error of its own
console.log(String(await greeting(findUser('u1'))))
```

Each inner `await` is needed. A promise is not a `MonadicError`, so it does not pass
through: it is checked like any other argument and fails, because a promise has no `id` or
`name`.

Pass-through applies only to typed parameters. A function that should look at an error,
the place where an error becomes a message or a retry, takes the value in an untyped
parameter and checks it with `isMonadicError()`. [Error Handling](/error-handling/) shows
that pattern.

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

The error's path ends in `loadConfig:return.port`, naming the field that failed. Use `:?`
where a result comes from somewhere you do not control, such as a server or a file; it
costs a check on every call.

## A real request

The same pieces with a real network call. This asks
[Open-Meteo](https://open-meteo.com) for the current temperature in Berlin. It needs no
API key and accepts requests from any page. The answer comes from a server we do not
control, so the return uses `:?`:

```tjs:inline
async function currentTemperature(
  latitude: 52.52,
  longitude: 13.41
):? { celsius: 0.0, time: '' } {
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
`try`/`catch`. A wrong argument resolves to a `MonadicError` before `fetch` is called. If
Open-Meteo ever changed its response so that `celsius` came back missing or as text, `:?`
would turn that into a `MonadicError` too, instead of passing a bad value on.

The examples `52.52` and `0.0` have a decimal point, so they mean any number; a whole
number such as `52` is accepted as well. An example without a decimal point, such as `42`,
accepts only integers.

For a larger program built on async calls, a client talking to a typed API, see the Full
Stack examples, starting with [the Todo API](/full-stack-demo-todo-api/).

## Gotchas

- **The return example is not run.** For a synchronous function, `: 30` is a worked
  example, tested when TJS transpiles the file. An async function's result is a promise,
  so the test is skipped, and an async return example that is wrong is not reported. Keep
  it truthful anyway.
- **Only `:?` checks the resolved value.** With `:` or `:!`, a wrong result reaches the
  caller unchanged.
- **`try`/`catch` does not see type errors.** It sees rejections, which come from the body.
  Check type errors with `isMonadicError()`.
- **Await each step.** A promise passed where a value is expected is a type error, not a
  pass-through.
- **AJS is different.** AJS has no `async` or `await`: the VM awaits every atom call (a
  built-in operation the VM provides) for you. Network access is the `httpFetch` atom,
  which uses the `fetch` capability the host passes in, and AJS has no timers. See
  [AJS: the language](/docs-ajs/) and [Capabilities](/ajs-capabilities/).
