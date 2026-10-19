<!--{"parent": "learn-to-program.md", "order": 8}-->

# Things with Parts

A list keeps values in order. Often what you want instead is one thing with several named
parts: a person has a name and a birth year, a rectangle has a width and a height. In TJS that
is an **object**.

## Making an object

An object is written in braces, as `name: value` pairs separated by commas. Each part is
called a **property**, and you read one with a dot:

```tjs:inline {"view": "code"}
const ada = { name: 'Ada Lovelace', born: 1815 }

preview.append(`${ada.name} was born in ${ada.born}.`)

test 'reading properties' {
  expect(ada.name).toBe('Ada Lovelace')
  expect(ada.born).toBe(1815)
}
```

Ask the console for `ada.born + 36`, then for `ada.died`: an object with no `died` property
answers `undefined`, just as a list does past its end.

## Changing and adding parts

```tjs:inline {"view": "code"}
const counter = { label: 'clicks', count: 0 }
counter.count = counter.count + 1
counter.count = counter.count + 1
counter.colour = 'green'

preview.append(`${counter.label}: ${counter.count} (${counter.colour})`)

test 'parts can change, and new parts can be added' {
  expect(counter.count).toBe(2)
  expect(counter.colour).toBe('green')
}
```

`const` means the name `counter` always points at the same object; the object's parts can
still change.

## Lists of objects

Most real data is a list of objects: rows in a table, people in a class, items in a basket.
Everything from Lists works on them:

```tjs:inline {"view": "code"}
const basket = [
  { item: 'bread', price: 2.5, quantity: 1 },
  { item: 'apples', price: 0.5, quantity: 6 },
  { item: 'cheese', price: 4, quantity: 1 },
]

const lines = basket.map((row) => `${row.quantity} x ${row.item}`)
const total = basket
  .map((row) => row.price * row.quantity)
  .reduce((sum, cost) => sum + cost, 0)

preview.append(`${lines.join(', ')}: ${total}`)

test 'adding up a basket' {
  expect(lines[1]).toBe('6 x apples')
  expect(total).toBe(9.5)
}
```

`reduce` folds a list into one value: it starts at `0` and, for each item, gives back the
running total plus that item's cost. (You could write the same thing with `for … of` and a
`let`, as in Lists. Both are fine.)

## An object as a parameter

A parameter's example can be an object. Then the example says which parts the object must
have, and what kind each part is:

```tjs:inline {"view": "code"}
function area(rect: { width: 0, height: 0 }) {
  return rect.width * rect.height
}

preview.append(`A 3 by 4 rectangle has an area of ${area({ width: 3, height: 4 })}.`)

test 'area needs both parts' {
  expect(area({ width: 3, height: 4 })).toBe(12)
  expect(area({ width: 3, height: 4, colour: 'red' })).toBe(12)
  expect(area({ width: 3 }) instanceof Error).toBe(true)
}
```

Extra parts are fine (the rectangle can have a colour). A missing part is refused, and the
error names it: `area({ width: 3 })` says that `rect.height` was expected and is missing.

## Naming a shape: `Type`

When the same shape turns up in several places, give it a name. A `Type` describes a shape
with a sentence and an example:

```tjs:inline {"view": "code"}
Type Point {
  description: 'a position on a grid'
  example: { x: 0, y: 0 }
}

function distance(a: Point, b: Point) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

preview.append(`From (0, 0) to (3, 4) is ${distance({ x: 0, y: 0 }, { x: 3, y: 4 })}.`)

test 'a Point is anything shaped like one' {
  expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  expect(Point.check({ x: 1, y: 2 })).toBe(true)
  expect(Point.check({ x: 'one', y: 2 })).toBe(false)
}
```

- `a: Point` reads "a must be a Point", and is checked on every call, like any example.
- `Point.check(value)` asks the question yourself: is this shaped like a Point?
- `**` raises to a power: `3 ** 2` is 9. `Math.sqrt` is the square root.

The description is for people: it turns up in the documentation TJS writes for your code.

## Try it

Make a `Type Book` with a `title` and a number of `pages`. Write `longBooks(books: [Book])` that
gives back the titles of the books with more than 300 pages, and test it with a list of three
books (one short, two long), and with an empty list. `[Book]` means "a list of Books", and
every book in it is checked: test that a list with a book missing its `pages` is refused.
