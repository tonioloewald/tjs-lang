<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 19, "requiresApi": true, "parent": "ajs-advanced.md"}-->

# LLM Code Solver

LLM writes and runs code to solve a problem (requires llm capability)

<!-- TODO review -->
An agent that writes a program and runs it. Models reason badly about loops and numbers but
write small programs well, so for a question like "the 10th Fibonacci number" it is more
reliable to ask for code and run it than to ask for the answer. That is only reasonable because
the code runs in the same sandbox as the agent. It needs an LLM, so on this site it prints a
message instead of running; run it locally with the host from [LLM Chat](/llm-chat/), plus the
`code` capability described below.

````ajs:inline
function solveWithCode({ problem = 'Calculate the 10th Fibonacci number' }) {
  // System prompt with AsyncJS rules and example
  let systemContext =
    'You write AsyncJS code. AsyncJS is a JavaScript subset.\n\nRULES:\n- Functions take a destructured object param: function foo({ a, b })\n- MUST return an object. WRONG: return 42. RIGHT: return { result: 42 }\n- NO: async, await, new, class, this, var, for loops\n- Use let for variables, while for loops\n\nEXAMPLE (factorial):\nfunction solve() {\n  let result = 1\n  let i = 5\n  while (i > 1) {\n    result = result * i\n    i = i - 1\n  }\n  return { result }\n}\n\nReturn ONLY the function code, nothing else.'

  let prompt =
    systemContext + '\n\nWrite a function called "solve" that: ' + problem

  let response = llmPredict({ prompt })

  // Clean up code - remove markdown fences, fix escapes, extract function
  let code = response
  code = code.replace(/```(?:javascript|js|asyncjs)?\n?/g, '')
  code = code.replace(/\n?```/g, '')
  code = code.replace(/\\n/g, '\n')
  code = code.replace(/\\t/g, '\t')
  code = code.replace(/\\"/g, '"')
  code = code.trim()

  // Try to extract just the function if there's extra text
  let funcMatch = code.match(/function\s+solve\s*\([^)]*\)\s*\{[\s\S]*\}/)
  if (funcMatch) {
    code = funcMatch[0]
  }

  // Validate it looks like a function before running
  if (!code.startsWith('function')) {
    return {
      problem,
      error: 'LLM did not generate valid code',
      rawResponse: response,
    }
  }

  // Execute the generated code
  let output = runCode({ code, args: {} })

  return {
    problem,
    generatedCode: code,
    result: output.result,
  }
}
````

<!-- TODO review -->
## What to notice

- **The fence has four backticks** because the code contains three (it strips Markdown fences
  from the model's answer). Models wrap code in fences however firmly you ask them not to.
- **Cleanup is ordinary string work.** The `replace` and `match` calls run on the VM's own regex
  engine and are metered like everything else.
- **`runCode({ code, args })` transpiles and runs the generated source** as its own program: a
  fresh scope that sees only `args`, never the caller's variables or helpers. It shares the
  caller's fuel, heap budget, capabilities and quotas, so generated code can do nothing the agent
  could not already do.
- **It needs the `code` capability.** Running code is a privilege the host grants, like the
  network: without `code.transpile` the call fails with `Capability 'code.transpile' missing`.

<!-- TODO review -->
## Running it locally

Add a `code` capability to the host from [LLM Chat](/llm-chat/). Transpiling runs on the host,
before any fuel is charged, so the VM caps the size of the source first:

```javascript
const vm = new AgentVM()
const code = { transpile: (source) => transpile(source, { atoms: vm.atoms }).ast }
await vm.run(ast, {}, { fuel: 2000, capabilities: { llm, code } })
```

<!-- TODO review -->
## The gotchas

- **Generated code fails like any code.** A program that does not transpile is an error the
  agent can catch (`Code transpilation failed: …`); one that loops forever runs out of fuel,
  taking the agent's budget with it. Give the run a budget sized for both.
- **Generated code can call `runCode` too**, so nesting is capped at 10 levels.
- **The prompt matters more than the cleanup.** The system text above is a short version of
  [the maintained AJS prompt](/ajs-llm-prompt/), which is tuned (and measured) for small models.
  Note that it still forbids `for` loops entirely; AJS has `for...of`, only the C-style `for (;;)`
  is missing.
