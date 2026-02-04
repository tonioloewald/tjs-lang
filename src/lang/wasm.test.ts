/**
 * WASM Compiler Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  compileToWasm,
  instantiateWasm,
  registerWasmBlock,
  createWasmFunction,
} from './wasm'
import type { WasmBlock } from './parser'

describe('WASM Compiler', () => {
  describe('compileToWasm - basic expressions', () => {
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

    it('should include WAT disassembly in result', () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_test_wat',
        body: 'return a + b',
        captures: ['a', 'b'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)
      expect(result.wat).toBeDefined()
      expect(result.wat).toContain('(func (export "compute")')
      expect(result.wat).toContain('(param $a f64)')
      expect(result.wat).toContain('(param $b f64)')
      expect(result.wat).toContain('f64.add')
      expect(result.wat).toContain('local.get $a')
      expect(result.wat).toContain('local.get $b')
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
  })

  describe('instantiateWasm - basic functions', () => {
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

  describe('for loops', () => {
    it('should compile a simple for loop', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_for_simple',
        body: `
          let sum = 0
          for (let i = 0; i < n; i++) {
            sum = sum + i
          }
          return sum
        `,
        captures: ['n: i32'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (n: number) => number

      // Sum of 0..4 = 0+1+2+3+4 = 10
      expect(compute(5)).toBe(10)
      // Sum of 0..9 = 45
      expect(compute(10)).toBe(45)
    })

    it('should compile nested for loops', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_for_nested',
        body: `
          let sum = 0
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < m; j++) {
              sum = sum + 1
            }
          }
          return sum
        `,
        captures: ['n: i32', 'm: i32'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (
        n: number,
        m: number
      ) => number

      expect(compute(3, 4)).toBe(12)
      expect(compute(5, 5)).toBe(25)
    })
  })

  describe('Math functions', () => {
    it('should compile Math.sqrt', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_sqrt',
        body: 'return Math.sqrt(x)',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (x: number) => number

      expect(compute(4)).toBe(2)
      expect(compute(9)).toBe(3)
      expect(compute(2)).toBeCloseTo(1.41421356, 5)
    })

    it('should compile Math.abs', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_abs',
        body: 'return Math.abs(x)',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (x: number) => number

      expect(compute(-5)).toBe(5)
      expect(compute(5)).toBe(5)
      expect(compute(-3.14)).toBeCloseTo(3.14)
    })

    it('should compile Math.floor', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_floor',
        body: 'return Math.floor(x)',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (x: number) => number

      expect(compute(3.7)).toBe(3)
      expect(compute(-3.7)).toBe(-4)
    })

    it('should compile Math.ceil', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_ceil',
        body: 'return Math.ceil(x)',
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (x: number) => number

      expect(compute(3.2)).toBe(4)
      expect(compute(-3.2)).toBe(-3)
    })

    it('should compile Math.min', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_min',
        body: 'return Math.min(a, b)',
        captures: ['a', 'b'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (
        a: number,
        b: number
      ) => number

      expect(compute(3, 7)).toBe(3)
      expect(compute(7, 3)).toBe(3)
    })

    it('should compile Math.max', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_max',
        body: 'return Math.max(a, b)',
        captures: ['a', 'b'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (
        a: number,
        b: number
      ) => number

      expect(compute(3, 7)).toBe(7)
      expect(compute(7, 3)).toBe(7)
    })
  })

  describe('typed arrays', () => {
    it('should compile Float32Array access', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_f32_access',
        body: 'return arr[0]',
        captures: ['arr: Float32Array'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)
      expect(result.needsMemory).toBe(true)
    })

    it('should read from Float32Array', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_f32_read',
        body: 'return arr[i]',
        captures: ['arr: Float32Array', 'i: i32'],
        start: 0,
        end: 0,
      }

      const { fn, success, error } = await createWasmFunction(block)
      expect(success).toBe(true)
      if (error) console.error(error)

      const arr = new Float32Array([1.5, 2.5, 3.5, 4.5])
      expect(fn(arr, 0)).toBeCloseTo(1.5, 5)
      expect(fn(arr, 2)).toBeCloseTo(3.5, 5)
    })

    it('should write to Float32Array', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_f32_write',
        body: `
          arr[i] = value
          return arr[i]
        `,
        captures: ['arr: Float32Array', 'i: i32', 'value'],
        start: 0,
        end: 0,
      }

      const { fn, success, error } = await createWasmFunction(block)
      expect(success).toBe(true)
      if (error) console.error(error)

      const arr = new Float32Array([0, 0, 0, 0])
      fn(arr, 1, 42.5)
      expect(arr[1]).toBeCloseTo(42.5, 5)
    })

    it('should process array with loop', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_array_loop',
        body: `
          let sum = 0
          for (let i = 0; i < len; i++) {
            sum = sum + arr[i]
          }
          return sum
        `,
        captures: ['arr: Float32Array', 'len: i32'],
        start: 0,
        end: 0,
      }

      const { fn, success, error } = await createWasmFunction(block)
      expect(success).toBe(true)
      if (error) console.error(error)

      const arr = new Float32Array([1, 2, 3, 4, 5])
      expect(fn(arr, 5)).toBeCloseTo(15, 5)
    })

    it('should double array values in place', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_double_array',
        body: `
          for (let i = 0; i < len; i++) {
            arr[i] = arr[i] * 2
          }
          return 0
        `,
        captures: ['arr: Float32Array', 'len: i32'],
        start: 0,
        end: 0,
      }

      const { fn, success, error } = await createWasmFunction(block)
      expect(success).toBe(true)
      if (error) console.error(error)

      const arr = new Float32Array([1, 2, 3, 4, 5])
      fn(arr, 5)
      expect(arr[0]).toBeCloseTo(2, 5)
      expect(arr[1]).toBeCloseTo(4, 5)
      expect(arr[4]).toBeCloseTo(10, 5)
    })
  })

  describe('conditionals', () => {
    it('should compile if statement', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_if',
        body: `
          let result = 0
          if (x > 0) {
            result = 1
          }
          return result
        `,
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (x: number) => number

      expect(compute(5)).toBe(1)
      expect(compute(-5)).toBe(0)
    })

    it('should compile if-else statement', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_if_else',
        body: `
          let result = 0
          if (x > 0) {
            result = 1
          } else {
            result = -1
          }
          return result
        `,
        captures: ['x'],
        start: 0,
        end: 0,
      }

      const result = compileToWasm(block)
      expect(result.success).toBe(true)

      const instance = await instantiateWasm(result.bytes)
      const compute = instance.exports.compute as (x: number) => number

      expect(compute(5)).toBe(1)
      expect(compute(-5)).toBe(-1)
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
    it('WASM should be competitive for numeric computation', async () => {
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
      expect(wasmTime).toBeLessThan(jsTime * 5)
    })

    it('WASM should be faster for array processing', async () => {
      const block: WasmBlock = {
        id: '__tjs_wasm_array_perf',
        body: `
          let sum = 0.0
          for (let i = 0; i < len; i++) {
            sum = sum + arr[i] * arr[i]
          }
          return sum
        `,
        captures: ['arr: Float32Array', 'len: i32'],
        start: 0,
        end: 0,
      }

      const { fn: wasmFn, success } = await createWasmFunction(block)
      expect(success).toBe(true)

      // JS version
      const jsFn = (arr: Float32Array, len: number) => {
        let sum = 0
        for (let i = 0; i < len; i++) {
          sum += arr[i] * arr[i]
        }
        return sum
      }

      const size = 10000
      const arr = new Float32Array(size)
      for (let i = 0; i < size; i++) {
        arr[i] = Math.random()
      }

      // Verify correctness (approximate due to float precision)
      const wasmResult = wasmFn(arr, size)
      const jsResult = jsFn(arr, size)
      expect(Math.abs(wasmResult - jsResult)).toBeLessThan(1)

      const iterations = 1000

      // Warmup
      for (let i = 0; i < 10; i++) {
        wasmFn(arr, size)
        jsFn(arr, size)
      }

      // Time WASM
      const wasmStart = performance.now()
      for (let i = 0; i < iterations; i++) {
        wasmFn(arr, size)
      }
      const wasmTime = performance.now() - wasmStart

      // Time JS
      const jsStart = performance.now()
      for (let i = 0; i < iterations; i++) {
        jsFn(arr, size)
      }
      const jsTime = performance.now() - jsStart

      console.log(
        `\nArray processing (${size} elements, ${iterations} iterations):`
      )
      console.log(`  WASM: ${wasmTime.toFixed(2)}ms`)
      console.log(`  JS:   ${jsTime.toFixed(2)}ms`)
      console.log(`  Ratio: ${(jsTime / wasmTime).toFixed(2)}x`)
    })
  })

  // ============================================================================
  // MICRO-TESTS: Each WASM feature tested in isolation
  // ============================================================================

  describe('micro-tests: locals', () => {
    it('should read a local variable', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_local_read',
        body: 'return x',
        captures: ['x'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      expect(fn(42)).toBe(42)
    })

    it('should write and read a local variable', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_local_write',
        body: `
          let y = x * 2
          return y
        `,
        captures: ['x'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      expect(fn(21)).toBe(42)
    })

    it('should reassign a local variable', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_local_reassign',
        body: `
          let y = 10
          y = 20
          return y
        `,
        captures: [],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      expect(fn()).toBe(20)
    })
  })

  describe('micro-tests: if statements', () => {
    it('should handle if with local assignment', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_if_local',
        body: `
          let result = 0
          if (x < 10) {
            result = 1
          }
          return result
        `,
        captures: ['x'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      expect(fn(5)).toBe(1)
      expect(fn(15)).toBe(0)
    })

    it('should handle if-else with local assignment', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_if_else_local',
        body: `
          let result = 0
          if (x < 10) {
            result = 1
          } else {
            result = 2
          }
          return result
        `,
        captures: ['x'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      expect(fn(5)).toBe(1)
      expect(fn(15)).toBe(2)
    })

    it('should handle empty if body', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_if_empty',
        body: `
          if (x < 10) {
          }
          return x
        `,
        captures: ['x'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      expect(fn(5)).toBe(5)
    })
  })

  describe('micro-tests: for loops', () => {
    it('should handle simple for loop', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_for_simple',
        body: `
          let sum = 0
          for (let i = 0; i < n; i++) {
            sum = sum + 1
          }
          return sum
        `,
        captures: ['n: i32'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      expect(fn(5)).toBe(5)
      expect(fn(10)).toBe(10)
    })

    it('should handle for loop with multiplication', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_for_mult',
        body: `
          let product = 1
          for (let i = 0; i < n; i++) {
            product = product * 2
          }
          return product
        `,
        captures: ['n: i32'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      expect(fn(3)).toBe(8) // 2^3
      expect(fn(4)).toBe(16) // 2^4
    })
  })

  describe('micro-tests: array read', () => {
    it('should read from Float32Array at index 0', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_arr_read_0',
        body: 'return arr[0]',
        captures: ['arr: Float32Array'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      const arr = new Float32Array([42.5, 0, 0])
      expect(fn(arr)).toBeCloseTo(42.5, 4)
    })

    it('should read from Float32Array at variable index', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_arr_read_i',
        body: 'return arr[i]',
        captures: ['arr: Float32Array', 'i: i32'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      const arr = new Float32Array([10, 20, 30, 40])
      expect(fn(arr, 0)).toBeCloseTo(10, 4)
      expect(fn(arr, 2)).toBeCloseTo(30, 4)
    })
  })

  describe('micro-tests: array write (simple assignment)', () => {
    it('should write to Float32Array at index 0', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_arr_write_0',
        body: `
          arr[0] = 99.5
          return arr[0]
        `,
        captures: ['arr: Float32Array'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      if (error) console.error(error)
      const arr = new Float32Array([0, 0, 0])
      const result = fn(arr)
      expect(arr[0]).toBeCloseTo(99.5, 4)
      expect(result).toBeCloseTo(99.5, 4)
    })

    it('should write to Float32Array at variable index', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_arr_write_i',
        body: `
          arr[i] = value
          return arr[i]
        `,
        captures: ['arr: Float32Array', 'i: i32', 'value'],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      if (error) console.error(error)
      const arr = new Float32Array([0, 0, 0, 0])
      fn(arr, 2, 77.5)
      expect(arr[2]).toBeCloseTo(77.5, 4)
    })
  })

  describe('micro-tests: array write in if block', () => {
    it('should write to Float32Array inside if block', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_arr_write_if',
        body: `
          if (arr[0] < 1.0) {
            arr[0] = 10.0
          }
          return arr[0]
        `,
        captures: ['arr: Float32Array'],
        start: 0,
        end: 0,
      })
      if (error) console.error('Error:', error)
      expect(success).toBe(true)

      const arr1 = new Float32Array([0.5])
      expect(fn(arr1)).toBeCloseTo(10, 4)
      expect(arr1[0]).toBeCloseTo(10, 4)

      const arr2 = new Float32Array([5.0])
      expect(fn(arr2)).toBeCloseTo(5, 4)
    })

    it('should write to Float32Array inside if-else block', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_arr_write_if_else',
        body: `
          if (arr[0] < 1.0) {
            arr[0] = 10.0
          } else {
            arr[0] = 20.0
          }
          return arr[0]
        `,
        captures: ['arr: Float32Array'],
        start: 0,
        end: 0,
      })
      if (error) console.error('Error:', error)
      expect(success).toBe(true)

      const arr1 = new Float32Array([0.5])
      expect(fn(arr1)).toBeCloseTo(10, 4)

      const arr2 = new Float32Array([5.0])
      expect(fn(arr2)).toBeCloseTo(20, 4)
    })
  })

  describe('micro-tests: array write in for loop', () => {
    it('should write to Float32Array in for loop', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_arr_write_for',
        body: `
          for (let i = 0; i < len; i++) {
            arr[i] = 1.0
          }
          return 0
        `,
        captures: ['arr: Float32Array', 'len: i32'],
        start: 0,
        end: 0,
      })
      if (error) console.error('Error:', error)
      expect(success).toBe(true)

      const arr = new Float32Array([0, 0, 0, 0, 0])
      fn(arr, 5)
      expect(arr[0]).toBeCloseTo(1, 4)
      expect(arr[4]).toBeCloseTo(1, 4)
    })

    it('should double array values in for loop', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_arr_double_for',
        body: `
          for (let i = 0; i < len; i++) {
            arr[i] = arr[i] * 2.0
          }
          return 0
        `,
        captures: ['arr: Float32Array', 'len: i32'],
        start: 0,
        end: 0,
      })
      if (error) console.error('Error:', error)
      expect(success).toBe(true)

      const arr = new Float32Array([1, 2, 3, 4, 5])
      fn(arr, 5)
      expect(arr[0]).toBeCloseTo(2, 4)
      expect(arr[4]).toBeCloseTo(10, 4)
    })
  })

  describe('micro-tests: compound assignment', () => {
    it('should handle += on local', async () => {
      const { fn, success } = await createWasmFunction({
        id: '__micro_compound_local',
        body: `
          let x = 10
          x += 5
          return x
        `,
        captures: [],
        start: 0,
        end: 0,
      })
      expect(success).toBe(true)
      expect(fn()).toBe(15)
    })

    it('should handle += on array element', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_compound_arr',
        body: `
          arr[0] += 5.0
          return arr[0]
        `,
        captures: ['arr: Float32Array'],
        start: 0,
        end: 0,
      })
      if (error) console.error('Error:', error)
      expect(success).toBe(true)

      const arr = new Float32Array([10])
      expect(fn(arr)).toBeCloseTo(15, 4)
      expect(arr[0]).toBeCloseTo(15, 4)
    })

    it('should handle -= on array element', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_compound_arr_sub',
        body: `
          arr[0] -= 3.0
          return arr[0]
        `,
        captures: ['arr: Float32Array'],
        start: 0,
        end: 0,
      })
      if (error) console.error('Error:', error)
      expect(success).toBe(true)

      const arr = new Float32Array([10])
      expect(fn(arr)).toBeCloseTo(7, 4)
    })
  })

  describe('micro-tests: array write in if inside for loop', () => {
    it('should conditionally write to array in loop', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_arr_if_in_for',
        body: `
          for (let i = 0; i < len; i++) {
            if (arr[i] < 5.0) {
              arr[i] = 100.0
            }
          }
          return 0
        `,
        captures: ['arr: Float32Array', 'len: i32'],
        start: 0,
        end: 0,
      })
      if (error) console.error('Error:', error)
      expect(success).toBe(true)

      const arr = new Float32Array([1, 10, 2, 20, 3])
      fn(arr, 5)
      expect(arr[0]).toBeCloseTo(100, 4) // was < 5
      expect(arr[1]).toBeCloseTo(10, 4) // unchanged
      expect(arr[2]).toBeCloseTo(100, 4) // was < 5
      expect(arr[3]).toBeCloseTo(20, 4) // unchanged
      expect(arr[4]).toBeCloseTo(100, 4) // was < 5
    })
  })

  describe('micro-tests: void function (no return)', () => {
    it('should compile void function that modifies array in place', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_void_fn',
        body: `
          for (let i = 0; i < len; i++) {
            arr[i] = arr[i] + 1.0
          }
        `,
        captures: ['arr: Float32Array', 'len: i32'],
        start: 0,
        end: 0,
      })
      if (error) console.error('Error:', error)
      expect(success).toBe(true)

      const arr = new Float32Array([1, 2, 3, 4, 5])
      fn(arr, 5)
      expect(arr[0]).toBeCloseTo(2, 4)
      expect(arr[1]).toBeCloseTo(3, 4)
      expect(arr[2]).toBeCloseTo(4, 4)
      expect(arr[3]).toBeCloseTo(5, 4)
      expect(arr[4]).toBeCloseTo(6, 4)
    })

    it('should compile void function with if statement', async () => {
      const { fn, success, error } = await createWasmFunction({
        id: '__micro_void_if',
        body: `
          if (arr[0] < 10.0) {
            arr[0] = 99.0
          }
        `,
        captures: ['arr: Float32Array'],
        start: 0,
        end: 0,
      })
      if (error) console.error('Error:', error)
      expect(success).toBe(true)

      const arr = new Float32Array([5])
      fn(arr)
      expect(arr[0]).toBeCloseTo(99, 4)
    })
  })
})
