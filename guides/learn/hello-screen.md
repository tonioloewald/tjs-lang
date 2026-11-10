<!--{"parent": "learn-to-program.md", "order": 1}-->
<!-- TODO review -->

# Hello, Screen

The first thing worth doing with a program is making something appear. This chapter puts
words on the page, then real headings and paragraphs.

Why start here? Because a program you cannot see is a program you cannot check. Before a
program can do anything useful it has to be able to tell you what it did, and the simplest way
is to put it on the screen.

## Words on the page

As in the first chapter, every example here is live: you can edit the code, and the page runs
your new version as you type. `preview` is the box the example draws in, and
`preview.append` puts things in it. Give it some text in quotes, and the text appears:

```tjs:inline {"view": "code"}
preview.append('Hello, screen!')
```

Text in quotes is called a **string** (a string of characters). The quotes are not part of
the text; they tell TJS where the text starts and stops. Single quotes and double quotes both
work.

Read the line as an instruction: "`preview`, `append` this string". The dot joins a thing to
something it can do, and the parentheses hold what you are handing it. You will see this
shape, `thing.action(something)`, all through this book.

## When the quotes go wrong

Quotes are the first thing beginners get wrong, so try getting them wrong on purpose. In the
example above, delete both quote marks, so the line reads `preview.append(Hello, screen!)`.
The example stops running and shows an error. Without quotes, TJS does not see text: it sees
the words `Hello` and `screen` as **names**, words a program uses to stand for something it
has been told about (the next chapter is about them). It sees the `!` as punctuation in the
wrong place, and it cannot make sense of the line. Put the quotes back.

What if the text itself contains a quote mark, like *it's*? A single quote would end the
string early. Use the other kind of quote around it:

```tjs:inline {"view": "code"}
preview.append("It's a good day to write a program.")
preview.append(' She said "hello" and waved.')
```

Double quotes around text with an apostrophe; single quotes around text with double quotes.
Change the first line to use single quotes all the way round and see what happens. The example
reports an error, marked at the apostrophe: the string ended there, and TJS cannot make sense
of the `s a good day…` that follows it.

## Several things, in order

You saw in the first chapter that a program runs its lines in order, from the top down. Each
`preview.append` puts its text straight after what is already there, on the same line, not on
a new one. That is why `' She said'` above starts with a space: without it, the second
sentence would run into the first.

You can also hand `append` several things at once, separated by commas:

```tjs:inline {"view": "code"}
// A line starting with two slashes is a comment.
// The computer ignores it; it is a note for people reading the program.
preview.append('One, ')
preview.append('two, ')
preview.append('three, ', 'four, ', 'five.')
```

The lines starting with `//` are **comments**. TJS skips them entirely. Programmers use them to
explain why the code is the way it is, to whoever reads it next, which is often themselves a
month later. Write `// my first comment` on a line of its own and notice that nothing changes.

## Building blocks

A web page is made of pieces called **elements**: headings, paragraphs, buttons, pictures.
A library called `tosijs` can build them for you. You will see the first two lines below at the
top of many examples.

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { h1, p } = elements

preview.append(
  h1('Hello, screen!'),
  p('This page is a program. Change the words and watch it change.')
)
```

The first line is called an **import**. It brings in code that someone else wrote and
published as a **library** under a name, here `tosijs`, so your program can use it without
containing it. Real programs start with lines like this all the time. The second line picks
out the two building blocks this example uses, `h1` and `p`, from the collection called
`elements`. When an example needs a different building block, it adds its name to that list.
You do not need to know more about either line yet; copy them as they are.

`h1` makes a big heading (h for heading, 1 for the top level), and `p` makes a paragraph.
They are actions on their own, with no thing and dot in front: `h1('Hello, screen!')` makes a
heading out of what you hand it.

Try adding a second paragraph: put a comma after the first `p(…)` and write another one.

## Blocks inside blocks

Elements can hold other elements, not just text. A paragraph can contain a word in **bold**
(`strong`) or *italics* (`em`), and `h2` makes a smaller, second-level heading. All three
are added to the list on the second line:

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { h1, h2, p, strong, em } = elements

preview.append(
  h1('My first page'),
  h2('About this page'),
  p('Some words are ', strong('strong'), ' and some are ', em('emphasised'), '.'),
  p('Everything else is plain.')
)
```

Look at the paragraph: it is given five things, in order, and shows them in that order. The
spaces at the ends of `'Some words are '` and `' and some are '` matter. Take one out and the
words run together on the page. A computer does not add spaces you did not ask for.

The commas and parentheses have to match up: every `(` needs its `)`. When they do not, the
example reports an error, but often later than the real mistake: on the next line, or at the
very end of the program, because TJS only notices something is missing when it runs into
code that does not fit. Start at the marked line and work upwards. If you get lost, put each
element on its own line, as above, so you can see where each one starts and ends.

## Joining strings

`+` joins two strings into one:

```tjs:inline {"view": "code"}
const message = 'Hello, ' + 'screen!'
preview.append(message)

test 'joining two strings' {
  expect(message).toBe('Hello, screen!')
}
```

`const message = …` gives the joined string a name, `message`, so the next lines can use it.
The next chapter is about names; for now, read `const message =` as "call this `message`".

The `test` at the end is the kind you met in the first chapter. Read
`expect(message).toBe('Hello, screen!')` as "expect `message` to be `Hello, screen!`". The line
under the result says whether it passed; it turns red when the test fails.

Notice the space after the comma in `'Hello, '`. Delete it, and the test turns red: it expected
`Hello, screen!` and got `Hello,screen!`. Joining puts strings end to end, exactly, with nothing
in between. That is a mistake everyone makes, and it is the kind of thing a test is
good at catching, because a missing space is easy to miss by eye.

## Templates

There is a neater way when a string has a name in the middle of it. Use backticks (`` ` ``)
instead of quotes, and put the name inside `${…}`:

```tjs:inline {"view": "code"}
const name = 'Ada'
const message = `Hello, ${name}! Welcome to programming.`
preview.append(message)

test 'the name goes in the middle' {
  expect(message).toBe('Hello, Ada! Welcome to programming.')
}
```

A string in backticks is called a **template**: TJS fills in each `${…}` before using it.
Only backticks do that. Here are the same words with the two kinds of quote:

```tjs:inline {"view": "code"}
const name = 'Ada'
const filled = `Hello, ${name}!`
const notFilled = 'Hello, ${name}!'

preview.append(filled, ' / ', notFilled)

test 'only backticks fill in the gaps' {
  expect(filled).toBe('Hello, Ada!')
  expect(notFilled).toBe('Hello, ${name}!')
}
```

With ordinary quotes the `${name}` is more text, printed exactly as written. If you ever see
`${` on your page, look at the quote marks: one of them should be a backtick. A backtick
slants the other way from an apostrophe. Where it sits depends on your keyboard; if you cannot
find it, copy one from an example.

`${…}` can hold more than a name. Anything that has a **value**, a piece of data such as a
string or a number, works, including a sum. Between two numbers, `+` adds them; between two
strings, it joins them. Add this line at the end of the example above, the one with `filled`
and `notFilled`:

```javascript
preview.append(` Two and two make ${2 + 2}.`)
```

The page now ends with `Two and two make 4.`

Now go back to the first template example and change `'Ada'` to your own name. The page
changes, and the test under it turns red: it still expects Ada. Change the expected text in
the test to match, and it turns green again. You have done what programmers do all day:
changed a program, and changed the check that says what it should do.

## Try it

1. In the building-blocks example, first add `h2` and `strong` to the list in
   `const { h1, p } = elements`. Then add an `h2` subheading between the heading and the
   paragraph, and a third paragraph with one word in `strong`.
2. Make a template that says `My name is …, and I am learning to program.` with your name
   filled in from a `const`, and a test that checks the whole sentence.
3. Join three strings with `+` to make `Ready, steady, go!`, and test it. Get the spaces right
   on the first try, then check whether the test agrees.
4. Break an example on purpose in three different ways: a missing quote, a missing `)`, and a
   missing comma between two elements. Each time, note which line the error marks and how far
   it is from the real mistake, then fix it.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
