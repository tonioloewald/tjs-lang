<!--{"parent": "learn-to-program.md", "order": 6}-->
<!-- TODO review -->

# Repetition

Computers are good at doing the same thing many times without getting bored or making a
mistake on the four-hundredth try. A **loop** runs a block of code again and again. This
chapter counts, adds up, builds tables and draws rows of boxes, each with a few lines of loop.

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
2. `i <= 5` is checked before each round, including the first: if it is true, the block runs;
   if it is false, the loop ends.
3. `i++` runs after each round: it adds one to `i`. (`i++` is short for `i = i + 1`.)

So the block runs with `i` set to 1, 2, 3, 4 and 5. After the fifth round `i++` makes `i` 6,
`i <= 5` is false, and the loop stops. Change the 5 to 20, or start `i` at 10.

The **block** is the code between `{` and `}`, as it was for `if` in Decisions: here it is the
one line that puts `i` on the page.

`i` is a name like any other; programmers use `i` for a counter out of long habit. It is a
`let`, not a `const`, because it changes every round. Try changing `let` to `const` in the
loop: the first round runs and shows `1`, then the loop stops with an error the first time
`i++` tries to change a constant.

## Counting other ways

The three parts do not have to count by one from 1. The start can set the counter to any
value, the check can be any true-or-false question, and the step can change the counter however
you like. Count by twos by adding 2 each round,
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

`i += 2` adds 2 to `i`, the shorthand you met in Values and Names. `i--` is the opposite of
`i++`: it takes one away. Each loop builds a string a piece at a time, in a `let` that starts
empty (`''`) and grows each round. `evens = evens + …` could also be written `evens += …`; the
two mean the same, and this chapter uses both.

## Off by one

The most common loop mistake has a name: **off by one**. The loop runs one time too many or
one time too few, because the condition is `<` where it should be `<=`, or the counter starts
at 0 where it should start at 1. In the countdown above, change `i >= 1` to `i > 1`. The test
fails (tests work as they did in Checking Your Work: each `expect(…).toBe(…)` is one check, and
a failure is reported beside the example), and its message shows the string it got: the `1...`
is missing. One character, one
round.

The two usual ways of counting five rounds look different, and mixing them up is how the
mistake happens:

```tjs:inline {"view": "code"}
let fromZero = 0
for (let i = 0; i < 5; i++) {
  fromZero += 1
}

let fromZeroAtMost = 0
for (let i = 0; i <= 5; i++) {
  fromZeroAtMost += 1
}

preview.append(
  `Starting at 0 and going while i < 5: ${fromZero} rounds. `,
  `Starting at 0 and going while i <= 5: ${fromZeroAtMost} rounds.`
)

test 'counting the rounds' {
  expect(fromZero).toBe(5)
  expect(fromZeroAtMost).toBe(6)
}
```

Start at 1 and use `<=`, or start at 0 and use `<`: both run five times. Start at 0 and use
`<=`, and you get six, because 0, 1, 2, 3, 4 and 5 are six numbers. Counting from 0 looks
odd now, but lists number their items from 0, so you will see the second form again in Lists.

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

Why must `total` be made **outside** the loop? Move the line `let total = 0` inside the loop,
as its first line, and the example stops with an error: `total` is not defined where the
function returns it. A name made inside a block belongs to that block, and is gone when the
block ends. Worse, if it did survive, it would be reset to 0 every round. The running total has
to live outside the loop so that it lasts from one round to the next.

Now change `sumTo(100)` in the `preview.append` line to `sumTo(2.5)`. The example `0` says `n`
is a whole number, so TJS refuses the call and gives back an error instead of adding up to two
and a half: the preview shows a `MonadicError` saying it expected an integer.

## Building a table

The block of a loop can do anything a program can do, including building text. Here a loop
builds a times table, one line per round. The first two lines are the import from Hello,
Screen: they fetch `pre` from tosijs, the way that chapter fetched `h1` and `p`.

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

`\n` inside a string means "start a new line", and `pre` shows text with its line breaks kept;
an ordinary paragraph would run all ten lines together. The test asks two questions of the
string, written with a dot as in Checking Your Work: `startsWith` checks how it begins, and
`includes` checks that the last line is in it somewhere.

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
shape you get. (Keep the answer in mind: Try it at the end asks for that shape the other way
up.)

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

A `div` is a plain box. The part in curly braces gives it settings, each a name, a colon and
a value: here its `style`, which says how big it is, how much space to leave around it, and
what colour to fill it. (Things with Parts explains the curly braces properly.)
`display: 'inline-block'` lets the boxes sit side by side, like words in a line; without it
each box would start a new line. `px` means pixels, the dots on your screen. Each round makes
one box, `i * 10` pixels across, so the first is 10 and the sixth is 60.

Try changing `teal` to `orange`, `6` to `12`, or `i * 10` to `i * i`.

## Shapes from a rule

The boxes above are all the same shape. A loop can do something bigger: follow one rule and
produce a different shape every time you change a number. Here one function draws any
regular polygon, the shape with equal sides that a stop sign (8 sides) or a honeycomb cell
(6) is:

```tjs:inline {"view": "code"}
import { svgElements } from 'tosijs'

const { svg, polygon } = svgElements

// The corners of a regular polygon, as the "x,y x,y …" text a polygon is drawn from.
function corners(sides: 3, radius: 40.0, cx: 50.0, cy: 50.0) {
  let points = ''
  for (let i = 0; i < sides; i++) {
    const turn = (i / sides) * 2 * Math.PI
    const x = cx + radius * Math.cos(turn)
    const y = cy + radius * Math.sin(turn)
    points = points + x.toFixed(1) + ',' + y.toFixed(1) + ' '
  }
  return points
}

for (let sides = 3; sides <= 8; sides++) {
  preview.append(
    svg(
      { viewBox: '0 0 100 100', width: 70, height: 70 },
      polygon({ points: corners(sides, 40, 50, 50), fill: 'teal' })
    )
  )
}

test 'a square has its four corners' {
  expect(corners(4, 40, 50, 50)).toBe('90.0,50.0 50.0,90.0 10.0,50.0 50.0,10.0 ')
}
```

Each corner is the same step further round a circle. A full turn is `2 * Math.PI` (π is
about 3.14), so corner `i` is `i / sides` of the way round. `Math.cos` and `Math.sin` turn
"how far round" into how far across (`x`) and how far down (`y`); you do not need to know
how they work to use them, only what they give you. `toFixed(1)` keeps one decimal place.
`svg` is a drawing area, `viewBox: '0 0 100 100'` says it is 100 units each way, and a
`polygon` joins its points with straight lines and fills the shape inside.

The leverage is the point. The loop does not care how many sides there are: change the `8`
to `40` and the last shape is nearly a circle. Writing those 40 corners out by hand would
take a page; the rule takes three lines.

## A honeycomb

Put `corners` inside loops inside loops, and a few lines of code tile a whole surface:

```tjs:inline {"view": "code"}
import { svgElements } from 'tosijs'

const { svg, polygon } = svgElements

function corners(sides: 6, radius: 10.0, cx: 0.0, cy: 0.0) {
  let points = ''
  for (let i = 0; i < sides; i++) {
    const turn = (i / sides) * 2 * Math.PI
    points =
      points +
      (cx + radius * Math.cos(turn)).toFixed(1) +
      ',' +
      (cy + radius * Math.sin(turn)).toFixed(1) +
      ' '
  }
  return points
}

const r = 10 // each hexagon's radius
const across = 1.5 * r // how far apart the columns are
const down = Math.sqrt(3) * r // how far apart the rows are

const board = svg({ viewBox: '0 0 130 122', width: 220, height: 206 })
for (let column = 0; column < 8; column++) {
  for (let row = 0; row < 6; row++) {
    const cx = r + column * across
    // every other column sits half a cell lower, so the edges fit together
    const cy = down / 2 + row * down + (column % 2) * (down / 2)
    board.append(
      polygon({ points: corners(6, r, cx, cy), fill: 'teal', stroke: 'white' })
    )
  }
}
preview.append(board)

test 'a hexagon is centred where we ask' {
  expect(corners(6, 10, 20, 20).startsWith('30.0,20.0 ')).toBe(true)
}
```

The outer loop walks across the columns and the inner loop down the rows: 8 × 6 = 48
hexagons. `column % 2` (the remainder from Decisions) is 0 for even columns and 1 for odd
ones, which is what shifts every other column down by half a cell. `Math.sqrt` is the
square root; `down` is how tall one hexagon is.

Now change `8` and `6` to `30` and `20`, and widen the `viewBox` to `'0 0 460 360'`: 600
hexagons, and not one more line of code. That is what loops are for. Not only working
through a list you already have, but making far more than you could ever write out.

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

The example is `0.0`, not `0`, because halving makes fractions (100, 50, 25, 12.5, …), and
`n: 0` would accept whole numbers only. `n = n / 2` gives the parameter a new value: inside the
function, a parameter is a name you can change, like a `let`.

Every `while` needs something inside it that eventually makes its condition false; here,
`n` keeps shrinking. A loop whose condition can never become false runs forever, and the page
stops responding until you reload it. If that happens, nothing is broken: check what your
loop changes each round.

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
`while` when you know when to **stop**, but not how long it will take. Inside either one, use
`break` when you are searching, and can stop as soon as you have found it.

## Try it

Write `countMultiples(n: 0, of: 0)` that counts how many numbers from 1 to `n` divide evenly
by `of` (remember `%` from Decisions). Test that `countMultiples(10, 3)` is 3 (3, 6 and 9).
Then try a famous beginner's puzzle called FizzBuzz. For each number from 1 to 15, add a
word to a string: `fizz` for multiples of 3, `buzz` for multiples of 5, `fizzbuzz` for
multiples of both, and the number itself otherwise, with a space after each. Show the string
with `preview.append`. It should begin `1 2 fizz 4 buzz fizz` and end `fizzbuzz`. Hint: check
for "both" before the others. Why does the order matter?

Then:

1. Write `factorial(n: 0)`, which multiplies 1 × 2 × 3 × … × `n`. Test that `factorial(5)` is
   120. What should `factorial(0)` be? (Mathematicians say 1. Does your loop agree?)
2. Using two loops, make `triangle(rows: 0)` that builds an upside-down triangle of stars:
   `rows` stars on the first line, one fewer on the next, down to one. Start from `grid` and the
   challenge in "Loops inside loops". Show it in a `pre`, and test `triangle(3)`.
3. Write `doublings(target: 0)` with `while`: how many times must you double 1 before it
   reaches `target` or more? `doublings(1)` is 0 and `doublings(2)` is 1; for 1,000, work out
   by hand how many doublings it takes to pass it, then test that too.
4. Draw a five-pointed star. Start from `corners`, but visit the corners of a pentagon two at a
   time: corner `i * 2` instead of corner `i`. Does the same trick give a star for 7 sides?
   For 6? (Try it and see; then think about why.)

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
