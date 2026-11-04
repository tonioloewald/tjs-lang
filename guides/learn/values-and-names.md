<!--{"parent": "learn-to-program.md", "order": 2}-->

# Values and Names

Programs work with **values**: numbers, text, true and false. This chapter is about the
kinds of values there are, and how to give a value a name so you can use it again.

<!-- TODO review -->

Here is the problem names solve. Suppose a program works out the area of a room, the cost of
carpeting it, and how long that will take. The width of the room appears in all three
calculations. Write `4.5` three times and you have three places to get it wrong, and three
places to change when you measure again. Give it a name, `width`, and you write it once.

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

<!-- TODO review -->

## Arithmetic, in order

Arithmetic in a program follows the rules you learned at school: multiplication and division
happen before addition and subtraction, and parentheses go first of all.

```tjs:inline {"view": "code"}
const plain = 2 + 3 * 4
const grouped = (2 + 3) * 4

preview.append(`2 + 3 * 4 is ${plain}, but (2 + 3) * 4 is ${grouped}.`)

test 'multiplication before addition' {
  expect(plain).toBe(14)
  expect(grouped).toBe(20)
}
```

When you are not sure what order something happens in, add parentheses. They cost nothing,
and they tell the next reader what you meant.

One surprise is worth meeting now, so it does not surprise you later. At the console, type
`0.1 + 0.2`. The answer is not quite `0.3`: it is `0.30000000000000004`. Computers store
fractions in binary, and most decimal fractions, like one tenth, cannot be written exactly in
binary, just as one third cannot be written exactly in decimal (0.333…). The error is tiny,
and for most programs it does not matter. When it does, as with money, programmers count in
whole cents instead of fractions of a pound or dollar.

<!-- TODO review -->

## Strings are values too

A string is a value like any other, and you can ask it things. `.length` is how many
characters it has, and `.toUpperCase()` gives back the same text in capitals:

```tjs:inline {"view": "code"}
const word = 'program'

preview.append(`"${word}" has ${word.length} letters. Shouted: ${word.toUpperCase()}!`)

test 'asking a string about itself' {
  expect(word.length).toBe(7)
  expect(word.toUpperCase()).toBe('PROGRAM')
  expect(word).toBe('program')
}
```

The last check matters: `toUpperCase()` gives back a **new** string. The original `word` is
unchanged. Spaces and punctuation are characters too: try changing `word` to
`'hello, world'` and predict its length before you look.

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

<!-- TODO review -->

Notice the order. `area` is worked out on the third line, from the values `width` and `height`
have at that moment. A name is not a formula that keeps updating; it is a label stuck on a
value. And a name has to exist before it is used: move the `const area` line to the top, and
TJS stops with an error, because on that line `width` and `height` do not exist yet.

<!-- TODO review -->

## Choosing names

A name can be made of letters, digits, `_` and `$`, but it cannot start with a digit and
cannot contain spaces. So `width`, `roomWidth` and `width2` are names; `2width` and
`room width` are not. When a name needs several words, the convention is to run them together
and capitalise each word after the first: `roomWidth`, `costPerMetre`. That style is called
**camelCase**, for the humps.

Capital letters matter. `width` and `Width` are two different names, and it is a common
mistake to make one and use the other.

Choose names that say what the value **means**, not what kind of value it is. `area` tells a
reader something; `number` or `x` tells them almost nothing. You write a name once and read it
dozens of times, so a few extra letters are always worth it.

<!-- TODO review -->

## When a name goes wrong

Two mistakes with names happen to everyone. Try both in the rectangle example above.

**A misspelled name.** Change `${area}` in the sentence to `${aera}`. The example stops with an
error saying `aera` is not defined. TJS has never heard of `aera`; you only ever named `area`.
When you see "is not defined", look for a typo, or a capital letter where there should not be
one. Put it back.

**Changing a `const`.** Add a line `width = 8` after the first line. The example stops again,
this time with an error about assigning to a constant. `const` is a promise that this name
always means this value, and TJS holds you to it. If a value really needs to change, use `let`,
which is next.

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

<!-- TODO review -->

Changing a name by adding to it is so common that it has a shorthand: `score += 10` means
exactly `score = score + 10`. There are `-=`, `*=` and `/=` as well. Rewrite the example with
`+=` and check that the test still passes.

`=` is not the `=` of arithmetic. In maths, `x = x + 10` is a contradiction. In a program it is
an instruction, "put this value in that name", and it is read right to left: work out the
right-hand side, then store it under the name on the left.

<!-- TODO review -->

## Text that looks like a number

`+` does two different jobs: it adds numbers and joins strings. When one side is a string, it
joins. That causes one of the most common bugs there is:

```tjs:inline {"view": "code"}
const typed = '5'
const joined = typed + 3
const added = Number(typed) + 3

preview.append(`'5' + 3 is ${joined}, but Number('5') + 3 is ${added}.`)

test 'text and numbers are different things' {
  expect(joined).toBe('53')
  expect(added).toBe(8)
}
```

`'5'` is the **character** 5, not the number five, so `'5' + 3` joins it with `3` to make the
string `'53'`. This happens whenever a number arrives as text, which is exactly how it arrives
when someone types it into a page. `Number(…)` turns text into a number. Try `Number('five')`
at a console: the answer is `NaN`, which stands for "not a number". Words do not convert.

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

<!-- TODO review -->

Notice that comparing uses two equals signs. One `=` stores a value in a name; two, `==`, asks a
question. Mixing them up is a classic mistake, and the next chapter, on decisions, shows what
TJS does about it.

<!-- TODO review -->

## Nothing at all

Sometimes there is no value. A `let` you have not given a value yet holds `undefined`, which
means "nothing here". At a console, type `let later`, press Enter, then type `later`. You will
meet `undefined` again whenever a program looks for something that is not there, such as the
tenth item of a list that has three.

<!-- TODO review -->

## Try it

1. Write a program that names your age, names the current year, works out the year you were
   born, and shows a sentence about it. Add a test that checks the birth year. Then change your
   age and watch the test tell you to update it.
2. A pizza has 8 slices and costs 12. Name both, work out the price of one slice, and show it.
   Test it. (Is the answer what you expected? `/` gives fractions.)
3. Start a `let total = 0`, add three prices to it with `+=`, and test the total.
4. Make `const first = 'Ada'` and `const last = 'Lovelace'`, and build the full name from them
   with a space in between. Test that it has 12 characters.
