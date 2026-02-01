<!--{"section":"tjs","type":"example","group":"patterns","order":11}-->

# Lodash Utilities (with import)

Uses lodash-es for utility functions via ESM import

```tjs
/**
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
// Note: nested array types like [['']] aren't supported yet, so we omit return type
function paginate(items: [''], pageSize: 10) {
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
console.log('Engineering team:', result.byDept['Engineering']?.map(u => u.name))
```
