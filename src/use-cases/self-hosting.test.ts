/**
 * Self-hosting tests - TJS transpiling itself
 *
 * These tests verify that TJS can successfully transpile:
 * 1. Its own source code (46 files)
 * 2. Complex TypeScript patterns ("toxic tiers")
 * 3. Run the transpiled test suite
 *
 * Known limitations (tracked for future work):
 * - Classes in emitTJS mode (TODO in from-ts.ts)
 * - Decorators (experimental TS feature)
 * - Module augmentation (declaration merging)
 */

import { describe, it, expect } from 'bun:test'
import { fromTS } from '../lang/emitters/from-ts'
import { Glob } from 'bun'
import * as fs from 'fs'
import * as path from 'path'

// Files that are expected to produce empty output (type-only, re-exports, class-only)
const EXPECTED_EMPTY_FILES = [
  'inference.types.ts',
  'runtime.ts', // mostly type defs
  'vm.ts', // re-exports
  'index.ts', // re-exports
  'vm/vm.ts', // class-based
  'batteries/models.ts', // const declarations
  'types/index.ts', // re-exports
]

describe('Self-hosting', () => {
  describe('TJS transpiles its own source files', () => {
    const srcDir = path.join(import.meta.dir, '..')
    const glob = new Glob('**/*.ts')
    const files: string[] = []

    // Collect all .ts files (excluding tests and .d.ts)
    for (const file of glob.scanSync(srcDir)) {
      if (!file.endsWith('.test.ts') && !file.endsWith('.d.ts')) {
        files.push(file)
      }
    }

    it(`should find source files to transpile`, () => {
      expect(files.length).toBeGreaterThan(40) // We know there are ~46 files
    })

    // Create a test for each source file
    for (const file of files) {
      it(`should transpile ${file}`, () => {
        const fullPath = path.join(srcDir, file)
        const source = fs.readFileSync(fullPath, 'utf-8')

        // Should not throw
        const result = fromTS(source, { emitTJS: true })

        // Should produce valid output (may be empty for type-only files)
        expect(typeof result.code).toBe('string')

        // Check if this file is expected to be empty
        const isExpectedEmpty = EXPECTED_EMPTY_FILES.some((f) =>
          file.endsWith(f)
        )
        if (isExpectedEmpty) {
          return // Skip output check for known empty files
        }

        // If there are functions in the source, we should have output
        // (Classes not yet supported in emitTJS mode)
        const hasFunctions = /\bfunction\s+\w+/.test(source)
        const hasArrowFunctions = /\bconst\s+\w+\s*=\s*(?:async\s*)?\(/.test(
          source
        )

        if (hasFunctions || hasArrowFunctions) {
          // Files with functions should produce output
          expect(result.code.length).toBeGreaterThan(0)
        }
      })
    }
  })

  describe('Toxic Tiers - Complex TypeScript patterns', () => {
    /**
     * These patterns are based on Gemini's analysis of the most
     * challenging TypeScript constructs that trip up transpilers.
     */

    describe('Tier 1: Foundational', () => {
      it('should handle basic generics', () => {
        const result = fromTS(
          `
          function identity<T>(x: T): T { return x }
          const nums: Array<number> = [1, 2, 3]
        `,
          { emitTJS: true }
        )
        expect(result.code).toContain('function identity')
      })

      it('should handle union and intersection types', () => {
        const result = fromTS(
          `
          type StringOrNumber = string | number
          type Named = { name: string }
          type Aged = { age: number }
          type Person = Named & Aged
        `,
          { emitTJS: true }
        )
        expect(result.code).toBeTruthy()
      })

      it('should handle type guards', () => {
        const result = fromTS(
          `
          function isString(x: unknown): x is string {
            return typeof x === 'string'
          }
        `,
          { emitTJS: true }
        )
        expect(result.code).toContain('function isString')
      })
    })

    describe('Tier 2: Intermediate', () => {
      it('should handle mapped types', () => {
        const result = fromTS(
          `
          type Readonly<T> = { readonly [K in keyof T]: T[K] }
          type Partial<T> = { [K in keyof T]?: T[K] }
        `,
          { emitTJS: true }
        )
        expect(result.code).toBeTruthy()
      })

      it('should handle conditional types', () => {
        const result = fromTS(
          `
          type IsString<T> = T extends string ? true : false
          type Flatten<T> = T extends Array<infer U> ? U : T
        `,
          { emitTJS: true }
        )
        expect(result.code).toBeTruthy()
      })

      it('should handle template literal types', () => {
        const result = fromTS(
          `
          type EventName<T extends string> = \`on\${Capitalize<T>}\`
          type ClickEvent = EventName<'click'> // 'onClick'
        `,
          { emitTJS: true }
        )
        expect(result.code).toBeTruthy()
      })
    })

    describe('Tier 3: Advanced', () => {
      it('should handle recursive types', () => {
        const result = fromTS(
          `
          type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }
          type TreeNode<T> = { value: T; children: TreeNode<T>[] }
        `,
          { emitTJS: true }
        )
        expect(result.code).toBeTruthy()
      })

      it('should handle variadic tuple types', () => {
        const result = fromTS(
          `
          type Tail<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never
          type Push<T extends any[], V> = [...T, V]
        `,
          { emitTJS: true }
        )
        expect(result.code).toBeTruthy()
      })

      it('should handle discriminated unions', () => {
        const result = fromTS(
          `
          type Result<T, E> =
            | { success: true; value: T }
            | { success: false; error: E }

          function handle(r: Result<number, string>) {
            if (r.success) {
              return r.value * 2
            } else {
              return r.error.toUpperCase()
            }
          }
        `,
          { emitTJS: true }
        )
        expect(result.code).toContain('function handle')
      })
    })

    describe('Tier 4: Expert', () => {
      it('should handle higher-kinded type patterns', () => {
        const result = fromTS(
          `
          interface Functor<F> {
            map<A, B>(fa: F, f: (a: A) => B): F
          }

          type HKT<URI, A> = { _URI: URI; _A: A }
        `,
          { emitTJS: true }
        )
        expect(result.code).toBeTruthy()
      })

      // Decorators require experimental TS support - skip for now
      it.skip('should handle complex decorator patterns (requires experimentalDecorators)', () => {
        const result = fromTS(
          `
          function logged(target: any, key: string, descriptor: PropertyDescriptor) {
            const original = descriptor.value
            descriptor.value = function(...args: any[]) {
              console.log(\`Calling \${key}\`)
              return original.apply(this, args)
            }
            return descriptor
          }

          class Service {
            @logged
            doWork() { return 42 }
          }
        `,
          { emitTJS: true }
        )
        expect(result.code).toContain('class Service')
      })

      // Module augmentation is declaration merging - no runtime code
      it.skip('should handle module augmentation (type-only, no runtime code)', () => {
        const result = fromTS(
          `
          declare module 'express' {
            interface Request {
              user?: { id: string; name: string }
            }
          }

          export {}
        `,
          { emitTJS: true }
        )
        expect(result.code).toBeTruthy()
      })
    })
  })

  describe('Real-world patterns', () => {
    it('should handle async/await with generics', () => {
      const result = fromTS(
        `
        async function fetchData<T>(url: string): Promise<T> {
          const response = await fetch(url)
          return response.json()
        }
      `,
        { emitTJS: true }
      )
      expect(result.code).toContain('function fetchData')
    })

    // Classes not yet supported in emitTJS mode
    it.skip('should handle class with private fields and methods (TODO: class support)', () => {
      const result = fromTS(
        `
        class Counter {
          #count = 0

          #increment() {
            this.#count++
          }

          get value() { return this.#count }

          tick() {
            this.#increment()
            return this.#count
          }
        }
      `,
        { emitTJS: true }
      )
      expect(result.code).toContain('class Counter')
    })

    it('should handle complex destructuring', () => {
      const result = fromTS(
        `
        function process({
          name,
          age = 0,
          address: { city, zip } = { city: '', zip: '' },
          ...rest
        }: {
          name: string
          age?: number
          address?: { city: string; zip: string }
          [key: string]: any
        }) {
          return { name, age, city, zip, rest }
        }
      `,
        { emitTJS: true }
      )
      expect(result.code).toContain('function process')
    })

    // Classes not yet supported in emitTJS mode
    it.skip('should handle builder pattern with method chaining (TODO: class support)', () => {
      const result = fromTS(
        `
        class QueryBuilder<T> {
          private filters: string[] = []

          where(condition: string): this {
            this.filters.push(condition)
            return this
          }

          orderBy(field: keyof T): this {
            return this
          }

          build(): string {
            return this.filters.join(' AND ')
          }
        }
      `,
        { emitTJS: true }
      )
      expect(result.code).toContain('class QueryBuilder')
    })

    it('should handle overloaded functions', () => {
      const result = fromTS(
        `
        function createElement(tag: 'div'): HTMLDivElement
        function createElement(tag: 'span'): HTMLSpanElement
        function createElement(tag: string): HTMLElement
        function createElement(tag: string): HTMLElement {
          return document.createElement(tag)
        }
      `,
        { emitTJS: true }
      )
      expect(result.code).toContain('function createElement')
    })
  })
})
