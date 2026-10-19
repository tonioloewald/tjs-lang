<!--{"parent": "learn-to-program.md", "order": 10}-->

# A Calculator

Time to build something real: a pocket calculator, with buttons you press and a display that
answers. It is small enough to understand completely, and it is easy to extend: once it works,
you will think of keys to add.

## How a calculator thinks

A simple calculator keeps three facts:

- **X**, the number on the display: what you are typing, or the latest answer.
- **Y**, the number it is holding on to while you type the next one.
- **op**, the operation waiting to happen: `+`, `-`, `×` or `÷`.

Press `1`, `2`: X is 12. Press `+`: the calculator moves 12 into Y, remembers `+`, and waits.
Press `3`: X is 3. Press `=`: it works out Y + X, and X becomes 15. One more fact, **fresh**,
remembers whether the next digit starts a new number (after `+` or `=`) or adds to the one on
the display.

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

- `calculate` does the arithmetic for an operation, with `given` (from Decisions).
- `press` changes the calculator for one key: `C` clears, an operator moves X into Y (first
  finishing any operation already waiting), `=` finishes the waiting one, and anything else is a
  digit. A digit either starts a new number or, as `x * 10 + digit`, adds a digit to the end:
  12 becomes 123.
- `run` presses a whole row of keys, which is what the tests use. `for … of` on a string goes
  through its characters one at a time.

`2+3×4=` gives 20, not 14: like a pocket calculator, it works each operation out when the next
one is pressed. The test says so, so nobody "fixes" it by accident.

## The face

Now give it buttons. The calculator becomes a tosijs model (Responding to the Reader), so its
display can show `calculator.x`, and every button just calls `press`:

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

const { calculator } = tosi({
  calculator: { x: 0, y: 0, op: '', fresh: true },
})

const { div, button } = elements

const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', 'C', '0', '=', '+']

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
```

Press `1`, `2`, `+`, `3`, `=` and watch the small line under the display: Y takes the 12 when
you press `+`, op shows the `+` that is waiting, and op clears when `=` finishes the sum (Y
keeps the last number it held until something replaces it). That is the calculator's whole
mind, on screen.

The buttons never touch the display. `press` changes the model, and everything showing it
follows. This is the same `press` the tests checked: the function does not care whether it is
given a plain object or a model on a page.

## Adding a key

New keys are easy, because each is one more case in `press` and one more button. A square root
works on X straight away, without waiting for `=`:

<!-- tjs-doc: fragment -->
```tjs
// in press, beside the other cases:
'√' {
  calculator.x = Math.sqrt(calculator.x)
  calculator.fresh = true
}
```

Add `'√'` to the list of keys, and to the tests: `run('16√')` should be 4.

## Try it

Pick a key and add it, test first each time:

- **±** changes the sign of X: `run('5±')` is -5.
- **n!** (factorial) multiplies X by every whole number below it: `run('5!')` is 120. You wrote
  this kind of loop in Repetition.
- **xʸ** raises Y to the power of X: `run('2^10=')` is 1024. It is an operator like `+`, so it
  belongs in `calculate` (`**` is the power operator) and in the operator case of `press`.
- **.** (decimal point), the hardest: typing `1`, `.`, `5` should give 1.5. Hint: remember how
  many digits have come after the point.
