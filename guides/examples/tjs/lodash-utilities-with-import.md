<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 12, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Lodash Utilities (with import)

lodash is untyped JavaScript. This example wraps four of its functions in TJS functions
whose signatures say, by example, what goes in and what comes out. Calls are checked at the
wrapper, and the worked examples test lodash itself.

```tjs:inline
/#
## Typed wrappers around lodash

lodash is plain JavaScript with no types. Each wrapper below states, by example, what it
accepts and what it returns. The library stays untyped; the boundary does not.
#/

import { groupBy, sortBy, uniqBy, chunk } from 'lodash-es'

// A worked example: called with the two users shown, it must return them youngest first
function sortByAge(
  users: [{ name: 'Ann', age: 40 }, { name: 'Bo', age: 25 }]
): [{ name: 'Bo', age: 25 }, { name: 'Ann', age: 40 }] {
  return sortBy(users, ['age'])
}

// The first record with each email wins
function uniqueByEmail(
  users: [{ email: 'a@x.com', name: 'Ann' }, { email: 'a@x.com', name: 'Annie' }]
): [{ email: 'a@x.com', name: 'Ann' }] {
  return uniqBy(users, 'email')
}

// Array examples nest: the result is an array of arrays of strings
function paginate(items: ['a', 'b', 'c'], pageSize: 2): [['a', 'b'], ['c']] {
  return chunk(items, pageSize)
}

// The keys of a grouped result are data, so the return is type-only (`:!`):
// "an object", with no worked example to check
function groupUsers(users: [{ name: '', dept: '' }], key: 'dept'):! {} {
  return groupBy(users, key)
}

// A pipeline built from the same pieces
function processUserData(input: {
  users: [{ id: 0, name: '', email: '', dept: '' }]
}):! {
  byDept: {},
  unique: [{ id: 0, name: '', email: '', dept: '' }],
  count: 0
} {
  const unique = uniqBy(input.users, 'email')
  return {
    byDept: groupBy(unique, 'dept'),
    unique: sortBy(unique, ['name']),
    count: unique.length
  }
}

test 'groupUsers groups by department' {
  const grouped = groupUsers([
    { name: 'Alice', dept: 'eng' },
    { name: 'Bob', dept: 'sales' },
    { name: 'Carol', dept: 'eng' }
  ], 'dept')
  expect(grouped.eng.length).toBe(2)
  expect(grouped.sales.length).toBe(1)
}

test 'paginate leaves the remainder on the last page' {
  const pages = paginate(['a', 'b', 'c', 'd', 'e'], 2)
  expect(pages.length).toBe(3)
  expect(pages[2]).toEqual(['e'])
}

test 'the wrapper refuses what lodash would accept' {
  // lodash would sort the string's characters; the wrapper refuses it
  expect(sortByAge('not an array') instanceof Error).toBe(true)
  expect(sortByAge([{ name: 'Cy', age: 'old' }]) instanceof Error).toBe(true)
}

// Try it
const users = [
  { id: 1, name: 'Alice', email: 'alice@co.com', dept: 'Engineering' },
  { id: 2, name: 'Bob', email: 'bob@co.com', dept: 'Sales' },
  { id: 3, name: 'Carol', email: 'carol@co.com', dept: 'Engineering' },
  { id: 4, name: 'Dave', email: 'alice@co.com', dept: 'Marketing' }, // reuses Alice's email
]

const result = processUserData({ users })
console.log('Unique users:', result.count)
console.log('Departments:', Object.keys(result.byDept))
console.log('Engineering team:', result.byDept['Engineering'].map(u => u.name))
console.log(sortByAge('not an array').message)
```

The last line prints the wrapper's refusal: `Expected array of object for
'…sortByAge.users', got string`. Dave reuses Alice's email, so `uniqBy` drops him and
`Marketing` never appears among the departments.

## The boundary is the signature

lodash accepts almost anything. `sortBy('not an array', ['age'])` does not complain: it
treats the string as a collection and hands back its characters as an array. Code that
passed the wrong value would carry on with nonsense.

`sortByAge` cannot be called that way. Its parameter example is an array of
`{ name, age }` records, so a string, or a record whose `age` is `'old'`, comes back as a
`MonadicError` naming the parameter (`sortByAge.users`, or `sortByAge.users[0].age`) before
lodash runs. The library is unchanged; what changed is the edge your own code touches.

## Worked returns and type-only returns

A return annotation after `:` is a **worked example**. TJS calls the function with its
parameter examples and compares the result to the return example by deep equality:

- `sortByAge` is called with Ann (40) and Bo (25) and must return Bo first.
- `uniqueByEmail` is called with two records sharing an email and must keep the first.
- `paginate(['a', 'b', 'c'], 2)` must return `[['a', 'b'], ['c']]`.

Because the body calls lodash, each of these is a test of lodash too: if `sortBy` sorted
the other way, or `chunk` dropped the remainder, the example would fail. Choose examples
that would catch a mistake. A one-element array would "sort" correctly whatever the body
did.

`groupUsers` and `processUserData` use `:!`, a **type-only** return. A grouped result's
keys are data (`'eng'`, `'sales'`), so no single result is worth asserting; `:!` says "an
object" and runs no test. The `test` blocks cover what the examples cannot.

A plain `:` return is a test, not a runtime check: a real call's result is not validated.
If you do not trust a library to return what you declared, use `:?`, which runs the worked
example and also checks every result. A wrapper declared `:? ['']` around
`map(users, 'age')` returns a `MonadicError` on its first call:

```text
Expected array of string for '…names:return', got array of number
```

Array examples nest: `[['a', 'b'], ['c']]` is an array of arrays of strings.

## Where the tests run, and where they cannot

The tests and worked examples need lodash, so where they run decides what they report.

- **On this page**, the example runs in the browser. The bare import `'lodash-es'` is
  fetched from a CDN by a service worker (see _Date Formatting (with import)_ and _CDN
  Hints_), and the tests and worked examples run beside it with the real library. They
  pass.
- **With the `tjs` CLI**, `tjs check` and `tjs test` run the tests at transpile time,
  beside the module's text, where a package import is not loaded. Every test that reaches
  lodash is reported _inconclusive_ (`?`), neither passed nor failed, and `check` still
  exits 0. That is the case even when `lodash-es` is installed: the transpile-time run
  never loads package imports. `tjs run` does load it from `node_modules`, so the console
  output is real.
- **If the CDN is unreachable**, the import fails, so the example stops at its first line
  with an error instead of printing, and its tests cannot run. You see a failure to load,
  never a wrong answer.

One consequence for your own files: the module's top level runs before any test. Here,
`processUserData({ users })` at the bottom calls lodash, so on the CLI the whole module
cannot execute and even `the wrapper refuses what lodash would accept`, which never
reaches lodash, comes out inconclusive. In a real project keep demo calls out of the
module you test.

## Gotchas

- **A wrapper's types are only as good as its example.** `[{ name: '', dept: '' }]` checks
  that every element has a string `name` and `dept`; it does not check that `key` names a
  field that exists. `groupUsers(users, 'nope')` is well typed and groups everything under
  the key `'undefined'`. A rule like that belongs in the function body, or in a `Type` with
  a predicate.
- **Excess keys pass.** A record with extra fields still matches
  `{ name: '', dept: '' }`, which is how `processUserData` accepts full user records.
- **`age: 40` is an integer.** A whole-number example means integer, so `age: 25.5` is
  refused. Write `age: 40.0` if fractional ages are valid.
