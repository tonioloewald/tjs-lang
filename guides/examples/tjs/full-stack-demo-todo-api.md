<!--{"section": "tjs", "type": "example", "group": "fullstack", "order": 14, "parent": "tjs-fullstack.md"}-->

# Full-Stack Demo: Todo API

Complete REST-style Todo API over an in-memory store

<!-- TODO review -->
```tjs:inline
/#
## Todo API Service

A REST-style API for todo management.
Demonstrates a more complete service pattern.
#/

// Simulated persistence layer
const todos = new Map()
let nextId = 1

// Types are inferred from function signatures below
// Todo: { id: 0, title: '', completed: false, createdAt: '' }
// CreateInput: { title: 'Buy milk' }
// UpdateInput: { id: 1, title: 'Buy milk', completed: false }

// POST /todos - Create
export function createTodo(input: { title: 'New todo' }):! { id: 0, title: '', completed: false, createdAt: '' } {
  const todo = {
    id: nextId++,
    title: input.title,
    completed: false,
    // Raw `Date` is not allowed in .tjs; LegacyDate is the named escape.
    createdAt: LegacyDate().toISOString()
  }
  todos.set(todo.id, todo)
  return todo
}

// GET /todos/:id - Read one (null if not found)
export function getTodo(input: { id: 1 }):! { id: 0, title: '', completed: false, createdAt: '' } | null {
  return todos.get(input.id) ?? null
}

// GET /todos - Read all, or filter with { completed: true | false }.
// A bare `null` default accepts any value, so the filter is optional AND free-form.
export function listTodos(filter = null):! { todos: [{ id: 0, title: '', completed: false, createdAt: '' }] } {
  let items = [...todos.values()]

  if (filter?.completed !== undefined) {
    items = items.filter(t => t.completed === filter.completed)
  }

  return { todos: items }
}

// PUT /todos/:id - Update (null if not found)
export function updateTodo(input: { id: 1, title: '', completed: false }):! { id: 0, title: '', completed: false, createdAt: '' } | null {
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
export function deleteTodo(input: { id: 1 }):! { deleted: true } {
  const existed = todos.has(input.id)
  todos.delete(input.id)
  return { deleted: existed }
}

// PATCH /todos/:id/toggle - Toggle completion (null if not found)
export function toggleTodo(input: { id: 1 }):! { id: 0, title: '', completed: false, createdAt: '' } | null {
  const todo = todos.get(input.id)
  if (!todo) return null

  todo.completed = !todo.completed
  return todo
}

// DELETE /todos/completed - Clear completed
export function clearCompleted():! { cleared: 0 } {
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
test 'CRUD operations work' {
  const todo = createTodo({ title: 'Test todo' })
  expect(todo.id).toBeGreaterThan(0)
  expect(todo.completed).toBe(false)

  const fetched = getTodo({ id: todo.id })
  expect(fetched.title).toBe('Test todo')

  const toggled = toggleTodo({ id: todo.id })
  expect(toggled.completed).toBe(true)

  const deleted = deleteTodo({ id: todo.id })
  expect(deleted.deleted).toBe(true)
  expect(getTodo({ id: todo.id })).toBe(null)
}

// Demo
console.log('=== Todo API Demo ===\n')

// Create todos
createTodo({ title: 'Learn TJS' })
createTodo({ title: 'Build something cool' })
createTodo({ title: 'Ship it' })

const titles = (list) => list.todos.map(t => t.title).join(', ')

console.log('Created 3 todos')
console.log('All:', titles(listTodos()))

// Complete first one
const first = listTodos().todos[0]
toggleTodo({ id: first.id })
console.log('\nToggled first todo')
console.log('Completed:', titles(listTodos({ completed: true })))
console.log('Pending:', titles(listTodos({ completed: false })))

// Clear completed
console.log('\nClearing completed...')
console.log(clearCompleted())
console.log('Remaining:', titles(listTodos()))

// A request with the wrong shape is refused before the handler runs
const bad = createTodo({ title: 42 })
console.log('\ncreateTodo({ title: 42 }) ->', bad instanceof Error ? bad.message : bad)
```

<!-- TODO review -->
## What to notice

- **One function per route, one typed input per function.** The comments name the HTTP
  route each function would sit behind. The functions themselves know nothing about HTTP:
  they take a plain object and return a plain object, which is what makes them easy to test
  and easy to move behind any transport.
- **Required and optional are punctuation.** `createTodo(input: { title: 'New todo' })` uses
  a colon, so the input is required and must have a string `title`. `listTodos(filter =
  null)` uses `=`, so the argument is optional. A bare `null` default is the one default that
  says nothing about the type: it accepts any value, which suits a free-form filter.
- **Missing records are `null`, said in the signature.** `getTodo`, `updateTodo` and
  `toggleTodo` declare `{ … } | null` and return `null` for an unknown id, rather than an
  empty placeholder object a caller could mistake for a real todo.
- **The wrong shape is refused at the door.** `createTodo({ title: 42 })` returns a
  `MonadicError` naming `createTodo.input.title`; the body never runs, so no half-built todo
  reaches the store.

<!-- TODO review -->
## A gotcha: object defaults merge

Why `filter = null` and not `filter = { completed: false }`? In TJS an object-literal default
is a **dictionary**: members are defaulted one by one and merged into whatever the caller
passes. That is usually what you want, but it would turn "no filter" into "only pending":

```tjs:inline
function withDictionary(filter = { completed: false }) {
  return filter
}

function withNull(filter = null) {
  return filter
}

console.log('dictionary, called with {}:', JSON.stringify(withDictionary({})))
console.log('null default, called with {}:', JSON.stringify(withNull({})))
```

The dictionary filled in `completed: false` for the caller who asked for everything. When a
default should mean "absent" rather than "these values", use `null`, or keep JavaScript's
all-or-nothing default for one parameter with `LegacyDefault({ … })`.

<!-- TODO review -->
## Limits

- **"Persistence" here is a `Map`.** It resets when the page reloads. Swapping in a real
  database changes the function bodies, not their signatures or tests.
- **`:!` returns are not checked.** They document the shape. The store mutates and the
  timestamps change, so no fixed worked example could pass; inputs are what TJS validates by
  default.
- **Shared mutable state.** `toggleTodo` mutates the stored object in place and returns it,
  so a caller holding the object sees later changes. A real API would return a copy.
