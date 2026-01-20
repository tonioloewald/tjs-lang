/**
 * TJS Inline Tests
 *
 * Extracts test blocks from TJS source and generates test runners.
 *
 * Syntax (TJS):
 *   test 'description' {
 *     assert(condition)
 *     expect(a).toBe(b)
 *   }
 *
 *   test {
 *     // Anonymous test
 *   }
 *
 *   mock {
 *     // Setup code that runs before each test
 *   }
 *
 * Syntax (TypeScript - embedded in comments):
 *   /*test 'description' {
 *     expect(add(2, 3)).toBe(5)
 *   }* /
 *
 *   This syntax survives TypeScript compilation, enabling literate
 *   programming for TypeScript: tests live alongside the code they
 *   verify, extracted and executed at runtime by TJS.
 *
 *   For TS developers who don't care about TJS: you still get inline
 *   tests that live with your code, literate development, and faster
 *   debug loops. Set `safety none` and keep living in your world.
 *
 * Output:
 *   - code: Clean source with tests stripped
 *   - tests: Array of extracted test definitions
 *   - testRunner: Generated code to execute tests
 */

// Note: parser could be used for more robust test extraction in future

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
 * Check if a position in source is inside a comment
 */
function isInsideComment(source: string, pos: number): boolean {
  // Check for line comment - scan backwards to start of line
  let lineStart = pos
  while (lineStart > 0 && source[lineStart - 1] !== '\n') {
    lineStart--
  }
  const lineBeforePos = source.slice(lineStart, pos)
  if (lineBeforePos.includes('//')) {
    return true
  }

  // Check for block comment - find last /* and */ before pos
  let i = 0
  let inBlockComment = false
  while (i < pos) {
    if (!inBlockComment && source.slice(i, i + 2) === '/*') {
      inBlockComment = true
      i += 2
    } else if (inBlockComment && source.slice(i, i + 2) === '*/') {
      inBlockComment = false
      i += 2
    } else {
      i++
    }
  }
  return inBlockComment
}

/**
 * Extract embedded tests from block comments
 *
 * Syntax:
 *   /*test 'description' {
 *     assert(condition)
 *   }* /
 *
 * This allows tests to be embedded in TypeScript files that would
 * otherwise strip out `test {}` blocks during TS compilation.
 */
function extractEmbeddedTests(source: string): ExtractedTest[] {
  const tests: ExtractedTest[] = []

  // Match: /*test 'description' { ... }*/  or  /*test { ... }*/
  const embeddedRegex =
    /\/\*test\s+(['"`])([^'"`]*)\1\s*\{([\s\S]*?)\}\s*\*\/|\/\*test\s*\{([\s\S]*?)\}\s*\*\//g

  let match
  while ((match = embeddedRegex.exec(source)) !== null) {
    // Group 2 = description for quoted, group 3 = body for quoted
    // Group 4 = body for anonymous
    const desc = match[2] || `embedded test ${tests.length + 1}`
    const body = (match[3] || match[4] || '').trim()

    tests.push({
      description: desc,
      body,
      line: getLineNumber(source, match.index),
    })
  }

  return tests
}

/**
 * Extract inline tests from TJS source
 *
 * Note: Signature tests (from -> return types) are handled separately by the
 * transpiler in js.ts. This function only extracts explicit test blocks.
 */
export function extractTests(source: string): TestExtractionResult {
  const tests: ExtractedTest[] = []
  const mocks: ExtractedMock[] = []

  // First, extract embedded tests from block comments (for TS compatibility)
  // These use syntax: /*test 'description' { ... }*/
  const embeddedTests = extractEmbeddedTests(source)
  tests.push(...embeddedTests)

  // Regex to match test blocks - three syntaxes supported:
  //   test { ... }                   (anonymous test)
  //   test 'description' { ... }     (canonical TJS)
  //   test('description') { ... }    (also valid - parenthesized string is still a string)
  const testRegex =
    /test\s+(['"`])([^'"`]*)\1\s*\{|test\s*\(\s*(['"`])([^'"`]*)\3\s*\)\s*\{|test\s*\{/g
  const mockRegex = /mock\s*\{/g

  let cleanCode = source
  let match

  // Extract test blocks
  // We need to find matching braces for each test
  const testMatches: Array<{ start: number; end: number; desc: string }> = []

  while ((match = testRegex.exec(source)) !== null) {
    const start = match.index

    // Skip matches inside comments (but embedded tests were already extracted above)
    if (isInsideComment(source, start)) {
      continue
    }

    // Description is in group 2 for `test 'desc'`, group 4 for `test('desc')`, or undefined for `test {`
    const desc = match[2] || match[4] || `test ${tests.length + 1}`
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

  // Note: No comment before IIFE - ASI would break `return (async...)` if comment is between
  return `(async () => {
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
})()`.trim()
}

/**
 * Test utilities - assert and expect
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
 * Expect API for richer test assertions
 * Uses deep equality, handles null/undefined correctly
 */
export const expectFunction = `
function expect(actual) {
  const deepEqual = (a, b) => {
    if (a === b) return true
    if (a === null || b === null) return a === b
    if (a === undefined || b === undefined) return a === undefined && b === undefined
    if (typeof a !== typeof b) return false
    if (typeof a !== 'object') return a === b
    if (Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false
      return a.every((v, i) => deepEqual(v, b[i]))
    }
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every(k => deepEqual(a[k], b[k]))
  }

  const format = (v) => {
    if (v === null) return 'null'
    if (v === undefined) return 'undefined'
    if (typeof v === 'string') return JSON.stringify(v)
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  return {
    toBe(expected) {
      if (!deepEqual(actual, expected)) {
        throw new Error(\`Expected \${format(expected)} but got \${format(actual)}\`)
      }
    },
    toEqual(expected) {
      if (!deepEqual(actual, expected)) {
        throw new Error(\`Expected \${format(expected)} but got \${format(actual)}\`)
      }
    },
    toContain(item) {
      if (!Array.isArray(actual) || !actual.some(v => deepEqual(v, item))) {
        throw new Error(\`Expected \${format(actual)} to contain \${format(item)}\`)
      }
    },
    toThrow(message) {
      let threw = false
      let thrownMessage = ''
      try {
        if (typeof actual === 'function') actual()
      } catch (e) {
        threw = true
        thrownMessage = e.message || String(e)
      }
      if (!threw) {
        throw new Error('Expected function to throw but it did not')
      }
      if (message && !thrownMessage.includes(message)) {
        throw new Error(\`Expected error containing "\${message}" but got "\${thrownMessage}"\`)
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(\`Expected \${format(actual)} to be truthy\`)
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(\`Expected \${format(actual)} to be falsy\`)
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(\`Expected null but got \${format(actual)}\`)
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(\`Expected undefined but got \${format(actual)}\`)
      }
    },
    toBeGreaterThan(n) {
      if (!(actual > n)) {
        throw new Error(\`Expected \${format(actual)} to be greater than \${n}\`)
      }
    },
    toBeLessThan(n) {
      if (!(actual < n)) {
        throw new Error(\`Expected \${format(actual)} to be less than \${n}\`)
      }
    }
  }
}
`

/**
 * Combined test utilities (assert + expect)
 */
export const testUtils = assertFunction + '\n' + expectFunction

/**
 * Questions/Notes:
 *
 * Q1: Should mocks be scoped per-test or shared?
 *     Current: Each test runs all mocks before executing
 *
 * Q2: Should we support test.only / test.skip?
 *     Easy to add with syntax: test.only('...') { } or test.skip('...') { }
 *
 * Q3: Integration with playground?
 *     Playground could run extractTests() and show test results in a panel
 *
 * Q4: DOM tests - test.browser('desc') { }?
 *     SHELVED: Plan is to run tests in actual browser (playground)
 *     Happy-DOM is ~1MB packed, too heavy to bundle
 *     If needed later: lazy-load happy-dom only for Node/Bun DOM tests
 */
