<!--{"section": "ajs", "type": "example", "group": "llm", "order": 11, "requiresApi": true, "parent": "ajs-llm.md"}-->

# LLM Summarizer

Fetch and summarize text (requires llm capability)

<!-- TODO review -->
Fetch a document, hand it to a model, return the gist: the pattern behind most "read this for
me" agents. It needs an LLM, so on this site it prints a message instead of running; run it
locally with the host from [LLM Chat](/llm-chat/).

```ajs:inline
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

<!-- TODO review -->
## What to notice

- **Two capabilities, two decisions for the host.** The agent needs `fetch` and `llm`. A host can
  grant one without the other, and each is metered on its own: a fetch costs 5 units of fuel, a
  model call 100.
- **Text in, text out.** A response that is not JSON comes back from `httpFetch` as a string, so
  `text` can go straight into the prompt.
- **The sample paths are relative.** `/texts/coffee-origins.txt` is one of the sample documents
  the playground served. In your own host, pass an absolute URL on a domain your fetch
  capability allows.

<!-- TODO review -->
## A variation

Long documents cost tokens and can exceed a model's context. Cut the text before you send it,
and tell the model what you did:

```javascript
function summarizeUrl({ url = 'https://example.com/article.txt', maxChars = 8000 }) {
  let text = httpFetch({ url, responseType: 'text' })
  let truncated = text.length > maxChars
  let excerpt = text.slice(0, maxChars)
  let prompt =
    'Summarize in 3 bullet points' +
    (truncated ? ' (the text was cut short)' : '') +
    ':\n\n' +
    excerpt
  let summary = llmPredict({ prompt })
  return { url, truncated, summary }
}
```

<!-- TODO review -->
## Limits

A capability's answer is copied into the VM under a size cap (`membraneMaxBytes`, 4 MB by
default), and an oversized response is refused before it is copied. A refused response is the
world's problem, not the program's, so `try`/`catch` can handle it. For text you did not write,
remember that a page can contain instructions aimed at your model ("ignore the above and…"). The
agent cannot do more than its capabilities allow, which is the point of giving it few.
