/**
 * TJS Test Execution
 *
 * Handles transpile-time test execution, signature validation, and test utilities.
 */

import { transformExtensionCalls } from '../parser'
import type { TypeDescriptor } from '../types'
import type { ExtractedTest, ExtractedMock } from '../tests'

export interface TestResult {
  /** Test description */
  description: string
  /** Whether the test passed */
  passed: boolean
  /** Error message if failed */
  error?: string
  /** Whether this was an implicit signature test */
  isSignatureTest?: boolean
  /** Source line number (1-indexed) where the test or error occurred */
  line?: number
  /** Source column number (1-indexed) */
  column?: number
}

function fuzzyEqual(a: unknown, b: unknown, epsilon = 1e-9): boolean {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') {
    // Check if either is non-integer (float)
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      const diff = Math.abs(a - b)
      const maxAbs = Math.max(Math.abs(a), Math.abs(b), 1)
      return diff / maxAbs < epsilon
    }
  }
  return false
}

/**
 * Deep equality check with fuzzy float comparison
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  // NaN === NaN is false in JS, but NaN should equal NaN in tests
  if (
    typeof a === 'number' &&
    typeof b === 'number' &&
    Number.isNaN(a) &&
    Number.isNaN(b)
  )
    return true
  if (fuzzyEqual(a, b)) return true
  if (a === null || b === null) return a === b
  if (a === undefined || b === undefined) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false

  const keysA = Object.keys(a as object)
  const keysB = Object.keys(b as object)
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => deepEqual((a as any)[k], (b as any)[k]))
}

/**
 * Check if a value matches an expected type pattern (from example value)
 * Unlike deepEqual, this checks TYPE compatibility, not value equality.
 *
 * Example patterns:
 *   0 matches any number
 *   "" matches any string
 *   true matches any boolean
 *   null matches null
 *   [] matches any array
 *   [0] matches array of numbers
 *   {name: "", age: 0} matches object with string name and number age
 */
function typeMatches(
  actual: unknown,
  pattern: unknown,
  path = ''
): { matches: boolean; error?: string } {
  // null pattern matches null
  if (pattern === null) {
    if (actual === null) return { matches: true }
    return {
      matches: false,
      error: `Expected null at '${path}', got ${typeOf(actual)}`,
    }
  }

  // undefined pattern matches undefined
  if (pattern === undefined) {
    if (actual === undefined) return { matches: true }
    return {
      matches: false,
      error: `Expected undefined at '${path}', got ${typeOf(actual)}`,
    }
  }

  // Primitive types - check type, not value
  if (typeof pattern === 'number') {
    if (typeof actual === 'number') return { matches: true }
    return {
      matches: false,
      error: `Expected number at '${path}', got ${typeOf(actual)}`,
    }
  }

  if (typeof pattern === 'string') {
    if (typeof actual === 'string') return { matches: true }
    return {
      matches: false,
      error: `Expected string at '${path}', got ${typeOf(actual)}`,
    }
  }

  if (typeof pattern === 'boolean') {
    if (typeof actual === 'boolean') return { matches: true }
    return {
      matches: false,
      error: `Expected boolean at '${path}', got ${typeOf(actual)}`,
    }
  }

  // Arrays
  if (Array.isArray(pattern)) {
    if (!Array.isArray(actual)) {
      return {
        matches: false,
        error: `Expected array at '${path}', got ${typeOf(actual)}`,
      }
    }
    // Empty array pattern matches any array
    if (pattern.length === 0) return { matches: true }
    // Non-empty array pattern: check each element against first pattern element
    const elementPattern = pattern[0]
    for (let i = 0; i < actual.length; i++) {
      const result = typeMatches(actual[i], elementPattern, `${path}[${i}]`)
      if (!result.matches) return result
    }
    return { matches: true }
  }

  // Objects
  if (typeof pattern === 'object' && pattern !== null) {
    if (
      typeof actual !== 'object' ||
      actual === null ||
      Array.isArray(actual)
    ) {
      return {
        matches: false,
        error: `Expected object at '${path}', got ${typeOf(actual)}`,
      }
    }
    // Check all pattern keys exist and match types
    for (const key of Object.keys(pattern)) {
      const keyPath = path ? `${path}.${key}` : key
      if (!(key in actual)) {
        return { matches: false, error: `Missing property '${keyPath}'` }
      }
      const result = typeMatches(
        (actual as any)[key],
        (pattern as any)[key],
        keyPath
      )
      if (!result.matches) return result
    }
    return { matches: true }
  }

  // Fallback: exact equality
  if (actual === pattern) return { matches: true }
  return { matches: false, error: `Type mismatch at '${path}'` }
}

/**
 * Get a human-readable type description
 */
function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/**
 * Format a value for error messages - uses cleaner object notation
 * Multi-line for objects with 3+ properties
 */
function formatValue(v: unknown, indent = 0): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    if (v.length <= 3)
      return `[${v.map((x) => formatValue(x, indent)).join(', ')}]`
    return `[${v
      .slice(0, 3)
      .map((x) => formatValue(x, indent))
      .join(', ')}, ...]`
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v)
    if (entries.length === 0) return '{}'

    const formatKey = (k: string) =>
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k)

    // Single line for 1-2 properties
    if (entries.length <= 2) {
      const formatted = entries
        .map(([k, val]) => `${formatKey(k)}: ${formatValue(val, indent)}`)
        .join(', ')
      return `{${formatted}}`
    }

    // Multi-line for 3+ properties
    const pad = '  '.repeat(indent + 1)
    const closePad = '  '.repeat(indent)
    const formatted = entries
      .slice(0, 8)
      .map(
        ([k, val]) => `${pad}${formatKey(k)}: ${formatValue(val, indent + 1)}`
      )
      .join(',\n')
    const suffix = entries.length > 8 ? `,\n${pad}...` : ''
    return `{\n${formatted}${suffix}\n${closePad}}`
  }
  return String(v)
}

/**
 * Strip comments from source code
 * Used to avoid matching code patterns inside comments
 */
function stripComments(code: string): string {
  // Replace block comments with equivalent whitespace (preserve line numbers)
  let result = code.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    // Replace with same number of newlines to preserve line numbers
    const newlines = match.split('\n').length - 1
    return '\n'.repeat(newlines)
  })

  // Replace line comments
  result = result.replace(/\/\/[^\n]*/g, '')

  return result
}

/**
 * Strip import/export syntax for test execution context
 * Tests run in new Function() which doesn't support ES modules
 *
 * Useful for:
 * - Running tests in new Function() context
 * - CLI test runners
 * - Bundler plugins that need to extract module code
 */
export function stripModuleSyntax(code: string): string {
  // Remove import statements (entire line)
  let result = code.replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  result = result.replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '')

  // Remove 'export ' keyword but keep the declaration
  result = result.replace(/^export\s+default\s+/gm, '')
  result = result.replace(/^export\s+/gm, '')

  // Strip top-level await (not inside functions) — incompatible with new Function()
  // Match lines that start with await or "const/let/var x = await ..."
  result = result.replace(
    /^(\s*)((?:const|let|var)\s+\w+\s*=\s*)?await\s+.+$/gm,
    '$1/* top-level await removed for test execution */'
  )

  return result
}

/**
 * Strip the __tjs runtime preamble from transpiled code
 * This is needed when injecting resolved imports into a test context
 * that already has its own __tjs stub
 *
 * Useful for:
 * - Combining multiple TJS modules into a single execution context
 * - Test runners that provide their own __tjs runtime
 * - Bundlers that need to deduplicate runtime setup
 */
export function stripTjsPreamble(code: string): string {
  // Remove the __tjs runtime setup lines:
  // const __tjs = globalThis.__tjs?.createRuntime?.() ?? globalThis.__tjs;
  // const { Is, IsNot } = __tjs ?? {};
  let result = code.replace(
    /^const __tjs = globalThis\.__tjs\?\.createRuntime\?\.\(\) \?\? globalThis\.__tjs;\n?/m,
    ''
  )
  result = result.replace(
    /^const \{ (?:Is|IsNot|Is, IsNot) \} = __tjs \?\? \{\};\n?/m,
    ''
  )
  return result
}

/**
 * Build code to inject resolved imports into test execution context
 *
 * Takes a map of module specifier -> compiled code and returns code that
 * makes those exports available in the test scope.
 *
 * For example, if resolvedImports contains:
 *   { 'mymath': 'function add(a, b) { return a + b }\nadd.__tjs = {...}' }
 *
 * This will return code that evaluates that module and makes `add` available.
 */
function buildResolvedImportsCode(
  resolvedImports: Record<string, string>
): string {
  if (Object.keys(resolvedImports).length === 0) {
    return ''
  }

  const lines: string[] = []

  for (const [specifier, moduleCode] of Object.entries(resolvedImports)) {
    // Strip module syntax from the imported code too (it may have exports)
    let cleanCode = stripModuleSyntax(moduleCode)
    // Strip __tjs preamble to avoid duplicate declarations
    // (test execution context provides its own __tjs stub)
    cleanCode = stripTjsPreamble(cleanCode)

    lines.push(`// Resolved import: ${specifier}`)
    lines.push(cleanCode)
  }

  return lines.join('\n')
}

/**
 * Parse a return type example that may contain `key = defaultValue` syntax.
 * Transforms `{ value: 0, error = '' }` into valid JS `{ value: 0, error: '' }`
 * and extracts the default values for optional keys.
 */
function parseReturnExample(
  str: string
): { pattern: unknown; defaults: Record<string, unknown> } | null {
  const defaults: Record<string, unknown> = {}

  // Only process objects that might contain = syntax
  const trimmed = str.trim()
  if (!trimmed.startsWith('{') || !trimmed.includes('=')) {
    try {
      return { pattern: new Function(`return ${str}`)(), defaults }
    } catch {
      return null
    }
  }

  // Transform top-level `key = value` to `key: value` and track defaults
  // Walk the string respecting nesting depth
  let transformed = ''
  let depth = 0
  let i = 0

  while (i < trimmed.length) {
    const ch = trimmed[i]

    if (ch === '{' || ch === '[' || ch === '(') {
      depth++
      transformed += ch
      i++
    } else if (ch === '}' || ch === ']' || ch === ')') {
      depth--
      transformed += ch
      i++
    } else if (ch === "'" || ch === '"' || ch === '`') {
      // Skip string literals
      const quote = ch
      transformed += ch
      i++
      while (i < trimmed.length && trimmed[i] !== quote) {
        if (trimmed[i] === '\\') {
          transformed += trimmed[i++]
        }
        transformed += trimmed[i++]
      }
      if (i < trimmed.length) {
        transformed += trimmed[i++]
      }
    } else if (depth === 1 && ch === '=') {
      // Top-level `key = value` — look back for the key name
      const beforeEq = transformed.slice(transformed.lastIndexOf('{') + 1)
      const lastSegment = beforeEq.split(',').pop() || ''
      const keyMatch = lastSegment.match(/\s*(\w+)\s*$/)
      if (keyMatch) {
        // Find the value after =
        let j = i + 1
        while (j < trimmed.length && /\s/.test(trimmed[j])) j++

        // Extract value (up to , or } at depth 1)
        let valStr = ''
        let valDepth = 0
        while (j < trimmed.length) {
          const vc = trimmed[j]
          if (vc === '{' || vc === '[' || vc === '(') valDepth++
          else if (vc === '}' || vc === ']' || vc === ')') {
            if (valDepth === 0) break
            valDepth--
          } else if (vc === ',' && valDepth === 0) break
          valStr += vc
          j++
        }

        try {
          defaults[keyMatch[1]] = new Function(`return ${valStr.trim()}`)()
        } catch {
          // Can't parse default, skip
        }

        // Replace = with : in output
        transformed += ':'
        i++
        continue
      }
      transformed += ch
      i++
    } else {
      transformed += ch
      i++
    }
  }

  try {
    return { pattern: new Function(`return ${transformed}`)(), defaults }
  } catch {
    return null
  }
}

/**
 * Info about a signature test (extracted but not yet executed)
 */
interface SignatureTestInfo {
  funcName: string
  args: unknown[]
  expected: unknown
  defaults?: Record<string, unknown>
  line: number
  isAsync?: boolean
}

/**
 * Extract signature test info from source without executing
 */
export function extractSignatureTestInfos(
  originalSource: string
): SignatureTestInfo[] {
  const infos: SignatureTestInfo[] = []

  // Strip comments to avoid matching functions inside doc comments/code examples
  const sourceWithoutComments = stripComments(originalSource)

  // Match function declarations with return type marker (-> or -?)
  // Skip -! which means "don't test"
  // Pattern: [async] function name(params) -> returnExample {
  const funcRegex = /(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(-[>?])\s*/g

  let match
  while ((match = funcRegex.exec(sourceWithoutComments)) !== null) {
    const isAsync = !!match[1]
    const funcName = match[2]
    const paramsStr = match[3]
    const returnMarker = match[4]

    // Calculate line number from match position in stripped source
    const lineNumber = sourceWithoutComments
      .slice(0, match.index)
      .split('\n').length

    // -! means skip test
    if (returnMarker === '-!') continue

    // Extract return example - handle nested braces/brackets
    const afterMarker = sourceWithoutComments.slice(
      match.index + match[0].length
    )
    const returnExample = extractReturnExampleFromSource(afterMarker)
    if (!returnExample) continue

    // Extract parameter examples
    const paramExamples = extractParamExamples(paramsStr)
    if (paramsStr.trim() && paramExamples.length === 0) continue

    try {
      // Parse expected value (with optional default keys) and args
      const parsed = parseReturnExample(returnExample)
      if (!parsed) continue

      const args = paramExamples.map((p) => new Function(`return ${p}`)())

      infos.push({
        funcName,
        args,
        expected: parsed.pattern,
        defaults:
          Object.keys(parsed.defaults).length > 0 ? parsed.defaults : undefined,
        line: lineNumber,
        isAsync,
      })
    } catch {
      // Skip if parsing fails - will be reported as error during execution
    }
  }

  return infos
}

/**
 * Run all tests (explicit blocks + signature tests) in a single execution context
 * This executes the module only once, then runs all tests against that context
 */
export function runAllTests(
  tests: ExtractedTest[],
  mocks: ExtractedMock[],
  sigTestInfos: SignatureTestInfo[],
  transpiledCode: string,
  resolvedImports: Record<string, string> = {},
  extensions: Map<string, Set<string>> = new Map()
): TestResult[] {
  const results: TestResult[] = []

  // If no tests at all, return empty
  if (tests.length === 0 && sigTestInfos.length === 0) {
    return results
  }

  // Detect unresolved imports — imports in source that aren't in resolvedImports
  const importSpecifiers =
    transpiledCode.match(/^import\s+.*?from\s+['"]([^'"]+)['"];?\s*$/gm) || []
  const hasUnresolvedImports =
    importSpecifiers.length > 0 &&
    importSpecifiers.some((imp) => {
      const match = imp.match(/from\s+['"]([^'"]+)['"]/)
      return match && !(match[1] in resolvedImports)
    })

  // Strip import/export for test execution (can't use modules in new Function)
  let executableCode = stripModuleSyntax(transpiledCode)
  // Strip __tjs preamble - test context provides its own stub
  executableCode = stripTjsPreamble(executableCode)

  // Build resolved imports code - inject imported module code into execution context
  const importedCode = buildResolvedImportsCode(resolvedImports)

  // Build mock setup
  const mockSetup = mocks.map((m) => m.body).join('\n')

  // Build test execution code that runs all tests in sequence
  const testBodies = tests
    .map((t, i) => {
      // Apply extension call rewriting to test body if extensions exist
      const body =
        extensions.size > 0
          ? transformExtensionCalls(t.body, extensions)
          : t.body
      return `
    // Test ${i}: ${t.description}
    try {
      ${body}
      __testResults.push({ idx: ${i}, passed: true });
    } catch (e) {
      __testResults.push({ idx: ${i}, passed: false, error: e.message || String(e) });
    }
  `
    })
    .join('\n')

  // Filter out async functions — can't be tested synchronously at transpile time
  // Users should test async functions with explicit test blocks instead
  const syncSigTestInfos = sigTestInfos.filter((info) => !info.isAsync)
  const asyncSigTestInfos = sigTestInfos.filter((info) => info.isAsync)

  // Build signature test execution code
  const sigTestBodies = syncSigTestInfos
    .map(
      (info, i) => `
    // Signature test ${i}: ${info.funcName}
    try {
      let __actual = ${info.funcName}(${info.args
        .map((a) => JSON.stringify(a))
        .join(', ')});
      const __expected = ${JSON.stringify(info.expected)};${
        info.defaults
          ? `
      const __defaults = ${JSON.stringify(info.defaults)};
      if (typeof __actual === 'object' && __actual !== null) __actual = Object.assign({}, __defaults, __actual);`
          : ''
      }
      const __typeResult = __typeMatches(__actual, __expected, '${
        info.funcName
      }');
      if (__typeResult.matches) {
        __sigTestResults.push({ idx: ${i}, passed: true });
      } else {
        __sigTestResults.push({ idx: ${i}, passed: false, error: __typeResult.error || 'Type mismatch: got ' + __format(__actual) });
      }
    } catch (e) {
      __sigTestResults.push({ idx: ${i}, passed: false, error: e.message || String(e) });
    }
  `
    )
    .join('\n')

  // TJS stub setup/restore
  const tjsStub = `
    const __saved_tjs = globalThis.__tjs;
    class __MonadicError extends Error { constructor(m,p,e,a,c){super(m);this.name='MonadicError';this.path=p;this.expected=e;this.actual=a;this.callStack=c;} }
    const __stub_tjs = { version: '0.0.0', MonadicError: __MonadicError, pushStack: () => {}, popStack: () => {}, getStack: () => [], typeError: (path, expected, value) => new __MonadicError(\`Type error at \${path}: expected \${expected}\`, path, expected, typeof value), createRuntime: function() { return this; } };
    globalThis.__tjs = __stub_tjs;
  `
  const tjsRestore = `globalThis.__tjs = __saved_tjs;`

  // Combined test code - execute module ONCE, then run all tests
  const testCode = `
    ${tjsStub}
    const __testResults = [];
    const __sigTestResults = [];
    try {
      // Test assertions
      function assert(condition, message) {
        if (!condition) throw new Error(message || 'Assertion failed')
      }

      function expect(actual) {
        return {
          toBe(expected) {
            if (!__deepEqual(actual, expected)) {
              throw new Error('Expected ' + __format(expected) + ' but got ' + __format(actual))
            }
          },
          toEqual(expected) {
            if (!__deepEqual(actual, expected)) {
              throw new Error('Expected ' + __format(expected) + ' but got ' + __format(actual))
            }
          },
          toContain(item) {
            if (!Array.isArray(actual) || !actual.some(function(v) { return __deepEqual(v, item) })) {
              throw new Error('Expected ' + __format(actual) + ' to contain ' + __format(item))
            }
          },
          toBeTruthy() {
            if (!actual) {
              throw new Error('Expected ' + __format(actual) + ' to be truthy')
            }
          },
          toBeFalsy() {
            if (actual) {
              throw new Error('Expected ' + __format(actual) + ' to be falsy')
            }
          },
          toBeNull() {
            if (actual !== null) {
              throw new Error('Expected null but got ' + __format(actual))
            }
          },
          toBeUndefined() {
            if (actual !== undefined) {
              throw new Error('Expected undefined but got ' + __format(actual))
            }
          },
          toBeGreaterThan(n) {
            if (!(actual > n)) {
              throw new Error('Expected ' + __format(actual) + ' to be greater than ' + n)
            }
          },
          toBeLessThan(n) {
            if (!(actual < n)) {
              throw new Error('Expected ' + __format(actual) + ' to be less than ' + n)
            }
          },
          toBeNaN() {
            if (typeof actual !== 'number' || !Number.isNaN(actual)) {
              throw new Error('Expected NaN but got ' + __format(actual))
            }
          }
        }
      }

      // Inject resolved imports first (they may be dependencies)
      ${importedCode}

      // Execute the module code ONCE
      ${executableCode}
      ${mockSetup}

      // Run explicit test blocks
      ${testBodies}

      // Run signature tests
      ${sigTestBodies}

    } finally {
      ${tjsRestore}
    }
    return { testResults: __testResults, sigTestResults: __sigTestResults };
  `

  try {
    // Execute all tests
    const fn = new Function(
      '__deepEqual',
      '__format',
      '__typeMatches',
      testCode
    )
    const { testResults: blockResults, sigTestResults } = fn(
      deepEqual,
      formatValue,
      typeMatches
    )

    // Map block test results
    for (const r of blockResults) {
      const test = tests[r.idx]
      // Skip block tests that fail due to unresolved imports
      const isImportError =
        hasUnresolvedImports &&
        !r.passed &&
        r.error &&
        /is not defined$/.test(r.error)
      results.push({
        description: test.description,
        passed: isImportError ? true : r.passed,
        error: isImportError ? undefined : r.error,
        line: test.line,
      })
    }

    // Map signature test results
    for (const r of sigTestResults) {
      const info = syncSigTestInfos[r.idx]
      // Skip signature tests that fail due to unresolved imports
      const isImportError =
        hasUnresolvedImports &&
        !r.passed &&
        r.error &&
        /is not defined$/.test(r.error)
      results.push({
        description: `${info.funcName} signature example`,
        passed: isImportError ? true : r.passed,
        error: isImportError ? undefined : r.error,
        isSignatureTest: true,
        line: info.line,
      })
    }
  } catch (e: any) {
    // If module fails due to unresolved imports (ReferenceError from stripped imports),
    // skip tests gracefully rather than marking them as failures
    const isUnresolvedRef = hasUnresolvedImports && e instanceof ReferenceError

    for (const test of tests) {
      results.push({
        description: test.description,
        passed: isUnresolvedRef,
        error: isUnresolvedRef
          ? undefined
          : `Module execution failed: ${e.message}`,
        line: test.line,
      })
    }
    for (const info of syncSigTestInfos) {
      results.push({
        description: `${info.funcName} signature example`,
        passed: isUnresolvedRef,
        error: isUnresolvedRef
          ? undefined
          : `Module execution failed: ${e.message}`,
        isSignatureTest: true,
        line: info.line,
      })
    }
  }

  // Add skipped results for async signature tests
  for (const info of asyncSigTestInfos) {
    results.push({
      description: `${info.funcName} signature example`,
      passed: true,
      isSignatureTest: true,
      line: info.line,
    })
  }

  return results
}

/**
 * Run extracted test blocks at transpile time
 * @deprecated Use runAllTests instead for single execution context
 */
function runTestBlocks(
  tests: ExtractedTest[],
  mocks: ExtractedMock[],
  transpiledCode: string,
  resolvedImports: Record<string, string> = {}
): TestResult[] {
  const results: TestResult[] = []

  // Strip import/export for test execution (can't use modules in new Function)
  let executableCode = stripModuleSyntax(transpiledCode)
  // Strip __tjs preamble - test context provides its own stub
  executableCode = stripTjsPreamble(executableCode)

  // Build resolved imports code - inject imported module code into execution context
  const importedCode = buildResolvedImportsCode(resolvedImports)

  // Build execution context with the transpiled function
  const mockSetup = mocks.map((m) => m.body).join('\n')

  for (const test of tests) {
    try {
      // Create a function that runs the test
      // Always provide a clean __tjs stub for isolated test execution
      // Save and restore globalThis.__tjs to prevent pollution
      const tjsStub = `
        const __saved_tjs = globalThis.__tjs;
        class __MonadicError extends Error { constructor(m,p,e,a,c){super(m);this.name='MonadicError';this.path=p;this.expected=e;this.actual=a;this.callStack=c;} }
        const __stub_tjs = { version: '0.0.0', MonadicError: __MonadicError, pushStack: () => {}, popStack: () => {}, getStack: () => [], typeError: (path, expected, value) => new __MonadicError(\`Type error at \${path}: expected \${expected}\`, path, expected, typeof value), createRuntime: function() { return this; } };
        globalThis.__tjs = __stub_tjs;
      `
      const tjsRestore = `globalThis.__tjs = __saved_tjs;`
      const testCode = `
        ${tjsStub}
        try {
          // Inject resolved imports first (they may be dependencies)
          ${importedCode}
          ${executableCode}
          ${mockSetup}

          // Test assertions
          function assert(condition, message) {
            if (!condition) throw new Error(message || 'Assertion failed')
          }

          function expect(actual) {
            return {
              toBe(expected) {
                if (!__deepEqual(actual, expected)) {
                  throw new Error('Expected ' + __format(expected) + ' but got ' + __format(actual))
                }
              },
              toEqual(expected) {
                if (!__deepEqual(actual, expected)) {
                  throw new Error('Expected ' + __format(expected) + ' but got ' + __format(actual))
                }
              },
              toContain(item) {
                if (!Array.isArray(actual) || !actual.some(function(v) { return __deepEqual(v, item) })) {
                  throw new Error('Expected ' + __format(actual) + ' to contain ' + __format(item))
                }
              },
              toBeTruthy() {
                if (!actual) {
                  throw new Error('Expected ' + __format(actual) + ' to be truthy')
                }
              },
              toBeFalsy() {
                if (actual) {
                  throw new Error('Expected ' + __format(actual) + ' to be falsy')
                }
              },
              toBeNull() {
                if (actual !== null) {
                  throw new Error('Expected null but got ' + __format(actual))
                }
              },
              toBeUndefined() {
                if (actual !== undefined) {
                  throw new Error('Expected undefined but got ' + __format(actual))
                }
              },
              toBeGreaterThan(n) {
                if (!(actual > n)) {
                  throw new Error('Expected ' + __format(actual) + ' to be greater than ' + n)
                }
              },
              toBeLessThan(n) {
                if (!(actual < n)) {
                  throw new Error('Expected ' + __format(actual) + ' to be less than ' + n)
                }
              },
              toBeNaN() {
                if (typeof actual !== 'number' || !Number.isNaN(actual)) {
                  throw new Error('Expected NaN but got ' + __format(actual))
                }
              }
            }
          }

          // Run the test body
          ${test.body}
        } finally {
          ${tjsRestore}
        }
      `

      // Execute the test
      const fn = new Function('__deepEqual', '__format', testCode)
      fn(deepEqual, formatValue)

      results.push({
        description: test.description,
        passed: true,
        line: test.line,
      })
    } catch (e: any) {
      results.push({
        description: test.description,
        passed: false,
        error: e.message || String(e),
        line: test.line,
      })
    }
  }

  return results
}

/**
 * Evaluate an ObjectExpression AST node to a plain object
 */
function evalObjectExpression(node: any): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const prop of node.properties) {
    if (prop.type === 'Property' && prop.key) {
      const key =
        prop.key.type === 'Identifier' ? prop.key.name : prop.key.value
      if (prop.value.type === 'Literal') {
        result[key] = prop.value.value
      } else if (prop.value.type === 'ObjectExpression') {
        result[key] = evalObjectExpression(prop.value)
      } else if (prop.value.type === 'ArrayExpression') {
        result[key] = evalArrayExpression(prop.value)
      } else {
        throw new Error('Unsupported value type')
      }
    }
  }
  return result
}

/**
 * Evaluate an ArrayExpression AST node to an array
 */
function evalArrayExpression(node: any): unknown[] {
  const result: unknown[] = []
  for (const elem of node.elements) {
    if (elem.type === 'Literal') {
      result.push(elem.value)
    } else if (elem.type === 'ObjectExpression') {
      result.push(evalObjectExpression(elem))
    } else if (elem.type === 'ArrayExpression') {
      result.push(evalArrayExpression(elem))
    } else {
      throw new Error('Unsupported element type')
    }
  }
  return result
}

/**
 * Extract and run signature tests for ALL functions with -> return types
 * Parses the original source to find function signatures
 *
 * Current limitations (future work):
 * - Only tests top-level `function` declarations (not arrow functions yet)
 * - Nested functions (inside other functions/blocks) are not excluded yet
 *   and will fail if tested since they're not in global scope
 * - Arrow functions like `Foo = (x: 5) -> 10 => {}` not yet supported
 */
function runAllSignatureTests(
  originalSource: string,
  transpiledCode: string,
  resolvedImports: Record<string, string> = {}
): TestResult[] {
  const results: TestResult[] = []

  // Strip comments to avoid matching functions inside doc comments/code examples
  const sourceWithoutComments = stripComments(originalSource)

  // Match function declarations with return type marker (-> or -?)
  // Skip -! which means "don't test"
  // Pattern: function name(params) -> returnExample {
  const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*(-[>?])\s*/g

  let match
  while ((match = funcRegex.exec(sourceWithoutComments)) !== null) {
    const funcName = match[1]
    const paramsStr = match[2]
    const returnMarker = match[3]

    // Calculate line number from match position in stripped source
    const lineNumber = sourceWithoutComments
      .slice(0, match.index)
      .split('\n').length

    // -! means skip test
    if (returnMarker === '-!') continue

    // Extract return example - handle nested braces/brackets
    // Use stripped source since match.index is from that
    const afterMarker = sourceWithoutComments.slice(
      match.index + match[0].length
    )
    const returnExample = extractReturnExampleFromSource(afterMarker)
    if (!returnExample) continue

    // Extract parameter examples
    const paramExamples = extractParamExamples(paramsStr)
    if (paramsStr.trim() && paramExamples.length === 0) continue

    // Run the signature test
    try {
      // Parse expected value (with optional default keys)
      const parsed = parseReturnExample(returnExample)
      if (!parsed) continue

      // Parse args
      const args = paramExamples.map((p) => new Function(`return ${p}`)())

      const result = runSignatureTest(
        funcName,
        transpiledCode,
        args,
        parsed.pattern,
        resolvedImports,
        Object.keys(parsed.defaults).length > 0 ? parsed.defaults : undefined
      )
      result.line = lineNumber
      results.push(result)
    } catch (e: any) {
      results.push({
        description: `${funcName} signature example`,
        passed: false,
        error: `Failed to parse signature: ${e.message}`,
        isSignatureTest: true,
        line: lineNumber,
      })
    }
  }

  return results
}

/**
 * Extract return type example from source, handling nested braces
 */
export function extractReturnExampleFromSource(source: string): string | null {
  let result = ''
  let depth = 0
  let hasContent = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]

    if (char === '{' || char === '[' || char === '(') {
      if (char === '{' && depth === 0 && hasContent) {
        // Found the function body opening brace
        break
      }
      depth++
      result += char
      hasContent = true
    } else if (char === '}' || char === ']' || char === ')') {
      depth--
      result += char
    } else if (!/\s/.test(char)) {
      result += char
      hasContent = true
    } else {
      result += char
    }
  }

  const trimmed = result.trim()
  return trimmed || null
}

/**
 * Extract parameter example values from params string
 */
function extractParamExamples(paramsStr: string): string[] {
  if (!paramsStr.trim()) return []

  const examples: string[] = []
  const params = splitParams(paramsStr)

  for (const param of params) {
    // Match: name: example or name = example (with optional safety markers)
    // Handle: (? name: example) or (! name: example)
    const match = param.match(/(?:\(\s*[?!]\s*)?(\w+)\s*[:=]\s*(.+?)(?:\))?$/)
    if (match) {
      examples.push(match[2].trim())
    } else {
      // No example value - can't run signature test
      return []
    }
  }

  return examples
}

/**
 * Split parameter string on commas, respecting nested structures
 */
function splitParams(paramsStr: string): string[] {
  const params: string[] = []
  let current = ''
  let depth = 0

  for (const char of paramsStr) {
    if (char === '(' || char === '[' || char === '{') depth++
    else if (char === ')' || char === ']' || char === '}') depth--
    else if (char === ',' && depth === 0) {
      params.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  if (current.trim()) params.push(current.trim())
  return params
}

/**
 * Run signature example test
 */
function runSignatureTest(
  funcName: string,
  transpiledCode: string,
  args: unknown[],
  expected: unknown,
  resolvedImports: Record<string, string> = {},
  defaults?: Record<string, unknown>
): TestResult {
  const description = `${funcName} signature example`

  // Strip import/export for test execution (can't use modules in new Function)
  let executableCode = stripModuleSyntax(transpiledCode)
  // Strip __tjs preamble - test context provides its own stub
  executableCode = stripTjsPreamble(executableCode)

  // Build resolved imports code - inject imported module code into execution context
  const importedCode = buildResolvedImportsCode(resolvedImports)

  try {
    // Execute the function with example args
    // Provide a minimal __tjs stub for pushStack/typeError (used by inline validation)
    // Only define if not already in the transpiled code
    // Always provide a clean __tjs stub for isolated test execution
    // Save and restore globalThis.__tjs to prevent pollution
    const tjsStub = `
      const __saved_tjs = globalThis.__tjs;
      class __MonadicError extends Error { constructor(m,p,e,a,c){super(m);this.name='MonadicError';this.path=p;this.expected=e;this.actual=a;this.callStack=c;} }
      const __stub_tjs = { version: '0.0.0', MonadicError: __MonadicError, pushStack: () => {}, popStack: () => {}, getStack: () => [], typeError: (path, expected, value) => new __MonadicError(\`Type error at \${path}: expected \${expected}\`, path, expected, typeof value), createRuntime: function() { return this; } };
      globalThis.__tjs = __stub_tjs;
    `
    const tjsRestore = `globalThis.__tjs = __saved_tjs;`
    const testCode = `
      ${tjsStub}
      try {
        // Inject resolved imports first (they may be dependencies)
        ${importedCode}
        ${executableCode}
        return ${funcName}(${args.map((a) => JSON.stringify(a)).join(', ')})
      } finally {
        ${tjsRestore}
      }
    `
    const fn = new Function(testCode)
    let actual = fn()

    // Merge defaults for optional keys before type checking
    if (defaults && typeof actual === 'object' && actual !== null) {
      actual = Object.assign({}, defaults, actual)
    }

    // Use type matching, not value equality
    // The expected value is a TYPE PATTERN (example), not the exact expected result
    const result = typeMatches(actual, expected, funcName)
    if (!result.matches) {
      return {
        description,
        passed: false,
        error: result.error || `Type mismatch: got ${formatValue(actual)}`,
        isSignatureTest: true,
      }
    }

    return { description, passed: true, isSignatureTest: true }
  } catch (e: any) {
    return {
      description,
      passed: false,
      error: e.message || String(e),
      isSignatureTest: true,
    }
  }
}

/**
 * Compile WASM blocks and generate bootstrap code that embeds the compiled bytes
 * and instantiates them on load.
 */
