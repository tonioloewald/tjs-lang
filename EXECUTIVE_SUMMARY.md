# tosijs-agent: Executive Summary

**Safe eval for the cloud. Code that travels to data.**

tosijs-agent is a 30kB type-safe virtual machine that executes untrusted code safely anywhere—browser, server, or edge. Logic is written in AsyncJS (a JavaScript subset) and compiles to portable JSON. One hot endpoint can run any valid agent with zero deployment.

---

## The Elevator Pitch

Ship code to data instead of shipping data to code. Define backend logic as JSON, send it to any node, execute it safely with bounded resources. No deployment, no spin-up, no trust required.

- **30kB VM** runs anywhere JavaScript runs
- **JSON AST** is the program—portable, inspectable, versionable
- **Capability-based security**—VM has zero IO by default
- **Fuel/gas metering**—bounded execution, no infinite loops
- **AsyncJS**—familiar syntax, small enough for 4B-parameter LLMs to generate

---

## For the CEO

**Business value:** Eliminate deployment friction and reduce infrastructure complexity.

- **Zero-deploy architecture:** One endpoint accepts any agent. No build pipelines, no container orchestration, no cold starts
- **Vendor flexibility:** Logic is JSON—migrate between clouds, edge providers, or self-hosted infrastructure without rewriting code
- **Cost control:** Fuel metering provides hard limits on compute consumption per request
- **AI-native:** Agents can be generated, modified, and composed by LLMs at runtime

---

## For the CTO

**Technical value:** Safely execute untrusted code at scale with predictable resource consumption.

- **Sandboxed execution:** Capability-based security means the VM cannot access network, storage, or external services unless explicitly granted
- **Deterministic costs:** Fuel budgets guarantee bounded execution time and resource usage
- **Type-safe boundaries:** Input validated at entry, output validated at exit—f(x: A) -> C is enforced
- **Horizontal scaling:** Stateless execution with injected capabilities enables trivial scaling
- **Polyglot potential:** JSON AST can be executed by runtimes in any language

---

## For the Engineer

**Developer experience:** Write logic once, run it anywhere, debug it easily.

- **Familiar syntax:** AsyncJS looks like JavaScript—loops, conditionals, try/catch, template literals
- **Type inference:** Full TypeScript support with schema-driven validation
- **Tracing built-in:** Every execution step is logged with before/after state, fuel consumption, and timing
- **Custom atoms:** Extend the runtime with your own operations—full type safety preserved
- **No magic:** The AST is just JSON—inspect it, transform it, generate it programmatically

**Limitations to know:**

- No closures, classes, or prototypes (by design—keeps the VM simple)
- Expression evaluation is explicit (pass variables via `vars` parameter)
- Async operations are atoms, not language-level `await`

---

## For the Security Consultant

**Security model:** Defense in depth through capability restriction and resource bounding.

- **Zero-trust by default:** VM starts with no capabilities—no network, no filesystem, no storage
- **Capability injection:** Host explicitly grants fetch, store, LLM access—audit trail is clear
- **Fuel metering:** Prevents CPU-bound abuse (tight loops, recursive bombs)
- **Timeout enforcement:** Prevents IO-bound abuse (slow network calls, hung connections)
- **Monadic errors:** Errors propagate as values, not exceptions—no stack unwinding exploits
- **No eval:** Expressions are AST nodes, not string evaluation—no injection vectors
- **Depth protocol:** Agent-to-agent recursion is bounded—no fork bombs

**Attack surface:**

- Custom atoms are trusted code—host is responsible for their security
- Capabilities determine exposure—a misconfigured fetch capability can still be abused
- The VM prevents malicious _agents_, not malicious _atom implementations_

---

## For the Data Scientist

**ML/AI integration:** First-class support for LLM orchestration and vector operations.

- **Structured outputs:** Schema builder generates JSON Schema for LLM response validation
- **Vector search:** Built-in cosine similarity—10K vectors in ~15ms, no external database required
- **Local inference:** Batteries-included setup connects to LM Studio for zero-API-key development
- **Agent composition:** Agents can invoke other agents with depth-bounded recursion
- **Small-model friendly:** AsyncJS syntax is simple enough for 4B-parameter models to generate correctly

**Use cases:**

- RAG pipelines as portable JSON
- Multi-step reasoning with retry loops
- Structured data extraction with guaranteed schemas

---

## For GraphQL Adopters (or Escapees)

**Comparison:** Both solve "client specifies what it needs"—different trade-offs.

| Aspect             | GraphQL                                     | tosijs-agent                            |
| ------------------ | ------------------------------------------- | --------------------------------------- |
| **Query language** | Domain-specific (GraphQL SDL)               | General-purpose (AsyncJS/JSON)          |
| **Execution**      | Server-side resolvers                       | Portable—client, server, or edge        |
| **Caching**        | Per-field, requires careful resolver design | Per-capability, shareable across agents |
| **N+1 problem**    | Your problem (DataLoader, etc.)             | Your problem (but agents can batch)     |
| **Schema**         | Required, central                           | Optional, per-agent                     |
| **Auth**           | Middleware or resolver-level                | Capability injection + context          |
| **Learning curve** | GraphQL + tooling ecosystem                 | JavaScript subset + JSON                |

**When to choose tosijs-agent:**

- You need logic execution, not just data fetching
- You want client-defined behavior, not just client-defined shape
- You're building AI agents or workflows that need to run at the edge
- You want to avoid the GraphQL tooling tax (Apollo, code generators, etc.)

---

## For Proof-of-Useful-Work Enthusiasts

**The pitch:** Replace wasteful hash grinding with productive computation.

- **Verifiable execution:** JSON AST + deterministic VM = reproducible results
- **Bounded work:** Fuel metering guarantees computational cost is known upfront
- **Safe distribution:** Untrusted nodes can execute arbitrary agents without risk to the node
- **Portable proof:** AST + inputs + outputs = verifiable computation record

**Challenges:**

- Non-determinism: LLM calls and external APIs produce variable results
- Capability trust: Distributed nodes need standardized, auditable capability implementations
- Economic model: Fuel costs need to map to real economic value

**Opportunity:** Data processing, inference tasks, and batch computations could replace proof-of-work while producing actual value.

---

## For the Skeptic

**Known limitations and honest trade-offs:**

### What It Can't Do

- **No raw JavaScript:** You can't `require()` arbitrary npm packages or use the full JS standard library
- **No persistent state:** The VM is stateless—state lives in injected capabilities
- **No concurrency primitives:** No `Promise.all`, no workers—sequential execution only
- **No debugging tools:** Tracing exists, but no step-through debugger (yet)

### Where It Gets Complicated

- **Capability design is hard:** A poorly designed capability can undermine the security model
- **Fuel tuning is empirical:** Default costs are guesses—production deployments need calibration
- **LLM non-determinism:** Agents using LLMs won't produce identical results across runs
- **Testing untrusted code:** You're responsible for validating agent behavior before deployment

### Open Questions

- **Adoption:** Novel approach means limited ecosystem and community
- **Performance:** Interpreted execution will be slower than native code
- **Complexity budget:** Is the abstraction worth the indirection for your use case?

### When NOT to Use This

- CPU-intensive computation (use native code)
- Building the CRUD layer itself (use a framework—but once you have CRUD, tosijs-agent turns it into arbitrary composable services almost effortlessly)
- Real-time systems with strict latency requirements
- Applications where you control all the code anyway

---

## Quick Links

- [Technical Documentation](./CONTEXT.md)
- [AsyncJS Language Guide](./guides/asyncjs.md)
- [Patterns & Examples](./guides/patterns.md)
- [GitHub](https://github.com/tonioloewald/tosijs-agent)
- [npm](https://www.npmjs.com/package/tosijs-agent)
