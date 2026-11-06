<!--{"parent": "learn-to-program.md", "order": 3}-->
<!-- TODO review -->

# Functions

So far every program has run from top to bottom, once. A **function** is a piece of program
with a name, which you can run whenever you like, as often as you like, with different
values each time. Functions are how programs avoid saying the same thing twice.

## Saying the same thing twice

Here is a program that works out a 15% tip on three restaurant bills:

```tjs:inline {"view": "code"}
const lunch = 40
const dinner = 60
const breakfast = 20

const lunchTip = lunch * 0.15
const dinnerTip = dinner * 0.15
const breakfastTip = breakfast * 0.51

preview.append(`Tips: ${lunchTip}, ${dinnerTip}, ${breakfastTip}`)
```

Look at the last tip. The rule "multiply by 0.15" is written out three times, and the third
copy has its digits swapped, so breakfast costs a 51% tip: the page shows `10.2` for a bill
of 20, where 15% would be `3`. Nothing complains: `0.51` is a perfectly good number. The
program quietly gives a wrong answer, and you only notice if you check the arithmetic.

The cure is to write the rule **once**, give it a name, and use the name every time. That is
a function. Fix a mistake in a function and it is fixed everywhere the function is used.

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

Writing the function does not run it. The lines inside the braces wait until something calls
`double`; then they run, once per call. Change `double(21)` to `double(100)` and the sentence
changes, because the call is worked out again.

Now the tips, with the rule written once:

```tjs:inline {"view": "code"}
function tip(bill: 0.0) {
  return bill * 0.15
}

preview.append(`Tips: ${tip(40)}, ${tip(60)}, ${tip(20)}`)

test 'a tip is 15% of the bill' {
  expect(tip(40)).toBe(6)
  expect(tip(20)).toBe(3)
}
```

If the restaurant decides tips should be 20%, there is one place to change, and the test tells
you which answers moved. Try it.

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

console.log("Try double(5), then double('5'), then double(2.5).")
```

`double(5)` is 10. `double('5')` and `double(2.5)` do not run the function at all: the
answer is an **error** saying what was expected and what arrived, instead of a nonsense
result that would cause trouble later.

`'5'` in quotes is text that happens to look like a number, the way a number typed into a
form arrives. Plain JavaScript would quietly turn it into a number and answer 10, which is
right this time and badly wrong the time the text is `'5 apples'`.

**Unlike JavaScript, TJS is fussy about numbers.** In fact it is fussier than TypeScript, which
has one kind of number for everything. When you give a whole number as the example, you are
saying you want a **whole** number, so `2.5` is refused too.

To take any number, fractions included (programmers call these **floats**), give a number
with a decimal point as the example. Change `double(n: 0)` to `double(n: 0.0)` in the example
above, run it, and try `double(2.5)` again: now it is 5. `double('5')` is still refused,
because text is not a number of any kind.

You can be fussier, too. Change it to `double(n: +0)`, run it, and try `double(-3)`: the `+`
says zero or more, so a negative number is refused.

The examples you will use most are these:

| You write | It means | It accepts |
| --- | --- | --- |
| `n: 0` | a whole number | `5`, `-3`, `0` |
| `n: 0.0` | any number | `5`, `2.5`, `-0.1` |
| `n: +0` | a whole number, zero or more | `0`, `5`, but not `-3` |
| `name: ''` | a string (any text) | `'Ada'`, `''` |
| `ok: true` | a boolean | `true`, `false` |

The example only says what **kind** of value: `name: 'Ada'` accepts `'Grace'` just as happily
as `name: ''` does. Pick an example a reader would recognise, because the example is also
documentation. (`tip` above uses `0.0`, because a bill can have pennies in it.)

### Leaving a value out

Calling `double()` with nothing in the parentheses is a mistake too, and TJS says so. Type
`double()` at the console above: the error says it expected an integer and got `undefined`,
which is JavaScript's word for "nothing was here". A parameter written with `:` must be given.

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

### Order matters

The values are matched to the parameters by position: the first value goes to the first
parameter, and so on. For `area` a mix-up does no harm, since 6 × 7 is 7 × 6. For most
functions it does:

```tjs:inline {"view": "code"}
function repeatWord(word: 'ha', times: 3) {
  return word.repeat(times)
}

preview.append(repeatWord('ha', 3))

test 'the word comes first, then how many times' {
  expect(repeatWord('ha', 3)).toBe('hahaha')
  expect(repeatWord(3, 'ha') instanceof Error).toBe(true)
}
```

(`word.repeat(times)` is one of the things a string can do for itself: it gives back the
string written out `times` times.)

Change the call to `repeatWord(3, 'ha')`. Instead of a word, the page shows an error:
`Expected string for '…repeatWord.word', got number`. It names the function and the
parameter (`repeatWord.word`), says what that parameter expected, and says what arrived. The examples on the parameters are
what let TJS spot the swap: it knows `word` should look like `'ha'`, and `3` does not.

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

## Functions that use functions

A function can call other functions, so small ones combine into bigger ones. Each small one
does one job, and has its own test:

```tjs:inline {"view": "code"}
function cost(price: 2.5, quantity: 1) {
  return price * quantity
}

function withTax(amount: 10.0) {
  return amount * 1.2
}

function bill(price: 2.5, quantity: 1) {
  return withTax(cost(price, quantity))
}

preview.append(`Four coffees at 2.5 each come to ${bill(2.5, 4)} with tax.`)

test 'each piece does its own job' {
  expect(cost(2.5, 4)).toBe(10)
  expect(withTax(10)).toBe(12)
  expect(bill(2.5, 4)).toBe(12)
}
```

`withTax(cost(price, quantity))` is worked out from the inside: `cost` runs first, and its
answer is handed straight to `withTax`. When `bill` gives a wrong answer, the tests on the
small functions tell you which piece to look at.

### Names inside a function stay inside

The parameters of a function, and any `const` or `let` made inside it, belong to that
function. They exist while it runs, and the rest of the program cannot see them:

```tjs:inline {"view": "console"}
function square(n: 0) {
  const result = n * n
  return result
}

console.log('square(4) is', square(4))
console.log('Now ask the prompt for result, or for n.')
```

The console says `result` is not defined: outside `square` there is no such name. That is a
good thing. Two functions can each have their own `result` without treading on each other,
and you can read a function without wondering what the rest of the program does to its names.
To get a value out of a function, `return` it.

## The example is also a test

You can give an example for the **answer** too, after the parentheses:

```tjs:inline {"view": "code"}
function greet(name: 'Ada'): 'Hello, Ada!' {
  return `Hello, ${name}!`
}

preview.append(greet('Katherine'))

test 'greet works for other names too' {
  expect(greet('Grace')).toBe('Hello, Grace!')
}
```

The first line now reads: "given `'Ada'`, `greet` returns `'Hello, Ada!'`". That documents
the function, and it is a test as well: TJS runs `greet('Ada')` and checks the answer. The
result line counts it beside the `test` below. Change `'Hello, Ada!'` to `'Hi, Ada!'` and the
line turns red, saying `greet('Ada')` actually returned `'Hello, Ada!'`.

This is unusual. In most languages the first line of a function says only what kinds of
value go in and come out, and whether the function does the right thing is a separate
question, answered (if at all) somewhere else. In TJS the first line is a small worked
example, like the one at the top of a page of exercises: "for instance, 21 doubled is 42".
TJS runs that example as soon as the program is built, every time, before anything else
happens.

### The mistake it catches

The most common mistake with a new function is forgetting `return`. Without it the function
works out the answer, then throws it away and gives back `undefined`:

<!-- tjs-doc: expect-error -->
```tjs:static
function double(n: 21): 42 {
  n * 2 // works out 42, and drops it
}
```

With the answer example in place, this never gets as far as being used: the example fails at
once, saying `double(21)` should have been 42 and was `undefined`. Try it on the live example
below: delete the word `return` and watch the result line.

```tjs:inline {"view": "code"}
function double(n: 21): 42 {
  return n * 2
}

preview.append(`Double 8 is ${double(8)}.`)
```

### Pick an example worth checking

An example is only as good a test as the values in it. `double(n: 0): 0` is true, but it
would also be true of a function that tripled `n`, or one that always gave back 0: zero
times anything is zero. `double(n: 21): 42` can only pass if the function really doubles.
Choose examples where a wrong function would give a different answer.

Sometimes there is no single right answer to show. A function that rolls a die gives a
different number every time. Then write `:!` instead of `:` before the answer's example. It
still says what **kind** of value comes back, but TJS does not run it as a test:

```tjs:inline {"view": "code"}
function rollDie():! 1 {
  return Math.floor(Math.random() * 6) + 1
}

preview.append(`You rolled a ${rollDie()}.`)
```

(`Math.random()` gives a fraction between 0 and 1, and `Math.floor` rounds down to a whole
number.) You will not need `:!` often. When you can give a real example, give one.

`rollDie` takes no values at all, so its parentheses are empty, both where it is written and
where it is called. The parentheses on the call are what run it. Change `rollDie()` to
`rollDie` in the sentence and the page shows the function's own text instead of a number:
without parentheses you are talking **about** the function, not asking it for an answer.

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

Parameters with defaults go after the ones without, because values are matched by position:
in `function tip(bill: 0.0, rate = 0.15)`, `tip(40)` means "40, at the usual rate", and
`tip(40, 0.2)` means "40, at 20%".

## Try it

Write a function `minutes(hours: 0)` that gives back how many minutes are in that many hours.
Show a sentence using it, and add a test that checks `minutes(2)` is `120`. Then give it a
second parameter, `extraMinutes = 0`, so that `minutes(1, 30)` is `90`, and test that too.

More to try:

- Write `fahrenheit(celsius: 100.0): 212.0`, which turns a temperature in Celsius into
  Fahrenheit (multiply by 9, divide by 5, add 32). The answer example is your first test. Add
  a `test` block for 0 (32) and for -40, where the two scales meet.
- Go back to the tips program at the top of this chapter and give `tip` a second parameter,
  `rate = 0.15`. Test a 20% tip.
- Break things on purpose: in `bill`, swap `price` and `quantity` in the call to `cost`, so
  it reads `cost(quantity, price)`. 4 × 2.5 is the same as 2.5 × 4, so you might expect
  nothing to notice. Something does. Read the message: which parameter refused which value,
  and which example told TJS it was wrong?

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, and press ⌘S (Ctrl+S on Windows and Linux) to run it.
```
