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
    name: 'TJS Grammar Demo',
    description: 'Comprehensive example exercising all TJS syntax features',
    code: `/*
# TJS Grammar Demonstration

This example showcases **all TJS syntax features** for testing
syntax highlighting in editors.

## Features Covered
- Type annotations with examples
- Return type arrows
- test/mock/unsafe blocks
- Markdown in comments
*/

// Type annotations by example
function greet(name: 'World', times: 3) -> '' {
  /*
  ## Implementation Notes
  
  This function demonstrates:
  - Required parameters with example values
  - Return type annotation
  - Template literal usage
  */
  let result = ''
  let i = 0
  while (i < times) {
    result = result + \`Hello, \${name}! \`
    i = i + 1
  }
  return result.trim()
}

// Optional parameters use = instead of :
function divide(a: 10, b: 2, fallback = 0) -> 0 {
  if (b === 0) {
    return fallback
  }
  return a / b
}

// Schema-based types
function createUser(
  name: 'Alice',
  age: 30,
  email: 'alice@example.com',
  roles: ['user']
) -> { id: '', name: '', age: 0, email: '', roles: [''] } {
  return {
    id: crypto.randomUUID(),
    name,
    age,
    email,
    roles
  }
}

// Inline mock block - runs before each test
mock {
  // Setup test fixtures
  const testUser = { name: 'Test', age: 25 }
  const mockData = [1, 2, 3, 4, 5]
}

// Inline test blocks
test('greet returns proper greeting') {
  const result = greet('TJS', 2)
  expect(result).toBe('Hello, TJS! Hello, TJS!')
}

test('greet handles single repetition') {
  const result = greet('World', 1)
  expect(result).toBe('Hello, World!')
}

test('divide handles division') {
  expect(divide(10, 2)).toBe(5)
  expect(divide(15, 3)).toBe(5)
}

test('divide returns fallback on zero') {
  expect(divide(10, 0)).toBe(0)
  expect(divide(10, 0, -1)).toBe(-1)
}

test('createUser generates valid user') {
  const user = createUser('Bob', 35, 'bob@test.com', ['admin'])
  expect(user.name).toBe('Bob')
  expect(user.age).toBe(35)
  expect(user.roles).toContain('admin')
}

// Async test with await
test('async operations work in tests') {
  const delay = (ms) => new Promise(r => setTimeout(r, ms))
  await delay(10)
  expect(true).toBe(true)
}

// Unsafe function with (!) - skips all runtime validation
function fastAdd(! a: 0, b: 0) -> 0 {
  return a + b
}

// unsafe block for performance-critical code within a safe function
function fastSum(numbers: [0]) -> 0 {
  /*
  Parameters are validated, but the inner loop is unsafe.
  Skips runtime type validation for ~35x speedup.
  */
  unsafe {
    let sum = 0
    for (let i = 0; i < numbers.length; i++) {
      sum += numbers[i]
    }
    return sum
  }
}

test('fastSum calculates correctly') {
  expect(fastSum([1, 2, 3, 4, 5])).toBe(15)
  expect(fastSum([])).toBe(0)
}

// Union types with ||
function parseValue(input: '' || 0 || null) -> '' {
  if (input === null) {
    return 'null'
  }
  if (typeof input === 'number') {
    return \`number: \${input}\`
  }
  return \`string: \${input}\`
}

test('parseValue handles unions') {
  expect(parseValue('hello')).toBe('string: hello')
  expect(parseValue(42)).toBe('number: 42')
  expect(parseValue(null)).toBe('null')
}

// Array type examples
function processItems(items: ['']) -> { count: 0, first: '', last: '' } {
  return {
    count: items.length,
    first: items[0] || '',
    last: items[items.length - 1] || ''
  }
}

// Object spread and destructuring
function mergeConfig(base: { debug: false }, overrides: {}) -> {} {
  return { ...base, ...overrides }
}

/*
# Summary

This file demonstrates TJS syntax highlighting for:

| Feature | Syntax |
|---------|--------|
| Required param | \`name: 'example'\` |
| Optional param | \`name = 'default'\` |
| Return type | \`-> Type\` |
| Unsafe function | \`function foo(! x: 0) { }\` |
| Test block | \`test('desc') { }\` |
| Mock block | \`mock { }\` |
| Unsafe block | \`unsafe { }\` |
| Union type | \`Type1 \\|\\| Type2\` |

Check that all keywords and constructs are properly highlighted!
*/
`,
  },
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
  // Schema.response builds responseFormat from an example
  let schema = Schema.response('person_info', {
    name: '',
    age: 0,
    occupation: '',
    location: '',
    hobbies: ['']
  })
  
  let prompt = \`Extract person info from this text: \${text}\`
  let response = llmPredict({ prompt, options: { responseFormat: schema } })
  let person = JSON.parse(response)
  return { person }
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
  
  // Schema.response from example - much cleaner!
  let schema = Schema.response('cover_versions', {
    covers: [{ track: '', artist: '', album: '' }]
  })
  
  let prompt = \`Search results for "\${song}" by \${artist}:

\${trackList}

List cover versions (tracks NOT by \${artist}).\`

  let llmResponse = llmPredict({ prompt, options: { responseFormat: schema } })
  let parsed = JSON.parse(llmResponse)
  return { originalArtist: artist, song, covers: parsed.covers }
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
  {
    name: 'Vision: OCR',
    description: 'Extract text from an image (requires vision model)',
    requiresApi: true,
    code: `function extractText({ imageUrl = '/photo-2.jpg' }) {
  // Fetch image as data URL for vision model
  let image = httpFetch({ url: imageUrl, responseType: 'dataUrl' })
  
  // Use Schema.response for structured output
  let schema = Schema.response('ocr_result', {
    text: '',
    items: [{ description: '', amount: '' }]
  })
  
  let result = llmVision({
    prompt: 'Extract all text from this image. If it is a receipt, list the items and amounts.',
    images: [image],
    responseFormat: schema
  })
  
  let parsed = JSON.parse(result.content)
  return { imageUrl, extracted: parsed }
}`,
  },
  {
    name: 'Vision: Classification',
    description: 'Classify and describe an image (requires vision model)',
    requiresApi: true,
    code: `function classifyImage({ imageUrl = '/photo-1.jpg' }) {
  // Fetch image as data URL
  let image = httpFetch({ url: imageUrl, responseType: 'dataUrl' })
  
  // Schema for classification result
  let schema = Schema.response('image_classification', {
    category: '',
    subject: '',
    description: '',
    tags: [''],
    confidence: ''
  })
  
  let result = llmVision({
    prompt: 'Classify this image. Identify the main subject, provide a brief description, and list relevant tags.',
    images: [image],
    responseFormat: schema
  })
  
  let parsed = JSON.parse(result.content)
  return { imageUrl, classification: parsed }
}`,
  },
  {
    name: 'LLM Code Solver',
    description:
      'LLM writes and runs code to solve a problem (requires llm capability)',
    requiresApi: true,
    code: `function solveWithCode({ problem = 'Calculate the 10th Fibonacci number' }) {
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
}`,
  },
  {
    name: 'LLM Code Generator',
    description:
      'LLM writes AsyncJS code from a description (requires llm capability)',
    requiresApi: true,
    code: `function generateCode({ task = 'Calculate the factorial of n' }) {
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
}`,
  },
]
