<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 6, "parent": "tjs-patterns.md"}-->

# Async Functions

Typed async/await patterns

```tjs:inline
// Async functions work naturally

async function fetchUser(id: 'user-1'): { name: '', email: '' } {
  // Simulated API call
  await new Promise(resolve => setTimeout(resolve, 100))
  return {
    name: 'User ' + id,
    email: id + '@example.com'
  }
}

async function fetchUsers(ids: ['']): [{ name: '', email: '' }] {
  return Promise.all(ids.map(id => fetchUser(id)))
}

// Run it
console.log(await fetchUsers(['alice', 'bob', 'charlie']))
```

<!-- TODO review -->
## What to notice

An `async function` takes typed parameters exactly like any other function, and the checks
run when it is called. Nothing about the signature changes: the
return example describes the value the promise _resolves_ to (`{ name: '', email: '' }`),
not `Promise<…>`. TJS has no special spelling for promises because it does not need one;
you `await` the call and get the value.

`Promise.all` composes the way it does in JavaScript. `fetchUsers` maps ids to calls and
awaits them together, and its own `ids: ['']` parameter is checked before any of them
start.

<!-- TODO review -->
## Errors arrive through the promise

A type error in a synchronous function is a returned value. In an async function it is a
_resolved_ value: the call still returns a promise, and the promise resolves to a
`MonadicError`. It does not reject, so there is nothing for a `try`/`catch` around the
`await` to catch, and in `Promise.all` one bad input is one error in the results rather than
a rejection that throws away the good ones:

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

So the habit is the same as for synchronous code: check the awaited value with
`isMonadicError()` where you consume it. A real failure in the body (a network error, a
`throw`) is still an ordinary JavaScript rejection; TJS only changes how _type_ errors are
reported.

<!-- TODO review -->
## Gotchas

- **The return example is not run as a test.** For a synchronous function, `: 30` is a
  worked example that runs when the file is transpiled. For an async one there is no result
  to compare at transpile time, so the return example documents the resolved type only; keep
  it truthful anyway, because it is what the docs and the metadata show.
- **The resolved value is not checked at runtime.** Parameters are validated on the way in;
  what the promise resolves to is not, so an async function that returns the wrong shape
  will hand it to the caller. Check the result where you consume it.
- **`setTimeout` in the examples stands in for real I/O.** Inside AJS, where network and
  timers are capabilities, the same shapes are written differently; see the AJS book.
