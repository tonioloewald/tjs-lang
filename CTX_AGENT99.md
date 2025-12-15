# Agent99: Technical Context & Architecture

## 1. Product Vision: The Developer Experience

We are building a tool that feels like writing standard TypeScript chains but compiles to a portable, safe JSON AST.

**The Golden Syntax:**
We use `tosijs-schema` (aliased as `s`) for runtime validation and type inference. The API supports **"Tacit Schemas"** (inference shorthands).

```typescript
// 1. Define the Logic (The Builder)
const calculateTotal = A99.take(
  s.object({
    price: s.number(),
    taxRate: s.number(),
  })
)
  // MATH DSL ATOM: Safe arithmetic parsing (no JS eval)
  .calc('price * (1 + taxRate)', {
    price: A99.args('price'),
    taxRate: A99.args('taxRate'),
  })
  .as('total') // Save to state
  .return(s.object({ total: s.number() }))

// 2. The Artifact (JSON AST)
console.log(calculateTotal.toJSON())
/* Output:
{
  "op": "seq",
  "steps": [
    { "op": "math.calc", "expr": "...", "vars": {...}, "result": "total" }
  ]
}
*/

// 3. Execution (The VM)
const result = await A99.run(calculateTotal, { price: 100, taxRate: 0.2 })
```

## 2. Architecture Layers

- **Layer 0: The Runtime (The Engine)**

  - **Environment Agnostic:** Pure TypeScript. Runs seamlessly in Browser or Server (Node/Bun).
  - No external dependencies.
  - **The Halting Solution:** Implements a "Fuel" (or Gas) counter. Execution aborts when fuel == 0.
  - **Sandboxing:** No `eval()`, no `new Function()`. Strictly parses the JSON AST.

- **Layer 1: The Primitives (OpCodes)**

  - Hard-coded, atomic operations.
  - **Self-Documentation:** Every primitive must be a "Self-Describing Atom" containing: `{ op, docs, in, out, exec, examples }`.

- **Layer 2: The Builder SDK**
  - A Chainable TypeScript API (Fluent Interface) that compiles to JSON.
  - **Inference Utils:** Helpers like `A99.args()` auto-generate input schemas.

## 3. Implementation Strategy

1.  **Fluent Builder First:** Build and verify the Builder SDK with extensive test coverage to ensure the JSON AST generation is correct and ergonomic.
2.  **Runtime & Core Atoms:** Implement the VM and core control flow atoms (`seq`, `if`, etc.) with mock capabilities.
3.  **Mocked Integration Tests:** Validate the full cycle (Builder -> AST -> Runtime) using mocked atoms for IO/DB.
4.  **Real World Atoms:** Implement concrete atoms for:
    *   **Browser:** DOM interaction, LocalStorage.
    *   **Server/Cloud:** Firebase, generic HTTP.
    *   **AI:** Agent delegates using LM Studio (Client) or Gemini (Server).
5.  **Extensibility:** Ensure the atom system allows users to easily plug in custom providers (Supabase, AWS, etc.).

## 4. The Agent99 Instruction Set (Standard Library)
_The Runtime must implement these core Atoms to be Turing Complete and usable:_

| Category   | Atoms                                                         | Notes                                                                                     |
| ---------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Flow**   | `seq`, `if`, `while`, `return`, `try`                         | `while` decrements Fuel. `try` handles errors.                                            |
| **State**  | `var.set`, `var.get`, `scope`                                 | `scope` creates a new memory frame.                                                       |
| **Logic**  | `eq`, `neq`, `gt`, `lt`, `and`, `or`, `not`                   | Basic boolean logic.                                                                      |
| **Math**   | `math.calc`                                                   | **Exception:** Uses a safe arithmetic parser (not `eval`) for expressions like `"a + b"`. |
| **List**   | `map`, `reduce`, `filter`, `find`, `push`, `len`              | Functional transformations.                                                               |
| **String** | `split`, `join`, `match`, `template`                          | `match` uses Regex (safely). `template` uses `"Hello {{name}}"`.                          |
| **Object** | `pick`, `merge`, `keys`                                       | Struct manipulation.                                                                      |
| **IO**     | `http.fetch`                                                  | **Must** be wrapped in Capability Factory.                                                |
| **Store**  | `store.get`, `store.set`, `store.query`, `store.vectorSearch` | Abstracted data layer (Local vs Cloud).                                                   |
| **Agent**  | `llm.predict`, `agent.run`                                    | The cognitive layer.                                                                      |

## 5. Key Patterns

- **The "Smart Packet":** Data that carries its own execution logic (Active Data).
- **Fractal Agents:** "Agent Nodes" are just primitives (`agent.run`). An Agent can call another Agent.
- **The Bridge Pattern:** External frameworks (LangChain) are treated as slow, unreliable REST APIs.

## 6. The Golden Use Cases (Validation Scenarios)

1. **The Caching Proxy:** (Tests: IO, Secrets, KV-Store).
2. **The RAG Processor:** (Tests: Compute costs, Type flow, Vector Search).
3. **The Recursive Agent:** (Tests: Recursion, Fuel limits, State).
4. **The Orchestrator:** (Tests: Async waiting, Error recovery).
5. **The Malicious Actor:** (Tests: Sandbox, Fuel, Memory limits).

- _Includes "Red Team" tests ensuring path traversal and resource exhaustion are blocked._

## 7. Security Architecture
* **Capability-Based Access Control:**
* **Factories:** Tools are created via Factories (e.g., `File.scope('/tmp/').read()`).
* **No Global Scopes:** Agents never access raw IO primitives.
* **Pragmatic Security (Taint & Trace):**
* **Explicit Unsafe Mode:** Users can mount unsafe tools, but the Runtime marks the session as "Tainted".
* **Forensic Logging:** The Runtime produces a **Cryptographically Signed Execution Log** (Black Box Recorder).
* **Identity Headers:** Outgoing requests inject `X-Agent99-Signature`.