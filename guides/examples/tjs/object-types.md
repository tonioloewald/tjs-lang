<!--{"section": "tjs", "type": "example", "group": "basics", "order": 3, "parent": "tjs-basics.md"}-->

# Object Types

Typed object parameters and returns

```tjs:inline
/#
## Object Types

Object shapes are defined by example:
`{ first: '', last: '' }` means an object with string properties.

The return example `: { x: 0, y: 0 }` is tested at transpile time!
#/
test 'createPoint returns correct structure' {
  const p = createPoint(5, 10)
  expect(p.x).toBe(5)
  expect(p.y).toBe(10)
}

function getFullName(person: { first: '', last: '' }): ' ' {
  return person.first + ' ' + person.last
}

function createPoint(x: 0, y: 0): { x: 0, y: 0 } {
  return { x, y }
}

function distance(p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }): 0.0 {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Usage - signature tests verify these at transpile time
const name = getFullName({ first: 'Jane', last: 'Doe' })  // -> 'Jane Doe'
const dist = distance({ x: 0, y: 0 }, { x: 3, y: 4 })     // -> 5

console.log('Name:', name)
console.log('Distance:', dist)
```

<!-- TODO review -->

## What to notice

An object example describes a **shape**: which properties must be there, and what type each
one holds. `person: { first: '', last: '' }` accepts any object whose `first` and `last` are
strings. The values in the example (`''`) are only there to say "string"; they are not
required values.

- **Every listed member is required, and checked.** Leaving `last` out, or passing a number
  for it, returns a `MonadicError` whose path names the member: `getFullName.person.last`.
- **Extra members are allowed.** `{ first: 'Jane', last: 'Doe', id: 7 }` is a fine person.
  A shape says what must be there, not what must not.
- **Number members follow the number rules.** `{ x: 0, y: 0 }` is a point with *integer*
  coordinates, so `createPoint(1.5, 2)` is rejected. That is why `distance` returns `0.0`:
  the distance between two integer points is usually not an integer.
- **The return example is a worked example.** `getFullName`'s `: ' '` is what it returns for
  the parameter examples (`'' + ' ' + ''`), and `createPoint(x: 0, y: 0): { x: 0, y: 0 }`
  says `createPoint(0, 0)` returns `{ x: 0, y: 0 }`. Objects are compared by structure, not
  identity, so a new object with the right contents passes.

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

## Things that trip people up

- **An optional member is spelled as a union with `undefined`.** In a parameter shape,
  `{ name: '', nick: '' | undefined }` lets `nick` be absent. Writing `nick: ''` makes it
  required.
- **A shape is not a dictionary default.** `p: { x: 0, y: 0 }` (colon) requires a whole
  point. `p = { x: 0, y: 0 }` (equals) makes the argument optional *and* fills in missing
  members one by one; see [Dictionary Defaults](/dictionary-defaults-example/).
- **Name a shape you use twice.** Repeating `{ x: 0, y: 0 }` in three signatures, as this
  example does, works but drifts. `Type Point { example: { x: 0, y: 0 } }` gives it a name;
  see [Declarations](/declarations/).
