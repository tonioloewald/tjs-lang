<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 20, "requiresApi": true, "parent": "ajs-advanced.md"}-->
<!-- TODO review -->

# LLM Code Generator

A model can write AJS for you: describe a task, get back a program you can review, store and run
later, in a VM with its own fuel budget. This agent writes the program and stops; it does not run
it. It needs an LLM, so on this site it prints a message instead of running. To run it locally,
use the host script shown in [LLM Chat](/llm-chat/): the JavaScript that creates the VM and passes
it an LLM capability.

````ajs:inline
function generateCode({ task = 'Calculate the factorial of n' }) {
  // A short version of the maintained AJS prompt (see "The prompt" below)
  let systemContext =
    'You write AJS, a subset of JavaScript.\n\n' +
    'RULES:\n' +
    '- One function with ONE destructured object parameter. Give each input an EXAMPLE value ' +
    'after a colon: function sumTo({ n: 10 }) means n is a required number. ' +
    'Use = for an optional input: { limit = 10 }\n' +
    '- MUST return a plain object. WRONG: return 42. RIGHT: return { result: 42 }\n' +
    '- Do not write a return type after the parameters.\n' +
    '- Loops: for (const x of list) and while. ' +
    'NO for (let i = 0; ...), NO for...in, NO break, continue or switch.\n' +
    "- NO async, await, class, new, this, var, throw, import. Call Error('message') to fail.\n" +
    '- Assign only to plain variables: obj = { ...obj, count: 5 }, not obj.count = 5\n' +
    "- Operators need strings, numbers or booleans: items.join(', '), not '' + items\n\n" +
    'EXAMPLE - the sum of 1 to n:\n' +
    'function sumTo({ n: 10 }) {\n' +
    '  let sum = 0\n' +
    '  let i = 1\n' +
    '  while (i <= n) {\n' +
    '    sum = sum + i\n' +
    '    i = i + 1\n' +
    '  }\n' +
    '  return { result: sum }\n' +
    '}'

  // 'generated_code' names the response format for the model server;
  // the object is the shape the answer must have, by example
  let schema = Schema.response('generated_code', {
    code: '',
    description: '',
  })

  let prompt =
    systemContext +
    '\n\nWrite an AJS function for: ' +
    task +
    '\n\nPut ONLY the AJS code in the code field. It must start with "function".'

  let response = llmPredict({ prompt, options: { responseFormat: schema } })
  let result = JSON.parse(response)
  let code = result.code
  if (typeof code != 'string') {
    Error('The model returned no code field')
  }

  // Strip Markdown fences: models add them however firmly you ask them not to
  code = code.replace(/```(?:javascript|js|ajs)?\n?/g, '')
  code = code.replace(/\n?```/g, '')
  // Undo newlines the model escaped twice. This also turns a \n inside a string
  // literal of the generated code into a line break: delete these two lines
  // if your model's structured output is clean.
  code = code.replace(/\\n/g, '\n')
  code = code.replace(/\\t/g, '\t')
  code = code.trim()

  return {
    task,
    code,
    description: result.description,
  }
}
````

## What to notice

- **It writes code and stops.** Unlike [LLM Code Solver](/llm-code-solver/), this agent returns
  the source without running it. The host (or a person) decides what happens next: show it,
  test it, store it, or run it in a VM with its own budget.
- **The model is a capability.** `llmPredict` is an atom: an operation the program calls, either
  built into the VM (`llmPredict`, `httpFetch`, `storeGet`) or supplied by the host. It calls the
  `llm.predict` function the host passed in, and fails without one.
- **Structured output carries the code.** `Schema.response` builds the `responseFormat` the model
  server expects, so the answer arrives as JSON with `code` and `description` fields rather than
  code mixed into prose. `llmPredict` still returns a string, hence the `JSON.parse`.
- **A bad answer ends the run with an error, not a crash.** If the model's answer is not JSON,
  `JSON.parse` fails and the run's `error` carries the parser's message
  (`JSON Parse error: Unexpected identifier "not"`). If the JSON has no string `code` field, the
  run ends with `The model returned no code field`. Either way nothing is thrown into the host.
- **The cleanup strips Markdown fences**, because models wrap code in them however firmly you ask
  them not to.
- **"Types by example".** The prompt teaches `function sumTo({ n: 10 })`: the value after a colon
  is an example, not a type, and the colon makes the input required. `n = 10` would make it
  optional, with a default. This agent's own `task` input uses `=`, so it can be called with no
  arguments.

## The prompt

The system text in this agent is a short version of [the maintained AJS prompt](/ajs-llm-prompt/),
which is tuned and measured for small models and covers what this one leaves out (atom calls,
`try`/`catch`, array methods, dates). For real use, send that prompt and list the atoms you will
grant: a model cannot guess what your host provides.

## Checking the result

Generated source is untrusted input. Check it on the host before running it:

1. **Transpile it.** A transpile error is a cheap, early "no", and its message is what you send
   back to the model for a second attempt.
2. **Read what it calls.** The AST the transpiler produces is data: a tree of steps, each an
   object like `{ op: 'httpFetch', ... }` naming the atom it runs. Walk it for the atoms it names
   and look up each one's `effects` tag, which is `'pure'` or `'io'`. `'io'` means the atom
   reaches a capability (the network, the store, a model) or has a side effect. Host atoms, the
   ones you pass to `new AgentVM(customAtoms)`, default to `'io'`, so they are counted too. The
   walk tells you, or a reviewer, which capabilities the program wants before you decide what to
   grant.
3. **Run it with the least you can grant.** Capabilities enforce that decision: an atom whose
   capability you did not pass fails, whatever the walk said. (`httpFetch` with no `fetch`
   capability of your own uses the VM's built-in fetch, which refuses every URL unless the run
   lists allowed domains.)
4. **Call it with the inputs it declares.** The model chose the input names: asked for a
   factorial it may write `{ n: 5 }` or `{ num: 5 }`. The transpiler records them in
   `ast.inputSchema`, a JSON Schema, so read it before you call. Arguments that do not match fail
   with `Input validation failed: args do not match expected schema`.

The host side, end to end. `llm` is the capability from [LLM Chat](/llm-chat/), and
`generatorSource` is the agent above as a string:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
// vm.atoms is the VM's atom table: the core atoms plus any host atoms passed to
// new AgentVM(...), keyed by name. transpile checks each atom call against it.
const generator = transpile(generatorSource).ast

// Every atom the program names, found by walking the AST.
function atomsUsed(node, atoms, found = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) atomsUsed(item, atoms, found)
  } else if (node && typeof node === 'object') {
    if (typeof node.op === 'string' && Object.hasOwn(atoms, node.op)) {
      found.add(node.op)
    }
    for (const value of Object.values(node)) atomsUsed(value, atoms, found)
  }
  return found
}

// Ask for a program; on a transpile error, ask once more with the message.
async function generate(task) {
  let feedback = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    const run = await vm.run(
      generator,
      { task: task + feedback },
      { fuel: 1000, capabilities: { llm }, quotas: { llmPredict: 1 } }
    )
    if (run.error) return { error: run.error.message } // no model, bad JSON, no code
    try {
      return { ast: transpile(run.result.code, { atoms: vm.atoms }).ast }
    } catch (e) {
      console.log('Rejected:', e.message)
      feedback = '\n\nYour last attempt was rejected: ' + e.message
    }
  }
  return { error: 'no valid program after two attempts' }
}

const { ast, error } = await generate('Calculate the factorial of n')
if (ast) {
  const io = [...atomsUsed(ast, vm.atoms)].filter(
    (op) => vm.atoms[op].effects === 'io'
  )
  console.log('io atoms:', io) // e.g. [ 'httpFetch' ]: review before granting
  console.log('inputs:', ast.inputSchema.properties) // e.g. { n: { type: 'integer' } }

  // Test arguments for this task, checked against what the program declares.
  const args = { n: 5 }
  const missing = (ast.inputSchema.required ?? []).filter((k) => !(k in args))
  const unknown = Object.keys(args).filter(
    (k) => !(k in ast.inputSchema.properties)
  )
  if (missing.length || unknown.length) {
    console.log('Inputs differ from the task:', { missing, unknown })
  } else {
    // A first run with no capabilities: pure code runs, an io atom fails.
    // Fuel is the VM's work budget; when it runs out the run stops with
    // `Out of Fuel` in test.error. 500 is plenty for a small loop.
    const test = await vm.run(ast, args, { fuel: 500 })
    console.log(test.error ? test.error.message : test.result)
  }
} else {
  console.log(error)
}
```

If the model follows the prompt's example shape, naming its input `n` and returning
`{ result }`, the factorial task prints `io atoms: []`, `inputs: { n: { type: 'integer' } }` and
`{ result: 120 }`. A model that writes `{ num: 5 }` or returns `{ factorial: 120 }` has not done
anything wrong; the input check reports the first, and the second prints as it is.

A program that calls `httpFetch` lists it under `io atoms`. Given arguments that match its
inputs, the capability-free run fails with `Fetch blocked: no allowedFetchDomains configured`. To
grant the network for specific domains, pass them in the run's context:
`vm.run(ast, args, { fuel: 1000, context: { allowedFetchDomains: ['api.example.com'] } })`.
[iTunes Search](/itunes-search/) shows this in full.

Two limits of the walk. It over-reports: a data literal shaped like a step (`{ op: 'storeSet' }`)
counts as a call, which errs on the safe side. And it cannot see into `runCode`, the atom that
transpiles and runs a string built at run time: treat a program that uses `runCode` as able to
call anything its capabilities allow.

For how fuel is counted and what to set it to, see [Fuel Limits](/fuel-limits/).

## The gotchas

- **The model writes JavaScript.** It has seen far more JavaScript than AJS, so it reaches for
  `for (let i = 0; …)`, `switch`, `class` or `async`. The transpiler names each one as it refuses
  it, with the fix: ``Unsupported statement type: ForStatement. AJS has no `for` loops. Use
  `while` with a counter``. Sending the message back, as `generate` does, fixes most failures on
  the second attempt; [the prompt page](/ajs-llm-prompt/) lists the common messages.
- **Some mistakes pass the transpiler.** `return 42` transpiles and fails when it runs (`Agent
  must return an object`), so a test run belongs in the check, not only a transpile.
- **The unescape is a trade-off.** The two `\\n` and `\\t` replacements repair models that escape
  newlines twice, but they also turn a `\n` inside a string literal of the generated code into a
  real line break. If your model's structured output is clean, delete those two lines.
