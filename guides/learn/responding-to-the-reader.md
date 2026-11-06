<!--{"parent": "learn-to-program.md", "order": 9}-->
<!-- TODO review -->

# Responding to the Reader

Until now your programs have run once and stopped. An interactive program waits: it shows
something, and when the reader clicks or types, it changes. This chapter adds buttons, and a
way of keeping the page in step with your program that needs almost no code.

Every app you have used works this way. A to-do list waits for you to type, a game waits for
you to press a key, a shop waits for you to click "add to basket". The program sets things up,
then hands control to the reader, and runs a little piece of code each time they do something.
Those pieces of code are called **event handlers**: an **event** is something that happened (a
click, a key press), and the handler is the function that responds.

## A button that does something

```tjs:inline {"view": "code"}
import { elements } from 'tosijs'

const { button } = elements

preview.append(
  button({ onClick: () => preview.append(' 👋') }, 'Wave')
)
```

`onClick` is a function the button runs every time it is clicked. Click **Wave** a few times.
The function runs on each click, not once when the program starts: that is what makes a page
interactive.

The `{ onClick: … }` in front of the label is an object (see Things with Parts) of settings
for the button. `() => preview.append(' 👋')` is a function with no parameters, written with
an arrow as in Lists. It is not called here: it is handed to the button, which calls it
later, once per click.

### A common mistake: calling the handler too early

What happens if you write the handler without the `() =>`?

```tjs:static
button({ onClick: preview.append(' 👋') }, 'Wave') // wrong
```

Then `preview.append(' 👋')` runs **immediately**, once, while the button is being made, and
what is handed to the button is its answer, not a function. You see one wave as soon as the
page loads, and clicking does nothing. If a button seems to have fired before anyone touched
it, look for a missing `() =>`.

## A model the page follows

Most interactive programs keep their facts in one place, the **model**, and show them on the
page. tosijs makes that almost free: wrap your facts in `tosi`, put parts of the model on the
page, and from then on changing the model changes the page. You never redraw anything yourself.

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

const { counter } = tosi({ counter: { count: 0 } })

const { div, button, span } = elements

preview.append(
  div(
    'Clicked ',
    span(counter.count),
    ' times. ',
    button({ onClick: () => { counter.count = counter.count + 1 } }, 'Click me'),
    button({ onClick: () => { counter.count = 0 } }, 'Reset')
  )
)
```

- `tosi({ counter: { count: 0 } })` makes the model, and gives back `counter`, a stand-in for
  it that notices changes.
- `span(counter.count)` puts a part of the model on the page. It is not a copy of the number:
  the span keeps showing whatever `counter.count` is.
- `counter.count = counter.count + 1` changes the model. The span follows on its own.

Notice what the buttons do *not* do: they never touch the span. They change the model, and
everything showing it updates. Add a second `span(counter.count)` anywhere and it keeps up
too.

Why is this better than changing the span directly? Because as a program grows, the same fact
turns up in many places: a score in the corner, in the title, on the "game over" screen. If
every button had to remember every place the score is shown, sooner or later one would be
forgotten, and the page would contradict itself. With a model, a button only has to get the
**fact** right. Showing it is someone else's job, done once.

## Many buttons, one function

Buttons that do similar things can share a function, each passing its own value:

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

const { tally } = tosi({ tally: { total: 0 } })

function add(amount: 1) {
  tally.total = tally.total + amount
}

const { div, button, strong } = elements

preview.append(
  div('Total: ', strong(tally.total)),
  div(...[1, 5, 10, 50].map((amount) => button({ onClick: () => add(amount) }, `+${amount}`)))
)
```

The row of buttons is made with `map`, from a list of amounts, the way the planets were in
Lists. Add `100` to the list and a new button appears.

## Typing

Buttons are one way to respond; text boxes are the other. An `input` element makes a box the
reader can type in, and `bindValue` ties it to a part of the model: what the reader types goes
into the model, and anything showing that part follows as they type.

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

const { visitor } = tosi({ visitor: { name: 'Ada' } })

const { h2, input, label } = elements

preview.append(
  label('Your name: ', input({ bindValue: visitor.name })),
  h2('Hello, ', visitor.name, '!')
)
```

Type in the box. The heading changes with every key, and you did not write an event handler:
`bindValue` is a two-way link. The box shows the model, and typing in the box changes the
model, which changes the heading.

## Numbers from a text box

Everything typed into a box arrives as **text**, even when it looks like a number: the
reader types `37`, and the program receives the string `'37'`. Values and Names showed what
goes wrong when text is treated as a number. So before building a temperature converter,
write the rule that turns what the reader typed into an answer, and test it on its own:

```tjs:inline {"view": "code"}
function fahrenheit(celsius: 100.0): 212.0 {
  return celsius * 9 / 5 + 32
}

function convert(text: '100'): 212.0 {
  return fahrenheit(Number(text))
}

preview.append(`'37' typed in a box is ${convert('37')} °F`)

test 'convert turns typed text into degrees Fahrenheit' {
  expect(convert('0')).toBe(32)
  expect(convert('-40')).toBe(-40)
}
```

- `Number(text)` turns the text `'100'` into the number `100`.
- `convert` takes text (its example is `'100'`, a string) and gives back a number. The
  arithmetic is in `fahrenheit`, which has its own signature example, as in Checking Your
  Work.

Now make the classic mistake. In `convert`, change `fahrenheit(Number(text))` to
`fahrenheit(text)`, handing over the text without turning it into a number. `convert`'s own
example fails at once, because `convert('100')` no longer gives 212. It gives an error from
`fahrenheit`, saying it expected a number and got a string. The mistake is caught where it
was made.

(In plain JavaScript the slip is harder to spot: `*` quietly turns text into a number, so
`'100' * 9` is 900, while `+` joins, so `'100' + 32` is `'10032'`. A formula can work for months
and then give nonsense when someone rearranges it.)

Now the converter itself. When the reader types, an `onInput` handler reads the box, converts
it, and puts the answer into the model:

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

function fahrenheit(celsius: 100.0): 212.0 {
  return celsius * 9 / 5 + 32
}

function convert(text: '100'): 212.0 {
  return fahrenheit(Number(text))
}

const { weather } = tosi({ weather: { fahrenheit: 68 } })

const { div, input, strong } = elements

preview.append(
  div(
    input({
      value: '20',
      onInput: (event) => { weather.fahrenheit = convert(event.target.value) },
    }),
    ' °C is ',
    strong(weather.fahrenheit),
    ' °F'
  )
)
```

`onInput` runs on every change to the box. `event` describes what happened, and
`event.target` is the box itself, so `event.target.value` is the text in it.

Type `abc` into the box and you meet the other kind of bad input: `Number('abc')` is `NaN`,
and NaN goes through the arithmetic and comes out as NaN, so the page shows `NaN °F`. Deciding what to
show for input that makes no sense is part of writing an interactive program. Decisions has
the tools; one of the exercises below asks you to use them.

## Keep the rules out of the buttons

Look at how the converter was built: the handler is one short line that calls `convert`, and
`convert` calls `fahrenheit`. Neither function knows about boxes or typing, so both were
tested before there was a box at all, with exactly the text a reader would type.

That is the habit to build. Put the rules of your program in functions with examples and
tests; keep the handlers so short that there is nothing in them to get wrong. Here is the rule
for a traffic light:

```tjs:inline {"view": "code"}
function nextLight(colour: 'red'): 'green' {
  given colour {
    'red' {
      return 'green'
    }
    'green' {
      return 'amber'
    }
  } else {
    return 'red'
  }
}

preview.append(`red, then ${nextLight('red')}, then ${nextLight('green')}, then ${nextLight('amber')}`)

test 'the lights go round' {
  expect(nextLight('green')).toBe('amber')
  expect(nextLight('amber')).toBe('red')
}
```

`nextLight` is the whole rule, and its signature example and test check every step of the
cycle. The button only asks for the next colour and stores it. `light.colour` is a part of the
model, and you can hand it to a function like any other value: `nextLight` sees `'red'`.

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

function nextLight(colour: 'red'): 'green' {
  given colour {
    'red' {
      return 'green'
    }
    'green' {
      return 'amber'
    }
  } else {
    return 'red'
  }
}

const { light } = tosi({ light: { colour: 'red' } })

const { div, button, strong } = elements

preview.append(
  div('The light is ', strong(light.colour), '. '),
  button({ onClick: () => { light.colour = nextLight(light.colour) } }, 'Next')
)
```

## Try it

Make a model with a `score`. Give it buttons for **+1**, **-1** and **double**, and show the
score on the page. Then add a line that shows `'You win!'` when the score reaches 100.
(Hint: a second, computed part of the model, set alongside the score.)

More to try:

- Make the converter go the other way too: a second box for °F that updates the °C. Write
  `celsius(fahrenheit: 212.0): 100.0` first, with its example.
- Make the page say `'please type a number'` instead of showing `NaN` when the box holds
  something that is not a number. `Number.isNaN(value)` asks whether a value is NaN. First
  write a test that `Number.isNaN(convert('abc'))` is true, then give the model a second part,
  a `message`, set in the handler.
- Real traffic lights in some countries show red and amber together before green. Add that
  step to `nextLight`, and to its test, before you touch the button.

Not every event is a click or a key press. A timer going off is an event, and so is an answer
arriving from the network; Things That Take Time shows how to wait for them.
