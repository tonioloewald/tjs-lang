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

import {
  maskLiteralsKeepComments,
  maskLiterals,
  commentRanges,
} from '../strip-comments'

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
 * Comment detection is now done via `commentRanges` in `extractTests`, hoisted out of the
 * per-match loop — see the comment there.
 *
 * The local wrapper this replaces delegated to the shared scanner, which was itself a fix:
 * the hand-rolled version before it counted `/*` and `*\/` from the top of the file with
 * no notion of string literals, so `const OPEN = '/*'` — or the ordinary glob
 * `'**\/*.ts'` — convinced it the rest of the file was one giant comment, and every
 * `test { }` block after that point was silently dropped. For a language whose thesis is
 * that tests live in the source, reporting zero tests without a word is the worst
 * available failure.
 */

/**
 * Recover a capture group's text from the ORIGINAL source.
 *
 * The regex runs over a masked view (string contents blanked) so it cannot be fooled by
 * quoted syntax, but the text we want back is the real thing — a test body is mostly
 * string literals, and handing back the blanked version would emit a test full of spaces.
 * Since masking preserves length, the group's offset in the mask is its offset in the
 * source.
 */
function sliceGroup(
  source: string,
  scanned: string,
  match: RegExpExecArray,
  group: number
): string {
  const text = match[group]
  if (text === undefined) return ''
  // Locate the group within the match by searching the masked match text; the group's
  // content is unique enough in practice, and a miss falls back to the masked text.
  const at = scanned.indexOf(text, match.index)
  return at === -1 ? text : source.slice(at, at + text.length)
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

  // Scan a view with STRING/TEMPLATE/REGEX contents blanked but comments intact — we are
  // reading comments, so we cannot mask them, but we must not read a `/*test` that is
  // merely quoted inside a string (documentation about this syntax does exactly that).
  // Offsets are preserved, so every index below still points into the real source.
  const scanned = maskLiteralsKeepComments(source)

  // Match: /*test 'description' { ... }*/  or  /*test { ... }*/
  // Each quote type gets its own alternative so the description can contain
  // the other quote types (e.g. `test 'typeof null is "null"' {`).
  const embeddedRegex =
    /\/\*test\s+'([^']*)'\s*\{([\s\S]*?)\}\s*\*\/|\/\*test\s+"([^"]*)"\s*\{([\s\S]*?)\}\s*\*\/|\/\*test\s+`([^`]*)`\s*\{([\s\S]*?)\}\s*\*\/|\/\*test\s*\{([\s\S]*?)\}\s*\*\//g

  let match
  while ((match = embeddedRegex.exec(scanned)) !== null) {
    // Groups: 1/3/5 = description for ' " ` ; 2/4/6 = body for ' " ` ; 7 = body for anonymous
    const desc =
      match[1] || match[3] || match[5] || `embedded test ${tests.length + 1}`
    // Read the BODY back out of the original source at the matched offsets. The mask has
    // the body's string literals blanked, and a test body is mostly string literals.
    const bodyGroup = [2, 4, 6, 7].find((g) => match![g] !== undefined)
    const body = bodyGroup
      ? sliceGroup(source, scanned, match, bodyGroup).trim()
      : ''

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
  // Each quote type has its own alternative so the description can contain
  // the other quote types (e.g. `test 'typeof null is "null"' {`).
  const testRegex =
    /test\s+'([^']*)'\s*\{|test\s+"([^"]*)"\s*\{|test\s+`([^`]*)`\s*\{|test\s*\(\s*'([^']*)'\s*\)\s*\{|test\s*\(\s*"([^"]*)"\s*\)\s*\{|test\s*\(\s*`([^`]*)`\s*\)\s*\{|test\s*\{/g
  const mockRegex = /mock\s*\{/g

  let cleanCode = source
  let match

  /**
   * ONE masked view for the whole extraction, and one set of comment ranges.
   *
   * Both were recomputed per match: `findMatchingBrace` re-masked the entire file for
   * every `test` block, and `isInsideComment` re-scanned it for every candidate position.
   * That is quadratic in the number of tests, and `extractTests` runs on every playground
   * keystroke and every `.tjs` import — measured at 31% of total transpile time for a
   * 13KB file with 35 tests (6.5ms -> 0.59ms hoisted, byte-identical output).
   *
   * `strip-comments.ts` documents exactly this ("Prefer `commentRanges` when testing many
   * positions") and neither call site had taken it.
   *
   * Masking preserves offsets — content is blanked, never removed — so every slice below
   * still reads the ORIGINAL source.
   */
  const maskedSource = maskLiterals(source)
  const comments = commentRanges(source)
  const insideComment = (pos: number): boolean =>
    comments.some(([from, to]) => pos >= from && pos < to)

  // Extract test blocks
  // We need to find matching braces for each test
  const testMatches: Array<{ start: number; end: number; desc: string }> = []

  // Scan the MASKED view, not the raw source.
  //
  // This regex ran over raw text, so `test { }` written INSIDE a string or template was
  // matched as a real test block and the extraction chopped the literal apart. Two files
  // in this repo hit it the day it was noticed: a `--help` string containing
  // "inline 'test { }' blocks", and a test file whose fixtures are TJS source held as
  // DATA (`"test 'regex' {"`). Both failed to convert with "Unterminated template" /
  // "Unterminated string constant" — errors pointing at the literal, not at the scanner.
  //
  // Same defect class as everything else in this file's history, and it survived a commit
  // that hoisted the masked view three lines above without moving the regex onto it.
  //
  // Descriptions are recovered from the ORIGINAL source, since masking blanks exactly the
  // text a description is made of.
  while ((match = testRegex.exec(maskedSource)) !== null) {
    const start = match.index

    // Skip matches inside comments (but embedded tests were already extracted above)
    if (insideComment(start)) {
      continue
    }

    // Groups 1/2/3 = `test 'desc'` / `test "desc"` / `test \`desc\``
    // Groups 4/5/6 = parenthesized variants
    // No group when description is omitted
    const descGroup = [1, 2, 3, 4, 5, 6].find(
      (g) => match![g] !== undefined && match![g] !== null
    )
    const desc = descGroup
      ? sliceGroup(source, maskedSource, match, descGroup).trim() ||
        `test ${tests.length + 1}`
      : `test ${tests.length + 1}`
    const bodyStart = match.index + match[0].length

    // Find matching closing brace
    const end = findMatchingBrace(maskedSource, bodyStart - 1)
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

  while ((match = mockRegex.exec(maskedSource)) !== null) {
    const start = match.index
    const bodyStart = match.index + match[0].length

    const end = findMatchingBrace(maskedSource, bodyStart - 1)
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
 * Find the matching closing brace, over a MASKED view of the source.
 *
 * This tracked strings and nothing else, while its two siblings
 * (`docs.ts:findMatchingBrace`, `parser-transforms.ts:findFunctionBodyEnd`) were migrated
 * to the shared masked scan in the same release. So a `}` in a REGEX or a COMMENT closed
 * the block early:
 *
 *   - `test 'x' { const re = /[}]/ … }` — legal TJS that would not compile.
 *   - a `}` in a comment truncated the body, and the generated runner then executed a
 *     fragment and reported **`passed: true` having run no assertion at all**. Silent, and
 *     live in `docs.ts` and the playground's module store.
 *
 * Takes the masked view as an ARGUMENT rather than computing it. `extractTests` calls this
 * once per `test` match, and re-masking the whole file per match is quadratic — measured at
 * 31% of total transpile time for a 13KB file with 35 tests. Offsets are preserved by
 * masking (content is blanked, never removed), so the caller can slice the ORIGINAL.
 */
function findMatchingBrace(masked: string, start: number): number {
  let depth = 0
  for (let i = start; i < masked.length; i++) {
    const char = masked[i]
    if (char === '{') depth++
    else if (char === '}') {
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

// Compute summary (no console output - caller handles reporting)
const __passed = __results.filter(r => r.passed).length
const __failed = __results.filter(r => !r.passed).length

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
  // #21: pair-memoized past the same checks — without the memo, comparing
  // shared-reference graphs (DAGs) walked all 2^depth unfolded paths (~61s at
  // depth 30) and distinct-but-cyclic graphs recursed forever. A revisited
  // pair is assumed equal (sound: any false short-circuits every .every()
  // straight to the top, so a memoized pair either proved true or is still in
  // progress higher in this stack). Lazily allocated — primitive and flat
  // compares never touch it. Same defect family lives in four sibling copies
  // (runtime Is, emitted inline Is, js-tests __deepEqual/formatValue); keep
  // them in sync (dag-safety.test.ts).
  const deepEqual = (a, b) => {
    let seen = null
    const go = (a, b) => {
      if (a === b) return true
      if (a === null || b === null) return a === b
      if (a === undefined || b === undefined) return a === undefined && b === undefined
      if (typeof a !== typeof b) return false
      if (typeof a !== 'object') return a === b
      if (Array.isArray(a) !== Array.isArray(b)) return false
      if (seen === null) seen = new WeakMap()
      let set = seen.get(a)
      if (set) {
        if (set.has(b)) return true
      } else {
        set = new WeakSet()
        seen.set(a, set)
      }
      set.add(b)
      if (Array.isArray(a)) {
        if (a.length !== b.length) return false
        return a.every((v, i) => go(v, b[i]))
      }
      const keysA = Object.keys(a)
      const keysB = Object.keys(b)
      if (keysA.length !== keysB.length) return false
      return keysA.every(k => go(a[k], b[k]))
    }
    return go(a, b)
  }

  // #21: raw JSON.stringify re-expands shared references — 2^depth output,
  // verified OOM at depth 28 under bun/JSC — and THROWS on true cycles,
  // eating the assertion message. Mark revisits as [shared] (collapses DAGs
  // and cycles alike) and hard-cap the output so no failure message can
  // allocate unboundedly.
  const format = (v) => {
    if (v === null) return 'null'
    if (v === undefined) return 'undefined'
    if (typeof v === 'string') return JSON.stringify(v)
    if (typeof v === 'object') {
      const seen = new WeakSet()
      let out
      try {
        out = JSON.stringify(v, (key, val) => {
          if (val !== null && typeof val === 'object') {
            if (seen.has(val)) return '[shared]'
            seen.add(val)
          }
          return val
        })
      } catch (e) {
        out = String(v)
      }
      if (typeof out === 'string' && out.length > 16384) {
        out = out.slice(0, 16384) + '…[truncated]'
      }
      return out
    }
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
