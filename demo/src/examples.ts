/*
 * examples.ts - Example AsyncJS snippets for the playground
 */

export interface Example {
  name: string
  description: string
  code: string
  requiresApi?: boolean // Needs LLM API key
}

export const examples: Example[] = [
  {
    name: 'Hello World',
    description: 'Simple greeting with template',
    code: `function greet({ name = 'World' }) {
  let message = template({ tmpl: 'Hello, {{name}}!', vars: { name } })
  return { message }
}`,
  },
  {
    name: 'Math Operations',
    description: 'Basic arithmetic and Math built-ins',
    code: `function calculate({ a = 10, b = 5 }) {
  let sum = a + b
  let product = a * b
  let power = a ** b
  let sqrt = Math.sqrt(a)
  let max = Math.max(a, b)
  let rounded = Math.floor(a / b)
  return { sum, product, power, sqrt, max, rounded }
}`,
  },
  {
    name: 'Conditional Logic',
    description: 'If/else branching',
    code: `function checkAge({ age = 25 }) {
  if (age >= 18) {
    let status = 'adult'
    return { status, canVote: true }
  } else {
    let status = 'minor'
    return { status, canVote: false }
  }
}`,
  },
  {
    name: 'Loop & Filter',
    description: 'Process arrays with array methods',
    code: `function processNumbers({ numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }) {
  let evens = numbers.filter(x => x % 2 == 0)
  let doubled = evens.map(x => x * 2)
  let total = doubled.reduce((acc, x) => acc + x, 0)
  return { evens, doubled, total }
}`,
  },
  {
    name: 'String Processing',
    description: 'Work with text',
    code: `function processText({ text = 'Hello World' }) {
  let upper = text.toUpperCase()
  let lower = text.toLowerCase()
  let words = text.split(' ')
  let wordCount = words.length
  return { upper, lower, words, wordCount }
}`,
  },
  {
    name: 'JSON Processing',
    description: 'Parse and stringify JSON',
    code: `function jsonRoundTrip({ data = { name: 'Alice', age: 30 } }) {
  let jsonStr = JSON.stringify(data)
  let parsed = JSON.parse(jsonStr)
  let name = parsed.name
  return { jsonStr, parsed, name }
}`,
  },
  {
    name: 'Error Handling',
    description: 'Try/catch with Error()',
    code: `function safeDivide({ a = 10, b = 0 }) {
  try {
    if (b == 0) {
      Error('Division by zero!')
    }
    let result = a / b
    return { result }
  } catch (err) {
    return { error: err }
  }
}`,
  },
  {
    name: 'Weather API',
    description: 'Fetch weather data (no API key needed)',
    code: `function getWeather({ lat = 37.7749, lon = -122.4194 }) {
  let url = \`https://api.open-meteo.com/v1/forecast?latitude=\${lat}&longitude=\${lon}&current_weather=true\`
  let response = httpFetch({ url, cache: 1800 })
  let weather = response.current_weather
  return { weather }
}`,
  },
  {
    name: 'iTunes Search',
    description: 'Search Apple iTunes catalog',
    code: `function searchMusic({ query = 'Beatles', limit = 5 }) {
  let url = \`https://itunes.apple.com/search?term=\${query}&limit=\${limit}&media=music\`
  let response = httpFetch({ url, cache: 3600 })
  let tracks = response.results.map(x => ({ 
    artist: x.artistName, 
    track: x.trackName, 
    album: x.collectionName 
  }))
  return { tracks }
}`,
  },
  {
    name: 'GitHub Repos',
    description: 'Search GitHub repositories',
    code: `function searchRepos({ query = 'tosijs', perPage = 5 }) {
  let url = \`https://api.github.com/search/repositories?q=\${query}&per_page=\${perPage}&sort=stars\`
  let response = httpFetch({ url, cache: 300 })
  let repos = response.items.map(x => ({ 
    name: x.full_name, 
    stars: x.stargazers_count, 
    description: x.description 
  }))
  return { repos }
}`,
  },
  {
    name: 'LLM Chat',
    description: 'Chat with AI (requires llm capability)',
    requiresApi: true,
    code: `function chat({ message = 'What is the capital of France?' }) {
  // Requires llm.predict capability to be configured
  let response = llmPredict({ prompt: message })
  return { response }
}`,
  },
  {
    name: 'LLM Summarizer',
    description: 'Fetch and summarize text (requires llm capability)',
    requiresApi: true,
    code: `function summarize({ source = 'coffee-origins' }) {
  // Fetch text from our sample documents
  // Options: 'coffee-origins', 'ai-history', 'renewable-energy'
  let url = \`/texts/\${source}.txt\`
  let text = httpFetch({ url })
  
  let prompt = \`Summarize the following text in 2-3 sentences:\n\n\${text}\`
  let summary = llmPredict({ prompt })
  return { source, summary }
}`,
  },
  {
    name: 'LLM Structured Output',
    description: 'Get structured JSON from LLM (requires llm capability)',
    requiresApi: true,
    code: `function extractInfo({ text = 'John Smith is a 35-year-old software engineer from San Francisco who loves hiking and photography.' }) {
  let prompt = \`Extract person info from this text as JSON with fields: name, age, occupation, location, hobbies (array).

Text: \${text}

Respond ONLY with valid JSON, no other text.\`
  let response = llmPredict({ prompt })
  let parsed = JSON.parse(response)
  return { person: parsed }
}`,
  },
  {
    name: 'LLM + API Data',
    description: 'LLM analyzes API data (requires llm capability)',
    requiresApi: true,
    code: `function findCovers({ song = 'Yesterday', artist = 'Beatles' }) {
  // Search iTunes for the song
  let query = song + ' ' + artist
  let url = \`https://itunes.apple.com/search?term=\${query}&limit=25&media=music\`
  let response = httpFetch({ url, cache: 3600 })
  
  // Format results for LLM analysis
  let results = response.results || []
  let tracks = results.map(x => \`"\${x.trackName}" by \${x.artistName} (\${x.collectionName})\`)
  let trackList = tracks.join('\\n')
  
  let prompt = \`Search results for "\${song}" by \${artist}:

\${trackList}

List cover versions (tracks NOT by \${artist}) as a JSON array.
Format: [{"track":"...","artist":"...","album":"..."}]
If no covers found, return: []
RESPOND WITH ONLY THE JSON ARRAY, NO OTHER TEXT.\`

  let llmResponse = llmPredict({ prompt })
  let covers = JSON.parse(llmResponse)
  return { originalArtist: artist, song, covers }
}`,
  },
  {
    name: 'LLM with Tool',
    description: 'LLM uses a calculator tool (requires llm capability)',
    requiresApi: true,
    code: `function mathAssistant({ question = 'What is 23 * 47 + 156?' }) {
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
}`,
  },
  {
    name: 'Multi-Agent Pipeline',
    description: 'Two agents collaborate on a task (requires llm capability)',
    requiresApi: true,
    code: `function collaborativeWriting({ topic = 'the future of renewable energy' }) {
  // Agent 1: Research Agent - generates key points
  let researchPrompt = \`You are a research agent. Generate 3 key facts or points about: \${topic}
Format as a numbered list. Be concise.\`
  let research = llmPredict({ prompt: researchPrompt })
  
  // Agent 2: Writer Agent - creates content from research
  let writerPrompt = \`You are a writer agent. Using these research points:

\${research}

Write a short, engaging paragraph (2-3 sentences) about \${topic}.
Make it informative and accessible.\`
  let article = llmPredict({ prompt: writerPrompt })
  
  // Agent 3: Editor Agent - reviews and improves
  let editorPrompt = \`You are an editor agent. Review this draft:

"\${article}"

Suggest one specific improvement. Then provide the improved version.
Format: "Suggestion: [your suggestion]\\n\\nImproved: [improved text]"\`
  let edited = llmPredict({ prompt: editorPrompt })
  
  return { 
    topic,
    researchPoints: research,
    firstDraft: article,
    editedVersion: edited
  }
}`,
  },
  {
    name: 'Fuel Exhaustion',
    description: 'Demonstrates running out of fuel',
    code: `function infiniteLoop({ limit = 1000000 }) {
  // This will run out of fuel before completing
  let counter = 0
  let i = 0
  while (i < limit) {
    counter = counter + 1
    i = i + 1
  }
  return { counter }
}`,
  },
]
