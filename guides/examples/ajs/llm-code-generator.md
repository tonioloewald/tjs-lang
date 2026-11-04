<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 20, "requiresApi": true, "parent": "ajs-advanced.md"}-->

# LLM Code Generator

LLM writes AsyncJS code from a description (requires llm capability)

<!-- TODO review -->
Because AJS is small and runs safely, a model can write it for you: describe a task, get back a
program you can store, review and run later. This is how a product lets its users (or its own
agents) automate things without being handed a real programming environment. It needs an LLM, so
on this site it prints a message instead of running; run it locally with the host from
[LLM Chat](/llm-chat/).

````ajs:inline
function generateCode({ task = 'Calculate the factorial of n' }) {
  // System prompt with AsyncJS rules and complete example
  let systemContext =
    'You write AsyncJS code. AsyncJS is a subset of JavaScript.\n\nRULES:\n- Functions take a destructured object param: function foo({ a, b })\n- MUST return an object. WRONG: return 42. RIGHT: return { result: 42 }\n- Types by example: fn({ n: 5 }) means required number param with example value 5\n- NO: async, await, new, class, this, var, for, generator functions (function*)\n- Use let for variables, while for loops\n\nEXAMPLE - calculating sum of 1 to n:\nfunction sumTo({ n: 10 }) {\n  let sum = 0\n  let i = 1\n  while (i <= n) {\n    sum = sum + i\n    i = i + 1\n  }\n  return { result: sum }\n}'

  let schema = Schema.response('generated_code', {
    code: '',
    description: '',
  })

  let prompt =
    systemContext +
    '\n\nWrite an AsyncJS function for: ' +
    task +
    '\n\nReturn ONLY valid AsyncJS code in the code field. Must start with "function" and use while loops (not for loops).'

  let response = llmPredict({ prompt, options: { responseFormat: schema } })
  let result = JSON.parse(response)

  // Clean up any markdown fences and fix escaped newlines
  let code = result.code
  code = code.replace(/```(?:javascript|js)?\n?/g, '')
  code = code.replace(/\n?```/g, '')
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

<!-- TODO review -->
## What to notice

- **It writes code and stops.** Unlike [LLM Code Solver](/llm-code-solver/), this agent returns
  the source without running it. The host (or a person) decides what happens next: show it,
  test it, store it, or run it in a VM with its own budget.
- **Structured output carries the code.** The model answers in a `{ code, description }` shape,
  so the code arrives in a field rather than mixed into prose; the cleanup only has to deal with
  fences and escaped newlines.
- **"Types by example".** The prompt teaches `function sumTo({ n: 10 })`: in AJS, as in TJS, the
  value after a colon in a parameter is an example, not a type, and the colon makes the
  parameter required. (`n = 10` would make it optional, with a default.)

<!-- TODO review -->
## Checking the result

Generated source is untrusted input. Before running it, transpile it on the host: a transpile
error is a cheap, early "no", and the AST you get back is data you can inspect (which atoms does
it call?) before granting it anything.

```javascript
const { ast } = transpile(run.result.code, { atoms: vm.atoms }) // throws on invalid AJS
const usesNetwork = JSON.stringify(ast).includes('"op":"httpFetch"')
const tested = await vm.run(ast, { n: 5 }, { fuel: 500 }) // no capabilities at all
```

<!-- TODO review -->
## The gotcha

The model has seen far more JavaScript than AJS, so it will reach for `for (;;)`, `switch`,
`class` or `async`. The transpiler names each one as it refuses it. Feeding that message back to
the model for a second attempt fixes most failures, and costs one more model call.
