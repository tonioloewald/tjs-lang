<!--{"parent": "learn-to-program.md", "order": 3}-->

# Functions

So far every program has run from top to bottom, once. A **function** is a piece of program
with a name, which you can run whenever you like, as often as you like, with different
values each time. Functions are how programs avoid saying the same thing twice.

## Making your own

Here is a function called `double`. It takes a number and gives back twice that number:

```tjs:inline {"view": "code"}
function double(n: 0) {
  return n * 2
}

preview.append(`Double 21 is ${double(21)}.`)

test 'double doubles' {
  expect(double(21)).toBe(42)
  expect(double(0)).toBe(0)
}
```

Read it a line at a time:

- `function double(…)` gives the function its name.
- `n` is a **parameter**: a name for the value the function is given. Each time the function
  runs, `n` is whatever value it was handed.
- `return n * 2` gives the answer back to whoever asked.
- `double(21)` **calls** the function: it runs it with `n` set to 21, and the call becomes
  the answer, 42.

## What `: 0` means

The `: 0` after `n` says what kind of value `n` should be, by giving an **example** of one:
`0` is a whole number, so `double` expects a whole number. The example is not a default and
not a special value; any whole number will do.

Because TJS knows what `double` expects, it checks every call. Try these at the console's
prompt:

```tjs:inline {"view": "console"}
function double(n: 0) {
  return n * 2
}

console.log('Try double(5), then double(2.5), then double("ten").')
```

`double(5)` is 10. `double(2.5)` and `double("ten")` do not run the function at all: the
answer is an **error** saying what was expected and what arrived, instead of a nonsense
result that would cause trouble later. If you want a function that takes any number,
fractions included, give it the example `0.0` instead.

## Several parameters

A function can take more than one value. Separate the parameters with commas, and give the
values in the same order when you call it:

```tjs:inline {"view": "code"}
function area(width: 0, height: 0) {
  return width * height
}

preview.append(`A 6 by 7 rectangle has an area of ${area(6, 7)}.`)

test 'area multiplies' {
  expect(area(6, 7)).toBe(42)
  expect(area(1, 1)).toBe(1)
}
```

## Words in, words out

Parameters can be any kind of value. This one takes a name (`'Ada'` is the example, so the
parameter is a string) and gives back a sentence:

```tjs:inline {"view": "code"}
function greet(name: 'Ada') {
  return `Hello, ${name}!`
}

preview.append(greet('Grace'))

test 'greet puts the name in the middle' {
  expect(greet('Grace')).toBe('Hello, Grace!')
}
```

## The example is also a test

You can give an example for the **answer** too, after the parentheses:

```tjs:inline {"view": "code"}
function greet(name: 'Ada'): 'Hello, Ada!' {
  return `Hello, ${name}!`
}

preview.append(greet('Katherine'))

test 'the example answer is right' {
  expect(greet('Ada')).toBe('Hello, Ada!')
}
```

The first line now reads: "given `'Ada'`, `greet` returns `'Hello, Ada!'`". That documents
the function, and it is a test as well: when TJS builds a program, it runs every function on
its examples and refuses to build if an answer is wrong. Write `'Hi, Ada!'` there, and
building it says that `greet('Ada')` actually returned `'Hello, Ada!'`.

The examples on this page don't run that check while you edit them yet, which is why this
one also has a `test` that says the same thing. Change `'Hello, Ada!'` in the test, and
watch it fail.

## Values that can be left out

Write `=` instead of `:` to give a parameter a **default**: the value it gets when the caller
leaves it out.

```tjs:inline {"view": "code"}
function greet(name = 'friend') {
  return `Hello, ${name}!`
}

preview.append(greet(), ' ', greet('Ada'))

test 'a default fills the gap' {
  expect(greet()).toBe('Hello, friend!')
  expect(greet('Ada')).toBe('Hello, Ada!')
}
```

`:` means "you must give me one of these"; `=` means "you may, and here is what I use if you
don't". The default is an example too, so `greet` still only takes strings.

## Try it

Write a function `minutes(hours: 0)` that gives back how many minutes are in that many hours.
Show a sentence using it, and add a test that checks `minutes(2)` is `120`. Then give it a
second parameter, `extraMinutes = 0`, so that `minutes(1, 30)` is `90`, and test that too.
