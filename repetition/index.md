<!--{"parent": "learn-to-program.md", "order": 6}-->

# Repetition

Computers are good at doing the same thing many times without getting bored or making a
mistake on the four-hundredth try. A **loop** runs a block of code again and again. This
chapter counts, adds up, builds tables and draws rows of boxes, each with a few lines of loop.

## Counting with `for`

```tjs:inline {"view": "code"}
for (let i = 1; i <= 5; i++) {
  preview.append(`${i} `)
}
```

A `for` loop has three parts in its parentheses, separated by semicolons:

1. `let i = 1` runs once, before anything else: it makes a counter called `i`.
2. `i <= 5` is checked before each round: while it is true, the block runs again.
3. `i++` runs after each round: it adds one to `i`. (`i++` is short for `i = i + 1`.)

So the block runs with `i` set to 1, 2, 3, 4 and 5, and then `i <= 5` is false and the loop
stops. Change the 5 to 20, or start `i` at 10.

## Adding things up

A loop that builds an answer usually keeps a running total in a `let` outside it:

```tjs:inline {"view": "code"}
function sumTo(n: 0) {
  let total = 0
  for (let i = 1; i <= n; i++) {
    total = total + i
  }
  return total
}

preview.append(`1 + 2 + ... + 100 = ${sumTo(100)}`)

test 'adding up' {
  expect(sumTo(4)).toBe(10)
  expect(sumTo(100)).toBe(5050)
  expect(sumTo(0)).toBe(0)
}
```

`sumTo(0)` is 0 because the loop never runs at all: `1 <= 0` is false from the start. A loop
that may run zero times is normal, and worth a test.

## Building a table

The block of a loop can do anything a program can do, including building text. Here a loop
builds a times table, one line per round:

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { pre } = elements

function timesTable(n: 0) {
  let lines = ''
  for (let i = 1; i <= 10; i++) {
    lines = lines + `${i} x ${n} = ${i * n}\n`
  }
  return lines
}

preview.append(pre(timesTable(7)))

test 'the seven times table' {
  expect(timesTable(7).startsWith('1 x 7 = 7\n')).toBe(true)
  expect(timesTable(7).includes('10 x 7 = 70')).toBe(true)
}
```

`\n` inside a string means "start a new line", and `pre` shows text with its line breaks kept.

## Drawing many things

Loops are how a program draws a row of anything. This one makes boxes that grow:

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { div } = elements

for (let i = 1; i <= 6; i++) {
  preview.append(
    div({
      style: {
        display: 'inline-block',
        width: `${i * 10}px`,
        height: `${i * 10}px`,
        margin: '4px',
        background: 'teal',
      },
    })
  )
}
```

Try changing `teal` to `orange`, `6` to `12`, or `i * 10` to `i * i`.

## `while`: until something changes

`for` is for counting. When you do not know how many rounds it will take, `while` repeats as
long as its condition is true:

```tjs:inline {"view": "code"}
function halvings(n: 0.0) {
  let steps = 0
  while (n > 1) {
    n = n / 2
    steps = steps + 1
  }
  return steps
}

preview.append(`Halving 100 until it is 1 or less takes ${halvings(100)} steps.`)

test 'halving' {
  expect(halvings(100)).toBe(7)
  expect(halvings(1)).toBe(0)
}
```

Every `while` needs something inside it that eventually makes its condition false; here,
`n` keeps shrinking. A loop whose condition can never become false runs forever, and the page
stops responding until you reload it. If that happens, it is not your computer: check what
your loop changes each round.

## Try it

Write `countMultiples(n: 0, of: 0)` that counts how many numbers from 1 to `n` divide evenly
by `of` (remember `%` from Decisions). Test that `countMultiples(10, 3)` is 3 (3, 6 and 9).
Then show the classic: for 1 to 15, show `'fizz'` for multiples of 3, `'buzz'` for multiples
of 5, `'fizzbuzz'` for both, and the number otherwise.
