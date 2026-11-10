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

<!-- TODO review -->

## What a program is

A recipe is a list of instructions, too, but a recipe trusts its cook. "Season to taste" works
because the cook knows what tasting is. A computer knows nothing of the kind. It does exactly
what it is told, in exactly the order it is told, and nothing else: no guessing what you
meant, no skipping the step that is obviously a typo.

That sounds like a weakness, and it is the whole point. Because a computer follows
instructions exactly, a program that works once works the millionth time, and a program that
is wrong is wrong in the same way every time, so you can find out why. Most of learning to
program is learning to say precisely what you mean.

## Running an example

Here is a complete program. It puts a greeting on the page:

```tjs:inline {"view": "code"}
preview.append('Hello, world!')
```

The program is on the right and what it did is on the left. On a narrow device, such as a
phone, what it did appears above the program instead. `preview` is the box the program draws
in, and `append` adds something to it.

Now change it. Replace `world` with your own name. The page runs your new version as you
type, and the greeting changes. You cannot break anything: if you make a mistake, the
example tells you what went wrong, and you can fix it or undo it.

<!-- TODO review -->

## One step after another

A program with more than one instruction runs them in order, from the top down:

```tjs:inline {"view": "code"}
preview.append('First this, ')
preview.append('then this, ')
preview.append('and last of all, this.')
```

Each line is one instruction. Swap the first and last lines and run it in your head before
you look: what will the page say? Then look. Being able to predict what a program will do,
before it does it, is the skill this book is building.

<!-- TODO review -->

## Breaking things on purpose

Mistakes are not a disaster here; they are a lesson you can have whenever you like. Try
this in the example above:

1. Delete the closing quote after `this, ` on the second line. The program no longer makes
   sense, so it does not run. Instead you see a message saying what TJS could not understand,
   and on which line.
2. Put the quote back. Everything works again.
3. Now change `preview` to `Preview`, with a capital P. This time the program makes sense as
   a sentence, but there is no box called `Preview`: capital and small letters are different
   to a computer. The message says that `Preview` is not defined.

Every mistake you will meet is one of two kinds: the program does not make sense, so it
cannot run at all, or it runs and does the wrong thing. TJS is good at telling you about both,
and this book shows you its messages as you go, so they are familiar by the time you need
them.

If a change goes badly and you cannot see how to fix it, use the example's **undo** button,
or its menu, which can put the original back.

## Asking questions with the console

Some examples open with a **console** instead of a picture. A console answers questions: type
something at its prompt, press Enter, and it shows you the value.

```tjs:inline {"view": "console"}
console.log('The console shows what a program tells it.')
```

Try typing `2 + 3` at the prompt, then `'Hello, ' + 'world'`. You have just run two tiny
programs of your own.

<!-- TODO review -->

The console is the quickest way to answer "what does this do?". When you are not sure what a
piece of a program means, type it at a console and look. Type `10 - 2 - 3`, then
`10 - (2 - 3)`, and see whether the parentheses change the answer.

`console.log(…)` is how a program writes to the console itself, while it runs. You will use it
later to look inside programs that are doing something you did not expect.

## Checking your answers

Most examples end with a **test**: a few lines that check the program did what it should.

```tjs:inline {"view": "code"}
const greeting = 'Hello, world!'
preview.append(greeting)

test 'the greeting says hello' {
  expect(greeting).toBe('Hello, world!')
}
```

The line under the result says how the tests did: when they pass, how many passed. Change
the greeting and the test fails: the line turns red and says what it expected and what it
got. Click it for the details. That is the whole loop of this book: run something, change
it, and let the tests tell you whether you understand what happened.

<!-- TODO review -->

You do not need to understand how a test works yet; a later chapter, Checking Your Work, is
about writing your own. For now, read `expect(greeting).toBe('Hello, world!')` as a sentence:
"expect the greeting to be `Hello, world!`". When a test fails, the program did something
other than what its author said it should. Sometimes the program is wrong, and sometimes
the test is: deciding which is part of the job.

<!-- TODO review -->

## How each chapter works

Every chapter follows the same pattern:

- It starts with a **problem**: something you might want a program to do, that you cannot do
  yet.
- It builds the answer in **small steps**, each one a live example you can change.
- It shows a **common mistake** and what TJS says about it, so the message is familiar when
  you make the mistake yourself (you will).
- It ends with **Try it**: a few short exercises, done in the examples on the page.

Do the exercises. You can read a whole chapter, nod at every line, and still be unable to
write the program at the end; doing it is what turns "I see" into "I can". If you get stuck,
go back one step, to the last example that made sense, and change one thing at a time.

## Reading code

Code in this book is written in a typewriter-style font, like `preview.append`. Type it
exactly as shown: every letter, comma, bracket and quote mark matters. Two details catch
almost everyone at first:

- **Capital letters matter.** `preview`, `Preview` and `PREVIEW` are three different names.
- **Quote marks must be plain.** Programs use the straight quotes on your keyboard: `'` and
  `"`. Word processors turn them into curly ones, ‘like these’, which a program does not
  understand. If you copy code from a document and it will not run, look at the quotes first.

If you are curious how these live examples work, the
[tosijs-ui live-example documentation](https://ui.tosijs.net) explains the machinery. You do
not need it to learn to program.

<!-- TODO review -->

## Try it

1. In the first example, make the program say hello to two people, with two separate
   `preview.append(…)` lines.
2. At a console, find out what `7 * 6` is, then what `'7' + '6'` is. They are different. Can
   you guess why? (The next two chapters explain it.)
3. In the test example, change the greeting to `'Hello, TJS!'`, watch the test fail, then
   change the test so it passes again.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, and press ⌘S (Ctrl+S on Windows and Linux) to run it.
```
