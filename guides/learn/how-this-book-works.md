<!--{"parent": "learn-to-program.md", "order": 0}-->
<!-- TODO review -->

# How This Book Works

A program is a list of instructions for a computer, written in a language precise enough that
the computer can follow it. This book teaches one such language, **TJS**, and it does that
by letting you run programs right here, on the page.

TJS is a version of JavaScript, the language every web browser runs, with extra help for
catching mistakes. Almost everything you learn here works the same way in JavaScript, so
learning TJS is learning JavaScript too.

<!--{ "only": "book" }-->

In this edition the examples are printed listings. Every one of them runs in the online
edition at [tjs.tosijs.net](https://tjs.tosijs.net), where you can edit it and see what
changes. Reading with the online edition open beside you is the best way to use this book.

<!--{ "end": "only" }-->

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

Here is a complete program. It puts a greeting in the **preview**, the box beside it:

```tjs:inline {"view": "code"}
preview.append('Hello, world!')
```

The program is on the right and the preview is on the left. When the page is narrow, as on a
phone, the preview appears above the program instead.

`preview` is the name of that box, and `append` adds something to it. The dot joins the two:
`preview.append` means "the preview's append". The parentheses hold what you give to
`append`, and the quote marks around `Hello, world!` mark it as text to show, rather than as
more instructions. Later chapters explain each of these properly.

Now change it. Replace `world` with your own name, then press ⌘S (Ctrl+S on Windows and
Linux) to run your new version. The greeting in the preview changes.

Nothing you do here can harm your computer or the page. A mistake in a program only produces
a message saying what went wrong, and you can fix it or undo it. Your changes last until you
reload the page; to keep them, choose **Save changes (local)** from the example's menu (the
⋮ button above the code).

## Reading code

Code in this book is written in a typewriter-style font, like `preview.append`. Type it
exactly as shown: every letter, comma, bracket and quote mark matters. Two details catch
almost everyone at first:

- **Capital letters matter.** `preview`, `Preview` and `PREVIEW` are three different names.
- **Quote marks must be plain.** Programs use the straight quotes on your keyboard: `'` and
  `"`. Word processors turn them into curly ones, ‘like these’, which a program does not
  understand. If you copy code from a document and it will not run, look at the quotes first.

Quote marks come in pairs: one opens a piece of text and the other closes it.

## One step after another

A program with more than one instruction runs them in order, from the top down:

```tjs:inline {"view": "code"}
preview.append('First this, ')
preview.append('then this, ')
preview.append('and last of all, this.')
```

Each line is one instruction. Notice the space before each closing quote: without it the
pieces would run together, because `append` adds exactly what is between the quotes and
nothing more.

Before you touch anything, predict what the preview will say if the first and last lines
swap places. Then swap them, run it, and check. Being able to predict what a program will
do, before it does it, is the skill this book is building.

## Breaking things on purpose

Mistakes are not a disaster here; they are a lesson you can have whenever you like. Try
this in the example above:

1. On the second line, delete the `'` just before the closing parenthesis, so the line reads
   `preview.append('then this, )`. Run it. The program no longer makes sense, so it does not
   run. Instead you see a message saying what TJS could not understand, and on which line.
2. Put the quote back. Everything works again.
3. Now change `preview` to `Preview`, with a capital P. This time the program makes sense as
   a sentence, but there is no box called `Preview` (capital letters matter, as above). The
   message says that `Preview` is not defined: the computer has never heard of anything by
   that name. TJS programs run inside your web browser, and the browser picks the exact words:
   some say `Preview is not defined`, others `Can't find variable: Preview`. Both mean the
   same thing.

Mistakes come in two broad kinds. Either the program does not make sense, so it cannot run at
all, or it runs and goes wrong: it stops with a message, as `Preview` did, or it quietly gives
the wrong answer. TJS tells you about the first kind and about many of the second. For the
rest, you tell TJS what should happen, using tests, which you will meet below. A later
chapter, When Things Go Wrong, sorts mistakes more finely. This book shows you TJS's messages
as you go, so they are familiar by the time you need them.

If a change goes badly and you cannot see how to fix it, open the example's menu (the ⋮
button) and choose **Undo**, or press ⌘Z (Ctrl+Z on Windows and Linux). Once you have changed
an example, the same menu has **Revert to original**, which puts it back the way it was.

## Asking questions with the console

Some examples show a **console** instead of the preview. A console answers questions. At the
bottom of it is the prompt, a line starting with `›` where you can type. Type something there,
press Enter, and the console shows you the answer.

```tjs:inline {"view": "console"}
console.log('The console shows what a program tells it.')
```

Try typing `2 + 3` at the prompt, then `'Hello, ' + 'world'`. You have just run two tiny
programs of your own.

The console is the quickest way to answer "what does this do?". When you are not sure what a
piece of a program means, type it at a console and look. Type `10 - 2 - 3`, then
`10 - (2 - 3)`, and see whether the parentheses change the answer.

The example's own program does something different: `console.log(…)` is how a program writes
to the console itself, while it runs. That is where the line already in the console came from.
You do not need `console.log` at the prompt; you will use it later to look inside programs
that are doing something you did not expect.

## Checking your answers

Most examples end with a **test**: a few lines that check the program did what it should.

```tjs:inline {"view": "code"}
const greeting = 'Hello, world!'
preview.append(greeting)

test 'the greeting says hello' {
  expect(greeting).toBe('Hello, world!')
}
```

The first line gives the text a name, `greeting`, so later lines can use the name instead of
repeating the text. That is why `preview.append(greeting)` has no quotes: without quotes,
`greeting` means the name, and the preview shows the text it names. With quotes, `'greeting'`
would be the word greeting itself. Values and Names, two chapters on, is about this.

A line under the preview says how the tests did. When they all pass it reads
`✓ 1/1 test passed`. Change the text on the first line and run it again: the line turns red,
starts with `✗`, and says what the test expected and what it got. Click it for the details.
That is the whole loop of this book: run something, change it, and let the tests tell you
whether you understand what happened.

You do not need to understand how a test works yet; a later chapter, Checking Your Work, is
about writing your own. For now, read `expect(greeting).toBe('Hello, world!')` as a sentence:
"expect the greeting to be `Hello, world!`". When a test fails, the program did something
other than what its author said it should. Sometimes the program is wrong, and sometimes
the test is: deciding which is part of the job.

## How each chapter works

This first chapter is the exception: it only shows you around. Every chapter after it
follows the same pattern:

- It starts with a **problem**: something you might want a program to do, that you cannot do
  yet.
- It builds the answer in **small steps**, each one a live example you can change.
- It shows a **common mistake** and what TJS says about it, so the message is familiar when
  you make the mistake yourself (you will).
- It ends with **Try it**: a few short exercises, done in the examples on the page.

Do the exercises. You can read a whole chapter, nod at every line, and still be unable to
write the program at the end; doing it is what turns "I see" into "I can". If you get stuck,
go back one step, to the last example that made sense, and change one thing at a time.

If you are curious how these live examples work, the
[tosijs-ui live-example documentation](https://ui.tosijs.net) explains the machinery. You do
not need it to learn to program.

## Try it

1. In the first example, make the program say hello to two people, with two separate
   `preview.append(…)` lines. Do the two greetings run together? Look back at One step after
   another for how to keep them apart.
2. At a console, find out what `7 * 6` is, then what `'7' + '6'` is. They are different. Can
   you guess why? (The next chapters explain it.)
3. In the test example, change the greeting to `'Hello, TJS!'`, watch the test fail, then
   change the test so it passes again.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
