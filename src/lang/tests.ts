/**
 * TJS Inline Tests
 *
 * Extracts test blocks from TJS source and generates test runners.
 *
 * Syntax:
 *   test('description') {
 *     assert(condition)
 *     assert(a === b, 'optional message')
 *   }
 *
 *   mock {
 *     // Setup code that runs before each test
 *   }
 *
 * Output:
 *   - code: Clean source with tests stripped
 *   - tests: Array of extracted test definitions
 *   - testRunner: Generated code to execute tests
 */

import { parse } from './parser'

export interface ExtractedTest {
  description: string
  body: string
  line?: number
}

export interface ExtractedMock {
  body: string
  line?: number
}

export interface TestExtractionResult {
  /** Source code with tests and mocks removed */
  code: string
  /** Extracted test definitions */
  tests: ExtractedTest[]
  /** Extracted mock/setup blocks */
  mocks: ExtractedMock[]
  /** Generated test runner code */
  testRunner: string
}

/**
 * Extract inline tests from TJS source
 */
export function extractTests(source: string): TestExtractionResult {
  const tests: ExtractedTest[] = []
  const mocks: ExtractedMock[] = []

  // Regex to match test('description') { ... } blocks
  // This is a simplified approach - handles basic cases
  const testRegex = /test\s*\(\s*(['"`])([^'"`]*)\1\s*\)\s*\{/g
  const mockRegex = /mock\s*\{/g

  let cleanCode = source
  let match

  // Extract test blocks
  // We need to find matching braces for each test
  const testMatches: Array<{ start: number; end: number; desc: string }> = []

  while ((match = testRegex.exec(source)) !== null) {
    const start = match.index
    const desc = match[2]
    const bodyStart = match.index + match[0].length

    // Find matching closing brace
    const end = findMatchingBrace(source, bodyStart - 1)
    if (end === -1) continue

    const body = source.slice(bodyStart, end).trim()

    tests.push({
      description: desc,
      body,
      line: getLineNumber(source, start),
    })

    testMatches.push({ start, end: end + 1, desc })
  }

  // Extract mock blocks
  const mockMatches: Array<{ start: number; end: number }> = []

  while ((match = mockRegex.exec(source)) !== null) {
    const start = match.index
    const bodyStart = match.index + match[0].length

    const end = findMatchingBrace(source, bodyStart - 1)
    if (end === -1) continue

    const body = source.slice(bodyStart, end).trim()

    mocks.push({
      body,
      line: getLineNumber(source, start),
    })

    mockMatches.push({ start, end: end + 1 })
  }

  // Remove test and mock blocks from source (in reverse order to preserve indices)
  const allMatches = [...testMatches, ...mockMatches].sort(
    (a, b) => b.start - a.start
  )

  for (const m of allMatches) {
    cleanCode = cleanCode.slice(0, m.start) + cleanCode.slice(m.end)
  }

  // Clean up extra whitespace
  cleanCode = cleanCode.replace(/\n\s*\n\s*\n/g, '\n\n').trim()

  // Generate test runner
  const testRunner = generateTestRunner(tests, mocks)

  return {
    code: cleanCode,
    tests,
    mocks,
    testRunner,
  }
}

/**
 * Find the matching closing brace
 */
function findMatchingBrace(source: string, start: number): number {
  let depth = 0
  let inString: string | null = null
  let escaped = false

  for (let i = start; i < source.length; i++) {
    const char = source[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    // Track string state
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = char
      continue
    }
    if (inString === char) {
      inString = null
      continue
    }
    if (inString) continue

    // Track braces
    if (char === '{') depth++
    if (char === '}') {
      depth--
      if (depth === 0) return i
    }
  }

  return -1
}

/**
 * Get line number for a position in source
 */
function getLineNumber(source: string, pos: number): number {
  return source.slice(0, pos).split('\n').length
}

/**
 * Generate test runner code
 */
function generateTestRunner(
  tests: ExtractedTest[],
  mocks: ExtractedMock[]
): string {
  if (tests.length === 0) {
    return '// No tests defined'
  }

  const mockSetup = mocks.map((m) => m.body).join('\n')

  const testCases = tests
    .map(
      (t, i) => `
  // Test ${i + 1}: ${t.description}
  try {
    ${mockSetup}
    await (async () => {
      ${t.body}
    })()
    __results.push({ description: ${JSON.stringify(
      t.description
    )}, passed: true })
  } catch (__e) {
    __results.push({ description: ${JSON.stringify(
      t.description
    )}, passed: false, error: __e.message })
  }`
    )
    .join('\n')

  return `
// TJS Test Runner - Generated
(async () => {
const __results = []

${testCases}

// Report results
const __passed = __results.filter(r => r.passed).length
const __failed = __results.filter(r => !r.passed).length
console.log(\`Tests: \${__passed} passed, \${__failed} failed\`)
__results.filter(r => !r.passed).forEach(r => {
  console.log(\`  ✗ \${r.description}: \${r.error}\`)
})

// Return summary
return { passed: __passed, failed: __failed, results: __results }
})()
`.trim()
}

/**
 * Simple assert function for tests
 * Include this in the runtime or inject it
 */
export const assertFunction = `
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed')
  }
}
`

/**
 * Questions/Notes:
 *
 * Q1: Should mocks be scoped per-test or shared?
 *     Current: Each test runs all mocks before executing
 *
 * Q2: How to handle async tests?
 *     Could detect async/await and wrap appropriately
 *
 * Q3: Should we support test.only / test.skip?
 *     Easy to add with syntax: test.only('...') { } or test.skip('...') { }
 *
 * Q4: Integration with playground?
 *     Playground could run extractTests() and show test results in a panel
 */
