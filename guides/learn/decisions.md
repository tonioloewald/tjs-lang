<!--{"parent": "learn-to-program.md", "order": 5}-->
<!-- TODO review -->

# Decisions

Every program so far has done the same thing every time. Real programs decide: if the user
is new, say welcome; if the number is too big, say so. This chapter is about making a program
choose what to do.

## Questions with yes-or-no answers

A decision starts with a question whose answer is `true` or `false`. You met the first of these
in Values and Names: `7 > 3` is `true`. Here is the whole family:

| question | means                                   | example          |
| -------- | --------------------------------------- | ---------------- |
| `a < b`  | is `a` less than `b`?                   | `3 < 5` is true  |
| `a > b`  | is `a` greater than `b`?                | `3 > 5` is false |
| `a <= b` | is `a` less than or equal to `b`?       | `5 <= 5` is true |
| `a >= b` | is `a` greater than or equal to `b`?    | `4 >= 5` is false |
| `a == b` | is `a` the same value as `b`?           | `5 == 5` is true |
| `a != b` | is `a` a different value from `b`?      | `5 != 5` is false |

`==` is strict about kinds of value: `5 == '5'` is `false`, because one is a number and the
other is a string, and `'Sunday' == 'sunday'` is `false`, because a capital letter is a
different letter.

```tjs:inline {"view": "code"}
const age = 17

preview.append(`At ${age}, old enough to vote: ${age >= 18}`)

test 'comparisons answer true or false' {
  expect(age >= 18).toBe(false)
  expect(age < 18).toBe(true)
  expect(age != 18).toBe(true)
}
```

Change `age` to `18` and then to `19`, and before each change, predict the sentence. The
difference between `>` and `>=` is exactly one value: the edge. Decisions go wrong at their
edges more than anywhere else.

When you change `age`, the test turns red. It was written for an age of 17, and it is telling
you the answers have changed. That is a test doing its job; change `age` back to 17 and it
passes again.

## `if`: only sometimes

`if` runs a block of code only when a condition is true. The condition goes in parentheses,
and the code to run goes in braces:

```tjs:inline {"view": "code"}
function advice(temperature: 0) {
  let message = 'Have a nice day.'
  if (temperature < 10) {
    message = 'Take a coat.'
  }
  return message
}

preview.append(advice(5))

test 'a coat when it is cold, not when it is warm' {
  expect(advice(5)).toBe('Take a coat.')
  expect(advice(20)).toBe('Have a nice day.')
}
```

`temperature < 10` is a comparison, so its value is `true` or `false` (see Values and Names). When it is
true, the block runs and `message` changes; when it is false, the block is skipped. Change
`advice(5)` to `advice(25)` and watch the advice change.

## A decision is only as good as its input

What happens if `advice` is asked about something that is not a temperature at all? Change
`advice(5)` to `advice('cold')`. Without a check, the comparison `'cold' < 10` would quietly
answer `false`, and the program would cheerfully tell you to have a nice day. TJS does not let
that happen. `temperature: 0` says `advice` takes a whole number, so the call never reaches
the `if`: it gives back an error saying an integer was expected and a string arrived, and that
error is what appears on the page.

Now try `advice(9.5)`. That is refused too, and this time TJS is right and the program is
wrong: temperatures have fractions, but the example `0` says "whole number". Change the example
to `0.0`, which means any number, and `advice(9.5)` works. The example in a function's
parentheses is a statement about what the function accepts, and it is worth getting right.

```tjs:inline {"view": "code"}
function advice(temperature: 0.0) {
  let message = 'Have a nice day.'
  if (temperature < 10) {
    message = 'Take a coat.'
  }
  return message
}

preview.append(advice(9.5))

test 'any number is a temperature; a word is not' {
  expect(advice(9.5)).toBe('Take a coat.')
  expect(advice(10)).toBe('Have a nice day.')
  expect(advice('cold') instanceof Error).toBe(true)
}
```

The last check is the one from Checking Your Work: a wrong kind of value gives back an error,
and a test can say so.

## `else`: one or the other

`else` gives the other choice: what to do when the condition is false.

```tjs:inline {"view": "code"}
function describe(n: 0) {
  if (n % 2 == 0) {
    return `${n} is even`
  } else {
    return `${n} is odd`
  }
}

preview.append(describe(7))

test 'even and odd' {
  expect(describe(4)).toBe('4 is even')
  expect(describe(7)).toBe('7 is odd')
}
```

`%` gives the **remainder** after dividing: `7 % 2` is 1, because 7 is three 2s and 1 over.
An even number leaves no remainder. Notice that each branch can `return` straight away: once a
function returns, nothing after it runs.

## One equals sign, or two?

`=` stores a value; `==` asks a question. Typing one when you meant the other is perhaps the
most famous mistake in programming. Try it: in `describe`, change `n % 2 == 0` to `n % 2 = 0`.
The example stops with an error before anything runs, because "store 0 in `n % 2`" makes no
sense: `n % 2` is a calculation, not a name.

The mistake is sneakier when the left side **is** a name. `if (n = 0)` is legal: it stores 0 in
`n`, then treats that 0 as the answer to the question, and 0 counts as false, so the block
never runs, whatever `n` was:

```tjs:inline {"view": "code"}
function isZero(n: 0) {
  if (n = 0) {
    return 'zero'
  }
  return 'not zero'
}

preview.append(`isZero(0) says: ${isZero(0)}`)
```

It says `not zero` for 0. Put the second `=` back, `if (n == 0)`, and it says `zero`.

That is why the tests in this book check both
branches of every decision: a decision that always goes the same way passes half its tests,
and the other half tell you something is wrong.

## `else if`: more than two choices

Chain `else if` to test one condition after another. The first one that is true wins, and the
rest are skipped:

```tjs:inline {"view": "code"}
function grade(score: 0) {
  if (score >= 90) {
    return 'A'
  } else if (score >= 80) {
    return 'B'
  } else if (score >= 70) {
    return 'C'
  } else {
    return 'keep practising'
  }
}

preview.append(`85 earns ${grade(85)}`)

test 'grades' {
  expect(grade(95)).toBe('A')
  expect(grade(85)).toBe('B')
  expect(grade(70)).toBe('C')
  expect(grade(10)).toBe('keep practising')
}
```

The order matters. 95 is also at least 80, but the `score >= 90` test comes first, so it wins.
Try moving the `score >= 80` branch to the top and see which tests fail.

Read the chain as a series of narrowing questions. By the time the program asks
`score >= 80`, it already knows the score is **not** 90 or more, so that branch means "80 to
89". Each `else if` only has to rule out what is left. And the final `else` catches
everything nothing else did, so `grade` always gives back an answer.

## Combining conditions

Three words build bigger conditions out of smaller ones:

- `&&` means **and**: both must be true.
- `||` means **or**: at least one must be true.
- `!` means **not**: it turns true into false and false into true.

```tjs:inline {"view": "code"}
function canRide(age: 0, height: 0) {
  return age >= 8 && height >= 120
}

preview.append(`An 8-year-old who is 130cm tall can ride: ${canRide(8, 130)}`)

test 'old enough AND tall enough' {
  expect(canRide(8, 130)).toBe(true)
  expect(canRide(8, 100)).toBe(false)
  expect(canRide(6, 130)).toBe(false)
}
```

Notice that `canRide` has no `if` at all. `age >= 8 && height >= 120` already **is** `true` or
`false`, so the function can return it directly. Writing
`if (condition) { return true } else { return false }` is a long way to say `return condition`.

`||` and `!` work the same way:

```tjs:inline {"view": "code"}
function isWeekend(day: 'monday') {
  return day == 'saturday' || day == 'sunday'
}

function isWorkday(day: 'monday') {
  return !isWeekend(day)
}

preview.append(`Is Sunday a workday? ${isWorkday('sunday')}`)

test 'or, and not' {
  expect(isWeekend('saturday')).toBe(true)
  expect(isWeekend('sunday')).toBe(true)
  expect(isWeekend('tuesday')).toBe(false)
  expect(isWorkday('tuesday')).toBe(true)
}
```

A common slip is to write `day == 'saturday' || 'sunday'`, the way you would say it aloud.
It does not do what it says. `||` gives back the first side if that is true, and otherwise the
second side, so for `'tuesday'` the answer is the string `'sunday'`, not `false`. Each side of
`||` has to be a whole question, so the comparison must be written out twice. And the
comparison is exact: try `isWeekend('Sunday')`, with a capital S.

## Choosing between two values

When a decision only picks one of two values, there is a shorter form:
`condition ? valueIfTrue : valueIfFalse`. It reads "if the condition is true, this, otherwise
that". Before the `?` is the question; between `?` and `:` is the value to use when the answer
is true; after the `:` is the value to use when it is false.

```tjs:inline {"view": "code"}
function fruit(count: 0) {
  return `${count} ${count == 1 ? 'apple' : 'apples'}`
}

const apples = 1

preview.append(`You have ${fruit(apples)}.`)

test 'one apple, many apples' {
  expect(fruit(1)).toBe('1 apple')
  expect(fruit(3)).toBe('3 apples')
  expect(fruit(0)).toBe('0 apples')
}
```

Change `apples` to `0`, then `3`. The whole `count == 1 ? 'apple' : 'apples'` is a value, which
is why it can sit inside `${ }` in a template string, where an `if` cannot. The same
`if`/`else` would need a name to store the word in first:

```javascript
let word = 'apples'
if (count == 1) {
  word = 'apple'
}
```

Use `? :` for small choices like a label or a word. When either choice takes more than a line,
or when the choice is to do something rather than to pick a value, `if` and `else` are easier
to read. Programmers call `? :` the **conditional operator**, or the **ternary** operator
because it has three parts.

## `given`: choosing by value

When the decision is "which of these values is it?", a chain of `else if`s gets long. `given`
lists the values instead. Each line names one or more values, then the block to run:

```tjs:inline {"view": "code"}
function kindOfDay(day: 'monday') {
  given day {
    'saturday', 'sunday' {
      return 'weekend'
    }
    'friday' {
      return 'almost the weekend'
    }
  } else {
    return 'a working day'
  }
}

preview.append(`Friday is ${kindOfDay('friday')}.`)

test 'days of the week' {
  expect(kindOfDay('sunday')).toBe('weekend')
  expect(kindOfDay('friday')).toBe('almost the weekend')
  expect(kindOfDay('tuesday')).toBe('a working day')
}
```

Exactly one block runs: the one whose value matches, or the `else` block when none does. The
`else` is optional; without it, a value that matches nothing runs no block at all. Values are
compared the way `==` compares them, so `given` works on numbers as well as words, and
`'Friday'` with a capital F does not match `'friday'`.

`given` is how TJS does what JavaScript and TypeScript do with `switch` and `case`, and it
does what you almost always want.

If you already know JavaScript: `switch` still works in a `.tjs` file, with exactly
JavaScript's semantics. Cases fall through unless you write `break`, they share one scope,
and they compare with `===`. TJS leaves it alone so that JavaScript you paste in still means
what it meant, and warns at each `switch`, pointing at `given`. A `given` arm never falls
through, each arm has its own scope, and one arm can list several values, which is the
legitimate use of fallthrough in a `switch`.

Why TJS added a new word rather than quietly changing what `switch` does is a story of its
own: testing showed that a new keyword, carefully explained, surprised people less. See
[Case study: fixing switch](/case-study-switch/).

## Try it

A cinema charges children (under 12) 5, seniors (65 and over) 6, and everyone else 10. Write
`ticketPrice(age: 0)` and test all three prices, plus the edges: an 11-year-old, a
12-year-old, a 64-year-old and a 65-year-old. Edges are where decisions go wrong, so they are
where tests earn their keep.

Then:

1. Add a rule: on Tuesdays everyone pays 4. Give `ticketPrice` a second parameter,
   `day: 'monday'`, and decide which check should come first. Test a Tuesday child and a
   Tuesday senior.
2. Write `bigger(a: 0.0, b: 0.0)` that gives back whichever number is larger, using `? :`.
   What should it give back when they are equal? Test that case too.
3. Use `given` to write `vowel(letter: 'a')` that is `true` for `'a'`, `'e'`, `'i'`, `'o'` and
   `'u'`, and `false` for anything else.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, and press ⌘S (Ctrl+S on Windows and Linux) to run it.
```
