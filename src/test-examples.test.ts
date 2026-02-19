/**
 * E2E tests for playground example markdown files.
 *
 * Loads examples directly from guides/examples/ and verifies:
 * - TJS examples transpile without errors
 * - AJS examples parse without errors
 * - Metadata and structure are valid
 */

import { describe, test, expect } from 'bun:test'
import { loadExamples, loadExample } from './test-examples'
import { tjs } from './lang'
import { transpile } from './index'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')

const tjsExamples = loadExamples(join(ROOT, 'guides/examples/tjs'))
const ajsExamples = loadExamples(join(ROOT, 'guides/examples/ajs'))

describe('loadExample helper', () => {
  test('extracts metadata, title, language, and code', () => {
    const ex = loadExample(join(ROOT, 'guides/examples/tjs/hello-tjs.md'))
    expect(ex.title).toBeTruthy()
    expect(ex.code).toBeTruthy()
    expect(ex.language).toBe('tjs')
    expect(ex.metadata.section).toBe('tjs')
    expect(ex.metadata.type).toBe('example')
  })

  test('extracts description', () => {
    const ex = loadExample(join(ROOT, 'guides/examples/ajs/hello-world.md'))
    expect(ex.description).toContain('greeting')
  })
})

describe('TJS examples transpile', () => {
  for (const ex of tjsExamples) {
    if (ex.language !== 'tjs') continue

    test(`${ex.title} (${ex.path.split('/').pop()})`, () => {
      const result = tjs(ex.code, { runTests: false })
      expect(result.code).toBeDefined()
      expect(result.code.length).toBeGreaterThan(0)
    })
  }
})

describe('TJS examples with inline tests', () => {
  // Examples that use imports can't run inline tests
  const skipTests = new Set([
    'Date Formatting (with import)',
    'Local Module Imports',
    'Lodash Utilities (with import)',
    'Schema Validation',
    'React Todo (Comparison)',
    'tosijs Todo App',
    'Full-Stack Demo: Client App',
    'Full-Stack Demo: Todo API',
    'Full-Stack Demo: User Service',
    'The Universal Endpoint',
  ])

  for (const ex of tjsExamples) {
    if (ex.language !== 'tjs') continue
    if (skipTests.has(ex.title)) continue

    test(`${ex.title} tests pass`, () => {
      const result = tjs(ex.code, { runTests: 'report' })
      const failures = (result.testResults || []).filter((t: any) => !t.passed)
      if (failures.length > 0) {
        const msgs = failures.map((f: any) => `${f.description}: ${f.error}`)
        throw new Error(`Test failures:\n${msgs.join('\n')}`)
      }
    })
  }
})

describe('AJS examples parse', () => {
  for (const ex of ajsExamples) {
    if (!ex.code) continue

    test(`${ex.title} (${ex.path.split('/').pop()})`, () => {
      const result = transpile(ex.code)
      expect(result.ast).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  }
})

describe('Example metadata', () => {
  const allExamples = [...tjsExamples, ...ajsExamples]

  test('all examples have titles', () => {
    for (const ex of allExamples) {
      expect(ex.title).toBeTruthy()
    }
  })

  test('all examples have section metadata', () => {
    for (const ex of allExamples) {
      if (!ex.metadata.section) continue // some may be docs, not examples
      expect(['tjs', 'ajs']).toContain(ex.metadata.section)
    }
  })

  test('all examples have code blocks', () => {
    for (const ex of allExamples) {
      expect(ex.code.length).toBeGreaterThan(0)
    }
  })

  test('TJS examples use ```tjs fence', () => {
    for (const ex of tjsExamples) {
      if (ex.metadata.section !== 'tjs') continue
      // Allow 'javascript' for non-TJS code (e.g. React comparison)
      if (ex.language === 'javascript') continue
      expect(ex.language).toBe('tjs')
    }
  })

  test('AJS examples use ```ajs fence', () => {
    for (const ex of ajsExamples) {
      expect(ex.language).toBe('ajs')
    }
  })
})
