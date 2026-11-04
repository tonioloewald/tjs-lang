<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 12, "parent": "tjs-patterns.md"}-->

# Lodash Utilities (with import)

Uses lodash-es for utility functions via ESM import

```tjs:inline
/#
## Lodash Utilities with Type Safety

Demonstrates using lodash-es with TJS runtime validation.
#/

import { groupBy, sortBy, uniqBy, debounce, chunk } from 'lodash-es'

// Group items by a key. The result's keys are data, so the return is
// type-only (`:!`): "an object", with no worked example to run
function groupUsers(users: [{ name: '', dept: '' }], key: 'dept'):! {} {
  return groupBy(users, key)
}

// Sort items by property
function sortByAge(users: [{ name: '', age: 0 }]): [{ name: '', age: 0 }] {
  return sortBy(users, ['age'])
}

// Remove duplicates by property
function uniqueByEmail(users: [{ email: '', name: '' }]): [{ email: '', name: '' }] {
  return uniqBy(users, 'email')
}

// Chunk array into smaller arrays: [['']] is an array of arrays of strings
function paginate(items: [''], pageSize: 10): [['']] {
  return chunk(items, pageSize)
}

// Process data pipeline
function processUserData(input: {
  users: [{ id: 0, name: '', email: '', dept: '' }]
}):! {
  byDept: {},
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

<!-- TODO review -->
## What to notice

Lodash is untyped JavaScript, and it stays that way. What TJS adds is a typed _boundary_:
each wrapper states, by example, what it accepts and what it gives back, so
`sortByAge('not an array')` is refused at the wrapper with a message naming
`sortByAge.users`, instead of failing somewhere inside lodash or, worse, quietly returning
an empty array.

The return annotations come in two kinds, and the difference matters:

- `sortByAge(...): [{ name: '', age: 0 }]` is a **worked example**. When the file is
  transpiled, TJS calls `sortByAge` with its parameter example and checks the result equals
  the return example. That is a free test of the wrapper _and_ of the library call inside
  it.
- `groupUsers(...):! {}` is **type-only** (`:!`). A grouped result's keys are data (`'eng'`,
  `'sales'`), so there is no single example result worth asserting; `:!` says "an object"
  and runs no test. `processUserData` uses `:!` for the same reason.

`[['']]` on `paginate` is an array of arrays of strings: array examples nest.

<!-- TODO review -->
## Gotchas

- **Worked examples need the import.** At build time, if `lodash-es` cannot be loaded, the
  signature examples and `test` blocks in this file are reported as _inconclusive_: not
  passed, not failed. Run the file where the import resolves (the playground does) to get a
  real answer.
- **A wrapper's types are only as good as its example.** `[{ name: '', dept: '' }]` checks
  that every element has a string `name` and `dept`; it does not check that `key` names a
  field that exists. `groupUsers(users, 'nope')` is well-typed and groups everything under
  the key `'undefined'`. Rules like that belong in the function body, or in a `Type` with a predicate.
- **Excess keys pass.** An element with extra fields still matches `{ name: '', dept: '' }`,
  which is what lets `processUserData` accept the full user records.
