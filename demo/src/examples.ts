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
  let url = template({ 
    tmpl: 'https://api.open-meteo.com/v1/forecast?latitude={{lat}}&longitude={{lon}}&current_weather=true',
    vars: { lat, lon }
  })
  let response = httpFetch({ url, cache: 1800 })
  let weather = get({ obj: response, path: 'current_weather' })
  return { weather }
}`,
  },
  {
    name: 'iTunes Search',
    description: 'Search Apple iTunes catalog',
    code: `function searchMusic({ query = 'Beatles', limit = 5 }) {
  let url = template({
    tmpl: 'https://itunes.apple.com/search?term={{query}}&limit={{limit}}&media=music',
    vars: { query, limit }
  })
  let response = httpFetch({ url, cache: 3600 })
  let results = get({ obj: response, path: 'results' })
  let tracks = map({ 
    items: results, 
    transform: '{ artist: x.artistName, track: x.trackName, album: x.collectionName }' 
  })
  return { tracks }
}`,
  },
  {
    name: 'GitHub Repos',
    description: 'Search GitHub repositories',
    code: `function searchRepos({ query = 'javascript', perPage = 5 }) {
  let url = template({
    tmpl: 'https://api.github.com/search/repositories?q={{query}}&per_page={{perPage}}&sort=stars',
    vars: { query, perPage }
  })
  let response = httpFetch({ url, cache: 300 })
  let repos = get({ obj: response, path: 'items' })
  let summary = map({
    items: repos,
    transform: '{ name: x.full_name, stars: x.stargazers_count, description: x.description }'
  })
  return { repos: summary }
}`,
  },
  {
    name: 'LLM Chat',
    description: 'Chat with AI (requires API key)',
    requiresApi: true,
    code: `function chat({ message = 'What is the capital of France?' }) {
  let response = llmPredict({
    provider: 'openai',
    model: 'gpt-4o-mini',
    system: 'You are a helpful assistant. Be concise.',
    user: message
  })
  return { response }
}`,
  },
  {
    name: 'LLM Summarizer',
    description: 'Summarize text with AI (requires API key)',
    requiresApi: true,
    code: `function summarize({ text = 'The quick brown fox jumps over the lazy dog. This is a classic pangram used to test typewriters and fonts.' }) {
  let summary = llmPredict({
    provider: 'openai',
    model: 'gpt-4o-mini',
    system: 'Summarize the following text in one sentence.',
    user: text
  })
  return { summary }
}`,
  },
]
