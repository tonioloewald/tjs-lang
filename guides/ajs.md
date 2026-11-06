<!--{"pin": "top", "order": 20, "book": ["default", "ajs"]}-->
<!-- TODO review -->

# AJS: Code That Travels to Data

AJS is a subset of JavaScript for code you do not trust: agents written by a language model,
scripts submitted by users, logic sent from another service. It is the familiar syntax with
the dangerous parts left out, and it never runs as JavaScript.

An AJS program goes through three steps:

1. **Transpile.** The source is parsed and checked on the side that owns it, and becomes a
   versioned JSON AST. Mistakes are refused here, with a message that says what to write
   instead.
2. **Ship.** The AST is plain JSON, so it can be stored in a database, sent over the network,
   or inspected before anything runs it. This is what the title means: instead of pulling the
   data out to wherever the code lives, you send the program to the service that holds the
   data. The data stays put, the host decides what the program may touch, and the program can
   be read before it runs.
3. **Run.** The AJS VM executes the AST. Every step costs fuel, so a runaway agent stops. The
   VM can reach nothing by default: no network, no storage, no model. The host passes each
   one in for this run as a capability, an object of functions given to `vm.run` (the
   quickstart below passes `capabilities: { llm: { predict } }`).

Fuel is counted in small units. An expression node costs 0.01, a variable write 0.1, an
`httpFetch` 5 and a model call 100; a run's default budget is 1000.

The VM is the security boundary, and it only has to be correct and safe. Being helpful is the
transpiler's job: it rejects bad programs before they reach the VM and explains the fix.

The built-in operations an agent calls, such as `llmPredict`, `httpFetch` or `storeGet`, are
**atoms**. An atom takes one object of named inputs, `storeSet({ key, value })`, and the
transpiler refuses a positional call, `storeSet('k', v)`. Some JavaScript is left out, and
each refusal names the replacement: there is no C-style `for` (use `for...of`, or `while` with
a counter), and no `throw`, because an error is a value, not an exception that could escape
into the host (call `Error('message')`, which a `try`/`catch` can take). [The language
guide](/DOCS-AJS/) lists every rule.

## Who this book is for

- **Embedders** run AJS inside an application or a service. You decide what an agent may do:
  which capabilities it gets, how much fuel, how many model calls. Start with the quickstart
  below, then [Embedding the AJS VM](/ajs-host/), [Capabilities and Custom
  Atoms](/ajs-capabilities/) and [Safe Eval](/safe-eval/) (the same VM as a drop-in for
  `eval`).
- **Agent authors**, people or models, write the programs. You need the language rules and
  the atom list. Start with the first agent below, then [the language guide](/DOCS-AJS/),
  [the examples](/ajs-examples/) and the [Atom Reference](/ajs-atoms/). The [LLM system
  prompt](/ajs-llm-prompt/) is the same material written for a model.

## A first agent

On the doc site this agent runs in the page, called with no arguments, and its result appears
below the code:

```ajs
function shortlist({ items = [
  { name: 'kettle', price: 40 },
  { name: 'toaster', price: 25 },
  { name: 'blender', price: 90 },
], maxPrice = 50 }) {
  let affordable = items.filter((item) => item.price <= maxPrice)
  let names = affordable.map((item) => item.name)
  let total = affordable.reduce((sum, item) => sum + item.price, 0)
  return { names, total }
}
```

It returns `{ names: ['kettle', 'toaster'], total: 65 }` for about 5 fuel. The shape is the
one every agent has: one destructured object in, one plain object out, so agents compose.

A parameter's value sets its type. `maxPrice = 50` is a default, used when the caller leaves
`maxPrice` out, and it makes `maxPrice` an integer: `{ maxPrice: 49.5 }` is refused. Write
`50.0` to accept any number. A colon (`maxPrice: 50`) would make the argument required, with
`50` as an example of its type.

## Quickstart for embedders

The host transpiles the agent, then runs the AST on `tjs-lang/vm-ast`, the VM build with no
parser in it. This agent asks a model for a summary, so the host grants it a model, here a
stand-in function, and allows exactly one call:

```typescript
import { transpile } from 'tjs-lang/lang' // where the source is handled
import { AgentVM } from 'tjs-lang/vm-ast' // where the agent runs

const source = `
/**
 * Summarize a list of notes in one line.
 * @param notes - the notes to summarize
 */
function summarize({ notes = ['buy milk'], style = 'terse' }): { summary: '', count: 0 } {
  if (notes.length == 0) {
    return { summary: '', count: 0 }
  }
  let summary = llmPredict({
    prompt: \`Summarize, \${style}: \${notes.join('; ')}\`,
  })
  return { summary, count: notes.length }
}
`

// Model-written source is untrusted input to the parser too, so cap its size.
// A bad program throws here (see below); catch it where you accept submissions.
const { ast } = transpile(source, { maxSourceBytes: 64 * 1024 })

const vm = new AgentVM()
const { result, error, fuelUsed } = await vm.run(
  ast,
  { notes: ['ship the release', 'write the docs'] },
  {
    fuel: 1000, // the time budget: every step costs fuel
    capabilities: {
      // the only model this agent can reach; a real host calls its LLM here
      llm: { predict: async (prompt) => `summary of: ${prompt}` },
    },
    quotas: { llmPredict: 1 }, // at most one model call, whatever the fuel allows
  }
)

if (error) console.log(error.op, error.message)
else console.log(result, fuelUsed)
// { summary: 'summary of: Summarize, terse: ship the release; write the docs',
//   count: 2 }  101.4  (the model call is 100 fuel; the rest is about 1.4)
```

**Transpiling** reports a bad program by throwing. Had the agent used `throw`, `transpile`
would throw a `TranspileError` with `'throw' is not supported in AsyncJS. Use
Error('message') to trigger error flow`, plus the line and column. Source over
`maxSourceBytes` is refused the same way, before it is parsed.

**Running** never throws for a failing agent. `vm.run` returns `{ result, error, fuelUsed }`,
and on failure `error` is an `AgentError` naming the step that failed (`error.op`) and why
(`error.message`). `result` then holds the same error object, so check `error` first.
Changing one thing above shows each guard:

| Change                                | `error.op`   | `error.message`                                              |
| ------------------------------------- | ------------ | ------------------------------------------------------------ |
| leave out `capabilities`              | `llmPredict` | `Capability 'llm.predict' missing`                           |
| `fuel: 1`                             | `varAssign`  | `Out of Fuel`                                                |
| call `llmPredict` twice in the agent  | `llmPredict` | `Quota exceeded for 'llmPredict': 1 call allowed`            |
| `{ notes: 'x' }` as the arguments     | `vm.run`     | `Input validation failed: args do not match expected schema` |
| return `{ summary, count, debug: 1 }` | `vm.run`     | `Result does not match the declared result type`             |

With `fuel: 1`, `error.op` is whichever step was running when the fuel ran out; here that is
the first assignment. The fourth row is the parameters at work: they are the agent's input
contract, checked before it runs. The declared result after the parameter list,
`: { summary: '', count: 0 }`, is the output contract, checked when the agent returns.

The `llmPredict` atom calls `capabilities.llm.predict`, and quotas are keyed by atom name. The
[Atom Reference](/ajs-atoms/) lists the capability every atom needs.

Two more things the quickstart relies on:

- **Transpile outside the VM.** `tjs-lang/vm-ast` refuses source, with a message saying where
  to transpile, and a VM that cannot parse has no parser defect for a payload to reach.
  Passing source to `vm.run` on `tjs-lang/vm` still works and is deprecated. For agents you
  wrote yourself, the `ajs` tagged template (from `tjs-lang`) turns source into an AST in one
  step, with no `signature` and no size cap.
- **The other limits have safe defaults.** Wall-clock time, live memory and the size of a
  value crossing a capability are all bounded; [Run options](/ajs-host/#run-options) lists
  them.

## Agents as tools

`transpile` also returns a `signature`: the entry function's name, its JSDoc description and
its parameters. `createAgent` wraps an agent as an async function, and `getToolDefinitions`
turns such functions into OpenAI-style tool definitions. When the model answers with a tool
call, dispatch it by name:

```javascript
const tools = { shortlist: createAgent(shortlistSource, new AgentVM(), { fuel: 1000 }) }
const definitions = getToolDefinitions(tools) // offer these to the model

// the model replies with a tool call
const call = { function: { name: 'shortlist', arguments: '{"maxPrice":30}' } }
await tools[call.function.name](JSON.parse(call.function.arguments))
// { names: ['toaster'], total: 25 }
```

Here `shortlistSource` is the first agent's source as a string. The function `createAgent`
returns resolves to the run's `result`, which on failure is the `AgentError`. It also parses
where it runs, with no size cap, so use it only for agents you wrote. The full version is in
[Agents as tools](/ajs-host/#agents-as-tools).

## Reading path

1. **The language.** [The AJS Language](/DOCS-AJS/): what is allowed and forbidden, the
   input and output contract, builtins, errors, and the JSON AST format.
2. **Examples.** [AJS Examples](/ajs-examples/): runnable agents, from string handling to API
   calls and model pipelines.
3. **Patterns.** [AJS Patterns](/patterns/): what to write instead of `break`, `switch`,
   retries and parallel calls, and which of those belong to the host.
4. **Safe Eval.** [Safe Eval](/safe-eval/): the same VM as `Eval` and `SafeFunction`, for
   running snippets in place of `eval()` and `new Function()`.
5. **Embedding.** [Embedding the AJS VM](/ajs-host/): run options, fuel, timeouts, the heap
   ceiling, quotas, and what `vm.run` returns.
6. **Capabilities.** [Capabilities and Custom Atoms](/ajs-capabilities/), then [The universal
   endpoint](/universal-endpoint/) for one capability model shared by browser and server.
7. **Atom reference.** [Atom Reference](/ajs-atoms/): every atom, including the batteries
   (optional atoms for a local model and vector search).
8. **The LLM prompt.** [AJS LLM System Prompt](/ajs-llm-prompt/): a system prompt for models
   that write AJS.
9. **Internals.** [VM budgets](/vm-budgets/) (how fuel and the heap ceiling stay true) and
   [Technical Context](/CONTEXT/) (the VM's architecture).

**Design notes, not yet shipped:** the [native VM](/ajs-native-vm/) (Rust compiled to wasm),
the [Lean specification](/ajs-lean-spec/), and [Pattern](/pattern/), the planned replacement
for regex. AJS supports regex today, on the VM's own linear-time engine; see [Regular
expressions](/DOCS-AJS/#regular-expressions).

To run the model examples on your own machine, see [Running a local model (LM
Studio)](/lm-studio-setup/) or [Local models with MLX](/mlx-setup/).

## In this section

<!-- prettier-ignore-start -->

<!-- toc -->
- [The AJS Language](/DOCS-AJS/)
- [AJS Examples](/ajs-examples/)
- [AJS Patterns](/patterns/)
- [Safe Eval](/safe-eval/)
- [Embedding the AJS VM](/ajs-host/)
- [Capabilities and Custom Atoms](/ajs-capabilities/)
- [The universal endpoint: isomorphic atoms, one security model](/universal-endpoint/)
- [Atom Reference](/ajs-atoms/)
- [AJS LLM System Prompt](/ajs-llm-prompt/)
- [VM budgets: how fuel and `maxHeapBytes` stay true](/vm-budgets/)
- [The AJS VM: Technical Context](/CONTEXT/)
- [AJS Native VM (Rust → wasm): the planned 1.0 VM](/ajs-native-vm/)
- [A Lean 4 specification of the AJS VM](/ajs-lean-spec/)
- [Pattern: the planned replacement for regex in AJS](/pattern/)
- [Running a local model (LM Studio)](/lm-studio-setup/)
- [Local models with MLX](/mlx-setup/)
<!-- /toc -->

<!-- prettier-ignore-end -->
