<!--{"parent": "learn-to-program.md", "order": 13}-->
<!-- TODO review -->

# Recursion

A function can call other functions; Functions showed `bill` calling `cost` and `withTax`. A
function can also call **itself**. That sounds like a way to go round in circles forever, and
done carelessly it is. Done properly, it is one of the most useful ideas in programming: to
solve a problem, solve a **smaller copy of the same problem**, and use that answer to finish
the job. This is called **recursion**.

Some problems are shaped like that already. A tree is a trunk with smaller trees growing from
it. A box can hold things, and some of those things are boxes. For problems like these,
recursion is not a trick: it is the plainest way to say what you mean.

## Factorial, two ways

The factorial of a number, written with an exclamation mark, multiplies together every whole
number from 1 up to it: 5! is 1 × 2 × 3 × 4 × 5, which is 120. Repetition asked you to write
it with a loop, and the calculator's n! key needs it. Here is the loop version beside a
recursive one:

```tjs:inline {"view": "code"}
function factorialLoop(n: 0) {
  let answer = 1
  for (let i = 2; i <= n; i++) {
    answer = answer * i
  }
  return answer
}

function factorial(n: 0) {
  if (n == 0) {
    return 1
  }
  return n * factorial(n - 1)
}

preview.append(`5! is ${factorialLoop(5)} with a loop, and ${factorial(5)} without one.`)

test 'both ways give the same answers' {
  expect(factorial(5)).toBe(120)
  expect(factorial(0)).toBe(1)
  for (let n = 0; n <= 10; n++) {
    expect(factorial(n)).toBe(factorialLoop(n))
  }
}
```

The loop version builds the answer up, one multiplication per round. The recursive version
has no loop at all. It says two things:

- The factorial of 0 is 1. (Mathematicians agree, and it makes the rest work.)
- The factorial of any other number is that number times the factorial of the number below
  it. 5! is 5 × 4!, because 4! is already 1 × 2 × 3 × 4.

Both of those are true, and together they are the whole definition. `factorial(5)` does not
know what 4! is, so it asks: it calls `factorial(4)`, which asks `factorial(3)`, and so on
down to `factorial(0)`, which knows the answer without asking anyone.

The test does more than check two answers: its `for` loop checks that the two versions agree
for every number from 0 to 10. A loop is allowed inside a test, and when you rewrite a
function a new way, checking it against the old one is a good test to write.

## What each call is waiting for

When `factorial(5)` calls `factorial(4)`, it does not stop and forget what it was doing. It
**waits**, holding on to its own `n`, which is 5, until `factorial(4)` gives back an answer.
Then it multiplies and gives back its own. Each call has its own `n`, just as Functions said
names inside a function stay inside: the `n` of `factorial(5)` and the `n` of `factorial(4)`
are different names that happen to be spelled the same.

Here is `factorial(4)` worked out by hand. Each line replaces one call with what that call
works out:

```text
factorial(4)
= 4 × factorial(3)
= 4 × 3 × factorial(2)
= 4 × 3 × 2 × factorial(1)
= 4 × 3 × 2 × 1 × factorial(0)
= 4 × 3 × 2 × 1 × 1
= 24
```

Going down, every call is waiting. Only when `factorial(0)` answers can the multiplications
happen, on the way back up. This version says out loud what each call is doing:

```tjs:inline {"view": "console"}
function factorial(n: 0) {
  if (n == 0) {
    console.log('factorial(0) is 1, without asking anyone')
    return 1
  }
  console.log(`factorial(${n}) waits for factorial(${n - 1})`)
  const answer = n * factorial(n - 1)
  console.log(`factorial(${n}) is ${answer}`)
  return answer
}

factorial(4)

test 'talking does not change the answer' {
  expect(factorial(4)).toBe(24)
}
```

The console shows four calls waiting, one after another, then the answers coming back in the
opposite order: the last call to start is the first to finish. Type `factorial(6)` at the
prompt to watch a longer one.

## The base case

The `if (n == 0)` is called the **base case**: the copy of the problem small enough to answer
straight away. Every recursion needs one. Without it, each call asks the next, which asks the
next, and nothing ever answers.

Try it. In the first example of this chapter, delete the three lines of the `if` in
`factorial`, so it reads:

<!-- tjs-doc: fragment -->
```tjs:static
function factorial(n: 0) {
  return n * factorial(n - 1)
}
```

and run it. The example stops, and instead of a result it shows an error:
**Maximum call stack size exceeded**. (Firefox says **too much recursion**.) It is not
running forever, as a `while` loop with the wrong condition would. Every call that is waiting
takes up a little memory, to remember its own `n` and where to carry on. The list of waiting
calls is called the **call stack**, and it has a limit. `factorial(5)` called `factorial(4)`,
then `factorial(0)`, then `factorial(-1)`, then `factorial(-2)`, and so on, thousands of
calls deep, until there was no room for one more. Then the program stopped.

That message is one of the mistakes that stop the program, like `is not defined` in When
Things Go Wrong: there is no sensible value to give back. When you see it, look for a
function that calls itself, and ask two questions. Does it have a base case? Does every call
get closer to it?

### A base case that is stepped over

Put the `if` back, so the tests pass again. The base case is there now, but it can still be
missed. `factorial(-1)` calls `factorial(-2)`, which calls `factorial(-3)`: counting down from
a negative number never reaches 0. The example `n: 0` means any whole number, and -1 is one.

The factorial of a negative number has no meaning, so the honest fix is to refuse one, and
you already know how: the example `+0` means a whole number that is zero or more.

```tjs:inline {"view": "code"}
function factorial(n: +0) {
  if (n == 0) {
    return 1
  }
  return n * factorial(n - 1)
}

const answer = factorial(-1)
if (answer instanceof Error) {
  preview.append(answer.message)
} else {
  preview.append(`The answer is ${answer}.`)
}

test 'factorial of a negative number is refused' {
  expect(factorial(6)).toBe(720)
  expect(factorial(-1) instanceof Error).toBe(true)
}
```

Now `factorial(-1)` never runs at all: it gives back an error saying it expected a
non-negative integer. Change `n: +0` back to `n: 0` and run it again to see the call stack
overflow instead. The example on the parameter is what keeps every call on the road to the
base case.

## A tree

Factorial can be written either way. A tree is different: it is made of smaller copies of
itself. A tree is a trunk with two smaller trees growing from its tip, each a little shorter
and leaning a little to one side. Each of those is a trunk with two smaller trees on it, and
so on, until the trees are too small to bother with. That sentence is the program:

```tjs:inline {"view": "code"}
import { svgElements } from 'tosijs'

const { svg, line } = svgElements

// Every line in a tree: its trunk, then the lines of two smaller trees on top.
function tree(x: 50.0, y: 100.0, length: 30.0, angle: 0.0, depth: 0) {
  if (depth == 0) {
    return []
  }
  const tipX = x + length * Math.cos(angle)
  const tipY = y + length * Math.sin(angle)
  const trunk = { x1: x, y1: y, x2: tipX, y2: tipY }
  const left = tree(tipX, tipY, length * 0.7, angle - 0.5, depth - 1)
  const right = tree(tipX, tipY, length * 0.7, angle + 0.5, depth - 1)
  return [trunk, ...left, ...right]
}

const up = -Math.PI / 2 // a quarter turn: on screen, y counts down, so up is negative

const picture = svg({ viewBox: '0 0 100 100', width: 240, height: 240 })
for (const l of tree(50, 100, 30, up, 8)) {
  picture.append(line({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, stroke: 'sienna' }))
}
preview.append(picture)

test 'a tree is a trunk with two smaller trees on it' {
  expect(tree(50, 100, 30, up, 0)).toEqual([])
  expect(tree(50, 100, 30, up, 1).length).toBe(1)
  expect(tree(50, 100, 30, up, 2).length).toBe(3)
  expect(tree(50, 100, 30, up, 8).length).toBe(255)
}

test 'the trunk grows straight up from the bottom' {
  const trunk = tree(50, 100, 30, up, 1)[0]
  expect(trunk.x2).toBe(50)
  expect(trunk.y2).toBe(70)
}
```

`tree` does not draw anything itself. It gives back a list of lines, each an object with a
start (`x1`, `y1`) and an end (`x2`, `y2`), and the loop after it draws them. Keeping the
drawing apart from the working-out is what lets the tests check the tree: they count its
lines, and look at where the trunk ends.

Read `tree` from the top:

- The base case: a tree with a `depth` of 0 has no lines at all, so it gives back an empty
  list.
- Otherwise it works out where the trunk's tip is, with `Math.cos` and `Math.sin` turning an
  angle into how far across and how far down, as in Repetition's polygons. (Angles here are
  measured the same way, in fractions of `2 * Math.PI`: 0.5 is about a twelfth of a turn.)
- It asks for two smaller trees, starting at the tip: each 0.7 times as long, one leaning
  left (`angle - 0.5`) and one right (`angle + 0.5`), and each one level less deep. Each
  `depth - 1` is the problem getting smaller, so the calls are sure to reach 0.
- It gives back its trunk followed by the lines of both smaller trees. `...left` spreads one
  list's items into another, as in Lists.

A tree of depth 1 is one line. Depth 2 is that line and two more: 3. Each level doubles the
number of branches at the top, so depth 8 is 255 lines, from a function of a dozen lines.
Change the 8 to 4 to see the shape clearly, or to 11 for a full tree (2,047 lines). Change
`0.5` to `0.3` for a tall, thin tree, or `0.7` to `0.8` for a bushy one.

Try writing this with loops alone. It can be done, but you have to keep your own list of
branches still to draw, which is the call stack's job here. Recursion keeps that list for you.

## Lists inside lists

A list can hold other lists, which can hold more lists. How many things are in this box?

```tjs:inline {"view": "code"}
function countItems(list: []) {
  let count = 0
  for (const item of list) {
    if (Array.isArray(item)) {
      count = count + countItems(item)
    } else {
      count = count + 1
    }
  }
  return count
}

const box = ['spoon', ['fork', 'knife'], [['cup', 'saucer'], 'plate']]

preview.append(`There are ${countItems(box)} things in the box.`)

test 'counting every item, however deep' {
  expect(countItems(box)).toBe(6)
  expect(countItems(['a', 'b'])).toBe(2)
  expect(countItems([])).toBe(0)
  expect(countItems([[[]]])).toBe(0)
}
```

The example `[]` is an empty list, which says "a list of anything": the items can be words,
numbers or other lists. (`[0.0]` in Lists meant a list of numbers; with nothing in the
example, nothing is said about the items.) `Array.isArray(item)` asks "is this item a list?",
and is true for `['fork', 'knife']` and false for `'spoon'`.

So `countItems` goes through the list, as `for … of` always does, and counts each item as
one, except that an item which is itself a list is counted by asking `countItems` about it.
The inner list is part of the outer one, so it is a smaller copy of the problem.

Where is the base case? There are two, and neither is an `if` at the top. An item that is not
a list is answered straight away: it counts as 1. And an empty list is answered without
calling anything, because the loop runs zero times and `count` stays 0. That is why
`countItems([[[]]])`, three lists one inside another with nothing in the middle, is 0.

A loop alone cannot do this, because you do not know how deep the lists go. Two levels would
need a loop inside a loop; three levels, three loops. `countItems` handles any depth, because
each call only has to handle one level and pass the rest on.

## A shopping list with sections

Real data is often nested the same way. This shopping list has sections, and one section has
a section of its own. Each entry has a `name`; an entry with `items` is a section, and an
entry with a `price` is a thing to buy.

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { pre } = elements

const shopping = {
  name: 'Shopping',
  items: [
    { name: 'bread', price: 2.5 },
    {
      name: 'fruit',
      items: [
        { name: 'apples', price: 3 },
        { name: 'pears', price: 1.75 },
      ],
    },
    {
      name: 'party',
      items: [
        { name: 'balloons', price: 4 },
        {
          name: 'cake',
          items: [
            { name: 'flour', price: 1.25 },
            { name: 'eggs', price: 2.5 },
          ],
        },
      ],
    },
  ],
}

function cost(entry: { name: '' }) {
  if (entry.items == undefined) {
    return entry.price
  }
  let sum = 0
  for (const part of entry.items) {
    sum = sum + cost(part)
  }
  return sum
}

function outline(entry: { name: '' }, indent = '') {
  let text = `${indent}${entry.name}\n`
  if (entry.items != undefined) {
    for (const part of entry.items) {
      text = text + outline(part, indent + '  ')
    }
  }
  return text
}

preview.append(pre(outline(shopping)), `It all comes to ${cost(shopping)}.`)

test 'a section costs what its parts cost' {
  expect(cost({ name: 'eggs', price: 2.5 })).toBe(2.5)
  expect(cost(shopping.items[1])).toBe(4.75)
  expect(cost(shopping)).toBe(15)
}

test 'the outline indents each section' {
  expect(outline(shopping.items[1])).toBe('fruit\n  apples\n  pears\n')
}
```

`cost` has the same shape as `countItems`. Its base case is a thing to buy, which costs its
`price`. A section costs the total of its parts, and each part is either a thing (answered
straight away) or a smaller section (asked about). The `{ name: '' }` example says every
entry must have a name; `items` and `price` are allowed as extra parts. Change `name` to
`title` on the pears and run it: `cost` refuses the pears with an error naming
`cost.entry.name`, and because `sum + …` sticks that error onto the total as text, the page
shows a jumble with the message in it. The tests go red too.

`outline` walks the same shape to make the text on the page. The `indent` parameter has a
default, `''`, so the first call needs only the list. Each call passes its own indent plus two
spaces to the parts inside it, so the deeper an entry is, the further in it sits. Nobody had
to say how deep the list goes. Add a section inside `cake` and both functions handle it.

## Forgetting to make it smaller

A recursion has two jobs: a base case, and a step that brings every call closer to it. The
first mistake in the base case section left out the base case. The other common mistake keeps
the base case, and forgets to make the problem smaller.

Here is a list of prices added up recursively. The total of an empty list is 0; the total of
any other list is its first price plus the total of the rest:

```tjs:inline {"view": "code"}
function total(prices: [0.0]) {
  if (prices.length == 0) {
    return 0
  }
  return prices[0] + total(prices.slice(1))
}

preview.append(`The bill comes to ${total([2.5, 4, 1.25])}.`)

test 'adding up a list, one price at a time' {
  expect(total([2.5, 4, 1.25])).toBe(7.75)
  expect(total([9])).toBe(9)
  expect(total([])).toBe(0)
}
```

`prices.slice(1)` is the list without its first item: `slice` from Lists, from position 1 to
the end. So each call hands on a list one shorter than its own, and after as many calls as
there are prices, the list is empty and the base case answers.

Now make the mistake. Change `slice(1)` to `slice(0)`. It looks almost the same, and it is
an easy slip, but `slice(0)` copies the **whole** list. Each call hands on a list exactly as
long as its own, so the problem never shrinks, and the base case is never reached. Run it:
the example stops with Maximum call stack size exceeded.

Change it back, and try a quieter mistake. Change the base case to stop at one price instead
of none:

<!-- tjs-doc: fragment -->
```tjs:static
  if (prices.length == 1) {
    return prices[0]
  }
```

Run it. The page still says the bill comes to 7.75, because a list of three prices shrinks to
one and stops. But the test goes red, on `total([])`: an empty list is not one price long, so
it is handed on, still empty, forever. Only the test noticed. The page used a list of three,
and nothing on it was wrong.

That is why the tests for a recursive function should always try the smallest cases: the
empty list, 0, the tree of depth 0. Those are where the base case lives, and a mistake there
does not show up in a big example that happens to step past it. Put the base case back to
`prices.length == 0`, and every test passes.

## Loop or recursion?

Anything a recursion does, a loop can do too, and the other way round, but one of them is
usually much easier to read.

Use a loop when you are going through things one after another: the numbers from 1 to 100, or
the items in a flat list. The loop says so directly, and it has no limit on how many rounds it
runs. A recursive `total` of a list with a hundred thousand prices would run out of call stack;
the loop in Lists would not notice.

Use recursion when the thing you are working on is made of smaller things of the same kind: a
tree of branches, lists inside lists, sections inside sections. Then the recursive function is
a description of the shape, and it works however deep the shape goes.

Either way, ask the two questions before you run it: what is the base case, and does every
call get closer to it?

## Try it

1. Write `power(base: 2.0, exponent: +0)` recursively: any number to the power of 0 is 1, and
   `base` to the power of `exponent` is `base` times `base` to the power of one less. Test that
   `power(2, 10)` is 1024 and `power(5, 0)` is 1. Then use it, or your recursive `factorial`, to
   add a key to the calculator from the last chapter.
2. Write `reverse(text: '')`, which gives back a string backwards: `reverse('stressed')` is
   `'desserts'`. Strings have a `slice` too: `'hello'.slice(1)` is `'ello'`, and `'hello'[0]` is
   `'h'`. Hint: the reverse of a word is the reverse of everything after its first letter, then
   its first letter. What is the base case? Test the empty string as well as a word.
3. Write `countdown(n: +0)`, which gives back `'3 2 1 lift off!'` for 3, without a loop.
   Then change the step from `n - 1` to `n - 2`, and test `countdown(3)`. What happens, and why?
   Which test would you write to catch it?
4. Write `deepest(list: [])`, which says how many lists deep the deepest item is:
   `deepest(['a'])` is 1, and `deepest(['a', ['b', ['c']]])` is 3. (`Math.max(a, b)` is the
   bigger of two numbers.)
5. Change the tree. Give it three branches at each tip instead of two (what happens to the
   number of lines?), or make the left and right branches lean by different amounts. Add a test
   that counts the lines.
6. Draw a Koch snowflake edge. At depth 0, it is one straight line. At any other depth, it is
   four edges, each a third as long, one level less deep, drawn one after another: the first
   at the same angle, the second turned by `-Math.PI / 3` (a sixth of a turn), the third by
   `Math.PI / 3` from the original angle, and the fourth at the original angle again. Each one
   starts where the one before ended. Start from `tree`: it already works out where a line
   ends. Three edges, turned a third of a turn each, make the whole snowflake.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
