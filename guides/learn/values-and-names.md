<!--{"parent": "learn-to-program.md", "order": 2}-->
<!-- TODO review -->

# Values and Names

Programs work with **values**: numbers, text, true and false. This chapter is about the
kinds of values there are, and how to give a value a name so you can use it again.

Here is the problem names solve. Suppose a program works out the area of a room, the cost of
carpeting it, and the length of skirting board that runs around its edge. The width of the
room appears in all three calculations. Write `4.5` three times and you have three places to
get it wrong, and three places to change when you measure again. Give it a name, `width`, and
you write it once.

## Kinds of value

Here are three small questions to ask the console: `7 * 6`, then `10 / 4`, then `7 > 3`. Type
each one at the prompt in the console box below (the line where you can type) and press Enter.

```tjs:inline {"view": "console"}
console.log('Type 7 * 6, then 10 / 4, then 7 > 3 at the prompt below.')
```

- `7 * 6` is **42**. Numbers do arithmetic: `+`, `-`, `*` (multiply) and `/` (divide).
- `10 / 4` is **2.5**. Numbers can have a fractional part.
- `7 > 3` is **true**. A comparison is a question, and its answer is a **boolean**: `true` or
  `false`.

Add the strings from the last chapter, text in quotes like `'hi'` (or in backticks, as a
template), and you have the three kinds of value this chapter is mostly about: numbers,
strings and booleans. `typeof` tells you which kind a value is. Try `typeof 42`,
`typeof 'hi'` and `typeof true` at the same prompt: the answers are `number`, `string` and
`boolean`.

## Arithmetic, in order

Arithmetic in a program follows the rules you learned at school: multiplication and division
happen before addition and subtraction, and parentheses go first of all.

The examples from here on use the pieces from [Hello, Screen](/hello-screen/). Read
`const plain = …` as "call this `plain`" (this chapter explains it properly in a moment).
`preview.append` shows a line under the example, a backtick template fills in each `${…}`, and
the `test` block checks the results and says under the example whether they passed.

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

Fractions have one surprise: `0.1 + 0.2` is not exactly `0.3`. The chapter
[Checking Your Work](/checking-your-work/) explains why, and what it means for your tests.

## Strings are values too

A string is a value like any other, and you can ask it things. The dot asks the value
something. `.length` is a fact the string already knows: how many characters it has.
`.toUpperCase()` is something the string does: it gives back the same text in capitals. The
`()` means "do it now": leave it off and the string does not do it, and put `()` after
`length` and TJS reports an error, because `length` is not something a string can do.

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

`const` gives a value a name. Here is the room from the start of the chapter:

```tjs:inline {"view": "code"}
const width = 4.5
const length = 4
const area = width * length
const carpetCost = area * 20
const skirting = 2 * (width + length)

preview.append(`The room is ${area} square metres. Carpet costs ${carpetCost}, and it needs ${skirting} metres of skirting board.`)

test 'the room adds up' {
  expect(area).toBe(18)
  expect(carpetCost).toBe(360)
  expect(skirting).toBe(17)
}
```

Once a value has a name, you can use the name wherever you would use the value. The width is
written once, and three answers depend on it. Measure again: change `width` to `5` and look at
the sentence, then at the test. Why does the test fail now, and what should it expect instead?

Notice the order. `area` is worked out on the third line, from the values `width` and `length`
have at that moment. A name has to exist before it is used: move the `const area` line to the
top, and TJS stops with an error saying it cannot access `width` before initialization. On that
line, `width` and `length` do not exist yet. Put it back.

## Choosing names

A name can be made of letters, digits, `_` and `$`, but it cannot start with a digit and
cannot contain spaces. So `width`, `roomWidth` and `width2` are names; `2width` and
`room width` are not. When a name needs several words, the convention is to run them together
and capitalise each word after the first: `roomWidth`, `carpetCost`. That style is called
**camelCase**, for the humps.

A few words belong to the language itself, such as `const` (and `let`, coming up next), and
cannot be used as names. Try `const const = 1` and TJS reports an error at the second `const`:
it was expecting a name and found a word of its own.

Capital letters matter. `width` and `Width` are two different names, and it is a common
mistake to make one and use the other.

Choose names that say what the value **means**, not what kind of value it is. `area` tells a
reader something; `number` or `x` tells them almost nothing. You write a name once and read it
dozens of times, so a few extra letters are always worth it.

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

`score = score + 10` reads "set `score` to what `score` was, plus 10". That `=` is not the `=`
of arithmetic. In maths, `x = x + 10` is a contradiction. In a program it is an instruction,
"put this value in that name", and it is read right to left: work out the right-hand side,
then store it under the name on the left.

Changing a name by adding to it is so common that it has a shorthand: `score += 10` means
exactly `score = score + 10`. There are `-=`, `*=` and `/=` as well. Rewrite the example with
`+=` and check that the test still passes.

Use `const` unless the name really needs to change. When a reader sees `const`, they know at
a glance that the value stays put.

A name is not a formula that keeps updating; it is a label stuck on a value. This example
shows it:

```tjs:inline {"view": "code"}
let width = 6
const area = width * 7
width = 10

preview.append(`width is now ${width}, but area is still ${area}.`)

test 'area kept the value it was given' {
  expect(width).toBe(10)
  expect(area).toBe(42)
}
```

`area` was worked out when `width` was 6. Changing `width` afterwards does not reach back and
change `area`.

## When a name goes wrong

Two mistakes with names happen to everyone. Try both in the room example.

**A misspelled name.** Change `${area}` in the sentence to `${aera}`. The example stops with an
error saying `aera` is not defined. TJS has never heard of `aera`; you only ever named `area`.
When you see "is not defined", look for a typo, or a capital letter where there should not be
one. Put it back.

**Changing a `const`.** Add a line `width = 5` after the first line. The example stops again,
this time with an error about assigning to a constant. `const` is a promise that this name
always means this value, and TJS holds you to it. If a value really needs to change, make it a
`let`.

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
when someone types it into a page. `Number(…)` turns text into a number. Try it here:

```tjs:inline {"view": "console"}
console.log("Type Number('5'), then Number('five'), then typeof NaN.")
```

`Number('five')` gives `NaN`, which stands for "not a number". Words do not convert. (Oddly,
`typeof NaN` is `number`: it is the number that means "this did not work".)

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

Notice that comparing uses two equals signs. One `=` stores a value in a name; two, `==`, asks a
question. Mixing them up is a classic mistake, and a later chapter,
[Decisions](/decisions/), shows what TJS does about it.

## Nothing at all

Sometimes there is no value. A `let` you have not given a value yet holds `undefined`, which
means "nothing here". `undefined` is a value of its own, not a number, string or boolean.

```tjs:inline {"view": "console"}
console.log('Type let later; later on one line, then typeof undefined.')
```

Type `let later; later` as one line and press Enter: the console shows `undefined`. (Type them
as two separate inputs and the second one says `later` is not defined, because a name you make
at this prompt lasts only for that one input.) Then try `typeof undefined`.

You will meet `undefined` again whenever a program looks for something that is not there, such
as the tenth item of a list that has three (lists come later).

An empty `let` is usually a mistake waiting to happen: later code expects a number or a
string and finds nothing. Give every `let` a starting value, as `score` had.

## Try it

Write each of these in the empty example at the bottom of the page, or edit one of the
examples above. Check your answers with a `test` block like the ones in this chapter.

1. Write a program that names your age, names the current year, works out the year you were
   born, and shows a sentence about it. Add a test that checks the birth year. Then change your
   age and watch the test tell you to update it.
2. A pizza has 8 slices and costs 12. Name both, work out the price of one slice, and show it.
   Test it. (Is the answer what you expected? `/` gives fractions.)
3. Start a `let total = 0`, add three prices to it with `+=`, and test the total.
4. Make `const first = 'Ada'` and `const last = 'Lovelace'`, and build the full name from them
   with a space in between (the space is a string of its own, `' '`). Test that it has 12
   characters.
5. At the console at the top of this chapter, type `typeof 42`, then `typeof '42'`. Before
   you press Enter the second time, predict the answer. Then try `typeof Number('42')`.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
