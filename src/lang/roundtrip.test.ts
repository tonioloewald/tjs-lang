/**
 * TJS Roundtrip Tests
 *
 * These tests verify that TJS code "just works" through the full pipeline:
 * 1. Parse TJS source
 * 2. Transpile to JS
 * 3. Execute the result
 *
 * NOTE: Currently transpiled code requires globalThis.__tjs runtime to be set up.
 * This is a known limitation - see TODO.md for "self-contained transpiler output".
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { tjs } from './index'
import { Is, IsNot, MonadicError } from './runtime'

// Set up the minimal runtime needed for transpiled code
beforeAll(() => {
  ;(globalThis as any).__tjs = {
    Is,
    IsNot,
    pushStack: () => {},
    popStack: () => {},
    MonadicError,
    typeError: (path: string, expected: string, got: any) => {
      const actual = got === null ? 'null' : typeof got
      return new MonadicError(
        `Expected ${expected} for '${path}', got ${actual}`,
        path,
        expected,
        actual
      )
    },
    createRuntime: () => (globalThis as any).__tjs,
  }
})

/** Helper to execute transpiled code and capture console output */
function execCode(code: string): any[] {
  const logs: any[] = []
  const mockConsole = { log: (...args: any[]) => logs.push(args) }
  const fn = new Function('console', code)
  fn(mockConsole)
  return logs
}

describe('TJS roundtrip - code should just work', () => {
  test('basic function with type annotations', () => {
    const source = `
function add(a: 0, b: 0) -> 0 {
  return a + b
}
console.log(add(2, 3))
`
    const result = tjs(source, { runTests: false })
    expect(result.code).toBeDefined()

    const logs = execCode(result.code)
    expect(logs[0]).toEqual([5])
  })

  test('template literals (backticks)', () => {
    const source = `
function greet(name: 'World') -> '' {
  return \`Hello, \${name}!\`
}
console.log(greet('TJS'))
`
    const result = tjs(source, { runTests: false })
    expect(result.code).toContain('Hello')

    const logs = execCode(result.code)
    expect(logs[0]).toEqual(['Hello, TJS!'])
  })

  test('inline tests execute at transpile time', () => {
    const source = `
function double(x: 0) -> 0 {
  return x * 2
}

test 'double works' {
  expect(double(5)).toBe(10)
}
`
    // Tests run during transpilation - check the testResults array
    const result = tjs(source, { runTests: 'report' })

    // testResults contains test outcomes
    expect(result.testResults).toBeDefined()
    expect(result.testResults!.length).toBeGreaterThan(0)
    const allPassed = result.testResults!.every((r: any) => r.passed)
    expect(allPassed).toBe(true)
  })

  test('apostrophes in strings', () => {
    const source = `
const msg1 = "You can't do this in Jest"
const msg2 = "You'd need to export everything"
console.log(msg1, msg2)
`
    const result = tjs(source, { runTests: false })
    expect(result.code).toContain("can't")
    expect(result.code).toContain("You'd")
  })

  test('escaped newlines in strings', () => {
    const source = `
console.log('Line 1\\nLine 2')
`
    const result = tjs(source, { runTests: false })
    const logs = execCode(result.code)
    expect(logs[0][0]).toContain('\n')
  })

  test('regex patterns with escapes', () => {
    const source = `
const EMAIL_REGEX = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/
console.log(EMAIL_REGEX.test('test@example.com'))
`
    const result = tjs(source, { runTests: false })
    const logs = execCode(result.code)
    expect(logs[0]).toEqual([true])
  })

  test('multiline JSDoc comments with backticks', () => {
    const source = `
/**
 * Returns \`hello\` to the caller
 */
function myFunc() {
  return 42
}
console.log(myFunc())
`
    const result = tjs(source, { runTests: false })
    const logs = execCode(result.code)
    expect(logs[0]).toEqual([42])
  })
})

describe('TJS imports', () => {
  test('imports pass through unchanged (current behavior)', () => {
    const source = `
import { AgentVM, ajs } from 'tjs-lang'

async function run() {
  const vm = new AgentVM()
  return vm
}
`
    const result = tjs(source, { runTests: false })

    // Currently imports pass through - this means code won't work
    // standalone in browser without import map resolution
    expect(result.code).toContain("import { AgentVM, ajs } from 'tjs-lang'")
  })
})
