<!--{"section":"ajs","type":"example","group":"advanced","order":14,"requiresApi":true}-->

# LLM with Tool

LLM uses a calculator tool (requires llm capability)

```javascript
function mathAssistant({ question = 'What is 23 * 47 + 156?' }) {
  // First, ask LLM to extract the calculation
  let extractPrompt = \`Extract the math expression from this question. Return ONLY the expression, nothing else.
Question: \${question}\`
  let expression = llmPredict({ prompt: extractPrompt })

  // Evaluate the expression (simple eval simulation)
  let calcPrompt = \`Calculate: \${expression}
Return ONLY the numeric result.\`
  let calcResult = llmPredict({ prompt: calcPrompt })

  // Format the answer
  let answerPrompt = \`The user asked: "\${question}"
The calculated result is: \${calcResult}
Write a brief, friendly response with the answer.\`
  let answer = llmPredict({ prompt: answerPrompt })

  return { question, expression: expression.trim(), result: calcResult.trim(), answer }
}
```
