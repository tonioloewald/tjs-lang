<!--{"parent": "learn-to-program.md", "order": 10}-->
<!-- TODO review -->

# When Things Go Wrong

Every program goes wrong sometimes, and every programmer spends a good part of their time
finding out why. A mistake in a program is called a **bug**, and finding and fixing one is
**debugging**. Writing bugs is not a sign that you are bad at programming. Experienced
programmers write them all day; what makes them experienced is that they find them quickly,
because they know where to look and what the computer is telling them.

This chapter is about where to look: the ways a TJS program goes wrong, how to read what it
tells you, how to handle mistakes on purpose, and a method for finding the ones nothing tells
you about.

## Three kinds of wrong

1. **The program does not make sense**, so it cannot run: a missing brace, a word in a place
   where it cannot go. Any example on this page shows an error with a line number instead of
   running. You can edit the code in every example, so try it: delete the last `}` in one,
   read the message, then put the brace back. The line number is where the computer
   _noticed_ the problem, which can be after the real mistake, so look at that line and the
   ones above it. A few mistakes of this kind, such as a misspelled name, are only noticed
   when the line that has them runs; they are near the end of the field guide below.
2. **The program runs, and a value is not what it should be**: a word where a number belongs,
   a list with something missing. TJS notices these, and most of this chapter is about them.
3. **The program runs, nothing complains, and the answer is wrong.** A tip calculator meant
   to work out 15% gives 51%; an average comes out a little too high. Nothing in the computer
   can know that 51% is not what you meant. Only a test can, which is why you have been
   writing them since Checking Your Work. The end of this chapter is about finding these.

## Errors are values

When a function is called with the wrong kind of value, TJS does not stop the program. The call
gives back an **error**, a value that describes what went wrong:

```tjs:inline {"view": "code"}
function double(n: 0) {
  return n * 2
}

const result = double('ten')
preview.append(result.message)

test 'a wrong value gives back an error' {
  expect(result instanceof Error).toBe(true)
  expect(result.message).toContain('Expected integer')
  expect(result.message).toContain('double.n')
  expect(result.message).toContain('got string')
  expect(result.received).toBe('ten')
}
```

The example shows this message:

> Expected integer for '&lt;source&gt;:1:double.n', got string

TJS has its own words for kinds of value: a piece of text is a **string**, and a whole number
is an **integer**. Read the message from left to right. It says what was **expected** (an
integer), **where** (the part in quotes), and what **arrived** (a string).

The part in quotes is the address of the mistake, in three pieces separated by colons: where
the code lives (`<source>` means this example's own code), the line where the function is
written (line 1), and then the function's name and its parameter (`double.n`). Almost every
mistake you meet will be a wrong value for some parameter, and the address takes you straight
to it.

An error has two parts you will use. `result.message` is the sentence you just read.
`result.received` is the value that was refused: here, `'ten'`. When you are not sure what a
function was given, `received` tells you.

## A field guide to messages

Here are the messages you will see most often. Try each call at the console's prompt and
compare what it says with the list below the example:

```tjs:inline {"view": "console"}
function double(n: 0) {
  return n * 2
}

function area(rect: { width: 0, height: 0 }) {
  return rect.width * rect.height
}

function total(prices: [0.0]) {
  let sum = 0
  for (const price of prices) {
    sum = sum + price
  }
  return sum
}

console.log('Try: double(2.5)   double()   area({ width: 3 })   total([1, "two", 3])')

test 'the messages in the field guide' {
  expect(double(2.5).message).toContain('got number')
  expect(double().message).toContain('got undefined')
  expect(area({ width: 3 }).message).toContain('area.rect.height')
  expect(area({ width: 3 }).received).toEqual({ width: 3 })
  expect(total([1, 'two', 3]).message).toContain('total.prices[1]')
  expect(total([1, 'two', 3]).received).toEqual([1, 'two', 3])
}
```

- `double(2.5)`: **Expected integer for '&lt;source&gt;:1:double.n', got number.** Right kind
  of thing, wrong variety: 2.5 is a number, but not a whole one. Remember from Functions that
  the example `0` means whole numbers and `0.0` means any number. Either the caller should
  round it, or the function should take any number (`n: 0.0`).
- `double()`: **got undefined.** Something was not given at all. Look for a call with too few
  values, or a name that was never set.
- `area({ width: 3 })`: the address ends in **`area.rect.height`**. A part is missing, or
  misspelled. The path, read left to right, is the way into the value: the parameter `rect`,
  then its part `height`. Here `received` is the whole rectangle, `{ width: 3 }`, not the
  missing part: the mistake is that it was not a whole rectangle.
- `total([1, "two", 3])`: the address ends in **`total.prices[1]`**. One item in a list is
  wrong, and `[1]` says which: the second (lists count from 0, as in Lists). Here too
  `received` is the whole list, `[1, "two", 3]`; the `[1]` in the message tells you which item
  to look at.

### Mistakes that stop the program

Two messages are different. They come from the first kind of wrong, a program that does not
make sense, noticed only when the line runs. These are the exception to "TJS does not stop
the program": there is no sensible value to give back, so the example stops and shows the
message instead of a result.

- **`… is not defined`** (in some browsers, **`Can't find variable`**): a name that does not
  exist. Nearly always a typo, `doubel(3)` for `double(3)`, or a name used outside the
  function it was made in (see Functions).
- **`… is not a function`**: you put `( )` after something that is not a function, such as
  `preview.apend(…)` for `preview.append(…)`. The part before the `(` is misspelled, or is
  not what you think it is.

Type `doubel(3)` at the console prompt above. At the prompt, the message appears in the
console and the example carries on. To see an example stop, change `preview.append` to
`preview.apend` in the code of the next example and run it, then change it back.

## Errors pass along

A function whose parameters have examples, like `double(n: 0)`, checks every value it is
given. The errors those checks make are TJS's own errors. If you hand one of them to another
such function, it does not try to work with it: it gives the same error straight back. So the
first mistake travels to the end, unchanged:

```tjs:inline {"view": "code"}
function double(n: 0) {
  return n * 2
}

const first = double('ten')
const later = double(double(first))

preview.append(later.message)

test 'the first error reaches the end, unchanged' {
  expect(later).toBe(first)
  expect(later.received).toBe('ten')
}
```

`later` is not a similar error: it is the very same one. That is what `toBe` checks. For an
object, `toBe` asks "is this the very same thing?", like `==` in Things with Parts, while
`toEqual` asks "does it have the same parts?". Nothing crashed, and the message is about the
real mistake, `'ten'`, not about anything that happened after it. That is the point: in a long
chain of steps, you see where it started.

## Checking for an error

When an error might come back, check for it before using the result, and decide what to show
instead:

```tjs:inline {"view": "code"}
function double(n: 0) {
  return n * 2
}

function describe(value: 0.0) {
  const result = double(value)
  if (result instanceof Error) {
    return 'That is not a whole number.'
  }
  return `Double is ${result}.`
}

preview.append(describe(21), ' ', describe(2.5))

test 'describe handles both' {
  expect(describe(21)).toBe('Double is 42.')
  expect(describe(2.5)).toBe('That is not a whole number.')
}
```

`describe` takes any number (`0.0`), so its own parameter check lets 2.5 through. `double`
takes only whole numbers (`0`), so its parameter check refuses 2.5 and gives back an error.
The `if` in `describe` sees that error and shows a sentence instead. `instanceof Error` asks
"is this an error?", the same check as in Checking Your Work.

## Making your own errors

Some mistakes are not about the kind of value but about what it means: dividing by zero, a date
in the future, an empty name. Your function can report those too, by giving back an `Error` with
a message of your own:

```tjs:inline {"view": "code"}
function divide(a: 0.0, b: 0.0) {
  if (b == 0) {
    return Error('cannot divide by zero')
  }
  return a / b
}

const answer = divide(1, 0)
preview.append(answer instanceof Error ? answer.message : `${answer}`)

test 'divide reports its own mistake' {
  expect(divide(6, 3)).toBe(2)
  expect(divide(1, 0) instanceof Error).toBe(true)
  expect(divide(1, 0).message).toBe('cannot divide by zero')
}
```

The line that shows the answer uses `? :` from Decisions: if `answer` is an error, show its
message; otherwise show the answer.

Whoever calls `divide` checks for the error, as in the last section. A good message says what
went wrong in words the reader can act on: "cannot divide by zero", not "error 7".

There is one difference between your errors and the ones TJS makes. Only TJS's own errors pass
along by themselves; that is a rule to remember. Hand one of yours to a function that wants a
number, and it is refused like any other wrong value. Your `Error` is an object, a thing with
parts, so the new error says "got object". Your error is not lost, though. The refusal keeps it
as `received`:

```tjs:inline {"view": "code"}
function divide(a: 0.0, b: 0.0) {
  if (b == 0) {
    return Error('cannot divide by zero')
  }
  return a / b
}

function double(n: 0) {
  return n * 2
}

const mine = divide(1, 0)
const refused = double(mine)

preview.append(`${refused.message}, and inside it: ${refused.received.message}`)

test 'your own error is refused, and kept as received' {
  expect(refused instanceof Error).toBe(true)
  expect(refused == mine).toBe(false) // not the same error
  expect(refused.message).toContain('got object')
  expect(refused.received).toBe(mine)
  expect(refused.received.message).toBe('cannot divide by zero')
}
```

So the first mistake can still be found: it is one step in, at `refused.received`. Usually it
is clearer to check for your error where it is made, as `describe` did, than to let it reach a
function that will refuse it.

## Errors nobody looked at

Because errors are values, it is possible to get one and ignore it. The program carries on,
the error is never shown, and something later is quietly missing. TJS guards against this by
keeping a notebook: every time one of its checks refuses a value, it writes the error down,
whether or not anyone looks at the error that was given back. You read the notebook through
`__tjs`, TJS's own toolbox, which every example can use without setting anything up.

```tjs:inline {"view": "code"}
function double(n: 0) {
  return n * 2
}

__tjs.clearErrors()

double(4)
double('four') // the answer is ignored: nobody sees the error
double(4.5) // and again

const missed = __tjs.errors()

preview.append(`${missed.length} refused calls. The first: ${missed[0].message}`)

test 'refused calls are remembered even when ignored' {
  expect(missed.length).toBe(2)
  expect(missed[0].received).toBe('four')
}
```

`__tjs.clearErrors()` empties the notebook, so you only see what happens after it.
`__tjs.errors()` gives back the list of written-down errors, oldest first and newest last.
When a program misbehaves and you cannot see why, look here first: a refused call you never
checked is a very common cause. At any example's console, type `__tjs.errors()` to see them.

The notebook keeps TJS's refusals only. An `Error` your own function gives back, like
`divide`'s, is not in it until something refuses it. And an error that passes along is noted
once, where it started, not again at every step.

## Looking inside a program

When a program gives a wrong answer and there is no error, look at what it is doing.
`console.log` prints any values you give it, separated by spaces, as the program runs. This
`average` has a bug: the average of 2, 4 and 9 should be 5, and it is not.

```tjs:inline {"view": "console"}
function average(numbers: [0.0]) {
  let total = numbers[0]
  for (const n of numbers) {
    total = total + n
    console.log('after', n, 'the total is', total)
  }
  return total / numbers.length
}

console.log('average:', average([2, 4, 9]))
```

Each line shows the program's state at one moment. The first line already says "after 2 the
total is 4", where it should be 2. When a line stops matching what you expected, the mistake
is in the step that made it, or just before it. Here nothing came before the first round but
the starting value: `total` started at the first number, so that number is added twice.
Change `numbers[0]` to `0` and the lines read 2, 6 and 15, and the average is 5.

When you have found a mistake, write a test that would have caught it, then fix it: the test
makes sure it stays fixed.

## A method for finding bugs

When an answer is wrong and you do not know why, guessing and changing things at random is
the slow way. This is the fast way:

1. **Make it happen on purpose.** Find the smallest call that gives the wrong answer. A bug
   you can reproduce is half fixed.
2. **Write it down as a failing test.** Say what the answer should be. Now the computer will
   tell you when you have fixed it, and will keep telling you if it ever comes back.
3. **Look inside.** Use `console.log`, the console prompt, or `__tjs.errors()` to see the
   values as the program runs. Find the first step where a value is not what you expected.
   The bug is at that step, or just before it.
4. **Fix that, and only that.** Then run every test, not only the new one.

Here is a bug that shows the whole method. This function is meant to give back the last item
in a list:

```tjs:inline {"view": "console"}
function lastItem(items: ['']) {
  return items[items.length]
}

console.log('the last item is', lastItem(['a', 'b', 'c']))
```

Follow the steps in that example:

1. `lastItem(['a', 'b', 'c'])` should be `'c'`, and the console shows `undefined`.
2. Add a test to the example's code and run it, and watch it fail:

   ```text
   test 'the last item' {
     expect(lastItem(['a', 'b', 'c'])).toBe('c')
   }
   ```

3. At the console prompt, ask for `['a', 'b', 'c'].length`. It is 3. And
   `['a', 'b', 'c'][3]`? `undefined`: the items are numbered 0, 1 and 2, so there is no
   item 3. The last item is at `length - 1`.
4. Fix that one line, and run the tests again:

```tjs:inline {"view": "code"}
function lastItem(items: ['']) {
  return items[items.length - 1]
}

preview.append(lastItem(['a', 'b', 'c']))

test 'the last item' {
  expect(lastItem(['a', 'b', 'c'])).toBe('c')
  expect(lastItem(['only'])).toBe('only')
}
```

This is the off-by-one mistake from Repetition (counting one too far or one too few), made with
a position instead of a loop. The tests check the edges, where off-by-one mistakes live: the
last item, and a list whose first item is also its last.

## Try it

`average([])` (the fixed one) divides 0 by 0 and gives `NaN`, which means "not a number".
Change `average` so that an empty list gives back an `Error` saying so, and write the tests
first: one for a normal list, one for a list of one number, and one for the empty list.

More to try:

- `lastItem([])` gives `undefined`. Decide what it should give instead (an `Error`, perhaps),
  write the test, and make it pass.
- Write `safeDouble(n: 0.0)` that calls `double`, and gives back the answer if there is one,
  or the string `'not a whole number'` if `double` gave back an error. Test both. Then check
  with `__tjs.errors()` that the refusal was still written down, even though `safeDouble`
  handled it and nobody saw the error.
- This function is meant to count the vowels in a word, but `countVowels('banana')` gives 0.
  Find the bug with the method above. (Hint: put a `console.log` inside the loop. How many
  times does it print?)

```tjs:inline {"view": "console"}
function countVowels(word: '') {
  let count = 0
  for (const letter of word) {
    if ('aeiou'.includes(letter)) {
      count = count + 1
    }
    return count
  }
}

console.log('vowels in banana:', countVowels('banana'))
```

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
