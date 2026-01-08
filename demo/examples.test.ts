/**
 * Tests for playground examples
 * 
 * Ensures all demo examples transpile and run correctly.
 * LLM examples are tested with a mock capability.
 * The "Fuel Exhaustion" example is expected to fail.
 */

import { describe, it, expect } from 'bun:test'
import { examples } from './src/examples'
import { AgentVM, transpile } from '../src'

// Mock fetch for API examples
const mockFetch = async (url: string) => {
  // Weather API
  if (url.includes('open-meteo.com')) {
    return {
      current_weather: {
        temperature: 18.5,
        windspeed: 12.3,
        weathercode: 1,
        time: '2024-01-15T12:00'
      }
    }
  }
  
  // iTunes API
  if (url.includes('itunes.apple.com')) {
    return {
      resultCount: 3,
      results: [
        { artistName: 'The Beatles', trackName: 'Yesterday', collectionName: 'Help!' },
        { artistName: 'The Beatles', trackName: 'Yesterday', collectionName: '1' },
        { artistName: 'Frank Sinatra', trackName: 'Yesterday', collectionName: 'My Way' }
      ]
    }
  }
  
  // GitHub API
  if (url.includes('api.github.com')) {
    return {
      total_count: 2,
      items: [
        { full_name: 'user/tosijs', stargazers_count: 100, description: 'A great library' },
        { full_name: 'other/tosijs-demo', stargazers_count: 50, description: 'Demo project' }
      ]
    }
  }
  
  // Text files for summarizer
  if (url.includes('/texts/')) {
    return 'This is sample text content for testing the summarizer example.'
  }
  
  throw new Error(`Unmocked URL: ${url}`)
}

// Mock LLM for examples that require it
const mockLLM = {
  predict: async (prompt: string) => {
    // Return appropriate mock responses based on prompt content
    if (prompt.includes('capital of France')) {
      return 'Paris'
    }
    if (prompt.includes('Summarize')) {
      return 'This is a summary of the provided text.'
    }
    if (prompt.includes('Extract person info')) {
      return JSON.stringify({
        name: 'John Smith',
        age: 35,
        occupation: 'software engineer',
        location: 'San Francisco',
        hobbies: ['hiking', 'photography']
      })
    }
    if (prompt.includes('cover versions') || prompt.includes('COVER VERSIONS')) {
      return JSON.stringify([
        { track: 'Yesterday', artist: 'Frank Sinatra', album: 'My Way' }
      ])
    }
    if (prompt.includes('Extract the math expression')) {
      return '23 * 47 + 156'
    }
    if (prompt.includes('Calculate:')) {
      return '1237'
    }
    if (prompt.includes('friendly response')) {
      return 'The answer to your math question is 1,237!'
    }
    if (prompt.includes('research agent')) {
      return '1. Point one\n2. Point two\n3. Point three'
    }
    if (prompt.includes('writer agent')) {
      return 'This is a well-written paragraph about the topic.'
    }
    if (prompt.includes('editor agent')) {
      return 'Suggestion: Add more detail.\n\nImproved: This is an improved paragraph.'
    }
    return 'Mock LLM response'
  }
}

describe('Playground Examples', () => {
  const vm = new AgentVM()
  
  for (const example of examples) {
    const shouldFail = example.name === 'Fuel Exhaustion'
    const skipNetworkTest = ['Weather API', 'iTunes Search', 'GitHub Repos'].includes(example.name)
    
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
        // Error could be string or object with message
        const errorMsg = typeof runResult.error === 'string' 
          ? runResult.error 
          : runResult.error?.message || JSON.stringify(runResult.error)
        expect(errorMsg.toLowerCase()).toContain('fuel')
      })
    } else {
      it(`${example.name} - runs successfully${example.requiresApi ? ' (with mock LLM)' : ''}`, async () => {
        const result = transpile(example.code)
        
        // Build args from signature defaults
        const args: Record<string, any> = {}
        if (result.signature?.parameters) {
          for (const [key, param] of Object.entries(result.signature.parameters)) {
            if ('default' in param) {
              args[key] = param.default
            }
          }
        }
        
        const runResult = await vm.run(result.ast, args, {
          fuel: 10000,
          capabilities: {
            fetch: mockFetch,
            llm: mockLLM,
          }
        })
        
        expect(runResult.error).toBeUndefined()
        expect(runResult.result).toBeDefined()
      })
    }
  }
})

describe('Example Code Quality', () => {
  it('all examples have unique names', () => {
    const names = examples.map(e => e.name)
    const uniqueNames = new Set(names)
    expect(uniqueNames.size).toBe(names.length)
  })
  
  it('all examples have descriptions', () => {
    for (const example of examples) {
      expect(example.description).toBeTruthy()
      expect(example.description.length).toBeGreaterThan(5)
    }
  })
  
  it('LLM examples are marked with requiresApi', () => {
    for (const example of examples) {
      const usesLLM = example.code.includes('llmPredict')
      if (usesLLM) {
        expect(example.requiresApi).toBe(true)
      }
    }
  })
})
