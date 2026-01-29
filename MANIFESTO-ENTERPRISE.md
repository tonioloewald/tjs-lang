<!--{"section": "meta", "order": 2, "navTitle": "For Enterprise"}-->

# Governance: Safe Execution of Untrusted Logic

**Adopt AI Agents without exposing your database to the Wild West.**

---

## The Problem

You want to run user-submitted code. Or LLM-generated agents. Or third-party integrations. But JavaScript has no sandbox, no resource limits, and no capability controls.

Every eval is a security incident waiting to happen. Every webhook is a potential DoS vector. Every "plugin system" is an attack surface.

The choice has been: accept the risk, or don't run untrusted code at all.

---

## The TJS Win

**"The Platform defines the capabilities. The Guest cannot escape them."**

TJS is the language you use to build the trusted infrastructure—your servers, your APIs, your capability boundaries. It's designed to never crash, even when guests misbehave.

### Monadic Errors: Exceptions are for Amateurs

No unhandled exceptions. Ever.

```typescript
const result = createUser({ name: 123 })
// Returns: { $error: true, message: 'Invalid input', path: 'createUser.input' }

if (result.$error) {
  // Handle gracefully - log, retry, return to caller
  return { status: 'invalid', details: result }
}
```

Type failures return error objects, not exceptions. The host survives anything the guest throws at it.

**TJS changes the physics of failure.** In every other language, a runtime type error is a catastrophe—uncaught exception, stack trace, 500 server error. In TJS, a type error is just _data_.

Most developers see: `TypeError: Cannot read property 'x' of undefined at anonymous:5:12`

Translation: "Something broke somewhere. Good luck."

In TJS Safe Mode, the error looks like:

```javascript
{
  $error: true,
  message: "Expected 'positive number', got -5",
  path: "calculateTax.input.price"
}
```

Translation: "The function `calculateTax` received a bad `price`."

**You trace the error to the source (the caller), not the symptom (the crash).**

This means your "Universal Endpoint" cannot crash due to bad data. It simply refuses the contract and tells the caller exactly why. Contracts are for pros.

### Full Introspection

Every function carries its type metadata at runtime:

```typescript
console.log(createUser.__tjs)
// {
//   params: { input: { type: { kind: 'object', shape: { name: 'string' } } } },
//   returns: { kind: 'object', shape: { id: 'number' } }
// }
```

Audit trail of what code does what. No runtime surprises.

### Minimal Supply Chain

- **2 dependencies** (acorn parser, tosijs-schema)
- **Zero transitive dependencies**
- **~33KB gzipped** total

Less code to audit. Smaller attack surface.

---

## The AJS Win

**"Every agent execution is gas-limited, auditable, and sandboxed. No infinite loops. No data exfiltration."**

AJS is the language for untrusted code—user scripts, LLM-generated agents, third-party logic. It compiles to JSON and runs in an isolated VM with strict resource controls.

### Capability-Based Security

The VM starts with **zero capabilities**. No network. No storage. No filesystem. Nothing.

You grant exactly what each agent needs:

```typescript
const capabilities = {
  fetch: createFetchCapability({
    allowedHosts: ['api.example.com'], // Only these domains
  }),
  store: createReadOnlyStore(), // Read but not write
  // No LLM capability - this agent can't call AI
}

await vm.run(agent, args, { capabilities })
```

If you don't grant it, the agent can't do it.

### Fuel Metering

Every operation costs fuel. Loops can't run forever:

```typescript
const result = await vm.run(agent, args, {
  fuel: 1000, // CPU budget
  timeoutMs: 5000, // Wall-clock limit
})

if (result.fuelExhausted) {
  // Agent tried to run forever - stopped safely
}
```

Large allocations cost more fuel. Memory bombs exhaust their budget before they explode.

### Timeout Enforcement

Fuel protects against CPU abuse. Timeouts protect against I/O abuse:

```typescript
await vm.run(agent, args, {
  fuel: 1000,
  timeoutMs: 5000, // 5 second hard limit
})
```

Slow network calls can't hang your servers.

---

## Threat Model

| Threat                  | Defense                                              |
| ----------------------- | ---------------------------------------------------- |
| **Infinite loops**      | Fuel exhaustion - every op costs gas                 |
| **Memory bombs**        | Proportional charging - large allocs cost more       |
| **SSRF**                | URL allowlists in fetch capability                   |
| **Prototype pollution** | Blocked property access (`__proto__`, `constructor`) |
| **Code injection**      | AST nodes, not string eval                           |
| **ReDoS**               | Suspicious regex rejection                           |
| **Data exfiltration**   | Zero capabilities by default                         |
| **Resource exhaustion** | Per-request fuel + timeout limits                    |

### What the Platform Controls

| Resource  | Mechanism             |
| --------- | --------------------- |
| CPU       | Fuel budget           |
| Memory    | Proportional charging |
| Time      | Timeout enforcement   |
| Network   | Capability allowlists |
| Storage   | Capability scoping    |
| Recursion | Depth protocol        |

### What the Platform Trusts

- **Custom atoms** are host code - you write them, you trust them
- **Capabilities** determine exposure - misconfigured fetch is still dangerous
- **The VM** prevents malicious _agents_, not malicious _atom implementations_

---

## Compliance

### Auditable Execution

Every agent run can produce a trace:

```typescript
const { result, trace } = await vm.run(agent, args, { trace: true })

// trace contains:
// - Every operation executed
// - Inputs and outputs
// - Fuel consumption
// - Timestamps
```

Full visibility into what untrusted code actually did.

### Per-Request Limits

```typescript
await vm.run(agent, args, {
  fuel: 1000,           // CPU budget per request
  timeoutMs: 5000,      // Wall-clock limit
  capabilities: {...}   // Scoped access
})
```

No single request can monopolize resources.

### Per-Key Scoping

```typescript
app.post('/execute', async (req, res) => {
  const capabilities = getCapabilitiesForApiKey(req.apiKey)
  // Different API keys get different permissions
  await vm.run(agent, args, { capabilities })
})
```

Tenant isolation at the capability level.

### Test Coverage

- **966 tests passing**
- **98% coverage** on security-critical runtime code
- **Dedicated security tests** for malicious actor scenarios

---

## Who This Is For

- **The CTO** who needs to adopt AI agents without security theater
- **The security team** that wants defense in depth, not defense in hope
- **The compliance officer** who needs audit trails and resource limits
- **The platform team** building multi-tenant systems with untrusted code

---

## The Architecture

```
┌─────────────────────────────────────────────────┐
│                  TJS Platform                    │
│  (Your trusted code - servers, APIs, capabilities)│
├─────────────────────────────────────────────────┤
│                                                  │
│   ┌─────────────────────────────────────────┐   │
│   │              AJS Sandbox                 │   │
│   │  (Untrusted code - agents, user scripts) │   │
│   │                                          │   │
│   │  • Zero capabilities by default          │   │
│   │  • Fuel-limited execution                │   │
│   │  • Timeout enforcement                   │   │
│   │  • No direct I/O                         │   │
│   └─────────────────────────────────────────┘   │
│                      │                           │
│           Capability Boundary                    │
│                      │                           │
│   ┌─────────────────────────────────────────┐   │
│   │         Granted Capabilities             │   │
│   │  fetch: allowlist only                   │   │
│   │  store: read-only or scoped             │   │
│   │  llm: if needed                         │   │
│   └─────────────────────────────────────────┘   │
│                                                  │
└─────────────────────────────────────────────────┘
```

The guest can only reach resources you explicitly provide. Everything else is blocked.

---

## Learn More

- [TJS Documentation](DOCS-TJS.md) — The language reference
- [AJS Documentation](DOCS-AJS.md) — The agent runtime
- [Builder's Manifesto](MANIFESTO-BUILDER.md) — For when you want speed
- [Technical Context](CONTEXT.md) — Deep dive into architecture
