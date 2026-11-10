<!--{"parent": "learn-to-program.md", "order": 11}-->
<!-- TODO review -->

# Things That Take Time

So far, every line of your programs has run as soon as the line before it finished. Even the
buttons in Responding to the Reader worked that way: a click ran a handler, and the handler
ran straight through. Real programs also have to wait. A kitchen timer waits for minutes to
pass. A weather app waits for another computer, somewhere else in the world, to send it the
forecast.

This chapter is about programs that wait: timers, a way of writing "do this, wait, then do
that" in order, and asking another computer for information.

## Later, not now

`setTimeout` asks for a function to be run later. You give it the function and how long to
wait, in **milliseconds** (thousandths of a second, so 2000 is two seconds):

```tjs:inline {"view": "console"}
console.log('Putting the kettle on.')

setTimeout(() => console.log('The kettle has boiled.'), 2000)

console.log('Getting out a cup.')
```

`() => console.log(…)` is a function with no name, written with an arrow, as in Responding
to the Reader. It is handed to `setTimeout`, not called.

Look at the order the lines appear in. The program does not stop at `setTimeout` and wait
two seconds. It hands the function over to be run later, carries on at once, and gets out
the cup. Two seconds after that, the kettle boils.

This is the same idea as an event handler. A button's `onClick` is a function that runs when
the reader clicks; the function you give `setTimeout` is one that runs when the time is up.
In both cases you are writing code now that will run later, and the program does not wait
for it.

Here is a timer on the page. It shows its message with a model: as in Responding to the
Reader, a model is an object made with `tosi`, and when one of its parts changes, the page
changes to match.

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

const { reminder } = tosi({ reminder: { message: 'No reminder set.', count: 0 } })

function remindLater() {
  reminder.message = 'Waiting…'
  setTimeout(() => {
    reminder.count = reminder.count + 1
    reminder.message = `Reminder ${reminder.count}: time to stand up and stretch!`
  }, 3000)
}

const { div, button } = elements

preview.append(
  div(reminder.message),
  button({ onClick: remindLater }, 'Remind me in 3 seconds')
)
```

The button is given `remindLater` itself, with no `( )` after it: as in Responding to the
Reader, the button needs a function to call later, not the answer of calling it now. Each
click sets a new reminder. Click three times quickly and you get three reminders, each
arriving three seconds after its own click: the count goes 1, 2, 3. Nothing stops a second
reminder being set while the first is still waiting. Sometimes that is what you want; the
next example shows how to prevent it when it is not.

## A countdown

`setInterval` is the repeating version: it runs a function again and again, with a pause
between each run, until you tell it to stop. A countdown needs that, and it needs a rule for
what happens on each tick. As in Responding to the Reader, write the rule as a function with
an example and a test, before there is any timer:

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

function tick(seconds: 10): 9 {
  if (seconds > 0) {
    return seconds - 1
  }
  return 0
}

const { countdown } = tosi({ countdown: { seconds: 10, running: false } })

let timer = null

function start() {
  if (countdown.running) {
    return
  }
  countdown.seconds = 10
  countdown.running = true
  timer = setInterval(() => {
    countdown.seconds = tick(countdown.seconds)
    if (countdown.seconds == 0) {
      clearInterval(timer)
      countdown.running = false
    }
  }, 1000)
}

const { div, button, strong } = elements

preview.append(
  div({ style: { fontSize: '3em' } }, strong(countdown.seconds)),
  button({ onClick: start }, 'Start')
)

test 'tick counts down, and stops at zero' {
  expect(tick(3)).toBe(2)
  expect(tick(1)).toBe(0)
  expect(tick(0)).toBe(0)
}
```

- `let timer = null` makes the name before there is a timer to put in it. `null` means
  "nothing yet". It is `let`, not `const`, because a timer is put into it later. It is
  outside `start`, so the function inside `setInterval` can still find it, every second,
  long after `start` has finished.
- `setInterval(…, 1000)` runs its function once a second. It gives back a **timer id**, a
  value that stands for this particular timer. The program keeps it in `timer`.
- `clearInterval(timer)` stops the timer that id stands for. Without it, the function would
  go on running every second, for as long as the page is open.
- `running` remembers whether a countdown is already going. Without that check, a second
  click on **Start** would start a second timer, and the number would fall twice a second.
  Try it: delete the three lines starting `if (countdown.running)`, and click **Start** twice.

That experiment shows something else too. At zero, only one of the two timers stops. The
second click put the second timer's id into `timer`, so the first id was lost, and
`clearInterval(timer)` stops only the second timer. The first goes on running `tick(0)` every
second, and nothing can stop it, because a timer whose id is lost can never be stopped.
Reload the page to clear it.

The timer's function is two lines: it asks `tick` for the next number, and stops at zero.
The rule itself is in `tick`, where a test can check it without waiting ten seconds.

One thing to know about timers in these examples: if you change an example while one of its
timers is running, the old timer does not stop. It goes on changing the model, and the page
can look as if two countdowns are fighting. Let the countdown finish, or reload the page.

## Waiting in order

Timers are enough for one thing happening later. They get awkward for a sequence: boil an
egg for three minutes, then make toast for two, then serve. With only `setTimeout`, each
step goes inside the function of the step before, and the code drifts further to the right
with every step:

```javascript
breakfast.step = 'Boiling an egg…'
setTimeout(() => {
  breakfast.step = 'Making toast…'
  setTimeout(() => {
    breakfast.step = 'Breakfast is ready.'
  }, 2000)
}, 3000)
```

Two steps are already hard to read: the 2000 belongs to the toast, but it sits far below it,
and the 3000 for the egg comes last of all. Every new step adds another level.

TJS, like JavaScript, has a better way to write it: an **async function**, in which you can
**await** a wait. First, a small function that waits:

<!-- tjs-doc: fragment -->
```tjs:static
function wait(ms: 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

`wait(3000)` gives back a **promise**: a value that stands for something that has not
happened yet. It is like the ticket you get at a busy counter. The ticket is not your
sandwich, but it is a promise that a sandwich is coming, and you can wait for it. This
promise is kept when the timer goes off, three seconds later. You do not need to follow
every part of that line yet; it is a recipe, and you can copy it as it is.

Now the breakfast:

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

function wait(ms: 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const { breakfast } = tosi({ breakfast: { step: 'Press the button to start.' } })

async function makeBreakfast() {
  breakfast.step = 'Boiling an egg…'
  await wait(3000)
  breakfast.step = 'Making toast…'
  await wait(2000)
  breakfast.step = 'Breakfast is ready.'
}

const { div, button } = elements

preview.append(
  div(breakfast.step),
  button({ onClick: makeBreakfast }, 'Make breakfast')
)
```

- `async` in front of `function` says that this function can wait.
- `await wait(3000)` pauses `makeBreakfast` until the promise is kept, then carries on with
  the next line. The steps read from top to bottom, in the order they happen.

Compare it with the `setTimeout` version above: the same steps, the same waits, and each wait
sits next to the step it belongs to.

While `makeBreakfast` is paused, the rest of the page is not. The browser goes on responding
to the reader, and other examples on this page go on working. Only `makeBreakfast` waits.
`await` is what makes that possible: it hands control back to the page while it waits. A
program that waited without it, by going round a loop until the time was up, would keep the
page busy the whole time, and the page would freeze.

You can see that the page keeps working: press **Make breakfast**, and press it again while
the egg is boiling. Now two breakfasts are being made at once, and their messages tangle:
the first says "Breakfast is ready." while the second is still making toast. This is the
same problem as clicking **Start** twice on the countdown, and the same `running` check would
fix it.

`await` can only be used inside an `async` function, or at the top level of an example,
outside every function, as the next examples do.

## An answer that takes time

An async function can give back an answer, with `return`, like any function. The answer
arrives when the function finishes, so you `await` it:

```tjs:inline {"view": "console"}
function wait(ms: 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function slowDouble(n: 0) {
  await wait(1000)
  return n * 2
}

console.log('Asking…')
const answer = await slowDouble(21)
console.log('The answer is', answer)

test 'slowDouble doubles, eventually' {
  expect(await slowDouble(21)).toBe(42)
  expect(await slowDouble(0)).toBe(0)
}
```

The test uses `await` too. A test can wait for an answer in the same way as the rest of the
program, and it is checked when the answer arrives.

Notice that `slowDouble` has no worked example of its answer, no `: 42` after the
parentheses. TJS checks a worked example by calling the function and comparing the answer
straight away, and at that moment an async function's answer has not arrived, so the example
cannot be checked. If you write one anyway, TJS does not complain, even when it is wrong, so
leave it off and write a test that awaits the answer. `wait` has no worked example for the
same reason: what it gives back is a promise.

### A common mistake: using the ticket as if it were the sandwich

What if you forget the `await`?

```tjs:inline {"view": "console"}
function wait(ms: 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function slowDouble(n: 0) {
  await wait(1000)
  return n * 2
}

const ticket = slowDouble(21)
console.log(`Without await: ${ticket}`)
console.log('Without await, plus one:', ticket + 1)
console.log('With await:', await ticket)
```

Calling an async function always gives back a promise, at once, before the answer exists.
Without `await`, that promise is what you get: shown as text it is `[object Promise]`, and
"adding one" to it glues `1` onto that text. If a page ever shows `[object Promise]`, or
something that should be a number is nonsense, look for a missing `await`.

The last line shows that the ticket was good all along. `await ticket` waits for the promise
and gives back the answer, 42.

### Mistakes arrive later too

A typed async function checks what it is given, as every TJS function does, and when the
value is wrong it gives back an error instead of an answer (When Things Go Wrong). The check
happens as soon as the function is called, before any waiting, so a wrong value is refused
at once, without the one-second wait. But like everything an async function gives back, the error comes wrapped in a
promise. You only see it once you `await`: without the `await`, `slowDouble('ten')` is a
promise, and asking whether a promise is an error says no.

```tjs:inline {"view": "console"}
function wait(ms: 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function slowDouble(n: 0) {
  await wait(1000)
  return n * 2
}

const result = await slowDouble('ten')

if (result instanceof Error) {
  console.log('Something went wrong:', result.message)
} else {
  console.log('The answer is', result)
}

test 'a wrong value arrives as an error' {
  const wrong = await slowDouble('ten')
  expect(wrong instanceof Error).toBe(true)
  expect(wrong.received).toBe('ten')
}
```

`received`, as in When Things Go Wrong, is the value that was refused.

So the habit from When Things Go Wrong carries over unchanged: await the result, then check
it with `instanceof Error` before you use it.

## Asking another computer

A web page can ask another computer for information with `fetch`. You give it an address,
and it gives back a promise of the reply. The reply takes time to arrive, from a few
hundredths of a second to many seconds, which is why everything in this chapter so far has
been leading here.

Many services answer in **JSON**, a way of writing data that looks almost exactly like the
objects in Things with Parts. This example asks [Open-Meteo](https://open-meteo.com), a free
weather service, for the temperature in Berlin right now. Many services only answer pages
on their own website, or ask for a key first; Open-Meteo answers any web page, which is why
this book uses it. (Asking a service that does not answer your page looks like the "could
not be reached" failure described below.)

Its reply looks like this, with a few parts left out:

```json
{
  "latitude": 52.52,
  "longitude": 13.42,
  "current_units": { "time": "iso8601", "temperature_2m": "°C" },
  "current": { "time": "2026-11-10T15:45", "temperature_2m": 4.0 }
}
```

The reply is an object with parts, and the part called `current` is an object too. Inside
it, `temperature_2m` is the temperature 2 metres above the ground, in °C. So once the reply is
turned into an object called `data`, the temperature is at `data.current.temperature_2m`.

One more new thing before the example: `fetch` can fail by **throwing** an error, as the
mistakes that stop the program do (When Things Go Wrong), but this time something can be done
about it. `try { … } catch { … }` is the part that deals with it, and it is explained just
after the example, under "Throwing, and catching".

```tjs:inline {"view": "code"}
import { elements, tosi } from 'tosijs'

async function currentTemperature(latitude: 52.52, longitude: 13.41) {
  const address =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`
  try {
    const response = await fetch(address)
    if (!response.ok) {
      return Error(`the weather service answered ${response.status}`)
    }
    const data = await response.json()
    return data.current.temperature_2m
  } catch {
    return Error('the weather service could not be reached')
  }
}

function weatherReport(celsius: 21.5): 'It is 21.5 °C in Berlin right now.' {
  return `It is ${celsius} °C in Berlin right now.`
}

const { berlin } = tosi({ berlin: { report: 'Press the button to ask.' } })

async function ask() {
  berlin.report = 'Asking…'
  const celsius = await currentTemperature(52.52, 13.41)
  if (celsius instanceof Error) {
    berlin.report = `Sorry, ${celsius.message}. Try again in a minute.`
  } else {
    berlin.report = weatherReport(celsius)
  }
}

const { div, button } = elements

preview.append(
  div(berlin.report),
  button({ onClick: ask }, 'How warm is Berlin?')
)

test 'the report reads well' {
  expect(weatherReport(-3)).toBe('It is -3 °C in Berlin right now.')
}
```

There are two waits in `currentTemperature`. `await fetch(address)` waits for the reply to
start arriving; `await response.json()` waits for the rest of it, and turns the JSON into an
object: the one shown above.

The address carries the question. After the `?`, an address can hold named values, each
written `name=value`, with `&` between them. Here there are three: the latitude, the
longitude, and `current=temperature_2m`, which says what we want to know. The address is
built from the latitude and longitude, so it works for anywhere: Paris is
48.85 and 2.35. One of the exercises below asks you to add a second city.

### When the other computer does not answer

Asking another computer can fail in ways your own program never does. The network can be
down, the service can be busy, the address can be wrong. A program that talks to the network
has to expect that, and `currentTemperature` turns every such failure into an error value,
so that `ask` only has to check for one thing:

- `response.ok` is true when the service answered and was happy with the question. When it
  is false, `response.status` is a number saying why (404 means "no such address"). The
  function gives back an `Error` with that number in it.
- When there is no reply at all, `fetch` does not give back an error value: it throws one.
  The `catch` block turns that into an `Error` value, like the rest of the function.

### Throwing, and catching

A thrown error stops the function right there: the lines after it do not run. It keeps going
up through every function that called it, stopping each one, until something catches it.
`try { … } catch { … }` is what catches it: if anything inside the `try` block throws, the
program jumps to the `catch` block and carries on from there.

`JSON.parse`, which turns JSON text into an object, throws when the text is not JSON, so it
makes a small example:

```tjs:inline {"view": "console"}
console.log('Before.')

try {
  JSON.parse('{ this is not JSON')
  console.log('This line never runs.')
} catch {
  console.log('Caught it: that was not JSON.')
}

console.log('After.')
```

The line after `JSON.parse` never runs, because the throw jumps straight to `catch`. Then the
program carries on after the whole `try … catch`. To see the difference, delete everything
from `try {` to the last `}` except the `JSON.parse` line: now the example stops at
`JSON.parse` and shows its message, and "After." never appears.

Try the failures on purpose, in the weather example. Change `api.open-meteo.com` to
`api.open-meteo.co` (a computer that does not exist) and press the button: after a moment,
which can be a few seconds, the page says "Sorry, the weather service could not be reached.
Try again in a minute." Then put it back, and change `forecast` to `forcast` (an address the
service does not have): now it says "Sorry, the weather service answered 404. Try again in a minute."

You have met thrown errors before. The mistakes that stop the program, in When Things Go
Wrong, such as `… is not defined`, are thrown errors too. Until now there was nothing to do
about them but fix the typo. `fetch` is different: it throws because of the world, not
because of a mistake in your code, so it is worth catching. A good place for `try` is
exactly here, around the code that talks to the network, turning a throw into an error value
that the rest of your program already knows how to check.

### Testing the parts that wait

The test above checks `weatherReport`, not `currentTemperature`. A test that called the real
service would fail whenever the network did, and it would ask Berlin for the weather every
time the page is opened. The temperature changes, too, so there is no answer it could expect.
Instead, keep the network call small, and put everything that can be worked out without the
network into a function like `weatherReport`, with examples and tests.

The test gives `weatherReport` a whole number, -3, although its example is 21.5. That is
fine: a number with a decimal point as the example accepts any number, whole or not
(Functions), and temperatures can be either.

## Try it

**A stopwatch.** Make a model with `seconds` and `running`, and three buttons:

- **Start** starts a timer that adds one to `seconds` every second. Starting a stopwatch that
  is already running should do nothing (remember the countdown).
- **Stop** stops the timer, with `clearInterval`, and leaves the time showing.
- **Reset** sets `seconds` back to 0. Decide what it should do while the stopwatch is
  running, and make it do that.

Write the rule for the display first, with an example and a test: a function `showTime` that
turns seconds into minutes and seconds, so that `showTime(75)` is `'1:15'` and `showTime(5)`
is `'0:05'`. `Math.floor(75 / 60)` is the whole minutes, and `75 % 60` is the seconds left
over. The `0` in `'0:05'` is a decision (Decisions): add it when the seconds are less than 10.

**A random saying.** `https://api.github.com/zen` answers with a short, random saying about
programming, a different one each time. It answers in plain text, not JSON, so read it with
`await response.text()` instead of `response.json()`. Make a button that fetches one and
shows it. GitHub allows only about sixty of these requests an hour from each computer; when
you go over, `response.ok` is false and `response.status` is 403 (sometimes 429). Make the page show a
friendly message instead of the saying when that happens, or when the network is down, and
try it by changing the address.

More to try:

- Add Paris (48.85, 2.35) to the weather example, as a second button. Give `weatherReport` a
  second parameter for the city's name, and update its example and test first.
- Make the countdown start from a number the reader types (Numbers from a text box, in
  Responding to the Reader, shows how). What should happen if they type `abc`?
- Use `await wait(…)` to make a traffic light (Responding to the Reader) that changes by
  itself: red for three seconds, green for three, amber for one, and round again, until a
  **Stop** button is pressed. A `while` loop from Repetition can do the going round, as long
  as it awaits inside: `while (lights.running)` with an `await` in it pauses on each turn,
  and the page keeps working while it waits. Without the `await`, the loop would never let
  the page do anything else, and the page would freeze.

Work them here:

```tjs:inline {"view": "code"}
// Your code here. Show results with preview.append(…), check them with a
// test block, then press the refresh button (or ⌘S / Ctrl+S) to run it.
```
