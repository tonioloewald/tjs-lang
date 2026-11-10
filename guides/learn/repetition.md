<!--{"parent": "learn-to-program.md", "order": 6}-->

# Repetition

Computers are good at doing the same thing many times without getting bored or making a
mistake on the four-hundredth try. A **loop** runs a block of code again and again. This
chapter counts, adds up, builds tables and draws rows of boxes, each with a few lines of loop.

<!-- TODO review -->

Here is the problem. To put the numbers 1 to 5 on the page, you could write five lines:
`preview.append('1 ')`, `preview.append('2 ')`, and so on. To put 1 to 1,000 on the page you
would need a thousand lines, and if you then wanted them separated by commas instead of spaces,
you would change a thousand lines. A loop says it once: "for each number from 1 to 1,000, do
this". Change the 1,000, or the "this", in one place.

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

<!-- TODO review -->

`i` is just a name, like any other; programmers use `i` for a counter out of long habit. It is
a `let`, not a `const`, because it changes every round. Try changing `let` to `const` in the
loop: the first round runs, then the loop stops with an error, because `i++` tries to change a
constant.

<!-- TODO review -->

## Counting other ways

Each of the three parts can be anything that makes sense. Count by twos by adding 2 each round,
or count down by starting high and subtracting:

```tjs:inline {"view": "code"}
let evens = ''
for (let i = 2; i <= 10; i += 2) {
  evens = evens + `${i} `
}

let countdown = ''
for (let i = 5; i >= 1; i--) {
  countdown = countdown + `${i}... `
}
countdown = countdown + 'lift off!'

preview.append(evens, ' / ', countdown)

test 'counting by twos, and counting down' {
  expect(evens).toBe('2 4 6 8 10 ')
  expect(countdown).toBe('5... 4... 3... 2... 1... lift off!')
}
```

`i--` is the opposite of `i++`: it takes one away. Each loop builds a string a piece at a time,
in a `let` that starts empty (`''`) and grows each round.

## Off by one

The most common loop mistake has a name: **off by one**. The loop runs one time too many or
one time too few, because the condition is `<` where it should be `<=`, or the counter starts
at 0 where it should start at 1. In the countdown above, change `i >= 1` to `i > 1`. The test
fails, and its message shows the string it got: the `1...` is missing. One character, one
round.

You cannot always see an off-by-one mistake by looking at the output; with a thousand numbers,
who notices that the last one is missing? That is why a loop's tests should check its first
and last rounds, not only that it produced something.

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

<!-- TODO review -->

Why must `total` be made **outside** the loop? Move the line `let total = 0` inside the loop,
as its first line, and the example stops with an error: `total` is not defined where the
function returns it. A name made inside a block belongs to that block, and is gone when the
block ends. Worse, if it did survive, it would be reset to 0 every round. The running total has
to live outside the loop so that it lasts from one round to the next.

And try `sumTo(2.5)`: the example `0` says `n` is a whole number, so TJS refuses the call and
gives back an error instead of adding up to two and a half.

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

<!-- TODO review -->

## Loops inside loops

A loop's block can contain another loop. The inner loop then runs all the way through, every
round of the outer one. That is how a program makes anything with rows and columns:

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { pre } = elements

function grid(rows: 0, columns: 0) {
  let text = ''
  for (let row = 1; row <= rows; row++) {
    for (let column = 1; column <= columns; column++) {
      text = text + '* '
    }
    text = text + '\n'
  }
  return text
}

preview.append(pre(grid(3, 5)))

test 'three rows of five' {
  expect(grid(3, 5)).toBe('* * * * * \n* * * * * \n* * * * * \n')
  expect(grid(0, 5)).toBe('')
}
```

The inner loop puts five stars on a line; the outer loop runs it three times and ends each line.
That is 15 stars from a few lines of code. Try `grid(10, 20)`. Then the challenge: change the
inner loop's condition to `column <= row`, so each row is as long as its number, and see what
shape you get.

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

<!-- TODO review -->

## Stopping early with `break`

Sometimes a loop finds what it is looking for before the end. `break` leaves the loop at once,
and the program carries on after it:

```tjs:inline {"view": "code"}
function firstSquareOver(limit: 0) {
  let answer = 0
  for (let i = 1; i <= limit; i++) {
    if (i * i > limit) {
      answer = i
      break
    }
  }
  return answer
}

preview.append(`The first number whose square is over 1000 is ${firstSquareOver(1000)}.`)

test 'stop as soon as it is found' {
  expect(firstSquareOver(1000)).toBe(32)
  expect(firstSquareOver(10)).toBe(4)
}
```

Without `break`, the loop would carry on to 1,000 and keep overwriting `answer`; with it, the
loop stops at 32, the first number that works. (32 × 32 is 1,024, and 31 × 31 is 961.)

When to use which loop? Use `for` when you know how many rounds: count from here to there. Use
`while` when you know when to **stop**, but not how long it will take. Use `break` when you are
searching, and can stop as soon as you have found it.

## Try it

Write `countMultiples(n: 0, of: 0)` that counts how many numbers from 1 to `n` divide evenly
by `of` (remember `%` from Decisions). Test that `countMultiples(10, 3)` is 3 (3, 6 and 9).
Then show the classic: for 1 to 15, show `'fizz'` for multiples of 3, `'buzz'` for multiples
of 5, `'fizzbuzz'` for both, and the number otherwise.

<!-- TODO review -->

Then:

1. Write `factorial(n: 0)`, which multiplies 1 × 2 × 3 × … × `n`. Test that `factorial(5)` is
   120. What should `factorial(0)` be? (Mathematicians say 1. Does your loop agree?)
2. Using two loops, make `triangle(rows: 0)` that builds a triangle of stars, one on the first
   line, two on the second, and so on. Show it in a `pre`, and test `triangle(3)`.
3. Write `doublings(target: 0)` with `while`: how many times must you double 1 before it
   reaches `target` or more? Test it with 1, 2 and 1,000.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, and press ⌘S (Ctrl+S on Windows and Linux) to run it.
```
