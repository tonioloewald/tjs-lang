# Agent99 Technical Context

**Note:** This document provides a technical deep-dive into Agent99's architecture and security model. For a general overview, installation instructions, and usage examples, please refer to the main [README.md](./README.md).

**Agent99** is a secure, environment-agnostic runtime for executing AI agents and logic chains defined as JSON ASTs.

## 1. Architecture

### The Builder (`TypedBuilder`)

A fluent TypeScript API that generates a portable JSON AST. It uses a `Proxy` to dynamically infer methods from the registered Atoms, providing a strongly-typed developer experience.

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

A stateless Virtual Machine that executes the AST.

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

## 2. Core Atoms

The standard library (Core Atoms) provides essential primitives. All atom names are **camelCase**.

| Atom                           | Description                                             | Cost |
| ------------------------------ | ------------------------------------------------------- | ---- |
| `seq`                          | Execute steps sequentially.                             | 0.1  |
| `if`                           | Conditional branching.                                  | 0.1  |
| `while`                        | Loop while condition is true.                           | 0.1  |
| `try`                          | Try/Catch block.                                        | 0.1  |
| `return`                       | Return data from state.                                 | 0.1  |
| `varSet` / `varGet`            | Set/Get variables in state scope.                       | 0.1  |
| `mathCalc`                     | Evaluate math expression (e.g. `a * b`).                | 1.0  |
| `eq`, `gt`, `lt`, `and`, `not` | Boolean logic.                                          | 0.1  |
| `map`, `push`, `len`           | Array operations.                                       | 1.0  |
| `split`, `join`, `template`    | String operations.                                      | 1.0  |
| `pick`, `merge`, `keys`        | Object operations.                                      | 1.0  |
| `httpFetch`                    | HTTP Request (Zero-config defaults to `fetch`).         | 5.0  |
| `storeGet`, `storeSet`         | KV Store (Zero-config defaults to `Map`).               | 5.0  |
| `llmPredict`                   | LLM Inference (Requires `llm` capability).              | 1.0  |
| `agentRun`                     | Recursive sub-agent call (Requires `agent` capability). | 1.0  |
| `random`, `uuid`, `hash`       | Random generation & hashing.                            | 1.0  |
| `memoize`                      | Memoize step result in memory (key optional).           | 0.1  |
| `cache`                        | Cache step result in Store (key optional).              | 5.0  |

## 3. Batteries Included (Local AI & Vectors)

Agent99 includes a "Batteries Included" setup for local development that provides zero-dependency vector search and local model inference via [LM Studio](https://lmstudio.ai/). For setup and usage details, see the [Batteries Included section in README.md](./README.md#batteries-included-zero-dependency-local-ai).

This approach replaces the previous reliance on heavy client-side libraries like `@xenova/transformers` and `@orama/orama`. On initial import, the `batteries` module audits the available models on the LM Studio server and caches the results to avoid redundant checks.

## 4. Expression Syntax (JSEP)

Expressions in `mathCalc`, `if`, and `while` use a safe subset of JavaScript via `jsep`.

For security, these expressions are sandboxed and cannot directly access the agent's state. You must explicitly pass any required variables from the state into the expression using the `vars` parameter. This parameter maps local variable names (for use in the expression) to values in the agent's state (using dot notation, e.g., `'product.price'`).

- **Supported:** Binary ops (`+`, `-`, `*`, `/`, `%`), Logic (`&&`, `||`, `!`), Comparison (`==`, `!=`, `>`, `<`, `>=`), Member Access (`obj.prop`, `arr[0]`).
- **Forbidden:** Function calls, `new`, `this`, global access (except `Math` via atoms).
- **Security:** Prototype access (`__proto__`, `constructor`) is strictly blocked.

## 5. Security Model

- **Capabilities:** The VM has no default IO. You must provide `fetch`, `store`, etc., allowing you to mock, proxy, or limit access.
- **Fuel:** Every atom consumes "fuel". Execution aborts if fuel reaches 0.
- **Timeouts:** Atoms have a default timeout (1s) to prevent hangs.
- **State Isolation:** Each run creates a fresh context. Scopes (loops/maps) use prototype inheritance to isolate local variables.

## 6. Development & Validation

After making changes to the codebase, it's important to run both the test suite and the type checker to ensure correctness and maintain type safety.

- **Run Tests:** `bun test`
- **Check Types:** `bun typecheck`
