<!--{"section": "ajs", "type": "example", "group": "featured", "order": 16, "parent": "ajs-featured.md"}-->
<!-- TODO review -->

# Fuel Limits

This is the reason AJS exists. You can run an agent (an AJS program) you did not write, from a
user or a model, knowing it will stop.

**Fuel** is a work budget. The host, meaning your code that runs the agent, gives each run an
amount of fuel; every step the agent takes spends some, and when it reaches zero the run
stops. This page runs each example with 10,000 units. The VM's own default, if the host passes
none, is 1,000; the page gives more so the examples that should finish have room to.

The agent below counts to a million, far more work than 10,000 units pay for. The fuel runs
out first, and the run ends with an error value instead of hanging the page (or your server):

```ajs:inline
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

## What to notice

- **The error is `Out of Fuel`, and it is a result, not a crash.** Nothing is thrown. The run
  hands the host its `error` and `fuelUsed`, and the host decides what to do.
- **The agent cannot catch it.** Running out of fuel ends the run whatever `try` blocks the
  agent has: wrap the loop in `try { … } catch (e) { return … }` and the `catch` branch never
  runs. An agent cannot swallow its budget and keep going.
- **The budget is the host's, not the program's.** A program cannot read or raise its own
  budget.
- **Fuel measures work.** Every expression, assignment and loop test costs a little. An
  **atom** (a built-in operation, such as an HTTP fetch or a model call) costs more:
  `httpFetch` costs 5 units, `llmPredict` 100. One trip round this loop costs about half a
  unit, so 10,000 units buy roughly 20,000 iterations.
- **`fuelUsed` can end a hair over the budget**, because the step that runs out is charged
  before it is refused. Read it as "the budget was spent", not as an exact count.

## Try different amounts

The same agent, unchanged, run with the argument `limit: 1000` (in your own host,
`vm.run(ast, { limit: 1000 })`; see below). A thousand iterations fit in the budget, so it
returns `{ counter: 1000 }`, and the page shows it used about 490 units:

```ajs:inline {"args": {"limit": 1000}}
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

The same agent again, unchanged, with the same `limit: 1000` but a budget of 100 units. The
thousand iterations no longer fit: at about half a unit each, 100 units pay for about 200 of
them, and then the run ends with `Out of Fuel` and `fuelUsed` of about 100:

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

## In your own host

The budget is an option on the run. Transpile the source in one step, run the AST in another.
The VM in `tjs-lang/vm-ast` contains no parser: it only ever sees an AST, so parsing source
you did not write happens outside the sandbox (or behind its own size cap, `transpile(source,
{ maxSourceBytes })`), and a parser bug cannot be reached from inside a run.

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

// the agent's source text, as a string
const source = `function countTo({ limit = 1000000 }) {
  let counter = 0
  let i = 0
  while (i < limit) {
    counter = counter + 1
    i = i + 1
  }
  return { counter }
}`

const vm = new AgentVM()
const { ast } = transpile(source)

// Enough fuel: the run succeeds
const ok = await vm.run(ast, { limit: 1000 }, { fuel: 1000 })
console.log(ok.result) // → { counter: 1000 }, the agent's return value
console.log(ok.error) // → undefined
console.log(ok.fuelUsed) // → about 493

// Too little fuel: the run fails
const run = await vm.run(ast, { limit: 1000 }, { fuel: 100 })
if (run.error) {
  console.log(run.error.message) // → Out of Fuel
  // the AST operation that was running when fuel ran out: here `varAssign`,
  // an assignment such as `counter = counter + 1`
  console.log(run.error.op)
  console.log(run.fuelUsed) // → about 100
}
```

A run returns `{ result, error, fuelUsed }`. On success `result` is the agent's return value
and `error` is undefined. On failure `error` is set, and `result` holds the same error value
rather than a partial result: whatever the agent had computed before it ran out is gone.

If you pass no `fuel`, a run gets 1,000 units. Pick the budget for the work you expect: enough
for a well-behaved agent to finish, small enough that a runaway one is cheap.

## The other limits

Fuel bounds **work**, so it is the time budget for computation. Three other limits cover what
it cannot:

- **`timeoutMs`**, wall-clock time. It is the backstop for waiting, not computing: an agent
  waiting on a slow fetch or model call spends time but no fuel, and the timeout ends that
  wait. Set `fuel` to bound a loop. Default: 240 seconds with the standard atoms (twice the
  longest atom timeout, a model call's 120 seconds, and never less than 60).
- **`maxHeapBytes`**, how much the program holds in memory at once (64 MB by default). Fuel
  bounds how much it allocates over the whole run, not how much it keeps.
- **`quotas`**, how many times an atom may be called, such as `{ llmPredict: 3 }`. A model
  call costs 100 units of fuel whatever it costs you in money, so only a quota can say "three
  calls, no more".

The VM has no network access of its own. The agent's `httpFetch` calls whatever `fetch`
function the host passes in `capabilities` (the IO the host grants the run), with the same
arguments as the standard `fetch(url, init)`, and that function's return value becomes the
agent's value: below, `a` is `{ ok: true }`. Return plain JSON data. `httpFetch` is a built-in
atom, so `new AgentVM()` needs nothing registered.

Here are `timeoutMs` and `quotas`, with a stand-in `fetch` (`maxHeapBytes` is not shown). This
continues from the snippet above, with the same `vm` and imports:

```javascript
const poller = transpile(`function poll({ url }) {
  let a = httpFetch({ url })
  let b = httpFetch({ url })
  let c = httpFetch({ url })
  return { a, b, c }
}`).ast
const args = { url: 'https://example.com' }

// A fetch that takes half a second, against a 50 ms deadline
const slowFetch = (url, init) =>
  new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 500))
const slow = await vm.run(poller, args, {
  timeoutMs: 50,
  capabilities: { fetch: slowFetch },
})
console.log(slow.error.message) // → Execution timeout after 50ms. …

// Three fetches against a quota of two
const capped = await vm.run(poller, args, {
  quotas: { httpFetch: 2 },
  capabilities: { fetch: async (url, init) => ({ ok: true }) },
})
console.log(capped.error.message) // → Quota exceeded for 'httpFetch': 2 calls allowed
```

The two failures behave differently, and the difference matters when the agent is untrusted:

- **A timeout ends the run**, like running out of fuel. No `try` in the agent can catch it,
  and nothing is returned: the fetches that finished before it are lost with the rest of the
  result.
- **A quota refusal is an ordinary error inside the agent.** The refused call does not
  happen. Here no `try` surrounds the third call, so the run ends with that error and `a` and
  `b` are not returned. Wrap the call in `try { … } catch (e) { … }` and the agent catches it
  and carries on, so it can fall back when its allowance is spent; it still cannot make the
  call.

See the [AJS guide](/DOCS-AJS/) for every run option.
