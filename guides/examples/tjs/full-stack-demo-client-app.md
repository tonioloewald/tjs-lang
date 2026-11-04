<!--{"section": "tjs", "type": "example", "group": "fullstack", "order": 13, "parent": "tjs-fullstack.md"}-->

# Full-Stack Demo: Client App

Frontend that calls the User Service - run after saving user-service!

> **Needs a second module.** This example imports the `user-service` module from the "User Service" example, which a single example on this
> page cannot load. Run it in the [playground](https://tjs-platform.web.app) after saving that
> module, or locally with `tjs run` beside it.

```tjs:static
/#
## Client Application

A frontend that calls the User Service.

**First:** Run the "User Service" example and save it as "user-service"
**Then:** Run this client to see full-stack in action

This demonstrates:
- Importing local TJS modules
- Type-safe service calls
- Error handling
#/

// Import from local module (saved in playground)
import { createUser, getUser, listUsers, searchUsers } from 'user-service'

// Helper to display results
function display(label: '', data: {}) {
  console.log(`\n${label}:`)
  console.log(JSON.stringify(data, null, 2))
}

// Main app
async function main() {
  console.log('=== Client App ===')
  console.log('Connecting to user-service...\n')

  // Create some users
  const user1 = createUser({ name: 'Dave', email: 'dave@startup.io' })
  display('Created user', user1)

  const user2 = createUser({ name: 'Eve', email: 'eve@startup.io' })
  display('Created user', user2)

  // Fetch a user
  const fetched = getUser({ id: user1.id })
  display('Fetched user', fetched)

  // List all
  const all = listUsers({ limit: 100, offset: 0 })
  display('All users', all)

  // Search
  const results = searchUsers({ query: 'eve' })
  display('Search results for "eve"', results)

  // Type error handling: the error comes back as a value; nothing is thrown
  console.log('\n--- Type Validation Demo ---')
  const badResult = createUser({ name: 999 })
  if (badResult instanceof Error) {
    console.log('Got a type error back:', badResult.message)
  }

  console.log('\n=== Full-Stack Demo Complete ===')
  console.log('Everything ran in the browser. No server. No build step.')
}

main()
```

<!-- TODO review -->
## What to notice

- **The import is the whole integration.** `import { createUser, … } from 'user-service'`
  pulls in the module you saved from the User Service example. There is no client SDK, no
  generated stubs and no schema file: the service's function signatures *are* its contract,
  and they are enforced on every call because the validation lives in the service's own
  emitted code.
- **Errors arrive as values.** `createUser({ name: 999 })` does not throw into `main`. It
  returns a `MonadicError` (which is an `Error`, so `instanceof Error` works), and the client
  decides what to do with it.
- **`display(label: '', data: {})` is typed too.** The client is TJS as well, so its own
  helpers get the same checks as the service.

<!-- TODO review -->
## The same pattern, on one page

A client of a typed service has three outcomes to handle: the data, "not found", and "you
sent the wrong thing". This version inlines a stand-in for the service so it runs here:

```tjs:inline
// A stand-in for the user-service module, so this example runs on its own.
const users = new Map([[1, { id: 1, name: 'Dave' }]])

function getUser(input: { id: 1 }):! { id: 0, name: '' } | null {
  return users.get(input.id) ?? null
}

// The client: three outcomes, three branches.
function show(input) {
  const user = getUser(input)
  if (user instanceof Error) return `bad request: ${user.message}`
  if (user === null) return `no user ${input.id}`
  return `found ${user.name}`
}

console.log(show({ id: 1 }))
console.log(show({ id: 7 }))
console.log(show({ id: 'one' }))
```

Check for the error first. A `MonadicError` is an object, so a client that tested only for
`null` would treat it as a user and read `undefined` fields off it.

<!-- TODO review -->
## Limits

- **`'user-service'` is a playground module name**, not an npm package. The playground
  resolves it to the module you saved. In a project, import the file by path (for example
  `./user-service.tjs`) with the Bun plugin or a build step that handles `.tjs`.
- **This is not a network call.** Client and service run in the same JavaScript context. The
  point of the demo is that the *contract* (typed inputs, error values) is the same one you
  would put behind HTTP; the transport is still yours to add.
