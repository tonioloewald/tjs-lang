<!--{"parent": "learn-to-program.md", "order": 14}-->
<!-- TODO review -->

# Time and Events

Responding to the Reader made pages that wait for a click or a key. Things That Take Time made
programs that wait for a timer. Each kind of program sits still until something happens.

A game does not sit still. The ball keeps moving whether or not you touch anything, and when
you press a key, it moves the way you steer it, while it is still moving. This chapter puts
the two together: a program that changes over time **and** responds to the keyboard while it
does. By the end you will have a dot that falls down a board while you steer it left and
right, with buttons to start, pause and stop it. The next chapter turns that into a game of
Tetris.

## A clock that ticks

A countdown in Things That Take Time used `setInterval` to run a function once a second, and
`clearInterval` to stop it. A program that lives works the same way: on every **tick** of the
clock, it changes something, then shows the change. Here a dot moves along a line, one step
per tick, and comes back round to the start when it reaches the end:

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

function step(position: 0, length: 12) {
  return (position + 1) % length
}

function track(position: 0, length: 12) {
  let text = ''
  for (let i = 0; i < length; i++) {
    if (i == position) {
      text = text + 'O'
    } else {
      text = text + '·'
    }
  }
  return text
}

let position = 0
let timer = null

const { page } = tosi({ page: { picture: track(0, 12) } })

function tick() {
  position = step(position, 12)
  page.picture = track(position, 12)
}

function start() {
  if (timer != null) {
    return
  }
  timer = setInterval(tick, 250)
}

function stop() {
  clearInterval(timer)
  timer = null
}

const { pre, button } = elements

preview.append(
  pre({ style: { fontSize: '2em', margin: '0' } }, page.picture),
  button({ onClick: start }, 'Start'),
  button({ onClick: stop }, 'Stop')
)

test 'the dot steps along, and comes back round' {
  expect(step(0, 12)).toBe(1)
  expect(step(11, 12)).toBe(0)
  expect(track(2, 5)).toBe('··O··')
}
```

Press **Start**. Four times a second, `tick` moves the dot one place and draws the line again.

- `step` is the rule for one tick: the next position. `%` is the remainder from Decisions:
  `(11 + 1) % 12` is 0, which is what brings the dot back to the start.
- `track` draws a position as text: a loop, as in Repetition, that puts an `O` where the dot
  is and a `·` everywhere else.
- `tick` is the only thing the clock runs, and it does two things: it changes the fact
  (`position`), then puts a fresh picture of it on the page.

`timer` does two jobs. It holds the timer id that `clearInterval` needs, as in the countdown,
and it says whether the clock is running: `null` means stopped. So `start` does nothing if
`timer` is not `null`, and a second click on **Start** cannot start a second clock. `stop`
puts `null` back, so that **Start** works again. One name for both jobs means they cannot
disagree: the countdown's `running` and its `timer` could, if you forgot to change one.

Notice that nothing happens until you press **Start**. A program on a page should not start a
clock as soon as it is loaded: the reader may not be looking, and a clock that starts by
itself is one nobody asked to stop.

Change the `250` to `50`, or to `1000`, and press **Start** again. The rule does not change,
only how often it runs.

## Keys that steer

A button hears clicks. To hear the keyboard, a program listens for the **keydown** event,
which happens every time a key goes down. It reaches whichever part of the page has the
**focus**: the part that the keyboard is talking to, the way a text box has the focus while
you type in it. Click a box and it has the focus; press Tab and the focus moves to the next
thing that can have it.

Most parts of a page cannot have the focus. `tabindex: 0` lets one take it. Click the line of
dots below, then press the left and right arrow keys. Press other keys too, to see their
names. If nothing happens, the line of dots does not have the focus: click it again.

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

function steer(column: 3, key: 'ArrowLeft', columns: 7) {
  given key {
    'ArrowLeft' {
      return Math.max(0, column - 1)
    }
    'ArrowRight' {
      return Math.min(columns - 1, column + 1)
    }
  } else {
    return column
  }
}

function track(position: 0, length: 12) {
  let text = ''
  for (let i = 0; i < length; i++) {
    if (i == position) {
      text = text + 'O'
    } else {
      text = text + '·'
    }
  }
  return text
}

let column = 3

const { page } = tosi({ page: { picture: track(3, 7), key: 'none yet' } })

function onKey(event) {
  page.key = event.key
  if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault()
    column = steer(column, event.key, 7)
    page.picture = track(column, 7)
  }
}

const { div, pre } = elements

preview.append(
  pre(
    { tabindex: 0, onKeydown: onKey, style: { fontSize: '2em', margin: '0' } },
    page.picture
  ),
  div('The last key pressed was: ', page.key)
)

test 'the arrows steer, and the edges stop the dot' {
  expect(steer(3, 'ArrowLeft', 7)).toBe(2)
  expect(steer(3, 'ArrowRight', 7)).toBe(4)
  expect(steer(0, 'ArrowLeft', 7)).toBe(0)
  expect(steer(6, 'ArrowRight', 7)).toBe(6)
  expect(steer(3, 'x', 7)).toBe(3)
}
```

- `onKeydown: onKey` is like `onClick`: it hands `onKey` to the line of dots, to run each time
  a key goes down while it has the focus.
- `event.key` is the name of the key: `'a'` for the A key, `'ArrowLeft'` for the left arrow,
  `' '` (a space) for the space bar, `'Enter'`, `'Shift'`. The line under the dots shows the
  last one, so you can find the name of any key by pressing it.
- `steer` is the rule. `Math.max(0, column - 1)` is the larger of the two numbers, so the
  column never goes below 0, and `Math.min` keeps it below the right-hand edge. Any key that
  is not an arrow leaves the column where it is.

### Keeping the page still

The browser has its own uses for some keys. The arrow keys and the space bar scroll the page,
so without help, steering the dot would also move the whole page under you. Every event has
`preventDefault()`, which says "I have dealt with this; do not do what you normally do". Find
`event.preventDefault()` in `onKey`, delete it, and press the arrows: the page scrolls as the
dot moves.

`onKey` only prevents the keys it uses. Tab still moves the focus on, and every other key
still does whatever it usually does. A program that prevented every key would trap the
reader: they could not even Tab out of it.

## One state, two sources of change

Now put the clock and the keys together. The dot falls one row on every tick, the arrow keys
move it left and right while it falls, and when it reaches the bottom, it starts again at the
top.

There are now two things that can change the dot, at any moment, in any order. That sounds
complicated, and the way to keep it simple is the one from "A model the page follows", in
Responding to the Reader: keep the facts in one place, and let the page follow them. Here the
facts are a single object, the dot, with a row and a column. The clock and the keys each
change that object, and then call the same function, `show`, which draws the whole board
from the dot and nothing else.

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

const rows = 8
const columns = 7

function fall(dot: { row: 0, column: 3 }, rows: 8) {
  if (dot.row < rows - 1) {
    return { row: dot.row + 1, column: dot.column }
  }
  return { row: 0, column: dot.column }
}

function steer(dot: { row: 0, column: 3 }, key: 'ArrowLeft', columns: 7) {
  given key {
    'ArrowLeft' {
      return { row: dot.row, column: Math.max(0, dot.column - 1) }
    }
    'ArrowRight' {
      return { row: dot.row, column: Math.min(columns - 1, dot.column + 1) }
    }
  } else {
    return dot
  }
}

function picture(dot: { row: 0, column: 3 }, rows: 8, columns: 7) {
  let text = ''
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (row == dot.row && column == dot.column) {
        text = text + 'O'
      } else {
        text = text + '·'
      }
    }
    text = text + '\n'
  }
  return text
}

let dot = { row: 0, column: 3 }
let timer = null

const { page } = tosi({ page: { picture: picture(dot, rows, columns) } })

function show() {
  page.picture = picture(dot, rows, columns)
}

function onTick() {
  dot = fall(dot, rows)
  show()
}

function onKey(event) {
  if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault()
    dot = steer(dot, event.key, columns)
    show()
  }
}

const { pre, button } = elements

const board = pre(
  { tabindex: 0, onKeydown: onKey, style: { fontSize: '2em', lineHeight: '1', margin: '0' } },
  page.picture
)

function start() {
  if (timer != null) {
    return
  }
  timer = setInterval(onTick, 500)
  board.focus()
}

function stop() {
  clearInterval(timer)
  timer = null
}

preview.append(
  board,
  button({ onClick: start }, 'Start'),
  button({ onClick: stop }, 'Stop')
)

test 'the dot falls, and starts again at the top' {
  expect(fall({ row: 0, column: 3 }, 8).row).toBe(1)
  expect(fall({ row: 7, column: 3 }, 8).row).toBe(0)
  expect(fall({ row: 7, column: 3 }, 8).column).toBe(3)
}

test 'steering keeps the row, and stops at the edges' {
  expect(steer({ row: 5, column: 3 }, 'ArrowLeft', 7).row).toBe(5)
  expect(steer({ row: 5, column: 3 }, 'ArrowLeft', 7).column).toBe(2)
  expect(steer({ row: 5, column: 6 }, 'ArrowRight', 7).column).toBe(6)
}

test 'the picture shows the dot where it is' {
  expect(picture({ row: 1, column: 0 }, 2, 3)).toBe('···\nO··\n')
}
```

Press **Start**, and steer the dot with the arrow keys as it falls. **Start** also gives the
board the focus with `board.focus()`, because clicking the button gave the focus to the
button, and the keys would have gone there.

Look at how little the clock and the keys do. `onTick` asks `fall` for the next dot and calls
`show`. `onKey` asks `steer` for the next dot and calls `show`. Neither knows the other
exists, and neither touches the board. Whatever order the ticks and key presses come in, each
one makes a new dot from the old one, and the board shows the latest.

That is why this program redraws the whole board itself, where the model in Responding to the
Reader updated the page for you. A model part on the page shows one fact, and the board is a
picture of two at once, the row and the column, so one function draws it from both. The idea
is the same: the facts live in one place, `dot`, and the page is made from them, every time,
by one function written once. Nothing is ever drawn by moving an `O` from one place to
another, so the picture cannot fall out of step with the dot.

The rules are plain functions over plain data. `fall`, `steer` and `picture` take a dot and
numbers and give back a new dot or some text; none of them knows about clocks, keys or pages.
So the tests can check them without pressing anything or waiting half a second, including
the cases that are hard to reach by hand, such as the bottom row and the right-hand edge.

`fall` and `steer` never change the dot they are given: each gives back a new one, and only
`onTick` and `onKey` put it into `dot`. A dot handed to `fall` is the same afterwards, which
makes the rules easier to test and harder to get wrong.

Now press **Stop**, and press the arrow keys again. The dot no longer falls, but it still
moves left and right: the clock has stopped, but the board is still listening. A stopped game
should not move. The next section fixes that.

## Starting, pausing and stopping

A game needs three buttons. **Start** sets it going, and if it was paused, carries on from
where it was. **Pause** stops it where it is. **Stop** ends the game and puts the dot back at
the top.

This version also listens to the keys in a different place. Rather than a board the reader
has to keep focused, it listens to the whole page, `document`, so the arrow keys steer the
dot wherever the focus is. But only while the game is running: **Start** adds the listener,
and **Pause** and **Stop** take it away again.

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

const rows = 8
const columns = 7

function fall(dot: { row: 0, column: 3 }, rows: 8) {
  if (dot.row < rows - 1) {
    return { row: dot.row + 1, column: dot.column }
  }
  return { row: 0, column: dot.column }
}

function steer(dot: { row: 0, column: 3 }, key: 'ArrowLeft', columns: 7) {
  given key {
    'ArrowLeft' {
      return { row: dot.row, column: Math.max(0, dot.column - 1) }
    }
    'ArrowRight' {
      return { row: dot.row, column: Math.min(columns - 1, dot.column + 1) }
    }
  } else {
    return dot
  }
}

function picture(dot: { row: 0, column: 3 }, rows: 8, columns: 7) {
  let text = ''
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (row == dot.row && column == dot.column) {
        text = text + 'O'
      } else {
        text = text + '·'
      }
    }
    text = text + '\n'
  }
  return text
}

const startingDot = { row: 0, column: 3 }

let dot = startingDot
let timer = null

const { page } = tosi({
  page: { picture: picture(dot, rows, columns), status: 'Press Start.' },
})

function show() {
  page.picture = picture(dot, rows, columns)
}

function onTick() {
  dot = fall(dot, rows)
  show()
}

function onKey(event) {
  if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault()
    dot = steer(dot, event.key, columns)
    show()
  }
}

function start() {
  if (timer != null) {
    return
  }
  timer = setInterval(onTick, 500)
  document.addEventListener('keydown', onKey)
  page.status = 'Running: steer with the arrow keys.'
}

function pause() {
  clearInterval(timer)
  timer = null
  document.removeEventListener('keydown', onKey)
  page.status = 'Paused.'
}

function stop() {
  pause()
  dot = startingDot
  show()
  page.status = 'Stopped. Press Start for a new game.'
}

const { div, pre, button } = elements

preview.append(
  pre({ style: { fontSize: '2em', lineHeight: '1', margin: '0' } }, page.picture),
  div(page.status),
  button({ onClick: start }, 'Start'),
  button({ onClick: pause }, 'Pause'),
  button({ onClick: stop }, 'Stop')
)

test 'the rules have not changed' {
  expect(fall({ row: 7, column: 3 }, 8).row).toBe(0)
  expect(steer({ row: 0, column: 0 }, 'ArrowLeft', 7).column).toBe(0)
}

test 'a new game starts at the top' {
  expect(picture(startingDot, 2, 7)).toBe('···O···\n·······\n')
}
```

Press **Start**, steer, press **Pause**, and try the arrows: nothing moves, and the arrows
scroll the page again. **Start** carries on from where the dot was. **Stop** puts it back at
the top. `stop` begins by calling `pause`, because stopping is pausing and then starting
again from the beginning; writing those three lines twice would be two places to forget one.

`dot = startingDot` is safe because the rules never change a dot: `fall` and `steer` always
make a new one. If they changed the dot they were given, the first tick would move
`startingDot` itself, and the next new game would start wherever the last one stopped.

### Taking the listener away again

`document.addEventListener('keydown', onKey)` asks the page to call `onKey` on every key
press, from now on. `document.removeEventListener('keydown', onKey)` takes that request back.
Try it without: delete the `removeEventListener` line from `pause`, run the example, press
**Start** and then **Stop**. The dot stops falling, but the arrow keys still move it, and they
no longer scroll the page. The game looks stopped, and it is still eating your keys.

`removeEventListener` has to be given the **same function** that was added. That is why the
handler has a name, `onKey`, and is handed over by name both times. This looks right and does
nothing:

```tjs:static
document.addEventListener('keydown', (event) => onKey(event))
document.removeEventListener('keydown', (event) => onKey(event)) // removes nothing
```

Each `(event) => onKey(event)` makes a new function. The two do the same thing, but they are
two different functions, so the second line asks to remove one that was never added, and the
first stays.

`start` checks `timer` for the same reason as before, and here it matters twice over: a
second **Start** would add a second clock and a second listener, and each key press would
then move the dot two places.

### Cleaning up after yourself

A program that starts something is responsible for stopping it. A timer runs until it is
cleared, and a listener listens until it is removed, whether or not anything on the page
still needs it. Nothing tidies them up for you while the page is open.

Here a forgotten listener means that the arrow keys go on moving a game nobody is playing,
and the page will not scroll. In a bigger program the forgotten pieces pile up: every new game
adds another clock and another listener, the old ones never go away, and the program gets
slower and stranger the longer it runs. So whenever you write a line that starts something,
write the line that stops it, in the function that ends it, at the same time.

As in Things That Take Time, changing an example while it runs does not stop its old timers,
and here it does not remove its old listeners either. Press **Stop** before you edit, or reload
the page. While this game is running, the arrow keys steer the dot even while you are typing
in the code: one more reason a game listens to the whole page only while it runs.

## Smooth motion

The falling dot jumps a whole row at a time, twice a second, and for a game on a board, that
is right: the rule says one row per tick. But some things should glide. For those, the
browser offers `requestAnimationFrame`, which asks for a function to be run right before the
browser next draws the page. The browser draws a new **frame** about sixty times a second, so
a function that asks again every time it runs is called on every frame.

Here two balls move by the same rule, at the same speed. The top one is drawn on every frame;
the bottom one every 500 milliseconds, like the dot.

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

function across(elapsed: 1000.0, speed: 100.0, width: 260.0) {
  return ((elapsed / 1000) * speed) % width
}

const { motion } = tosi({ motion: { smooth: '0px', jumpy: '0px' } })

let startedAt = 0
let frame = null
let timer = null

function place() {
  return `${across(performance.now() - startedAt, 100, 260)}px`
}

function everyFrame() {
  motion.smooth = place()
  frame = requestAnimationFrame(everyFrame)
}

function start() {
  if (timer != null) {
    return
  }
  startedAt = performance.now()
  frame = requestAnimationFrame(everyFrame)
  timer = setInterval(() => {
    motion.jumpy = place()
  }, 500)
}

function stop() {
  cancelAnimationFrame(frame)
  frame = null
  clearInterval(timer)
  timer = null
}

const { div, button } = elements

function lane(left) {
  return div(
    { style: { position: 'relative', width: '280px', height: '24px', background: '#eee' } },
    div({
      style: {
        position: 'absolute',
        left: left,
        top: '2px',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        background: 'teal',
      },
    })
  )
}

preview.append(
  div('Every frame:'),
  lane(motion.smooth),
  div('Every 500 ms:'),
  lane(motion.jumpy),
  button({ onClick: start }, 'Start'),
  button({ onClick: stop }, 'Stop')
)

test 'the ball moves 100 pixels a second, and comes back round' {
  expect(across(0, 100, 260)).toBe(0)
  expect(across(500, 100, 260)).toBe(50)
  expect(across(3000, 100, 260)).toBe(40)
}
```

- `performance.now()` is the time in milliseconds, measured very precisely from when the page
  opened. `startedAt` remembers it at **Start**, so `performance.now() - startedAt` is how long
  the balls have been moving.
- `across` is the rule: where a ball is after so many milliseconds, at `speed` pixels a
  second. `%` brings it back to the left when it reaches the end, as `step` did for the dot.
- `everyFrame` places the smooth ball, then asks to be run again on the next frame. That
  request, every time, is what keeps it going. `requestAnimationFrame` gives back an id, as
  `setInterval` does, and `cancelAnimationFrame(frame)` cancels the request it stands for, so
  the next frame never comes.
- `left: left` puts a model part into the ball's style, so the ball moves whenever the model
  does. `lane` is handed `motion.smooth` for one ball and `motion.jumpy` for the other.

Notice that neither ball counts its steps. The position comes from the clock: how much time
has passed, times the speed. That matters, because frames do not come at an exact rate.
Sixty a second is usual, but a busy computer draws fewer, some screens draw more, and a page
in a tab you are not looking at draws none at all. A ball that moved two pixels per frame
would move at a different speed on every computer; a ball placed by the time arrives at the
same place on all of them.

So there are two kinds of time in a program that moves. **Rules** happen at the program's
pace: one row every 500 milliseconds, because that is how the game is played. **Drawing**
happens at the screen's pace: every frame, so that motion looks smooth. A game whose pieces
jump from square to square, such as the falling dot or the Tetris game in the next chapter,
needs only the first kind, because the picture only changes when a rule changes the state.
`show`, called after every change, already draws it exactly as often as it needs drawing.

## Try it

**A reaction-time tester.** A button says **Ready**. When it is pressed, the page waits a
random time between one and four seconds (`setTimeout`, and `Math.random()` from Functions),
then turns a box green and remembers `performance.now()`. The reader presses the space bar
as soon as they see green, and the page shows how many milliseconds it took. Pressing too
soon should say so, not report a time. Write the rule first, with tests: a function that
takes the time green appeared, the time of the key press (or `null` if it came before green)
and gives back the message to show. Listen for the space bar only from **Ready** until the
reader has pressed it, and remember `preventDefault`, or the space bar will scroll the page.

**Faster and faster.** In the game from "Starting, pausing and stopping", count the dots that
reach the bottom, and show the count. Every five, make the clock faster: write
`delay(landed: 0)` that gives back 500 for 0 to 4 landings, 450 for 5 to 9, and so on, but
never less than 100, and test it. To change how often a timer runs, clear it and start a new
one with the new delay.

More to try:

- Make the down arrow move the dot down a row at once, as a tick would. `fall` already knows
  how; `onKey` only has to call it.
- Make a dot that lands stay where it landed, and start a new dot at the top. The board now
  has to remember a list of landed dots (Lists), `picture` has to draw them too, and `fall`
  has to stop a dot that is above a landed one. This is most of what the next chapter does.
- **A snake.** The snake is a list of cells, each with a row and a column, head first. On each
  tick a new head goes on the front, one step in the snake's direction, and the last cell
  comes off the end, so the snake moves without growing. The arrow keys change the direction.
  When the head lands on a piece of food, leave the last cell on for that tick, and the snake
  grows by one. Write `move(snake, direction)` with tests before there is any clock or key.
- Give the gliding ball from "Smooth motion" a second rule, so that it bounces back from the
  right-hand edge instead of jumping back to the left.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
