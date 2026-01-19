/**
 * Tests that all TJS examples in demo-nav transpile without errors
 *
 * Note: We inline the examples here rather than importing from demo-nav.ts
 * because demo-nav.ts imports browser-only dependencies (tosijs, tosijs-ui).
 */

import { describe, test, expect } from 'bun:test'
import { tjs } from '../../src/lang'

// Extract just the example code strings from demo-nav.ts
// This avoids importing browser-only dependencies
const tjsExamples = [
  {
    name: 'TJS Grammar',
    code: `/*
TJS Grammar demonstrates the type syntax.
Types are specified by example values.
*/
function greet(name: 'World') -> '' {
  return \`Hello, \${name}!\`
}

// Call it
greet('TJS')

test('greet returns a greeting') {
  expect(greet('Alice')).toBe('Hello, Alice!')
}
`,
  },
  {
    name: 'Date Formatting (with import)',
    code: `import { format, parseISO, addDays } from 'date-fns'

function formatDate(isoDate: '2024-01-15', pattern: 'PPP') -> '' {
  const date = parseISO(isoDate)
  return format(date, pattern)
}

function addBusinessDays(isoDate: '2024-01-15', days: 5) -> '' {
  const date = parseISO(isoDate)
  const result = addDays(date, days)
  return format(result, 'yyyy-MM-dd')
}

formatDate('2024-03-15', 'MMMM do, yyyy')
`,
  },
  {
    name: 'Lodash Utilities (with import)',
    code: `import { groupBy, sortBy, uniqBy, chunk } from 'lodash-es'

function groupUsers(users: [{ name: '', dept: '' }], key: 'dept')
  -> { [key: '']: [{ name: '', dept: '' }] } {
  return groupBy(users, key)
}

function sortByAge(users: [{ name: '', age: 0 }]) -> [{ name: '', age: 0 }] {
  return sortBy(users, ['age'])
}

function uniqueByEmail(users: [{ email: '', name: '' }]) -> [{ email: '', name: '' }] {
  return uniqBy(users, 'email')
}

// Note: nested array types like [['']] aren't supported yet, so we omit return type
function paginate(items: [''], pageSize: 10) {
  return chunk(items, pageSize)
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
`,
  },
  {
    name: 'Full-Stack Demo: User Service',
    code: `function createUser(user: { name: '', email: '' }) -> { id: 0, name: '', email: '', created: '' } {
  return {
    id: Math.floor(Math.random() * 10000),
    name: user.name,
    email: user.email,
    created: new Date().toISOString()
  }
}

// Note: union types like "Type | null" in return position aren't supported yet
function getUser(id: 0) -> { id: 0, name: '', email: '' } {
  return { id, name: 'Test User', email: 'test@example.com' }
}

test('createUser returns user with id') {
  const user = createUser({ name: 'Alice', email: 'alice@test.com' })
  expect(typeof user.id).toBe('number')
  expect(user.name).toBe('Alice')
}
`,
  },
  {
    name: 'The Universal Endpoint',
    code: `function endpoint(request: { path: '', method: 'GET' }) -> { status: 200, body: '' } {
  if (request.method === 'GET') {
    return { status: 200, body: 'Hello from TJS!' }
  }
  return { status: 405, body: 'Method not allowed' }
}

test('GET returns 200') {
  const res = endpoint({ path: '/', method: 'GET' })
  expect(res.status).toBe(200)
}
`,
  },
  {
    name: 'Inline Tests: Test Private Functions',
    code: `// Private helper - not exported
function validateEmail(email: '') -> true {
  return email.includes('@') && email.includes('.')
}

// Public API
function processUser(user: { email: '' }) -> { valid: true } {
  return { valid: validateEmail(user.email) }
}

// We can test private functions directly!
test('validateEmail checks for @ and .') {
  expect(validateEmail('test@example.com')).toBe(true)
  expect(validateEmail('invalid')).toBe(false)
}
`,
  },
]

describe('TJS Examples', () => {
  for (const example of tjsExamples) {
    test(`"${example.name}" transpiles without error`, () => {
      // Skip examples that are intentionally broken (if any)
      if (
        example.name.toLowerCase().includes('error') ||
        example.name.toLowerCase().includes('broken')
      ) {
        return
      }

      expect(() => {
        tjs(example.code)
      }).not.toThrow()
    })
  }
})
