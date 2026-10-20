<!--{"parent": "learn-to-program.md", "order": 11}-->

# When Things Go Wrong

Every program goes wrong sometimes, and every programmer spends a good part of their time
finding out why. This chapter is about the two ways a TJS program goes wrong, how to read
what it tells you, and how to handle mistakes on purpose.

## Two kinds of wrong

1. **The program does not make sense**, so it cannot run at all: a missing brace, a misspelled
   word in the wrong place. The example shows an error with a line number instead of running.
   Try it: delete the last `}` in any example, read the message, then put the brace back.
2. **The program runs, and a value is not what it should be**: a word where a number belongs,
   a list with something missing. This chapter is mostly about these.

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
  expect(result.received).toBe('ten')
}
```

Read the message from left to right: what was **expected** (an integer), **where** (the
function `double`, its parameter `n`), and what **arrived** (a string). Almost every mistake
you meet will be one of these, and the message says which part to look at. The error also
keeps the value itself, as `result.received`: here, `'ten'`.

## Errors pass along

If you hand an error to another TJS function, it does not try to work with it: it gives the
same error straight back. So the first mistake travels to the end, unchanged:

```tjs:inline {"view": "code"}
function double(n: 0) {
  return n * 2
}

const first = double('ten')
const later = double(double(first))

preview.append(later.message)

test 'the first error reaches the end, unchanged' {
  expect(later).toBe(first)
}
```

`later` is not just a similar error: it is the very same one (`toBe` checks that). Nothing
crashed, and the message is about the real mistake, `'ten'`, not about anything that happened
after it. That is the point: in a long chain of steps, you see where it started.

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

`describe` takes any number (`0.0`), and `double` takes only whole numbers (`0`), so 2.5 gets
past the first check and is refused by the second. `instanceof Error` asks "is this an
error?", the same check as in Checking Your Work.

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

Whoever calls `divide` checks for the error, as in the last section. Only the errors TJS
makes pass along by themselves: hand one of yours to a function that wants a number and it is
refused like any other wrong value, but the refusal keeps it, as `received`. A good message says what
went wrong in words the reader of the message can act on: "cannot divide by zero", not
"error 7".

## Looking inside a program

When a program gives a wrong answer and there is no error, look at what it is doing.
`console.log` prints any value as the program runs:

```tjs:inline {"view": "console"}
function average(numbers: [0.0]) {
  let total = 0
  for (const n of numbers) {
    total = total + n
    console.log('after', n, 'the total is', total)
  }
  return total / numbers.length
}

console.log('average:', average([2, 4, 9]))
```

Each line shows the program's state at one moment, so you can see where it stops matching what
you expected. When you have found the mistake, write a test that would have caught it, then
fix it: the test makes sure it stays fixed.

One more place to look: TJS remembers the recent mistakes it caught. At any example's console,
type `__tjs.errors()` to see them, newest last.

## Try it

`average([])` divides by zero and gives `NaN`, which means "not a number". Change `average` so
that an empty list gives back an `Error` saying so, and write the tests first: one for a normal
list, one for a list of one number, and one for the empty list.
