<!--{"parent": "learn-to-program.md", "order": 12}-->
<!-- TODO review -->

# A Calculator

Time to build something real: a pocket calculator, with buttons you press and a display that
answers. It uses nearly everything in the book so far: names, functions, tests, decisions,
loops, things with parts, a model on the page, and errors. It is small enough to understand
completely, and once it works you will think of keys to add.

## How a calculator thinks

A simple calculator keeps four facts:

- **X**, the number on the display: what you are typing, or the latest answer.
- **Y**, the number it is holding on to while you type the next one.
- **op**, the operation waiting to happen: `+`, `-`, `×` or `÷`, or nothing.
- **fresh**, true or false: does the next digit start a new number, or go on the end of the
  one on the display? It is the fact people forget, and without it the calculator cannot work.

Press `1`, `2`: X is 12. Press `+`: the calculator moves 12 into Y, remembers `+`, sets fresh
to true, and waits. Press `3`: because fresh is true, the 3 starts a new number, so X is 3, not
123, and fresh becomes false. Press `=`: it works out Y + X, and X becomes 15.

Notice that this section has no code in it. Deciding what a program has to **remember** is
the most important step in writing it, and it is easier to get right in sentences than in
code. Try it with a real calculator, or the one on your phone: press keys, and after each one
say what X, Y, op and fresh are. If you can always say, the plan is complete. Everything below
is that plan, written out for the computer.

## The brain

The calculator's brain is `press`, which takes the calculator and a key, and updates it. It
has a helper, `calculate`, that does the arithmetic, and the tests use a third function, `run`,
that presses a whole row of keys. None of them knows anything about buttons or screens, so they
are easy to test.

The keys `×`, `÷` and, later, `√` and `±` are not on most keyboards. When you write a test that
uses one, copy it from this page and paste it in.

As in every chapter, you can change the code and press ⌘S (Ctrl+S on Windows and Linux) to run
it again. Test results turn green or red, as in Checking Your Work.

```tjs:inline {"view": "code"}
function calculate(op: '+', y: 0.0, x: 0.0) {
  given op {
    '+' { return y + x }
    '-' { return y - x }
    '×' { return y * x }
    '÷' { return y / x }
  } else {
    return x
  }
}

function press(calculator: { x: 0.0, y: 0.0, op: '', fresh: true }, key: '7') {
  given key {
    'C' {
      calculator.x = 0
      calculator.y = 0
      calculator.op = ''
      calculator.fresh = true
    }
    '+', '-', '×', '÷' {
      if (calculator.op && !calculator.fresh) {
        calculator.x = calculate(calculator.op, calculator.y, calculator.x)
      }
      calculator.y = calculator.x
      calculator.op = key
      calculator.fresh = true
    }
    '=' {
      if (calculator.op) {
        calculator.x = calculate(calculator.op, calculator.y, calculator.x)
        calculator.op = ''
        calculator.fresh = true
      }
    }
  } else {
    const digit = Number(key)
    if (calculator.fresh) {
      calculator.x = digit
      calculator.fresh = false
    } else {
      calculator.x = calculator.x * 10 + digit
    }
  }
}

function run(keys: '12+3=') {
  const calculator = { x: 0, y: 0, op: '', fresh: true }
  for (const key of keys) {
    press(calculator, key)
  }
  return calculator.x
}

preview.append(`12 + 3 = ${run('12+3=')}`)

test 'typing a number' {
  expect(run('123')).toBe(123)
}

test 'one operation' {
  expect(run('12+3=')).toBe(15)
  expect(run('7×6=')).toBe(42)
  expect(run('1÷4=')).toBe(0.25)
  expect(run('3-5=')).toBe(-2)
}

test 'each operator finishes the one before' {
  expect(run('2+3×4=')).toBe(20)
}

test 'clear starts over' {
  expect(run('12+3C5=')).toBe(5)
}

test 'press changes the calculator it is given' {
  const mine = { x: 0, y: 0, op: '', fresh: true }
  press(mine, '5')
  press(mine, '2')
  expect(mine.x).toBe(52)
}

test 'a calculator with the wrong parts is refused' {
  const wrong = press({ x: '12', y: 0, op: '', fresh: true }, '3')
  expect(wrong instanceof Error).toBe(true)
  expect(wrong.message).toContain('press.calculator.x')
  const missing = press({ x: 12, y: 0, op: '' }, '3')
  expect(missing instanceof Error).toBe(true)
  expect(missing.message).toContain('press.calculator.fresh')
}
```

- `calculate` does the arithmetic for an operation, with `given` (from Decisions). An `op` it
  does not know gives back X unchanged.
- `press` changes the calculator for one key: `C` clears, an operator moves X into Y (first
  finishing any operation already waiting), `=` finishes the waiting one, and anything else is a
  digit. One arm of `given` can list several keys, separated by commas, as in Decisions: the
  `'+', '-', '×', '÷'` arm handles all four operators.
- `if (calculator.op)` asks whether an operation is waiting. An empty string `''` counts as
  no, and any other string counts as yes. `calculator.op && !calculator.fresh` uses `&&` (and)
  and `!` (not) from Decisions: an operation is waiting, and a number has been typed since.
- `Number(key)` turns the text `'7'` into the number 7. A digit either starts a new number or,
  as `x * 10 + digit`, adds a digit to the end: 12 becomes 123.
- `run` presses a whole row of keys, which is what the tests use. `for … of` on a string goes
  through its characters one at a time.

`press` gives nothing back. It changes the object it is given. When `run` calls
`press(calculator, key)`, `press` does not get a copy: `run` and `press` are looking at the
same object. So after the loop, `run` reads `calculator.x` and finds the answer `press` put
there. The test 'press changes the calculator it is given' shows the same thing with an object
called `mine`: after pressing `5` and `2`, `mine.x` is 52.

`2+3×4=` gives 20, not 14: like a pocket calculator, it works each operation out when the next
one is pressed. The test says so, so nobody "fixes" it by accident.

## The example on `press`

Look at the first line of `press` again:

<!-- tjs-doc: fragment -->
```tjs:static
function press(calculator: { x: 0.0, y: 0.0, op: '', fresh: true }, key: '7') {
```

The example for `calculator` is a list of the calculator's facts: two numbers, a string and a
true-or-false. It is the plan from the top of this chapter, written where TJS can check it.
`0.0` means "any number, decimals allowed", so the whole number 0 that `run` starts with fits
it, and so does 0.25.

Hand `press` an object that is missing `fresh`, or one where `x` is the text `'12'` instead of
the number 12, and the call is refused: `press` gives back an error, as in When Things Go
Wrong, whose message includes the part that was wrong (`press.calculator.x`,
`press.calculator.fresh`). The last test in the brain example does exactly that.

When you add a fact (the decimal-point exercise needs one), add it to the example too. From
then on, every call to `press` with a calculator that lacks the new fact is refused. TJS does
not list the places that build one; you find them when they are used. In `run`, the tests go
red. On the finished calculator below, a refused press simply does nothing, because the button
ignores what `press` gives back, so a button that has stopped working is the sign to look for.

## Adding a key, test first

New keys are easy, because each is one more case in `press`. Here is what one looks like. A
square root works on X straight away, without waiting for `=`:

<!-- tjs-doc: fragment -->
```tjs:static
// in press, beside the other cases:
'√' {
  calculator.x = Math.sqrt(calculator.x)
  calculator.fresh = true
}
```

It sets `fresh`, because after `√` the display shows an answer, and the next digit should
start a new number. You don't need to type this one in: the finished calculator below has it.

Here is the whole method, worked through for one more key: **±**, which changes the sign of
X, so that `5` becomes `-5`.

**1. Write the test.** Before touching `press`, say what the new key should do. In the brain
example above, add a check to the tests:

<!-- tjs-doc: fragment -->
```tjs:static
test 'plus-minus' {
  expect(run('5±')).toBe(-5)
}
```

**2. Watch it fail, and read why.** Run it, and the new test turns red. You might expect a
message saying `±` is an unknown key. Instead it reads something like:

```text
'plus-minus' — Expected -5 but got NaN
```

NaN means "not a number". `press` has no case for `±`, so the key
falls through to the `else` branch, which treats every key it does not recognise as a digit.
`Number('±')` is NaN, and `5 * 10 + NaN` is NaN. The failing test has already taught you
something about the program: unknown keys are not refused, they quietly turn the display into
nonsense. (One of the exercises fixes that.) The example on `press` does not catch the NaN
either, because JavaScript counts NaN as a number; more on that below.

**3. Make it pass.** Add the smallest case that does the job:

<!-- tjs-doc: fragment -->
```tjs:static
'±' {
  calculator.x = -calculator.x
}
```

Unlike `√`, it does not set `fresh`: on a pocket calculator you can press ± halfway through
typing a number.

**4. Run every test, not just the new one.** A new case can break an old one. Press ⌘S and
check that every test is green, not only 'plus-minus'. If they are, the key is done, and the
brain example now has one new case, `±`, and one new test.

## The finished calculator

Now give it a face. The calculator becomes a tosijs model, as in Responding to the Reader: an
object the page watches, so whatever shows it updates when it changes. The display shows
`calculator.x`, and every button calls `press`.

This example is your workbench for the exercises: add a key here, test first, and press it
when the tests pass. Compared with the brain above, what is new is:

- the `√` and `±` cases in `press` (marked `// new`),
- `: 15` on the first line of `run`,
- everything after `run`: the model, the keys and the face.

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

function calculate(op: '+', y: 0.0, x: 0.0) {
  given op {
    '+' { return y + x }
    '-' { return y - x }
    '×' { return y * x }
    '÷' { return y / x }
  } else {
    return x
  }
}

function press(calculator: { x: 0.0, y: 0.0, op: '', fresh: true }, key: '7') {
  given key {
    'C' {
      calculator.x = 0
      calculator.y = 0
      calculator.op = ''
      calculator.fresh = true
    }
    '+', '-', '×', '÷' {
      if (calculator.op && !calculator.fresh) {
        calculator.x = calculate(calculator.op, calculator.y, calculator.x)
      }
      calculator.y = calculator.x
      calculator.op = key
      calculator.fresh = true
    }
    '=' {
      if (calculator.op) {
        calculator.x = calculate(calculator.op, calculator.y, calculator.x)
        calculator.op = ''
        calculator.fresh = true
      }
    }
    '√' { // new
      calculator.x = Math.sqrt(calculator.x)
      calculator.fresh = true
    }
    '±' { // new
      calculator.x = -calculator.x
    }
  } else {
    const digit = Number(key)
    if (calculator.fresh) {
      calculator.x = digit
      calculator.fresh = false
    } else {
      calculator.x = calculator.x * 10 + digit
    }
  }
}

function run(keys: '12+3='): 15 {
  const calculator = { x: 0, y: 0, op: '', fresh: true }
  for (const key of keys) {
    press(calculator, key)
  }
  return calculator.x
}

const { calculator } = tosi({
  calculator: { x: 0, y: 0, op: '', fresh: true },
})

const { div, button } = elements

const keys = [
  'C', '±', '√', '÷',
  '7', '8', '9', '×',
  '4', '5', '6', '-',
  '1', '2', '3', '+',
  '0', '=',
]

preview.append(
  div(
    { style: { fontSize: '2em', textAlign: 'right', padding: '0.25em', background: '#eee' } },
    calculator.x
  ),
  div(
    { style: { fontSize: '0.8em', color: 'gray' } },
    'Y: ',
    calculator.y,
    '   op: ',
    calculator.op
  ),
  div(
    { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 3em)', gap: '4px' } },
    ...keys.map((key) => button({ onClick: () => press(calculator, key) }, key))
  )
)

test 'the old keys still work' {
  expect(run('123')).toBe(123)
  expect(run('1÷4=')).toBe(0.25)
  expect(run('2+3×4=')).toBe(20)
  expect(run('12+3C5=')).toBe(5)
}

test 'square root' {
  expect(run('16√')).toBe(4)
  expect(run('9√+1=')).toBe(4)
}

test 'plus-minus' {
  expect(run('5±')).toBe(-5)
  expect(run('5±±')).toBe(5)
  expect(run('3±+8=')).toBe(5)
}
```

The face uses only things from Responding to the Reader: `import` brings in `elements` and
`tosi`, `const { … } =` takes named parts out of an object, `keys.map((key) => button(…))`
makes one button per key, `...` spreads that list of buttons into the `div`, and
`onClick: () => press(calculator, key)` is the function each button runs when clicked. The
`style` objects set how things look, as CSS does.

Press `1`, `2`, `+`, `3`, `=` and watch the small line under the display: Y takes the 12 when
you press `+`, op shows the `+` that is waiting, and op clears when `=` finishes the sum (Y
keeps the last number it held until something replaces it). That is the calculator's whole
mind, on screen.

The buttons never touch the display. `press` changes the model, and everything showing it
follows. And this is the same `press` the tests check: it does not care whether it is given a
plain object from `run` or a model on a page.

`run` now has a signature example, `run(keys: '12+3='): 15`. The brain's first version did
not have one yet. The `: 15` after the parentheses is a worked example of the answer (Checking
Your Work): TJS calls `run('12+3=')` and checks that it really gives 15. That check runs along
with the tests every time the example runs, and turns red like a test if the answer is wrong,
so the most basic sum stays checked even if you delete every test.

## When the answer makes no sense

Press `1 ÷ 0 =` on the face. The display says `Infinity`. That is JavaScript's answer for
dividing by zero, and it is not wrong, exactly, but it is not what a pocket calculator says
either, and pressing `+ 1 =` afterwards gives Infinity again. Now press `C`, then
`0 ÷ 0 =`: the display says `NaN`, the same "not a number" the unknown `±` key produced
before it had a case. Most calculators show `Error` for both, and wait for `C`.

Notice that the example on `press` did not stop either of them. Infinity and NaN are,
strangely, numbers as far as JavaScript is concerned, so they pass the `0.0` check. The
example checks what **kind** of value X is; whether that value makes sense is up to you.

So should `1 ÷ 0` show Infinity, NaN or `Error`? None of them is right until you decide. That is a large part of programming: the
computer does exactly what the program says, and the program has to say something about every
case, including the ones nobody thought of. When you find one, write down what should happen
as a test, then make the program agree. The last exercise below does that for `1 ÷ 0`.

## Try it

Pick a key and add it at the workbench, test first each time, and add a button for it to
`keys`. Make each key a single character, because `run` types its keys one character at a time:

- **n!** (factorial) multiplies X by every whole number below it: `run('5!')` is 120. You wrote
  this kind of loop in Repetition.
- **Power**: the key is `'^'`, and `run('2^10=')` is 1024, the first number raised to the
  power of the second (calculators often label it xʸ). It is an operator like `+`, so it
  belongs in `calculate` (`**` is the power operator) and in the operator arm of `press`.
- **.** (decimal point), the hardest: typing `1`, `.`, `5` should give 1.5. Hint: remember how
  many digits have come after the point, as a new fact in the calculator. Add it in the example
  on `press`, in `run`, in the `tosi({ calculator: … })` line, and in the `C` case, which has to
  put it back to its starting value. Nothing checks that last one for you: forget it, and the
  next number after `C` still counts digits after the point.

And some bugs to find, each starting with a test:

- What should `5±3` give? On a pocket calculator, typing 3 after -5 makes -53. Write that
  test. It fails: what does it give, and why? (Work out `x * 10 + digit` by hand for x = -5.)
- Make `press` ignore keys it does not know, instead of turning them into NaN. Test that
  `run('12?3')` is 123.

And a larger one: make `1 ÷ 0 =` show an error, in steps.

1. **The test.** Write down what should happen: `run('1÷0=')` gives back an error.
   `expect(run('1÷0=') instanceof Error).toBe(true)` says so.
2. **The error.** In `calculate`, when the operation is `÷` and X is 0, give back
   `Error('cannot divide by zero')`, as `divide` did in When Things Go Wrong. The new test
   passes.
3. **The refusal.** The `=` that made the error works: it stores the error in X. The next key
   is the problem. X is now an error, not a number, and the example on `press` says X must be a
   number, so that press is refused. On the face the button does nothing, because it ignores
   what `press` gives back. A test shows it: make a calculator, press `1`, `÷`, `0`, `=` on it,
   then check that `press(it, '+') instanceof Error` is true. That refusal is TJS keeping your
   plan.
4. **The fix.** In `press`, check the answer with `instanceof Error` before storing it. Keep
   the message as a new fact, `error: ''` (added everywhere a calculator is built, as with the
   decimal point), show it on the display when it is set, and let only `C` clear it.
5. **The decisions.** Decide what every other key should do while the error is showing, and
   test those decisions too.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
