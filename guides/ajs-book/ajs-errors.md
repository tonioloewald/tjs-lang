<!--{"parent": "writing-agents.md", "order": 5}-->
<!-- TODO review -->

# When Things Fail

An agent lives on other people's machines and other people's data. A server is down, a page
is not JSON, a domain is not on the host's list. This chapter is about what happens then: how
an agent raises an error, how it catches one, what it gets when it does, and which failures it
is allowed to catch at all.

Most failures are catchable, including ordinary mistakes in the agent's own code. A few are not,
and the line between them is the part to remember:

- **At the boundary with the host, a failure the outside world caused is catchable, and a
  failure a bug caused ends the run.** A server that is down is the world's doing; handing
  `httpFetch` a number where it declares a string is a bug.
- **Running out of fuel or time ends the run.** These budgets are a separate category, covered
  below.

## An error skips ahead

AJS has no `throw`. An error in AJS is a value the VM records, never an exception that could
reach the host's code, so raising one is a call: `Error('message')`, without `new`. From that
point the program is in its **error state**: every step after it is skipped until a `catch`
takes the error. If nothing does, the run ends, and the error is what the run produces.

```ajs
function safeDivide({ a = 10, b = 0 }) {
  try {
    if (b == 0) {
      Error('Division by zero')
    }
    let quotient = a / b
    return { quotient }
  } catch (err) {
    return { error: err }
  }
}
```

It returns `{ error: 'Division by zero' }`. `let quotient = a / b` never runs: once the error is
raised, the program goes straight to the `catch`. Change `b = 0` to `b = 2` and it returns
`{ quotient: 5 }`.

`Error(...)` raises wherever it appears. Even `const e = Error('x')` raises at once, and `e` is
never assigned, so there is no error value to build and pass around. Writing `throw` is a
transpile error that tells you to use `Error` instead. Writing `new Error('x')` is a mistake to
avoid: today it raises nothing, and the transpiler only warns `Expression statement has no
effect`.

## Catching

### What `catch (err)` receives

`err` is a **string**: the error's message, and nothing else. There is no error object, so
`err.message` is `undefined` and `typeof err` is `'string'`. A message longer than 8,192
characters keeps its first 8,192, followed by `…`.

The message can be computed, with `+` or a template:

```ajs
function checkAge({ age = -3 }) {
  try {
    if (age < 0) {
      Error(`age must not be negative, got ${age}`)
    }
    return { ok: true }
  } catch (err) {
    return { caught: err, kind: typeof err, noObject: err.message === undefined }
  }
}
```

It returns `{ caught: 'age must not be negative, got -3', kind: 'string', noObject: true }`.

Pass `Error` a string and nothing else. Build the text you want, with `+`, a template, or
`JSON.stringify(data)` for structured detail. A number, object or array passed to `Error`
directly produces a message that depends on how the call was written (sometimes just `'Error'`),
so do not rely on what it says. If the caller needs the data itself, return it from the `catch`
instead of packing it into a message.

Write `catch (err)` when you want the message. When you only need to know that something failed,
leave the binding out:

```ajs
function isJson({ text = '{"a": 1' }) {
  try {
    JSON.parse(text)
    return { json: true }
  } catch {
    return { json: false }
  }
}
```

It returns `{ json: false }`. `catch (_)` works too, if you prefer to name what you ignore.

### Re-raising

Calling `Error(...)` inside a `catch` raises a new error, which goes to the nearest enclosing
`try`, or ends the run. Use it to give a low-level message context, keeping the original text if
it helps:

```ajs
function loadConfig({ text = '{"retries": 3' }) {
  let config = null
  try {
    config = JSON.parse(text)
  } catch (err) {
    Error('config is not valid JSON: ' + err)
  }
  return { config }
}
```

The text is missing its closing brace, so the run ends with an error whose message is
`config is not valid JSON: ` followed by the parser's own explanation. That second part comes
from the JavaScript engine running the VM, so its wording varies: in Bun it is
`JSON Parse error: Expected '}'`. `return { config }` never runs, because nothing caught the
second error.

A message is for people. If the host needs to branch on what went wrong, do not re-raise: return
a structured value from the `catch`, such as `{ ok: false, reason: 'bad-config' }`, and let the
host read the field.

### `finally`

A `finally` block runs after the `try` and after any `catch`, whatever happened in them, unless
the run itself ends (see [Refusals that end the run](#refusals-that-end-the-run-a-bugs) below).

```ajs
function withCleanup({ text = 'not json' }) {
  let log = []
  let value = null
  try {
    value = JSON.parse(text)
    log.push('parsed')
  } catch (err) {
    log.push('parse failed')
  } finally {
    log.push('cleanup')
  }
  return { value, log }
}
```

It returns `{ value: null, log: ['parse failed', 'cleanup'] }`: the `catch`, then the `finally`.
Change `text` to `'[1, 2]'` and the log reads `['parsed', 'cleanup']`.

A `return` or an error from the `try` or `catch` waits until the `finally` has finished. A
`return` or an error *inside* the `finally` replaces the one that was waiting, as in JavaScript:

```ajs
function overruled() {
  try {
    return { from: 'try' }
  } finally {
    return { from: 'finally' }
  }
}
```

It returns `{ from: 'finally' }`. The `try`'s answer is lost, which is why `finally` blocks should
do cleanup and nothing else.

### Errors cross function boundaries

An error raised in a helper stops the helper and reaches the caller's `try`, the way an
exception does in JavaScript. Put the `try` inside the loop and one bad item does not stop the
rest:

```ajs
function double(n) {
  if (n < 0) {
    Error('negative input: ' + n)
  }
  return n * 2
}

function doubleAll({ xs = [1, -2, 3] }) {
  let doubled = []
  let errors = []
  for (const x of xs) {
    try {
      const y = double(x)
      doubled.push(y)
    } catch (err) {
      errors.push(err)
    }
  }
  return { doubled, errors }
}
```

It returns `{ doubled: [2, 6], errors: ['negative input: -2'] }`. A helper call must be a
statement of its own, so its result is assigned first and pushed after;
[Decisions, Loops and Helpers](/ajs-control-flow/) covers helpers.

## Failures you can catch

These are failures a program might reasonably retry, skip, or report, so `catch` sees all of
them.

**The world's**, at the boundary with the host:

- a fetch that fails, or that goes to a domain the host does not allow;
- a capability the host did not provide, such as `Capability 'llm.predict' missing` from
  `llmPredict` on a host with no model;
- a call quota the host set that is used up;
- an atom call that takes longer than its own time limit (30 seconds for `httpFetch`, one second
  for most core atoms): a slow server is the world's doing;
- a capability's answer that is too large, too deeply nested, or not the shape the atom
  declares it returns.

**Inside the program**:

- data that does not parse, such as `JSON.parse('{')`;
- ordinary mistakes, such as an operator given an array (see [Values](/ajs-values/)). These are
  bugs, but they never reach a capability or the host: they are the agent's own business, as a
  `TypeError` is in JavaScript, and each one is paid for in fuel like any other step;
- a value that would take the run past its memory ceiling. The VM refuses before it builds the
  value, so the run is still inside every budget and can fall back to smaller work.
  [Limits](/ajs-limits/#memory) has the details.

This agent asks for a page:

```ajs
function tryFetch({ url = 'https://example.com/' }) {
  try {
    const page = httpFetch({ url })
    return { page }
  } catch (err) {
    return { failed: err }
  }
}
```

On this documentation site, whose host allows only a few public APIs, it returns
`{ failed: 'Fetch blocked: domain not in allowlist. Allowed: …' }`, followed by the domains these
examples may reach. On a host that set no allowlist and no `fetch` of its own, the message starts
`Fetch blocked: no allowedFetchDomains configured`. On a host that allows `example.com`, it
returns the page. Each message names the rule that refused the call.

And this one makes an in-program mistake, adding a number to an array, which AJS refuses rather
than quietly turning the array into text:

```ajs
function addToList({ items = [1, 2] }) {
  try {
    const label = items + 1
    return { label }
  } catch (err) {
    return { failed: err }
  }
}
```

It returns a `failed` message that begins `'+' needs a string, number, boolean or null, not an
array` and suggests `arr.join(',')` or `JSON.stringify(obj)`.

The per-failure reference, with the message each one produces, is the table in
[Which failures an agent can catch](/ajs-capabilities/#which-failures-an-agent-can-catch).

### Two patterns

**Collect and carry on.** For batch work, catch inside the loop, record what failed, and return
both. The language reference has the canonical version,
[`parseAll`](/DOCS-AJS/#raising-and-catching):

```ajs
function parseAll({ items = ['1', 'x', '3', '{"a":4}'] }) {
  let results = []
  let errors = []
  for (const item of items) {
    try {
      let value = JSON.parse(item)
      results.push(value)
    } catch (err) {
      errors.push({ item, error: err })
    }
  }
  return { results, errors, ok: errors.length == 0 }
}
```

It returns `results: [1, 3, { a: 4 }]`, `ok: false`, and one entry in `errors` for `'x'`. Match
on the fact that an item failed, not on the parser's wording.

**Retry with a stop condition.** Put the `try` in a `while` loop whose condition says when to
give up: after so many attempts, or once there is a result.

```ajs
function fetchWithRetry({ url = 'https://example.com/', maxAttempts = 3 }) {
  let attempts = 0
  let page = null
  let lastError = null
  while (attempts < maxAttempts && page === null) {
    attempts++
    try {
      page = httpFetch({ url })
    } catch (err) {
      lastError = err
    }
  }
  if (page === null) {
    return { ok: false, attempts, error: lastError }
  }
  return { ok: true, attempts }
}
```

This site does not allow `example.com`, so every attempt fails and it returns
`{ ok: false, attempts: 3, error: 'Fetch blocked: …' }`. Change the URL to
`https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current_weather=true`
and it returns `{ ok: true, attempts: 1 }`. [Retry](/patterns/#retry) in the patterns guide has
a fuller version.

Always give the loop its own limit. Fuel is a backstop, not a stop condition: a retry loop
without a limit runs until the fuel is gone, and then the whole run ends with `Out of Fuel`, the
`catch` never runs, and the agent's result is lost. There is no backoff either, because AJS has
no `sleep`: waiting is the host's time to spend, so a host that wants backoff puts it in its
`fetch` capability.

## Refusals that end the run: a bug's

Some failures cannot be caught. They end the run on the spot, even inside a `try`. Nothing after
them runs: not the `catch` block, not a `finally`, not any later step, and not a step of a parent
agent that called this one (except when the host runs the sub-agent separately; see
[below](#the-one-exception-a-sub-agent-the-host-runs)).

```ajs
function badCall({ port = 8080 }) {
  try {
    const page = httpFetch({ url: port })
    return { page }
  } catch (err) {
    return { caught: err }
  }
}
```

`httpFetch` declares `url` as a string, and `port` is a number. The run ends with
`'httpFetch': its input does not have the shape the atom declares`, and the `catch` never runs.
The VM checks the input before it looks for a way to fetch, so this happens on any host.

The transpiler catches the bugs it can see before anything runs. It knows each atom's input
names, so `httpFetch({ link: '…' })` never reaches the VM. It does not check the types of the
values, so `url: port` gets through, and the VM refuses it.

These are the refusals that end a run:

- **An atom input that does not match the atom's declared shape**, as above.
- **A value going out to a capability that cannot be copied.** Values that cross to the host are
  copied, so the host never holds a live reference into the agent, and only JSON data plus `Date`
  can be copied, up to 4 MB by default. A value too large, too deeply nested, or holding
  something else is refused. The agent built that value.
  [Size at the boundary](/ajs-limits/#size-at-the-boundary) gives the limits, and
  [The Sandbox](/ajs-sandbox/#values-cross-as-checked-copies) what may cross.
- **A capability that returns something JSON cannot express**, such as a `Map`, a function or a
  live `Response`. That is a bug in the host's capability, not in the agent, but it ends the run
  all the same.

The run's budgets end it too: running out of fuel, and the run's time limit. The run's time limit
is the host's deadline for the whole agent (60 seconds or more unless the host sets one), not the
time limit of a single atom call. Once either budget is spent there is nothing left to run a
`catch` with. [Limits](/ajs-limits/) covers them.

A broken contract is never caught by the agent either, because the agent is not running when it
is checked. Arguments that do not match the declared parameters stop the run before it starts,
and a result that does not match the declared result fails the run after the `return`.
[Contracts](/ajs-contracts/) explains both.

### The rule

For failures at the boundary, the question is: **could a correct host, answering with ordinary
JSON data, have produced this?** A capability's answer always arrives as JSON data, copied.

If yes, the failure is the world's, and the agent may catch it. A server can be down, can send
back four megabytes, can send back a page that is not JSON. A program might handle any of those.

If no, it is a bug: the agent passed a number where a string was declared, or built a value too
big to send, or the host handed back a `Map`. Retrying a bug cannot succeed, so the run ends
rather than let the agent try again. (There is a cost reason too, for hosts:
[Refusals that end the run](/ajs-sandbox/#refusals-that-end-the-run) in The Sandbox.)

The same size problem lands on either side of the line depending on its direction. An answer
that is too large **coming in** is catchable: the world sent it. A value that is too large
**going out** ends the run: the agent built it.

Budgets sit outside this question. Fuel and the run's deadline always end the run; the memory
ceiling is catchable, because its refusal comes before anything is built.

For the host's side of the same rule, how a host tells the two kinds apart, read
[Catchable failures and run-ending refusals](/ajs-host/#catchable-failures-and-run-ending-refusals).
The language reference states it in
[Catchable, and run-ending](/DOCS-AJS/#catchable-and-run-ending).

### The one exception: a sub-agent the host runs

`agentRun({ agentId, input })` runs another agent. When `agentId` is an AST or a stored-procedure
token, the sub-agent runs inside the current run, on the same fuel, and a refusal there ends
both. Any other `agentId`, such as a name, goes to the host's `agent` capability, and the host
decides how to run it. If the host starts a separate run, the sub-agent has its own budget, a
refusal ends only that run, and the parent sees an ordinary failure it can catch.

An agent cannot see which the host chose, so do not rely on catching a sub-agent's refusal. Write
the sub-agent so it does not have one. [The `agent` capability](/ajs-capabilities/#agent) has the
details.

## What the host sees

This part is host code: the program that embeds the VM and runs your agent. It shows what your
agent's failure looks like from the outside.

`vm.run` never throws for anything an agent does. It resolves to `{ result, error, fuelUsed, … }`.
On success `error` is `undefined`. On failure `error` is an `AgentError` with a `message` and an
`op`, the step that was running, and `result` holds the same `AgentError`, so code that keeps
only `result` still sees the failure.

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const { ast } = transpile(`function nope() { Error('nope') }`, { atoms: vm.atoms })
const run = await vm.run(ast, {}, { fuel: 1000 })

console.log(run.error.message) // nope
console.log(run.error.op) // Error
console.log(run.result === run.error) // true
```

| The agent                                          | `error.message`                                                     | `error.op`  |
| -------------------------------------------------- | ------------------------------------------------------------------- | ----------- |
| raises `Error('nope')` and nobody catches          | `nope`                                                              | `Error`     |
| calls `httpFetch({ url: port })`, `port` a number  | `'httpFetch': its input does not have the shape the atom declares` | `httpFetch` |
| runs out of fuel inside a `try`                    | `Out of Fuel`                                                       | `catch`     |

`op` names the step that was running when the run stopped, which is not always the one at fault.
The last row reads `catch` because the fuel ran out while the VM was inside the `try`/`catch`
statement.

The result does not tell the host whether a failure could have been caught. An uncaught
`Error('nope')` and a run-ending refusal arrive the same way. How a host tells them apart and
what it should do about each is covered in
[Catchable failures and run-ending refusals](/ajs-host/#catchable-failures-and-run-ending-refusals),
which runs one agent against three stores to show both kinds.

## Next

An agent declares what it accepts and what it returns, and the VM enforces both:
[Contracts](/ajs-contracts/) explains how.
