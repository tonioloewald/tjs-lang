<!--{"parent": "learn-to-program.md", "order": 6}-->

# Lists

A shopping list, the scores in a game, the names in a class: most things worth a program
come in lists. In TJS a list is called an **array**: values in order, inside square
brackets, separated by commas.

## Making a list

```tjs:inline {"view": "code"}
const fruits = ['apple', 'banana', 'cherry']

preview.append(`The first fruit is ${fruits[0]}, and there are ${fruits.length} of them.`)

test 'reading a list' {
  expect(fruits[0]).toBe('apple')
  expect(fruits[2]).toBe('cherry')
  expect(fruits.length).toBe(3)
}
```

- `fruits[0]` is the first item. Counting starts at **0**, so the third item is `fruits[2]`.
  That surprises everyone once; after that it is just how lists work.
- `fruits.length` is how many items there are.

Ask the console for `fruits[1]`, then `fruits[3]`: there is no fourth fruit, so the answer is
`undefined`, meaning "nothing here".

## Going through a list

`for … of` runs a block once for each item, with a name for the current one:

```tjs:inline {"view": "code"}
function total(prices: [0.0]) {
  let sum = 0
  for (const price of prices) {
    sum = sum + price
  }
  return sum
}

preview.append(`The bill comes to ${total([2.5, 4, 1.25])}.`)

test 'adding up a list' {
  expect(total([2.5, 4, 1.25])).toBe(7.75)
  expect(total([])).toBe(0)
}
```

The example `[0.0]` says what `prices` is: a list of numbers. An empty list is still a list
of numbers, so `total([])` is fine (and 0). A list with a word in it, or a single number that
is not in a list, is refused with an error that says what was expected.

## Growing a list

`push` adds an item to the end. A loop and `push` together build a list:

```tjs:inline {"view": "code"}
function squares(n: 0) {
  const result = []
  for (let i = 1; i <= n; i++) {
    result.push(i * i)
  }
  return result
}

preview.append(squares(6).join(', '))

test 'the first squares' {
  expect(squares(4)).toEqual([1, 4, 9, 16])
  expect(squares(0)).toEqual([])
}
```

`join(', ')` turns a list into one string, with `', '` between the items. In a test, compare
lists with `toEqual`, which looks at what is inside them.

## Changing every item: `map`

`map` makes a new list by doing the same thing to every item:

```tjs:inline {"view": "code"}
const prices = [10, 20, 30]
const withTax = prices.map((price) => price * 1.5)

preview.append(withTax.join(', '))

test 'map does the same thing to every item' {
  expect(withTax).toEqual([15, 30, 45])
  expect(prices).toEqual([10, 20, 30])
}
```

`(price) => price * 1.5` is a small function with no name: given a `price`, it gives back
`price * 1.5`. The `=>` arrow is a short way to write a function you only need here. `map`
calls it once for each item and collects the answers. The original list is not changed: the
second check in the test says so.

## Keeping some items: `filter`

`filter` makes a new list of only the items your function says yes to:

```tjs:inline {"view": "code"}
const scores = [42, 87, 65, 91, 38, 75]
const passing = scores.filter((score) => score >= 50)

preview.append(`${passing.length} passed: ${passing.join(', ')}`)

test 'filter keeps what passes the test' {
  expect(passing).toEqual([87, 65, 91, 75])
}
```

## Showing a list on the page

Put `map` and the building blocks from chapter 1 together, and a list of data becomes a list on
the page:

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { ul, li } = elements

const planets = ['Mercury', 'Venus', 'Earth', 'Mars']

preview.append(ul(...planets.map((planet) => li(planet))))
```

`ul` makes a list and `li` makes one item in it. `planets.map(…)` turns each name into an item,
and the `...` in front spreads the items out, so `ul` gets them one by one instead of as a
single list. Add a planet to the array and it appears on the page.

## Try it

Write `longest(words: [''])` that gives back the longest word in a list, and test it with a
few lists, including one with two words of the same length (decide which one should win, and
test that). Then show the words from a list that are longer than four letters, as a list on
the page.
