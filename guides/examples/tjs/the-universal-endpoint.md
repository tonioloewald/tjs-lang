<!--{"section": "tjs", "type": "example", "group": "advanced", "order": 15, "parent": "tjs-advanced.md"}-->
<!-- TODO review -->

# The Universal Endpoint

Most backends grow one route per operation: a URL, a request schema, a handler, a deploy.
This chapter builds the other kind, a single endpoint that accepts the client's *logic* as
data and runs it under limits the server sets. The handler is about thirty lines of TJS.

The client's logic is written in **AJS**, a sandboxed subset of JavaScript that compiles to
a JSON syntax tree (an AST) and runs on a metered virtual machine, `AgentVM`. Three words
come up throughout:

- **Fuel** is a run's work budget. Every step the VM takes costs some, and the run ends
  when it is gone.
- An **atom** is an operation an agent can call, such as `storeGet`, `httpFetch` or
  `llmPredict`. Atoms are AJS's built-in functions.
- A **capability** is an implementation the host hands in for the atoms that need one:
  a `store` for `storeGet`, a `fetch` for `httpFetch`, an `llm` for `llmPredict`. The VM
  has no IO of its own; what it can touch is exactly what the host passes in.

The agent source travels as a string inside this TJS file because, on a real server, it
arrives as a string in a request body. The [AJS book](/ajs/) covers the language itself.

The demo runs four requests. Three of them each show one property of the VM, and the
fourth shows where that property stops.

```tjs:inline
/#
## One endpoint that runs the client's logic

`post` is a complete request handler. The request carries AJS source, its
arguments and a fuel budget. The handler checks the caller's token,
transpiles the source to an AST, and runs it on `AgentVM` with a bounded
budget and only the capabilities this caller is allowed. Whatever the agent
does, `post` returns a value.

This page imports the full `tjs-lang` package because it transpiles in the
page. A production server would take an AST and use `tjs-lang/vm-ast`, which
has no parser in it (see "Making it real" below).
#/

import { AgentVM, transpile } from 'tjs-lang'

// One VM serves every request. It holds no per-request state.
const vm = new AgentVM()

// Per-caller data. A Map, not a plain object: a caller-supplied token such as
// 'constructor' must not find an inherited property and pass as valid.
const tenants = new Map([
  ['token_alice', new Map([['greeting', 'hello from alice']])],
  ['token_bob', new Map([['greeting', 'hello from bob']])],
])

// The store capability for one caller. The `storeGet` and `storeSet` atoms
// call its async `get(key)` and `set(key, value)`, so those are the names a
// store must have. It can reach only that caller's map.
function storeFor(token: '') {
  const data = tenants.get(token)
  if (!data) return undefined
  return {
    get: async (key) => data.get(key),
    set: async (key, value) => { data.set(key, value) },
  }
}

// The colon values are TJS examples, not defaults: `fuel: 1000` says
// `req.body.fuel` must be an integer. A request of the wrong shape gets a
// TJS type error (a MonadicError value) back and never reaches the VM.
async function post(req: {
  body: { agent: '', args: {}, fuel: 1000 },
  headers: { authorization: '' },
}) {
  // 1. Authorize first, before doing any work whose cost the caller controls.
  const store = storeFor(req.headers.authorization)
  if (!store) return { status: 'error', error: 'Unauthorized', fuelUsed: 0 }

  // 2. Parse. This runs before any fuel is charged, so untrusted source gets
  //    a size cap. `transpile` is ordinary host code and THROWS on bad source,
  //    so it needs a try/catch.
  let ast
  try {
    ast = transpile(req.body.agent, { maxSourceBytes: 16_000 }).ast
  } catch (e) {
    return { status: 'error', error: `Parse error: ${e.message}`, fuelUsed: 0 }
  }

  // 3. Run. The client asks for a budget; the server clamps it. `vm.run`
  //    never throws: a failed run comes back as `{ error }`, so no try/catch.
  const run = await vm.run(ast, req.body.args, {
    fuel: Math.min(req.body.fuel, 10_000),
    timeoutMs: 5000,
    capabilities: { store },
  })

  // Fuel is fractional (an expression node costs 0.01), so round for display.
  const fuelUsed = Math.round(run.fuelUsed * 100) / 100
  if (run.error) {
    return { status: 'error', error: run.error.message, fuelUsed }
  }
  return { status: 'ok', result: run.result, fuelUsed }
}

// An agent is a function taking one object of named arguments, and it
// returns an object. `{ }` means it takes no arguments.

// --- 1. A small computation ---
const sum = await post({
  body: {
    agent: `
      function compute({ x, y }) {
        return { sum: x + y, product: x * y }
      }`,
    args: { x: 7, y: 6 },
    fuel: 100,
  },
  headers: { authorization: 'token_alice' },
})
console.log('1. compute:', sum)

// --- 2. A loop that never ends ---
const loop = await post({
  body: {
    agent: `
      function spin({ }) {
        let i = 0
        while (true) {
          i = i + 1
        }
        return { i }
      }`,
    args: {},
    fuel: 50,
  },
  headers: { authorization: 'token_alice' },
})
console.log('2. while (true):', loop)

// --- 3. The same agent, three callers ---
const readGreeting = `
  function read({ }) {
    let greeting = storeGet({ key: 'greeting' })
    return { greeting }
  }`
for (const token of ['token_alice', 'token_bob', 'token_mallory']) {
  const reply = await post({
    body: { agent: readGreeting, args: {}, fuel: 100 },
    headers: { authorization: token },
  })
  console.log(`3. ${token}:`, reply)
}

// --- 4. Source that is not AJS ---
const bad = await post({
  body: { agent: 'function broken({ }) { return {', args: {}, fuel: 100 },
  headers: { authorization: 'token_alice' },
})
console.log('4. broken source:', bad)
```

The `/# … #/` block at the top of the example is a TJS doc comment: its markdown renders as
prose above the code.

## What the output shows

**1. A small computation** returns `{ status: 'ok', result: { sum: 13, product: 42 } }` and
reports about 0.5 fuel used, out of the 100 it asked for. Every operation the VM performs
costs fuel (an expression node costs 0.01, an atom call such as `storeGet` costs 5), so the
server knows what each request cost to run. The client chooses a budget, and `post` clamps
it to at most 10,000, so a client cannot buy unlimited work by asking for it.

**2. `while (true)`** is not detected as an infinite loop; it runs until its budget is
spent. The VM stops it at the first step that takes it past 50 fuel (that is why it reports
about 50.06) and `vm.run` returns `{ error }` with the message `Out of Fuel`. The endpoint
answers, and the next request is served as usual.

Fuel bounds computation. Waiting on a capability, such as a slow fetch, costs no fuel, so a
run also has a wall-clock limit. `post` sets it with `timeoutMs: 5000`. Without `timeoutMs`,
a run gets a default limit of at least 60 seconds, derived from the slowest registered atom.

**3. The same agent, sent by different callers,** reads different greetings. The agent
calls `storeGet({ key: 'greeting' })` with no `await`: atom calls are awaited implicitly.
The VM implements `storeGet` by calling `get(key)` on whatever `store` the host passed in
`capabilities`. `post` builds that store from the caller's token, so Alice's run can reach
Alice's data and nothing else. Mallory has no valid token and is turned away before the
source is even parsed, with zero fuel used. This is where authorization lives in this
design: not in the agent, and not in a check per route, but in which capabilities a run is
given.

**4. Source that does not parse** comes back as `Parse error: Unexpected token at
<source>:1:32`, with zero fuel used. This is the contrast case. `transpile` throws, like
any ordinary function, which is why `post` wraps it in `try`/`catch`. `vm.run` does not
throw, which is why the run in step 3 needs no `try` at all.

Three properties of the VM make this safe:

- **Fuel.** Work is metered, and the run ends when the budget is gone (test 2).
- **No ambient authority.** The VM has no IO of its own. It cannot read files, open sockets
  or make network requests unless the host grants it. Here the only capability is a
  per-caller store, so the agents can compute and read their own data, and nothing more
  (test 3).
- **Errors are values.** A failed run returns `{ error }` rather than throwing, so guest
  code never raises an exception in the endpoint's own control flow. That is why `post`
  reports "Out of Fuel" in the same shape as a success (test 2). The transpiler, which is
  host code, is not part of this promise (test 4).

Notice what the endpoint does *not* contain: no route per operation, no request schema per
operation, no deployment when the client wants a new query. The client's logic travels to
the data; the server decides what that logic may touch and how much it may spend.

## What you give up

The work does not disappear; it moves.

- **Discoverability.** Clients can only call atoms the VM has and read keys the store holds.
  You document that surface (the atoms you register, the capabilities you grant, the shape
  of the data) instead of documenting routes.
- **Cost inside the rules.** A tenant can do expensive but legal things to its own data.
  Fuel caps computation and quotas cap expensive atoms (below), but you choose the numbers.
- **Observability.** There is no route name to log. Log the agent (or a hash of its AST)
  and the run's `fuelUsed` and error, and use `vm.run(ast, args, { trace: true })` when you
  need to see what a run did step by step.

## Making it real

A production endpoint needs three more decisions. A sketch (host-side JavaScript, not
runnable on this page):

```javascript
// Client side: transpile before sending, and send the token.
import { transpile } from 'tjs-lang/lang'
const { ast } = transpile(agentSource)
await fetch('/agent', {
  method: 'POST',
  headers: { authorization: token, 'content-type': 'application/json' },
  body: JSON.stringify({ ast, args }),
})

// Server side: the VM with no parser in it.
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()

export async function post(req) {
  // storeFor as defined in the demo above. An absent `store` capability is
  // NOT refused: the VM falls back to a scratch in-memory store, and the
  // agent runs anyway. So check, and turn the caller away.
  const store = storeFor(req.headers.authorization)
  if (!store) return { status: 401, error: 'Unauthorized' }

  const { ast, args } = req.body
  const run = await vm.run(ast, args, {
    fuel: 1000,
    timeoutMs: 5000,
    maxHeapBytes: 16 * 1024 * 1024,
    // Only what this caller is entitled to. If you also grant `fetch` and
    // `llm` capabilities, the httpFetch and llmPredict atoms can use them.
    capabilities: { store },
    // Fuel is VM work; it cannot say "at most 3 model calls". Quotas can.
    quotas: { llmPredict: 3, httpFetch: 10 },
  })

  // Return a shaped reply, as the demo does, rather than the raw run object.
  if (run.error) return { status: 422, error: run.error.message }
  return { status: 200, result: run.result, fuelUsed: run.fuelUsed }
}
```

1. **Where parsing happens.** Parsing is the one step whose cost the *sender* controls and
   which runs before any fuel is charged. The live example authorizes first and then caps
   it with `transpile(source, { maxSourceBytes })`. Better: transpile on the client (or in
   a separate worker) and accept only an AST, served by `tjs-lang/vm-ast`, a VM bundle that
   contains no parser and so has no parser defect to reach. The demo above uses the full
   `tjs-lang` package only because it has to transpile in the page.
2. **Capabilities per caller.** Build them from the request's credentials, as `storeFor`
   does: a store scoped to the caller, a fetch limited to the hosts they may reach. Refuse
   the request when there are no credentials; do not run it without capabilities, because
   a missing store becomes a scratch store rather than an error.
3. **Quotas and space.** Fuel bounds work; `quotas` bounds how often an expensive atom may
   run; `maxHeapBytes` (default 64MB) bounds how much memory a run may hold at once.

## Limits

- **AJS is not all of JavaScript.** It is a subset with typed signatures: no classes, no
  `new`, no `this`, no prototype access, and a fixed table of callable methods. An agent
  that needs more asks the host to register an atom rather than reaching for the language.
- **Fuel is not money.** A fuel unit measures VM work. If an atom calls a paid API, cap it
  with a quota; do not try to price it in fuel.
- **A quota is per run.** It counts calls within one run. If a capability starts another
  `vm.run`, pass the same `quotaUsed` object (start it as `{}`) in the run options of both
  runs, or the nested run starts with a fresh allowance.

The [AJS book](/ajs/) covers the language, the atoms and the security model in full.
