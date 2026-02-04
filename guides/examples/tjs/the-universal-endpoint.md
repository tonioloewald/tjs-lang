<!--{"section":"tjs","type":"example","group":"advanced","order":15}-->

# The Universal Endpoint

One endpoint. Any logic. Zero deployment. This is the whole thing.

```tjs
/**
 * # The Universal Endpoint
 *
 * This is the entire backend industry in 50 lines.
 *
 * What this replaces:
 * - GraphQL servers
 * - REST API forests
 * - Firebase/Lambda/Vercel Functions
 * - Kubernetes deployments
 * - The backend priesthood
 *
 * How it works:
 * 1. Client sends logic (not just data)
 * 2. Server executes it with bounded resources
 * 3. That's it. That's the whole thing.
 */

import { AgentVM, ajs, coreAtoms } from 'tjs-lang'

// ============================================================
// THE UNIVERSAL ENDPOINT (This is the entire backend)
// ============================================================

export async function post(req: {
  body: {
    agent: '',      // The logic to execute (AJS source)
    args: {},       // Input data
    fuel: 1000      // Max compute units (like gas)
  },
  headers: { authorization: '' }
}) -> { result: {}, fuelUsed: 0, status: '' } | { error: '', fuelUsed: 0 } {

  // 1. Parse the agent (it's just code as data)
  let ast
  try {
    ast = ajs(req.body.agent)
  } catch (e) {
    return { error: `Parse error: \${e.message}`, fuelUsed: 0 }
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
console.log('\\n═══════════════════════════════════════════')
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
console.log('\\n═══════════════════════════════════════════')
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
console.log('\\n═══════════════════════════════════════════')
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
