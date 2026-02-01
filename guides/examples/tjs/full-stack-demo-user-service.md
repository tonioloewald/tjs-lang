<!--{"section":"tjs","type":"example","group":"fullstack","order":12}-->

# Full-Stack Demo: User Service

A complete backend service with typed endpoints - save this first!

```tjs
/**
 * # User Service
 *
 * A complete backend service running in the browser.
 * Save this module as "user-service", then run the client example.
 *
 * Features:
 * - Type-safe endpoints with validation
 * - In-memory data store
 * - Full CRUD operations
 */

// In-memory store (would be a real DB in production)
const users = new Map()
let nextId = 1

// Create a new user
export function createUser(input: {
  name: 'Alice',
  email: 'alice@example.com'
}) -> { id: 0, name: '', email: '', createdAt: '' } {
  const user = {
    id: nextId++,
    name: input.name,
    email: input.email,
    createdAt: new Date().toISOString()
  }
  users.set(user.id, user)
  return user
}

// Get user by ID (returns empty object if not found - union types not yet supported)
export function getUser(input: { id: 1 }) -> { id: 0, name: '', email: '', createdAt: '' } {
  return users.get(input.id) || { id: 0, name: '', email: '', createdAt: '' }
}

// Update a user (returns empty object if not found - union types not yet supported)
export function updateUser(input: {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com'
}) -> { id: 0, name: '', email: '', createdAt: '' } {
  const existing = users.get(input.id)
  if (!existing) return { id: 0, name: '', email: '', createdAt: '' }

  const updated = { ...existing, name: input.name, email: input.email }
  users.set(input.id, updated)
  return updated
}

// Delete a user
export function deleteUser(input: { id: 1 }) -> { success: true, deleted: 0 } {
  const existed = users.has(input.id)
  users.delete(input.id)
  return { success: existed, deleted: existed ? input.id : 0 }
}

// List all users
export function listUsers(input: { limit: 10, offset: 0 })
  -> { users: [{ id: 0, name: '', email: '', createdAt: '' }], total: 0 } {
  const all = [...users.values()]
  const slice = all.slice(input.offset, input.offset + input.limit)
  return { users: slice, total: all.length }
}

// Search users by name
export function searchUsers(input: { query: '' })
  -> { users: [{ id: 0, name: '', email: '', createdAt: '' }] } {
  const query = input.query.toLowerCase()
  const matches = [...users.values()].filter(u =>
    u.name.toLowerCase().includes(query)
  )
  return { users: matches }
}

// Test the service
test('createUser creates user with ID') {
  const user = createUser({ name: 'Test', email: 'test@test.com' })
  expect(user.id).toBeGreaterThan(0)
  expect(user.name).toBe('Test')
}

test('getUser returns created user') {
  const created = createUser({ name: 'Bob', email: 'bob@test.com' })
  const fetched = getUser({ id: created.id })
  expect(fetched?.name).toBe('Bob')
}

test('updateUser modifies user') {
  const user = createUser({ name: 'Original', email: 'orig@test.com' })
  const updated = updateUser({ id: user.id, name: 'Updated', email: 'new@test.com' })
  expect(updated?.name).toBe('Updated')
}

test('deleteUser removes user') {
  const user = createUser({ name: 'ToDelete', email: 'del@test.com' })
  const result = deleteUser({ id: user.id })
  expect(result.success).toBe(true)
  expect(getUser({ id: user.id })).toBe(null)
}

// Demo
console.log('=== User Service Demo ===\\n')

const alice = createUser({ name: 'Alice', email: 'alice@company.com' })
console.log('Created:', alice)

const bob = createUser({ name: 'Bob', email: 'bob@company.com' })
console.log('Created:', bob)

const carol = createUser({ name: 'Carol', email: 'carol@company.com' })
console.log('Created:', carol)

console.log('\\nAll users:', listUsers({ limit: 10, offset: 0 }))
console.log('\\nSearch "ob":', searchUsers({ query: 'ob' }))

// Type validation in action
console.log('\\nType validation test:')
const badResult = createUser({ name: 123 }) // Wrong type
console.log('Bad input result:', badResult) // Returns $error object
```
