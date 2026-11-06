<!--{"parent": "ajs.md", "order": 2}-->
<!-- TODO review -->

# AJS Examples

Runnable AJS agents, from first steps to multi-agent pipelines.

AJS is a subset of JavaScript that compiles to data: a JSON program the VM runs in a sandbox,
under a budget, with no network or storage unless the host grants it. It is for hosts that need
to run code they did not write, such as an agent a user submitted or a model generated, without
trusting it.

Every `ajs` block on these pages is live: you can edit the code and run it again in place. Each
chapter is built around an agent you can run (the ones that call a model show their code and how
to run it locally), then what to notice about it, a variation, and the place where it differs
from JavaScript or where it can fail. Here is the smallest one. Change `'World'` and run it
again:

```ajs
function hello({ name = 'World' }) {
  return { message: `Hello, ${name}!` }
}
```

What to notice: an agent takes one object of named inputs and returns a value, here an object.
The page calls it with `{}`, so `name` takes its default.

## How the examples run

They run on the same sandboxed VM you would embed, under the same rules:

- **No arguments.** The page calls each agent with an empty object, so every input takes its
  default. That is why the examples declare defaults like `name = 'World'`.
- **A budget of 10,000 fuel.** Fuel is the VM's unit of work: every operation and expression
  costs some, so the budget bounds how long a run can take. `hello` uses under 1 fuel; a
  `while` loop that adds up 1,000 numbers uses about 500. A loop that never ends stops when the
  budget runs out and returns an `Out of Fuel` error; it does not hang the page.
- **Errors are results.** A run comes back as `{ result, error, fuelUsed }`. When the agent
  fails at run time (out of fuel, a blocked fetch), `error` is set, and the page shows it next to
  the fuel used. Nothing is thrown at the page. Code that does not transpile is a different
  case: the page reports it as a syntax error before anything runs, and no fuel is spent.
- **Three hosts on the network.** The VM has no network access of its own. `httpFetch` is the
  built-in operation (an atom) that makes a request, and only to domains the host lists in
  `allowedFetchDomains`. The page lists `api.open-meteo.com`, `itunes.apple.com` and
  `api.github.com`, and nothing else, so an edited example cannot reach an arbitrary site from
  your browser.
- **No language model.** A static page has none to call, so an example that calls one prints a
  message instead of running. [LLM Chat](/llm-chat/) shows how to run them locally.

To run an example on your own machine, transpile it and hand the AST (the JSON program the
transpiler produces) to the VM, with the page's budget and network allowlist. Save the agent as
`hello.ajs`, then:

```javascript
import { readFileSync } from 'node:fs'
// `transpile` turns AJS source into the agent's AST (TJS uses `tjs()` instead).
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const { ast } = transpile(readFileSync('hello.ajs', 'utf8'))
const vm = new AgentVM()
const run = await vm.run(
  ast,
  { name: 'Ada' },
  {
    fuel: 10_000,
    context: {
      allowedFetchDomains: [
        'api.open-meteo.com',
        'itunes.apple.com',
        'api.github.com',
      ],
    },
  }
)
console.log(run.result) // { message: 'Hello, Ada!' }
console.log(run.error) // undefined
console.log(run.fuelUsed) // about 0.6
```

Locally you can pass real arguments: here `name: 'Ada'` replaces the default. The allowlist is
enough for `httpFetch` to work, using the host's `fetch`; a host that wants to control requests
itself passes a `fetch` capability instead.

When a run fails, `error` holds the error value (and `result` holds the same value). With
`fuel: 100` and a loop that never ends, `run.error` is
`{ $error: true, message: 'Out of Fuel', op: 'seq' }`.

`tjs-lang/vm-ast` is the VM without a parser: it accepts an AST only, so the transpile step runs
outside the sandbox. That matters because parsing hostile source is the one step whose cost the
attacker controls before any budget applies. With the parser outside, a bad payload can only
stall your transpile step, which you can run in a worker or cap with `maxSourceBytes`, never the
VM. [Safe Eval](/safe-eval/) covers budgets and capabilities in full.

## Where to start

Read in order if AJS is new to you. Featured shows why AJS exists, Basics covers the language,
APIs the network, LLMs models, and Advanced agents that combine them. Afterwards you can write
an agent, run it with a budget and capabilities of your choosing, and let a model write one.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Featured](/ajs-featured/)
- [Basics](/ajs-basics/)
- [APIs](/ajs-api/)
- [LLMs](/ajs-llm/)
- [Advanced](/ajs-advanced/)
<!-- /toc -->

<!-- prettier-ignore-end -->
