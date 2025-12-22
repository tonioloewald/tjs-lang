# Agent99 Technical Context

**Note:** This document provides a technical deep-dive into Agent99's architecture and security model. For a general overview, installation instructions, and usage examples, please refer to the main [README.md](./README.md).

**Agent99** is a secure, environment-agnostic runtime for executing AI agents and logic chains defined as JSON ASTs.

## 1. Architecture

### The Builder (`TypedBuilder`)

A fluent TypeScript API that generates a portable JSON AST. It uses a `Proxy` to dynamically infer methods from the registered Atoms, providing a strongly-typed developer experience.

It is important to understand that the builder is only for constructing the AST; it does not contain any of the actual implementation logic for the atoms. All execution is handled by the Runtime.

**Usage Pattern:**

- All logic chains **must** start with `A99.take()` to define the input schema for the agent.
- Subsequent atom calls are chained together fluently (e.g., `.varSet(...)`, `.httpFetch(...)`). This creates an implicit `seq` (sequence) of operations.
- The chain is terminated by calling `.toJSON()` to produce the serializable AST.

You can access the builder via `A99` (for core atoms) or `vm.A99` (the recommended way to access both core and any custom atoms registered with the VM instance).

```typescript
import { A99, s, AgentVM } from 'agent-99'

// Global Builder (Core Atoms)
const logic = A99.take(s.object({ input: s.string }))
  .mathCalc({ expr: '1 + 1', vars: {} })

// VM Builder (Custom Atoms)
const vm = new AgentVM({ myAtom })
const customLogic = vm.A99
  .myAtom({ ... })
  .mathCalc({ ... })
```

### The Runtime (`AgentVM`)

A stateless Virtual Machine that executes the AST. The runtime contains all the actual implementation logic for the atoms.

- **Sandboxed:** No `eval()`. Math/Logic is parsed safely via `jsep`.
- **Resource Limited:** Enforces `fuel` (gas) limits and execution timeouts per atom.
- **Capability-Based:** All IO (Network, DB, AI) must be injected via `capabilities` object.

```typescript
import { AgentVM } from 'agent-99'
const vm = new AgentVM()
const { result, fuelUsed } = await vm.run(ast, args, {
  capabilities,
  fuel: 1000,
})
```

## 2. Expression Syntax (JSEP)

Expressions in `mathCalc`, `if`, and `while` use a safe subset of JavaScript via `jsep`.

For security, these expressions are sandboxed and cannot directly access the agent's state. You must explicitly pass any required variables from the state into the expression using the `vars` parameter. This parameter maps local variable names (for use in the expression) to values in the agent's state (using dot notation, e.g., `'product.price'`).

- **Supported:** Binary ops (`+`, `-`, `*`, `/`, `%`), Logic (`&&`, `||`, `!`), Comparison (`==`, `!=`, `>`, `<`, `>=`), Member Access (`obj.prop`, `arr[0]`).
- **Forbidden:** Function calls, `new`, `this`, global access (except `Math` via atoms).
- **Security:** Prototype access (`__proto__`, `constructor`) is strictly blocked.

## 3. Security Model

- **Capabilities:** The VM has no default IO. You must provide `fetch`, `store`, etc., allowing you to mock, proxy, or limit access.
- **Fuel:** Every atom consumes "fuel". Execution aborts if fuel reaches 0.
- **Timeouts:** Atoms have a default timeout (1s) to prevent hangs.
- **State Isolation:** Each run creates a fresh context. Scopes (loops/maps) use prototype inheritance to isolate local variables.
