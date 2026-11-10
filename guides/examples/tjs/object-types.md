<!--{"section": "tjs", "type": "example", "group": "basics", "order": 3, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Object Types

Give a parameter a sample object, and TJS checks that every call passes an object of the
same shape. (This page assumes you know JavaScript.)

```tjs:inline
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

console.log(fullName({ first: 'Grace', last: 'Hopper' }))             // Grace Hopper
console.log(fullName({ first: 'Grace', last: 'Hopper', born: 1906 })) // Grace Hopper
console.log(distance({ x: 1, y: 1 }, { x: 4, y: 5 }))                 // 5

// A wrong argument does not throw: the call returns an error value
// (a MonadicError), and its .message says what was wrong.
console.log(fullName({ first: 'Grace' }).message)
// Expected string for '…:fullName.person.last', got undefined
console.log(fullName({ first: 'Grace', last: 7 }).message)
// Expected string for '…:fullName.person.last', got number
console.log(distance({ x: 1.5, y: 1 }, { x: 4, y: 5 }).message)
// Expected integer for '…:distance.p1.x', got number
```

## What to notice

An object example describes a **shape**: which properties must be there, and what type each
one holds. `person: { first: 'Ada', last: 'Lovelace' }` accepts any object whose `first` and
`last` are strings. The values in the example say "string", and they double as sample data;
they are not required values, so Grace Hopper is a fine person too.

- **Every listed member is required, and checked.** Leaving `last` out, or passing a number
  for it, returns an error whose message names the member's full path,
  `fullName.person.last`. (The `…` in the comments stands for the file and line, which
  depend on where the code runs.)
- **Extra members are allowed.** `{ first: 'Grace', last: 'Hopper', born: 1906 }` is a fine
  person. A shape says what must be there, not what must not.
- **Number members follow the number rules.** `0` means an integer and `0.0` means any
  number, so `{ x: 0, y: 0 }` is a point with integer coordinates, and
  `distance({ x: 1.5, y: 1 }, …)` is rejected on `p1.x`. An integer is a valid float, so
  `5` satisfies `5.0`; the reverse is not true.
- **The return example is a worked example.** `fullName`'s `: 'Ada Lovelace'` is what it
  returns when called with its parameter example, and `distance`'s `: 5.0` is the distance
  from `(0, 0)` to `(3, 4)`. TJS makes that call when it transpiles the code, before your
  code runs. Change `'Ada Lovelace'` to `'Ada'` and the file no longer passes `tjs check`:
  it reports `Expected "Ada" at 'fullName', got "Ada Lovelace"`.
- **Realistic examples make that test worth having.** With `person: { first: '', last: '' }`
  the return example would have to be `' '`, and that only proves the function adds a space.
- **The return example also documents the return type.** `5.0` says `distance` returns a
  float. `5` would declare an integer, which is wrong for most points. Return values are not
  checked at runtime unless you ask for it with `:?` (see [Return annotations](/TJS-SYNTAX/#return-annotations)).
- **Returned objects are compared by contents.** `createPoint(x: 0, y: 0): { x: 0, y: 0 }`
  says `createPoint(0, 0)` returns `{ x: 0, y: 0 }`. The function builds a new object, and
  two separately built objects with the same contents count as equal for a return example,
  even though `===` would call them different.

## Nested shapes and arrays

Shapes nest. An array member takes an array example: `['']` means an array whose items are
strings, and one sample item is enough. Errors carry the full path, so you can see which
part of a deep argument was wrong:

```tjs:inline
function area(rect: { width: 0.0, height: 0.0 }): 0.0 {
  return rect.width * rect.height
}

function label(item: { name: '', tags: [''], size: { w: 0, h: 0 } }) {
  return `${item.name} [${item.tags.join(', ')}] ${item.size.w}x${item.size.h}`
}

console.log(area({ width: 2, height: 1.5 }))               // 3
console.log(area({ width: 2, height: 1.5, color: 'red' })) // 3: extras are fine
console.log(area({ width: 2 }).message)
// Expected number for '…:area.rect.height', got undefined
console.log(area(null).message)
// Expected object for '…:area.rect', got null

console.log(label({ name: 'box', tags: ['a', 'b'], size: { w: 3, h: 4 } }))
// box [a, b] 3x4
console.log(label({ name: 'box', tags: ['a', 2], size: { w: 3, h: 4 } }).message)
// Expected array of string for '…:label.item.tags', got array of string | number
console.log(label({ name: 'box', tags: [], size: { w: 3.5, h: 4 } }).message)
// Expected integer for '…:label.item.size.w', got number
```

`area` passes the integer `2` where `0.0` is declared, which is fine. A bad array item is
reported on the array (`label.item.tags`), with the item types it found. The last line fails
on `size.w`, not on the empty `tags`: an empty array is a valid array of strings.

A return example is optional. `label` has none, so it gets no signature test, and its return
type is not declared.

## Optional members

Every member of a shape is required. To let one be absent, give it a union with
`undefined`. `A | B` means "either A or B", so `'Countess' | undefined` is a string that may
be left out:

```tjs:inline
function greet(user: { name: 'Ada', nick: 'Countess' | undefined }): 'Hello, Countess' {
  return 'Hello, ' + (user.nick ?? user.name)
}

console.log(greet({ name: 'Grace' }))                    // Hello, Grace
console.log(greet({ name: 'Grace', nick: undefined }))   // Hello, Grace
console.log(greet({ name: 'Grace', nick: 'Amazing' }))   // Hello, Amazing
console.log(greet({ name: 'Grace', nick: 7 }).message)
// Expected string | undefined for '…:greet.user.nick', got number
console.log(greet({ name: 'Grace', nick: null }).message)
// Expected string | undefined for '…:greet.user.nick', got null
```

`null` is not `undefined` here: a member that may be `null` needs `| null` in its example.
Writing `nick: 'Countess'` without the union would make `greet({ name: 'Grace' })` an error.

## Things that trip people up

- **A shape is not a dictionary default.** `p: { x: 0, y: 0 }` (colon) requires every listed
  member. `p = { x: 0, y: 0 }` (equals) makes the argument optional *and* fills in missing
  members one by one; see [Dictionary Defaults](/dictionary-defaults-example/).
- **Name a shape you use twice, and know what it costs.** Repeating `{ x: 0, y: 0 }` in
  several signatures works, but if you change one copy the others silently disagree.
  `Type Point { example: { x: 0, y: 0 } }` gives the shape a name, and
  `function distance(p1: Point, p2: Point)` uses it; see [Declarations](/declarations/).
  The cost: a value that fails a named type is reported against the type, not the member.
  `distance({ x: 1.5, y: 1 }, …)` then says `Expected Point for '…:distance.p1', got
  object`, without naming `x`. An inline shape gives the more precise error.
