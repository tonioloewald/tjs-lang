<!--{"section": "ajs", "type": "example", "group": "basics", "order": 6, "parent": "ajs-basics.md"}-->
<!-- TODO review -->

# Error Handling

Agents meet failure constantly: a service is down, a model returns garbage, an input is wrong.
Inside an agent, an error behaves like an exception in JavaScript: it skips ahead to the nearest
`catch`. It is never thrown into the host's code. An error nobody catches ends the run, and
`vm.run` resolves normally with the error in `run.error` (see
[What the host sees](#what-the-host-sees)).

```ajs:inline
function safeDivide({ a = 10, b = 0 }) {
  try {
    if (b == 0) {
      Error('Division by zero!')
    }
    let quotient = a / b
    return { quotient }
  } catch (err) {
    return { error: err }
  }
}
```

The agent's single object parameter is its input, and the defaults (`a = 10, b = 0`) are what
this example runs with. It returns `{ error: 'Division by zero!' }`. Edit `b = 0` to `b = 2` and
run it again to get `{ quotient: 5 }`.

## What to notice

- **There is no `throw`.** In AJS, `Error('message')` (no `new`) is a statement that raises: it
  is AJS's `throw`, not a constructor, and it produces no value. Writing
  `const e = Error('x')` raises the error too; `e` is never set. `throw` itself is a transpile
  error that tells you to use `Error` instead.
- **An error skips what follows.** Once an error is raised, the run is failing: every statement
  after it is skipped until a `catch` handles the error or the run ends. Here
  `let quotient = a / b` never runs. After the `catch` block, the program carries on with the
  next statement as normal.
- **`err` is a string.** The `catch` receives only the error's message, so `{ error: err }`
  returns `"Division by zero!"`. `err.message` is `undefined`, and `typeof err` is `'string'`.
  The host sees more: the full `AgentError`, with the message plus the operation that raised it.
  The agent gets the text alone because an error reaches agent code only as a capped string,
  never as a host object it could poke at.
- **A few failures cannot be caught at all.** Running out of fuel, or passing an atom input of
  the wrong shape, ends the run even inside a `try`. Read
  [the gotcha](#the-gotcha-some-errors-cannot-be-caught) before relying on `try` to keep a batch
  going.

### Current limitation: the message must be a string literal

`Error('Division by zero!')` works. A message built at run time does not: `Error('bad: ' + n)`,
`` Error(`bad: ${n}`) `` and `Error(msg)` all arrive as `"[object Object]"`. This is a bug,
tracked as card #3836 on the project board, and there is no workaround yet: write a fixed message
for each case, and return any variable detail in the agent's result instead.

## Keep going after a failure

Batch work is the common case: one bad item should not sink the rest. Put the `try` inside the
loop, record what failed, and return both:

```ajs:inline
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

`results` is `[1, 3, { a: 4 }]`, and `errors` holds one entry for `'x'`. Its `error` text is
the JSON parser's own message, which depends on the JavaScript engine running the VM, so match
on the fact that it failed, not on the wording.

## Errors cross function boundaries

An agent may declare several top-level functions. The last one is the entry point; the ones
before it are helpers it calls by name. An error raised inside a helper stops the helper and
reaches the caller's `try`, the same as an exception would in JavaScript:

```ajs:inline
function double(n) {
  if (n < 0) {
    Error('negative input')
  }
  return n * 2
}

function doubleAll({ xs = [1, -2, 3] }) {
  let doubled = []
  let skipped = 0
  for (const x of xs) {
    try {
      const y = double(x)
      doubled.push(y)
    } catch (err) {
      skipped = skipped + 1
    }
  }
  return { doubled, skipped }
}
```

It returns `{ doubled: [2, 6], skipped: 1 }`.

Call the helper on its own line and assign the result, as in `const y = double(x)`. A helper
call is a separate step of the program, and AJS keeps expressions free of such calls, so
`return { v: double(x) }` or `double(x) + 1` is a transpile error that tells you to assign the
result to a variable first. This applies only to your own helpers: a built-in such as
`JSON.parse(s)` may sit inside an expression. See
[local helper functions](/DOCS-AJS/#local-helper-functions) for the other rules.

`catch (err)` binds the message even when the `catch` does not use it. You may write `catch`
with no binding (`catch { … }`) instead; both work.

## Re-raise with a better message

Calling `Error` inside a `catch` raises a new error. Use it to replace a low-level message with
one the host can act on:

```ajs:inline
function loadConfig({ text = '{"retries": 3' }) {
  let config = null
  try {
    config = JSON.parse(text)
  } catch {
    Error('config is not valid JSON')
  }
  return { config }
}
```

The JSON is missing its closing brace, so the run ends with the error
`config is not valid JSON` (the host reads it as `run.error.message`; see below). Nothing caught
the second error, so `return { config }` never runs.

Because of the [string-literal limitation](#current-limitation-the-message-must-be-a-string-literal),
the new message cannot include the original `err` text yet.

## Cleanup without `finally`

AJS has no `finally` block. Put cleanup after the whole `try`/`catch` statement instead. When
the `try` finishes, or the `catch` handles the error, the program carries on from there:

```ajs:inline
function cleanup({ text = 'not json' }) {
  let log = []
  let value = null
  try {
    value = JSON.parse(text)
    log.push('parsed')
  } catch (err) {
    log.push('parse failed')
  }
  log.push('cleanup runs either way')
  return { value, log }
}
```

This substitute is weaker than `finally`. The code after the `try`/`catch` does **not** run when:

- the `try` or the `catch` executes a `return`;
- the `catch` raises a new error with `Error(...)`, as in the re-raise example above;
- the failure is one that cannot be caught (see the end of this page).

Do not write `finally` anyway. The transpiler currently accepts a `finally` block and discards
it without a warning, so its code never runs. That is a bug, not the intended design; until it
is fixed, nothing tells you the block was dropped.

## What the host sees

This part is host code, for the program that embeds the VM. The host transpiles the agent's
source to an AST in one step, then runs the AST on the VM (`tjs-lang/vm-ast`, the VM with no
parser in it) with a fuel budget, which caps how much work the run may do.

An error nobody catches ends the run. It does not throw into the host's code: `vm.run` resolves
normally and reports the failure in `run.error`, an `AgentError` with a `message` and an `op`,
the operation that raised it. Here the op is `Error`, because the agent's own `Error(...)`
statement raised it. The fuel spent up to that point is in `run.fuelUsed`.

`run.result` is that same `AgentError`, not a value the agent returned. It serializes as
`{ $error: true, message, op }`, so a result sent over the network still reads as an error.
Check `run.error` first (or use `isAgentError(value)`, which recognises both the object and its
JSON form):

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const { ast } = transpile(`
function safeDivide({ a = 10, b = 0 }) {
  if (b == 0) {
    Error('Division by zero!')
  }
  let quotient = a / b
  return { quotient }
}`)

const vm = new AgentVM()
const run = await vm.run(ast, { a: 10, b: 0 }, { fuel: 1000 })

if (run.error) {
  console.log(run.error.message) // → Division by zero!
  console.log(run.error.op) // → Error
  console.log(run.result === run.error) // → true
} else {
  console.log(run.result.quotient)
}
```

Any error nobody catches arrives this way, including running out of fuel and the run's timeout,
which no `catch` can stop (see below). The host's side of this is covered in
[Embedding the AJS VM](/ajs-host/#what-vmrun-returns).

## The gotcha: some errors cannot be caught

A few terms first. An **atom** is a built-in operation such as `httpFetch` or `storeGet`; each
one declares the shape of the input it accepts and the output it returns. A **capability** is
something the host gives the VM to reach the outside world, such as fetch, a store or an LLM.
**Fuel** is the run's work budget.

Most failures are catchable. A few end the run outright, even inside a `try`, and no `catch`
block or later statement runs. They fall into three groups:

| What went wrong                                                                                 | Direction | Whose fault  | Catchable? |
| ----------------------------------------------------------------------------------------------- | --------- | ------------ | ---------- |
| `Error('…')` in the agent                                                                       | —         | the agent    | yes        |
| A fetch fails, a domain is not allowed, a capability is missing, a model is down, a store throws | in        | the world    | yes        |
| A single atom times out, or an atom's call quota is spent                                       | in        | the world    | yes        |
| Bad data: invalid JSON, or a capability's REPLY is too large, too deep, or not the atom's declared output | in        | the world    | yes        |
| The agent PASSES an atom an input that does not match the atom's declared input                 | out       | the agent    | **no**     |
| A value the agent sends out cannot be copied (too large, too deep, not plain data)              | out       | the agent    | **no**     |
| A capability returns something JSON cannot express (a `Map`, a live `Response`, a function)     | in        | the host     | **no**     |
| Out of fuel, the run's own timeout, or the host's abort signal                                  | —         | the budget   | **no**     |

The three groups that end the run each have their own reason:

- **Data coming in is the world's doing; data going out is the agent's.** A server can be slow,
  down, or send back four megabytes, and a program might reasonably retry or work around that.
  An input the agent built itself is the agent's bug, and retrying it changes nothing.
- **A reply plain JSON could not have produced is the host's bug.** The test is one question:
  _could plain JSON have done this?_ A reply that is too big or too deep could have come from any
  server, so it is catchable. A `Map`, a live `Response` or a function could not, so it is a
  defect in the host's capability, and the run ends.
- **The budget is final.** Fuel and the run's timeout are the host's limits on the whole run. If
  the agent could catch them, they would not be limits.

Here the agent passes a number where `httpFetch` declares a string `url`. The `catch` never runs:

```ajs:inline
function badCall({ port = 8080 }) {
  try {
    const page = httpFetch({ url: port })
    return { page }
  } catch (err) {
    return { caught: err }
  }
}
```

The run ends with `'httpFetch': its input does not have the shape the atom declares`. The VM
checks the input before it looks for a fetch capability, so this happens with no host setup at
all. Why not let the agent catch it? Every refused copy at the boundary is billed in fuel, and a
refusal the agent could catch is one it could probe in a loop, so each one would have to be
billed exactly; ending the run removes the loop altogether. A bug is not something to retry
anyway.

The transpiler catches the bugs it can see before anything runs. It knows each atom's input
NAMES, so `httpFetch({ link: '…' })`, an input `httpFetch` does not have, never reaches the VM.
It does not know what type a variable holds at run time, so `url: port` gets through and the VM
refuses it.

The full rule, including how a sub-agent's refusal reaches its parent (an `agentRun` served by
the host is a separate run, so the parent sees an ordinary, catchable failure), is in
[the language reference](/DOCS-AJS/#catchable-and-run-ending). The host's view, with a capability
that returns a `Map`, is in
[Embedding the AJS VM](/ajs-host/#catchable-failures-and-run-ending-refusals).
