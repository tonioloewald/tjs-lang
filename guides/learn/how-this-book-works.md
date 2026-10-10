<!--{"parent": "learn-to-program.md", "order": 0}-->

# How This Book Works

A program is a list of instructions for a computer, written in a language precise enough that
the computer can follow it. This book teaches one such language, **TJS**, and it does that
by letting you run programs right here, on the page.

<!--{ "only": "book" }-->

In this edition the examples are printed listings. Every one of them runs in the online
edition at [tjs.tosijs.net](https://tjs.tosijs.net), where you can edit it and see what
changes. Reading with the online edition open beside you is the best way to use this book.

<!--{ "end": "only" }-->

## Running an example

Here is a complete program. It puts a greeting on the page:

```tjs:inline {"view": "code"}
preview.append('Hello, world!')
```

The right side is the program; the left side is what it did. `preview` is the box the
program draws in, and `append` adds something to it.

Now change it. Replace `world` with your own name. The page runs your new version as you
type, and the greeting changes. You cannot break anything: if you make a mistake, the
example tells you what went wrong, and you can fix it or undo it.

## Asking questions with the console

Some examples open with a **console** instead of a picture. A console answers questions: type
something at its prompt, press Enter, and it shows you the value.

```tjs:inline {"view": "console"}
console.log('The console shows what a program tells it.')
```

Try typing `2 + 3` at the prompt, then `'Hello, ' + 'world'`. You have just run two tiny
programs of your own.

## Checking your answers

Most examples end with a **test**: a few lines that check the program did what it should.

```tjs:inline {"view": "code"}
const greeting = 'Hello, world!'
preview.append(greeting)

test 'the greeting says hello' {
  expect(greeting).toBe('Hello, world!')
}
```

The last tab above the program, **tjs tests**, shows the result: a passing test is green.
Change the greeting and the test fails, in red, and says what it expected and what it got. That is the whole loop of this book: run something, change
it, and let the tests tell you whether you understand what happened.

If you are curious how these live examples work, the
[tosijs-ui live-example documentation](https://ui.tosijs.net) explains the machinery. You do
not need it to learn to program.
