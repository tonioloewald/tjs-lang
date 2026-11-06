<!--{"section": "ajs", "group": "docs", "order": 14, "navTitle": "Technical Context", "parent": "ajs.md"}-->
<!-- TODO review -->

# The AJS VM: Technical Context

This chapter is the map: what the pieces of the AJS VM are, what happens when the host calls
`vm.run`, which guarantee lives where, and how agents compose. It is for people embedding the
VM or reviewing it. The day-to-day host API (every run option, capabilities, quotas, tracing) is
in [Embedding the AJS VM](/ajs-host/); writing atoms is in
[Capabilities and Custom Atoms](/ajs-capabilities/); the language itself is
[AJS: The Agent Language](/DOCS-AJS/).

## 1. The pieces

An agent travels as a **JSON AST**. Something produces the AST, and the VM runs it:

| Piece           | Where it lives                                 | What it does                                                                                            |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Transpiler      | `transpile` from `tjs-lang/lang`               | AJS source to AST. Checks atom calls, parameters and syntax, and explains what to write instead.        |
| Builder         | `Agent` from `tjs-lang`, or `vm.Agent`         | Builds the same AST in code with a fluent API. No checks: what you build is what runs.                  |
| AST             | plain JSON, `"$ajs": 2` from the transpiler    | The wire format. It can be stored, sent over a network and run elsewhere.                               |
| VM              | `AgentVM` from `tjs-lang/vm-ast`               | Runs an AST. All atom implementations, fuel, timeouts, the heap ceiling and the membrane live here.     |
| Atoms           | core atoms, plus any the host registers        | The operations an agent can call (`httpFetch`, `storeGet`, `llmPredict`, your own).                     |
| Capabilities    | the `capabilities` run option                  | The host's IO: `fetch`, `store`, `llm`, `agent`, and whatever your own atoms read. Empty by default.    |

The split between the front ends and the VM is deliberate. The builder and the transpiler
contain no execution logic; the VM contains no parser. `tjs-lang/vm-ast` is the recommended VM
because it has no parser in its bundle, so a hostile payload cannot reach a parser defect inside
the sandbox. Transpile on the side that owns the source, and send the AST:

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

// Where the source is handled: source in, JSON AST out.
const { ast } = transpile(`
  function total({ price: 0.0, taxRate: 0.0 }) {
    return { total: price * (1 + taxRate) }
  }
`)

// Where the agent runs: AST in, result out.
const vm = new AgentVM()
const run = await vm.run(ast, { price: 100, taxRate: 0.2 }, { fuel: 100 })
console.log(run.result, run.error) // { total: 120 } undefined
```

`tjs-lang/vm` is the same `AgentVM` with the transpiler wired in, so it also accepts source.
Passing source to `vm.run` is deprecated as of 0.14.0; `tjs-lang/vm-ast` refuses it and says
where to transpile instead. If you transpile source you did not write, cap it:
`transpile(source, { maxSourceBytes: 64 * 1024 })`. Parsing is the one step that runs before
any budget exists.

### The builder

The builder is for generating agents in code. Start with `Agent.take(schema)` (the input
schema), chain atom calls, and finish with `.toJSON()`. `vm.Agent` is the same builder with the
VM's custom atoms added.

```typescript
import { Agent, AgentVM } from 'tjs-lang'
import { s } from 'tjs-lang/schema'

const ast = Agent.take(s.object({ n: s.number }))
  .varsImport(['n'])
  .if(
    'n > 10',
    { n: 'n' },
    (then) => then.varSet({ key: 'size', value: 'big' }),
    (otherwise) => otherwise.varSet({ key: 'size', value: 'small' })
  )
  .return(s.object({ size: s.string }))
  .toJSON()

const vm = new AgentVM()
console.log((await vm.run(ast, { n: 42 })).result) // { size: 'big' }
console.log((await vm.run(ast, { n: 1 })).result) // { size: 'small' }
```

An `if` or `while` condition in the builder is a string, parsed when the AST is built. It
supports comparisons, `&&`, `||`, `!`, arithmetic, parentheses, member access (`obj.foo.bar`)
and literals. A ternary, an index (`a[0]`) or a call (`f(x)`) is refused at build time with an
`Unsupported condition syntax` error. To test one, compute it first with a `varSet` whose value
is an expression node, then test that variable. The second argument maps each name the
condition uses to a variable (or a dotted path) in the agent's state, and the builder warns
about a name the condition reads that the map leaves out.

The builder writes a version-1 AST (`"$ajs": 1`), the older format, in which a bare string that
names a variable in scope is read as that variable. The transpiler writes version 2, in which a
bare string is always a string. Both run; the format is described under
[JSON AST Format](/DOCS-AJS/#json-ast-format).

### Expressions are nodes

There is no `eval` anywhere in the VM. Arithmetic and logic are AST nodes, evaluated by the VM:

| `$expr`       | Shape                                                    |
| ------------- | -------------------------------------------------------- |
| `literal`     | `{ $expr: 'literal', value: 5 }`                         |
| `ident`       | `{ $expr: 'ident', name: 'x' }`                          |
| `member`      | `{ $expr: 'member', object, property, computed? }`       |
| `binary`      | `+ - * / % **`, comparisons, `==` `!=` `===` `!==`       |
| `unary`       | `!`, `-`, `+`, `typeof`                                  |
| `logical`     | `&&`, `\|\|`, `??`                                        |
| `conditional` | `test ? consequent : alternate`                          |
| `array`, `object` | literals                                             |
| `call`        | a builtin (`Math.max`) or a local helper                 |
| `methodCall`  | a method the VM's method table lists (`s.trim()`)        |
| `regex`       | a regex literal, run on the VM's own linear engine       |

Each node costs 0.01 fuel. `__proto__`, `constructor` and `prototype` are refused as property
names, read or written. `new` and `this` do not exist. A method can be called only if the
method table (`METHOD_TABLE` in `src/vm/runtime.ts`) has an entry for it, and every entry bounds
what the call can allocate; see [VM budgets](/vm-budgets/).

## 2. What happens in a run

`vm.run(ast, args, options)` does these things in order. A failure at any step comes back as
the run's `error`, and the agent's code runs only in step 6.

```text
1. Admit the options      read each option once, check it, freeze the result
2. Resolve the AST        a stored-procedure token (proc_…) is looked up here
3. Gate the format        an AST version this build cannot read is refused
4. Admit the arguments    copied through the membrane, budgeted by fuel and argsMaxBytes
5. Check the input        the arguments against the AST's inputSchema
6. Execute                the root seq, step by step, charging fuel; the run timeout,
                          the heap ceiling and per-atom quotas apply throughout
7. Check the output       the result against the AST's outputSchema, if it declares one
8. Return                 { result, error, fuelUsed, trace?, warnings? }
```

An agent that fails does not throw into the host. `error` is an `AgentError` with the step that
failed (`error.op`) and why (`error.message`). The one exception is a host mistake in step 2: a
token that is missing or has expired throws `Procedure not found` or `Procedure expired`.

## 3. The security model

The sandbox protects the host from the **agent**: the AST is untrusted. It does not protect the
host from its own **atoms** and **capabilities**: you register those, and they are trusted to be
non-blocking, to honour `ctx.signal`, and to return plain data.

| Guarantee                 | How                                                                                                                         | Read more                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| No ambient authority      | The VM has no IO of its own. Every network call, store read or model call goes through a capability the host passed.         | [Capabilities](/ajs-capabilities/)           |
| Bounded work              | Every step costs fuel; at zero the run ends with `Out of Fuel`. Work that grows with its input is charged in proportion.     | [VM budgets](/vm-budgets/)                   |
| Bounded time              | A run timeout (default: twice the slowest registered atom's timeout, at least 60 s), per-atom timeouts, and `signal`.        | [Run options](/ajs-host/#run-options)        |
| Bounded memory            | `maxHeapBytes` (64 MB) caps what the agent holds live; `membraneMaxBytes` (4 MB) caps one value crossing a capability.       | [VM budgets](/vm-budgets/)                   |
| Bounded external calls    | `quotas: { llmPredict: 3 }` caps calls per atom, which fuel cannot express.                                                  | [Quotas](/ajs-host/#quotas-across-nested-runs) |
| A closed boundary         | Values crossing to or from a capability are copies of JSON data plus `Date`, built by the VM. Getters never run; functions and class instances are refused. | [What a capability may return](/ajs-capabilities/#what-a-capability-may-return) |
| No host code from the guest | No `eval`, no function values, no prototype keys; only listed methods; regexes on the VM's own engine.                    | [AJS: The Agent Language](/DOCS-AJS/)        |
| Errors are values         | Failures are returned as `AgentError`, never thrown into the host. Bugs at the capability boundary end the run; failures of the world are catchable. | [Errors](/DOCS-AJS/#errors)                  |

Each run starts with fresh state, and the host's `capabilities` object is used exactly as passed:
the VM never copies it or writes to it. When there is no `store` capability, the run gets a
private in-memory store and a warning.

## 4. Request context

The `context` option carries request-scoped data, such as who is asking, to your atoms. The
agent cannot read it: it is not in the agent's scope, and `context` inside an agent is an
ordinary undefined name. So an atom can make authorization decisions that the agent cannot
influence:

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM, defineAtom } from 'tjs-lang/vm-ast'
import { s } from 'tjs-lang/schema'

const readRecord = defineAtom(
  'readRecord',
  s.object({ id: s.string }),
  s.object({ id: s.string, owner: s.string }),
  async ({ id }, ctx) => {
    const user = ctx.context?.user
    if (!user?.permissions.includes('records:read'))
      throw new Error('not allowed to read records')
    return { id, owner: user.id }
  }
)

const vm = new AgentVM({ readRecord })
const { ast } = transpile(
  `function report({ id: 'r1' }) {
    const row = readRecord({ id })
    return { row }
  }`,
  { atoms: vm.atoms }
)

const allowed = await vm.run(ast, { id: 'r1' }, {
  context: { user: { id: 'u-123', permissions: ['records:read'] } },
})
console.log(allowed.result) // { row: { id: 'r1', owner: 'u-123' } }

const denied = await vm.run(ast, { id: 'r1' }, {
  context: { user: { id: 'u-456', permissions: [] } },
})
console.log(denied.error.message) // not allowed to read records
```

Passing `{ atoms: vm.atoms }` to `transpile` lets it check calls to `readRecord` the way it
checks core atoms. The VM itself reads a few `context` keys, all for `httpFetch`'s policy; they
are listed in [Fetch policy](/ajs-host/#fetch-policy-the-context-keys).

### Streaming partial results

`vm.run` returns once, when the agent finishes. To send results while it runs, give it an atom
that calls a callback from `context`:

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM, defineAtom } from 'tjs-lang/vm-ast'
import { s } from 'tjs-lang/schema'

const emit = defineAtom(
  'emit',
  s.object({ data: s.any }),
  s.null,
  async ({ data }, ctx) => {
    await ctx.context?.onChunk?.(data)
    return null
  }
)

const vm = new AgentVM({ emit })
const { ast } = transpile(
  `function countdown({ from: 3 }) {
    let n = from
    while (n > 0) {
      emit({ data: { n } })
      n -= 1
    }
    return { done: true }
  }`,
  { atoms: vm.atoms }
)

const chunks = []
const run = await vm.run(ast, { from: 3 }, {
  context: { onChunk: (data) => chunks.push(data) },
})
console.log(chunks, run.result) // [{ n: 3 }, { n: 2 }, { n: 1 }] { done: true }
```

In a server, `onChunk` would write to the response (`res.write(JSON.stringify(data) + '\n')`).
The atom's input is a copy, so the callback receives plain data.

## 5. Stored procedures

The `storeProcedure` atom stores an AST and returns a token, a string like
`proc_6f1c…` (`proc_` plus a random UUID). A token can be run anywhere an AST can: by the host
with `vm.run(token, args)`, or by an agent with `agentRun({ agentId: token, input })`. That lets
behaviour be passed around as a string, the way a function pointer would be.

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const double = transpile(`function double({ n: 0 }) { return { n: n * 2 } }`).ast

// An agent that registers a handler and hands back its token.
const register = transpile(`
  function register({ handler }) {
    const token = storeProcedure({ ast: handler, ttl: 300000 })
    return { token }
  }`).ast

// An agent that runs whichever handler it is given.
const dispatch = transpile(`
  function dispatch({ handler: 'proc_', value: 0 }) {
    const out = agentRun({ agentId: handler, input: { n: value } })
    return { answer: out.n }
  }`).ast

const { token } = (await vm.run(register, { handler: double })).result

console.log((await vm.run(token, { n: 21 })).result) // { n: 42 }
console.log((await vm.run(dispatch, { handler: token, value: 5 })).result) // { answer: 10 }
```

How the store behaves:

- **It is in memory, per process.** Tokens do not survive a restart and are not shared between
  processes or machines. `procedureStore` (exported from the VM) is a module-level `Map`.
- **Entries expire.** The default `ttl` is one hour (3,600,000 ms). Running an expired token
  fails with `Procedure expired`. `releaseProcedure({ token })` deletes one early and returns
  whether it existed; `clearExpiredProcedures()` sweeps expired entries and returns how many it
  removed.
- **Size is capped.** An AST over `maxSize` bytes of JSON (default 100 KB) is refused. Anything
  without an `op` is refused as `Invalid AST`.
- **The format is checked twice:** when the AST is stored and again when the token is run, so an
  AST this build cannot read fails at the door, not later in someone else's run.
- **A token is a capability to run code, not to gain privileges.** The stored AST runs with the
  capabilities, fuel and quotas of whoever runs the token, never of whoever stored it. Tokens are
  random, so they cannot be enumerated, but anyone holding one can run it in the same process.

| Atom                     | Base fuel | Notes                                    |
| ------------------------ | --------- | ---------------------------------------- |
| `storeProcedure`         | 1         | plus a charge that grows with AST size   |
| `releaseProcedure`       | 0.1       |                                          |
| `clearExpiredProcedures` | 0.5       |                                          |

## 6. Sub-agents and whose budget they spend

`agentRun({ agentId, input })` runs another agent, which sees only `input`. What `agentId` is
decides where it runs:

- **An AST or a stored-procedure token** runs inside the caller's run. It spends the caller's
  fuel, counts against the caller's quotas, and uses the caller's capabilities. A sub-agent that
  loops forever runs the caller out of fuel; it cannot escape the budget.
- **Anything else** (usually a name) goes to the host's `agent.run(agentId, input)` capability.
  That is typically a new `vm.run`, with a fresh fuel budget and fresh quotas that the host
  chooses. Without an `agent` capability, the call fails with `Capability 'agent.run' missing`.

So the host decides how much a named sub-agent may spend. The worked example of holding one quota
across a whole call tree is in [Quotas across nested runs](/ajs-host/#quotas-across-nested-runs);
composition patterns (fan-out, pipelines, workers) are in
[Composing Agents](/patterns/#composing-agents).

## 7. Runs are not transactions

If an agent fails part way through, what it already did through a capability stays done. The VM
has no rollback, because it cannot undo a write it does not own:

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const { ast } = transpile(`
  function transfer({ amount: 0 }) {
    storeSet({ key: 'debited', value: amount })
    if (amount > 100) {
      Error('limit exceeded')
    }
    storeSet({ key: 'credited', value: amount })
    return { ok: true }
  }`)

const data = new Map()
const store = {
  get: async (key) => data.get(key),
  set: async (key, value) => {
    data.set(key, value)
  },
}

const run = await vm.run(ast, { amount: 500 }, { capabilities: { store } })
console.log(run.error.message, Object.fromEntries(data))
// limit exceeded { debited: 500 }
```

When several writes must succeed or fail together, make that one capability call that the host
performs atomically (a `transfer` atom that runs a database transaction), rather than a sequence
the agent drives.

## 8. Dependencies

What ships at runtime:

| Package         | Range     | Used for                                                                                       |
| --------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `acorn`         | `^8.15.0` | Parsing AJS and TJS source (the transpiler; not in `tjs-lang/vm-ast`)                          |
| `acorn-walk`    | `^8.3.4`  | AST traversal for the linter and the predicate verifier                                        |
| `acorn-loose`   | `^8.5.2`  | Error-tolerant parsing, so editor scope extraction works on half-typed code                    |
| `tosijs-schema` | `^1.12.0` | Schema validation. 1.12 is the floor because tjs-lang relies on its branded builders           |

None of the four has dependencies of its own. The optional peer dependencies are the five
`@codemirror/*` packages (only for `tjs-lang/editors/codemirror`) and `typescript` (only for
`tjs-lang/lang/from-ts`); nobody who skips those features needs them installed.

Sizes, measured on the 2026-11-05 build with `tosijs-schema` left external: `tjs-lang/vm-ast`
is about 137 KB minified (43 KB gzipped); `tjs-lang/vm`, which adds the transpiler and acorn,
is about 324 KB (98 KB gzipped).

To check the dependency tree for known advisories, run `bun audit`. The repository's own test
suite runs that check as a gate, over both its package trees.
