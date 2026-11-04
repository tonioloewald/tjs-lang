<!--{"section": "tjs", "type": "example", "group": "advanced", "order": 15, "parent": "tjs-advanced.md"}-->

# The Universal Endpoint

One endpoint. Any logic. Zero deployment. This is the whole thing.

```tjs:inline
/#
## The Universal Endpoint

This is the entire backend industry in 50 lines.

What this replaces:
- GraphQL servers
- REST API forests
- Firebase/Lambda/Vercel Functions
- Kubernetes deployments
- The backend priesthood

How it works:
1. Client sends logic (not just data)
2. Server executes it with bounded resources
3. That's it. That's the whole thing.
#/

import { AgentVM, transpile } from 'tjs-lang'

// ============================================================
// THE UNIVERSAL ENDPOINT (This is the entire backend)
// ============================================================

async function post(req: {
  body: {
    agent: '',      // The logic to execute (AJS source)
    args: {},       // Input data
    fuel: 1000      // Max compute units (like gas)
  },
  headers: { authorization: '' }
}): { result: {}, fuelUsed: 0, status: '' } | { error: '', fuelUsed: 0 } {

  // 1. Parse the agent (it's just code as data). Parsing runs BEFORE any fuel
  //    budget, so untrusted source gets a size cap first.
  let ast
  try {
    ast = transpile(req.body.agent, { maxSourceBytes: 16_000 }).ast
  } catch (e) {
    return { error: `Parse error: ${e.message}`, fuelUsed: 0 }
  }

  // 2. Create VM with capabilities (this is what you monetize)
  const vm = new AgentVM({
    // Your database, your auth, your AI - exposed as capabilities
    // Agents can only do what you allow
  })

  // 3. Execute with bounded resources
  const result = await vm.run(ast, req.body.args, {
    fuel: Math.min(req.body.fuel, 10000),  // Cap fuel
    timeoutMs: 5000                         // Cap time
  })

  // 4. Return result (or error - but we didn't crash)
  if (result.error) {
    return {
      error: result.error.message,
      fuelUsed: result.fuelUsed,
    }
  }

  return {
    result: result.result,
    fuelUsed: result.fuelUsed,
    status: 'success'
  }
}

// ============================================================
// DEMO: Let's use it
// ============================================================

// Simulate the endpoint
const endpoint = post

// --- TEST 1: Simple computation (Success) ---
console.log('═══════════════════════════════════════════')
console.log('TEST 1: Simple Agent')
console.log('═══════════════════════════════════════════')

const simpleAgent = `
  function compute({ x, y }) {
    let sum = x + y
    let product = x * y
    return { sum, product, message: 'Math is easy' }
  }
`

const result1 = await endpoint({
  body: { agent: simpleAgent, args: { x: 7, y: 6 }, fuel: 100 },
  headers: { authorization: 'token_123' }
})

console.log('Agent: compute({ x: 7, y: 6 })')
console.log('Result:', result1.result)
console.log('Fuel used:', result1.fuelUsed)
console.log('Status: ✓ Success')


// --- TEST 2: Infinite loop (Fuel Exhausted) ---
console.log('\n═══════════════════════════════════════════')
console.log('TEST 2: Malicious Agent (Infinite Loop)')
console.log('═══════════════════════════════════════════')

const maliciousAgent = `
  function attack({ }) {
    let i = 0
    while (true) {
      i = i + 1
      // This would hang your Express server forever
      // This would cost you $10,000 on Lambda
      // This would crash your Kubernetes pod
    }
    return { i }
  }
`

const result2 = await endpoint({
  body: { agent: maliciousAgent, args: {}, fuel: 50 },
  headers: { authorization: 'token_123' }
})

console.log('Agent: while (true) { ... }')
console.log('Error:', result2.error)
console.log('Fuel used:', result2.fuelUsed, '(exhausted at limit)')
console.log('Status: ✗ Safely terminated')


// --- TEST 3: Complex computation (Metered) ---
console.log('\n═══════════════════════════════════════════')
console.log('TEST 3: Complex Agent (Metered)')
console.log('═══════════════════════════════════════════')

const complexAgent = `
  function fibonacci({ n }) {
    if (n <= 1) return { result: n }

    let a = 0
    let b = 1
    let i = 2
    while (i <= n) {
      let temp = a + b
      a = b
      b = temp
      i = i + 1
    }
    return { result: b, iterations: n }
  }
`

const result3 = await endpoint({
  body: { agent: complexAgent, args: { n: 20 }, fuel: 500 },
  headers: { authorization: 'token_123' }
})

console.log('Agent: fibonacci({ n: 20 })')
console.log('Result:', result3.result)
console.log('Fuel used:', result3.fuelUsed)
console.log('Status: ✓ Success (metered)')


// --- THE PUNCHLINE ---
console.log('\n═══════════════════════════════════════════')
console.log('THE PUNCHLINE')
console.log('═══════════════════════════════════════════')
console.log(`
Your current backend?
  - The infinite loop would have HUNG your server
  - Or cost you THOUSANDS on Lambda
  - Or crashed your Kubernetes pod
  - Or required a "senior engineer" to add timeout logic

Tosi?
  - Charged 50 fuel units
  - Returned an error
  - Kept running
  - Total code: 50 lines

This is the entire backend industry.

One endpoint.
Any logic.
Zero deployment.
Everyone is full stack now.
`)
```

<!-- TODO review -->
## What is actually going on

The endpoint receives **source code** as data, turns it into an AJS abstract syntax tree
(plain JSON), and runs that tree on `AgentVM`. Three properties of the VM make that safe to do
with code you did not write:

- **Fuel.** Every operation the VM performs costs fuel, and the run stops when the budget is
  spent. Test 2's `while (true)` is not detected as an infinite loop; it simply runs out of
  money. Fuel is the *time* budget: by default a run also gets a wall-clock timeout of
  fuel × 10ms, and `timeoutMs` overrides it.
- **No ambient authority.** The VM has no IO of its own. It cannot read files, open sockets
  or call `fetch` unless the host passes a capability in. The `new AgentVM({})` here has
  nothing extra, so the agents can only compute.
- **Errors are values.** A failed run returns `{ error }` rather than throwing, so the
  endpoint's own control flow never sees an exception from guest code. That is why `post`
  can report "Out of Fuel" in the same shape as a success.

Notice also what the endpoint does *not* contain: no route per operation, no request schema
per operation, no deployment step when the client wants a new query. The client's logic
travels to the data; the server decides only what the logic may touch and how much it may
spend.

<!-- TODO review -->
## Making it real

The example is the whole idea, but a production endpoint needs three more decisions. A
sketch (host-side JavaScript, not runnable on this page):

```typescript
import { AgentVM } from 'tjs-lang/vm-ast' // the VM with no parser in it

const vm = new AgentVM()

export async function post(req) {
  // The CLIENT transpiled its agent and sent the AST, so nothing is parsed here.
  const { ast, args } = req.body
  return vm.run(ast, args, {
    fuel: 1000,
    timeoutMs: 5000,
    // Only what this caller is entitled to:
    capabilities: { store: storeFor(req.headers.authorization) },
    // Fuel is VM work; it cannot say "at most 3 model calls". Quotas can.
    quotas: { llmPredict: 3, httpFetch: 10 },
  })
}
```

1. **Where parsing happens.** Parsing is the one step whose cost the *sender* controls and
   which runs before any fuel is charged. The live example caps it with
   `transpile(source, { maxSourceBytes })`. Better still, transpile on the client (or in a
   separate worker) and accept only an AST, served by `tjs-lang/vm-ast`, a VM bundle that
   contains no parser at all and so has no parser defect to reach.
2. **Capabilities per caller.** Capabilities are where authorization lives. Build them from
   the request's credentials: a store scoped to the caller, a fetch limited to the hosts
   they may reach.
3. **Quotas and space.** Fuel bounds work; `quotas` bounds how often an expensive atom may
   run; `maxHeapBytes` (default 64MB) bounds how much memory a run may hold at once.

<!-- TODO review -->
## Limits

- **AJS is not all of JavaScript.** It is a subset with typed signatures: no classes, no
  `new`, no `this`, no prototype access, and a fixed table of callable methods. Agents that
  need more ask the host for an atom (a named capability) rather than reaching for the
  language.
- **Fuel is not money.** A fuel unit measures VM work. If an atom calls a paid API, cap it
  with a quota; do not try to price it in fuel.
- **A quota is per run.** It counts calls within one run. If a
  capability starts another `vm.run`, pass the same `quotaUsed` object to both, or the nested
  run starts with a fresh allowance.

The [AJS book](/ajs/) covers the language, the atoms and the security model in full.
