/**
 * Bootstrap Canary Test - TJS builds and tests itself
 *
 * This is the ultimate dogfooding test:
 * 1. Transpile TJS source files with TJS
 * 2. Execute the transpiled code
 * 3. Run functionality tests against it
 * 4. Report timing as a benchmark
 *
 * If this test fails, something fundamental is broken.
 */

import { describe, it, expect } from 'bun:test'
import { fromTS } from '../lang/emitters/from-ts'
import { tjs } from '../lang'
import * as fs from 'fs'
import * as path from 'path'

describe('Bootstrap Canary', () => {
  describe('TJS transpiles and executes its own modules', () => {
    it('should bootstrap inference.ts', () => {
      const start = performance.now()

      // Read the source
      const sourcePath = path.join(import.meta.dir, '../lang/inference.ts')
      const source = fs.readFileSync(sourcePath, 'utf-8')

      // Transpile with TJS
      const transpileStart = performance.now()
      const result = fromTS(source)
      const transpileTime = performance.now() - transpileStart

      expect(result.code).toBeTruthy()
      expect(result.code.length).toBeGreaterThan(100)

      // Execute the transpiled code
      // Strip imports/exports for standalone execution
      const execStart = performance.now()
      const strippedCode = result.code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+/gm, '')
      const module = new Function(`
        ${strippedCode}
        return { inferTypeFromValue, extractLiteralValue, checkType, typeToString };
      `)()
      const execTime = performance.now() - execStart

      // Test the bootstrapped functions
      const testStart = performance.now()

      // Test inferTypeFromValue via checkType
      expect(module.checkType('hello', { kind: 'string' })).toBe(true)
      expect(module.checkType(42, { kind: 'number' })).toBe(true)
      expect(
        module.checkType([1, 2, 3], {
          kind: 'array',
          items: { kind: 'number' },
        })
      ).toBe(true)
      expect(
        module.checkType(
          { name: 'test' },
          { kind: 'object', shape: { name: { kind: 'string' } } }
        )
      ).toBe(true)
      expect(module.checkType(null, { kind: 'string', nullable: true })).toBe(
        true
      )
      expect(module.checkType(null, { kind: 'string' })).toBe(false)

      // Test typeToString
      expect(module.typeToString({ kind: 'string' })).toBe('string')
      expect(module.typeToString({ kind: 'number' })).toBe('number')
      expect(
        module.typeToString({ kind: 'array', items: { kind: 'string' } })
      ).toBe('string[]')
      expect(module.typeToString({ kind: 'string', nullable: true })).toBe(
        'string | null'
      )

      const testTime = performance.now() - testStart
      const totalTime = performance.now() - start

      console.log(`\n  Bootstrap inference.ts:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Execute:   ${execTime.toFixed(2)}ms`)
      console.log(`    Test:      ${testTime.toFixed(2)}ms`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)
    })

    it('should bootstrap parser.ts core functions', () => {
      const start = performance.now()

      // Read the source
      const sourcePath = path.join(import.meta.dir, '../lang/parser.ts')
      const source = fs.readFileSync(sourcePath, 'utf-8')

      // Transpile with TJS
      const transpileStart = performance.now()
      const result = fromTS(source)
      const transpileTime = performance.now() - transpileStart

      expect(result.code).toBeTruthy()

      // The parser has dependencies, so we test that it transpiles correctly
      // and the output looks sane
      expect(result.code).toContain('function')
      expect(result.code).toContain('preprocess')

      const totalTime = performance.now() - start
      console.log(`\n  Bootstrap parser.ts:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)
      console.log(`    Output:    ${(result.code.length / 1024).toFixed(1)}KB`)
    })

    it('should bootstrap docs.ts and execute it', () => {
      const start = performance.now()

      // Read the source
      const sourcePath = path.join(import.meta.dir, '../lang/docs.ts')
      const source = fs.readFileSync(sourcePath, 'utf-8')

      // Transpile with TJS
      const transpileStart = performance.now()
      const result = fromTS(source)
      const transpileTime = performance.now() - transpileStart

      expect(result.code).toBeTruthy()

      // Execute - docs.ts has self-contained functions
      // Strip imports/exports for standalone execution
      const execStart = performance.now()
      const strippedCode = result.code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+/gm, '')
      const module = new Function(`
        ${strippedCode}
        return { generateDocs };
      `)()
      const execTime = performance.now() - execStart

      // Test the bootstrapped docs functions
      const testStart = performance.now()

      // Test generateDocs
      const docs = module.generateDocs(`
        /*#
        # Math Functions
        Basic arithmetic operations.
        */

        function add(a: 0, b: 0) -> 0 {
          return a + b
        }

        function multiply(x: 1, y: 1) -> 1 {
          return x * y
        }
      `)
      expect(docs).toBeDefined()
      expect(docs.items).toBeDefined()
      expect(docs.items.length).toBeGreaterThan(0)
      expect(docs.markdown).toContain('Math Functions')
      expect(docs.markdown).toContain('function add')

      const testTime = performance.now() - testStart
      const totalTime = performance.now() - start

      console.log(`\n  Bootstrap docs.ts:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Execute:   ${execTime.toFixed(2)}ms`)
      console.log(`    Test:      ${testTime.toFixed(2)}ms`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)
    })
  })

  describe('TJS transpiles and runs its own test code', () => {
    it('should transpile and execute a TJS test file', () => {
      const start = performance.now()

      // A self-contained TJS test
      const tjsSource = `
        function add(a: 0, b: 0) -> 0 {
          return a + b
        }
        /* @test add(1, 2) is 3 */
        /* @test add(-1, 1) is 0 */
        /* @test add(0, 0) is 0 */

        function greet(name: 'World') -> 'Hello, World!' {
          return 'Hello, ' + name + '!'
        }
        /* @test greet('TJS') is 'Hello, TJS!' */
        /* @test greet('Bootstrap') is 'Hello, Bootstrap!' */
      `

      // Transpile with tests
      const transpileStart = performance.now()
      const result = tjs(tjsSource, { runTests: 'report' })
      const transpileTime = performance.now() - transpileStart

      expect(result.code).toBeTruthy()
      expect(result.testResults).toBeDefined()

      // Count results
      const passed = result.testResults!.filter((r) => r.passed).length
      const failed = result.testResults!.filter((r) => !r.passed).length

      const totalTime = performance.now() - start

      console.log(`\n  Bootstrap TJS test execution:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Tests:     ${passed} passed, ${failed} failed`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)

      // All tests should pass
      expect(failed).toBe(0)
      expect(passed).toBeGreaterThan(0)
    })
  })

  describe('Full bootstrap benchmark', () => {
    it('should transpile all TJS lang modules', () => {
      const langDir = path.join(import.meta.dir, '../lang')
      const files = fs
        .readdirSync(langDir)
        .filter(
          (f) =>
            f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts')
        )

      const results: {
        file: string
        time: number
        size: number
        success: boolean
        error?: string
      }[] = []

      const totalStart = performance.now()

      for (const file of files) {
        const filePath = path.join(langDir, file)
        const source = fs.readFileSync(filePath, 'utf-8')

        const start = performance.now()
        try {
          const result = fromTS(source)
          const time = performance.now() - start
          results.push({
            file,
            time,
            size: result.code.length,
            success: true,
          })
        } catch (e: any) {
          const time = performance.now() - start
          results.push({
            file,
            time,
            size: 0,
            success: false,
            error: e.message,
          })
        }
      }

      const totalTime = performance.now() - totalStart

      // Report
      console.log(`\n  Full bootstrap - ${files.length} files:`)
      console.log(
        `  ${'File'.padEnd(25)} ${'Time'.padStart(10)} ${'Size'.padStart(
          10
        )} Status`
      )
      console.log(`  ${'-'.repeat(60)}`)

      for (const r of results) {
        const status = r.success ? '✓' : `✗ ${r.error?.slice(0, 30)}`
        console.log(
          `  ${r.file.padEnd(25)} ${(r.time.toFixed(1) + 'ms').padStart(10)} ${(
            (r.size / 1024).toFixed(1) + 'KB'
          ).padStart(10)} ${status}`
        )
      }

      console.log(`  ${'-'.repeat(60)}`)
      console.log(
        `  ${'TOTAL'.padEnd(25)} ${(totalTime.toFixed(1) + 'ms').padStart(10)}`
      )

      // All should succeed
      const failures = results.filter((r) => !r.success)
      expect(failures.length).toBe(0)
    })
  })
})
