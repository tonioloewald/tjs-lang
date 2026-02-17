<!--{"section":"ajs","type":"example","group":"advanced","order":15,"requiresApi":true}-->

# Multi-Agent Pipeline

Two agents collaborate on a task (requires llm capability)

```ajs
function collaborativeWriting({ topic = 'the future of renewable energy' }) {
  // Agent 1: Research Agent - generates key points
  let researchPrompt =
    'You are a research agent. Generate 3 key facts or points about: ' +
    topic +
    '\nFormat as a numbered list. Be concise.'
  let research = llmPredict({ prompt: researchPrompt })

  // Agent 2: Writer Agent - creates content from research
  let writerPrompt =
    'You are a writer agent. Using these research points:\n\n' +
    research +
    '\n\nWrite a short, engaging paragraph (2-3 sentences) about ' +
    topic +
    '.\nMake it informative and accessible.'
  let article = llmPredict({ prompt: writerPrompt })

  // Agent 3: Editor Agent - reviews and improves
  let editorPrompt =
    'You are an editor agent. Review this draft:\n\n"' +
    article +
    '"\n\nSuggest one specific improvement. Then provide the improved version.\nFormat: "Suggestion: [your suggestion]\n\nImproved: [improved text]"'
  let edited = llmPredict({ prompt: editorPrompt })

  return {
    topic,
    researchPoints: research,
    firstDraft: article,
    editedVersion: edited,
  }
}
```
