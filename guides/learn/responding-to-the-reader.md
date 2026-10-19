<!--{"parent": "learn-to-program.md", "order": 9}-->

# Responding to the Reader

Until now your programs have run once and stopped. An interactive program waits: it shows
something, and when the reader clicks or types, it changes. This chapter adds buttons, and a
way of keeping the page in step with your program that needs almost no code.

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

## A model the page follows

Most interactive programs keep their facts in one place, the **model**, and show them on the
page. tosijs makes that almost free: wrap your facts in `tosi`, **bind** parts of the page to
them, and from then on changing the model changes the page. You never redraw anything yourself.

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

const { counter } = tosi({ counter: { count: 0 } })

const { div, button, span } = elements

preview.append(
  div(
    'Clicked ',
    span({ bindText: counter.count }),
    ' times. ',
    button({ onClick: () => { counter.count = counter.count + 1 } }, 'Click me'),
    button({ onClick: () => { counter.count = 0 } }, 'Reset')
  )
)
```

- `tosi({ counter: { count: 0 } })` makes the model, and gives back `counter`, a stand-in for
  it that notices changes.
- `bindText: counter.count` says "this span always shows `counter.count`".
- `counter.count = counter.count + 1` changes the model. The span follows on its own.

Notice what the buttons do *not* do: they never touch the span. They change the model, and
everything bound to it updates. Add a second `span({ bindText: counter.count })` anywhere and
it keeps up too.

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
  div('Total: ', strong({ bindText: tally.total })),
  div(...[1, 5, 10, 50].map((amount) => button({ onClick: () => add(amount) }, `+${amount}`)))
)
```

The row of buttons is made with `map`, from a list of amounts, the way the planets were in
Lists. Add `100` to the list and a new button appears.

## Try it

Make a model with a `score`. Give it buttons for **+1**, **-1** and **double**, and show the
score with `bindText`. Then add a line that shows `'You win!'` when the score reaches 100.
(Hint: a second, computed part of the model, set alongside the score.)
