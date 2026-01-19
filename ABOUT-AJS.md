# AJS: The Guest Language

**Safe eval for the cloud. Code that travels to data.**

AJS (AsyncJS) is a JavaScript subset that compiles to portable JSON AST. It's the **payload** that runs inside [TJS hosts](./ABOUT-TJS.md)—sandboxed, metered, and safe to execute from any source.

---

## The Architecture: Browser Model for the Cloud

We separate **Host** (infrastructure you deploy once) from **Guest** (logic that ships continuously).

| | **TJS (Host)** | **AJS (Guest)** |
|---|---|---|
| **Role** | Defines the physics—capabilities, resources, safety | The portable logic payload |
| **You write** | Your service layer, frontend, capabilities | Agents, workflows, LLM-generated code |
| **Deploys** | Once, then evolves | Continuously, as data |
| **Trust level** | Trusted code you control | Untrusted code from anywhere |

**Together:** Deploy TJS once to create a secure, high-performance Universal Endpoint. Ship AJS continuously to execute logic where the data lives.

**See also:** [TJS Documentation](./ABOUT-TJS.md) for the Host language.

---

## Why AJS is the Perfect Payload

### 1. A Practical Solution to the Halting Problem

You can't know if arbitrary code will terminate. But you can **bound** it:

```typescript
const result = await vm.run(agent, args, { 
  fuel: 1000,      // CPU budget
  timeoutMs: 5000  // Wall-clock limit
})

if (result.fuelExhausted) {
  // Agent tried to run forever—stopped safely
}
```

- **Fuel metering:** Every operation costs fuel. Loops can't run forever.
- **Proportional charging:** Large allocations cost more. Memory bombs exhaust fuel first.
- **Timeout enforcement:** Slow I/O can't hang the host.

**The CTO pitch:** "This won't hang your server."

### 2. Small Enough for LLMs

AJS syntax is simple enough for **4B parameter models** to generate correctly:

```javascript
function searchAndSummarize({ query }) {
  let results = httpFetch({ url: `https://api.example.com/search?q=${query}` })
  let summary = llmPredict({ 
    prompt: `Summarize these results: ${JSON.stringify(results)}` 
  })
  return { query, summary }
}
```

- **No closures, classes, or prototypes:** Less to hallucinate
- **Familiar syntax:** JavaScript developers read it instantly
- **JSON AST:** LLMs can generate the AST directly if needed

**The AI pitch:** "It fits in the context window and the model doesn't hallucinate syntax."

### 3. Capability-Based Security

The VM starts with **zero capabilities**. The host grants exactly what each agent needs:

```typescript
// Host decides what this agent can do
const capabilities = {
  fetch: createFetchCapability({ 
    allowedHosts: ['api.example.com']  // No SSRF
  }),
  store: createReadOnlyStore(),         // Can read, can't write
  // No LLM capability—this agent can't call AI
}

await vm.run(agent, args, { capabilities })
```

- **Zero trust by default:** No network, no storage, no filesystem
- **Explicit grants:** Audit trail of what each agent can access
- **Scoped access:** Read-only store, allowlisted URLs, rate limits

### 4. JSON is the Program

AJS compiles to JSON AST. The code **is** data:

```json
{
  "$seq": [
    { "$op": "httpFetch", "url": { "$expr": "template", "tmpl": "..." } },
    { "$op": "varSet", "name": "results", "value": { "$expr": "ident", "name": "fetched" } },
    { "$op": "return", "value": { "$expr": "ident", "name": "results" } }
  ]
}
```

- **Portable:** Send it anywhere, execute it anywhere
- **Inspectable:** Audit what code does before running it
- **Versionable:** Store agents in databases, diff them, roll back
- **Transformable:** Programmatically modify agents

---

## The Universal Endpoint

One endpoint. Any agent. Zero deployment.

```typescript
// TJS host: deployed once
app.post('/execute', async (req, res) => {
  const { agent, args, apiKey } = req.body
  
  // Validate and parse the agent
  const ast = ajs(agent)
  
  // Get capabilities for this API key
  const capabilities = getCapabilitiesForKey(apiKey)
  
  // Execute with limits
  const result = await vm.run(ast, args, {
    fuel: 1000,
    timeoutMs: 5000,
    capabilities
  })
  
  res.json(result)
})
```

**What this replaces:**
- Deploying a new service for each workflow
- Building bespoke APIs for each integration
- Managing containers for each agent
- Cold start latency for serverless functions

**What you get:**
- One hot endpoint that runs any valid agent
- Per-request resource limits
- Per-key capability scoping
- Full execution tracing

---

## For Different Audiences

### For the CEO

**Turn infrastructure into a platform.**

- **Zero-deploy agents:** Ship new logic without touching infrastructure
- **Vendor flexibility:** Agents are JSON—run them anywhere
- **Cost control:** Fuel budgets cap compute per request
- **AI-native:** LLMs generate agents at runtime

### For the CTO

**Safe execution of untrusted code at scale.**

- **Bounded execution:** Fuel + timeout = predictable resource usage
- **Capability-based security:** Explicit grants, not ambient authority
- **Horizontal scaling:** Stateless VM, inject capabilities
- **Minimal supply chain:** 2 deps, zero transitive

### For the Security Consultant

**Defense in depth.**

- **Resource controls:** Fuel metering, proportional charging, timeouts
- **Sandboxing:** Zero capabilities by default, prototype blocking, no eval
- **SSRF protection:** URL allowlists, blocked private IPs
- **Tested threats:** 650+ tests, 98% coverage on runtime

### For the Data Scientist

**AI agent orchestration.**

- **RAG pipelines as JSON:** Portable, inspectable, versionable
- **Structured outputs:** Schema validation for LLM responses
- **Vector search:** Built-in cosine similarity, 10K vectors in ~15ms
- **Agent composition:** Agents calling agents, depth-bounded

---

## Security Model

### What AJS Prevents

| Threat | Defense |
|--------|---------|
| Infinite loops | Fuel exhaustion |
| Memory bombs | Proportional fuel charging |
| SSRF | URL allowlists |
| Prototype pollution | Blocked property access |
| Code injection | AST nodes, not eval |
| ReDoS | Suspicious regex rejection |

### What the Host Controls

| Resource | Mechanism |
|----------|-----------|
| CPU | Fuel budget |
| Memory | Proportional charging |
| Time | Timeout enforcement |
| Network | Capability allowlists |
| Storage | Capability scoping |
| Recursion | Depth protocol |

### Attack Surface

- Custom atoms are **trusted code**—host responsibility
- Capabilities determine exposure—misconfigured fetch is still dangerous
- The VM prevents malicious **agents**, not malicious **atom implementations**

---

## Performance

- **100 agents in ~6ms** (torture test)
- **~0.01 fuel per expression**
- **Proportional memory charging** prevents runaway allocations

AJS is interpreted (JSON AST), so it's slower than native JS. But:
- Execution is predictable and bounded
- I/O dominates most agent workloads
- Tracing is free (built into the VM)

For compute-heavy operations, use TJS with `wasm {}` blocks in capabilities.

---

## The Pitch

> **Ship code to data instead of shipping data to code.**

AJS is the "practical solution to the halting problem" that makes Universal Endpoints possible:

1. **Parse** user-submitted / LLM-generated code safely
2. **Sandbox** it with capability-based security
3. **Meter** it with fuel and timeouts
4. **Execute** it where the data lives

**The result:** One endpoint replaces infinite bespoke APIs. Deploy infrastructure once, ship agents forever.

---

## Quick Links

- [TJS: The Host Language](./ABOUT-TJS.md)
- [Technical Documentation](./CONTEXT.md)
- [Playground](./demo/)
- [GitHub](https://github.com/tonioloewald/tosijs-agent)
