<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 12, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Lodash Utilities (with import)

[lodash](https://lodash.com/docs/) is a popular library of untyped JavaScript helpers. This
example wraps four of them: `sortBy` (sort a list by a field), `uniqBy` (drop records that
repeat a field), `chunk` (split a list into pages) and `groupBy` (bucket records by a
field). It adds a fifth function, a small pipeline that combines them. Each wrapper's
signature says, by example, what goes in and what comes out, so calls are checked at the
wrapper and the worked examples test lodash itself.

## Reading the signatures

Two rules from [TJS syntax](/TJS-SYNTAX/) make the code below readable:

- **A parameter's value after `:` is an example, not a default and not a literal type.**
  TJS infers a type from it and checks every call against that type. `users: [{ name:
  'Ann', age: 40 }, { name: 'Bo', age: 25 }]` means "an array of `{ name, age }`
  records", of any length. `name` is a string and `age` is an integer: a whole number
  means integer, so `age: 25.5` is refused (write `40.0` to allow fractions). The same
  reading makes `id: 0` and `count: 0` integers. The second record in the example does
  not make the array a pair; it is there to feed the worked example.
- **A return value after `:` is a worked example.** TJS calls the function with the
  parameter examples and compares the result to the return example by deep equality.

There are three ways to write a return:

| Form | Runs the worked example | Checks real calls' results |
| ---- | ----------------------- | -------------------------- |
| `): example` | yes | no |
| `):! example` | no | no |
| `):? example` | yes | yes |

`:!` is a declaration only. It still feeds the function's type metadata (what `tjs types`,
generated `.d.ts` files and editors show), so `processUserData`'s detailed `:!` shape
documents the result without checking it.

The code opens with a `/# … #/` block: a TJS doc comment, rendered as markdown above the
code (see [Doc comments](/TJS-SYNTAX/#doc-comments-)).

```tjs:inline
/#
## Typed wrappers around lodash

lodash is plain JavaScript with no types. Each wrapper below states, by example, what it
accepts and what it returns. The library stays untyped; the boundary does not.
#/

import { groupBy, sortBy, uniqBy, chunk } from 'lodash-es'

// A worked example: called with the two users shown, it must return them youngest first.
// `age: 40` is an integer example, so fractional ages are refused.
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
  expect(isMonadicError(sortByAge('not an array'))).toBe(true)
  expect(isMonadicError(sortByAge([{ name: 'Cy', age: 'old' }]))).toBe(true)
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

It prints:

```text
Unique users: 3
Departments: [ "Engineering", "Sales" ]
Engineering team: [ "Alice", "Carol" ]
Expected array of object for '<file>:12:sortByAge.users', got string
```

Dave reuses Alice's email, so `uniqBy` drops him and `Marketing` never appears among the
departments. The last line is the wrapper's refusal. An error message names the file and
line where the function is declared, then the parameter; the file name depends on where
the code runs, so it is shown here as `<file>`.

## The boundary is the signature

lodash accepts almost anything. `sortBy('not an array', ['age'])` does not complain: it
treats the string as a collection and hands back its characters as an array. Code that
passed the wrong value would carry on with nonsense.

`sortByAge` cannot be called that way. Its parameter example is an array of
`{ name, age }` records, so a string, or a record whose `age` is `'old'`, is refused before
lodash runs. The call does not throw. It returns a `MonadicError`, an `Error` object that
TJS hands back as the result, naming the parameter (`sortByAge.users`, or
`sortByAge.users[0].age`). `isMonadicError(x)` tells you whether you got one; see
[Error Handling](/error-handling/). The library is unchanged; what changed is the edge
your own code touches.

The check is on shape, not on the length of the example: `sortByAge` accepts one record or
a hundred.

## Choosing worked examples

The three worked examples in the code are:

- `sortByAge` is called with Ann (40) and Bo (25) and must return Bo first.
- `uniqueByEmail` is called with two records sharing an email and must keep the first.
- `paginate(['a', 'b', 'c'], 2)` must return `[['a', 'b'], ['c']]`.

Because the bodies call lodash, each of these is a test of lodash too: if `sortBy` sorted
the other way, or `chunk` dropped the remainder, the example would fail. Choose examples
that would catch a mistake. A one-element array would "sort" correctly whatever the body
did.

`groupUsers` and `processUserData` use `:!`. A grouped result's keys are data (`'eng'`,
`'sales'`), so no single result is worth asserting. The `test` blocks cover what the
examples cannot.

## Checking every result with `:?`

A plain `:` return is a test, not a runtime check: a real call's result is not validated.
If you do not trust a library to return what you declared, use `:?`. Here is a wrapper
with a bug, mapping `age` where it meant `name`:

```javascript
import { map } from 'lodash-es'

function names(users: [{ name: 'Ann', age: 40 }]):? ['Ann'] {
  return map(users, 'age') // the bug: should be 'name'
}

names([{ name: 'Bo', age: 25 }]).message
// Expected array of string for '<file>:3:names:return', got array of number
```

Both halves of `:?` catch it. The worked example fails, because `[40]` is not `['Ann']`.
And every real call returns the `MonadicError` shown instead of a list of numbers. With a
plain `:` return, only the worked example would catch it; with `:!`, nothing would.

## Where the tests run, and where they cannot

The tests and worked examples need lodash, so where they run decides what they report.

- **On this page**, the example runs in the browser. A service worker fetches the bare
  import `'lodash-es'` from a CDN (see [Date Formatting (with
  import)](/date-formatting-with-import/) and [CDN Hints](/cdn-hints/)). The tests and
  worked examples run in the page after the import has loaded, against the real library,
  and pass.
- **With the `tjs` CLI**, the tests run at transpile time. TJS executes the module's own
  code with its `import` statements left out, so lodash is never loaded there, even when
  `lodash-es` is installed. `tjs test` lists every test and worked example that reaches
  lodash as `?` (inconclusive: neither passed nor failed) and exits 0. `tjs check` runs the
  same tests but does not report inconclusive ones: it prints a tick and the signatures and
  exits 0. A green `check` on this file means the tests did not run, not that they passed.
- **`tjs run`** loads `lodash-es` the way Bun resolves any import (from your
  `node_modules`, or by Bun's auto-install when there is none), so its console output is
  real.
- **If the CDN is unreachable**, the import fails, so the example stops at its first line
  with an error instead of printing, and its tests cannot run. You see a failure to load,
  never a wrong answer. (A copy the service worker cached on an earlier visit may still
  load.)

Two separate things make a CLI test inconclusive:

1. A test or worked example that calls lodash is always inconclusive on the CLI.
2. The module's top level runs before any test, so top-level code that calls lodash stops
   the whole module. Here `processUserData({ users })` at the bottom does that, so even
   `the wrapper refuses what lodash would accept`, which never reaches lodash, comes out
   inconclusive.

Keeping demo calls out of the module you test fixes the second, not the first: the tests
that do not touch lodash then run and pass, and the ones that do stay inconclusive.

## Gotchas

- **A wrapper's types are only as good as its example.** `[{ name: '', dept: '' }]` checks
  that every element has a string `name` and `dept`; it does not check that `key` names a
  field that exists. `groupUsers(users, 'nope')` is well typed and groups everything under
  the key `'undefined'`. A rule like that belongs in the function body, or in a `Type` with
  a predicate (see [Predicate Types](/predicate-types/)).
- **Excess keys pass.** A record with extra fields still matches `{ name: '', dept: '' }`,
  so `groupUsers` accepts full user records, `id` and `email` included, though its example
  names only `name` and `dept`.
- **`age: 40` is an integer.** See [Reading the signatures](#reading-the-signatures):
  `age: 25.5` is refused unless the example is `40.0`.
