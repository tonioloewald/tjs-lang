/**
 * Demo Navigation Component
 *
 * Sidebar with 4 accordion details blocks:
 * - AJS Examples (examples that open AJS playground)
 * - TJS Examples (examples that open TJS playground)
 * - AJS Docs (documentation that opens in floating viewer)
 * - TJS Docs (documentation that opens in floating viewer)
 */

import { Component, elements, ElementCreator, vars } from 'tosijs'
import {
  xinFloat,
  XinFloat,
  markdownViewer,
  MarkdownViewer,
  icons,
} from 'tosijs-ui'
import { examples as ajsExamples } from './examples'

const { div, details, summary, span, button } = elements

// TJS examples - demonstrating typed JavaScript features
export const tjsExamples = [
  {
    name: 'TJS Grammar Demo',
    description: 'Comprehensive example exercising all TJS syntax features',
    code: `/*
# TJS Grammar Demonstration

This example showcases **all TJS syntax features** for testing
syntax highlighting in editors.

## Features Covered
- Type annotations with examples
- Return type arrows
- test/mock/unsafe blocks
- Markdown in comments
*/

// Type annotations by example
function greet(name: 'World', times: 3) -> '' {
  /*
  ## Implementation Notes

  This function demonstrates:
  - Required parameters with example values
  - Return type annotation
  - Template literal usage
  */
  let result = ''
  let i = 0
  while (i < times) {
    result = result + \`Hello, \${name}! \`
    i = i + 1
  }
  return result.trim()
}

// Optional parameters use = instead of :
function divide(a: 10, b: 2, fallback = 0) -> 0 {
  if (b === 0) {
    return fallback
  }
  return a / b
}

// Schema-based types
function createUser(
  name: 'Alice',
  age: 30,
  email: 'alice@example.com',
  roles: ['user']
) -> { id: '', name: '', age: 0, email: '', roles: [''] } {
  return {
    id: 'user-' + Math.random().toString(36).slice(2),
    name,
    age,
    email,
    roles
  }
}

// Inline mock block - runs before each test
mock {
  // Setup test fixtures
  const testUser = { name: 'Test', age: 25 }
  const mockData = [1, 2, 3, 4, 5]
}

// Inline test blocks
test('greet returns proper greeting') {
  const result = greet('TJS', 2)
  expect(result).toBe('Hello, TJS! Hello, TJS!')
}

test('greet handles single repetition') {
  const result = greet('World', 1)
  expect(result).toBe('Hello, World!')
}

test('divide handles division') {
  expect(divide(10, 2)).toBe(5)
  expect(divide(15, 3)).toBe(5)
}

test('divide returns fallback on zero') {
  expect(divide(10, 0)).toBe(0)
  expect(divide(10, 0, -1)).toBe(-1)
}

test('createUser generates valid user') {
  const user = createUser('Bob', 35, 'bob@test.com', ['admin'])
  expect(user.name).toBe('Bob')
  expect(user.age).toBe(35)
  expect(user.roles).toContain('admin')
}

// Async test with await
test('async operations work in tests') {
  const delay = (ms) => new Promise(r => setTimeout(r, ms))
  await delay(10)
  expect(true).toBe(true)
}

// Unsafe function with (!) - skips all runtime validation
function fastAdd(! a: 0, b: 0) -> 0 {
  return a + b
}

// unsafe block for performance-critical code within a safe function
function fastSum(numbers: [0]) -> 0 {
  /*
  Parameters are validated, but the inner loop is unsafe.
  Skips runtime type validation for ~35x speedup.
  */
  unsafe {
    let sum = 0
    for (let i = 0; i < numbers.length; i++) {
      sum += numbers[i]
    }
    return sum
  }
}

test('fastSum calculates correctly') {
  expect(fastSum([1, 2, 3, 4, 5])).toBe(15)
  expect(fastSum([])).toBe(0)
}

// Union types with ||
function parseValue(input: '' || 0 || null) -> '' {
  if (input === null) {
    return 'null'
  }
  if (typeof input === 'number') {
    return \`number: \${input}\`
  }
  return \`string: \${input}\`
}

test('parseValue handles unions') {
  expect(parseValue('hello')).toBe('string: hello')
  expect(parseValue(42)).toBe('number: 42')
  expect(parseValue(null)).toBe('null')
}

// Array type examples
function processItems(items: ['']) -> { count: 0, first: '', last: '' } {
  return {
    count: items.length,
    first: items[0] || '',
    last: items[items.length - 1] || ''
  }
}

// Object spread and destructuring
function mergeConfig(base: { debug: false }, overrides: {}) -> {} {
  return { ...base, ...overrides }
}

/*
# Summary

This file demonstrates TJS syntax highlighting for:

| Feature | Syntax |
|---------|--------|
| Required param | \`name: 'example'\` |
| Optional param | \`name = 'default'\` |
| Return type | \`-> Type\` |
| Unsafe function | \`function foo(! x: 0) { }\` |
| Test block | \`test('desc') { }\` |
| Mock block | \`mock { }\` |
| Unsafe block | \`unsafe { }\` |
| Union type | \`Type1 \\|\\| Type2\` |

Check that all keywords and constructs are properly highlighted!
*/
`,
  },
  {
    name: 'Hello TJS',
    description: 'Simple typed greeting function',
    code: `// TJS: Type annotations via examples
// Use : for required params, = for optional

function greet(name: 'World') -> '' {
  return \`Hello, \${name}!\`
}

// The type metadata is attached to the function
console.log('Type info:', greet.__tjs)

// Call it
greet('TJS')`,
  },
  {
    name: 'Required vs Optional',
    description: 'Difference between : and = in parameters',
    code: `// In TJS:
//   param: 'default'  --> required, string type
//   param = 'default' --> optional with default

function createUser(
  name: 'anonymous',      // required string
  email: 'user@example.com', // required string
  age = 0,                // optional number, defaults to 0
  admin = false           // optional boolean, defaults to false
) -> { name: '', email: '', age: 0, admin: false } {
  return { name, email, age, admin }
}

// Must provide name and email
createUser('Alice', 'alice@example.com')`,
  },
  {
    name: 'Object Types',
    description: 'Typed object parameters and returns',
    code: `// Object types are inferred from examples
// Note: type annotations use flat objects

function getFullName(person: { first: '', last: '' }) -> '' {
  return person.first + ' ' + person.last
}

function createPoint(x: 0, y: 0) -> { x: 0, y: 0 } {
  return { x, y }
}

function distance(p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }) -> 0 {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Usage
const name = getFullName({ first: 'Jane', last: 'Doe' })
const origin = createPoint(0, 0)
const point = createPoint(3, 4)
const dist = distance(origin, point)

console.log('Name:', name)
console.log('Distance from origin:', dist)

dist`,
  },
  {
    name: 'Array Types',
    description: 'Working with typed arrays',
    code: `// Array types from example elements

function sum(numbers: [0]) -> 0 {
  return numbers.reduce((a, b) => a + b, 0)
}

function average(numbers: [0]) -> 0 {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}

function stats(data: [0]) -> { min: 0, max: 0, avg: 0 } {
  if (data.length === 0) {
    return { min: 0, max: 0, avg: 0 }
  }
  return {
    min: Math.min(...data),
    max: Math.max(...data),
    avg: average(data)
  }
}

stats([10, 20, 30, 40, 50])`,
  },
  {
    name: 'Higher-Order Functions',
    description: 'Functions that take or return functions',
    code: `// TJS handles higher-order functions
// Note: Function type annotations use simple syntax

function mapStrings(arr: [''], fn = (x) => x) -> [''] {
  return arr.map(fn)
}

function filterNumbers(arr: [0], predicate = (x) => true) -> [0] {
  return arr.filter(predicate)
}

function compose(f = (x) => x, g = (x) => x) -> 0 {
  // Returns a composed function, demo returns result
  const composed = (x) => f(g(x))
  return composed(5)
}

// Usage examples
const double = (x) => x * 2
const addOne = (x) => x + 1

// Map strings to uppercase
const words = mapStrings(['hello', 'world'], s => s.toUpperCase())

// Filter even numbers
const evens = filterNumbers([1, 2, 3, 4, 5, 6], x => x % 2 === 0)

// Compose functions: (5 * 2) + 1 = 11
const result = compose(addOne, double)

console.log('Mapped:', words)
console.log('Filtered:', evens)
console.log('Composed result:', result)

result`,
  },
  {
    name: 'Async Functions',
    description: 'Typed async/await patterns',
    code: `// Async functions work naturally

async function fetchUser(id: 'user-1') -> { name: '', email: '' } {
  // Simulated API call
  await new Promise(resolve => setTimeout(resolve, 100))
  return {
    name: 'User ' + id,
    email: id + '@example.com'
  }
}

async function fetchUsers(ids: ['']) -> [{ name: '', email: '' }] {
  return Promise.all(ids.map(id => fetchUser(id)))
}

// Run it
await fetchUsers(['alice', 'bob', 'charlie'])`,
  },
  {
    name: 'Error Handling',
    description: 'Type-safe error handling patterns',
    code: `// Result type pattern for error handling

function divide(a: 10, b: 2) -> { ok: true, value: 0, error: '' } {
  if (b === 0) {
    return { ok: false, value: 0, error: 'Division by zero' }
  }
  return { ok: true, value: a / b, error: '' }
}

function safeParse(json: '{}') -> { ok: true, data: null, error: '' } {
  try {
    return { ok: true, data: JSON.parse(json), error: '' }
  } catch (e) {
    return { ok: false, data: null, error: e.message }
  }
}

// Usage
const result = divide(10, 0)
if (result.ok) {
  console.log('Result:', result.value)
} else {
  console.log('Error:', result.error)
}

result`,
  },
  {
    name: 'Schema Validation',
    description: 'Using Schema for runtime type checking',
    code: `// TJS integrates with Schema for validation
import { Schema } from 'tosijs-schema'

// Define a schema
const UserSchema = Schema({
  name: 'anonymous',
  email: 'user@example.com',
  age: 0
})

// Validate data
function validateUser(data: { name: '', email: '', age: 0 }) -> { valid: true, errors: [''] } {
  const errors = []

  if (!UserSchema.validate(data)) {
    errors.push('Invalid user structure')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

validateUser({ name: 'Alice', email: 'alice@test.com', age: 30 })`,
  },
  {
    name: 'Date Formatting (with import)',
    description: 'Uses date-fns for date formatting via ESM import',
    code: `/**
 * # Date Formatting with Imports
 *
 * This example demonstrates importing an external ESM module
 * (date-fns) and using it with TJS type safety.
 */

import { format, formatDistance, addDays, parseISO } from 'date-fns'

// Format a date with various patterns
function formatDate(date: '2024-01-15', pattern: 'yyyy-MM-dd') -> '' {
  const parsed = parseISO(date)
  return format(parsed, pattern)
}

// Get human-readable relative time
function timeAgo(date: '2024-01-15') -> '' {
  const parsed = parseISO(date)
  return formatDistance(parsed, new Date(), { addSuffix: true })
}

// Add days to a date
function addWorkdays(date: '2024-01-15', days: 5) -> '' {
  const parsed = parseISO(date)
  const result = addDays(parsed, days)
  return format(result, 'yyyy-MM-dd')
}

// Complex date operation with validation
function createEvent(input: {
  title: 'Meeting',
  startDate: '2024-01-15',
  durationDays: 1
}) -> { title: '', start: '', end: '', formatted: '' } {
  const start = parseISO(input.startDate)
  const end = addDays(start, input.durationDays)

  return {
    title: input.title,
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
    formatted: \`\${input.title}: \${format(start, 'MMM d')} - \${format(end, 'MMM d, yyyy')}\`
  }
}

test('formatDate works with different patterns') {
  expect(formatDate('2024-01-15', 'yyyy-MM-dd')).toBe('2024-01-15')
  expect(formatDate('2024-01-15', 'MMMM d, yyyy')).toBe('January 15, 2024')
  expect(formatDate('2024-01-15', 'EEE')).toBe('Mon')
}

test('addWorkdays calculates correctly') {
  expect(addWorkdays('2024-01-15', 5)).toBe('2024-01-20')
  expect(addWorkdays('2024-01-15', 0)).toBe('2024-01-15')
}

test('createEvent formats event correctly') {
  const event = createEvent({
    title: 'Conference',
    startDate: '2024-06-10',
    durationDays: 3
  })
  expect(event.title).toBe('Conference')
  expect(event.start).toBe('2024-06-10')
  expect(event.end).toBe('2024-06-13')
}

// Run example
console.log('Format examples:')
console.log('  ISO:', formatDate('2024-01-15', 'yyyy-MM-dd'))
console.log('  Long:', formatDate('2024-01-15', 'MMMM d, yyyy'))
console.log('  Day:', formatDate('2024-01-15', 'EEEE'))

console.log('\\nRelative time:', timeAgo('2024-01-01'))

const event = createEvent({
  title: 'Launch Party',
  startDate: '2024-03-15',
  durationDays: 2
})
console.log('\\nEvent:', event.formatted)`,
  },
  {
    name: 'Lodash Utilities (with import)',
    description: 'Uses lodash-es for utility functions via ESM import',
    code: `/**
 * # Lodash Utilities with Type Safety
 *
 * Demonstrates using lodash-es with TJS runtime validation.
 */

import { groupBy, sortBy, uniqBy, debounce, chunk } from 'lodash-es'

// Group items by a key
function groupUsers(users: [{ name: '', dept: '' }], key: 'dept')
  -> { [key: '']: [{ name: '', dept: '' }] } {
  return groupBy(users, key)
}

// Sort items by property
function sortByAge(users: [{ name: '', age: 0 }]) -> [{ name: '', age: 0 }] {
  return sortBy(users, ['age'])
}

// Remove duplicates by property
function uniqueByEmail(users: [{ email: '', name: '' }]) -> [{ email: '', name: '' }] {
  return uniqBy(users, 'email')
}

// Chunk array into smaller arrays
function paginate(items: [''], pageSize: 10) -> [['']] {
  return chunk(items, pageSize)
}

// Process data pipeline
function processUserData(input: {
  users: [{ id: 0, name: '', email: '', dept: '' }]
}) -> {
  byDept: { [key: '']: [{ id: 0, name: '', email: '', dept: '' }] },
  unique: [{ id: 0, name: '', email: '', dept: '' }],
  count: 0
} {
  const unique = uniqBy(input.users, 'email')
  const byDept = groupBy(unique, 'dept')

  return {
    byDept,
    unique: sortBy(unique, ['name']),
    count: unique.length
  }
}

test('groupUsers groups by department') {
  const users = [
    { name: 'Alice', dept: 'eng' },
    { name: 'Bob', dept: 'sales' },
    { name: 'Carol', dept: 'eng' }
  ]
  const grouped = groupUsers(users, 'dept')
  expect(grouped.eng.length).toBe(2)
  expect(grouped.sales.length).toBe(1)
}

test('sortByAge sorts correctly') {
  const users = [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
    { name: 'Carol', age: 35 }
  ]
  const sorted = sortByAge(users)
  expect(sorted[0].name).toBe('Bob')
  expect(sorted[2].name).toBe('Carol')
}

test('uniqueByEmail deduplicates') {
  const users = [
    { email: 'a@b.com', name: 'Alice' },
    { email: 'a@b.com', name: 'Alice2' },
    { email: 'c@d.com', name: 'Carol' }
  ]
  const unique = uniqueByEmail(users)
  expect(unique.length).toBe(2)
}

test('paginate chunks correctly') {
  const items = ['a', 'b', 'c', 'd', 'e']
  const pages = paginate(items, 2)
  expect(pages.length).toBe(3)
  expect(pages[0]).toEqual(['a', 'b'])
  expect(pages[2]).toEqual(['e'])
}

// Run example
const users = [
  { id: 1, name: 'Alice', email: 'alice@co.com', dept: 'Engineering' },
  { id: 2, name: 'Bob', email: 'bob@co.com', dept: 'Sales' },
  { id: 3, name: 'Carol', email: 'carol@co.com', dept: 'Engineering' },
  { id: 4, name: 'Dave', email: 'alice@co.com', dept: 'Marketing' }, // dupe email
]

const result = processUserData({ users })
console.log('Unique users:', result.count)
console.log('Departments:', Object.keys(result.byDept))
console.log('Engineering team:', result.byDept['Engineering']?.map(u => u.name))`,
  },
  {
    name: 'Full-Stack Demo: User Service',
    description:
      'A complete backend service with typed endpoints - save this first!',
    code: `/**
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

// Get user by ID
export function getUser(input: { id: 1 }) -> { id: 0, name: '', email: '', createdAt: '' } | null {
  return users.get(input.id) || null
}

// Update a user
export function updateUser(input: {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com'
}) -> { id: 0, name: '', email: '', createdAt: '' } | null {
  const existing = users.get(input.id)
  if (!existing) return null

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
const badResult = createUser({ name: 123 } as any) // Wrong type
console.log('Bad input result:', badResult) // Returns $error object`,
  },
  {
    name: 'Full-Stack Demo: Client App',
    description:
      'Frontend that calls the User Service - run after saving user-service!',
    code: `/**
 * # Client Application
 *
 * A frontend that calls the User Service.
 *
 * **First:** Run the "User Service" example and save it as "user-service"
 * **Then:** Run this client to see full-stack in action
 *
 * This demonstrates:
 * - Importing local TJS modules
 * - Type-safe service calls
 * - Error handling
 */

// Import from local module (saved in playground)
import { createUser, getUser, listUsers, searchUsers } from 'user-service'

// Helper to display results
function display(label: '', data: {}) {
  console.log(\`\\n\${label}:\`)
  console.log(JSON.stringify(data, null, 2))
}

// Main app
async function main() {
  console.log('=== Client App ===')
  console.log('Connecting to user-service...\\n')

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

  // Type error handling
  console.log('\\n--- Type Validation Demo ---')
  const badResult = createUser({ name: 999 } as any)
  if (badResult.$error) {
    console.log('Caught type error:', badResult.message)
  }

  console.log('\\n=== Full-Stack Demo Complete ===')
  console.log('Everything ran in the browser. No server. No build step.')
}

main()`,
  },
  {
    name: 'Full-Stack Demo: Todo API',
    description: 'Complete REST-style Todo API with persistence',
    code: `/**
 * # Todo API Service
 *
 * A REST-style API for todo management.
 * Demonstrates a more complete service pattern.
 */

// Simulated persistence layer
const todos = new Map()
let nextId = 1

// Types
type Todo = { id: number, title: string, completed: boolean, createdAt: string }
type CreateInput = { title: 'Buy milk' }
type UpdateInput = { id: 1, title: 'Buy milk', completed: false }
type FilterInput = { completed: true } | { completed: false } | {}

// POST /todos - Create
export function createTodo(input: { title: 'New todo' })
  -> { id: 0, title: '', completed: false, createdAt: '' } {
  const todo = {
    id: nextId++,
    title: input.title,
    completed: false,
    createdAt: new Date().toISOString()
  }
  todos.set(todo.id, todo)
  return todo
}

// GET /todos/:id - Read one
export function getTodo(input: { id: 1 })
  -> { id: 0, title: '', completed: false, createdAt: '' } | null {
  return todos.get(input.id) || null
}

// GET /todos - Read all (with optional filter)
export function listTodos(input: { completed: true } | {})
  -> { todos: [{ id: 0, title: '', completed: false, createdAt: '' }] } {
  let items = [...todos.values()]

  if ('completed' in input) {
    items = items.filter(t => t.completed === input.completed)
  }

  return { todos: items }
}

// PUT /todos/:id - Update
export function updateTodo(input: { id: 1, title: '', completed: false })
  -> { id: 0, title: '', completed: false, createdAt: '' } | null {
  const existing = todos.get(input.id)
  if (!existing) return null

  const updated = {
    ...existing,
    title: input.title ?? existing.title,
    completed: input.completed ?? existing.completed
  }
  todos.set(input.id, updated)
  return updated
}

// DELETE /todos/:id - Delete
export function deleteTodo(input: { id: 1 }) -> { deleted: true } | { deleted: false } {
  const existed = todos.has(input.id)
  todos.delete(input.id)
  return { deleted: existed }
}

// PATCH /todos/:id/toggle - Toggle completion
export function toggleTodo(input: { id: 1 })
  -> { id: 0, title: '', completed: false, createdAt: '' } | null {
  const todo = todos.get(input.id)
  if (!todo) return null

  todo.completed = !todo.completed
  return todo
}

// DELETE /todos/completed - Clear completed
export function clearCompleted(input: {}) -> { cleared: 0 } {
  let cleared = 0
  for (const [id, todo] of todos) {
    if (todo.completed) {
      todos.delete(id)
      cleared++
    }
  }
  return { cleared }
}

// Tests
test('CRUD operations work') {
  const todo = createTodo({ title: 'Test todo' })
  expect(todo.id).toBeGreaterThan(0)
  expect(todo.completed).toBe(false)

  const fetched = getTodo({ id: todo.id })
  expect(fetched?.title).toBe('Test todo')

  const toggled = toggleTodo({ id: todo.id })
  expect(toggled?.completed).toBe(true)

  const deleted = deleteTodo({ id: todo.id })
  expect(deleted.deleted).toBe(true)
}

// Demo
console.log('=== Todo API Demo ===\\n')

// Create todos
createTodo({ title: 'Learn TJS' })
createTodo({ title: 'Build something cool' })
createTodo({ title: 'Ship it' })

console.log('Created 3 todos')
console.log('All:', listTodos({}))

// Complete first one
const first = listTodos({}).todos[0]
toggleTodo({ id: first.id })
console.log('\\nToggled first todo')
console.log('Completed:', listTodos({ completed: true }))
console.log('Pending:', listTodos({ completed: false }))

// Clear completed
console.log('\\nClearing completed...')
console.log(clearCompleted({}))
console.log('Remaining:', listTodos({}))`,
  },
  {
    name: 'The Universal Endpoint',
    description:
      'One endpoint. Any logic. Zero deployment. This is the whole thing.',
    code: `/**
 * # The Universal Endpoint
 *
 * This is the entire backend industry in 50 lines.
 *
 * What this replaces:
 * - GraphQL servers
 * - REST API forests
 * - Firebase/Lambda/Vercel Functions
 * - Kubernetes deployments
 * - The backend priesthood
 *
 * How it works:
 * 1. Client sends logic (not just data)
 * 2. Server executes it with bounded resources
 * 3. That's it. That's the whole thing.
 */

import { AgentVM, ajs, coreAtoms } from 'tosijs-agent'

// ============================================================
// THE UNIVERSAL ENDPOINT (This is the entire backend)
// ============================================================

export async function post(req: {
  body: {
    agent: '',      // The logic to execute (AJS source)
    args: {},       // Input data
    fuel: 1000      // Max compute units (like gas)
  },
  headers: { authorization: '' }
}) -> { result: {}, fuelUsed: 0, status: '' } | { error: '', fuelUsed: 0 } {

  // 1. Parse the agent (it's just code as data)
  let ast
  try {
    ast = ajs(req.body.agent)
  } catch (e) {
    return { error: \`Parse error: \${e.message}\`, fuelUsed: 0 }
  }

  // 2. Create VM with capabilities (this is what you monetize)
  const vm = new AgentVM({
    // Your database, your auth, your AI - exposed as capabilities
    // Agents can only do what you allow
  })

  // 3. Execute with bounded resources
  const result = await vm.run(ast, req.body.args, {
    fuel: Math.min(req.body.fuel, 10000),  // Cap fuel
    timeoutMs: 5000                         // Cap time
  })

  // 4. Return result (or error - but we didn't crash)
  if (result.error) {
    return {
      error: result.error.message,
      fuelUsed: result.fuelUsed,
    }
  }

  return {
    result: result.result,
    fuelUsed: result.fuelUsed,
    status: 'success'
  }
}

// ============================================================
// DEMO: Let's use it
// ============================================================

// Simulate the endpoint
const endpoint = post

// --- TEST 1: Simple computation (Success) ---
console.log('═══════════════════════════════════════════')
console.log('TEST 1: Simple Agent')
console.log('═══════════════════════════════════════════')

const simpleAgent = \`
  function compute({ x, y }) {
    let sum = x + y
    let product = x * y
    return { sum, product, message: 'Math is easy' }
  }
\`

const result1 = await endpoint({
  body: { agent: simpleAgent, args: { x: 7, y: 6 }, fuel: 100 },
  headers: { authorization: 'token_123' }
})

console.log('Agent: compute({ x: 7, y: 6 })')
console.log('Result:', result1.result)
console.log('Fuel used:', result1.fuelUsed)
console.log('Status: ✓ Success')


// --- TEST 2: Infinite loop (Fuel Exhausted) ---
console.log('\\n═══════════════════════════════════════════')
console.log('TEST 2: Malicious Agent (Infinite Loop)')
console.log('═══════════════════════════════════════════')

const maliciousAgent = \`
  function attack({ }) {
    let i = 0
    while (true) {
      i = i + 1
      // This would hang your Express server forever
      // This would cost you $10,000 on Lambda
      // This would crash your Kubernetes pod
    }
    return { i }
  }
\`

const result2 = await endpoint({
  body: { agent: maliciousAgent, args: {}, fuel: 50 },
  headers: { authorization: 'token_123' }
})

console.log('Agent: while (true) { ... }')
console.log('Error:', result2.error)
console.log('Fuel used:', result2.fuelUsed, '(exhausted at limit)')
console.log('Status: ✗ Safely terminated')


// --- TEST 3: Complex computation (Metered) ---
console.log('\\n═══════════════════════════════════════════')
console.log('TEST 3: Complex Agent (Metered)')
console.log('═══════════════════════════════════════════')

const complexAgent = \`
  function fibonacci({ n }) {
    if (n <= 1) return { result: n }

    let a = 0
    let b = 1
    let i = 2
    while (i <= n) {
      let temp = a + b
      a = b
      b = temp
      i = i + 1
    }
    return { result: b, iterations: n }
  }
\`

const result3 = await endpoint({
  body: { agent: complexAgent, args: { n: 20 }, fuel: 500 },
  headers: { authorization: 'token_123' }
})

console.log('Agent: fibonacci({ n: 20 })')
console.log('Result:', result3.result)
console.log('Fuel used:', result3.fuelUsed)
console.log('Status: ✓ Success (metered)')


// --- THE PUNCHLINE ---
console.log('\\n═══════════════════════════════════════════')
console.log('THE PUNCHLINE')
console.log('═══════════════════════════════════════════')
console.log(\`
Your current backend?
  - The infinite loop would have HUNG your server
  - Or cost you THOUSANDS on Lambda
  - Or crashed your Kubernetes pod
  - Or required a "senior engineer" to add timeout logic

Tosi?
  - Charged 50 fuel units
  - Returned an error
  - Kept running
  - Total code: 50 lines

This is the entire backend industry.

One endpoint.
Any logic.
Zero deployment.
Everyone is full stack now.
\`)`,
  },
  {
    name: 'Inline Tests: Test Private Functions',
    description: 'Test internals without exporting them - the killer feature',
    code: `/**
 * # Testing Private Functions
 *
 * This is the killer feature of inline tests:
 * You can test functions WITHOUT exporting them.
 *
 * Traditional testing requires you to either:
 * - Export internal helpers (pollutes your API)
 * - Test only through public interface (incomplete coverage)
 * - Use hacks like rewire/proxyquire (brittle)
 *
 * TJS inline tests have full access to the module scope.
 * Test everything. Export only what you need.
 */

// ============================================================
// PRIVATE HELPERS (not exported, but fully testable!)
// ============================================================

// Private: Email validation regex
const EMAIL_REGEX = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/

// Private: Validate email format
function isValidEmail(email: '') -> true {
  return EMAIL_REGEX.test(email)
}

// Private: Sanitize user input
function sanitize(input: '') -> '' {
  return input.trim().toLowerCase()
}

// Private: Generate a unique ID
function generateId(prefix: 'user') -> '' {
  return prefix + '_' + Math.random().toString(36).slice(2, 10)
}

// Private: Hash password (simplified for demo)
function hashPassword(password: '') -> '' {
  let hash = 0
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash) + password.charCodeAt(i)
    hash = hash & hash
  }
  return 'hashed_' + Math.abs(hash).toString(16)
}

// Private: Check password strength
function isStrongPassword(password: '') -> { strong: true, issues: [''] } {
  const issues = []
  if (password.length < 8) issues.push('Must be at least 8 characters')
  if (!/[A-Z]/.test(password)) issues.push('Must contain uppercase letter')
  if (!/[a-z]/.test(password)) issues.push('Must contain lowercase letter')
  if (!/[0-9]/.test(password)) issues.push('Must contain a number')
  return { strong: issues.length === 0, issues }
}

// ============================================================
// PUBLIC API (this is all that gets exported)
// ============================================================

export function createUser(input: { email: '', password: '' })
  -> { id: '', email: '', passwordHash: '' } | { error: '', code: 0 } {

  // Validate email (using private helper)
  const cleanEmail = sanitize(input.email)
  if (!isValidEmail(cleanEmail)) {
    return { error: 'Invalid email format', code: 400 }
  }

  // Validate password (using private helper)
  const strength = isStrongPassword(input.password)
  if (!strength.strong) {
    return { error: strength.issues.join(', '), code: 400 }
  }

  // Create user (using private helpers)
  return {
    id: generateId('user'),
    email: cleanEmail,
    passwordHash: hashPassword(input.password)
  }
}

// ============================================================
// TESTS - Full access to private functions!
// ============================================================

// --- Test private email validation ---
test('isValidEmail accepts valid emails') {
  expect(isValidEmail('test@example.com')).toBe(true)
  expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true)
}

test('isValidEmail rejects invalid emails') {
  expect(isValidEmail('not-an-email')).toBe(false)
  expect(isValidEmail('@nodomain.com')).toBe(false)
  expect(isValidEmail('spaces in@email.com')).toBe(false)
}

// --- Test private sanitization ---
test('sanitize trims and lowercases') {
  expect(sanitize('  HELLO  ')).toBe('hello')
  expect(sanitize('  Test@Email.COM  ')).toBe('test@email.com')
}

// --- Test private ID generation ---
test('generateId creates prefixed unique IDs') {
  const id1 = generateId('user')
  const id2 = generateId('user')
  expect(id1.startsWith('user_')).toBe(true)
  expect(id1).not.toBe(id2) // unique each time
}

test('generateId respects prefix') {
  expect(generateId('post').startsWith('post_')).toBe(true)
  expect(generateId('comment').startsWith('comment_')).toBe(true)
}

// --- Test private password hashing ---
test('hashPassword is deterministic') {
  const hash1 = hashPassword('secret123')
  const hash2 = hashPassword('secret123')
  expect(hash1).toBe(hash2)
}

test('hashPassword produces different hashes for different inputs') {
  const hash1 = hashPassword('password1')
  const hash2 = hashPassword('password2')
  expect(hash1).not.toBe(hash2)
}

// --- Test private password strength checker ---
test('isStrongPassword rejects weak passwords') {
  const result = isStrongPassword('weak')
  expect(result.strong).toBe(false)
  expect(result.issues.length).toBeGreaterThan(0)
}

test('isStrongPassword accepts strong passwords') {
  const result = isStrongPassword('MyStr0ngP@ss!')
  expect(result.strong).toBe(true)
  expect(result.issues.length).toBe(0)
}

test('isStrongPassword lists specific issues') {
  const noUpper = isStrongPassword('lowercase123')
  expect(noUpper.issues).toContain('Must contain uppercase letter')

  const noLower = isStrongPassword('UPPERCASE123')
  expect(noLower.issues).toContain('Must contain lowercase letter')

  const noNumber = isStrongPassword('NoNumbers!')
  expect(noNumber.issues).toContain('Must contain a number')

  const tooShort = isStrongPassword('Ab1!')
  expect(tooShort.issues).toContain('Must be at least 8 characters')
}

// --- Test the public API (integration) ---
test('createUser validates email') {
  const result = createUser({ email: 'invalid', password: 'StrongPass1!' })
  expect(result.error).toBe('Invalid email format')
}

test('createUser validates password strength') {
  const result = createUser({ email: 'test@test.com', password: 'weak' })
  expect(result.error).toBeTruthy()
}

test('createUser succeeds with valid input') {
  const result = createUser({
    email: '  Test@Example.COM  ',
    password: 'MyStr0ngPass!'
  })
  expect(result.id).toBeTruthy()
  expect(result.email).toBe('test@example.com') // sanitized
  expect(result.passwordHash.startsWith('hashed_')).toBe(true)
}

// ============================================================
// DEMO OUTPUT
// ============================================================

console.log('=== Testing Private Functions Demo ===\\n')
console.log('The functions isValidEmail, sanitize, generateId,')
console.log('hashPassword, and isStrongPassword are all PRIVATE.')
console.log('They are NOT exported. But we tested them all!\\n')

console.log('Try this in Jest/Vitest without exporting them. You can\\'t.')
console.log('You\\'d have to either pollute your API or leave them untested.\\n')

console.log('TJS inline tests: Full coverage. Clean exports.\\n')

// Show the public API working
const user = createUser({ email: 'demo@example.com', password: 'SecurePass123!' })
console.log('Created user:', user)`,
  },
]

// Types for docs
interface DocItem {
  title: string
  filename: string
  text: string
  category?: 'ajs' | 'tjs' | 'general'
  hidden?: boolean
}

interface DemoNavEvents {
  'select-ajs-example': { example: (typeof ajsExamples)[0] }
  'select-tjs-example': { example: (typeof tjsExamples)[0] }
  'select-doc': { doc: DocItem }
}

export class DemoNav extends Component {
  private _docs: DocItem[] = []
  private openSection: string | null = null
  private floatViewer: XinFloat | null = null
  private mdViewer: MarkdownViewer | null = null

  // Track current selection for highlighting
  private _currentView: 'home' | 'ajs' | 'tjs' = 'home'
  private _currentExample: string | null = null

  constructor() {
    super()
    // Initialize from URL hash
    this.loadStateFromURL()
    // Listen for hash changes
    window.addEventListener('hashchange', () => this.loadStateFromURL())
  }

  get currentView() {
    return this._currentView
  }

  set currentView(value: 'home' | 'ajs' | 'tjs') {
    this._currentView = value
    // Auto-open the appropriate section
    if (value === 'ajs') {
      this.openSection = 'ajs-demos'
    } else if (value === 'tjs') {
      this.openSection = 'tjs-demos'
    }
    this.rebuildNav()
    // Update indicator after rebuild (DOM now exists)
    this.updateCurrentIndicator()
  }

  get currentExample() {
    return this._currentExample
  }

  set currentExample(value: string | null) {
    this._currentExample = value
    this.updateCurrentIndicator()
  }

  private updateCurrentIndicator() {
    // Update .current class on nav items
    const items = this.querySelectorAll('.nav-item')
    items.forEach((item) => {
      const itemName = item.textContent?.trim()
      const isCurrent = itemName === this._currentExample
      item.classList.toggle('current', isCurrent)
    })
    // Update home link
    const homeLink = this.querySelector('.home-link')
    homeLink?.classList.toggle('current', this._currentView === 'home')
  }

  private loadStateFromURL() {
    const hash = window.location.hash.slice(1) // Remove '#'
    if (!hash) return

    const params = new URLSearchParams(hash)
    const section = params.get('section')
    const view = params.get('view')
    const example = params.get('example')

    // Set view and open appropriate section
    if (view === 'ajs') {
      this._currentView = 'ajs'
      this.openSection = 'ajs-demos'
    } else if (view === 'tjs') {
      this._currentView = 'tjs'
      this.openSection = 'tjs-demos'
    } else if (view === 'home') {
      this._currentView = 'home'
    } else if (
      section &&
      ['ajs-demos', 'tjs-demos', 'ajs-docs', 'tjs-docs'].includes(section)
    ) {
      this.openSection = section
    }

    // Set current example for highlighting
    if (example) {
      this._currentExample = example
    }

    this.rebuildNav()
    this.updateCurrentIndicator()
  }

  private saveStateToURL() {
    const params = new URLSearchParams(window.location.hash.slice(1))
    if (this.openSection) {
      params.set('section', this.openSection)
    }
    const newHash = params.toString()
    if (newHash !== window.location.hash.slice(1)) {
      window.history.replaceState(null, '', `#${newHash}`)
    }
  }

  get docs(): DocItem[] {
    return this._docs
  }

  set docs(value: DocItem[]) {
    this._docs = value
    // Re-render when docs are set
    this.rebuildNav()
  }

  // Light DOM styles (no static styleSpec)
  static lightDOMStyles = {
    ':host': {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    },

    '.nav-sections': {
      flex: '1 1 auto',
      overflowY: 'auto',
      padding: '8px',
    },

    details: {
      marginBottom: '4px',
      borderRadius: '6px',
      overflow: 'hidden',
    },

    summary: {
      padding: '8px 12px',
      background: vars.codeBackground,
      color: vars.textColor,
      cursor: 'pointer',
      fontWeight: '500',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      userSelect: 'none',
      listStyle: 'none',
    },

    'summary::-webkit-details-marker': {
      display: 'none',
    },

    'summary::before': {
      content: '"▶"',
      fontSize: '10px',
      transition: 'transform 0.2s',
    },

    'details[open] summary::before': {
      transform: 'rotate(90deg)',
    },

    'summary:hover': {
      background: vars.codeBorder,
    },

    '.section-content': {
      padding: '4px 0',
    },

    '.nav-item': {
      display: 'block',
      padding: '6px 12px 6px 24px',
      cursor: 'pointer',
      fontSize: '13px',
      color: vars.textColor,
      textDecoration: 'none',
      borderRadius: '4px',
      transition: 'background 0.15s',
    },

    '.nav-item:hover': {
      background: vars.codeBackground,
    },

    '.nav-item.requires-api::after': {
      content: '"🔑"',
      marginLeft: '4px',
      fontSize: '11px',
    },

    '.nav-item.current': {
      background: vars.brandColor,
      fontWeight: '500',
      color: '#fff',
    },

    '.section-icon': {
      width: '16px',
      height: '16px',
    },

    '.home-link': {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 12px',
      marginBottom: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      color: '#374151',
      borderRadius: '6px',
      transition: 'background 0.15s',
    },

    '.home-link:hover': {
      background: '#f3f4f6',
    },

    '.home-link.current': {
      background: '#e0e7ff',
      color: '#3730a3',
    },
  }

  content = () => [div({ class: 'nav-sections', part: 'sections' })]

  connectedCallback() {
    super.connectedCallback()
    this.rebuildNav()
    // Update indicator after DOM is ready
    this.updateCurrentIndicator()
  }

  rebuildNav() {
    const container = this.querySelector('.nav-sections')
    if (!container) return

    container.innerHTML = ''
    container.append(
      // Home link
      div(
        {
          class:
            this._currentView === 'home' ? 'home-link current' : 'home-link',
          onClick: () => this.selectHome(),
        },
        span({ class: 'section-icon' }, icons.home({ size: 16 })),
        'Home'
      ),

      // AJS Examples
      details(
        {
          open: this.openSection === 'ajs-demos',
          'data-section': 'ajs-demos',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.code({ size: 16 })),
          'AJS Examples'
        ),
        div(
          { class: 'section-content' },
          ...ajsExamples.map((ex) =>
            div(
              {
                class: ex.requiresApi ? 'nav-item requires-api' : 'nav-item',
                title: ex.description,
                onClick: () => this.selectAjsExample(ex),
              },
              ex.name
            )
          )
        )
      ),

      // TJS Examples
      details(
        {
          open: this.openSection === 'tjs-demos',
          'data-section': 'tjs-demos',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.code({ size: 16 })),
          'TJS Examples'
        ),
        div(
          { class: 'section-content' },
          ...tjsExamples.map((ex) =>
            div(
              {
                class: 'nav-item',
                title: ex.description,
                onClick: () => this.selectTjsExample(ex),
              },
              ex.name
            )
          )
        )
      ),

      // AJS Docs
      details(
        {
          open: this.openSection === 'ajs-docs',
          'data-section': 'ajs-docs',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.book({ size: 16 })),
          'AJS Docs'
        ),
        div(
          { class: 'section-content' },
          ...this.getAjsDocs().map((doc) =>
            div(
              {
                class: 'nav-item',
                onClick: () => this.selectDoc(doc),
              },
              doc.title
            )
          )
        )
      ),

      // TJS Docs
      details(
        {
          open: this.openSection === 'tjs-docs',
          'data-section': 'tjs-docs',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.book({ size: 16 })),
          'TJS Docs'
        ),
        div(
          { class: 'section-content' },
          ...this.getTjsDocs().map((doc) =>
            div(
              {
                class: 'nav-item',
                onClick: () => this.selectDoc(doc),
              },
              doc.title
            )
          )
        )
      )
    )
  }

  handleToggle = (event: Event) => {
    const details = event.target as HTMLDetailsElement
    const section = details.getAttribute('data-section')

    if (details.open) {
      // Close other sections (accordion behavior)
      this.openSection = section
      const allDetails = this.querySelectorAll('details')
      allDetails.forEach((d) => {
        if (d !== details && d.open) {
          d.open = false
        }
      })
      // Save to URL
      this.saveStateToURL()
    }
  }

  getAjsDocs(): DocItem[] {
    return this.docs.filter(
      (d) =>
        !d.hidden &&
        (d.filename.includes('ASYNCJS') ||
          d.filename.includes('PATTERNS') ||
          d.filename === 'runtime.ts')
    )
  }

  getTjsDocs(): DocItem[] {
    return this.docs.filter(
      (d) =>
        !d.hidden &&
        (d.filename.includes('TJS') ||
          d.filename === 'CONTEXT.md' ||
          d.filename === 'PLAN.md')
    )
  }

  selectHome() {
    this._currentView = 'home'
    this._currentExample = null
    this.updateCurrentIndicator()
    this.dispatchEvent(
      new CustomEvent('select-home', {
        bubbles: true,
      })
    )
  }

  selectAjsExample(example: (typeof ajsExamples)[0]) {
    this._currentView = 'ajs'
    this._currentExample = example.name
    this.updateCurrentIndicator()
    this.dispatchEvent(
      new CustomEvent('select-ajs-example', {
        detail: { example },
        bubbles: true,
      })
    )
  }

  selectTjsExample(example: (typeof tjsExamples)[0]) {
    this._currentView = 'tjs'
    this._currentExample = example.name
    this.updateCurrentIndicator()
    this.dispatchEvent(
      new CustomEvent('select-tjs-example', {
        detail: { example },
        bubbles: true,
      })
    )
  }

  selectDoc(doc: DocItem) {
    // Open or update floating doc viewer
    if (!this.floatViewer || !document.body.contains(this.floatViewer)) {
      this.createFloatViewer(doc)
    } else {
      // Update existing viewer
      if (this.mdViewer) {
        this.mdViewer.value = doc.text
      }
      // Update title
      const title = this.floatViewer.querySelector('.float-title')
      if (title) {
        title.textContent = doc.title
      }
    }

    this.dispatchEvent(
      new CustomEvent('select-doc', {
        detail: { doc },
        bubbles: true,
      })
    )
  }

  createFloatViewer(doc: DocItem) {
    this.mdViewer = markdownViewer({
      class: 'no-drag',
      value: doc.text,
      style: {
        display: 'block',
        padding: '4px 20px 12px',
        overflow: 'auto',
        maxHeight: 'calc(80vh - 40px)',
      },
    })

    const closeBtn = button(
      {
        class: 'iconic no-drag',
        style: {
          padding: '4px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
        },
      },
      icons.x({ size: 16 })
    )

    this.floatViewer = xinFloat(
      {
        drag: true,
        remainOnResize: 'remain',
        remainOnScroll: 'remain',
        style: {
          position: 'fixed',
          top: '60px',
          right: '20px',
          width: '500px',
          maxWidth: 'calc(100vw - 40px)',
          maxHeight: '80vh',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          zIndex: '1000',
        },
      },
      // Header
      div(
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            padding: '6px 12px',
            background: '#f3f4f6',
            borderBottom: '1px solid #e5e7eb',
            cursor: 'move',
          },
        },
        span(
          { class: 'float-title', style: { flex: '1', fontWeight: '500' } },
          doc.title
        ),
        closeBtn
      ),
      // Content
      this.mdViewer
    )

    // Add click handler after element is created
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.floatViewer?.remove()
      this.floatViewer = null
      this.mdViewer = null
    })

    document.body.appendChild(this.floatViewer)
  }
}

export const demoNav: ElementCreator<DemoNav> = DemoNav.elementCreator({
  tag: 'demo-nav',
  styleSpec: DemoNav.lightDOMStyles,
})
