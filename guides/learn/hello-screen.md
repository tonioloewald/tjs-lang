<!--{"parent": "learn-to-program.md", "order": 1}-->

# Hello, Screen

The first thing worth doing with a program is making something appear. This chapter puts
words on the page, then real headings and paragraphs.

## Words on the page

`preview.append` puts things in the example's box. Give it some text in quotes, and the text
appears:

```tjs:inline {"view": "code"}
preview.append('Hello, screen!')
```

Text in quotes is called a **string** (a string of characters). The quotes are not part of
the text; they tell TJS where the text starts and stops. Single quotes and double quotes both
work.

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

## Joining strings

`+` joins two strings into one:

```tjs:inline {"view": "code"}
const message = 'Hello, ' + 'screen!'
preview.append(message)

test 'joining two strings' {
  expect(message).toBe('Hello, screen!')
}
```

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

Change `'Ada'` to your own name. The page changes, and the test turns red: it still expects
Ada. Change the expected text in the test to match, and it turns green again. You have just
done what programmers do all day: changed a program, and changed the check that says what it
should do.
