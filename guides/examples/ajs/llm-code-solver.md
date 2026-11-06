<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 19, "requiresApi": true, "parent": "ajs-advanced.md"}-->
<!-- TODO review -->

# LLM Code Solver

An agent that asks a model for a program, then runs it. Models are unreliable at arithmetic and
at keeping count through a loop, but they write small programs well. For a question like "the
10th Fibonacci number" it is more reliable to ask for code and run it than to ask for the answer.

That is only a reasonable thing to do because the generated code runs inside the same sandbox as
the agent, under the same budgets. **Fuel** is the VM's work budget: every step costs some, and
the run stops when it is spent. **Capabilities** are the IO functions the host injects (a model,
the network, a store); the VM has no other IO. **Atoms** are the operations an agent calls, such
as `llmPredict`, and each atom that does IO goes through a capability. The generated code spends
the agent's fuel and reaches only the agent's capabilities, so it cannot do anything the agent
could not already do. [What a run costs](/DOCS-AJS/#what-a-run-costs) and
[Run options](/ajs-host/#run-options) list every budget.

This example does not run on this page. The doc site gives agents neither a model nor the `code`
capability, so pressing run shows only:
`This example needs an LLM, which the static site does not provide. Run it locally with tjs-lang and LM Studio (see the AJS guide).`
To run it yourself, see [Running it locally](#running-it-locally).

<!-- The fence has four backticks because the code contains three: it strips Markdown fences
from the model's reply. -->

````ajs:inline
function solveWithCode({ problem = 'Calculate the 10th Fibonacci number' }) {
  // A short version of the maintained AJS prompt (see "The prompt" below)
  let rules =
    'You write AJS, a subset of JavaScript.\n\n' +
    'RULES:\n' +
    '- Write ONE function. It takes a destructured object: function solve({ n })\n' +
    '- It MUST return an object. WRONG: return 42. RIGHT: return { result: 42 }\n' +
    '- NO async, await, new, class, this, var\n' +
    // AJS has no C-style for loop: the transpiler rejects it (see the gotchas)
    '- Loops: for (const x of list) and while. NO for (let i = 0; i < n; i++)\n' +
    '- Use let for variables that change\n\n' +
    'EXAMPLE (factorial of 5):\n' +
    'function solve() {\n' +
    '  let result = 1\n' +
    '  let i = 5\n' +
    '  while (i > 1) {\n' +
    '    result = result * i\n' +
    '    i = i - 1\n' +
    '  }\n' +
    '  return { result }\n' +
    '}\n\n' +
    'Reply with ONLY the function code.'

  let prompt =
    rules + '\n\nWrite a function called "solve" that: ' + problem
  let response = llmPredict({ prompt }) // the reply text, as a string

  // Models wrap code in Markdown fences however firmly you ask them not to
  let code = response.replace(/```(?:javascript|js|ajs|asyncjs)?\n?/g, '')
  code = code.trim()

  // Some models answer with the code as an escaped string, all on one line
  if (!code.includes('\n')) {
    code = code.replace(/\\n/g, '\n').replace(/\\"/g, '"')
  }

  // Keep only the function: from "function solve" up to the LAST closing brace
  let found = code.match(/function\s+solve\s*\([^)]*\)\s*\{[\s\S]*\}/)
  if (!found) {
    return { problem, error: 'No solve function in the reply', reply: response }
  }
  code = found[0]

  try {
    let output = runCode({ code, args: {} })
    return { problem, code, output }
  } catch (err) {
    return { problem, code, error: err }
  }
}
````

With a model that answers the default problem with a working loop, the result looks like this
(the generated code is shortened here):

```javascript
{
  problem: 'Calculate the 10th Fibonacci number',
  code: 'function solve() {\n  let a = 0\n  let b = 1\n  ...\n  return { result: a }\n}',
  output: { result: 55 }
}
```

## What to notice

- **`runCode({ code, args })` transpiles the source and runs it as its own program.** The
  program starts in a fresh scope that sees only `args`: not the agent's variables, not its
  arguments, and not the [helper functions](/DOCS-AJS/#local-helper-functions) declared beside
  it (calling one is `Unknown function: twice`). Whatever the generated function returns becomes
  `runCode`'s result, here `{ result: 55 }`.
- **Cleanup is ordinary string work.** `replace` and `match` run on the VM's own regex engine,
  not the host's `RegExp`, so a pattern that would backtrack catastrophically in JavaScript only
  spends fuel; every string method is charged as fuel. The engine has no backreferences and no
  lookaround ([Regular expressions](/DOCS-AJS/#regular-expressions) lists its limits).
- **The match is greedy.** It runs to the last `}` in the reply, so an explanation after the
  function that contains a brace is kept, and the generated program then fails to transpile.
- **The escape fix is a heuristic.** It runs only on one-line replies, and repairs a reply that
  arrived as one escaped string. A string literal inside such a reply can still be damaged:
  one written `"a\\nb"` in the escaped reply comes out as `"ab"`. A reply with real newlines is never touched, which is
  why the fix is not applied to every reply.
- **The generated program shares the run.** It spends the same fuel, counts against the same
  live-heap ceiling and call quotas, and calls atoms through the same capabilities. A host that
  gave the agent no network gave the generated code no network either.
- **`err` is a string.** In AJS, `catch` receives the error's message, so `{ error: err }` reads
  well and `err.message` would be `undefined` (see [Error Handling](/ajs-error-handling/)).

## Passing data in

`args` is how the generated program gets its inputs, and it sees nothing else. The values are
passed, not copied, the way a function receives its arguments: if the generated code changes an
array or object you pass (`items.push(4)`), the agent sees the change afterwards. Pass a copy
(`args: { items: [...items] }`) when that matters.

```javascript
function doubleIt({ n = 21, apiKey = 'secret' }) {
  let code = 'function solve({ n }) {\n  return { result: n * 2 }\n}'
  let output = runCode({ code, args: { n } })
  return { output }
}
```

This block does not run on the page, because the site provides no `code` capability; run it with
the host below. It returns `{ output: { result: 42 } }`. The generated code cannot read `apiKey`:
a reference to it there is `undefined`, not an error. When you ask a model for a program that works on your data, describe the
parameters in the prompt (`function solve({ items })`) and pass the data through `args`; do
not paste the data into the prompt and hope it is copied correctly.

## Running it locally

[`runCode`](/ajs-atoms/#code-and-agents), and `transpileCode`, which returns the AST without
running it, need the [`code` capability](/ajs-capabilities/#code): a function the host provides
that turns source into an AST. Running code is a privilege the host grants, like the
network. Without it the call fails with
`Capability 'code.transpile' missing. Enable dynamic code execution by providing the code capability.`,
which the agent above catches and returns as `error`.

A complete host, with the agent above saved as `solve-with-code.ajs`. The `llm` capability is
the one from [LLM Chat](/llm-chat/), which explains it; any function that takes a prompt and
returns the reply text will do:

```javascript
import { readFileSync } from 'node:fs'
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()

// llm.predict(prompt, options) returns the reply text
const llm = {
  async predict(prompt, options = {}) {
    const res = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0,
      }),
    })
    const data = await res.json()
    return data.choices[0].message.content
  },
}
const code = {
  transpile: (source) => transpile(source, { atoms: vm.atoms }).ast,
}

const agentSource = readFileSync('solve-with-code.ajs', 'utf8')
const { ast } = transpile(agentSource, { atoms: vm.atoms })
const run = await vm.run(
  ast,
  { problem: 'Calculate the 10th Fibonacci number' },
  {
    fuel: 2000,
    capabilities: { llm, code },
    quotas: { llmPredict: 1 },
    maxSourceBytes: 4096,
  }
)
console.log(run.result ?? run.error?.message)
```

**Sizing the fuel.** The model call costs 100 fuel and the cleanup about 5 more. The generated
program's share depends on what it does: the Fibonacci loop costs about 0.7 fuel per iteration,
so the whole run for the 10th number uses about 115. A budget of 2000 leaves room for a program
that loops a couple of thousand times, and stops one that loops forever.

**`quotas`** caps how many times an atom may run in this run. Generated code counts against the
same cap, so with `{ llmPredict: 1 }` the program cannot call the model again: a second call
fails with `Quota exceeded for 'llmPredict': 1 call allowed`.

Passing `{ atoms: vm.atoms }` makes the transpiler check calls to your own atoms as well as the
core ones, so a generated call with a wrong or missing input fails at transpile time with a
message that names what the atom takes.

Transpiling runs on the host, synchronously, before fuel can stop it, so a huge or pathological
source could tie up your process before any budget applies. The VM therefore refuses generated
source over 8KB before handing it to your transpiler
(`runCode: source is over the 8192-byte limit…`). The `maxSourceBytes` run option, shown above,
can lower that cap for generated code, never raise it.

## The prompt

The rules in the agent are a short version of [the maintained AJS prompt](/ajs-llm-prompt/),
which is tuned and measured against a small model. For real use, start from that page: it covers
more of the mistakes models make, and it tells you how to list your host's atoms so the model
can call them.

The single most useful thing a prompt can do is show one complete, correct example. The
factorial in the rules is there for that reason.

## The gotchas

- **Generated code fails like any code.** If the model writes a C-style loop, `err` is
  `Code transpilation failed: Unsupported statement type: ForStatement`, followed by an
  explanation and a rewrite using `while` with a counter. These messages are written to be sent
  back to the model as they are: see the self-correction loop on
  [the prompt page](/ajs-llm-prompt/).
- **Generated code can call `runCode` too**, so nesting is capped at 10 levels
  (`runCode recursion limit exceeded (max 10)`).
- **Some failures can be caught, some end the run.** The agent's `catch` receives:
  a transpile failure, the missing `code` capability, an error the generated program raises
  while running (bad JSON, for instance), an exceeded quota, and the nesting limit. Running out
  of fuel is different: a generated program that loops forever spends the agent's fuel, not a
  budget of its own, and the run finishes with `Out of Fuel` without the agent's `catch` ever
  running. [Catchable, and run-ending](/DOCS-AJS/#catchable-and-run-ending) has the full list.
- **A model's answer is still a guess.** Running the program makes the arithmetic right, not the
  program. Return the code alongside the output, as this agent does, so a person or a check can
  see what was actually computed.
- **To keep a program instead of running it**, use `transpileCode({ code })`, which returns the
  AST without executing it. [LLM Code Generator](/llm-code-generator/) shows that side.
