<!--{"parent": "learn-to-program.md", "order": 4}-->

# Checking Your Work

Every example so far has ended with a test, and you have watched them turn green and red. Now
that you can write functions, you can write tests of your own. They are how you find out that
a program does what you meant, and keep finding out every time you change it.

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

`first[0]` is the first letter: a string, like a list, counts from 0.

## The checks you will use most

- `toBe(value)` for one number, string or true/false: `expect(2 + 2).toBe(4)`.
- `toEqual(value)` for something with parts, such as a list, compared by what is inside:
  `expect([1, 2].concat([3])).toEqual([1, 2, 3])`. (`toBe` would ask whether they are the very
  same list, and two lists built separately are not.)
- `toContain(part)` for a string or list that should include something.
- `toBeGreaterThan(n)` and `toBeLessThan(n)` when only a range matters.

```tjs:inline {"view": "code"}
const greeting = 'Hello, world!'
const roll = 4

test 'a few kinds of check' {
  expect(greeting).toContain('world')
  expect([3, 1, 2].includes(2)).toBe(true)
  expect(roll).toBeGreaterThan(0)
  expect(roll).toBeLessThan(7)
}
```

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

## Tests and examples

You have now seen two ways to check a function. An **example** in its signature,
`greet(name: 'Ada'): 'Hello, Ada!'`, checks one call and documents the function at the same
time. A **test** can check as many calls as you like, the edges, the errors and the results
that are too long to put in a signature. Use the example for the typical case, and tests for
the rest.

## Try it

Write the tests first, then the function: `average(numbers: [0.0])` gives back the average of
a list. Test a few lists, a list of one number, and decide what the average of an empty list
should be, then test that too. (There is no right answer, only an answer you chose and wrote
down.)
