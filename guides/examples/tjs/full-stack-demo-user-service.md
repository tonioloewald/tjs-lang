<!--{"section": "tjs", "type": "example", "group": "fullstack", "order": 12, "parent": "tjs-fullstack.md"}-->

# Full-Stack Demo: User Service

A complete backend service with typed endpoints - save this first!

<!-- TODO review -->
```tjs:inline
/#
## User Service

A complete backend service running in the browser.
Save this module as "user-service", then run the client example.

Features:
- Type-safe endpoints with validation
- In-memory data store
- Full CRUD operations
#/

// In-memory store (would be a real DB in production)
const users = new Map()
let nextId = 1

// Create a new user
export function createUser(input: {
  name: 'Alice',
  email: 'alice@example.com'
}):! { id: 0, name: '', email: '', createdAt: '' } {
  const user = {
    id: nextId++,
    name: input.name,
    email: input.email,
    // Raw `Date` is not allowed in .tjs; LegacyDate is the named escape.
    createdAt: LegacyDate().toISOString()
  }
  users.set(user.id, user)
  return user
}

// Get user by ID (null if there is no such user)
export function getUser(input: { id: 1 }):! { id: 0, name: '', email: '', createdAt: '' } | null {
  return users.get(input.id) ?? null
}

// Update a user (null if there is no such user)
export function updateUser(input: {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com'
}):! { id: 0, name: '', email: '', createdAt: '' } | null {
  const existing = users.get(input.id)
  if (!existing) return null

  const updated = { ...existing, name: input.name, email: input.email }
  users.set(input.id, updated)
  return updated
}

// Delete a user
export function deleteUser(input: { id: 1 }):! { success: true, deleted: 0 } {
  const existed = users.has(input.id)
  users.delete(input.id)
  return { success: existed, deleted: existed ? input.id : 0 }
}

// List all users
export function listUsers(input: { limit: 10, offset: 0 }):! { users: [{ id: 0, name: '', email: '', createdAt: '' }], total: 0 } {
  const all = [...users.values()]
  const slice = all.slice(input.offset, input.offset + input.limit)
  return { users: slice, total: all.length }
}

// Search users by name
export function searchUsers(input: { query: '' }):! { users: [{ id: 0, name: '', email: '', createdAt: '' }] } {
  const query = input.query.toLowerCase()
  const matches = [...users.values()].filter(u =>
    u.name.toLowerCase().includes(query)
  )
  return { users: matches }
}

// Test the service
test 'createUser creates user with ID' {
  const user = createUser({ name: 'Test', email: 'test@test.com' })
  expect(user.id).toBeGreaterThan(0)
  expect(user.name).toBe('Test')
}

test 'getUser returns created user' {
  const created = createUser({ name: 'Bob', email: 'bob@test.com' })
  const fetched = getUser({ id: created.id })
  expect(fetched.name).toBe('Bob')
}

test 'updateUser modifies user' {
  const user = createUser({ name: 'Original', email: 'orig@test.com' })
  const updated = updateUser({ id: user.id, name: 'Updated', email: 'new@test.com' })
  expect(updated.name).toBe('Updated')
}

test 'deleteUser removes user' {
  const user = createUser({ name: 'ToDelete', email: 'del@test.com' })
  const result = deleteUser({ id: user.id })
  expect(result.success).toBe(true)
  expect(getUser({ id: user.id })).toBe(null)
}

test 'a wrong input type is an error value, not a crash' {
  const bad = createUser({ name: 123, email: 'x@example.com' })
  expect(bad instanceof Error).toBe(true)
}

// Demo
console.log('=== User Service Demo ===\n')

const alice = createUser({ name: 'Alice', email: 'alice@company.com' })
console.log('Created:', alice)

const bob = createUser({ name: 'Bob', email: 'bob@company.com' })
console.log('Created:', bob)

const carol = createUser({ name: 'Carol', email: 'carol@company.com' })
console.log('Created:', carol)

console.log('\nAll users:', listUsers({ limit: 10, offset: 0 }))
console.log('\nSearch "ob":', searchUsers({ query: 'ob' }))

// Type validation in action: the call returns an error VALUE
console.log('\nType validation test:')
const bad = createUser({ name: 123, email: 'x@example.com' })
console.log('createUser({ name: 123 }) ->', bad.message)
```

<!-- TODO review -->
## What to notice

- **Each endpoint's input is a typed object, given by example.** `createUser(input: { name:
  'Alice', email: 'alice@example.com' })` says the input must be an object with string `name`
  and `email`. The example values double as documentation of what a real request looks like.
- **A bad request is a value, not an exception.** The last line calls `createUser` with a
  number for `name`. The function body never runs; the call returns a `MonadicError` naming
  the path that failed (`createUser.input.name`), which the caller can inspect, log or pass
  back over the wire. Nothing throws, so one bad request cannot take a handler down.
- **The returns are `:!`, type-only.** A plain `:` return is a worked example: TJS would call
  `createUser` with the example input at build time and require the result to deep-equal the
  annotation. These endpoints mutate a store and stamp the time, so no fixed result could
  match; `:!` keeps the return shape as documentation without running it.
- **"Not found" is `null`.** `getUser` returns the record or `null`, and the return annotation
  says so with `| null`.
- **Tests travel with the module.** The `test` blocks run when the file is transpiled and
  are stripped from the output, so the service carries its own checks without shipping them.

<!-- TODO review -->
## A typed endpoint with defaults

Optional query parameters are the other half of most endpoints. An object-literal default
in TJS is a *dictionary*: each member has its own default, and a partial argument is merged
with them, so a caller can send only what it cares about:

```tjs:inline
const items = Array.from({ length: 25 }, (_, i) => `item ${i + 1}`)

function page(query = { limit: 10, offset: 0 }):! { items: [''], total: 0 } {
  const { limit, offset } = query
  return { items: items.slice(offset, offset + limit), total: items.length }
}

console.log('page()                ->', page().items.join(', '))
console.log('page({ offset: 20 })  ->', page({ offset: 20 }).items.join(', '))
console.log('page({ limit: 2 })    ->', page({ limit: 2 }).items.join(', '))

// Members are type-checked, so a string offset is refused before the body runs.
const bad = page({ offset: 'ten' })
console.log('page({ offset: "ten" }) ->', bad instanceof Error ? bad.message : bad)
```

`page({ offset: 20 })` gets `limit: 10` from the default; JavaScript would have replaced the
whole default object and left `limit` undefined. See [Dictionary
Defaults](/dictionary-defaults-example/) for the full rules.

<!-- TODO review -->
## Limits

- **The store is a `Map` in memory.** It lives as long as the page. In production the same
  functions would wrap a database; the signatures, validation and tests would not change.
- **Validation checks inputs, not return values.** By default TJS validates what comes *in*
  to a function (`safety inputs`). The `:!` returns here are not checked at runtime.
- **Running in the browser is not the same as being a server.** This module has no network
  boundary of its own. To expose it to other machines you still need a transport (an HTTP
  handler, or the AJS VM as in [The Universal Endpoint](/the-universal-endpoint/)).

Save this module as `user-service` in the playground, then run
[Full-Stack Demo: Client App](/full-stack-demo-client-app/), which imports it.
