<!--{"section":"ajs","type":"example","group":"llm","order":10,"requiresApi":true}-->

# LLM Chat

Chat with AI (requires llm capability)

```javascript
function chat({ message = 'What is the capital of France?' }) {
  // Requires llm.predict capability to be configured
  let response = llmPredict({ prompt: message })
  return { response }
}
```
