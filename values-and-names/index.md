<!--{"parent": "learn-to-program.md", "order": 2}-->

# Values and Names

Programs work with **values**: numbers, text, true and false. This chapter is about the
kinds of values there are, and how to give a value a name so you can use it again.

## Kinds of value

Ask the console. Type each of these at its prompt and press Enter:

```tjs:inline {"view": "console"}
console.log('Type 7 * 6, then 10 / 4, then 7 > 3 at the prompt below.')
```

- `7 * 6` is **42**. Numbers do arithmetic: `+`, `-`, `*` (multiply) and `/` (divide).
- `10 / 4` is **2.5**. Numbers can have a fractional part.
- `7 > 3` is **true**. A comparison is a question, and its answer is a **boolean**: `true` or
  `false`.

So far you have met three kinds of value: numbers, strings and booleans. `typeof` tells you
which kind a value is; try `typeof 42`, `typeof 'hi'` and `typeof true` at the prompt.

## Naming a value

`const` gives a value a name:

```tjs:inline {"view": "code"}
const width = 6
const height = 7
const area = width * height

preview.append(`A ${width} by ${height} rectangle has an area of ${area}.`)

test 'area is width times height' {
  expect(area).toBe(42)
}
```

Once a value has a name, you can use the name wherever you would use the value. Change
`width` to `10` and look at the sentence, then at the test. Why does the test fail now, and
what should it expect instead?

## Names that change

A `const` name keeps its value. When a value needs to change, use `let`:

```tjs:inline {"view": "code"}
let score = 0
score = score + 10
score = score + 5

preview.append(`Your score is ${score}.`)

test 'the score adds up' {
  expect(score).toBe(15)
}
```

`score = score + 10` reads "set `score` to what `score` was, plus 10". Use `const` unless you
need the name to change; then a reader knows at a glance that the value stays put.

## Asking whether two values are the same

`==` asks whether two values are equal, and `!=` asks whether they differ:

```tjs:inline {"view": "code"}
const answer = 42
const guess = 40 + 2

preview.append(`Is the guess right? ${guess == answer}`)

test 'comparing values' {
  expect(guess == answer).toBe(true)
  expect('42' == 42).toBe(false)
}
```

The last line checks that the **text** `'42'` is not the **number** `42`. They look alike, but
they are different kinds of value, and TJS keeps them apart. (Some other languages quietly
treat them as equal, which causes a whole family of bugs. TJS does not.)

## Try it

Write a program that names your age, names the current year, works out the year you were
born, and shows a sentence about it. Add a test that checks the birth year. Then change your
age and watch the test tell you to update it.
