<!--{"section":"tjs","type":"example","group":"fullstack","order":14}-->

# Full-Stack Demo: Todo API

Complete REST-style Todo API with persistence

```tjs
/**
 * # Todo API Service
 *
 * A REST-style API for todo management.
 * Demonstrates a more complete service pattern.
 */

// Simulated persistence layer
const todos = new Map()
let nextId = 1

// Types are inferred from function signatures below
// Todo: { id: 0, title: '', completed: false, createdAt: '' }
// CreateInput: { title: 'Buy milk' }
// UpdateInput: { id: 1, title: 'Buy milk', completed: false }

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

// GET /todos/:id - Read one (returns empty if not found)
export function getTodo(input: { id: 1 })
  -> { id: 0, title: '', completed: false, createdAt: '' } {
  return todos.get(input.id) || { id: 0, title: '', completed: false, createdAt: '' }
}

// GET /todos - Read all (with optional filter)
export function listTodos(input = { completed: false })
  -> { todos: [{ id: 0, title: '', completed: false, createdAt: '' }] } {
  let items = [...todos.values()]

  if (input.completed !== undefined) {
    items = items.filter(t => t.completed === input.completed)
  }

  return { todos: items }
}

// PUT /todos/:id - Update (returns empty if not found)
export function updateTodo(input: { id: 1, title: '', completed: false })
  -> { id: 0, title: '', completed: false, createdAt: '' } {
  const existing = todos.get(input.id)
  if (!existing) return { id: 0, title: '', completed: false, createdAt: '' }

  const updated = {
    ...existing,
    title: input.title ?? existing.title,
    completed: input.completed ?? existing.completed
  }
  todos.set(input.id, updated)
  return updated
}

// DELETE /todos/:id - Delete
export function deleteTodo(input: { id: 1 }) -> { deleted: true } {
  const existed = todos.has(input.id)
  todos.delete(input.id)
  return { deleted: existed }
}

// PATCH /todos/:id/toggle - Toggle completion (returns empty if not found)
export function toggleTodo(input: { id: 1 })
  -> { id: 0, title: '', completed: false, createdAt: '' } {
  const todo = todos.get(input.id)
  if (!todo) return { id: 0, title: '', completed: false, createdAt: '' }

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
console.log('Remaining:', listTodos({}))
```
