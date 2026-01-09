/**
 * Tests for playground examples
 *
 * By default, uses mocks for fast CI. Set USE_LM_STUDIO=1 to test with real LM Studio.
 * Vision tests require a vision-capable model (OpenAI/Anthropic).
 */

// Provide browser globals (document, window, etc.) for capabilities.ts
import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

afterAll(() => {
  GlobalRegistrator.unregister()
})

// Poison pill: detect concurrent execution
let activeTests = 0
let maxConcurrentTests = 0

function trackTestStart() {
  activeTests++
  maxConcurrentTests = Math.max(maxConcurrentTests, activeTests)
}

function trackTestEnd() {
  activeTests--
}
import { examples } from './src/examples'
import { AgentVM, transpile, coreAtoms, batteryAtoms } from '../src'
import { withRetry } from '../src/test-utils'
import {
  buildLLMCapability,
  buildLLMBattery,
  getLocalModels,
  type LLMSettings,
} from './src/capabilities'

// Use the SAME code path as the playground
const LM_STUDIO_URL = 'http://localhost:1234/v1'

// Test settings that mirror what the playground uses
const testSettings: LLMSettings = {
  preferredProvider: 'custom',
  customLlmUrl: LM_STUDIO_URL,
  openaiKey: '',
  anthropicKey: '',
  deepseekKey: '',
}

let llmCapability: ReturnType<typeof buildLLMCapability>
let llmBattery: ReturnType<typeof buildLLMBattery>
let hasLLM = false
let hasVision = false

// Check if a model ID indicates vision capability (same logic as capabilities.ts)
function isVisionModel(id: string): boolean {
  return (
    id.includes('-vl') ||
    id.includes('vl-') ||
    id.includes('vision') ||
    id.includes('llava') ||
    id.includes('gemma-3') ||
    id.includes('gemma3')
  )
}

// Mock fetch for HTTP APIs (weather, iTunes, GitHub) - these we still mock
// because they're external APIs, not local LLM
const createHttpFetchCapability = () => {
  // Load real images from disk for tests
  const fs = require('fs')
  const path = require('path')
  const staticDir = path.join(__dirname, 'static')
  const testDataDir = path.join(__dirname, '..', 'test-data')

  const loadImage = (dir: string, filename: string): Uint8Array => {
    try {
      const buffer = fs.readFileSync(path.join(dir, filename))
      return new Uint8Array(buffer)
    } catch {
      // Fallback to minimal JPEG header if file not found
      return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    }
  }

  const mockResponses: Record<string, { body: any; contentType: string }> = {
    '/photo-1.jpg': {
      body: loadImage(staticDir, 'photo-1.jpg'),
      contentType: 'image/jpeg',
    },
    '/photo-2.jpg': {
      body: loadImage(staticDir, 'photo-2.jpg'),
      contentType: 'image/jpeg',
    },
    '/test-shapes.jpg': {
      body: loadImage(testDataDir, 'test-shapes.jpg'),
      contentType: 'image/jpeg',
    },
    '/test-text.jpg': {
      body: loadImage(testDataDir, 'test-text.jpg'),
      contentType: 'image/jpeg',
    },
  }

  const jsonResponses: Record<string, any> = {
    'open-meteo.com': {
      current_weather: {
        temperature: 18.5,
        windspeed: 12.3,
        weathercode: 1,
        time: '2024-01-15T12:00',
      },
    },
    'itunes.apple.com': {
      resultCount: 3,
      results: [
        {
          artistName: 'The Beatles',
          trackName: 'Yesterday',
          collectionName: 'Help!',
        },
        {
          artistName: 'The Beatles',
          trackName: 'Yesterday',
          collectionName: '1',
        },
        {
          artistName: 'Frank Sinatra',
          trackName: 'Yesterday',
          collectionName: 'My Way',
        },
      ],
    },
    'api.github.com': {
      total_count: 2,
      items: [
        {
          full_name: 'user/tosijs',
          stargazers_count: 100,
          description: 'A great library',
        },
        {
          full_name: 'other/tosijs-demo',
          stargazers_count: 50,
          description: 'Demo project',
        },
      ],
    },
  }

  return async (url: string, options?: any) => {
    let response: Response | undefined

    for (const [path, data] of Object.entries(mockResponses)) {
      if (url.endsWith(path)) {
        response = new Response(data.body, {
          headers: { 'content-type': data.contentType },
        })
        break
      }
    }

    if (!response) {
      for (const [domain, jsonData] of Object.entries(jsonResponses)) {
        if (url.includes(domain)) {
          response = new Response(JSON.stringify(jsonData), {
            headers: { 'content-type': 'application/json' },
          })
          break
        }
      }
    }

    if (!response && url.includes('/texts/')) {
      response = new Response(
        'This is sample text content for testing the summarizer example.',
        { headers: { 'content-type': 'text/plain' } }
      )
    }

    if (!response) {
      throw new Error(`Unmocked URL: ${url}`)
    }

    // Same dataUrl handling as playground.ts
    if (options?.responseType === 'dataUrl') {
      const buffer = await response.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      const ct =
        response.headers.get('content-type') || 'application/octet-stream'
      return `data:${ct};base64,${base64}`
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return response.json()
    }
    return response.text()
  }
}

const httpFetch = createHttpFetchCapability()

// Simple mock LLM for when LM Studio isn't available
const mockLLM = {
  predict: async (prompt: string) => {
    if (prompt.includes('capital of France')) return 'Paris'
    if (prompt.includes('Summarize'))
      return 'This is a summary of the provided text.'
    if (prompt.includes('Extract person info')) {
      return JSON.stringify({
        name: 'John Smith',
        age: 35,
        occupation: 'software engineer',
        location: 'San Francisco',
        hobbies: ['hiking', 'photography'],
      })
    }
    if (prompt.includes('cover versions') || prompt.includes('NOT by')) {
      return JSON.stringify({
        covers: [
          { track: 'Yesterday', artist: 'Frank Sinatra', album: 'My Way' },
        ],
      })
    }
    if (prompt.includes('Extract the math expression')) return '23 * 47 + 156'
    if (prompt.includes('Calculate:')) return '1237'
    if (prompt.includes('friendly response')) return 'The answer is 1,237!'
    if (prompt.includes('research agent'))
      return '1. Point one\n2. Point two\n3. Point three'
    if (prompt.includes('writer agent'))
      return 'This is a well-written paragraph.'
    if (prompt.includes('editor agent'))
      return 'Suggestion: Add more detail.\n\nImproved: Better paragraph.'
    // LLM Code Solver - generate valid AsyncJS code (Fibonacci)
    if (prompt.includes('function called "solve"')) {
      return `function solve() {
  let a = 0
  let b = 1
  let i = 0
  while (i < 10) {
    let temp = a + b
    a = b
    b = temp
    i = i + 1
  }
  return { result: a }
}`
    }
    // LLM Code Generator - return code without execution
    if (
      prompt.includes('Write an AsyncJS function') &&
      prompt.includes('factorial')
    ) {
      return JSON.stringify({
        code: `function factorial(n: 5) {
  let result = 1
  let i = n
  while (i > 1) {
    result = result * i
    i = i - 1
  }
  return { result }
}`,
        description: 'Calculates the factorial of n using iteration.',
      })
    }
    return 'Mock LLM response'
  },
}

// Mock LLM battery wrapper (for when LM Studio isn't available)
const mockLLMBattery = {
  predict: async (
    system: string,
    user: any,
    tools?: any[],
    responseFormat?: any
  ) => {
    const prompt = typeof user === 'string' ? user : user.text
    const content = await mockLLM.predict(prompt)
    return { content }
  },
  embed: async () => {
    throw new Error('Embedding not available in mock')
  },
}

beforeAll(async () => {
  // Use the SAME builders as the playground
  llmCapability = buildLLMCapability(testSettings)
  llmBattery = buildLLMBattery(testSettings)
  hasLLM = llmCapability !== null

  if (hasLLM) {
    // Check for vision models using the same getLocalModels function
    try {
      const models = await getLocalModels(LM_STUDIO_URL)
      const visionModels = models.filter(isVisionModel)
      hasVision = visionModels.length > 0
      console.log(
        `LM Studio: ${models.length} models, ${visionModels.length} vision-capable`
      )
      if (visionModels.length > 0) {
        console.log(`Vision models: ${visionModels.join(', ')}`)
      }
    } catch (e) {
      console.log('Could not fetch models:', e)
    }
  } else {
    console.log('No LLM configured, using mocks')
  }
}, 30000)

describe('Playground Examples', () => {
  const vm = new AgentVM({ ...coreAtoms, ...batteryAtoms })

  for (const example of examples) {
    const isVision = example.name.startsWith('Vision:')
    const shouldFail = example.name === 'Fuel Exhaustion'
    // Examples that generate and run code need retry due to LLM variability
    const needsRetry = example.code.includes('runCode(')

    it(`${example.name} - transpiles correctly`, () => {
      const result = transpile(example.code)
      expect(result.ast).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    if (shouldFail) {
      it(`${example.name} - runs out of fuel as expected`, async () => {
        const result = transpile(example.code)
        const runResult = await vm.run(result.ast, {}, { fuel: 1000 })
        expect(runResult.error).toBeDefined()
        const errorMsg =
          typeof runResult.error === 'string'
            ? runResult.error
            : runResult.error?.message || JSON.stringify(runResult.error)
        expect(errorMsg.toLowerCase()).toContain('fuel')
      })
    } else if (isVision) {
      // Vision tests - check hasVision at runtime, not registration time
      it(`${example.name} - runs successfully`, async () => {
        if (!hasVision) {
          console.log(`Skipping ${example.name}: no vision model available`)
          return // Skip gracefully at runtime
        }

        trackTestStart()
        try {
          const result = transpile(example.code)

          const args: Record<string, any> = {}
          if (result.signature?.parameters) {
            for (const [key, param] of Object.entries(
              result.signature.parameters
            )) {
              if ('default' in param) {
                args[key] = param.default
              }
            }
          }

          // Override with small test images for faster tests
          if (example.name === 'Vision: OCR') {
            args.imageUrl = '/test-text.jpg'
          } else if (example.name === 'Vision: Classification') {
            args.imageUrl = '/test-shapes.jpg'
          }

          // Use the SAME capabilities as the playground
          const runResult = await vm.run(result.ast, args, {
            fuel: 100000,
            capabilities: {
              fetch: httpFetch,
              llm: llmCapability || mockLLM,
              llmBattery: llmBattery || mockLLMBattery,
              code: {
                transpile: (source: string) => transpile(source).ast,
              },
            },
          })

          expect(runResult.error).toBeUndefined()
          expect(runResult.result).toBeDefined()
        } finally {
          trackTestEnd()
        }
      }, 120000)
    } else if (needsRetry) {
      // Examples that use runCode need retry due to LLM variability
      it(`${example.name} - runs successfully`, async () => {
        await withRetry(async () => {
          trackTestStart()
          try {
            const result = transpile(example.code)

            const args: Record<string, any> = {}
            if (result.signature?.parameters) {
              for (const [key, param] of Object.entries(
                result.signature.parameters
              )) {
                if ('default' in param) {
                  args[key] = param.default
                }
              }
            }

            const runResult = await vm.run(result.ast, args, {
              fuel: 100000,
              capabilities: {
                fetch: httpFetch,
                llm: llmCapability || mockLLM,
                llmBattery: llmBattery || mockLLMBattery,
                code: {
                  transpile: (source: string) => transpile(source).ast,
                },
              },
            })

            if (runResult.error) {
              throw new Error(
                runResult.error.message || String(runResult.error)
              )
            }
            expect(runResult.result).toBeDefined()
          } finally {
            trackTestEnd()
          }
        })
      }, 360000) // 3 attempts * 120s each
    } else {
      it(`${example.name} - runs successfully`, async () => {
        trackTestStart()
        try {
          const result = transpile(example.code)

          const args: Record<string, any> = {}
          if (result.signature?.parameters) {
            for (const [key, param] of Object.entries(
              result.signature.parameters
            )) {
              if ('default' in param) {
                args[key] = param.default
              }
            }
          }

          // Use the SAME capabilities as the playground
          const runResult = await vm.run(result.ast, args, {
            fuel: 100000, // High fuel for real LLM calls
            capabilities: {
              fetch: httpFetch,
              llm: llmCapability || mockLLM,
              llmBattery: llmBattery || mockLLMBattery,
              code: {
                transpile: (source: string) => transpile(source).ast,
              },
            },
          })

          expect(runResult.error).toBeUndefined()
          expect(runResult.result).toBeDefined()
        } finally {
          trackTestEnd()
        }
      }, 120000) // Long timeout for LM Studio
    }
  }

  // Poison pill: fail if tests ran concurrently
  it('tests must run sequentially (use --max-concurrency 1)', () => {
    expect(maxConcurrentTests).toBeLessThanOrEqual(1)
  })
})

describe('Example Code Quality', () => {
  it('all examples have unique names', () => {
    const names = examples.map((e) => e.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('all examples have descriptions', () => {
    for (const example of examples) {
      expect(example.description.length).toBeGreaterThan(5)
    }
  })

  it('LLM examples are marked with requiresApi', () => {
    for (const example of examples) {
      if (
        example.code.includes('llmPredict') ||
        example.code.includes('llmVision')
      ) {
        expect(example.requiresApi).toBe(true)
      }
    }
  })
})
