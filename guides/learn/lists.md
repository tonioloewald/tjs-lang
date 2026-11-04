<!--{"parent": "learn-to-program.md", "order": 7}-->

# Lists

A shopping list, the scores in a game, the names in a class: most things worth a program
come in lists. In TJS a list is called an **array**: values in order, inside square
brackets, separated by commas.

<!-- TODO review -->

Why not just use names? You could keep a class's scores as `score1`, `score2`, `score3`. But
then adding them up means writing out every name, and a new student means changing the
program. A list holds any number of values under one name, and a loop (from Repetition) can go
through it however long it is. Lists and loops are made for each other.

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

<!-- TODO review -->

That is a quiet answer to a real mistake. Asking for an item past the end of a list does not
stop the program: it gives back `undefined`, and the program carries on with nothing where it
expected a fruit. If a page ever shows the word `undefined`, look for a list being read past its
end, very often by one.

<!-- TODO review -->

## The last item, and changing items

Because counting starts at 0, the last item is at `length - 1`, not at `length`. And you can
change an item by putting a new value at its position:

```tjs:inline {"view": "code"}
const colours = ['red', 'green', 'blue']
const last = colours[colours.length - 1]

colours[1] = 'yellow'

preview.append(`The last colour is ${last}. Now the list is ${colours.join(', ')}.`)

test 'the last item, and changing one' {
  expect(last).toBe('blue')
  expect(colours[colours.length]).toBe(undefined)
  expect(colours).toEqual(['red', 'yellow', 'blue'])
}
```

The second check is the off-by-one mistake from Repetition, caught: `colours[colours.length]`
is one past the end. (`join` and `toEqual` are explained a little further down.)

`colours` is a `const`, and yet one of its items changed. `const` means the **name** always
refers to the same list; what is inside the list can still change. Things with Parts says more
about that.

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

<!-- TODO review -->

Read `for (const price of prices)` as "for each price in prices". The name `price` is yours to
choose; it names the current item, and each round it is the next one. It can be a `const`,
unlike the counter in a `for` loop, because each round gets a fresh `price` rather than
changing the old one.

<!-- TODO review -->

## When a list has the wrong thing in it

TJS checks every item, not just that it was given a list. The error says which item is wrong:

```tjs:inline {"view": "code"}
function total(prices: [0.0]) {
  let sum = 0
  for (const price of prices) {
    sum = sum + price
  }
  return sum
}

const bill = total([2.5, 'four', 1.25])
preview.append(bill instanceof Error ? bill.message : `The bill comes to ${bill}.`)

test 'one bad item is enough to refuse the list' {
  expect(bill instanceof Error).toBe(true)
  expect(bill.message).toContain('prices[1]')
  expect(total(4) instanceof Error).toBe(true)
}
```

The message names `prices[1]`, the second item, and says a number was expected and a string
arrived. Without that check, `sum + 'four'` would join instead of adding (Values and Names),
and the bill would come to `'2.5four1.25'`, a string that looks almost like an answer. With
it, you find out at once, and you find out where. Change `'four'` to `4` and the bill adds up
(and the first two checks fail, because they expect an error: that is right too).

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

<!-- TODO review -->

Why not `toBe`? Because two lists made separately are two different lists, even when they hold
the same things, just as two identical shopping lists are still two pieces of paper. `toBe`,
like `==`, asks "is this the very same list?"; `toEqual` asks "does it hold the same things?".
Change one `toEqual` to `toBe` and read the failure: the expected and received lists look the
same, and that is the clue.

<!-- TODO review -->

## Finding things in a list

`includes` asks whether a list has an item, and `indexOf` asks where it is:

```tjs:inline {"view": "code"}
const guests = ['Ada', 'Grace', 'Katherine']

preview.append(`Is Grace coming? ${guests.includes('Grace')}. `)
preview.append(`She is guest number ${guests.indexOf('Grace') + 1}.`)

test 'looking things up' {
  expect(guests.includes('Grace')).toBe(true)
  expect(guests.includes('grace')).toBe(false)
  expect(guests.indexOf('Grace')).toBe(1)
  expect(guests.indexOf('Alan')).toBe(-1)
}
```

`indexOf` gives back a position, counting from 0, so the program adds 1 for people, who count
from 1. When the item is not there, it gives back `-1`, which can never be a real position.
And the search is exact: `'grace'` is not `'Grace'`.

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

<!-- TODO review -->

## Putting a list in order

`sort` puts a list in order. It changes the list itself, rather than making a new one:

```tjs:inline {"view": "code"}
const names = ['Grace', 'Ada', 'Katherine']
names.sort()

const numbers = [10, 9, 100, 1]
const wrong = [...numbers].sort()
const right = [...numbers].sort((a, b) => a - b)

preview.append(`${names.join(', ')} / ${wrong.join(', ')} / ${right.join(', ')}`)

test 'sorting words, and sorting numbers' {
  expect(names).toEqual(['Ada', 'Grace', 'Katherine'])
  expect(wrong).toEqual([1, 10, 100, 9])
  expect(right).toEqual([1, 9, 10, 100])
}
```

Words sort as you would expect. Numbers do not, and this catches everybody once: plain `sort`
compares everything **as text**, letter by letter, and as text `'100'` comes before `'9'`, the
way `'apple'` comes before `'banana'`. To sort numbers by size, hand `sort` a small function
that compares two of them: `(a, b) => a - b`. The `map` section above explains the arrow; for
now, read it as "smaller first".

`[...numbers]` makes a copy of the list, so the example can sort it two ways without the first
sort changing what the second one sees. Remove the `[...` and `]` from the first sort and watch
the third result change.

## Showing a list on the page

Put `map` and the building blocks from Hello, Screen together, and a list of data becomes a list on
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

<!-- TODO review -->

Then:

1. Write `average(numbers: [0.0])` with `for … of`. Test it with a few lists. What does it give
   back for an empty list, and why? (When Things Go Wrong comes back to this.)
2. Use `map` to turn `['ada', 'grace']` into `['ADA', 'GRACE']`, and test it with `toEqual`.
3. Use `filter` and `length` to count how many numbers in a list are even. Then do it again
   with `for … of` and a `let`. Which do you find easier to read?
4. Make a list of five scores, sort it highest first (hint: `(a, b) => b - a`), and show the
   top three with `slice(0, 3)`. Look up what `slice` does by trying it at a console.
