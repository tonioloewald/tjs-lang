<!--{"parent": "learn-to-program.md", "order": 7}-->
<!-- TODO review -->

# Lists

A shopping list, the scores in a game, the names in a class: most things worth a program
come in lists. In TJS a list is called an **array**: values in order, inside square
brackets, separated by commas.

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
- `fruits.length` is how many items there are, the same way `.length` of a string is how many
  letters it has (Checking Your Work).

Change `fruits[0]` in the `preview.append` line to `fruits[1]`, and the page names the second
fruit. Now change it to `fruits[3]`: there is no fourth fruit, so the page shows `undefined`,
meaning "nothing here".

That is a quiet answer to a real mistake. Asking for an item past the end of a list does not
stop the program: it gives back `undefined`, and the program carries on with nothing where it
expected a fruit. If a page ever shows the word `undefined`, look for a list being read past its
end, usually by exactly one item: the off-by-one mistake from Repetition, in a new place.

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

The second check shows the off-by-one mistake from Repetition: `colours[colours.length]` is
one past the end, so it is `undefined`.

Two new pieces are in this example. `colours.join(', ')` turns the list into one string, with
`', '` between the items, so it can go into a sentence. And the last check uses `toEqual`, not
`toBe`, because it compares a whole list: `toEqual` looks at what is inside. Growing a List says
more about why.

The dot means the same thing in both `colours.length` and `colours.join(', ')`: "this list's".
`length` is a fact about the list, so it has no parentheses. `join` is something the list can
do, so it has parentheses, and they hold what you give it (here, the `', '` to put between the
items). Something a value can do is called a **method**. Leave the parentheses off a method, or
put them on `length`, and it does not work.

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

The example `[0.0]` says what `prices` is: a list of numbers. It is `0.0` rather than `0`
because `0.0` means any number, decimals like 2.5 included; a plain `0` would mean whole
numbers only (Functions). An empty list is still a list of numbers, so `total([])` is fine (and
0). A list with a word in it, or a single number that is not in a list, is refused.

Refused does not mean the program stops. As in Checking Your Work, `total` gives back an
**error** in place of a number, the error says what was expected, and the program carries on.
The next section shows one.

Read `for (const price of prices)` as "for each price in prices". The name `price` is yours to
choose; it names the current item, and each round it is the next one. It can be a `const`,
unlike the counter in a `for` loop, because each round gets a fresh `price` rather than
changing the old one.

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

if (bill instanceof Error) {
  preview.append(bill.message)
} else {
  preview.append(`The bill comes to ${bill}.`)
}

test 'one bad item is enough to refuse the list' {
  const refused = total([2.5, 'four', 1.25])
  expect(refused instanceof Error).toBe(true)
  expect(refused.message).toContain('prices[1]')
  expect(total(4) instanceof Error).toBe(true)
}
```

`bill instanceof Error` asks "is `bill` an error?", as in Checking Your Work. If it is, the page
shows its `.message`, the sentence that says what went wrong; if not, it shows the bill.

The message names `prices[1]`, the second item, and says a number was expected and a string
arrived. Without that check, `sum + 'four'` would stick the text on the end instead of adding
(Values and Names), and the bill would come to `'2.5four1.25'`, a string that looks almost like
an answer. With it, you find out at once, and you find out where. Change `'four'` to `4` in the
`const bill` line and the page shows the bill instead: 7.75.

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
  expect(squares(2) == [1, 4]).toBe(false)
}
```

`result.push(i * i)` is another method: `push` is something a list can do, and the parentheses
hold the item to add.

Look at the last check. `squares(2)` is the list `[1, 4]`, and yet `squares(2) == [1, 4]` is
`false`. Two lists made separately are two different lists, even when they hold the same
things, just as two identical shopping lists are still two pieces of paper. `==` asks "is this
the very same list?", and it is not. `toEqual` asks "does it hold the same things?", which is
almost always what you mean, so compare lists in a test with `toEqual`.

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
const doubled = prices.map((price) => price * 2)

preview.append(doubled.join(', '))

test 'map does the same thing to every item' {
  expect(doubled).toEqual([20, 40, 60])
  expect(prices).toEqual([10, 20, 30])
}
```

`map` does the looping for you; you only say what to do to each item. You say it by handing
`map` a function. You could write that function the long way, as in Functions:

```javascript
function double(price) {
  return price * 2
}
const doubled = prices.map(double)
```

`(price) => price * 2` is the same function written short. It has no name, no braces and no
`return`: with no braces, an arrow function gives back whatever comes after the `=>`. The short
form suits a function you only need in one place. `map` calls it once for each item and
collects the answers into a new list. The original list is not changed: the second check in the
test says so.

## Keeping some items: `filter`

`filter` makes a new list of only the items your function says yes to:

```tjs:inline {"view": "code"}
const scores = [42, 87, 65, 91, 38, 75]
const passing = scores.filter((score) => score >= 50)

preview.append(`${passing.length} passed: ${passing.join(', ')}`)

test 'filter keeps what passes the test' {
  expect(passing).toEqual([87, 65, 91, 75])
  expect(scores.length).toBe(6)
}
```

The arrow `(score) => score >= 50` gives back `true` or `false` for each score. `filter` keeps
the scores where the answer is `true`, in their original order, and puts them in a new list.
Like `map`, it leaves the original alone: `scores` still has all six.

## Putting a list in order

`sort` puts a list in order. Unlike `map` and `filter`, it changes the list itself, rather
than making a new one:

```tjs:inline {"view": "code"}
const names = ['Grace', 'Ada', 'Katherine']
names.sort()

preview.append(names.join(', '))

test 'sorting words' {
  expect(names).toEqual(['Ada', 'Grace', 'Katherine'])
}
```

Words that all start with a capital letter sort as you would expect. Mix capitals and small
letters and you get a surprise: every capital comes before every small letter, so `'Zoe'` sorts
before `'ada'`. It is the same exactness as `'grace'` not being `'Grace'`.

Numbers are a bigger surprise, and this one catches everybody once: plain `sort` compares
everything **as text**, letter by letter, and as text `'100'` comes before `'9'`, the way
`'apple'` comes before `'banana'`.

Because `sort` changes the list, the next example sorts **copies**. `[...numbers]` makes a copy
of `numbers`: the `...` spreads the items out, and the square brackets around them make a new
list.

```tjs:inline {"view": "code"}
const numbers = [10, 9, 100, 1]
const wrong = [...numbers].sort()
const right = [...numbers].sort((a, b) => a - b)

preview.append(`numbers: ${numbers.join(', ')}. `)
preview.append(`Plain sort: ${wrong.join(', ')}. `)
preview.append(`By size: ${right.join(', ')}.`)

test 'sorting numbers' {
  expect(numbers).toEqual([10, 9, 100, 1])
  expect(wrong).toEqual([1, 10, 100, 9])
  expect(right).toEqual([1, 9, 10, 100])
}
```

To sort numbers by size, hand `sort` a function that compares two of them: `(a, b) => a - b`.
It is an arrow function like the ones in `map` and `filter`, but it takes two items instead of
one. `sort` calls it over and over with pairs from the list. When the answer is below zero, `a`
goes first; when it is above zero, `b` does; when it is zero, they stay as they are. `a - b` is
below zero exactly when `a` is smaller, so the smaller number goes first. Swap it to `b - a` and
the biggest goes first.

Because each sort works on its own copy, `numbers` itself stays as it was, and the page shows it
unchanged. Remove the `[...` and `]` from the first sort and run it again: the page now shows
`numbers` as 1, 10, 100, 9, in the same text order as the plain sort, because `sort` changed the
original. The test that checks `numbers` fails and says so.

## Taking part of a list: `slice`

`slice(start, end)` copies part of a list into a new one, from position `start` up to, but not
including, position `end`:

```tjs:inline {"view": "code"}
const letters = ['a', 'b', 'c', 'd', 'e']
const firstTwo = letters.slice(0, 2)

preview.append(`${firstTwo.join(', ')} / ${letters.slice(1, 4).join(', ')}`)

test 'slice copies part of a list' {
  expect(firstTwo).toEqual(['a', 'b'])
  expect(letters.slice(1, 4)).toEqual(['b', 'c', 'd'])
  expect(letters.length).toBe(5)
}
```

"Up to, but not including" means the end position is one past the last item you get, the same
way `length` is one past the last position. So `slice(0, 2)` gives two items, and
`slice(0, n)` gives the first `n`, if the list has that many. Like `map` and `filter`, `slice`
leaves the original list alone.

## Showing a list on the page

Put `map` and the building blocks from Hello, Screen together, and an array of data becomes a
bulleted list on the page:

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { ul, li } = elements

const planets = ['Mercury', 'Venus', 'Earth', 'Mars']

preview.append(ul(...planets.map((planet) => li(planet))))
```

As in Hello, Screen, `const { ul, li } = elements` takes the building blocks `ul` and `li` out
of `elements`. `ul` makes a bulleted list and `li` makes one bullet in it. `planets.map(…)`
turns each name into a bullet, giving an array of bullets, and the `...` in front spreads that
array out, so `ul` gets the bullets one by one instead of as a single array. Add a planet to
the array and it appears on the page.

## Try it

1. Write `average(numbers: [0.0])` with `for … of`. Test it with a few lists. What does it give
   back for an empty list, and why? (When Things Go Wrong comes back to this.)
2. Use `map` to turn `['ada', 'grace']` into `['ADA', 'GRACE']`, and test it with `toEqual`.
   (`'ada'.toUpperCase()` is `'ADA'`, as in Checking Your Work.)
3. Use `filter` and `length` to count how many numbers in a list are even. (`n % 2` is the
   remainder after dividing by 2, as in Decisions, so it is 0 for an even number.) Then do it
   again with `for … of` and a `let`. Which do you find easier to read?
4. Make a list of five scores, sort it highest first (hint: `(a, b) => b - a`), and show the
   top three with `slice(0, 3)`. What does `slice(0, 3)` give for a list of only two scores?
5. Write `longest(words: [''])` that gives back the longest word in a list. A word has a
   `.length` too: `'apple'.length` is 5. Hint: keep a `let best`, go through the list, and
   replace `best` whenever you find a longer word. Test it with a few lists, including one with
   two words of the same length (decide which one should win, and test that).
6. Show the words from a list that are longer than four letters, as a bulleted list on the
   page.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
