<!--{"section":"ajs","type":"example","group":"advanced","order":19,"requiresApi":true}-->

# LLM Code Solver

LLM writes and runs code to solve a problem (requires llm capability)

```javascript
function solveWithCode({ problem = 'Calculate the 10th Fibonacci number' }) {
  // System prompt with AsyncJS rules and example
  let systemContext = \`You write AsyncJS code. AsyncJS is a JavaScript subset.

RULES:
- NO: async, await, new, class, this, var, for loops
- Use let for variables, while for loops
- Return an object: return { result }

EXAMPLE (factorial):
function solve() {
  let result = 1
  let i = 5
  while (i > 1) {
    result = result * i
    i = i - 1
  }
  return { result }
}

Return ONLY the function code, nothing else.\`

  let prompt = \`\${systemContext}

Write a function called "solve" that: \${problem}\`

  let response = llmPredict({ prompt })

  // Clean up code - remove markdown fences, fix escapes, extract function
  let code = response
  code = code.replace(/\`\`\`(?:javascript|js|asyncjs)?\\n?/g, '')
  code = code.replace(/\\n?\`\`\`/g, '')
  code = code.replace(/\\\\n/g, '\\n')
  code = code.replace(/\\\\t/g, '\\t')
  code = code.replace(/\\\\"/g, '"')
  code = code.trim()

  // Try to extract just the function if there's extra text
  let funcMatch = code.match(/function\\s+solve\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*\\}/)
  if (funcMatch) {
    code = funcMatch[0]
  }

  // Validate it looks like a function before running
  if (!code.startsWith('function')) {
    return {
      problem,
      error: 'LLM did not generate valid code',
      rawResponse: response
    }
  }

  // Execute the generated code
  let output = runCode({ code, args: {} })

  return {
    problem,
    generatedCode: code,
    result: output.result
  }
}
```
