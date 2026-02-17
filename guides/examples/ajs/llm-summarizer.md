<!--{"section":"ajs","type":"example","group":"llm","order":11,"requiresApi":true}-->

# LLM Summarizer

Fetch and summarize text (requires llm capability)

```ajs
function summarize({ source = 'coffee-origins' }) {
  // Fetch text from our sample documents
  // Options: 'coffee-origins', 'ai-history', 'renewable-energy'
  let url = '/texts/' + source + '.txt'
  let text = httpFetch({ url })

  let prompt = 'Summarize the following text in 2-3 sentences:\n\n' + text
  let summary = llmPredict({ prompt })
  return { source, summary }
}
```
