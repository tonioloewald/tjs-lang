<!--{"parent": "learn-to-program.md", "order": 12}-->
<!-- TODO review -->

# A Calculator

Time to build something real: a pocket calculator, with buttons you press and a display that
answers. It uses nearly everything in the book so far: names, functions, tests, decisions,
loops, things with parts, a model on the page, and errors. It is small enough to understand
completely, and once it works you will think of keys to add.

## How a calculator thinks

A simple calculator keeps three facts:

- **X**, the number on the display: what you are typing, or the latest answer.
- **Y**, the number it is holding on to while you type the next one.
- **op**, the operation waiting to happen: `+`, `-`, `×` or `÷`.

Press `1`, `2`: X is 12. Press `+`: the calculator moves 12 into Y, remembers `+`, and waits.
Press `3`: X is 3. Press `=`: it works out Y + X, and X becomes 15. One more fact, **fresh**,
remembers whether the next digit starts a new number (after `+` or `=`) or adds to the one on
the display.

Notice that this section has no code in it. Deciding what a program has to **remember** is
the most important step in writing it, and it is easier to get right in sentences than in
code. Try it with a real calculator, or the one on your phone: press keys, and after each one
say what X, Y, op and fresh are. If you can always say, the plan is complete. Everything below
is that plan, written out for the computer.

## The brain

The calculator's brain is one function, `press`, that takes the calculator and a key, and
updates it. It knows nothing about buttons or screens, so it is easy to test:

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
```

- `calculate` does the arithmetic for an operation, with `given` (from Decisions). An `op` it
  does not know gives back X unchanged.
- `press` changes the calculator for one key: `C` clears, an operator moves X into Y (first
  finishing any operation already waiting), `=` finishes the waiting one, and anything else is a
  digit. `Number(key)` turns the text `'7'` into the number 7. A digit either starts a new
  number or, as `x * 10 + digit`, adds a digit to the end: 12 becomes 123.
- `run` presses a whole row of keys, which is what the tests use. `for … of` on a string goes
  through its characters one at a time.

`press` gives nothing back. It changes the object it is given, and everyone holding that
object sees the change. That is why `run` can make one calculator, press keys on it, and then
read `calculator.x`.

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
Hand `press` an object that is missing `fresh`, or one where `x` is the text `'12'` instead
of the number 12, and the call is refused with a message naming the part
(`press.calculator.fresh`, `press.calculator.x`), as in When Things Go Wrong. When you add a
fact (the decimal-point exercise needs one), add it to the example too, and TJS will tell you
every place that builds a calculator without it.

## Adding a key, test first

New keys are easy, because each is one more case in `press`. A square root works on X
straight away, without waiting for `=`:

<!-- tjs-doc: fragment -->
```tjs:static
// in press, beside the other cases:
'√' {
  calculator.x = Math.sqrt(calculator.x)
  calculator.fresh = true
}
```

It sets `fresh`, because after `√` the display shows an answer, and the next digit should
start a new number.

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

**2. Watch it fail, and read why.** It fails, and not in the way you might guess: it says it
expected -5 and got `NaN`. NaN means "not a number". `press` has no case for `±`, so the key
falls through to the `else` branch, which treats every key it does not recognise as a digit.
`Number('±')` is NaN, and `5 * 10 + NaN` is NaN. The failing test has already taught you
something about the program: unknown keys are not refused, they quietly turn the display into
nonsense. (One of the exercises fixes that.)

**3. Make it pass.** Add the smallest case that does the job:

<!-- tjs-doc: fragment -->
```tjs:static
'±' {
  calculator.x = -calculator.x
}
```

Unlike `√`, it does not set `fresh`: on a pocket calculator you can press ± halfway through
typing a number.

**4. Run every test, not just the new one.** A new case can break an old one. Here they all
still pass, so the key is done.

## The finished calculator

Now give it a face. The calculator becomes a tosijs model (Responding to the Reader), so the
display can show `calculator.x`, and every button calls `press`. This example also holds the
brain with both new keys and all the tests, so it is your workbench for the exercises: add a
key here, test first, and press it when the tests pass.

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
    '√' {
      calculator.x = Math.sqrt(calculator.x)
      calculator.fresh = true
    }
    '±' {
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

Press `1`, `2`, `+`, `3`, `=` and watch the small line under the display: Y takes the 12 when
you press `+`, op shows the `+` that is waiting, and op clears when `=` finishes the sum (Y
keeps the last number it held until something replaces it). That is the calculator's whole
mind, on screen.

The buttons never touch the display. `press` changes the model, and everything showing it
follows. And this is the same `press` the tests check: it does not care whether it is given a
plain object from `run` or a model on a page.

`run` now has a signature example too, `run(keys: '12+3='): 15`. The `: 15` after the
parentheses is a worked example of the answer (Checking Your Work): TJS calls `run('12+3=')`
and checks that it really gives 15. So the most basic sum is checked before anything else,
every time, even if you delete every test.

## When the answer is not a number

Press `1 ÷ 0 =` on the face. The display says `Infinity`. That is JavaScript's answer for
dividing by zero, and it is not wrong, exactly, but it is not what a pocket calculator says
either, and pressing `+ 1 =` afterwards gives Infinity again. Now press `C`, then
`0 ÷ 0 =`: the display says `NaN`, the same "not a number" the unknown `±` key produced
before it had a case. Most calculators show `Error` for both, and wait for `C`.

Notice that the example on `press` did not stop either of them. Infinity and NaN are,
strangely, numbers as far as JavaScript is concerned, so they pass the `0.0` check. The
example checks what **kind** of value X is; whether that value makes sense is up to you.

Which answer is right? Neither, until you decide. That is a large part of programming: the
computer does exactly what the program says, and the program has to say something about every
case, including the ones nobody thought of. When you find one, write down what should happen
as a test, then make the program agree. The last exercise below does that for `1 ÷ 0`.

## Try it

Pick a key and add it at the workbench, test first each time, and add a button for it to
`keys`:

- **n!** (factorial) multiplies X by every whole number below it: `run('5!')` is 120. You wrote
  this kind of loop in Repetition.
- **xʸ** raises Y to the power of X: `run('2^10=')` is 1024. It is an operator like `+`, so it
  belongs in `calculate` (`**` is the power operator) and in the operator case of `press`.
- **.** (decimal point), the hardest: typing `1`, `.`, `5` should give 1.5. Hint: remember how
  many digits have come after the point, as a new fact in the calculator (and in the example
  on `press`, and in the two places that build a calculator).

And some bugs to find, each starting with a test:

- What should `5±3` give? On a pocket calculator, typing 3 after -5 makes -53. Write that
  test. It fails: what does it give, and why? (Work out `x * 10 + digit` by hand for x = -5.)
- Make `press` ignore keys it does not know, instead of turning them into NaN. Test that
  `run('12?3')` is 123.
- Make `1 ÷ 0 =` show an error. Start in `calculate`: when the operation is `÷` and X is 0,
  give back `Error('cannot divide by zero')`, as `divide` did in When Things Go Wrong. Then
  try it: the first press after the error is refused, because X is now an error, not a number,
  and the example on `press` says X must be a number. That refusal is TJS keeping your plan.
  To make it work, `press` must check the answer with `instanceof Error` before storing it,
  and keep the message as a new fact, `error: ''`, which the display shows when it is set and
  only `C` clears. Decide what every other key should do while the error is showing, and test
  those decisions too.
- Make `1÷0=` show an error. One way: give the calculator an `error` fact that the display
  shows when it is set, and that only `C` clears. Decide what every other key should do while
  it is showing, and test those decisions too.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, and press ⌘S (Ctrl+S on Windows and Linux) to run it.
```
