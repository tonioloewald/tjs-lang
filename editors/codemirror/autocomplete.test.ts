/**
 * Autocomplete Integration Tests
 *
 * Tests autocomplete behavior with real TJS code in various states.
 * Uses transpilation to get metadata, then verifies completions.
 */

import { describe, it, expect } from 'bun:test'
import { tjs } from '../../src/lang'

// Import the completion source internals for testing
// We'll test the logic directly rather than through CodeMirror

interface CompletionContext {
  source: string
  position: number // cursor position (use | in source to mark it)
  metadata?: Record<string, any>
}

interface Completion {
  label: string
  type: string
  detail?: string
}

// Helper: parse source with | marking cursor position
function parseSource(sourceWithCursor: string): {
  source: string
  position: number
} {
  const position = sourceWithCursor.indexOf('|')
  if (position === -1) {
    return { source: sourceWithCursor, position: sourceWithCursor.length }
  }
  const source =
    sourceWithCursor.slice(0, position) + sourceWithCursor.slice(position + 1)
  return { source, position }
}

// Helper: transpile and extract metadata
function getMetadata(source: string): Record<string, any> | undefined {
  try {
    const result = tjs(source)
    // tjs returns { code, types, metadata, ... }
    return result?.metadata
  } catch {
    return undefined
  }
}

// Helper: get object name before a dot
function getObjectBeforeDot(source: string, dotPos: number): string | null {
  const before = source.slice(0, dotPos)
  const match = before.match(/(\w+)\s*$/)
  return match ? match[1] : null
}

// Curated property completions (simplified version of ajs-language.ts)
const PROPERTY_COMPLETIONS: Record<string, Completion[]> = {
  console: [
    { label: 'log', type: 'method', detail: '(...args: any[]) -> void' },
    { label: 'error', type: 'method', detail: '(...args: any[]) -> void' },
    { label: 'warn', type: 'method', detail: '(...args: any[]) -> void' },
    { label: 'info', type: 'method', detail: '(...args: any[]) -> void' },
    { label: 'debug', type: 'method', detail: '(...args: any[]) -> void' },
    { label: 'table', type: 'method', detail: '(data: any) -> void' },
    { label: 'clear', type: 'method', detail: '() -> void' },
  ],
  Math: [
    { label: 'floor', type: 'method', detail: '(x: number) -> number' },
    { label: 'ceil', type: 'method', detail: '(x: number) -> number' },
    { label: 'round', type: 'method', detail: '(x: number) -> number' },
    { label: 'abs', type: 'method', detail: '(x: number) -> number' },
    { label: 'min', type: 'method', detail: '(...values: number[]) -> number' },
    { label: 'max', type: 'method', detail: '(...values: number[]) -> number' },
    { label: 'sqrt', type: 'method', detail: '(x: number) -> number' },
    { label: 'pow', type: 'method', detail: '(base, exp) -> number' },
    { label: 'random', type: 'method', detail: '() -> number' },
    { label: 'PI', type: 'property', detail: 'number' },
    { label: 'E', type: 'property', detail: 'number' },
  ],
  JSON: [
    { label: 'parse', type: 'method', detail: '(text: string) -> any' },
    { label: 'stringify', type: 'method', detail: '(value: any) -> string' },
  ],
  Object: [
    { label: 'keys', type: 'method', detail: '(obj: object) -> string[]' },
    { label: 'values', type: 'method', detail: '(obj: object) -> any[]' },
    {
      label: 'entries',
      type: 'method',
      detail: '(obj: object) -> [string, any][]',
    },
    {
      label: 'assign',
      type: 'method',
      detail: '(target, ...sources) -> object',
    },
  ],
  Array: [
    { label: 'isArray', type: 'method', detail: '(value: any) -> boolean' },
    { label: 'from', type: 'method', detail: '(iterable) -> any[]' },
  ],
}

// Helper: get property completions for an object
function getPropertyCompletions(objName: string): Completion[] {
  return PROPERTY_COMPLETIONS[objName] || []
}

// Simplified completion logic for testing (mirrors ajs-language.ts)
function getCompletions(ctx: CompletionContext): Completion[] {
  const { source, position, metadata } = ctx

  // Get word at cursor
  let wordStart = position
  while (wordStart > 0 && /[\w$]/.test(source[wordStart - 1])) {
    wordStart--
  }
  const word = source.slice(wordStart, position)

  // Get context before word
  const charBefore = source.slice(Math.max(0, wordStart - 1), wordStart)
  const lineStart = source.lastIndexOf('\n', wordStart - 1) + 1
  const lineBefore = source.slice(lineStart, wordStart)

  let completions: Completion[] = []

  // After . - property access
  if (charBefore === '.') {
    const before = source.slice(Math.max(0, wordStart - 50), wordStart)
    if (/expect\s*\([^)]*\)\s*\.$/.test(before)) {
      completions = [
        { label: 'toBe', type: 'method', detail: '(expected: any)' },
        { label: 'toEqual', type: 'method', detail: '(expected: any)' },
        { label: 'toContain', type: 'method', detail: '(item: any)' },
        { label: 'toThrow', type: 'method', detail: '()' },
        { label: 'toBeTruthy', type: 'method', detail: '()' },
        { label: 'toBeFalsy', type: 'method', detail: '()' },
      ]
    } else {
      // Property completions for known globals
      const objName = getObjectBeforeDot(source, wordStart - 1)
      if (objName) {
        completions = getPropertyCompletions(objName)
      }
    }
  }
  // After : - type context
  else if (/:\s*$/.test(lineBefore)) {
    completions = [
      { label: "''", type: 'type', detail: 'String type' },
      { label: '0', type: 'type', detail: 'Number type' },
      { label: 'true', type: 'type', detail: 'Boolean type' },
      { label: 'null', type: 'type', detail: 'Null type' },
      { label: '[]', type: 'type', detail: 'Array type' },
      { label: '{}', type: 'type', detail: 'Object type' },
    ]
  }
  // After -> - return type context
  else if (/->\s*$/.test(lineBefore)) {
    completions = [
      { label: "''", type: 'type', detail: 'String type' },
      { label: '0', type: 'type', detail: 'Number type' },
      { label: 'true', type: 'type', detail: 'Boolean type' },
      { label: '{}', type: 'type', detail: 'Object type' },
    ]
  }
  // General context
  else {
    // Keywords
    completions = [
      { label: 'function', type: 'keyword' },
      { label: 'const', type: 'keyword' },
      { label: 'let', type: 'keyword' },
      { label: 'if', type: 'keyword' },
      { label: 'else', type: 'keyword' },
      { label: 'while', type: 'keyword' },
      { label: 'for', type: 'keyword' },
      { label: 'return', type: 'keyword' },
      { label: 'test', type: 'keyword' },
    ]

    // Global objects
    completions.push(
      { label: 'console', type: 'variable' },
      { label: 'Math', type: 'variable' },
      { label: 'JSON', type: 'variable' },
      { label: 'Array', type: 'class' },
      { label: 'Object', type: 'class' },
      { label: 'String', type: 'class' },
      { label: 'Number', type: 'class' },
      { label: 'Date', type: 'class' },
      { label: 'parseInt', type: 'function' },
      { label: 'parseFloat', type: 'function' }
    )

    // Extract functions from source
    const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)/g
    let match
    while ((match = funcRegex.exec(source)) !== null) {
      const [, name, params] = match
      completions.push({ label: name, type: 'function', detail: `(${params})` })
    }

    // Extract variables before cursor
    const before = source.slice(0, position)
    const varRegex = /(?:const|let)\s+(\w+)\s*=/g
    while ((match = varRegex.exec(before)) !== null) {
      completions.push({ label: match[1], type: 'variable' })
    }

    // Add from metadata if available
    if (metadata) {
      const params = metadata.params
        ? Object.keys(metadata.params).join(', ')
        : ''
      const returnType = metadata.returns?.type || 'any'
      if (metadata.name) {
        completions.push({
          label: metadata.name,
          type: 'function',
          detail: `(${params}) -> ${returnType}`,
        })
      }
    }
  }

  // Filter by prefix
  if (word) {
    const lowerWord = word.toLowerCase()
    completions = completions.filter((c) =>
      c.label.toLowerCase().startsWith(lowerWord)
    )
  }

  return completions
}

describe('Autocomplete', () => {
  describe('Type context (after :)', () => {
    it('suggests types after colon in parameter', () => {
      const { source, position } = parseSource('function foo(x: |)')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === "''")).toBe(true)
      expect(completions.some((c) => c.label === '0')).toBe(true)
      expect(completions.some((c) => c.label === 'true')).toBe(true)
      expect(completions.every((c) => c.type === 'type')).toBe(true)
    })

    it('suggests types after colon with space', () => {
      const { source, position } = parseSource('function foo(name: |)')
      const completions = getCompletions({ source, position })

      expect(completions.length).toBeGreaterThan(0)
      expect(completions.every((c) => c.type === 'type')).toBe(true)
    })
  })

  describe('Return type context (after ->)', () => {
    it('suggests types after arrow', () => {
      const { source, position } = parseSource('function foo(x: 0) -> |')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === '{}')).toBe(true)
      expect(completions.every((c) => c.type === 'type')).toBe(true)
    })
  })

  describe('General context', () => {
    it('suggests keywords at start of file', () => {
      const { source, position } = parseSource('|')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'function')).toBe(true)
      expect(completions.some((c) => c.label === 'const')).toBe(true)
    })

    it('suggests keywords with prefix', () => {
      const { source, position } = parseSource('func|')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'function')).toBe(true)
      expect(completions.every((c) => c.label.startsWith('func'))).toBe(true)
    })

    it('suggests global objects like console', () => {
      const { source, position } = parseSource('con|')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'console')).toBe(true)
      expect(completions.some((c) => c.label === 'const')).toBe(true)
    })

    it('suggests Math, JSON, and other globals', () => {
      const { source, position } = parseSource('|')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'Math')).toBe(true)
      expect(completions.some((c) => c.label === 'JSON')).toBe(true)
      expect(completions.some((c) => c.label === 'Array')).toBe(true)
      expect(completions.some((c) => c.label === 'Object')).toBe(true)
      expect(completions.some((c) => c.label === 'parseInt')).toBe(true)
    })

    it('suggests declared functions', () => {
      const { source, position } = parseSource(`
function greet(name: '') {
  return 'Hello ' + name
}

gr|
`)
      const completions = getCompletions({ source, position })

      expect(
        completions.some((c) => c.label === 'greet' && c.type === 'function')
      ).toBe(true)
    })

    it('suggests declared variables', () => {
      const { source, position } = parseSource(`
const message = 'hello'
let count = 0

me|
`)
      const completions = getCompletions({ source, position })

      expect(
        completions.some((c) => c.label === 'message' && c.type === 'variable')
      ).toBe(true)
    })

    it('does not suggest variables declared after cursor', () => {
      const { source, position } = parseSource(`
const before = 1
|
const after = 2
`)
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'before')).toBe(true)
      expect(completions.some((c) => c.label === 'after')).toBe(false)
    })
  })

  describe('Expect matchers (after expect().)', () => {
    it('suggests matchers after expect().', () => {
      const { source, position } = parseSource('expect(value).|')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'toBe')).toBe(true)
      expect(completions.some((c) => c.label === 'toEqual')).toBe(true)
      expect(completions.some((c) => c.label === 'toThrow')).toBe(true)
    })

    it('filters matchers by prefix', () => {
      const { source, position } = parseSource('expect(x).toB|')
      const completions = getCompletions({ source, position })

      expect(completions.every((c) => c.label.startsWith('toB'))).toBe(true)
      expect(completions.some((c) => c.label === 'toBe')).toBe(true)
      expect(completions.some((c) => c.label === 'toBeTruthy')).toBe(true)
    })
  })

  describe('Property completions (after object.)', () => {
    it('suggests console methods after console.', () => {
      const { source, position } = parseSource('console.|')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'log')).toBe(true)
      expect(completions.some((c) => c.label === 'error')).toBe(true)
      expect(completions.some((c) => c.label === 'warn')).toBe(true)
      expect(completions.every((c) => c.type === 'method')).toBe(true)
    })

    it('suggests Math methods and constants after Math.', () => {
      const { source, position } = parseSource('Math.|')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'floor')).toBe(true)
      expect(completions.some((c) => c.label === 'ceil')).toBe(true)
      expect(completions.some((c) => c.label === 'random')).toBe(true)
      expect(
        completions.some((c) => c.label === 'PI' && c.type === 'property')
      ).toBe(true)
    })

    it('suggests JSON methods after JSON.', () => {
      const { source, position } = parseSource('JSON.|')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'parse')).toBe(true)
      expect(completions.some((c) => c.label === 'stringify')).toBe(true)
    })

    it('suggests Object methods after Object.', () => {
      const { source, position } = parseSource('Object.|')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'keys')).toBe(true)
      expect(completions.some((c) => c.label === 'values')).toBe(true)
      expect(completions.some((c) => c.label === 'entries')).toBe(true)
    })

    it('filters property completions by prefix', () => {
      const { source, position } = parseSource('console.lo|')
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'log')).toBe(true)
      // Should filter to only those starting with 'lo'
      expect(completions.every((c) => c.label.startsWith('lo'))).toBe(true)
    })

    it('returns empty for unknown objects', () => {
      const { source, position } = parseSource('unknownObj.|')
      const completions = getCompletions({ source, position })

      expect(completions.length).toBe(0)
    })
  })

  describe('With transpiled metadata', () => {
    it('extracts function signature from transpiled code', () => {
      const source = `function add(a: 0, b: 0) -> 0 {
  return a + b
}`
      const metadata = getMetadata(source)

      expect(metadata).toBeDefined()
      // metadata is now keyed by function name
      expect(metadata?.add?.params?.a?.type?.kind).toBe('number')
      expect(metadata?.add?.params?.b?.type?.kind).toBe('number')
    })

    it('extracts example-based types', () => {
      const source = `function greet(name: 'World', times = 1) -! '' {
  return 'Hello ' + name
}`
      const metadata = getMetadata(source)

      expect(metadata).toBeDefined()
      // metadata is now keyed by function name
      expect(metadata?.greet?.params?.name?.type?.kind).toBe('string')
      expect(metadata?.greet?.params?.times?.type?.kind).toBe('number')
      expect(metadata?.greet?.params?.times?.default).toBe(1)
    })

    it('handles object return types', () => {
      const source = `function createUser(name: '', age: 0) -> { name: '', age: 0 } {
  return { name, age }
}`
      const metadata = getMetadata(source)

      expect(metadata).toBeDefined()
      // metadata is now keyed by function name
      expect(metadata?.createUser?.returns?.kind).toBe('object')
    })
  })

  describe('Real-world code examples', () => {
    it('handles incomplete function definition', () => {
      const { source, position } = parseSource(`
function processOrder(order: |
`)
      const completions = getCompletions({ source, position })

      // Should suggest types even with incomplete syntax
      expect(completions.some((c) => c.type === 'type')).toBe(true)
    })

    it('handles code mid-edit', () => {
      const { source, position } = parseSource(`
function ship(to: '12345', quantity = 1) {
  const result = httpFetch({ url: '/api/ship' })
  ret|
}
`)
      const completions = getCompletions({ source, position })

      // typing 'ret' should suggest 'return' (starts with 'ret')
      expect(completions.some((c) => c.label === 'return')).toBe(true)
      // 'result' doesn't start with 'ret', so it shouldn't be suggested
      expect(completions.some((c) => c.label === 'result')).toBe(false)
    })

    it('suggests variables when typing their prefix', () => {
      const { source, position } = parseSource(`
function ship(to: '12345', quantity = 1) {
  const result = httpFetch({ url: '/api/ship' })
  res|
}
`)
      const completions = getCompletions({ source, position })

      // typing 'res' should suggest 'result'
      expect(completions.some((c) => c.label === 'result')).toBe(true)
    })

    it('suggests variables declared in same scope', () => {
      const { source, position } = parseSource(`
const x = 1
const y = 2
|
`)
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'x')).toBe(true)
      expect(completions.some((c) => c.label === 'y')).toBe(true)
    })

    it('handles test block context', () => {
      const { source, position } = parseSource(`
function add(a: 0, b: 0) {
  return a + b
}

test('add works') {
  const result = add(1, 2)
  expect(result).|
}
`)
      const completions = getCompletions({ source, position })

      expect(completions.some((c) => c.label === 'toBe')).toBe(true)
    })
  })
})
