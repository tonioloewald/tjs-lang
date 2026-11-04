<!--{"parent": "learn-to-program.md", "order": 4}-->

# Checking Your Work

Every example so far has ended with a test, and you have watched them turn green and red. Now
that you can write functions, you can write tests of your own. They are how you find out that
a program does what you meant, and keep finding out every time you change it.

<!-- TODO review -->
Why not just look at the answer? Because looking does not last. You run `tip(40)`, see 6, and
are satisfied. A week later you change `tip` to round to the nearest penny, and you look at
`tip(40)` again, but not at the five other calls you checked last week, and not at the one
that now comes out a penny wrong. A test is a look you only have to take once: written down,
it is taken again, automatically, every time the program runs.

## A test is a small program about another program

```tjs:inline {"view": "code"}
function double(n: 0) {
  return n * 2
}

test 'double doubles' {
  expect(double(21)).toBe(42)
}
```

- `test 'double doubles' { … }` names a test and holds its checks. The name says what should
  be true, so a failure reads like a sentence: "double doubles" failed.
- `expect(double(21))` runs the code you are checking.
- `.toBe(42)` says what the answer should be.

A test does not change what the program does. It runs beside it, and reports.

## Several checks in one test

A test can check several things. All of them must pass for the test to pass:

```tjs:inline {"view": "code"}
function initials(first: 'Ada', last: 'Lovelace') {
  return first[0] + last[0]
}

preview.append(initials('Grace', 'Hopper'))

test 'initials take the first letter of each name' {
  expect(initials('Ada', 'Lovelace')).toBe('AL')
  expect(initials('Grace', 'Hopper')).toBe('GH')
  expect(initials('Alan', 'Turing').length).toBe(2)
}
```

`first[0]` is the first letter. The letters of a string are numbered from 0, not 1, so
`first[1]` is the second letter. (Lists, later in this book, are numbered the same way.)
`.length` is how many letters a string has.

## The checks you will use most

- `toBe(value)` for one number, string or true/false: `expect(2 + 2).toBe(4)`.
- `toEqual(value)` for something with parts, such as the lists and objects you will meet
  later, compared by what is inside them. (`toBe` would ask whether they are the very same
  thing, and two lists built separately are not.)
- `toContain(part)` for a string or list that should include something.
- `toBeGreaterThan(n)` and `toBeLessThan(n)` when only a range matters.

<!-- TODO review -->
```tjs:inline {"view": "code"}
const greeting = 'Hello, world!'
const roll = 4

test 'a few kinds of check' {
  expect(greeting).toContain('world')
  expect(greeting.startsWith('Hello')).toBe(true)
  expect(roll).toBeGreaterThan(0)
  expect(roll).toBeLessThan(7)
}
```

<!-- TODO review -->
`greeting.startsWith('Hello')` is a question you can ask a string; its answer is `true` or
`false`, and `toBe(true)` checks it. Any question with a yes-or-no answer can be tested this
way.

<!-- TODO review -->
## A signature example is a test

You met this in Functions, and it deserves a closer look, because it is the cheapest test you
will ever write. Put an example of the **answer** after the parentheses:

```tjs:inline {"view": "code"}
function fahrenheit(celsius: 100.0): 212.0 {
  return celsius * 9 / 5 + 32
}

preview.append(`Water boils at ${fahrenheit(100)}°F.`)
```

The first line says: "`fahrenheit(100)` is 212". (The examples are written `100.0` and
`212.0`, not `100` and `212`, so that temperatures with fractions, like 36.6, are allowed: an
example with a decimal point means "any number", as you saw in Functions.) TJS reads that line
as a test. It takes the examples on the parameters (`100`), calls the function with them, and
compares the answer with the example after the parentheses (`212`). It does this when the program is built,
before your own code runs, and it counts the result on the test line under the example, like
any `test` block.

Try it. Change `9 / 5` to `5 / 9`, the classic slip in this formula. The result line turns
red: `fahrenheit(100)` should have been 212, and was something else. You did not write a
`test` block, and the mistake was still caught.

<!-- TODO review -->
Three things are worth knowing about signature examples:

1. **The answer must be exactly right.** `212` means 212, not "some number". A function
   `add(a: 2, b: 3): 0` fails, because `add(2, 3)` is 5, not 0. The answer example is a
   worked example, not a description of the kind of answer.
2. **They are checked once, with the examples you chose.** One example cannot try the edges.
   That is what `test` blocks are for.
3. **They are documentation that cannot go stale.** Anyone reading the first line of
   `fahrenheit` learns what it does from an example. If someone changes the function so the
   example is no longer true, the example says so the next time the program runs.

So: give every function whose answer you can predict a good signature example (one where a
wrong function would give a different answer), and add `test` blocks for everything else.

## Test the edges

Most mistakes happen at the edges: zero, one, the empty list, the exact boundary. A good set of
tests always tries them.

```tjs:inline {"view": "code"}
function canVote(age: 0) {
  return age >= 18
}

test 'the edges of voting age' {
  expect(canVote(17)).toBe(false)
  expect(canVote(18)).toBe(true)
  expect(canVote(19)).toBe(true)
  expect(canVote(0)).toBe(false)
}
```

Change `>=` to `>` in `canVote`. Only one check fails, the one at exactly 18, and it is the one
that matters.

<!-- TODO review -->
## Does your test catch anything?

A test that cannot fail tells you nothing. Here is a test that looks fine:

```tjs:static
function canVote(age: 0) {
  return age >= 18
}

test 'voting' {
  expect(canVote(40)).toBe(true)
  expect(canVote(5)).toBe(false)
}
```

It passes. It also passes if you change `18` to `16`, or to `21`, or `>=` to `>`: every one
of those wrong programs still lets a 40-year-old vote and stops a 5-year-old. The test checks
easy cases that any reasonable version gets right.

The way to find out whether a test is any good is to **break the program on purpose** and see
whether the test notices. If you can make a mistake and the tests stay green, you have found a
test that is missing. Programmers do this so often that there are tools that do it
automatically; you can do it by hand, in the page, right now.

<!-- TODO review -->
## Numbers with fractions are not exact

Here is a surprise that catches every programmer once. Type `0.1 + 0.2` at the console prompt:

```tjs:inline {"view": "console"}
console.log('Type 0.1 + 0.2 at the prompt below.')
```

The answer is `0.30000000000000004`. Computers store fractions in binary, and most decimal
fractions (like 0.1) cannot be written exactly in binary, just as 1/3 cannot be written exactly
in decimals. The error is tiny, but `toBe(0.3)` asks for **exactly** 0.3, and fails.

When an answer may have a fraction in it, test it to the precision you care about. Rounding
to the nearest penny is one way:

```tjs:inline {"view": "code"}
function priceWithTax(price: 0.0) {
  return price * 1.1
}

function toPennies(amount: 0.0) {
  return Math.round(amount * 100) / 100
}

preview.append(`1.10 with tax is ${priceWithTax(1.1)}`)

test 'tax, to the nearest penny' {
  expect(toPennies(priceWithTax(1.1))).toBe(1.21)
  expect(priceWithTax(1.1)).toBeGreaterThan(1.2)
  expect(priceWithTax(1.1)).toBeLessThan(1.22)
}
```

Look at what the page shows: not 1.21, but 1.2100000000000002. The two checks say the same
thing in two ways: rounded to pennies it is 1.21, and it is between 1.2 and 1.22. Whole
numbers have no such problem: `6 * 7` is exactly 42, always.

## Mistakes are values, and you can test for them

When a function is called with the wrong kind of value, TJS does not crash: the call gives
back an **error**. That error is a value like any other, so a test can check for it:

```tjs:inline {"view": "code"}
function double(n: 0) {
  return n * 2
}

test 'the wrong kind of value gives back an error' {
  expect(double('ten') instanceof Error).toBe(true)
  expect(double(5)).toBe(10)
}
```

`instanceof Error` asks "is this an error?". Testing the mistakes your function refuses is as
useful as testing the answers it gives.

## Reading a failure

When a check fails, the result line turns red and names the test and the check: what it
expected and what it got. That second half is the useful part. If the test expected `42` and
got `"2121"`, the function joined two strings instead of adding two numbers. The failure
tells you where to look.

<!-- TODO review -->
Read a failure before you change anything. There are always two possibilities: the program is
wrong, or the test is. A test is a program too, and it can have a typo in it. Ask which of the
two answers, the expected one or the one you got, is actually right. Then fix that side, and
only that side. Changing the test until it agrees with the program is easy, and it turns a test
into a record of whatever the program happens to do.

## Write the test first

Here is a good habit: before writing a function, write the test that says what it should do.
Then write the function until the test passes. The test is your description of the job, and it
tells you when you are finished.

```tjs:inline {"view": "code"}
// First the tests: what should shout do?
test 'shout makes it loud' {
  expect(shout('hello')).toBe('HELLO!')
  expect(shout('')).toBe('!')
}

// Then the function that makes them pass.
function shout(words: 'hello') {
  return words.toUpperCase() + '!'
}
```

<!-- TODO review -->
Writing the test first does three things for you. It makes you decide what the function
should do before you decide how (what should `shout('')` give? You have to choose, and the
test records the choice). It proves the test can fail: before the function exists, it does.
And it tells you when to stop: when the tests pass, the job is done.

## Tests and examples

You have now seen two ways to check a function. An **example** in its signature,
`greet(name: 'Ada'): 'Hello, Ada!'`, checks one call and documents the function at the same
time. A **test** can check as many calls as you like, the edges, the errors and the results
that are too long to put in a signature. Use the example for the typical case, and tests for
the rest.

## Try it

<!-- TODO review -->
Write the tests first, then the function: `average(a: 0.0, b: 0.0, c: 0.0)` gives back the
average of three numbers (add them up, divide by 3). Test `average(1, 2, 3)`, three numbers
that are all the same, and some negative numbers. Then try `average(1, 2, 2)`: the answer is
5/3, which has no exact decimal. Decide how to test it, using what you learned about
fractions.

<!-- TODO review -->
More to try:

- Give `average` a signature example: `average(a: 1.0, b: 2.0, c: 3.0): 2.0`. Then break the
  function by dividing by 2 instead of 3, and see which checks notice: the example, the tests,
  or both.
- Take `canVote` and its tests from "Test the edges". Make three different mistakes in the
  function, one at a time. Did the tests catch every one? If one got through, write the check
  that would have caught it.
- Write `isTeenager(age: 0)`, true from 13 to 19. Write the tests first, and test both edges
  from both sides: 12, 13, 19 and 20. (You will need `&&` from Decisions; for now, two
  comparisons joined by `&&` both have to be true.)
