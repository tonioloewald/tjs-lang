# Agent99 Technical Context

**Agent99** is a secure, environment-agnostic runtime for executing AI agents and logic chains defined as JSON ASTs.

## 1. Architecture

### The Builder (`TypedBuilder`)
A fluent TypeScript API that generates a portable JSON AST. It uses a `Proxy` to dynamically infer methods from the registered Atoms, providing a strongly-typed developer experience.

```typescript
import { A99, s } from 'agent-99'

const logic = A99.take(s.object({ input: s.string }))
  .mathCalc({ expr: '1 + 1', vars: {} })
  .as('result')
  .return(s.object({ result: s.number }))
```

### The Runtime (`AgentVM`)
A stateless Virtual Machine that executes the AST.
- **Sandboxed:** No `eval()`. Math/Logic is parsed safely via `jsep`.
- **Resource Limited:** Enforces `fuel` (gas) limits and execution timeouts per atom.
- **Capability-Based:** All IO (Network, DB, AI) must be injected via `capabilities` object.

```typescript
import { AgentVM } from 'agent-99'
const vm = new AgentVM()
const { result, fuelUsed } = await vm.run(ast, args, { capabilities, fuel: 1000 })
```

## 2. Core Atoms

The standard library (Core Atoms) provides essential primitives. All atom names are **camelCase**.

| Atom | Description | Cost |
| --- | --- | --- |
| `seq` | Execute steps sequentially. | 0.1 |
| `if` | Conditional branching. | 0.1 |
| `while` | Loop while condition is true. | 0.1 |
| `try` | Try/Catch block. | 0.1 |
| `return` | Return data from state. | 0.1 |
| `varSet` / `varGet` | Set/Get variables in state scope. | 0.1 |
| `mathCalc` | Evaluate math expression (e.g. `a * b`). | 1.0 |
| `eq`, `gt`, `lt`, `and`, `not` | Boolean logic. | 0.1 |
| `map`, `push`, `len` | Array operations. | 1.0 |
| `split`, `join`, `template` | String operations. | 1.0 |
| `pick`, `merge`, `keys` | Object operations. | 1.0 |
| `httpFetch` | HTTP Request (Requires `fetch` capability). | 1.0 |
| `storeGet`, `storeSet` | KV Store (Requires `store` capability). | 1.0 |
| `llmPredict` | LLM Inference (Requires `llm` capability). | 1.0 |
| `agentRun` | Recursive sub-agent call (Requires `agent` capability). | 1.0 |
| `random`, `uuid` | Random generation (Crypto-secure if available). | 1.0 |

## 3. Extending Agent99

You can define custom atoms using `defineAtom`.

```typescript
import { defineAtom, s } from 'agent-99'

const myAtom = defineAtom(
  'myOp', 
  s.object({ val: s.string }), 
  s.string,
  async ({ val }, ctx) => val.toUpperCase(),
  { cost: 5 }
)
```

## 4. Expression Syntax (JSEP)

Expressions in `mathCalc`, `if`, and `while` use a safe subset of JavaScript via `jsep`.
- **Supported:** Binary ops (`+`, `-`, `*`, `/`, `%`), Logic (`&&`, `||`, `!`), Comparison (`==`, `!=`, `>`, `<`, `>=`), Member Access (`obj.prop`, `arr[0]`).
- **Forbidden:** Function calls, `new`, `this`, global access (except `Math` via atoms).
- **Security:** Prototype access (`__proto__`, `constructor`) is strictly blocked.

## 5. Security Model

- **Capabilities:** The VM has no default IO. You must provide `fetch`, `store`, etc., allowing you to mock, proxy, or limit access.
- **Fuel:** Every atom consumes "fuel". Execution aborts if fuel reaches 0.
- **Timeouts:** Atoms have a default timeout (1s) to prevent hangs.
- **State Isolation:** Each run creates a fresh context. Scopes (loops/maps) use prototype inheritance to isolate local variables.