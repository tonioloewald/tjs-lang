<!--{"section": "tjs", "type": "example", "group": "basics", "order": 3, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Object Types

Typed object parameters and returns

```tjs:inline
/#
## Object Types

An object example describes a shape:
`{ first: 'Ada', last: 'Lovelace' }` means an object whose `first` and
`last` are strings.

The return example is a worked example, and it is tested at transpile time:
`fullName` called with the parameter examples must return `'Ada Lovelace'`.
#/
test 'createPoint returns correct structure' {
  const p = createPoint(5, 10)
  expect(p.x).toBe(5)
  expect(p.y).toBe(10)
}

function fullName(person: { first: 'Ada', last: 'Lovelace' }): 'Ada Lovelace' {
  return person.first + ' ' + person.last
}

function createPoint(x: 0, y: 0): { x: 0, y: 0 } {
  return { x, y }
}

function distance(p1: { x: 0, y: 0 }, p2: { x: 3, y: 4 }): 5.0 {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

console.log('Name:', fullName({ first: 'Grace', last: 'Hopper' })) // Grace Hopper
console.log('Distance:', distance({ x: 1, y: 1 }, { x: 4, y: 5 })) // 5
console.log(fullName({ first: 'Grace' }).message)                  // last is missing
```

## What to notice

An object example describes a **shape**: which properties must be there, and what type each
one holds. `person: { first: 'Ada', last: 'Lovelace' }` accepts any object whose `first` and
`last` are strings. The values in the example say "string", and they double as sample data;
they are not required values, so Grace Hopper is a fine person too.

- **Every listed member is required, and checked.** Leaving `last` out, or passing a number
  for it, returns a `MonadicError` whose path names the member: `fullName.person.last`.
- **Extra members are allowed.** `{ first: 'Grace', last: 'Hopper', born: 1906 }` is a fine
  person. A shape says what must be there, not what must not.
- **Number members follow the number rules.** `{ x: 0, y: 0 }` is a point with *integer*
  coordinates, so `createPoint(1.5, 2)` is rejected. That is why `distance` returns `5.0`, a
  float: the distance between two integer points is usually not an integer.
- **The return example is a worked example.** `fullName`'s `: 'Ada Lovelace'` is what it
  returns for its parameter example, and `distance`'s `: 5.0` is the distance from `(0, 0)`
  to `(3, 4)`. If the function returned anything else, `tjs check` would fail. Choosing
  realistic examples is what makes this test worth having: a `'' + ' ' + ''` example would
  only prove the function returns a single space.
- **Returned objects are compared by structure.** `createPoint(x: 0, y: 0): { x: 0, y: 0 }`
  says `createPoint(0, 0)` returns `{ x: 0, y: 0 }`. It builds a new object, and that passes
  because the contents match; identity does not matter here.

## Nested shapes and arrays

Shapes nest, and an array member uses an array example. Errors carry the full path, so you
can see exactly which part of a deep argument was wrong:

```tjs:inline
function area(rect: { width: 0.0, height: 0.0 }): 0.0 {
  return rect.width * rect.height
}

function label(item: { name: '', tags: [''], size: { w: 0, h: 0 } }) {
  return `${item.name} [${item.tags.join(', ')}] ${item.size.w}x${item.size.h}`
}

console.log(area({ width: 2, height: 1.5 }))               // 3
console.log(area({ width: 2, height: 1.5, color: 'red' })) // 3: extras are fine
console.log(area({ width: 2 }).message)                    // height is missing
console.log(area(null).message)                            // not an object

console.log(label({ name: 'box', tags: ['a', 'b'], size: { w: 3, h: 4 } }))
console.log(label({ name: 'box', tags: ['a', 2], size: { w: 3, h: 4 } }).message)
console.log(label({ name: 'box', tags: [], size: { w: 3.5, h: 4 } }).message)
```

The last line fails on `size.w`, not on the empty `tags`: an empty array is a valid array
of strings.

## Optional members

Every member of a shape is required. To let one be absent, give it a union with
`undefined`:

```tjs:inline
function greet(user: { name: 'Ada', nick: 'Countess' | undefined }): 'Hello, Countess' {
  return 'Hello, ' + (user.nick ?? user.name)
}

console.log(greet({ name: 'Grace' }))                  // Hello, Grace
console.log(greet({ name: 'Grace', nick: 'Amazing' })) // Hello, Amazing
console.log(greet({ name: 'Grace', nick: 7 }).message) // nick must be a string if present
```

Writing `nick: 'Countess'` instead would make `greet({ name: 'Grace' })` an error.

## Things that trip people up

- **A shape is not a dictionary default.** `p: { x: 0, y: 0 }` (colon) requires a whole
  point. `p = { x: 0, y: 0 }` (equals) makes the argument optional *and* fills in missing
  members one by one; see [Dictionary Defaults](/dictionary-defaults-example/).
- **Name a shape you use twice.** Repeating `{ x: 0, y: 0 }` in three signatures, as the
  first example does, works but drifts. `Type Point { example: { x: 0, y: 0 } }` gives it a
  name; see [Declarations](/declarations/).
