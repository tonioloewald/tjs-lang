<!--{"parent": "learn-to-program.md", "order": 1}-->

# Hello, Screen

The first thing worth doing with a program is making something appear. This chapter puts
words on the page, then real headings and paragraphs.

<!-- TODO review -->

Why start here? Because a program you cannot see is a program you cannot check. Before a
program can do anything useful it has to be able to tell you what it did, and the simplest way
is to put it on the screen.

## Words on the page

`preview.append` puts things in the example's box. Give it some text in quotes, and the text
appears:

```tjs:inline {"view": "code"}
preview.append('Hello, screen!')
```

Text in quotes is called a **string** (a string of characters). The quotes are not part of
the text; they tell TJS where the text starts and stops. Single quotes and double quotes both
work.

<!-- TODO review -->

Read the line as an instruction: "`preview`, `append` this string". The dot joins a thing to
something it can do, and the parentheses hold what you are handing it. You will see this
shape, `thing.action(something)`, all through this book.

<!-- TODO review -->

## When the quotes go wrong

Quotes are the first thing beginners get wrong, so try getting them wrong on purpose. In the
example above, delete both quote marks, so the line reads `preview.append(Hello, screen!)`.
The example stops running and shows an error. Without quotes, TJS does not see text: it sees
the words `Hello` and `screen` as **names** of things, and the `!` as punctuation in the wrong
place, and it cannot make sense of the line. Put the quotes back.

What if the text itself contains a quote mark, like *it's*? A single quote would end the
string early. Use the other kind of quote around it:

```tjs:inline {"view": "code"}
preview.append("It's a good day to write a program.")
preview.append(' She said "hello" and waved.')
```

Double quotes around text with an apostrophe; single quotes around text with double quotes.
Change the first line to use single quotes all the way round and see what happens.

<!-- TODO review -->

## Several things, in order

Each `preview.append` adds to the end of what is already there, and the lines run from the top
down. You can also hand `append` several things at once, separated by commas:

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
TJS can build them for you. The first line below fetches the building blocks; you will see it
at the top of many examples.

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { h1, p } = elements

preview.append(
  h1('Hello, screen!'),
  p('This page is a program. Change the words and watch it change.')
)
```

`h1` makes a big heading, and `p` makes a paragraph. Try adding a second paragraph: put a
comma after the first `p(…)` and write another one.

<!-- TODO review -->

You do not need to understand the first two lines yet. Read them as "get `h1` and `p` from
the box of building blocks called `tosijs`". When an example needs a different building block,
it asks for it by name in the same way.

<!-- TODO review -->

## Blocks inside blocks

Elements can hold other elements, not just text. A paragraph can contain a word in **bold**
(`strong`) or *italics* (`em`), and a heading can be smaller (`h2`):

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
example reports an error, usually on the line after the real mistake, because that is where
TJS noticed something was missing. If you get lost, put each element on its own line, as
above, so you can see where each one starts and ends.

## Joining strings

`+` joins two strings into one:

```tjs:inline {"view": "code"}
const message = 'Hello, ' + 'screen!'
preview.append(message)

test 'joining two strings' {
  expect(message).toBe('Hello, screen!')
}
```

<!-- TODO review -->

`const message = …` gives the joined string a name, `message`, so the next lines can use it.
The next chapter is about names; for now, read `const message =` as "call this `message`".

Notice the space after the comma in `'Hello, '`. Delete it, and the test turns red: it expected
`Hello, screen!` and got `Hello,screen!`. Joining puts strings end to end, exactly, with nothing
in between. That is a mistake everyone makes, and it is exactly the kind of thing a test is
good at catching, because a missing space is easy to miss by eye.

There is a neater way when a string has a value in the middle of it. Use backticks (`` ` ``)
instead of quotes, and put the value inside `${…}`:

```tjs:inline {"view": "code"}
const name = 'Ada'
const message = `Hello, ${name}! Welcome to programming.`
preview.append(message)

test 'the name goes in the middle' {
  expect(message).toBe('Hello, Ada! Welcome to programming.')
}
```

Change `'Ada'` to your own name. The page changes, and the test line under it turns red: it still expects
Ada. Change the expected text in the test to match, and it turns green again. You have just
done what programmers do all day: changed a program, and changed the check that says what it
should do.

<!-- TODO review -->

## Backticks, not quotes

A string in backticks is called a **template**: TJS fills in each `${…}` before using it. Only
backticks do that. Here are the same words with two different kinds of quote:

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

With ordinary quotes the `${name}` is just more text, printed exactly as written. If you ever
see `${` on your page, look at the quote marks: one of them should be a backtick. On most
keyboards the backtick is at the top left, below Escape.

`${…}` can hold more than a name. Anything that has a value works, including a sum:
`` `Two and two make ${2 + 2}.` `` makes the string `Two and two make 4.` Try it at the end of
the example above.

<!-- TODO review -->

## Try it

1. In the building-blocks example, add an `h2` subheading between the heading and the
   paragraph, then a third paragraph with one word in `strong`.
2. Make a template that says `My name is …, and I am learning to program.` with your name
   filled in from a `const`, and a test that checks the whole sentence.
3. Join three strings with `+` to make `Ready, steady, go!`, and test it. Get the spaces right
   on the first try, then check whether the test agrees.
4. Break an example on purpose in three different ways: a missing quote, a missing `)`, and a
   capital letter in `preview`. Read each message before you fix it.
