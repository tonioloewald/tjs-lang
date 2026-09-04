/* tjs <- input.ts */

import { describe, test, expect, beforeAll } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  Is,
  IsNot,
  MonadicError,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

beforeAll(() => {
  globalThis.__tjs = {
    Is,
    IsNot,
    pushStack: () => {},
    popStack: () => {},
    MonadicError,
    typeError: (path, expected, got) => {
      const actual = got === null ? 'null' : typeof got
      return new MonadicError(
        `Expected ${expected} for '${path}', got ${actual}`,
        path,
        expected,
        actual
      )
    },
    createRuntime: () => globalThis.__tjs,
  }
})

/* line 39 */
function execCode(code) {
  const logs = []
  const mockConsole = { log: (...args) => logs.push(args) }
  const fn = new Function('console', code)
  fn(mockConsole)
  return logs
}
execCode.__tjs = {
  params: {
    code: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'array',
      items: {
        kind: 'null',
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:39',
}

describe('TJS roundtrip - code should just work', () => {
  test('basic function with type annotations', () => {
    const source = `
function add(a: 0, b: 0): 0 {
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
function greet(name: 'World'): '' {
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
function double(x: 0): 0 {
  return x * 2
}




`

    const result = tjs(source, { runTests: 'report' })

    expect(result.testResults).toBeDefined()
    expect(result.testResults.length).toBeGreaterThan(0)
    const allPassed = result.testResults.every((r) => r.passed)
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

    expect(result.code).toContain("import { AgentVM, ajs } from 'tjs-lang'")
  })
})
