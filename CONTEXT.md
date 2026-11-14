<!--{"section": "ajs", "group": "docs", "order": 14, "navTitle": "Technical Context", "parent": "ajs.md", "book": ["default"]}-->
<!-- TODO review -->

# The AJS VM: Technical Context

AJS lets a program run code it did not write, from a user, another service or a language model,
without trusting it. The code runs inside a VM (a virtual machine: a program that executes other
programs). It cannot touch anything you did not hand it, and it always stops. AJS is a subset of
TJS: JavaScript with typed signatures. You do not need this chapter to write TJS or AJS programs.

This chapter is advanced material: the map of how the AJS VM is built, for people embedding the
VM in their own program or reviewing it. If you only want to write agents, read
[AJS: The Agent Language](/DOCS-AJS/) first, and you can skip this page. The day-to-day host API
(every run option, capabilities, quotas, tracing) is in [Embedding the AJS VM](/ajs-host/), and
writing atoms is in [Capabilities and Custom Atoms](/ajs-capabilities/).

## Terms

- **Host**: your program. It creates the VM, decides what the agent may do, and calls `vm.run`.
- **Agent**: the untrusted program the VM runs. (VM source code and some error messages call it
  the *guest*.)
- **Front end**: anything that produces an agent's AST: the transpiler, the builder, or a
  compiler of your own.
- **Atom**: one operation an agent can call, such as `httpFetch` or `storeGet`. The VM's core
  atoms are built in; the host can register more.
- **Capability**: a piece of the host's IO (a `fetch` function, a key-value store, a model client)
  that the host passes to a run. Atoms reach the outside world only through capabilities.
- **Fuel**: the work budget. Every step spends some, and the run stops when it reaches zero. An
  expression node costs 0.01, setting a variable 0.1, `storeSet` 5 and `llmPredict` 100; the
  default budget is 1000. The full table is in [What a run costs](/DOCS-AJS/#what-a-run-costs).
- **Membrane**: the copy-and-check layer every value passes through when it enters or leaves the
  VM. A value that crosses is a fresh copy of plain JSON data (plus `Date`), so the agent never
  holds a live host object, and the host never receives a live agent one.
- **Heap ceiling**: the cap on how much memory the agent may hold at once (`maxHeapBytes`).

## 1. The pieces

An agent travels as a **JSON AST**: its program written out as plain JSON data. A front end
produces the AST, and the VM runs it:

| Piece        | Where it lives                              | What it does                                                                                        |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Transpiler   | `transpile` from `tjs-lang/lang`            | AJS source to AST. Checks atom calls, parameters and syntax, and explains what to write instead.    |
| Builder      | `Agent` from `tjs-lang`, or `vm.Agent`      | Builds the same AST in code with a fluent API. It does not check atom calls or parameters.          |
| AST          | plain JSON, `"$ajs": 2` from the transpiler | The wire format. It can be stored, sent over a network and run elsewhere.                           |
| VM           | `AgentVM` from `tjs-lang/vm-ast`            | Runs an AST: the atoms, fuel, timeouts, the heap ceiling and the membrane.                          |
| Atoms        | core atoms, plus any the host registers     | The operations an agent can call (`httpFetch`, `storeGet`, `llmPredict`, your own).                 |
| Capabilities | the `capabilities` run option               | The host's IO: `fetch`, `store`, `llm`, `agent`, and whatever your own atoms read. Empty by default. |

The split between the front ends and the VM is deliberate. The builder and the transpiler
contain no execution logic, and the VM's core contains no parser; `tjs-lang/vm-ast` ships it
without one. That is why `vm-ast` is the recommended VM.

Parsing is the risky step. How long it takes and how much memory it uses is decided by the
source text, and it happens before fuel, timeouts or any other budget apply, so crafted source
can make it slow or memory-hungry. A VM with no parser cannot be attacked that way. So transpile
on the side that owns the source (your build, a worker, a separate process), and send the AST:

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

// Where the source is handled: source in, JSON AST out.
// Parameter values are examples, as in TJS: 0.0 means "a number".
const { ast } = transpile(`
  function total({ price: 0.0, taxRate: 0.0 }) {
    return { total: price * (1 + taxRate) }
  }
`)

// Where the agent runs: AST in, result out.
const vm = new AgentVM()
const run = await vm.run(ast, { price: 100, taxRate: 0.2 }, { fuel: 100 })
console.log(run.result, run.error) // { total: 120 } undefined
console.log(run.fuelUsed < 1) // true: this agent spends under 1 of its 100 fuel
```

`tjs-lang/vm` is the same `AgentVM` with the transpiler wired in, so it also accepts source.
Passing source to `vm.run` is deprecated as of 0.14.0; `tjs-lang/vm-ast` refuses it and says
where to transpile instead. On `tjs-lang/vm`, `vm.run(source)` refuses source over
`maxSourceBytes` (8 KB by default). If you call `transpile` yourself on source you did not write,
cap it the same way: `transpile(source, { maxSourceBytes: 64 * 1024 })`.

### The builder

The builder is for generating agents in code. Start with `Agent.take(schema)` (the input
schema), chain atom calls, and finish with `.toJSON()`. `vm.Agent` is the same builder with the
VM's custom atoms added.

```typescript
import { Agent, AgentVM } from 'tjs-lang'
import { s } from 'tjs-lang/schema'

const ast = Agent.take(s.object({ n: s.number })) // the input schema
  .varsImport(['n']) // copy the input field n into the agent's state
  .if(
    'n > 10', // the condition, as a string
    { n: 'n' }, // condition name -> state variable
    (then) => then.varSet({ key: 'size', value: 'big' }),
    (otherwise) => otherwise.varSet({ key: 'size', value: 'small' })
  )
  .return(s.object({ size: s.string })) // the output schema
  .toJSON()

const vm = new AgentVM()
console.log((await vm.run(ast, { n: 42 })).result) // { size: 'big' }
console.log((await vm.run(ast, { n: 1 })).result) // { size: 'small' }
```

An `if` or `while` condition in the builder is a string, parsed when the AST is built:

- **Supported:** comparisons, `&&`, `||`, `!`, arithmetic, parentheses, member access
  (`obj.foo.bar`) and literals.
- **Refused:** a ternary, an index (`a[0]`) or a call (`f(x)`). Building the AST throws
  `Unsupported condition syntax`.
- **The name map:** the second argument maps each name the condition uses to a variable (or a
  dotted path) in the agent's state. A name the condition reads that the map leaves out gets a
  `console.warn` from the builder, at build time.

To test something the condition grammar refuses, compute it first with a `varSet` whose value is
an expression node (see the next section), then test that variable:

```typescript
import { Agent, AgentVM } from 'tjs-lang'
import { s } from 'tjs-lang/schema'

const ast = Agent.take(s.object({ items: s.array(s.number) }))
  .varsImport(['items'])
  .varSet({
    key: 'first', // items[0], as an expression node
    value: {
      $expr: 'member',
      object: { $expr: 'ident', name: 'items' },
      property: { $expr: 'literal', value: 0 },
      computed: true,
    },
  })
  .if(
    'first > 10',
    { first: 'first' },
    (then) => then.varSet({ key: 'size', value: 'big' }),
    (otherwise) => otherwise.varSet({ key: 'size', value: 'small' })
  )
  .return(s.object({ size: s.string }))
  .toJSON()

const vm = new AgentVM()
console.log((await vm.run(ast, { items: [42] })).result) // { size: 'big' }
```

The builder writes a version-1 AST (`"$ajs": 1`), the older format, in which a bare string that
names a variable in scope is read as that variable. In the first builder example, `'big'` stays
a string only because the agent has no variable called `big`; if it had one, `size` would get
that variable's value. To write a string that is always a string, use a literal node:
`value: { $expr: 'literal', value: 'big' }`. The transpiler writes version 2, in which a bare
string is always a string, so for anything written by hand the transpiler is the safer front
end. Both formats run; they are described under [JSON AST Format](/DOCS-AJS/#json-ast-format).

### Expressions are nodes

There is no `eval` anywhere in the VM. Arithmetic and logic are AST nodes, evaluated by the VM:

| `$expr`           | Shape                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| `literal`         | `{ $expr: 'literal', value: 5 }`                                            |
| `ident`           | `{ $expr: 'ident', name: 'x' }`                                             |
| `member`          | `{ $expr: 'member', object, property, computed? }`; `computed` is `obj[key]` |
| `binary`          | `+ - * / % **`, comparisons, `==` `!=` `===` `!==`                          |
| `unary`           | `!`, `-`, `+`, `typeof`                                                     |
| `logical`         | `&&`, `\|\|`, `??`                                                           |
| `conditional`     | `test ? consequent : alternate`                                             |
| `array`, `object` | literals                                                                    |
| `call`            | a builtin (`Math.max`) or one of the agent's own [helper functions](/DOCS-AJS/#local-helper-functions) |
| `methodCall`      | a method the VM's method table lists (`name.trim()`)                        |
| `regex`           | a regex literal, run on the VM's own engine, whose running time cannot blow up on crafted input |

Each node costs 0.01 fuel. `__proto__`, `constructor` and `prototype` are refused as property
names, read or written. `new` and `this` do not exist. A method can be called only if the
method table (`METHOD_TABLE` in `src/vm/runtime.ts`) has an entry for it, and every entry bounds
what the call can allocate; see [VM budgets](/vm-budgets/).

## 2. What happens in a run

`vm.run(ast, args, options)` does these things in order. The agent's code runs only in step 7.

```text
1. Admit the options      read each option once, check it, freeze the result
2. Resolve the AST        a stored-procedure token (proc_…) is looked up here (section 5)
3. Gate the format        an AST version this build cannot read is refused
4. Check the root         the AST's root must be a seq (its top-level list of steps)
5. Admit the arguments    copied through the membrane, budgeted by fuel and argsMaxBytes
6. Check the input        the arguments against the AST's inputSchema
7. Execute                the root seq, step by step, charging fuel; the run timeout,
                          the heap ceiling and per-atom quotas apply throughout
8. Check the output       the result against the AST's outputSchema, if it declares one
9. Return                 { result, error, fuelUsed, trace?, warnings? }
```

The schemas come from the front end. The transpiler derives `inputSchema` from the function's
parameter examples and `outputSchema` from a declared result; the builder takes them from
`.take()` and `.return()`.

Some failures come back as the run's `error`, and some throw into the host:

| Comes back as `error`                                        | Throws into the host                                      |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| Anything the agent does: a failed atom, `Error(...)`, out of fuel, a timeout | A token that is missing (`Procedure not found`) or expired (`Procedure expired`) |
| A bad run option (`fuel: -1`)                                | An AST format version this build cannot read              |
| Arguments the membrane refuses                               | A root that is not a `seq`                                |
| Arguments that do not match `inputSchema`                    | Source passed to `tjs-lang/vm-ast`                        |
| A result that does not match `outputSchema`                  | Source that fails to transpile, on `tjs-lang/vm`          |

The rule: what the agent does, and whether its options, arguments and result are admitted,
comes back as a value. A host mistake about *what* is being run throws.

`error` is an `AgentError` with the step that failed (`error.op`) and why (`error.message`).
Test for one with `isAgentError(value)`, exported from `tjs-lang/vm-ast`.

## 3. The security model

The sandbox protects the host from the **agent**: the AST is untrusted. It does not protect the
host from its own **atoms** and **capabilities**: you register those, and they are trusted to be
non-blocking, to stop when the run's abort signal (`ctx.signal`, an `AbortSignal`) fires, and to
return plain data.

**No ambient authority.** The VM has no IO of its own. Every network call, store read or model
call goes through a capability the host passed. See [Capabilities](/ajs-capabilities/).

**Bounded work.** Every step costs fuel; at zero the run ends with `Out of Fuel`. Work that grows
with its input (copying, string building, a regex) is charged in proportion. See
[VM budgets](/vm-budgets/).

**Bounded time.** Each run has a timeout. The default is the larger of 60 seconds and twice the
longest timeout of any registered atom; `timeoutMs` sets it. Each atom call also has its own
timeout, and the host can cancel a run with the `signal` option. See
[Run options](/ajs-host/#run-options).

**Bounded memory.** `maxHeapBytes` (64 MB by default) caps what the agent holds live;
`membraneMaxBytes` (4 MB) caps one value crossing to or from a capability. See
[VM budgets](/vm-budgets/).

**Bounded external calls.** `quotas: { llmPredict: 3 }` caps how many times an atom may be called
in a run, which fuel cannot express. See [Quotas](/ajs-host/#quotas-across-nested-runs).

**A closed boundary.** Values crossing to or from a capability are copies of JSON data plus
`Date`, built by the VM. Getters never run; functions and class instances are refused. See
[What a capability may return](/ajs-capabilities/#what-a-capability-may-return).

**No host code from the agent.** No `eval`, no function values, no prototype keys; only listed
methods; regexes on the VM's own engine. See [AJS: The Agent Language](/DOCS-AJS/).

**Errors are values.** Failures are returned as `AgentError`, never thrown into the host. Inside
the agent, AJS's `try`/`catch` can catch a failure of the outside world: a fetch that returns an
error or is blocked, a capability answer that is too large. A bug at the capability boundary
ends the run even inside a `try`: an atom called with input that does not match its declared
schema, or a capability that returns a class instance. See
[Catchable, and run-ending](/DOCS-AJS/#catchable-and-run-ending).

Each run starts with fresh state, and the host's `capabilities` object is used exactly as passed:
the VM never copies it or writes to it. When there is no `store` capability, the run gets a
private in-memory store, and a warning in the run's `warnings` if the agent uses it.

## 4. Request context

The `context` option carries request-scoped data, such as who is asking, to your atoms. The
agent cannot read it: it is not in the agent's scope, and `context` inside an agent is an
ordinary undefined name. So an atom can make authorization decisions that the agent cannot
influence.

`defineAtom` takes the atom's name, its input schema, its output schema and its implementation.
The implementation receives the input and `ctx`, the per-call context the VM passes to every
atom; `ctx.context` is the run's `context` option. An atom may throw: the VM turns that into a
failed step, which the agent can catch, and which otherwise becomes the run's `error`.

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM, defineAtom } from 'tjs-lang/vm-ast'
import { s } from 'tjs-lang/schema'

const readRecord = defineAtom(
  'readRecord', // name
  s.object({ id: s.string }), // input schema
  s.object({ id: s.string, owner: s.string }), // output schema
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
are listed in [Fetch policy](/ajs-host/#fetch-policy).

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

The agent writes `emit(...)` without `await`, but the VM waits for every atom call to finish
before the next step, so chunks arrive in order. In a server, `onChunk` would write to the
response (`res.write(JSON.stringify(data) + '\n')`). The atom's input has crossed the membrane,
so the callback receives a plain copy, never a live object from inside the agent.

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
// handler has no example value: it accepts anything, here an AST passed as plain JSON.
const register = transpile(`
  function register({ handler }) {
    const token = storeProcedure({ ast: handler, ttl: 300000 })
    return { token }
  }`).ast

// An agent that runs whichever handler it is given.
// 'proc_' is only an example value: it says "a string".
const dispatch = transpile(`
  function dispatch({ handler: 'proc_', value: 0 }) {
    const out = agentRun({ agentId: handler, input: { n: value } })
    return { answer: out.n }
  }`).ast

const { token } = (await vm.run(register, { handler: double })).result

console.log((await vm.run(token, { n: 21 })).result) // { n: 42 }
console.log((await vm.run(dispatch, { handler: token, value: 5 })).result) // { answer: 10 }
```

An AST is plain JSON, so it is a legal run argument: it crosses the membrane like any other
data.

How the store behaves:

- **It is in memory, per process.** Tokens do not survive a restart and are not shared between
  processes or machines. The store is `procedureStore`, a `Map` exported from the VM, so a host
  can inspect it or clear it.
- **Entries expire.** The default `ttl` is one hour (3,600,000 ms). Running an expired token
  fails with `Procedure expired`. `releaseProcedure({ token })` deletes one early and returns
  whether it existed; `clearExpiredProcedures()` sweeps expired entries and returns how many it
  removed.
- **Size is capped.** An AST over `maxSize` bytes of JSON is refused; the default is 100 KB, and
  `storeProcedure({ ast, maxSize })` sets another. The AST's root must have an `op` field (every
  AST from the transpiler or the builder has one); anything else is refused as `Invalid AST`.
- **The format is checked twice:** when the AST is stored and again when the token is run, so an
  AST this build cannot read fails at the door, not later in someone else's run.
- **A token is a capability to run code, not to gain privileges.** The stored AST runs with the
  capabilities, fuel and quotas of whoever runs the token, never of whoever stored it. Tokens are
  random, so they cannot be enumerated, but anyone holding one can run it in the same process.

| Atom                     | Base fuel | Notes                                                        |
| ------------------------ | --------- | ------------------------------------------------------------ |
| `storeProcedure`         | 1         | plus copying the AST, charged by its size ([VM budgets](/vm-budgets/)) |
| `releaseProcedure`       | 0.1       |                                                              |
| `clearExpiredProcedures` | 0.5       |                                                              |

## 6. Sub-agents and whose budget they spend

`agentRun({ agentId, input })` runs another agent, which sees only `input`. What `agentId` is
decides where it runs:

- **An AST, or a string starting with `proc_`** (a stored-procedure token) runs inside the
  caller's run. It spends the caller's fuel, counts against the caller's quotas, and uses the
  caller's capabilities. A sub-agent that loops forever runs the caller out of fuel; it cannot
  escape the budget.
- **Any other string** (usually a name) goes to the host's `agent` capability, whose minimal shape
  is `{ agent: { run: async (agentId, input) => result } }`. That is typically a new `vm.run`,
  with a fresh fuel budget and fresh quotas that the host chooses. Without an `agent` capability,
  the call fails with `Capability 'agent.run' missing`.

An inline sub-agent's declared parameters and result are **not** checked: steps 6 and 8 of a run
happen only in `vm.run`. A stored `function double({ n: 0 }): { n: 0 }` run through `agentRun`
with `{ n: 'x' }` runs and returns whatever it computes. If a sub-agent's contract matters, check
its result in the caller, or serve it through the `agent` capability with its own `vm.run`.

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
      Error('limit exceeded') // AJS has no throw: calling Error(...) fails the run
    }
    storeSet({ key: 'credited', value: amount })
    return { ok: true }
  }`)

// The smallest store capability: async get and set.
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
the agent drives. How `Error(...)` and `try`/`catch` work is in [Errors](/DOCS-AJS/#errors).

## 8. Dependencies and size

`tjs-lang/vm-ast` needs one package at runtime, `tosijs-schema` (`^1.12.0`), for schema
validation. 1.12 is the floor because it marks its schema builders, so tjs-lang can tell a
builder from a plain object that happens to have a `schema` key. The transpiler adds `acorn`,
the JavaScript parser. The package as a whole also ships `acorn-walk` (for the linter and the
predicate verifier) and `acorn-loose` (so editor tooling can read half-typed code). Between them
they pull in nothing else: `acorn-walk` and `acorn-loose` depend only on `acorn`, and `acorn` and
`tosijs-schema` have no dependencies.

Sizes, measured on the 2026-11-05 build with `tosijs-schema` left external: `tjs-lang/vm-ast`
is about 137 KB minified (43 KB gzipped); `tjs-lang/vm`, which adds the transpiler and acorn,
is about 324 KB (98 KB gzipped).

## Further reading

- [Embedding the AJS VM](/ajs-host/): run options, capabilities, quotas, tracing.
- [VM budgets](/vm-budgets/): how fuel and the heap ceiling are measured.
- [The universal endpoint](/universal-endpoint/): the same agent and atoms running in a browser and on a server, under one security model.
