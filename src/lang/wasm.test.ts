/**
 * WASM Compiler Tests
 */

import { describe, it, expect } from 'bun:test'
import { compileToWasm, instantiateWasm, registerWasmBlock } from './wasm'
import type { WasmBlock } from './parser'

describe('WASM Compiler', () => {
  describe('compileToWasm', () => {
    it('should compile a simple return expression', () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_1',
        body: 'return x',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)
      expect(result.bytes.length).toBeGreaterThan(0)
      // Check WASM magic number
      expect(result.bytes[0]).toBe(0x00)
      expect(result.bytes[1]).toBe(0x61) // 'a'
      expect(result.bytes[2]).toBe(0x73) // 's'
      expect(result.bytes[3]).toBe(0x6d) // 'm'
    })

    it('should compile addition', () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_2',
        body: 'return a + b',
        captures: ['a', 'b'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)
    })

    it('should compile multiplication', () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_3',
        body: 'return x * 2',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)
    })

    it('should compile complex expressions', () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_4',
        body: 'return a * b + c',
        captures: ['a', 'b', 'c'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)
    })

    it('should fail without return statement', () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_5',
        body: 'x * 2',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(false)
      expect(result.error).toContain('return')
    })
  })

  describe('instantiateWasm', () => {
    it('should instantiate compiled WASM', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_inst',
        body: 'return x',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      expect(instance.exports.compute).toBeDefined()
    })

    it('should compute identity function', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_identity',
        body: 'return x',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (x: number) => number

      expect(compute(42)).toBe(42)
      expect(compute(3.14)).toBeCloseTo(3.14)
      expect(compute(-100)).toBe(-100)
    })

    it('should compute addition', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_add',
        body: 'return a + b',
        captures: ['a', 'b'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (
        a: number,
        b: number
      ) => number

      expect(compute(2, 3)).toBe(5)
      expect(compute(10, -5)).toBe(5)
      expect(compute(1.5, 2.5)).toBe(4)
    })

    it('should compute subtraction', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_sub',
        body: 'return a - b',
        captures: ['a', 'b'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (
        a: number,
        b: number
      ) => number

      expect(compute(10, 3)).toBe(7)
      expect(compute(5, 10)).toBe(-5)
    })

    it('should compute multiplication', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_mul',
        body: 'return x * 2',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (x: number) => number

      expect(compute(5)).toBe(10)
      expect(compute(3.5)).toBe(7)
    })

    it('should compute division', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_div',
        body: 'return a / b',
        captures: ['a', 'b'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (
        a: number,
        b: number
      ) => number

      expect(compute(10, 2)).toBe(5)
      expect(compute(7, 2)).toBe(3.5)
    })

    it('should compute complex expression', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_complex',
        body: 'return a * b + c',
        captures: ['a', 'b', 'c'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (
        a: number,
        b: number,
        c: number
      ) => number

      // a * b + c = 2 * 3 + 4 = 10
      expect(compute(2, 3, 4)).toBe(10)
    })

    it('should compute parenthesized expression', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_parens',
        body: 'return a * (b + c)',
        captures: ['a', 'b', 'c'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (
        a: number,
        b: number,
        c: number
      ) => number

      // a * (b + c) = 2 * (3 + 4) = 14
      expect(compute(2, 3, 4)).toBe(14)
    })
  })

  describe('registerWasmBlock', () => {
    it('should register WASM function globally', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_register',
        body: 'return x * 3',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const success = await registerWasmBlock(block)
      expect(success).toBe(true)

      // Should be callable from globalThis
      const fn = (globalThis as any).__tjs_wasm_test_register
      expect(fn).toBeDefined()
      expect(fn(10)).toBe(30)

      // Cleanup
      delete (globalThis as any).__tjs_wasm_test_register
    })
  })

  describe('performance comparison', () => {
    it('WASM should be faster for numeric computation', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_perf',
        body: 'return x * x + x',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      // Compile WASM
      const result = compileToWasm(block)
      const instance = await instantiateWasm(result.bytes)
      const wasmFn = instance.exports.compute as (x: number) => number

      // JS version
      const jsFn = (x: number) => x * x + x

      // Verify correctness
      expect(wasmFn(5)).toBe(jsFn(5))
      expect(wasmFn(10)).toBe(jsFn(10))

      const iterations = 1_000_000

      // Warmup
      for (let i = 0; i < 1000; i++) {
        wasmFn(i)
        jsFn(i)
      }

      // Time WASM
      const wasmStart = performance.now()
      let wasmSum = 0
      for (let i = 0; i < iterations; i++) {
        wasmSum += wasmFn(i)
      }
      const wasmTime = performance.now() - wasmStart

      // Time JS
      const jsStart = performance.now()
      let jsSum = 0
      for (let i = 0; i < iterations; i++) {
        jsSum += jsFn(i)
      }
      const jsTime = performance.now() - jsStart

      // Results should be the same
      expect(wasmSum).toBe(jsSum)

      // Log performance (don't assert - varies by environment)
      console.log(`\nPerformance (${iterations.toLocaleString()} iterations):`)
      console.log(`  WASM: ${wasmTime.toFixed(2)}ms`)
      console.log(`  JS:   ${jsTime.toFixed(2)}ms`)
      console.log(`  Ratio: ${(jsTime / wasmTime).toFixed(2)}x`)

      // WASM should at least not be dramatically slower
      // (In many cases it will be faster, but JIT can be competitive)
      expect(wasmTime).toBeLessThan(jsTime * 5) // Allow up to 5x slower (conservative)
    })
  })
})
