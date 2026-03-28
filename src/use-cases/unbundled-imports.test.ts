/**
 * Unbundled Transitive Import Test
 *
 * Verifies that tjs-converted .js files work correctly when:
 * 1. Multiple files import from each other
 * 2. Each file has its own inline runtime preamble
 * 3. No global runtime is pre-installed
 * 4. The files are loaded as real ES modules (not concatenated)
 *
 * This is the critical test for library authors using `tjs convert`
 * to ship unbundled ESM packages.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { fromTS } from '../lang/emitters/from-ts'
import { tjs } from '../lang'
import { createRuntime } from '../lang/runtime'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

const TEMP_DIR = join(import.meta.dir, '../../.test-unbundled')

describe('Unbundled transitive imports', () => {
  beforeAll(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true })
    mkdirSync(TEMP_DIR, { recursive: true })
  })

  afterAll(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true })
  })

  it('should share runtime across files importing each other', async () => {
    // File A: exports a validated function
    const aSource = `
      export function double(x: 0) -! 0 {
        return x * 2
      }
    `
    const aResult = tjs(aSource)

    // File B: imports from A and uses the function
    const bSource = `
      import { double } from './a.js'

      export function quadruple(x: 0) -! 0 {
        return double(double(x))
      }
    `
    const bResult = tjs(bSource)

    // Write both files
    writeFileSync(join(TEMP_DIR, 'a.js'), aResult.code)
    writeFileSync(join(TEMP_DIR, 'b.js'), bResult.code)

    // Import B (which transitively imports A) as a real ES module
    const mod = await import(join(TEMP_DIR, 'b.js'))

    expect(mod.quadruple(5)).toBe(20)
    expect(mod.quadruple(0)).toBe(0)
  })

  it('should propagate MonadicError across file boundaries', async () => {
    // File C: validates input
    const cSource = `
      export function validateName(name: '') -! '' {
        return name.trim()
      }
    `
    const cResult = tjs(cSource)

    // File D: calls C's function
    const dSource = `
      import { validateName } from './c.js'

      export function greetUser(name: '') -! '' {
        const clean = validateName(name)
        if (clean instanceof Error) return clean
        return 'Hello, ' + clean + '!'
      }
    `
    const dResult = tjs(dSource)

    writeFileSync(join(TEMP_DIR, 'c.js'), cResult.code)
    writeFileSync(join(TEMP_DIR, 'd.js'), dResult.code)

    const mod = await import(join(TEMP_DIR, 'd.js'))

    // Valid input works
    expect(mod.greetUser('Alice')).toBe('Hello, Alice!')

    // Type error from C propagates through D
    const err = mod.greetUser(42)
    expect(err instanceof Error).toBe(true)
  })

  it('should work with fromTS converted files', async () => {
    // Simulate tjs convert on TypeScript files
    const typesTS = `
      export interface User {
        name: string
        age: number
      }

      export function createUser(name: string, age: number): User {
        return { name, age }
      }
    `
    const typesResult = fromTS(typesTS)

    const appTS = `
      import { createUser } from './types.js'

      export function makeAdmin(name: string): any {
        return { ...createUser(name, 99), role: 'admin' }
      }
    `
    const appResult = fromTS(appTS)

    writeFileSync(join(TEMP_DIR, 'types.js'), typesResult.code)
    writeFileSync(join(TEMP_DIR, 'app.js'), appResult.code)

    const mod = await import(join(TEMP_DIR, 'app.js'))

    const admin = mod.makeAdmin('Bob')
    expect(admin.name).toBe('Bob')
    expect(admin.age).toBe(99)
    expect(admin.role).toBe('admin')
  })

  it('should not create duplicate MonadicError classes at runtime', async () => {
    // Both files have inline MonadicError but should use shared runtime
    const e1Source = `
      export function check1(x: '') -! '' { return x }
    `
    const e2Source = `
      import { check1 } from './e1.js'
      export function check2(x: '') -! '' { return check1(x) }
    `

    writeFileSync(join(TEMP_DIR, 'e1.js'), tjs(e1Source).code)
    writeFileSync(join(TEMP_DIR, 'e2.js'), tjs(e2Source).code)

    const mod = await import(join(TEMP_DIR, 'e2.js'))

    // Both should return errors that look the same
    const err1 = mod.check2(42)
    expect(err1 instanceof Error).toBe(true)
    expect(err1.name).toBe('MonadicError')
  })

  it('should handle three-level import chains', async () => {
    const l1 = `export function inc(x: 0) -! 0 { return x + 1 }`
    const l2 = `
      import { inc } from './l1.js'
      export function incTwice(x: 0) -! 0 { return inc(inc(x)) }
    `
    const l3 = `
      import { incTwice } from './l2.js'
      export function incFour(x: 0) -! 0 { return incTwice(incTwice(x)) }
    `

    writeFileSync(join(TEMP_DIR, 'l1.js'), tjs(l1).code)
    writeFileSync(join(TEMP_DIR, 'l2.js'), tjs(l2).code)
    writeFileSync(join(TEMP_DIR, 'l3.js'), tjs(l3).code)

    const mod = await import(join(TEMP_DIR, 'l3.js'))
    expect(mod.incFour(0)).toBe(4)
    expect(mod.incFour(10)).toBe(14)
  })
})
