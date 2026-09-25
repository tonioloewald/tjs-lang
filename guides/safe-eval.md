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

## Untrusted code, bounded

```typescript
import { Eval } from 'tjs-lang/eval'

// Whitelist-wrapped fetch - untrusted code only reaches your domains
const safeFetch = (url: string) => {
  const allowed = ['api.example.com', 'cdn.example.com']
  const host = new URL(url).host
  if (!allowed.includes(host)) {
    return { error: 'Domain not allowed' }
  }
  return fetch(url)
}

const { result, fuelUsed } = await Eval({
  code: `
    let data = fetch('https://api.example.com/products')
    return data.filter(x => x.price < budget)
  `,
  context: { budget: 100 },
  fuel: 1000,
  capabilities: { fetch: safeFetch }, // Only whitelisted domains
})
```

The untrusted code thinks it has `fetch`, but it only has _your_ `fetch`. No CSP violations. No infinite loops. No access to anything you didn't explicitly grant.

**What the sandbox guarantees, and what it doesn't** (as of v0.12.0 — be precise here, because
a security claim you can't cash is worse than none):

- **Termination is guaranteed, not decided.** Fuel metering sidesteps the halting problem
  rather than solving it: every atom costs fuel and execution stops when it runs out, so a
  program either finishes or is killed. There is no "will it halt?" question to answer.
- **No ambient authority.** The VM has zero IO by default; the only way out is a capability you
  inject. Every atom touching one is tagged `effects: 'io'` and that tagging is itself
  test-guarded, so the audit surface is enumerable.
- **The guest holds data, not references.** Capability returns cross a `structuredClone`
  membrane, so a guest can't reach a host object or mutate one you still hold.
- **Layered and tested — not formally proven.** The properties above are structural and could
  in principle be proven; today they are enforced by construction and covered by an adversarial
  test suite. Treat "proven" as the roadmap, not the current state.
- **Known gap: cross-endpoint amplification.** Recursive agent calls are bounded by a depth
  header (`X-Agent-Depth`, max 10), but that is **cooperative** — it stops accidental loops and
  friendly infrastructure, not an adversarial endpoint that simply drops the header. If you
  expose completely open endpoints, rate-limit them.
- **Out of scope:** timing side channels, JS-engine JIT bugs, and memory-level attacks. A
  JS-in-JS sandbox cannot address those; put process isolation underneath if your threat model
  includes them.

![Safe Eval: Capability-Based Security](../docs/diagrams/safe-eval.svg)

## `Eval` and `SafeFunction`

Safe replacements for `new Function()` and `eval()` with typed inputs/outputs:

```javascript
// SafeFunction - create a typed async function from code
const add = await SafeFunction({
  inputs: { a: 0, b: 0 }, // typed parameters
  output: 0, // typed return
  body: 'return a + b',
})
await add(1, 2) // 3
await add('x', 2) // Error: invalid input 'a'

// Eval - evaluate code once with typed result
const result = await Eval({
  code: 'a + b',
  context: { a: 1, b: 2 },
  output: 0,
}) // 3
```

**Key safety features:**

- **Typed inputs/outputs** - validated at runtime
- **Async execution** - can timeout, won't block
- **Explicit context** - no implicit scope access
- **Injectable capabilities** - fetch, console, etc. must be provided

```javascript
// With capabilities and timeout
const fetcher = await SafeFunction({
  inputs: { url: '' },
  output: { data: [] },
  body: 'return await fetch(url).then(r => r.json())',
  capabilities: { fetch: globalThis.fetch },
  timeoutMs: 10000,
})

const data = await Eval({
  code: 'await fetch(url).then(r => r.json())',
  context: { url: 'https://api.example.com' },
  output: { items: [] },
  capabilities: { fetch: globalThis.fetch },
})
```

Both functions return errors as values (monadic) rather than throwing.
