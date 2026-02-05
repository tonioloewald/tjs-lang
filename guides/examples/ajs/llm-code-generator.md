<!--{"section":"ajs","type":"example","group":"advanced","order":20,"requiresApi":true}-->

# LLM Code Generator

LLM writes AsyncJS code from a description (requires llm capability)

````javascript
function generateCode({ task = 'Calculate the factorial of n' }) {
  // System prompt with AsyncJS rules and complete example
  let systemContext =
    'You write AsyncJS code. AsyncJS is a subset of JavaScript.\n\nRULES:\n- Types by example: fn(n: 5) means required number param with example value 5\n- NO: async, await, new, class, this, var, for, generator functions (function*)\n- Use let for variables, while for loops\n- Return an object: return { result }\n\nEXAMPLE - calculating sum of 1 to n:\nfunction sumTo(n: 10) {\n  let sum = 0\n  let i = 1\n  while (i <= n) {\n    sum = sum + i\n    i = i + 1\n  }\n  return { result: sum }\n}'

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
