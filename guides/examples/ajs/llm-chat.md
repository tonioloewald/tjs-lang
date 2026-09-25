<!--{"section": "ajs", "type": "example", "group": "llm", "order": 10, "requiresApi": true, "parent": "ajs-llm.md"}-->

# LLM Chat

Chat with AI (requires llm capability)

```ajs
function chat({ message = 'What is the capital of France?' }) {
  // Requires llm.predict capability to be configured
  let response = llmPredict({ prompt: message })
  return { response }
}
```
