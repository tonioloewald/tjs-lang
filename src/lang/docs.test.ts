/**
 * Tests for TJS documentation generation
 */

import { describe, it, expect } from 'bun:test'
import { generateDocs } from './docs'

describe('generateDocs', () => {
  describe('basic function documentation', () => {
    it('generates docs for simple function with params', () => {
      const source = `
function greet(name: 'World') -> '' {
  return \`Hello, \${name}!\`
}
`
      const result = generateDocs(source)

      expect(result.functions).toHaveLength(1)
      expect(result.functions[0].name).toBe('greet')
      expect(result.functions[0].params).toHaveLength(1)
      expect(result.functions[0].params[0].name).toBe('name')
      expect(result.functions[0].params[0].type).toBe('string')
      expect(result.functions[0].params[0].required).toBe(true)
    })

    it('generates docs for function with optional params', () => {
      const source = `
function greet(name = 'World') -> '' {
  return \`Hello, \${name}!\`
}
`
      const result = generateDocs(source)

      expect(result.functions[0].params[0].required).toBe(false)
      expect(result.functions[0].params[0].default).toBe('World')
    })

    it('generates docs for function with multiple params', () => {
      const source = `
function add(a: 0, b: 0) -> 0 {
  return a + b
}
`
      const result = generateDocs(source)

      expect(result.functions[0].params).toHaveLength(2)
      expect(result.functions[0].params[0].name).toBe('a')
      expect(result.functions[0].params[0].type).toBe('number')
      expect(result.functions[0].params[1].name).toBe('b')
      expect(result.functions[0].params[1].type).toBe('number')
    })

    it('generates docs for function with no params', () => {
      const source = `
function getTimestamp() -> 0 {
  return Date.now()
}
`
      const result = generateDocs(source)

      expect(result.functions[0].params).toHaveLength(0)
      expect(result.functions[0].returns?.type).toBe('number')
    })
  })

  describe('type formatting', () => {
    it('formats string type', () => {
      const source = `function f(x: '') -> '' { return x }`
      const result = generateDocs(source)
      expect(result.functions[0].params[0].type).toBe('string')
      expect(result.functions[0].returns?.type).toBe('string')
    })

    it('formats number type', () => {
      const source = `function f(x: 0) -> 0 { return x }`
      const result = generateDocs(source)
      expect(result.functions[0].params[0].type).toBe('number')
      expect(result.functions[0].returns?.type).toBe('number')
    })

    it('formats boolean type', () => {
      const source = `function f(x: true) -> false { return x }`
      const result = generateDocs(source)
      expect(result.functions[0].params[0].type).toBe('boolean')
      expect(result.functions[0].returns?.type).toBe('boolean')
    })

    it('formats array type', () => {
      const source = `function f(x: [0]) -> [0] { return x }`
      const result = generateDocs(source)
      expect(result.functions[0].params[0].type).toBe('number[]')
      expect(result.functions[0].returns?.type).toBe('number[]')
    })

    it('formats object type', () => {
      const source = `function f(x: { name: '', age: 0 }) -> { name: '', age: 0 } { return x }`
      const result = generateDocs(source)
      expect(result.functions[0].params[0].type).toBe(
        '{ name: string, age: number }'
      )
    })

    it('formats nested object type', () => {
      const source = `function f(x: { user: { name: '' } }) { return x }`
      const result = generateDocs(source)
      expect(result.functions[0].params[0].type).toBe(
        '{ user: { name: string } }'
      )
    })

    it('formats null type', () => {
      const source = `function f(x: null) { return x }`
      const result = generateDocs(source)
      expect(result.functions[0].params[0].type).toBe('null')
    })
  })

  describe('examples from tests', () => {
    it('extracts examples from inline tests', () => {
      const source = `
function double(x: 0) -> 0 {
  return x * 2
}

test('doubles numbers') {
  expect(double(5)).toBe(10)
  expect(double(0)).toBe(0)
}
`
      const result = generateDocs(source)

      expect(result.functions[0].examples).toHaveLength(1)
      expect(result.functions[0].examples[0].description).toBe(
        'doubles numbers'
      )
      expect(result.functions[0].examples[0].code).toContain(
        'expect(double(5)).toBe(10)'
      )
    })

    it('extracts multiple test examples', () => {
      const source = `
function isEven(x: 0) -> true {
  return x % 2 === 0
}

test('returns true for even numbers') {
  expect(isEven(2)).toBe(true)
  expect(isEven(4)).toBe(true)
}

test('returns false for odd numbers') {
  expect(isEven(1)).toBe(false)
  expect(isEven(3)).toBe(false)
}
`
      const result = generateDocs(source)

      expect(result.functions[0].examples).toHaveLength(2)
      expect(result.functions[0].examples[0].description).toBe(
        'returns true for even numbers'
      )
      expect(result.functions[0].examples[1].description).toBe(
        'returns false for odd numbers'
      )
    })

    it('handles function with no tests', () => {
      const source = `
function simple(x: 0) -> 0 {
  return x
}
`
      const result = generateDocs(source)
      expect(result.functions[0].examples).toHaveLength(0)
    })
  })

  describe('markdown generation', () => {
    it('generates markdown with function signature', () => {
      const source = `
function greet(name: 'World') -> '' {
  return \`Hello, \${name}!\`
}
`
      const result = generateDocs(source)

      expect(result.markdown).toContain('## greet')
      expect(result.markdown).toContain('```typescript')
      expect(result.markdown).toContain(
        'function greet(name: string) -> string'
      )
      expect(result.markdown).toContain('```')
    })

    it('includes parameters section', () => {
      const source = `
function add(a: 0, b: 0) -> 0 {
  return a + b
}
`
      const result = generateDocs(source)

      expect(result.markdown).toContain('### Parameters')
      expect(result.markdown).toContain('`a`: number')
      expect(result.markdown).toContain('`b`: number')
      expect(result.markdown).toContain('**required**')
    })

    it('includes returns section', () => {
      const source = `
function double(x: 0) -> 0 {
  return x * 2
}
`
      const result = generateDocs(source)

      expect(result.markdown).toContain('### Returns')
      expect(result.markdown).toContain('`number`')
    })

    it('marks optional params correctly', () => {
      const source = `
function greet(name = 'World') -> '' {
  return \`Hello, \${name}!\`
}
`
      const result = generateDocs(source)

      expect(result.markdown).toContain('optional')
      expect(result.markdown).toContain('(default: `World`)')
    })

    it('includes examples section from tests', () => {
      const source = `
function double(x: 0) -> 0 {
  return x * 2
}

test('works correctly') {
  expect(double(5)).toBe(10)
}
`
      const result = generateDocs(source)

      expect(result.markdown).toContain('### Examples')
      expect(result.markdown).toContain('**works correctly**')
      expect(result.markdown).toContain('expect(double(5)).toBe(10)')
    })
  })

  describe('JSON output', () => {
    it('provides structured JSON output', () => {
      const source = `
function greet(name: 'World') -> '' {
  return \`Hello, \${name}!\`
}
`
      const result = generateDocs(source)

      expect(result.json).toHaveProperty('functions')
      expect((result.json as any).functions).toHaveLength(1)
      expect((result.json as any).functions[0].name).toBe('greet')
    })
  })

  describe('description extraction', () => {
    it('extracts JSDoc description', () => {
      const source = `
/**
 * Greets a person by name
 */
function greet(name: 'World') -> '' {
  return \`Hello, \${name}!\`
}
`
      const result = generateDocs(source)

      expect(result.functions[0].description).toBe('Greets a person by name')
      expect(result.markdown).toContain('Greets a person by name')
    })

    it('handles multi-line JSDoc', () => {
      const source = `
/**
 * Adds two numbers together.
 * Returns their sum.
 */
function add(a: 0, b: 0) -> 0 {
  return a + b
}
`
      const result = generateDocs(source)

      // JSDoc extraction currently takes only the first line
      expect(result.functions[0].description).toContain(
        'Adds two numbers together'
      )
    })
  })

  describe('edge cases', () => {
    it('handles empty array type', () => {
      const source = `function f(x: []) { return x }`
      const result = generateDocs(source)
      // Empty array should be 'array' or similar
      expect(result.functions[0].params[0].type).toMatch(/array|any\[\]/)
    })

    it('handles empty object type', () => {
      const source = `function f(x: {}) { return x }`
      const result = generateDocs(source)
      // Empty object renders as `{  }` with the shape formatter
      expect(result.functions[0].params[0].type).toBe('{  }')
    })

    it('handles mixed required and optional params', () => {
      const source = `
function fetch(url: '', timeout = 5000) -> {} {
  return {}
}
`
      const result = generateDocs(source)

      expect(result.functions[0].params[0].required).toBe(true)
      expect(result.functions[0].params[1].required).toBe(false)
    })
  })
})
