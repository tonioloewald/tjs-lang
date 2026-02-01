<!--{"section":"ajs","type":"example","group":"advanced","order":20,"requiresApi":true}-->

# LLM Code Generator

LLM writes AsyncJS code from a description (requires llm capability)

```javascript
function generateCode({ task = 'Calculate the factorial of n' }) {
  // System prompt with AsyncJS rules and complete example
  let systemContext = \`You write AsyncJS code. AsyncJS is a subset of JavaScript.

RULES:
- Types by example: fn(n: 5) means required number param with example value 5
- NO: async, await, new, class, this, var, for, generator functions (function*)
- Use let for variables, while for loops
- Return an object: return { result }

EXAMPLE - calculating sum of 1 to n:
function sumTo(n: 10) {
  let sum = 0
  let i = 1
  while (i <= n) {
    sum = sum + i
    i = i + 1
  }
  return { result: sum }
}\`

  let schema = Schema.response('generated_code', {
    code: '',
    description: ''
  })

  let prompt = \`\${systemContext}

Write an AsyncJS function for: \${task}

Return ONLY valid AsyncJS code in the code field. Must start with "function" and use while loops (not for loops).\`

  let response = llmPredict({ prompt, options: { responseFormat: schema } })
  let result = JSON.parse(response)

  // Clean up any markdown fences and fix escaped newlines
  let code = result.code
  code = code.replace(/\`\`\`(?:javascript|js)?\\n?/g, '')
  code = code.replace(/\\n?\`\`\`/g, '')
  code = code.replace(/\\\\n/g, '\\n')
  code = code.replace(/\\\\t/g, '\\t')
  code = code.trim()

  return {
    task,
    code,
    description: result.description
  }
}
```
