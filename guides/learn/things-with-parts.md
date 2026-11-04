<!--{"parent": "learn-to-program.md", "order": 8}-->

# Things with Parts

A list keeps values in order. Often what you want instead is one thing with several named
parts: a person has a name and a birth year, a rectangle has a width and a height. In TJS that
is an **object**.

<!-- TODO review -->
Why not just use lists? You could keep names in one list and birth years in another, and match
them up by position: the first name goes with the first year. It works until someone adds a
name and forgets the year, or sorts one list and not the other. Then every person after the
mistake has someone else's birthday, and nothing complains. An object keeps the parts of one
thing together, so they cannot drift apart.

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

<!-- TODO review -->
That `undefined` is worth a second look, because it is also what you get from a **typo**.
Write `ada.nmae` instead of `ada.name` and there is no error: the object simply has no part
called `nmae`, so the answer is `undefined`, and the page says "undefined was born in 1815".
Try it. Later in this chapter you will see how to make TJS check that the parts you need are
really there.

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

<!-- TODO review -->
## Parts inside parts

A property can hold any value, including a list or another object. Chain the dots to reach
inside:

```tjs:inline {"view": "code"}
const book = {
  title: 'Frankenstein',
  year: 1818,
  author: { name: 'Mary Shelley', born: 1797 },
  chapters: ['Letter 1', 'Letter 2', 'Letter 3'],
}

preview.append(
  `${book.title} was written by ${book.author.name}, ` +
    `aged ${book.year - book.author.born}. It opens with "${book.chapters[0]}".`
)

test 'reaching inside' {
  expect(book.author.name).toBe('Mary Shelley')
  expect(book.chapters.length).toBe(3)
}
```

Read `book.author.name` from left to right: take `book`, then its `author`, then that
author's `name`. Most real data is shaped like this: a thing, with parts, some of which have
parts of their own.

<!-- TODO review -->
## Parts named by a value

The dot needs the property's name written out in the program. When the name is in a value
instead, use square brackets, as you would for a list:

```tjs:inline {"view": "code"}
function countWords(words: ['']) {
  const counts = {}
  for (const word of words) {
    if (counts[word] == undefined) {
      counts[word] = 0
    }
    counts[word] = counts[word] + 1
  }
  return counts
}

const counts = countWords(['the', 'cat', 'saw', 'the', 'other', 'cat'])

preview.append(`"the" appears ${counts.the} times, "cat" ${counts['cat']} times.`)

test 'counting words' {
  expect(counts['the']).toBe(2)
  expect(counts.saw).toBe(1)
  expect(counts.dog).toBe(undefined)
}
```

`counts[word]` means "the part of `counts` whose name is whatever `word` is". The first time
a word turns up there is no such part yet (`undefined`), so it is set to 0 before adding one.
`counts.the` and `counts['the']` mean the same thing; the brackets are for when you do not
know the name until the program runs.

<!-- TODO review -->
## Going through the parts

`Object.keys` gives you a list of an object's property names, which you can go through with
`for … of`, like any list:

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { ul, li } = elements

const stock = { apples: 12, pears: 0, plums: 30 }

const lines = []
for (const fruit of Object.keys(stock)) {
  lines.push(`${fruit}: ${stock[fruit]}`)
}

preview.append(ul(...lines.map((line) => li(line))))

test 'every fruit gets a line' {
  expect(Object.keys(stock)).toEqual(['apples', 'pears', 'plums'])
  expect(lines[1]).toBe('pears: 0')
}
```

The names come out in the order the parts were added.

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

<!-- TODO review -->
## Functions that make objects

A function can give back an object, which is how you return several answers at once:

```tjs:inline {"view": "code"}
function stats(numbers: [0.0]) {
  let smallest = numbers[0]
  let largest = numbers[0]
  for (const n of numbers) {
    if (n < smallest) {
      smallest = n
    }
    if (n > largest) {
      largest = n
    }
  }
  return { smallest, largest }
}

const result = stats([4, 8, 15, 16, 23, 42])

preview.append(`From ${result.smallest} to ${result.largest}.`)

test 'one call, two answers' {
  expect(stats([4, 8, 15]).smallest).toBe(4)
  expect(stats([4, 8, 15])).toEqual({ smallest: 4, largest: 15 })
}
```

`{ smallest, largest }` is short for `{ smallest: smallest, largest: largest }`: when a part
has the same name as the value you are putting in it, you can write the name once.

<!-- TODO review -->
## Same parts, different objects

Look at the last test again. It uses `toEqual`, not `toBe`. That matters:

```tjs:inline {"view": "code"}
const a = { x: 1, y: 2 }
const b = { x: 1, y: 2 }
const c = a

preview.append(`a == b is ${a == b}, a == c is ${a == c}, Is(a, b) is ${Is(a, b)}`)

test 'equal parts are not the same object' {
  expect(a == b).toBe(false)
  expect(a == c).toBe(true)
  expect(Is(a, b)).toBe(true)
  expect(a).toEqual(b)
}
```

`a` and `b` have the same parts, but they are two separate objects, made by two separate
pairs of braces. `==` asks "is this the very same object?", and they are not. `c` is not a
copy: `const c = a` gives the same object a second name, so `a == c` is true. Change `c.x` to
5 and print `a.x` to see it.

To ask "do these have the same parts?", use `Is(a, b)`, which looks inside, or, in a test,
`toEqual`. (TJS keeps `==` as a quick "same thing?" question on purpose: comparing every part
of two large objects can take a long time, and you should be able to see when a program does
that.)

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

<!-- TODO review -->
This is the answer to the typo problem from the start of the chapter. Call
`area({ width: 3, hieght: 4 })` and TJS does not quietly multiply by `undefined`: it says the
rectangle has no `height`, at the moment the mistake happens, and names the part. The example
in the parameter is a promise about the parts, and TJS checks the promise on every call.

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

<!-- TODO review -->
## A shape with a rule

Some things are not described by their shape alone. A percentage is a number, but not any
number: it is between 0 and 100. A `Type` can carry a **predicate**, a small function that
answers "is this value acceptable?" with `true` or `false`:

```tjs:inline {"view": "code"}
Type Percent {
  description: 'a whole number from 0 to 100'
  example: 50
  predicate(value) {
    return value >= 0 && value <= 100
  }
}

function progressBar(done: Percent) {
  const filled = Math.round(done / 10)
  return '#'.repeat(filled) + '.'.repeat(10 - filled) + ` ${done}%`
}

preview.append(progressBar(70))

test 'a Percent must be from 0 to 100' {
  expect(progressBar(70)).toBe('#######... 70%')
  expect(Percent.check(100)).toBe(true)
  expect(Percent.check(101)).toBe(false)
  expect(progressBar(150) instanceof Error).toBe(true)
}
```

`progressBar(150)` never runs: 150 is a whole number, but the predicate says no, so the call
gives back an error instead of a bar with a negative number of dots. The rule is written once,
in the `Type`, and every function that takes a `Percent` gets it for free.

## Try it

Make a `Type Book` with a `title` and a number of `pages`. Write `longBooks(books: [Book])` that
gives back the titles of the books with more than 300 pages, and test it with a list of three
books (one short, two long), and with an empty list. `[Book]` means "a list of Books", and
every book in it is checked: test that a list with a book missing its `pages` is refused.

<!-- TODO review -->
More to try:

- Use `countWords` to find which letter is most common in a sentence. (A string can be split
  into a list of its letters with `sentence.split('')`.)
- Write `Type Temperature` for a number of degrees Celsius that cannot be below -273.15
  (absolute zero; nothing is colder). Give it a description, an example with a decimal point,
  and a predicate, and test both sides of the edge.
- Write `swap(point: { x: 0, y: 0 })` that gives back a **new** point with `x` and `y`
  exchanged. Test it with `toEqual`, and test that the point you passed in has not changed.
