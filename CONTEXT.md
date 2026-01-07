# Agent99 Technical Context

**Note:** This document provides a technical deep-dive into Agent99's architecture and security model. For a general overview, installation instructions, and usage examples, please refer to the main [README.md](./README.md).

**Agent99** is a secure, environment-agnostic runtime for executing AI agents and logic chains defined as JSON ASTs.

**Bundle Size:** ~17KB gzipped. Expressions are evaluated via lightweight AST nodes at runtime, eliminating the need for a parser library (the previous JSEP-based approach was ~50KB gzipped).

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
  .varSet({ key: 'sum', value: { $expr: 'binary', op: '+', left: { $expr: 'literal', value: 1 }, right: { $expr: 'literal', value: 1 } } })

// VM Builder (Custom Atoms)
const vm = new AgentVM({ myAtom })
const customLogic = vm.A99
  .myAtom({ ... })
  .varSet({ ... })
```

### The Runtime (`AgentVM`)

A stateless Virtual Machine that executes the AST. The runtime contains all the actual implementation logic for the atoms.

- **Sandboxed:** No `eval()`. Math/Logic is evaluated safely via AST expression nodes.
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

## 2. Expression Syntax (ExprNode)

Expressions use AST expression nodes (`$expr`) for safe, sandboxed evaluation. Conditions in `if` and `while` atoms use expression strings that are parsed at transpile time.

For security, expressions are sandboxed and cannot directly access the agent's state. Use the `vars` parameter to explicitly pass variables from state into the expression scope.

### ExprNode Types

- **literal:** `{ $expr: 'literal', value: 5 }` - A constant value
- **ident:** `{ $expr: 'ident', name: 'x' }` - A variable reference
- **member:** `{ $expr: 'member', object: {...}, property: 'foo' }` - Property access
- **binary:** `{ $expr: 'binary', op: '+', left: {...}, right: {...} }` - Binary operations
- **unary:** `{ $expr: 'unary', op: '-', argument: {...} }` - Unary operations
- **conditional:** `{ $expr: 'conditional', test: {...}, consequent: {...}, alternate: {...} }` - Ternary

### Supported Operators

- **Binary ops:** `+`, `-`, `*`, `/`, `%`, `**`
- **Logic:** `&&`, `||`
- **Comparison:** `==`, `!=`, `>`, `<`, `>=`, `<=`
- **Member Access:** `obj.prop`, `arr[0]`

### Security

- **Forbidden:** Function calls, `new`, `this`, global access
- **Blocked:** Prototype access (`__proto__`, `constructor`)

### Fuel Consumption

Each expression node evaluation consumes **0.01 fuel**. This prevents deeply nested or recursive expressions from running unchecked. A simple `a + b` costs ~0.03 fuel (two identifiers + one binary op), while complex nested expressions accumulate cost proportionally.

## 3. Security Model

- **Capabilities:** The VM has no default IO. You must provide `fetch`, `store`, etc., allowing you to mock, proxy, or limit access.
- **Fuel:** Every atom consumes "fuel". Execution aborts if fuel reaches 0.
- **Timeouts:** Atoms have a default timeout (1s) to prevent hangs.
- **State Isolation:** Each run creates a fresh context. Scopes (loops/maps) use prototype inheritance to isolate local variables.
