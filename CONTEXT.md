<!--{"section": "ajs", "group": "docs", "order": 1, "navTitle": "Technical Context"}-->

# tjs-lang Technical Context

**Note:** This document provides a technical deep-dive into tjs-lang's architecture and security model. For a general overview, installation instructions, and usage examples, please refer to the main [README.md](./README.md).

**tjs-lang** is a secure, environment-agnostic runtime for executing AI agents and logic chains defined as JSON ASTs.

**Bundle Size:** ~17KB gzipped. Expressions are evaluated via lightweight AST nodes at runtime, eliminating the need for a parser library (the previous JSEP-based approach was ~50KB gzipped).

## 1. Architecture

### The Builder (`TypedBuilder`)

A fluent TypeScript API that generates a portable JSON AST. It uses a `Proxy` to dynamically infer methods from the registered Atoms, providing a strongly-typed developer experience.

It is important to understand that the builder is only for constructing the AST; it does not contain any of the actual implementation logic for the atoms. All execution is handled by the Runtime.

**Usage Pattern:**

- All logic chains **must** start with `Agent.take()` to define the input schema for the agent.
- Subsequent atom calls are chained together fluently (e.g., `.varSet(...)`, `.httpFetch(...)`). This creates an implicit `seq` (sequence) of operations.
- The chain is terminated by calling `.toJSON()` to produce the serializable AST.

You can access the builder via `Agent` (for core atoms) or `vm.Agent` (the recommended way to access both core and any custom atoms registered with the VM instance).

```typescript
import { Agent, s, AgentVM } from 'tjs-lang'

// Global Builder (Core Atoms)
const logic = Agent.take(s.object({ input: s.string }))
  .varSet({ key: 'sum', value: { $expr: 'binary', op: '+', left: { $expr: 'literal', value: 1 }, right: { $expr: 'literal', value: 1 } } })

// VM Builder (Custom Atoms)
const vm = new AgentVM({ myAtom })
const customLogic = vm.Agent
  .myAtom({ ... })
  .varSet({ ... })
```

### The Runtime (`AgentVM`)

A stateless Virtual Machine that executes the AST. The runtime contains all the actual implementation logic for the atoms.

- **Sandboxed:** No `eval()`. Math/Logic is evaluated safely via AST expression nodes.
- **Resource Limited:** Enforces `fuel` (gas) limits and execution timeouts per atom.
- **Capability-Based:** All IO (Network, DB, AI) must be injected via `capabilities` object.

```typescript
import { AgentVM } from 'tjs-lang'
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
- **Execution Timeout:** The VM enforces a global timeout based on fuel budget (see below).
- **Atom Timeouts:** Individual atoms have a default timeout (1s) to prevent hangs.
- **State Isolation:** Each run creates a fresh context. Scopes (loops/maps) use prototype inheritance to isolate local variables.

### Execution Timeout

The VM enforces a hard timeout on execution to prevent hung agents—safeguarding against code that effectively halts by waiting on slow or non-responsive IO.

**How it works:**

1. **Automatic Safety Net:** By default, timeout = `fuel × 10ms`. So 1000 fuel = 10 seconds. _For IO-heavy agents with low fuel costs, explicitly set `timeoutMs` to prevent premature timeouts._
2. **Explicit SLA:** Pass `timeoutMs` to enforce a strict time limit regardless of fuel.
3. **External Cancellation:** Pass an `AbortSignal` to integrate with external controllers (user cancellation, HTTP timeouts, etc.).

```typescript
// Default: 1000 fuel = 10 second timeout
await vm.run(ast, args, { fuel: 1000 })

// Explicit timeout: 5 seconds regardless of fuel
await vm.run(ast, args, { fuel: 10000, timeoutMs: 5000 })

// External abort signal
const controller = new AbortController()
setTimeout(() => controller.abort(), 3000) // Cancel after 3s
await vm.run(ast, args, { signal: controller.signal })
```

**Resource Cleanup:** When a timeout occurs, the VM passes the abort signal to the currently executing atom via `ctx.signal`. Loop atoms (`while`, `map`, `filter`, `reduce`, `find`) check the signal between iterations. `httpFetch` passes the signal to `fetch` for immediate request cancellation.

**Timeout vs Fuel:**

- **Fuel** protects against CPU-bound abuse (tight loops burning compute)
- **Timeout** protects against IO-bound abuse (slow network calls, hung promises)

Both work together to ensure the VM cannot be held hostage by untrusted code.

**Trust Boundary:** The sandbox protects against malicious _agents_ (untrusted AST), not malicious _atom implementations_. Atoms are registered by the host and are trusted to:

1. Be non-blocking (no synchronous CPU-heavy work)
2. Respect `ctx.signal` for cancellation
3. Clean up resources when aborted

If you write custom atoms, ensure they check `ctx.signal?.aborted` in loops and pass `ctx.signal` to any async operations like `fetch`.

### Cost Overrides

Default atom costs are guesses. Override them per-run to match your deployment reality:

```typescript
await vm.run(ast, args, {
  costOverrides: {
    // Static: fixed cost per invocation
    httpFetch: 50,
    llmPredict: 500,

    // Dynamic: cost based on input
    storeSet: (input) => JSON.stringify(input.value).length * 0.001,
    llmPredict: (input) => (input.model?.includes('gpt-4') ? 1000 : 100),
  },
})
```

Use cases:

- **API rate limits:** Make external API calls expensive to stay under quota
- **Metered billing:** Reflect actual dollar costs in fuel consumption
- **Resource protection:** Make database writes cost more than reads
- **Testing:** Set all costs to 0 to focus on logic, not budgeting

### Request Context

The `context` option passes request-scoped metadata to atoms. Unlike `args` (agent input) or `capabilities` (IO implementations), context carries ambient data like auth, permissions, and request tracing.

```typescript
await vm.run(ast, args, {
  context: {
    userId: 'user-123',
    role: 'admin',
    permissions: ['read:data', 'write:data', 'fetch:external'],
    requestId: 'req-abc-123',
  },
})
```

Atoms access it via `ctx.context`:

```typescript
const secureFetch = defineAtom(
  'secureFetch',
  s.object({ url: s.string }),
  s.any,
  async (input, ctx) => {
    // Check permissions
    if (!ctx.context?.permissions?.includes('fetch:external')) {
      throw new Error('Not authorized for external fetch')
    }
    return ctx.capabilities.fetch(input.url)
  }
)
```

**Design rationale:**

- **Immutable:** Context is read-only; agents cannot modify their own permissions
- **Separate from args:** Auth data doesn't pollute the agent's input schema
- **Separate from capabilities:** Same capability implementation, different authorization
- **Composable:** Works with cost overrides for user-tier-based fuel costs

**Production patterns:**

```typescript
// Firebase/Express integration
app.post('/run-agent', async (req, res) => {
  const ast = req.body.ast
  const args = req.body.args

  // Extract auth from request
  const user = await verifyToken(req.headers.authorization)

  const result = await vm.run(ast, args, {
    context: {
      userId: user.id,
      role: user.role,
      permissions: user.permissions,
      requestId: req.id,
    },
    // User-tier-based costs
    costOverrides: {
      llmPredict: user.tier === 'premium' ? 10 : 100,
    },
  })

  res.json(result)
})
```

## 4. Stored Procedures

The procedure store provides a built-in mechanism for storing ASTs as callable tokens. This enables function-pointer-like patterns where behavior can be passed as data.

### Storage Model

```typescript
// Module-level storage in runtime.ts
const procedureStore = new Map<
  string,
  {
    ast: any
    createdAt: number
    expiresAt: number
  }
>()
```

**Constants:**

- `PROCEDURE_TOKEN_PREFIX`: `'proc_'` - All tokens start with this prefix
- `DEFAULT_PROCEDURE_TTL`: 3,600,000ms (1 hour)
- `DEFAULT_MAX_AST_SIZE`: 102,400 bytes (100KB)

### Token Resolution

Tokens can be used anywhere an AST is accepted:

1. **`vm.run(token, args)`** - Direct execution via VM
2. **`agentRun({ agentId: token, input })`** - Execution from within an agent
3. **`agentRun({ agentId: ast, input })`** - Raw AST also accepted (no storage needed)

Resolution happens at runtime. If a string starts with `proc_`, the VM looks it up in the store. Expired or missing tokens throw clear errors.

### Fuel Costs

| Atom                     | Cost | Notes                           |
| ------------------------ | ---- | ------------------------------- |
| `storeProcedure`         | 1.0  | Plus 0.001 per byte of AST      |
| `releaseProcedure`       | 0.5  | Constant                        |
| `clearExpiredProcedures` | 0.5  | Plus 0.01 per procedure scanned |

### Security Considerations

**Memory bounds:** The `maxSize` parameter prevents storing arbitrarily large ASTs. Default 100KB is generous for most agents.

**Expiry:** TTL prevents memory leaks from abandoned procedures. The store is in-memory, so procedures don't survive process restarts.

**No capability escalation:** Stored procedures inherit the capabilities of the calling context, not the storing context. A malicious agent cannot store a procedure that later executes with elevated privileges.

**Token predictability:** Tokens are UUIDs, not sequential. They cannot be enumerated or guessed.

### Use Cases

**Dynamic dispatch (strategy pattern):**

```typescript
const strategies = ajs`
  function dispatch({ strategyToken, data }) {
    let result = agentRun({ agentId: strategyToken, input: { data } })
    return result
  }
`
```

**Worker pool:**

```typescript
const orchestrator = ajs`
  function orchestrate({ workers, tasks }) {
    let results = []
    for (let i = 0; i < tasks.length; i = i + 1) {
      let workerToken = workers[i % workers.length]
      let r = agentRun({ agentId: workerToken, input: tasks[i] })
      results.push(r)
    }
    return { results }
  }
`
```

**Callback registration:**

```typescript
const registerCallback = ajs`
  function register({ handler }) {
    let token = storeProcedure({ ast: handler, ttl: 300000 })
    return { callbackId: token }
  }
`
```

## 5. Production Considerations

### Recursive Agent Fuel

When an agent calls sub-agents via `agentRun`, each sub-agent gets its own fuel budget (passed via the capability). Fuel is **not shared** across the call tree by default.

**Why:** The `agentRun` atom delegates to `ctx.capabilities.agent.run`, which the host implements. This gives operators full control over sub-agent resource allocation.

**Patterns for shared fuel:**

```typescript
// Option 1: Pass remaining fuel to children
const sharedFuel = { current: 1000 }

const caps = {
  agent: {
    run: async (agentId, input) => {
      if (sharedFuel.current <= 0) throw new Error('Out of shared fuel')
      const result = await vm.run(agents[agentId], input, {
        fuel: sharedFuel.current,
        capabilities: caps,
      })
      sharedFuel.current -= result.fuelUsed
      return result.result
    },
  },
}

// Option 2: Fixed budget per recursion depth
const caps = {
  agent: {
    run: async (agentId, input) => {
      // Each child gets 10% of parent's budget
      return vm.run(agents[agentId], input, {
        fuel: 100, // Fixed small budget
        capabilities: caps,
      })
    },
  },
}
```

### Streaming and Long-Running Agents

The VM returns results only after complete execution. For long-running agents:

- Use `timeoutMs` to enforce SLAs
- Use `AbortSignal` for user-initiated cancellation
- Use `trace: true` for post-hoc debugging

**For real-time streaming**, implement a custom atom that emits intermediate results:

```typescript
const streamingAtom = defineAtom(
  'streamChunk',
  s.object({ data: s.any }),
  s.null,
  async ({ data }, ctx) => {
    // ctx.context contains your streaming callback
    await ctx.context?.onChunk?.(data)
    return null
  }
)

// Usage
await vm.run(ast, args, {
  context: {
    onChunk: (data) => res.write(JSON.stringify(data) + '\n'),
  },
})
```

### Condition String Syntax

The condition parser in `if`/`while` atoms supports a subset of expression syntax:

| Supported     | Example                           |
| ------------- | --------------------------------- |
| Comparisons   | `a > b`, `x == 'hello'`, `n != 0` |
| Logical       | `a && b`, `a \|\| b`, `!a`        |
| Arithmetic    | `a + b * c`, `(a + b) / c`        |
| Member access | `obj.foo.bar`                     |
| Literals      | `42`, `"string"`, `true`, `null`  |

| **Unsupported**        | Alternative                        |
| ---------------------- | ---------------------------------- |
| Ternary `a ? b : c`    | Use nested `if` atoms              |
| Array index `a[0]`     | Use ExprNode with `computed: true` |
| Function calls `fn(x)` | Use atoms                          |
| Chained `a > b > c`    | Use `a > b && b > c`               |

Unsupported syntax now throws a clear error at build time with suggestions.

### State Semantics

Agents are **not transactional**. If an atom fails mid-execution:

- Previous state changes persist
- No automatic rollback
- Error is captured in monadic flow (`ctx.error`)

This is by design—agents are stateful pipelines, not database transactions. If you need atomicity, implement checkpoint/restore in your capabilities:

```typescript
const caps = {
  store: {
    set: async (key, value) => {
      await db.runTransaction(async (tx) => {
        await tx.set(key, value)
      })
    },
  },
}
```

### Error Handling Granularity

The `try/catch` atom catches all errors in the try block. There's no selective catch by error type.

**Pattern for error type handling:**

```typescript
Agent.take(s.object({})).try({
  try: (b) => b.httpFetch({ url: '...' }).as('response'),
  catch: (b) =>
    b
      .varSet({ key: 'errorType', value: 'unknown' })
      // Check error message patterns
      .if(
        'msg.includes("timeout")',
        { msg: 'error.message' },
        (then) => then.varSet({ key: 'errorType', value: 'timeout' }),
        (el) =>
          el.if('msg.includes("404")', { msg: 'error.message' }, (then) =>
            then.varSet({ key: 'errorType', value: 'not_found' })
          )
      ),
})
```

## 9. Test Coverage

**Summary (as of January 2025):**

| Metric    | Value  |
| --------- | ------ |
| Tests     | 508    |
| Functions | 84.77% |
| Lines     | 80.36% |

### Coverage by Component

**Core Runtime (security-critical):**

| File                      | Functions | Lines   | Notes                        |
| ------------------------- | --------- | ------- | ---------------------------- |
| `src/runtime.ts`          | 100%      | 100%    | Re-exports                   |
| `src/vm.ts`               | 100%      | 100%    | Re-exports                   |
| `src/vm/runtime.ts`       | 84%       | **98%** | Atoms, expression eval, fuel |
| `src/vm/vm.ts`            | 90%       | 94%     | VM entry point               |
| `src/transpiler/index.ts` | 100%      | 100%    | AJS transpiler               |
| `src/builder.ts`          | 92%       | 90%     | Fluent builder               |

**Language/Transpiler:**

| File                       | Functions | Lines | Notes                           |
| -------------------------- | --------- | ----- | ------------------------------- |
| `src/lang/emitters/ast.ts` | 94%       | 83%   | TJS → AST                       |
| `src/lang/parser.ts`       | 92%       | 82%   | TJS parser                      |
| `src/lang/inference.ts`    | 57%       | 60%   | Type inference (lower priority) |

**Test Categories:**

| Category                   | Tests | Coverage                                             |
| -------------------------- | ----- | ---------------------------------------------------- |
| Security (malicious actor) | 10    | Prototype access, SSRF, ReDoS, path traversal        |
| Runtime core               | 25+   | Fuel, timeout, tracing, expressions                  |
| Stress/Memory              | 6     | Large arrays, deep nesting, memory pressure          |
| Capability failures        | 10    | Network errors, store failures, partial capabilities |
| Allocation fuel            | 4     | Proportional charging for strings/arrays             |
| Transpiler                 | 50+   | Language features, edge cases                        |
| Use cases                  | 100+  | RAG, orchestration, client-server patterns           |

### Running Tests

```bash
# Full suite
bun test

# Fast (skip LLM and benchmarks)
SKIP_LLM_TESTS=1 AGENT99_TESTS_SKIP_BENCHMARKS=1 bun test

# With coverage
bun test --coverage
```

## 10. Dependencies

### Runtime Dependencies

These ship with the library and affect bundle size and security posture.

| Package         | Version | Size  | Purpose                                 | Risk                                                 |
| --------------- | ------- | ----- | --------------------------------------- | ---------------------------------------------------- |
| `acorn`         | ^8.15.0 | ~30KB | JavaScript parser for AJS transpilation | **Low** - Mature, widely audited, Mozilla-maintained |
| `tosijs-schema` | ^1.2.0  | ~5KB  | JSON Schema validation                  | **Low** - Our library, 96.6% coverage, zero deps     |
| `@codemirror/*` | various | ~50KB | Editor syntax highlighting (optional)   | **Low** - Only loaded for editor integration         |

**Total runtime footprint:** ~33KB gzipped (core), ~83KB with editor support.

### tosijs-schema 1.2.0 Coverage

Our validation dependency maintains comprehensive test coverage:

- **98.25% function coverage, 96.62% line coverage** (146 tests, 349 assertions)
- **Edge cases tested:** NaN, Infinity, -0, sparse arrays, unicode, deeply nested structures
- **Complex unions:** nested unions, discriminated unions, union of arrays, union with null/undefined
- **Format validators:** email, ipv4 boundaries, url protocols, datetime variants
- **Strict mode:** `validate(data, schema, { strict: true })` validates every item

Because tosijs-schema schemas are JSON data (not code), library coverage extends to user-defined schemas—unlike Zod where user schema compositions are untested code.

### Development Dependencies

Not shipped to users. Used for building, testing, and development.

| Package                | Purpose                       | Notes                   |
| ---------------------- | ----------------------------- | ----------------------- |
| `typescript`           | Type checking and compilation | Standard                |
| `bun`                  | Runtime, bundler, test runner | Fast, modern            |
| `eslint` / `prettier`  | Code quality                  | Standard                |
| `acorn-walk`           | AST traversal for transpiler  | Only used at build time |
| `codemirror`           | Editor components for demo    | Demo only               |
| `tosijs` / `tosijs-ui` | Demo UI framework             | Demo only               |
| `happy-dom`            | DOM mocking for tests         | Test only               |
| `vitest`               | Alternative test runner       | Optional                |

### Dependency Risk Assessment

**Supply Chain:**

| Risk                     | Mitigation                                               |
| ------------------------ | -------------------------------------------------------- |
| Acorn compromise         | Mature project (10+ years), Mozilla backing, widely used |
| tosijs-schema compromise | We control this library                                  |
| Transitive dependencies  | Minimal—acorn has 0 deps, tosijs-schema has 0 deps       |

**Version Pinning:**

- Production dependencies use caret (`^`) for patch updates
- Consider using exact versions or lockfile for production deployments

**Audit:**

```bash
# Check for known vulnerabilities
bun audit
# or
npm audit
```

### What We Don't Depend On

Notably absent from our dependency tree:

| Common Dependency | Why We Don't Use It                     |
| ----------------- | --------------------------------------- |
| lodash            | Native JS methods suffice               |
| axios             | Native fetch + capability injection     |
| moment/dayjs      | Built-in Date wrapper in expressions    |
| zod/yup           | tosijs-schema is lighter and sufficient |
| jsep              | Replaced with acorn + custom AST nodes  |

This minimal dependency approach reduces supply chain risk and bundle size.
