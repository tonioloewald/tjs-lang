<!--{"parent": "ajs.md", "order": 2}-->

# Safe Eval

`eval` is too powerful to be allowed, which in practice means it is useless: no one sensible
lets untrusted code run with the full authority of the page, so the most dynamic feature in the
language goes unused. The goal was the opposite trade — make something **as powerful as
possible while still being safe** — and what came out is safer than the code around it. The
code that calls it is not guaranteed to halt, and neither is the code it calls; Safe Eval is.
So eval goes from the most dangerous execution environment in a project to the least dangerous.

It is the same machine as AJS — a fuel-metered VM with no ambient authority — exposed as the
two calls JavaScript already has: `eval()` becomes `Eval`, `new Function()` becomes
`SafeFunction`.

## `Eval` — run code once

`Eval` runs a snippet of code in the sandbox and returns what it produced, with the fuel it
used. The code sees only the `context` you hand it.

```js
import { Eval, SafeFunction } from 'tjs-lang/eval'

const { result, fuelUsed } = await Eval({ code: 'a + b', context: { a: 1, b: 2 } })
console.log(result) // → 3
console.log(fuelUsed > 0) // → true
```

Only context keys the code uses as names become variables, and a key never replaces a
builtin: a context entry called `Math` or `NaN` is ignored rather than rebinding it. A local
the code declares (`let a = …` or `const a = …`) shadows a context key of the same name.

<!-- TODO review -->
The code is [AJS](/DOCS-AJS/): a JavaScript subset, so most expressions and statements read as
you expect, with AJS's rules (no `new`, no `class`, no `throw`, operators that refuse to turn an
array into a string). A bare expression returns its value; with statements, `return` what you
want back.

The context is **copied** in, never shared. The code can reassign a name it was given, but what it
holds is its own copy, so the object you passed is untouched:

```js
const settings = { limit: 5 }
const raised = await Eval({
  code: 'settings = { limit: 500 }\nreturn settings.limit',
  context: { settings },
})
console.log(raised.result) // → 500
console.log(settings.limit) // → 5
```

## `SafeFunction` — compile once, call many times

`SafeFunction` turns a function body into a callable. Its parameters are **names**, and each
call returns the same shape as `Eval`.

```js
const add = await SafeFunction({ params: ['a', 'b'], body: 'return a + b' })
console.log((await add(1, 2)).result) // → 3
console.log((await add(20, 22)).result) // → 42
```

<!-- TODO review -->
The budget belongs to each **call**, not to the function. That makes `SafeFunction` the right
shape for logic someone else writes and you run many times, such as a pricing rule an
administrator typed into a settings page:

```js
const ruleSource = 'if (qty >= 10) {\n  return price * qty * 0.9\n}\nreturn price * qty'
const priceRule = await SafeFunction({
  params: ['price', 'qty'],
  body: ruleSource,
  fuel: 100,
})
console.log((await priceRule(4, 10)).result) // → 36
console.log((await priceRule(4, 2)).result) // → 8
```

The rule is text you can store, version and show to the person who wrote it; it can compute, but
it cannot read a file, call a server or loop forever.

## Nothing runs forever

Every step costs fuel, and a run that spends its budget is stopped. The failure comes back as a
value — an `error` alongside the result — rather than as an exception the caller has to catch.

```js
const runaway = await Eval({
  code: 'let i = 0\nwhile (true) { i = i + 1 }\nreturn i',
  fuel: 100,
})
console.log(runaway.error.message) // → Out of Fuel
```

Creating a `SafeFunction` is the exception: a body that does not parse, or is over the source
size limit, throws when you create it — before any untrusted code has run.

<!-- TODO review -->
Fuel is not the only stop. Slow IO does not burn fuel while it waits, so a wall-clock
`timeoutMs` (by default ten milliseconds per unit of fuel) ends a run that is merely waiting,
and cancels the request it was waiting on:

```js
const slow = await Eval({
  code: "return httpFetch({ url: 'https://api.example.com/products' })",
  capabilities: {
    fetch: () => new Promise((resolve) => setTimeout(() => resolve([]), 500)),
  },
  timeoutMs: 50,
})
console.log(slow.error.message.startsWith('Execution timeout after 50ms')) // → true
```

<!-- TODO review -->
## Errors are values

Every failure inside the sandbox comes back the same way, in `error`: running out of fuel or
time, a missing capability, a forbidden property, a bug in the code. Your code never needs a
`try` around `Eval`, and untrusted code cannot make it throw.

```js
const nosy = await Eval({ code: 'cfg.constructor', context: { cfg: {} } })
console.log(nosy.error.message) // → Security Error: Access to 'constructor' is forbidden

const noModel = await Eval({ code: "return llmPredict({ prompt: 'hi' })" })
console.log(noModel.error.message) // → Capability 'llm.predict' missing
```

The code can catch failures of the world, a request that fails or a domain that is not allowed,
with `try`/`catch`, and fall back:

```js
const offline = await Eval({
  code: "try {\n  return httpFetch({ url: 'https://api.example.com/products' })\n} catch (e) {\n  return 'fallback: ' + e\n}",
  capabilities: {
    fetch: async () => {
      throw new Error('network down')
    },
  },
})
console.log(offline.result) // → fallback: network down
```

In the `catch`, `e` is the error's message, a string.

## Nothing reaches out unless you allow it

The sandbox has no network, no file system and no globals. Network access goes through the
`httpFetch` atom, and only if you inject a `fetch` capability — so the untrusted code gets
_your_ `fetch`, with whatever rules you put in it.

A `fetch` capability returns the response **body** as plain data, not a `Response`: everything
a capability returns is copied across a boundary before the guest sees it, so the guest never
holds a live host object.

```js
// `init` (method, headers, body) is chosen by the UNTRUSTED code. The VM admits its shape first
// (http/https only, GET/HEAD unless you allow more, a closed list of headers); your fetch decides
// where it may go, and should not follow redirects or send ambient credentials.
const allowed = ['api.example.com']
const safeFetch = (url, init) => {
  const { protocol, hostname } = new URL(url)
  if (protocol !== 'https:' || !allowed.includes(hostname)) {
    throw new Error(`Domain not allowed: ${hostname}`)
  }
  return fetch(url, { ...init, redirect: 'error', credentials: 'omit' }).then((r) =>
    r.json()
  ) // the BODY, not the Response
}

const cheap = await Eval({
  code: `
    let products = httpFetch({ url: 'https://api.example.com/products' })
    return products.filter(x => x.price < budget)
  `,
  context: { budget: 100 },
  capabilities: { fetch: safeFetch },
})
console.log(cheap.result) // → [{"name":"widget","price":40}]

const blocked = await Eval({
  code: "return httpFetch({ url: 'https://evil.example.net/steal' })",
  capabilities: { fetch: safeFetch },
})
console.log(blocked.error.message) // → Domain not allowed: evil.example.net
```

<!-- TODO review -->
You can also state the policy as data, with `fetchPolicy`, which the VM enforces before your
`fetch` is called. `domains` is an allowlist; `methods` and `headers` widen what the guest may
send (GET and HEAD, and a closed list of headers, by default). The guest never sees the policy:

```js
const policed = await Eval({
  code: "return httpFetch({ url: 'https://other.example.org/data' })",
  capabilities: { fetch: safeFetch },
  fetchPolicy: { domains: ['api.example.com'] },
})
console.log(policed.error.message) // → Fetch blocked: domain not in allowlist. Allowed: api.example.com

const posting = await Eval({
  code: "return httpFetch({ url: 'https://api.example.com/products', method: 'POST', body: { name: 'x' } })",
  capabilities: { fetch: safeFetch },
})
console.log(posting.error.message.includes("method 'POST' is not allowed")) // → true
```

<!-- TODO review -->
A capability is your code, and the boundary holds it to the same rule as the guest: what crosses
is plain data. A capability that returns something JSON cannot express (here, the `Response`
itself) is a bug in the host, and it ends the run even inside the guest's `try`, so a guest cannot
keep retrying it:

```js
const leaky = await Eval({
  code: "try {\n  let r = httpFetch({ url: 'https://api.example.com/products' })\n  return 'got it'\n} catch (e) {\n  return 'caught'\n}",
  capabilities: { fetch: (url) => fetch(url) }, // returns the Response: a host bug
})
console.log(leaky.result === 'caught') // → false
console.log(leaky.error.message.includes('instance of Response')) // → true
```

<!-- TODO review -->
## Host objects stay outside

Context values cross the same boundary. Plain data (objects, arrays, strings, numbers, booleans,
`null`, and `Date`) is copied in; a class instance is refused rather than thinned, because its
getters and private fields would silently read as `undefined` on the other side:

```js
class Account {
  constructor(balance) {
    this.balance = balance
  }
}
const live = await Eval({ code: 'account.balance', context: { account: new Account(10) } })
console.log(live.error.message.includes('instance of Account')) // → true

const copied = await Eval({ code: 'account.balance', context: { account: { balance: 10 } } })
console.log(copied.result) // → 10
```

Pass the fields the code needs, by name. The same goes for what a capability returns: build a
plain object (`{ ok: res.ok, status: res.status, body }`), and do not spread a host object, which
silently copies nothing from its prototype.

<!-- TODO review -->
## A model is a capability too

`llmPredict` calls the `llm.predict` function you inject, so the guest can use a model without
knowing which one, where it runs, or what key it uses:

```js
const answered = await Eval({
  code: "return llmPredict({ prompt: 'Summarize: ' + text })",
  context: { text: 'Fuel bounds work.' },
  capabilities: {
    llm: { predict: async (prompt) => `(a summary of ${prompt.length} characters)` },
  },
})
console.log(answered.result) // → (a summary of 28 characters)
console.log(answered.fuelUsed >= 100) // → true
```

A model call costs 100 units of fuel whatever it costs you. To cap calls in money terms, use the
VM directly and set `quotas` (next section).

<!-- TODO review -->
## When to reach for `AgentVM` instead

`Eval` and `SafeFunction` are the two-line entry points: source in, `{ result, fuelUsed, error }`
out, with fuel, a timeout, capabilities, a fetch policy and size caps. Use `AgentVM` directly
(see [the AJS guide](/DOCS-AJS/)) when you need more than that:

- **Per-atom call quotas** (`quotas: { llmPredict: 3 }`) and a memory ceiling of your choosing
  (`maxHeapBytes`).
- **Separate compile and run.** Transpile on a trusted machine (or the client's), store the JSON
  AST, and run it later with `tjs-lang/vm-ast`, a VM with no parser in it. A sandbox that cannot
  parse has no parser bug to reach.
- **Tracing** (`trace: true`), to see every step and what it cost.
- **Your own atoms**, registered with the VM and checked by the transpiler.

## What the sandbox guarantees, and what it does not

Be precise here: a security claim you cannot cash is worse than none.

- **Termination is guaranteed, not decided.** Fuel metering sidesteps the halting problem
  rather than solving it: every step costs fuel and execution stops when it runs out, so a
  program either finishes or is stopped. A wall-clock timeout (by default ten milliseconds per
  unit of fuel) backs it up, and a stopped run cancels any request it had in flight.
- **Bounded memory.** The VM caps how much the guest can hold live at once (64 MB by default),
  separately from fuel, which bounds only how much work it does.
- **Bounded input.** Source over 8 KB is refused _before_ it is transpiled, because
  transpiling runs before fuel and the timeout apply. Raise or disable the cap with
  `maxSourceBytes` for trusted source you pass in; for source the agent builds at run time
  (`runCode`, `transpileCode`) it can only be lowered, since that text may come from a model. Serving untrusted callers? Have them send an AST
  (transpiled on their side) and run it with `tjs-lang/vm-ast`, which contains no parser.
- **No ambient authority.** The VM has no IO by default; the only way out is a capability you
  inject, and every atom that touches one is tagged as IO — a tagging that is itself tested, so
  the list of ways out can be enumerated.
- **The guest holds data, not references.** Capability returns cross a membrane that builds a
  fresh copy of JSON data plus `Date`, so guest code cannot reach a host object or mutate one you
  still hold. Anything else (a `Response`, a function, an object with getters, a `Map`, a typed
  array) is rejected rather than passed through.
- **Layered and tested — not formally proven.** These properties are structural and could in
  principle be proven; today they are enforced by construction and covered by an adversarial
  test suite.
- **Known gap: cross-endpoint amplification.** Recursive agent calls are bounded by a depth
  header (`X-Agent-Depth`, max 10), but that is **cooperative** — it stops accidental loops,
  not an adversarial endpoint that drops the header. Rate-limit completely open endpoints.
- **Out of scope:** timing side channels, JavaScript-engine JIT bugs and memory-level attacks.
  A JavaScript-in-JavaScript sandbox cannot address those; put process isolation underneath if
  your threat model includes them.

![Safe Eval: capability-based security](../docs/diagrams/safe-eval.svg)
