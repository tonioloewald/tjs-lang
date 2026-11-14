<!--{"parent": "writing-agents.md", "order": 7}-->
<!-- TODO review -->

# Limits

Every run is bounded. The host that runs your agent gives it a budget of work, a deadline, a
ceiling on memory, and caps on how often it may call certain atoms and how large a value may
cross to the outside world. This chapter is the author's view of those limits: what each one
measures, what running out looks like from inside the agent, and how to write agents that stay
within them.

Setting the limits is the host's job; the option table is in
[Run options](/ajs-host/#run-options). How the VM keeps them true is in
[VM budgets](/vm-budgets/).

## Why every run has limits

An agent often comes from someone you do not fully trust: a user, another service, a model
that wrote it a moment ago. The host has to be able to run it knowing two things: it will stop,
and it will not take the host down with it.

No program can tell in general whether another program will stop (the halting problem). AJS
does not try. It sidesteps the question by giving each run a budget of work, called **fuel**.
Every step spends some, and when the fuel is gone the run ends. A program that would loop
forever simply runs out.

This agent counts to whatever `limit` it is given. You may have met it in the
[Fuel Limits](/fuel-limits/) example. The JSON after the fence name sets this live example's
run: `fuel` is its budget and `args` are the arguments it is called with. Here it is asked to
count to 1,000 on a budget of 100:

```ajs:inline {"fuel": 100, "args": {"limit": 1000}}
function countTo({ limit = 1000000 }) {
  let counter = 0
  let i = 0
  while (i < limit) {
    counter = counter + 1
    i = i + 1
  }
  return { counter }
}
```

The run ends with `Out of Fuel` after spending its 100 units. Nothing hangs and nothing is
thrown: the failure is a value the host receives. A failed run looks like this:

```text
{ error: { message: 'Out of Fuel', op: 'varAssign' }, fuelUsed: 100 }
```

`message` says what went wrong. `op` is the VM's internal name for the step that was running
when it happened (here `varAssign`, an assignment). It never appears in your source; it is
there to help diagnose a failure, and an agent does not set or read it.
[What the host sees](/ajs-errors/#what-the-host-sees) has the full shape.

Change `fuel` to 1000 and run it again. It returns `{ counter: 1000 }` and uses about 493 units.

## Fuel is the work budget

If the host does not say otherwise, a run gets **1,000 units** of fuel, and every example in
this chapter sets `fuel` explicitly. (This site would otherwise give an example 10,000.)

What things cost:

| Work                                                    | Fuel               |
| ------------------------------------------------------- | ------------------ |
| An expression node (a name, `+`, `.`, …)                | 0.01               |
| A variable write (`let x = …`, `x = …`)                 | 0.1                |
| A control step (`if`, `while`, a block)                 | 0.1                |
| Most atoms                                              | 1                  |
| `httpFetch`                                             | 5                  |
| Core store calls (`storeGet`, `storeSet`, `storeQuery`) | 5                  |
| `llmPredict`                                            | 100                |
| Allocating memory                                       | 1 per 20,000 bytes |
| Copying in the run's arguments                          | 1 per 8,000 bytes  |

Copying arguments costs more per byte than allocating, because the copy also visits every value
in them, and that walk is charged node by node. Other work that grows with its input is charged
in proportion too: building a string, running a regex, validating against a schema. The full
list is [What a run costs](/DOCS-AJS/#what-a-run-costs), and every atom's cost is in the Fuel
column of the [Atom Reference](/ajs-atoms/#how-to-read-the-tables).

Two figures are worth keeping in your head. One pass of a small `while` loop like `countTo`'s
costs about half a unit. That figure is measured (see [Measuring](#measuring)) rather than added
up from the table, which lists the main charges but not every one. So 1,000 units buy about
2,000 such passes. And a model call costs 100, so 1,000 units buy fewer than ten of them, with
nothing left over for anything else.

### Running out

Running out of fuel **ends the run**, even inside a `try`. Nothing after it runs: no `catch`,
no later step.

```ajs:inline {"fuel": 1000}
function stubborn({ limit = 1000000 }) {
  let i = 0
  try {
    while (i < limit) {
      i = i + 1
    }
  } catch (err) {
    return { caught: err, reached: i }
  }
  return { reached: i }
}
```

The `catch` never runs. The run ends with `Out of Fuel`, and its `op` is `catch`, because the
loop was running inside the `try`/`catch` statement. `op` names whatever step happened to be
running; it is not necessarily the step at fault.

An agent cannot catch its budget and carry on, because then the budget would not be a limit.
[When Things Fail](/ajs-errors/#the-rule) explains which failures end a run and why.

## Measuring

An agent cannot read its remaining fuel, and cannot raise it. What you can do is measure.
Every run reports `fuelUsed`, and this site shows it beside each result. Run `countTo` above
with a few limits and the pattern is plain: `limit: 1000` uses about 493 units and
`limit: 2000` about 985, so each pass costs about 0.49 and the rest of the agent less than one
unit.

That is how a budget is sized: run the agent on typical arguments, read `fuelUsed`, and allow
headroom for the inputs that make it work harder. If you write agents for someone else's host,
tell them what your agent uses on realistic input. [Run options](/ajs-host/#run-options)
describes the host's side.

## Time

Fuel measures work, not time. A second limit, the run's **timeout**, measures wall-clock time.
Unless the host sets one, a run gets twice the timeout of the slowest atom the host has
registered, and never less than 60 seconds. With only the core atoms that is 240 seconds,
because `llmPredict` may take up to 120.

When the deadline passes, the run ends with `Execution timeout after …ms`, and its `op` is
`vm.run`. Like running out of fuel, a timeout cannot be caught. It stops a loop that is only
computing, too.

In practice the host sets a timeout and quotas, so the next two examples are short host programs
that show how. You do not need to write one: read the agent inside it, and the output. (The live
examples on this site can set them too, within caps that keep a reader's browser responsive:
`timeoutMs` up to 10 seconds, `maxHeapBytes` up to 64MB, and `quotas`.) Here the host gives `countTo` an enormous
fuel budget and a 200 ms deadline, and the deadline ends it:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const { ast } = transpile(`function countTo({ limit = 1000000 }) {
  let counter = 0
  let i = 0
  while (i < limit) {
    counter = counter + 1
    i = i + 1
  }
  return { counter }
}`)

const run = await vm.run(ast, { limit: 1e12 }, { fuel: 1e12, timeoutMs: 200 })
console.log(run.error.message) // Execution timeout after 200ms. …
console.log(run.error.op) // vm.run
```

Each atom call also has a timeout of its own: one second for most core atoms, 30 seconds for
`httpFetch`, 120 for `llmPredict`. Control steps such as `while` have none, so only the run's
timeout bounds a loop. When one call takes too long, that call fails with a message such as
`Atom 'httpFetch' timed out`, and **that failure is catchable**. A slow server is the world's
doing, so the agent may try another source or report the problem.

Waiting costs time, not fuel. A fetch that takes a second costs the same 5 units as one that
takes a millisecond; only the timeout bounds the wait. There is no way to sleep in an agent:
an agent that wants to wait for something has to ask a capability that does the waiting.

## Memory

Fuel bounds how much work a run does over its whole life. It does not bound how much the agent
holds at any one moment, so a third limit does: the **live-heap ceiling**, 64 MiB unless the
host sets another.

Two facts make the figures below add up. A string costs about two bytes per character. And the
VM's messages report binary megabytes (MiB, 1,048,576 bytes), so 70 million bytes shows as
about 67 MiB.

The VM works out the size of a large value before building it. Ask for a string of a hundred
million characters and it is refused before the string exists:

```ajs:inline {"fuel": 1000}
function huge({ size = 100000000 }) {
  try {
    const s = 'x'.repeat(size)
    return { length: s.length }
  } catch (err) {
    return { refused: err }
  }
}
```

It returns `{ refused: 'Heap limit exceeded: guest state holds ~191MB, limit 64MB. Fuel bounds
total work; this bounds peak memory. Raise it with the maxHeapBytes run option if the workload
genuinely needs it.' }`, having spent about one unit of fuel. A hundred million characters is
200 million bytes, about 191 MiB, which is the figure in the message.

Inside an agent, a caught error is just its message, as a string: there is no `err.message`.
[What `catch (err)` receives](/ajs-errors/#what-catch-err-receives) explains why. Without the
`try`, the run ends with the same message and its `op` is `expr.repeat`.

The heap refusal is **catchable**, as the example shows, and that is deliberate. The check runs
before anything is built, so nothing was allocated and nothing was wasted: the agent can safely
fall back to a smaller piece of work. (Try `size = 1000` to see it succeed.) Fuel and the
deadline are different: they measure work already done, so they always end the run.

The ceiling counts what is **live**, not what was ever allocated. This agent builds a
5-million-character string (10 million bytes) ten times, 100 million bytes in all, but holds
only one at a time, because each new string replaces the last:

```ajs:inline {"fuel": 10000}
function churn({ rounds = 10 }) {
  let s = ''
  let i = 0
  while (i < rounds) {
    s = 'x'.repeat(5000000)
    i = i + 1
  }
  return { rounds, length: s.length }
}
```

It returns `{ rounds: 10, length: 5000000 }`. The memory is not free in fuel: allocating 100
million bytes costs about 5,000 units, which is why this example sets 10,000. Now keep every
string instead:

```ajs:inline {"fuel": 10000}
function hoard({ rounds = 10 }) {
  let kept = []
  let i = 0
  while (i < rounds) {
    kept.push('x'.repeat(5000000))
    i = i + 1
  }
  return { rounds, kept: kept.length }
}
```

Seven strings are 70 million bytes, about 67 MiB, past the 64 MiB ceiling. So the run ends with
`Heap limit exceeded: guest state holds ~67MB, limit 64MB. …` (its `op` is `expr.push`), after
about 3,500 units of fuel. The same allocations, held instead of replaced, hit a different
limit.

### Shared structure

Size is not only bytes. An array can hold the same value many times over, and holding it costs
one pointer per slot. Printing it (with `join` or `JSON.stringify`) writes out every copy, so it
is charged for every copy. This agent nests one ten-character string ten ways, `depth` times
over:

```ajs:inline {"fuel": 1000, "args": {"depth": 4}}
function wide({ depth = 4 }) {
  let t = ['xxxxxxxxxx']
  let i = 0
  while (i < depth) {
    t = [t, t, t, t, t, t, t, t, t, t]
    i = i + 1
  }
  const text = JSON.stringify(t)
  return { printed: text.length }
}
```

It returns `{ printed: 152221 }` and uses about 43 units, nearly all of it on the print:
building the structure costs about three. Set `depth` to 5 and the print is ten times longer
and costs about 400 units. Set it to 6 and the run ends with `Out of Fuel`, though holding the
structure still costs under five.

## Quotas

Fuel prices every model call at 100 units, whatever it costs in money or tokens. A budget can
say "about this much work"; it cannot say "at most three model calls". A **quota** can. The host
caps how many times an atom may run in one run, for example `{ llmPredict: 3 }`; an atom with no
quota is unlimited.

[Calling Atoms](/ajs-calling-atoms/#quotas) introduced quotas. What matters here is that a quota
refusal is **catchable**: the refused call does not happen, and the agent gets an error it can
handle. Here the host allows `uuid` twice and the agent calls it three times:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const { ast } = transpile(`function ids() {
  let a = uuid()
  let b = uuid()
  let c = 'none'
  try {
    c = uuid()
  } catch (err) {
    c = err
  }
  return { a, b, c }
}`)

const run = await vm.run(ast, {}, { fuel: 1000, quotas: { uuid: 2 } })
console.log(run.result.c) // Quota exceeded for 'uuid': 2 calls allowed
```

`a` and `b` are UUIDs; `c` is the refusal. An agent cannot read its quota, so plan for the
refusal: make few calls, and decide what to return when the allowance is spent.

## Size at the boundary

Some atoms, such as `httpFetch` and `storeSet`, hand values to the host's **capabilities**: the
fetch function, the store. Every value crossing between the agent and a capability is copied,
and that crossing is the **capability boundary**. The VM's error messages call the copying
layer the **membrane**. One value may be at most 4 MiB (4,194,304 bytes) unless the host sets
another limit. Which way the value is going decides what happens when it is too large.

The rule, from [When Things Fail](/ajs-errors/#the-rule), is one question: could a correct host,
answering with ordinary JSON data, have produced this? If so, the failure is the world's and the
agent may catch it. If not, it is a bug, and the run ends.

- **Coming in, too large**: catchable. A server can send back too much, so it is the world's
  doing, and the agent's `catch` receives `Capability boundary rejected the return of
  'httpFetch': the value exceeds the 4194304-byte membrane budget`. The copy is charged by the
  size of the answer, about one unit per 20,000 bytes, whether it is accepted or refused. A
  6 MB answer costs about 300 units even though the agent never gets it, so retrying in a loop
  burns fuel fast.
- **Coming in, not plain data**: the run ends. If a host's capability hands back something JSON
  cannot express, such as a `Map`, the message is `Capability boundary rejected the return of
  '…': … only plain data (and Date) crosses …`. That is the host's bug, not the agent's.
- **Going out, too large**: the run ends. JSON can carry a big value, but no correct agent
  needs to send one past the limit it was given, so the agent built a value it cannot use.

This agent tries to store a 3-million-character string, about 6 MB:

```ajs:inline {"fuel": 1000}
function save({ length = 3000000 }) {
  const big = 'x'.repeat(length)
  try {
    storeSet({ key: 'big', value: big })
  } catch (err) {
    return { caught: err }
  }
  return { saved: true }
}
```

The `catch` never runs. The run ends with `'storeSet': the value exceeds the 4194304-byte
membrane budget`, and its `op` is `storeSet`. Set `length = 1000` and it returns
`{ saved: true }`.

### Arguments

A run's arguments cross the same boundary on the way in, before the first step. They are capped
at 4 MiB, and copying them costs one unit of fuel per 8,000 bytes. Arguments the budget cannot
pay for end the run as `Out of Fuel`, with `op` `vm.run`, before the agent runs at all. This is
another host program, because the arguments are the host's to send:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const { ast } = transpile(`function len({ text = '' }) {
  return { n: text.length }
}`)
const text = 'x'.repeat(100000) // about 200,000 bytes

const poor = await vm.run(ast, { text }, { fuel: 10 })
console.log(poor.error.message, poor.error.op) // Out of Fuel vm.run

const ok = await vm.run(ast, { text }, { fuel: 1000 })
console.log(ok.result, ok.fuelUsed) // { n: 100000 } about 26
```

Arguments over the 4 MiB cap are refused with `Capability boundary rejected the run arguments: …`.
Either way the agent never starts, so there is nothing for it to catch.

## The limits at a glance

The host can change every default here.

| Limit                 | Default                      | Message begins                         | In the agent |
| --------------------- | ---------------------------- | -------------------------------------- | ------------ |
| Fuel                  | 1,000                        | `Out of Fuel`                          | ends the run |
| Run timeout           | 2 × slowest atom, ≥ 60 s     | `Execution timeout`                    | ends the run |
| One atom's timeout    | 1 s; fetch 30 s; model 120 s | `Atom '…' timed out`                   | catchable    |
| Live heap             | 64 MiB                       | `Heap limit exceeded`                  | catchable    |
| Quotas                | none                         | `Quota exceeded`                       | catchable    |
| Answer too large      | 4 MiB                        | `Capability boundary rejected`         | catchable    |
| Answer not plain data | none                         | `Capability boundary rejected`         | ends the run |
| Value sent too large  | 4 MiB                        | `'…': the value exceeds`               | ends the run |
| Arguments             | 4 MiB; 1 fuel per 8,000 B    | `Capability boundary` or `Out of Fuel` | never starts |

[When a budget refuses](/vm-budgets/#when-a-budget-refuses) is the host-facing version of this
table.

## Writing within budget

Most agents never come near a limit. The ones that do usually make the same few mistakes.

**Bound every loop with a number the agent owns.** A `while` whose condition depends only on an
argument or an API's answer runs as long as that data says. `countTo` is the counterexample:
its `limit` comes from the caller, which is how the Time section made it run forever. Add a
constant the agent sets itself, `const MAX = 10000; while (i < limit && i < MAX)`, or clamp the
argument first, `const n = Math.min(limit, 10000)`.

**Cap lists before you loop over them.** A list that arrives as an argument or from an API can be
any length. Take a slice first, and say how much was left out:

```ajs:inline {"fuel": 1000}
function totalPrice({ items = [{ price: 3 }, { price: 4 }, { price: 5 }], max = 2 }) {
  const MAX = 100
  const batch = items.slice(0, Math.min(max, MAX))
  let total = 0
  let i = 0
  while (i < batch.length) {
    total = total + batch[i].price
    i = i + 1
  }
  return { total, counted: batch.length, skipped: items.length - batch.length }
}
```

It returns `{ total: 7, counted: 2, skipped: 1 }`. The caller may ask for fewer items with
`max`, but the agent sets the upper bound: whatever the caller sends, the loop runs at most 100
times.

**Store expensive results.** If the same work recurs across runs, keep its result with
`storeSet` and look it up with `storeGet` first. Each store call costs 5 units, so this pays
only for work that costs more than that, and only when the host's store persists between runs.
[Fuel Budgeting](/patterns/#fuel-budgeting) shows the pattern.

**Do not print deep shared structures.** See [Shared structure](#shared-structure) above.

**Make fewer model calls.** At 100 units each, model calls dominate most agents' budgets, and a
quota may cap them anyway. Ask for everything you need in one call (a structured answer with
several fields) rather than one call per field.

**Degrade; do not dodge.** When a catchable refusal arrives, doing less is fine: return a
partial result with a flag saying so, as `totalPrice` reports `skipped`, or answer from the
store when the model's quota is spent. What hides the agent's real cost is repeating the
refused operation, such as catching a heap refusal and asking for the same string again, or
chunking work to slip under a cap, such as storing a 6 MB value as two 3 MB keys. If an agent
genuinely needs more fuel, time or memory, the right fix is for the host to raise the budget for
that agent.

## Next

That completes Part I. Part II, [Embedding the VM](/embedding-the-vm/), is the other side of
every limit in this chapter: the host that sets them.
