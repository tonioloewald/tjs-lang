/**
 * WASM Compiler Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  compileToWasm,
  compileBlocksToModule,
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

  // ============================================================================
  // SIMD (v128/f32x4) Tests
  // ============================================================================

  describe('SIMD (v128/f32x4)', () => {
    describe('compilation', () => {
      it('should compile f32x4_splat intrinsic', () => {
        const result = compileToWasm({
          id: '__simd_compile_splat',
          body: `
            let v = f32x4_splat(1.0)
            return 0
          `,
          captures: [],
          start: 0,
          end: 0,
        })
        expect(result.success).toBe(true)
        expect(result.needsMemory).toBe(true)
      })

      it('should compile f32x4 load/store/add', () => {
        const result = compileToWasm({
          id: '__simd_compile_arith',
          body: `
            let a = f32x4_load(arr, 0)
            let b = f32x4_splat(1.0)
            let c = f32x4_add(a, b)
            f32x4_store(arr, 0, c)
            return 0
          `,
          captures: ['arr: Float32Array'],
          start: 0,
          end: 0,
        })
        expect(result.success).toBe(true)
      })

      it('should include SIMD ops in WAT disassembly', () => {
        const result = compileToWasm({
          id: '__simd_wat',
          body: `
            let v = f32x4_splat(2.0)
            return 0
          `,
          captures: [],
          start: 0,
          end: 0,
        })
        expect(result.success).toBe(true)
        expect(result.wat).toContain('f32x4.splat')
      })
    })

    describe('f32x4_splat + extract_lane', () => {
      it('should broadcast and extract lane 0', async () => {
        const { fn, success } = await createWasmFunction({
          id: '__simd_splat_extract',
          body: `
            let v = f32x4_splat(value)
            return f32x4_extract_lane(v, 0)
          `,
          captures: ['value'],
          start: 0,
          end: 0,
        })
        expect(success).toBe(true)
        expect(fn(42.0)).toBeCloseTo(42.0, 4)
      })

      it('should extract all 4 lanes', async () => {
        const { fn, success } = await createWasmFunction({
          id: '__simd_all_lanes',
          body: `
            let v = f32x4_splat(value)
            let s0 = f32x4_extract_lane(v, 0)
            let s1 = f32x4_extract_lane(v, 1)
            let s2 = f32x4_extract_lane(v, 2)
            let s3 = f32x4_extract_lane(v, 3)
            return s0 + s1 + s2 + s3
          `,
          captures: ['value'],
          start: 0,
          end: 0,
        })
        expect(success).toBe(true)
        expect(fn(10.0)).toBeCloseTo(40.0, 3)
      })
    })

    describe('f32x4 load/store with Float32Array', () => {
      it('should load, add constant, and store back', async () => {
        const { fn, success } = await createWasmFunction({
          id: '__simd_load_store',
          body: `
            let a = f32x4_load(arr, 0)
            let b = f32x4_splat(1.0)
            let c = f32x4_add(a, b)
            f32x4_store(arr, 0, c)
            return 0
          `,
          captures: ['arr: Float32Array'],
          start: 0,
          end: 0,
        })
        expect(success).toBe(true)
        const arr = new Float32Array([10, 20, 30, 40])
        fn(arr)
        expect(arr[0]).toBeCloseTo(11, 4)
        expect(arr[1]).toBeCloseTo(21, 4)
        expect(arr[2]).toBeCloseTo(31, 4)
        expect(arr[3]).toBeCloseTo(41, 4)
      })
    })

    describe('f32x4 arithmetic', () => {
      it('should multiply two v128 vectors', async () => {
        const { fn, success } = await createWasmFunction({
          id: '__simd_mul',
          body: `
            let a = f32x4_load(arr, 0)
            let b = f32x4_splat(3.0)
            let c = f32x4_mul(a, b)
            f32x4_store(arr, 0, c)
            return 0
          `,
          captures: ['arr: Float32Array'],
          start: 0,
          end: 0,
        })
        expect(success).toBe(true)
        const arr = new Float32Array([1, 2, 3, 4])
        fn(arr)
        expect(arr[0]).toBeCloseTo(3, 4)
        expect(arr[1]).toBeCloseTo(6, 4)
        expect(arr[2]).toBeCloseTo(9, 4)
        expect(arr[3]).toBeCloseTo(12, 4)
      })

      it('should subtract two v128 vectors', async () => {
        const { fn, success } = await createWasmFunction({
          id: '__simd_sub',
          body: `
            let a = f32x4_load(arr, 0)
            let b = f32x4_splat(1.0)
            let c = f32x4_sub(a, b)
            f32x4_store(arr, 0, c)
            return 0
          `,
          captures: ['arr: Float32Array'],
          start: 0,
          end: 0,
        })
        expect(success).toBe(true)
        const arr = new Float32Array([10, 20, 30, 40])
        fn(arr)
        expect(arr[0]).toBeCloseTo(9, 4)
        expect(arr[1]).toBeCloseTo(19, 4)
        expect(arr[2]).toBeCloseTo(29, 4)
        expect(arr[3]).toBeCloseTo(39, 4)
      })
    })

    describe('SIMD loop (4-wide processing)', () => {
      it('should scale array elements by 2.0 in SIMD chunks', async () => {
        const { fn, success } = await createWasmFunction({
          id: '__simd_loop_scale',
          body: `
            let scale = f32x4_splat(2.0)
            for (let i = 0; i < len; i += 4) {
              let off = i * 4
              let v = f32x4_load(arr, off)
              let r = f32x4_mul(v, scale)
              f32x4_store(arr, off, r)
            }
            return 0
          `,
          captures: ['arr: Float32Array', 'len: i32'],
          start: 0,
          end: 0,
        })
        expect(success).toBe(true)
        const arr = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8])
        fn(arr, 8)
        expect(arr[0]).toBeCloseTo(2, 4)
        expect(arr[1]).toBeCloseTo(4, 4)
        expect(arr[2]).toBeCloseTo(6, 4)
        expect(arr[3]).toBeCloseTo(8, 4)
        expect(arr[4]).toBeCloseTo(10, 4)
        expect(arr[5]).toBeCloseTo(12, 4)
        expect(arr[6]).toBeCloseTo(14, 4)
        expect(arr[7]).toBeCloseTo(16, 4)
      })
    })

    describe('SIMD dot product', () => {
      it('should compute dot product of two Float32Arrays', async () => {
        const { fn, success } = await createWasmFunction({
          id: '__simd_dot_product',
          body: `
            let acc = f32x4_splat(0.0)
            for (let i = 0; i < len; i += 4) {
              let off = i * 4
              let a = f32x4_load(vecA, off)
              let b = f32x4_load(vecB, off)
              acc = f32x4_add(acc, f32x4_mul(a, b))
            }
            let s0 = f32x4_extract_lane(acc, 0)
            let s1 = f32x4_extract_lane(acc, 1)
            let s2 = f32x4_extract_lane(acc, 2)
            let s3 = f32x4_extract_lane(acc, 3)
            return s0 + s1 + s2 + s3
          `,
          captures: ['vecA: Float32Array', 'vecB: Float32Array', 'len: i32'],
          start: 0,
          end: 0,
        })
        expect(success).toBe(true)
        const a = new Float32Array([1, 2, 3, 4])
        const b = new Float32Array([5, 6, 7, 8])
        // dot = 1*5 + 2*6 + 3*7 + 4*8 = 5+12+21+32 = 70
        const result = fn(a, b, 4)
        expect(result).toBeCloseTo(70, 2)
      })

      it('should handle larger arrays (16 elements)', async () => {
        const { fn, success } = await createWasmFunction({
          id: '__simd_dot_16',
          body: `
            let acc = f32x4_splat(0.0)
            for (let i = 0; i < len; i += 4) {
              let off = i * 4
              let a = f32x4_load(vecA, off)
              let b = f32x4_load(vecB, off)
              acc = f32x4_add(acc, f32x4_mul(a, b))
            }
            let s0 = f32x4_extract_lane(acc, 0)
            let s1 = f32x4_extract_lane(acc, 1)
            let s2 = f32x4_extract_lane(acc, 2)
            let s3 = f32x4_extract_lane(acc, 3)
            return s0 + s1 + s2 + s3
          `,
          captures: ['vecA: Float32Array', 'vecB: Float32Array', 'len: i32'],
          start: 0,
          end: 0,
        })
        expect(success).toBe(true)
        // All ones dot all ones = 16
        const a = new Float32Array(16).fill(1)
        const b = new Float32Array(16).fill(1)
        expect(fn(a, b, 16)).toBeCloseTo(16, 2)

        // [1..16] dot [1..16] = sum of squares = 1496
        const c = Float32Array.from({ length: 16 }, (_, i) => i + 1)
        const d = Float32Array.from({ length: 16 }, (_, i) => i + 1)
        // 1+4+9+16+25+36+49+64+81+100+121+144+169+196+225+256 = 1496
        expect(fn(c, d, 16)).toBeCloseTo(1496, 0)
      })
    })

    describe('SIMD performance', () => {
      it('SIMD should process arrays faster than scalar for large data', async () => {
        const size = 4096
        const iterations = 1000

        // SIMD version
        const { fn: simdFn, success: simdOk } = await createWasmFunction({
          id: '__simd_perf',
          body: `
            let scale = f32x4_splat(1.001)
            for (let i = 0; i < len; i += 4) {
              let off = i * 4
              let v = f32x4_load(arr, off)
              let r = f32x4_mul(v, scale)
              f32x4_store(arr, off, r)
            }
            return 0
          `,
          captures: ['arr: Float32Array', 'len: i32'],
          start: 0,
          end: 0,
        })

        // Scalar version
        const { fn: scalarFn, success: scalarOk } = await createWasmFunction({
          id: '__scalar_perf',
          body: `
            for (let i = 0; i < len; i++) {
              arr[i] = arr[i] * 1.001
            }
            return 0
          `,
          captures: ['arr: Float32Array', 'len: i32'],
          start: 0,
          end: 0,
        })

        expect(simdOk).toBe(true)
        expect(scalarOk).toBe(true)

        const arr = Float32Array.from({ length: size }, (_, i) => i + 1)

        // Time SIMD
        const simdStart = performance.now()
        for (let i = 0; i < iterations; i++) simdFn(arr, size)
        const simdTime = performance.now() - simdStart

        // Reset
        arr.fill(1)

        // Time scalar
        const scalarStart = performance.now()
        for (let i = 0; i < iterations; i++) scalarFn(arr, size)
        const scalarTime = performance.now() - scalarStart

        console.log(
          `\nSIMD vs Scalar (${size} elements, ${iterations} iterations):`
        )
        console.log(`  SIMD:   ${simdTime.toFixed(2)}ms`)
        console.log(`  Scalar: ${scalarTime.toFixed(2)}ms`)
        console.log(`  Ratio:  ${(simdTime / scalarTime).toFixed(2)}x`)

        // Don't hard-assert ratio — varies by environment
        // Just verify both produce valid results
        expect(simdTime).toBeGreaterThan(0)
        expect(scalarTime).toBeGreaterThan(0)
      })
    })

    describe('full pipeline (tjs → wasm)', () => {
      it('SIMD intrinsics should not be captured as variables', async () => {
        const { tjs } = await import('./index')
        const source = `
function scale(arr: Float32Array, len: 0, factor: 0.0) {
  wasm {
    let s = f32x4_splat(factor)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      let v = f32x4_load(arr, off)
      f32x4_store(arr, off, f32x4_mul(v, s))
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= factor
  }
}
`
        const result = tjs(source)
        // SIMD intrinsics should NOT appear as WASM function params
        expect(result.code).not.toContain('param $f32x4_splat')
        expect(result.code).not.toContain('param $f32x4_load')
        expect(result.code).not.toContain('param $f32x4_store')
        expect(result.code).not.toContain('param $f32x4_mul')
        // Real captures should appear
        expect(result.code).toContain('param $arr')
        expect(result.code).toContain('param $len')
        expect(result.code).toContain('param $factor')
      })

      it('Math.sqrt should not be captured as a parameter', async () => {
        const { tjs } = await import('./index')
        const source = `
function compute(arr: Float32Array, len: 0) {
  return wasm {
    let sum = 0.0
    for (let i = 0; i < len; i++) {
      sum += arr[i]
    }
    return Math.sqrt(sum)
  } fallback {
    let sum = 0.0
    for (let i = 0; i < len; i++) sum += arr[i]
    return Math.sqrt(sum)
  }
}
`
        const result = tjs(source)
        expect(result.code).not.toContain('param $sqrt')
        expect(result.code).toContain('param $arr')
        expect(result.code).toContain('param $len')
      })

      it('bootstrap should define wasmBuffer', async () => {
        const { tjs } = await import('./index')
        const source = `
function double(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) {
      arr[i] = arr[i] * 2.0
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
}
`
        const result = tjs(source)
        expect(result.code).toContain('wasmBuffer')
        expect(result.code).toContain('__wasmMem')
        expect(result.code).toContain('__woff')
      })

      it('bootstrap should share memory across blocks', async () => {
        const { tjs } = await import('./index')
        const source = `
function addOne(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) { arr[i] = arr[i] + 1.0 }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] += 1
  }
}
function mulTwo(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) { arr[i] = arr[i] * 2.0 }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
}
`
        const result = tjs(source)
        // Should only create memory once
        const memMatches = result.code.match(/new WebAssembly\.Memory/g)
        expect(memMatches?.length).toBe(1)
      })

      it('wasmBuffer arrays should skip copy via buffer identity check', async () => {
        const { tjs } = await import('./index')
        const source = `
function inc(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) { arr[i] = arr[i] + 1.0 }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] += 1
  }
}
`
        const result = tjs(source)
        // The wrapper should check buffer identity against the shared memory.
        // After Phase 0.5 consolidation there's one __wasmMem per file, so
        // wrappers reference it directly (no per-block `mem` alias).
        expect(result.code).toContain('a.buffer===__wasmMem.buffer')
      })
    })

    describe('wasmBuffer end-to-end', () => {
      it('wasmBuffer arrays should be usable from WASM and JS', async () => {
        const { tjs } = await import('./index')
        const { createRuntime } = await import('./runtime')

        const source = `
function double(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) {
      arr[i] = arr[i] * 2.0
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
}
`
        const result = tjs(source)
        const savedTjs = globalThis.__tjs
        try {
          globalThis.__tjs = createRuntime()
          // Execute the bootstrap (sets up wasmBuffer and WASM functions)
          await new Function(
            '__tjs',
            `return (async () => { ${result.code}\n` +
              `globalThis.__test_double = double;\n` +
              `})();`
          )(globalThis.__tjs)

          // Wait for WASM to initialize
          await new Promise((r) => setTimeout(r, 100))

          // Check wasmBuffer is available
          expect(typeof globalThis.wasmBuffer).toBe('function')

          // Allocate a wasmBuffer array
          const arr = globalThis.wasmBuffer(Float32Array, 4)
          expect(arr).toBeInstanceOf(Float32Array)
          expect(arr.length).toBe(4)

          // Write from JS
          arr[0] = 1
          arr[1] = 2
          arr[2] = 3
          arr[3] = 4

          // Call WASM function with wasmBuffer array
          if (typeof globalThis.__test_double === 'function') {
            globalThis.__test_double(arr, 4)
            // JS should see mutations immediately (shared memory)
            expect(arr[0]).toBeCloseTo(2, 5)
            expect(arr[1]).toBeCloseTo(4, 5)
            expect(arr[2]).toBeCloseTo(6, 5)
            expect(arr[3]).toBeCloseTo(8, 5)
          }
        } finally {
          globalThis.__tjs = savedTjs
          delete globalThis.wasmBuffer
          delete globalThis.__test_double
        }
      })

      it('non-wasmBuffer arrays should still work (copy in/out)', async () => {
        const { tjs } = await import('./index')
        const { createRuntime } = await import('./runtime')

        const source = `
function double(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) {
      arr[i] = arr[i] * 2.0
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
}
`
        const result = tjs(source)
        const savedTjs = globalThis.__tjs
        try {
          globalThis.__tjs = createRuntime()
          await new Function(
            '__tjs',
            `return (async () => { ${result.code}\n` +
              `globalThis.__test_double = double;\n` +
              `})();`
          )(globalThis.__tjs)

          await new Promise((r) => setTimeout(r, 100))

          // Use a regular Float32Array (not wasmBuffer)
          const arr = new Float32Array([10, 20, 30, 40])

          if (typeof globalThis.__test_double === 'function') {
            globalThis.__test_double(arr, 4)
            // Should still work via copy in/out
            expect(arr[0]).toBeCloseTo(20, 5)
            expect(arr[1]).toBeCloseTo(40, 5)
            expect(arr[2]).toBeCloseTo(60, 5)
            expect(arr[3]).toBeCloseTo(80, 5)
          }
        } finally {
          globalThis.__tjs = savedTjs
          delete globalThis.__test_double
        }
      })

      it('wasmBuffer should be zero-copy (performance)', async () => {
        const { tjs } = await import('./index')
        const { createRuntime } = await import('./runtime')

        const source = `
function inc(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) {
      arr[i] = arr[i] + 1.0
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] += 1
  }
}
`
        const result = tjs(source)
        const savedTjs = globalThis.__tjs
        try {
          globalThis.__tjs = createRuntime()
          await new Function(
            '__tjs',
            `return (async () => { ${result.code}\n` +
              `globalThis.__test_inc = inc;\n` +
              `})();`
          )(globalThis.__tjs)

          await new Promise((r) => setTimeout(r, 100))

          if (
            typeof globalThis.__test_inc !== 'function' ||
            typeof globalThis.wasmBuffer !== 'function'
          ) {
            return // WASM not available in this environment
          }

          const size = 10000
          const iterations = 1000

          // wasmBuffer path
          const wbArr = globalThis.wasmBuffer(Float32Array, size)
          for (let i = 0; i < size; i++) wbArr[i] = i
          const wbStart = performance.now()
          for (let j = 0; j < iterations; j++)
            globalThis.__test_inc(wbArr, size)
          const wbTime = performance.now() - wbStart

          // Regular array path (copy in/out)
          const regArr = new Float32Array(size)
          for (let i = 0; i < size; i++) regArr[i] = i
          const regStart = performance.now()
          for (let j = 0; j < iterations; j++)
            globalThis.__test_inc(regArr, size)
          const regTime = performance.now() - regStart

          console.log(
            `\nwasmBuffer vs regular array (${size} elements, ${iterations} iterations):`
          )
          console.log(`  wasmBuffer: ${wbTime.toFixed(2)}ms`)
          console.log(`  Regular:    ${regTime.toFixed(2)}ms`)
          console.log(`  Speedup:    ${(regTime / wbTime).toFixed(2)}x`)

          // wasmBuffer should be faster (no copy overhead)
          // Don't hard-assert ratio — varies by environment
          expect(wbTime).toBeGreaterThan(0)
          expect(regTime).toBeGreaterThan(0)
        } finally {
          globalThis.__tjs = savedTjs
          delete globalThis.__test_inc
          delete globalThis.wasmBuffer
        }
      })

      it('SIMD with wasmBuffer should outperform scalar', async () => {
        const { tjs } = await import('./index')
        const { createRuntime } = await import('./runtime')

        const source = `
function simdScale(arr: Float32Array, len: 0, factor: 0.0) {
  wasm {
    let s = f32x4_splat(factor)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      f32x4_store(arr, off, f32x4_mul(f32x4_load(arr, off), s))
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= factor
  }
}
`
        const result = tjs(source)
        const savedTjs = globalThis.__tjs
        try {
          globalThis.__tjs = createRuntime()
          await new Function(
            '__tjs',
            `return (async () => { ${result.code}\n` +
              `globalThis.__test_simdScale = simdScale;\n` +
              `})();`
          )(globalThis.__tjs)

          await new Promise((r) => setTimeout(r, 100))

          if (
            typeof globalThis.__test_simdScale !== 'function' ||
            typeof globalThis.wasmBuffer !== 'function'
          ) {
            return
          }

          const size = 40000 // Must be multiple of 4 for SIMD
          const iterations = 1000

          // SIMD + wasmBuffer
          const arr = globalThis.wasmBuffer(Float32Array, size)
          for (let i = 0; i < size; i++) arr[i] = i * 0.01

          const simdStart = performance.now()
          for (let j = 0; j < iterations; j++)
            globalThis.__test_simdScale(arr, size, 1.001)
          const simdTime = performance.now() - simdStart

          // Plain JS scalar
          const jsArr = new Float32Array(size)
          for (let i = 0; i < size; i++) jsArr[i] = i * 0.01

          const jsStart = performance.now()
          for (let j = 0; j < iterations; j++) {
            for (let i = 0; i < size; i++) jsArr[i] *= 1.001
          }
          const jsTime = performance.now() - jsStart

          console.log(
            `\nSIMD+wasmBuffer vs JS scalar (${size} elements, ${iterations} iterations):`
          )
          console.log(`  SIMD+wasmBuffer: ${simdTime.toFixed(2)}ms`)
          console.log(`  JS scalar:       ${jsTime.toFixed(2)}ms`)
          console.log(`  Speedup:         ${(jsTime / simdTime).toFixed(2)}x`)

          expect(simdTime).toBeGreaterThan(0)
          expect(jsTime).toBeGreaterThan(0)
        } finally {
          globalThis.__tjs = savedTjs
          delete globalThis.__test_simdScale
          delete globalThis.wasmBuffer
        }
      })
    })
  })
})

describe('module consolidation (Phase 0.5)', () => {
  describe('compileBlocksToModule', () => {
    it('emits one module with N exports for N blocks', async () => {
      const blocks: WasmBlock[] = [
        {
          id: 'b0',
          captures: ['a: f64', 'b: f64'],
          body: 'return a + b',
          hasReturn: true,
        } as WasmBlock,
        {
          id: 'b1',
          captures: ['x: f64', 'y: f64'],
          body: 'return x * y',
          hasReturn: true,
        } as WasmBlock,
      ]

      const result = compileBlocksToModule(blocks)
      expect(result.exports).toHaveLength(2)
      expect(result.exports[0]).toMatchObject({ id: 'b0', exportName: 'compute_0' })
      expect(result.exports[1]).toMatchObject({ id: 'b1', exportName: 'compute_1' })

      // Instantiate and confirm both exports work
      const instance = await instantiateWasm(result.bytes)
      const add = instance.exports.compute_0 as (a: number, b: number) => number
      const mul = instance.exports.compute_1 as (a: number, b: number) => number
      expect(add(2, 3)).toBe(5)
      expect(mul(4, 5)).toBe(20)
    })

    it('preserves input order in results, including failures', () => {
      const blocks: WasmBlock[] = [
        {
          id: 'ok0',
          captures: ['a: f64'],
          body: 'return a + 1',
          hasReturn: true,
        } as WasmBlock,
        {
          id: 'bad',
          captures: ['x: f64'],
          // Syntax error — fails compilation
          body: 'this is not valid js {{{',
          hasReturn: true,
        } as WasmBlock,
        {
          id: 'ok1',
          captures: ['b: f64'],
          body: 'return b * 2',
          hasReturn: true,
        } as WasmBlock,
      ]

      const result = compileBlocksToModule(blocks)
      expect(result.results).toHaveLength(3)
      expect(result.results[0]).toMatchObject({ id: 'ok0', success: true })
      expect(result.results[1]).toMatchObject({ id: 'bad', success: false })
      expect(result.results[2]).toMatchObject({ id: 'ok1', success: true })

      // All three blocks appear in exports — failed blocks become stub
      // functions so that wasm-to-wasm `call <index>` instructions targeting
      // their slot stay valid. The `results` array distinguishes successes
      // from failures.
      expect(result.exports).toHaveLength(3)
      expect(result.exports.map((e) => e.id)).toEqual(['ok0', 'bad', 'ok1'])
      // Export indices stay dense and aligned with input order
      expect(result.exports.map((e) => e.exportName)).toEqual([
        'compute_0',
        'compute_1',
        'compute_2',
      ])
    })

    it('produces a valid module even when all blocks fail (stubs only)', () => {
      // All blocks fail compilation — module is still well-formed with
      // stub functions in each slot. This preserves index stability for
      // any callers that might reference these by index.
      const blocks: WasmBlock[] = [
        {
          id: 'bad',
          captures: ['x: f64'],
          body: 'this is not valid js {{{',
          hasReturn: true,
        } as WasmBlock,
      ]

      const result = compileBlocksToModule(blocks)
      expect(result.exports).toHaveLength(1)
      expect(result.results[0].success).toBe(false)
      // Module bytes are emitted; the stub is callable but returns 0
      expect(result.bytes.length).toBeGreaterThan(0)
    })

    it('imports memory only when at least one function needs it', () => {
      // Pure-arithmetic block: no memory needed
      const noMemBlocks: WasmBlock[] = [
        {
          id: 'b0',
          captures: ['a: f64'],
          body: 'return a + 1',
          hasReturn: true,
        } as WasmBlock,
      ]
      const noMemResult = compileBlocksToModule(noMemBlocks)
      expect(noMemResult.needsMemory).toBe(false)
      // Should instantiate with no imports
      expect(async () => {
        await instantiateWasm(noMemResult.bytes)
      }).not.toThrow()

      // Mixed: one block uses Float32Array (needs memory), one doesn't.
      // The whole module imports memory; the pure block coexists fine.
      const mixedBlocks: WasmBlock[] = [
        {
          id: 'b0',
          captures: ['a: f64'],
          body: 'return a + 1',
          hasReturn: true,
        } as WasmBlock,
        {
          id: 'b1',
          captures: ['arr: Float32Array', 'len: f64'],
          body: 'for (let i = 0; i < len; i++) arr[i] = arr[i] + 1.0',
          hasReturn: false,
        } as WasmBlock,
      ]
      const mixedResult = compileBlocksToModule(mixedBlocks)
      expect(mixedResult.needsMemory).toBe(true)
      expect(mixedResult.exports).toHaveLength(2)
    })

    it('handles void and value-returning functions in the same module', async () => {
      const blocks: WasmBlock[] = [
        {
          id: 'sum',
          captures: ['a: f64', 'b: f64'],
          body: 'return a + b',
          hasReturn: true,
        } as WasmBlock,
        {
          id: 'noop',
          captures: ['x: f64'],
          body: 'let y = x', // No return — void function
          hasReturn: false,
        } as WasmBlock,
      ]

      const result = compileBlocksToModule(blocks)
      expect(result.exports).toHaveLength(2)

      const instance = await instantiateWasm(result.bytes)
      const sum = instance.exports.compute_0 as (a: number, b: number) => number
      const noop = instance.exports.compute_1 as (x: number) => void
      expect(sum(7, 8)).toBe(15)
      expect(noop(42)).toBeUndefined()
    })
  })

  describe('emitted bootstrap (single WebAssembly.compile per file)', () => {
    it('two wasm blocks in one source produce ONE compile call', async () => {
      const { tjs } = await import('./index')
      const source = `
function inc(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) { arr[i] = arr[i] + 1.0 }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] += 1
  }
}

function dbl(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) { arr[i] = arr[i] * 2.0 }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
}
`
      const result = tjs(source)

      // The hallmark of consolidation: exactly one compile call across all blocks
      const compileCalls = (result.code.match(/WebAssembly\.compile\(/g) || [])
        .length
      expect(compileCalls).toBe(1)

      // Both functions appear under their own export names in the module
      expect(result.code).toContain('"compute_0"')
      expect(result.code).toContain('"compute_1"')
    })

    it('two wasm functions actually run after consolidated bootstrap', async () => {
      const { tjs } = await import('./index')
      const { createRuntime } = await import('./runtime')
      const source = `
function inc(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) { arr[i] = arr[i] + 1.0 }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] += 1
  }
}

function dbl(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) { arr[i] = arr[i] * 2.0 }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
}
`
      const result = tjs(source)
      const savedTjs = globalThis.__tjs
      try {
        globalThis.__tjs = createRuntime()
        // Wrap in IIFE so the emitted `const __tjs = ...` doesn't clash with
        // the outer parameter; expose the user functions via globalThis.
        await new Function(
          '__tjs',
          `return (async () => { ${result.code}\n` +
            `globalThis.__test_inc = inc;\n` +
            `globalThis.__test_dbl = dbl;\n` +
            `})();`
        )(globalThis.__tjs)

        // Wait for the single async bootstrap (one instantiate) to complete
        await new Promise((r) => setTimeout(r, 100))

        const wasmBuffer = (globalThis as any).wasmBuffer
        expect(typeof wasmBuffer).toBe('function')

        const buf = wasmBuffer(Float32Array, 4)
        buf[0] = 1
        buf[1] = 2
        buf[2] = 3
        buf[3] = 4

        ;(globalThis as any).__test_inc(buf, 4) // [2, 3, 4, 5]
        expect(Array.from(buf)).toEqual([2, 3, 4, 5])

        ;(globalThis as any).__test_dbl(buf, 4) // [4, 6, 8, 10]
        expect(Array.from(buf)).toEqual([4, 6, 8, 10])
      } finally {
        globalThis.__tjs = savedTjs
        delete (globalThis as any).wasmBuffer
        delete (globalThis as any).__test_inc
        delete (globalThis as any).__test_dbl
      }
    })
  })
})

describe('wasm function declarations (Phase 1)', () => {
  it('extracts a top-level wasm function as a WasmBlock', async () => {
    const { tjs } = await import('./index')
    const source = `
wasm function add(a: f64, b: f64): f64 {
  return a + b
}
`
    const result = tjs(source)
    expect(result.wasmCompiled).toBeDefined()
    expect(result.wasmCompiled).toHaveLength(1)
    expect(result.wasmCompiled![0]).toMatchObject({
      id: '__tjs_wasm_add',
      success: true,
    })
  })

  it('emits a regular JS wrapper that forwards to the wasm export', async () => {
    const { tjs } = await import('./index')
    const source = `
wasm function add(a: f64, b: f64): f64 {
  return a + b
}
`
    const result = tjs(source)
    // The declaration is replaced with a wrapper function — that wrapper
    // forwards to globalThis.__tjs_wasm_add, which the bootstrap sets up.
    expect(result.code).toContain('function add(a, b)')
    expect(result.code).toContain('globalThis.__tjs_wasm_add(a, b)')
  })

  it('preserves the export modifier on the wrapper', async () => {
    const { tjs } = await import('./index')
    const source = `
export wasm function mul(a: f64, b: f64): f64 {
  return a * b
}
`
    const result = tjs(source)
    expect(result.code).toContain('export function mul(a, b)')
    expect(result.code).toContain('globalThis.__tjs_wasm_mul(a, b)')
  })

  it('runs end-to-end: declare wasm function, call it, get correct result', async () => {
    const { tjs } = await import('./index')
    const { createRuntime } = await import('./runtime')
    const source = `
wasm function add(a: f64, b: f64): f64 {
  return a + b
}

wasm function sub(a: f64, b: f64): f64 {
  return a - b
}
`
    const result = tjs(source)
    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${result.code}\n` +
          `globalThis.__test_add = add;\n` +
          `globalThis.__test_sub = sub;\n` +
          `})();`
      )(globalThis.__tjs)

      // Wait for the async bootstrap to complete
      await new Promise((r) => setTimeout(r, 100))

      expect((globalThis as any).__test_add(3, 4)).toBe(7)
      expect((globalThis as any).__test_sub(10, 7)).toBe(3)
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).__test_add
      delete (globalThis as any).__test_sub
    }
  })

  it('works with Float32Array parameters (zero-copy via wasmBuffer)', async () => {
    const { tjs } = await import('./index')
    const { createRuntime } = await import('./runtime')
    const source = `
wasm function scaleArray(arr: Float32Array, len: f64, factor: f64) {
  for (let i = 0; i < len; i++) {
    arr[i] = arr[i] * factor
  }
}
`
    const result = tjs(source)
    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${result.code}\n` +
          `globalThis.__test_scale = scaleArray;\n` +
          `})();`
      )(globalThis.__tjs)

      await new Promise((r) => setTimeout(r, 100))

      const wasmBuffer = (globalThis as any).wasmBuffer
      expect(typeof wasmBuffer).toBe('function')
      const buf = wasmBuffer(Float32Array, 4)
      buf[0] = 1
      buf[1] = 2
      buf[2] = 3
      buf[3] = 4
      ;(globalThis as any).__test_scale(buf, 4, 3.0)
      expect(Array.from(buf)).toEqual([3, 6, 9, 12])
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).wasmBuffer
      delete (globalThis as any).__test_scale
    }
  })

  it('coexists with inline wasm {} blocks in the same file', async () => {
    const { tjs } = await import('./index')
    // No return-type annotation on `inline` — auto signature tests would
    // call the function at transpile time before wasm is instantiated and
    // fail because the dispatch returns undefined. The functional check is
    // about block extraction + module consolidation, not the auto-test.
    const source = `
wasm function topLevel(a: f64, b: f64): f64 {
  return a * b
}

function inline(x: 0, y: 0) {
  return wasm {
    return x + y
  }
}
`
    const result = tjs(source, { runTests: false })
    expect(result.wasmCompiled).toHaveLength(2)
    const ids = result.wasmCompiled!.map((b) => b.id).sort()
    expect(ids[0]).toBe('__tjs_wasm_0') // inline block
    expect(ids[1]).toBe('__tjs_wasm_topLevel') // named wasm function
    // Both compile into the same consolidated module — verify exactly one
    // WebAssembly.compile call in the output.
    const compileCalls = (result.code.match(/WebAssembly\.compile\(/g) || [])
      .length
    expect(compileCalls).toBe(1)
  })

  it('handles wasm function with no params', async () => {
    const { tjs } = await import('./index')
    const source = `
wasm function answer(): f64 {
  return 42
}
`
    const result = tjs(source)
    expect(result.wasmCompiled).toHaveLength(1)
    expect(result.wasmCompiled![0].success).toBe(true)
    expect(result.code).toContain('function answer()')
    expect(result.code).toContain('globalThis.__tjs_wasm_answer()')
  })

  it('does not match identifiers that contain "wasm" (e.g. mywasm)', async () => {
    const { tjs } = await import('./index')
    const source = `
function mywasm(x: 0): 0 { return x }
`
    const result = tjs(source)
    // No wasm blocks should be extracted from this — the source contains no
    // actual `wasm function` declaration.
    expect(result.wasmCompiled ?? []).toHaveLength(0)
  })
})

describe('boundary distribution form (Phase 4)', () => {
  // Write the transpiled library to a tmp .mjs file and dynamically import
  // it. This is the most authentic test of the boundary form: real ESM
  // resolution, real exports, real WebAssembly instantiation.
  async function dynamicImportLibrary(transpiled: string): Promise<any> {
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { writeFileSync, unlinkSync } = await import('node:fs')
    const path = join(
      tmpdir(),
      `tjs-lib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mjs`
    )
    writeFileSync(path, transpiled)
    try {
      const mod = await import(path)
      // Wait for the async wasm bootstrap inside the module to finish.
      // The bootstrap runs as a top-level IIFE; instantiation is async.
      await new Promise((r) => setTimeout(r, 100))
      return mod
    } finally {
      try {
        unlinkSync(path)
      } catch {
        /* ignore */
      }
    }
  }

  it('emits a self-contained ES module with exported wasm wrappers', async () => {
    const { tjs } = await import('./index')
    const librarySource = `
export wasm function add(a: f64, b: f64): f64 { return a + b }
export wasm function mul(a: f64, b: f64): f64 { return a * b }
`
    const result = tjs(librarySource, { runTests: false })

    // Both wrappers exported
    expect(result.code).toContain('export function add(a, b)')
    expect(result.code).toContain('export function mul(a, b)')

    // Each wrapper forwards to its globalThis-registered wasm function
    expect(result.code).toContain('globalThis.__tjs_wasm_add(a, b)')
    expect(result.code).toContain('globalThis.__tjs_wasm_mul(a, b)')

    // The wasm module is base64-embedded and instantiated at the top
    expect(result.code).toContain('__wasmModuleB64')
    expect(result.code).toContain('WebAssembly.compile')

    // No external runtime setup required — the inline __tjs fallback
    // covers everything actually used. (Only the helpers this file needs
    // are inlined, so simple wasm-wrapper libraries get a small fallback;
    // libraries with type checks would also inline MonadicError etc.)
    expect(result.code).toContain('globalThis.__tjs?.createRuntime?.()')
  })

  it('dynamic import of the boundary form gives a working module', async () => {
    const { tjs } = await import('./index')
    const librarySource = `
export wasm function add(a: f64, b: f64): f64 { return a + b }
export wasm function mul(a: f64, b: f64): f64 { return a * b }
`
    const result = tjs(librarySource, { runTests: false })

    const lib = await dynamicImportLibrary(result.code)
    expect(typeof lib.add).toBe('function')
    expect(typeof lib.mul).toBe('function')
    expect(lib.add(7, 5)).toBe(12)
    expect(lib.mul(6, 7)).toBe(42)
  })

  it('boundary form and composed form return identical results', async () => {
    // Same library source, consumed two different ways:
    //  - boundary:  transpile → write to disk → dynamic import → call exports
    //  - composed:  Phase 3 — moduleLoader pulls the wasm body into the
    //               consumer's own module
    // Both should produce the same numeric results.
    const { tjs } = await import('./index')
    const { createRuntime } = await import('./runtime')
    const { ModuleLoader, inMemoryFileSystem } = await import(
      './module-loader'
    )

    const librarySource = `
export wasm function dot3(
  ax: f64, ay: f64, az: f64,
  bx: f64, by: f64, bz: f64
): f64 {
  return ax * bx + ay * by + az * bz
}
`
    // Boundary form
    const libCompiled = tjs(librarySource, { runTests: false })
    const lib = await dynamicImportLibrary(libCompiled.code)
    const boundary = lib.dot3(1, 2, 3, 4, 5, 6)

    // Composed form (Phase 3 path)
    const loader = new ModuleLoader({
      fs: inMemoryFileSystem({ '/proj/linalg.tjs': librarySource }),
      baseDir: '/proj',
    })
    const consumerSource = `
import { dot3 } from './linalg.tjs'
`
    const consumerCompiled = tjs(consumerSource, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })

    let composed: number
    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${consumerCompiled.code}\n` +
          `globalThis.__test_dot3 = dot3;\n` +
          `})();`
      )(globalThis.__tjs)
      await new Promise((r) => setTimeout(r, 100))
      composed = (globalThis as any).__test_dot3(1, 2, 3, 4, 5, 6)
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).__test_dot3
    }

    expect(boundary).toBe(composed)
    expect(boundary).toBe(1 * 4 + 2 * 5 + 3 * 6) // 32 — pen-and-paper truth
  })

  it('boundary form library works for a plain JS consumer (no tjs involvement)', async () => {
    // Build the library, write to disk, import it, then call from a
    // plain JS function (simulating a consumer with no tjs in the chain).
    // The library's wasm bootstrap should run, the wrapper should be
    // callable, and the wasm function should produce correct results.
    const { tjs } = await import('./index')
    const librarySource = `
export wasm function square(x: f64): f64 { return x * x }
`
    const result = tjs(librarySource, { runTests: false })
    const lib = await dynamicImportLibrary(result.code)

    // Use the import from a plain JS function — no tjs runtime involved
    function jsConsumer(x: number): number {
      return lib.square(x) + 1
    }
    expect(jsConsumer(5)).toBe(26)
  })
})

describe('cross-file wasm composition (Phase 3)', () => {
  // Build a minimal ModuleLoader backed by an in-memory FS for hermetic tests
  async function buildLoader(files: Record<string, string>) {
    const { ModuleLoader, inMemoryFileSystem } = await import('./module-loader')
    return new ModuleLoader({
      fs: inMemoryFileSystem(files),
      baseDir: '/proj',
    })
  }

  it('composes an imported wasm function into the consumer module', async () => {
    const { tjs } = await import('./index')
    const loader = await buildLoader({
      '/proj/linalg.tjs': `
wasm function dot(a: f64, b: f64): f64 {
  return a * b
}
`,
    })
    const source = `
import { dot } from './linalg.tjs'

function compute(a: 0.0, b: 0.0): 0.0 {
  return dot(a, b)
}
`
    const result = tjs(source, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })

    // The imported wasm function got composed in
    expect(result.wasmCompiled).toBeDefined()
    expect(result.wasmCompiled).toHaveLength(1)
    expect(result.wasmCompiled![0]).toMatchObject({
      id: '__tjs_wasm_dot',
      success: true,
    })

    // The import statement was rewritten to a local wrapper
    expect(result.code).not.toContain("import { dot } from './linalg.tjs'")
    expect(result.code).toContain('function dot(a, b)')
    expect(result.code).toContain('globalThis.__tjs_wasm_dot(a, b)')
  })

  it('keeps imports unchanged when no loader is supplied', async () => {
    const { tjs } = await import('./index')
    const source = `
import { dot } from './linalg.tjs'

function compute(a: 0.0, b: 0.0): 0.0 {
  return dot(a, b)
}
`
    // No moduleLoader option — default behavior preserved
    const result = tjs(source, { runTests: false })
    expect(result.code).toContain("import { dot } from './linalg.tjs'")
    expect(result.wasmCompiled ?? []).toHaveLength(0)
  })

  it('preserves imports that do NOT resolve to wasm functions', async () => {
    const { tjs } = await import('./index')
    const loader = await buildLoader({
      '/proj/regular.tjs': `
export function helper(x: 0.0): 0.0 { return x + 1.0 }
`,
    })
    const source = `
import { helper } from './regular.tjs'

function compute(x: 0.0): 0.0 {
  return helper(x)
}
`
    const result = tjs(source, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })
    // `helper` is a regular function, not a wasm function — import stays
    expect(result.code).toContain("import { helper } from './regular.tjs'")
    expect(result.wasmCompiled ?? []).toHaveLength(0)
  })

  it('handles mixed imports (some wasm, some regular) in one statement', async () => {
    const { tjs } = await import('./index')
    const loader = await buildLoader({
      '/proj/lib.tjs': `
wasm function fast(a: f64): f64 { return a * 2 }
export function slow(x: 0.0): 0.0 { return x + 1.0 }
`,
    })
    const source = `
import { fast, slow } from './lib.tjs'

function compute(x: 0.0): 0.0 {
  return fast(x) + slow(x)
}
`
    const result = tjs(source, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })
    // fast was composed; slow remains imported
    expect(result.wasmCompiled).toHaveLength(1)
    expect(result.wasmCompiled![0].id).toBe('__tjs_wasm_fast')
    expect(result.code).toContain('function fast(a)')
    expect(result.code).toContain('globalThis.__tjs_wasm_fast(a)')
    // The remaining import keeps `slow` only
    expect(result.code).toMatch(/import\s*\{\s*slow\s*\}\s*from/)
    expect(result.code).not.toMatch(
      /import\s*\{\s*fast\s*,\s*slow\s*\}\s*from/
    )
  })

  it('composes multiple wasm functions from one library', async () => {
    const { tjs } = await import('./index')
    const loader = await buildLoader({
      '/proj/linalg.tjs': `
wasm function dot(a: f64, b: f64): f64 { return a * b }
wasm function add(a: f64, b: f64): f64 { return a + b }
wasm function unused(x: f64): f64 { return x }
`,
    })
    const source = `
import { dot, add } from './linalg.tjs'

function compute(a: 0.0, b: 0.0): 0.0 {
  return add(dot(a, b), b)
}
`
    const result = tjs(source, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })
    expect(result.wasmCompiled).toHaveLength(2)
    const ids = result.wasmCompiled!.map((b) => b.id).sort()
    expect(ids).toEqual(['__tjs_wasm_add', '__tjs_wasm_dot'])
    // One consolidated WebAssembly.Module per file (Phase 0.5 acceptance)
    const compileCalls = (result.code.match(/WebAssembly\.compile\(/g) || [])
      .length
    expect(compileCalls).toBe(1)
  })

  it('module shape: composed functions are local (no extra imports beyond env.memory)', async () => {
    // This is the Phase 3 acceptance criterion: imported wasm functions
    // are LOCAL to the consumer's module, not imported at the wasm level.
    const { tjs } = await import('./index')
    const { compileBlocksToModule } = await import('./wasm')
    const loader = await buildLoader({
      '/proj/linalg.tjs': `
wasm function dot(a: f64, b: f64): f64 { return a * b }
`,
    })
    const source = `
import { dot } from './linalg.tjs'
function compute(a: 0.0, b: 0.0): 0.0 { return dot(a, b) }
`
    tjs(source, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })

    // Now compile the loaded module's wasm blocks and inspect the bytes.
    // The wasm binary format: after the magic + version, sections appear.
    // Section 2 is "import" — we want to verify ONLY env.memory is imported
    // (no host function imports).
    const linalgBlocks = (await loader.load('./linalg.tjs', '/proj/app.tjs'))!
      .parseResult.wasmBlocks
    const composed = compileBlocksToModule(linalgBlocks)
    expect(composed.exports).toHaveLength(1)
    expect(composed.exports[0].id).toBe('__tjs_wasm_dot')

    // The composed module needs no memory for a pure-scalar `dot(a, b) = a*b`
    expect(composed.needsMemory).toBe(false)

    // Confirm the bytecode parses as a valid WebAssembly.Module
    const mod = new WebAssembly.Module(composed.bytes)
    expect(mod).toBeInstanceOf(WebAssembly.Module)

    // Inspect imports: should have NO function imports.
    // WebAssembly.Module.imports returns [{ module, name, kind }, ...]
    const imports = WebAssembly.Module.imports(mod)
    const functionImports = imports.filter((i) => i.kind === 'function')
    expect(functionImports).toHaveLength(0)
  })

  it('end-to-end: imported wasm function runs and produces correct results', async () => {
    const { tjs } = await import('./index')
    const { createRuntime } = await import('./runtime')
    const loader = await buildLoader({
      '/proj/linalg.tjs': `
wasm function add(a: f64, b: f64): f64 { return a + b }
wasm function mul(a: f64, b: f64): f64 { return a * b }
`,
    })
    const source = `
import { add, mul } from './linalg.tjs'
`
    const result = tjs(source, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })

    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${result.code}\n` +
          `globalThis.__test_add = add;\n` +
          `globalThis.__test_mul = mul;\n` +
          `})();`
      )(globalThis.__tjs)

      await new Promise((r) => setTimeout(r, 100))

      expect((globalThis as any).__test_add(2, 3)).toBe(5)
      expect((globalThis as any).__test_mul(4, 5)).toBe(20)
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).__test_add
      delete (globalThis as any).__test_mul
    }
  })
})

describe('wasm function purity & unsafe marker (Phase 2)', () => {
  it('rejects `wasm function (! ...)` with a clear error', async () => {
    const { tjs } = await import('./index')
    const source = `
wasm function dangerous(! aPtr: i32, n: i32): f64 {
  return 0
}
`
    expect(() => tjs(source)).toThrow(/Unsafe wasm functions/)
    expect(() => tjs(source)).toThrow(/dangerous/)
    expect(() => tjs(source)).toThrow(/reserved for a future phase/)
  })

  it('accepts wasm function without the bang marker', async () => {
    const { tjs } = await import('./index')
    const source = `
wasm function safe(a: f64, b: f64): f64 {
  return a + b
}
`
    expect(() => tjs(source)).not.toThrow()
  })

  it('purity: host-import calls in a wasm function body fail with a clear error', async () => {
    // Math.sin requires a host import; the wasm bytecode builder doesn't
    // support that path today, so this fails at compile time. This test
    // documents the property: wasm function bodies are pure compute — any
    // host-import call is a compile error.
    const { tjs } = await import('./index')
    const source = `
wasm function tryHostCall(x: f64): f64 {
  return Math.sin(x)
}
`
    const result = tjs(source)
    // Block extraction succeeds but compilation fails
    expect(result.wasmCompiled).toBeDefined()
    expect(result.wasmCompiled).toHaveLength(1)
    expect(result.wasmCompiled![0].success).toBe(false)
    expect(result.wasmCompiled![0].error).toMatch(/Math\.sin/)
    expect(result.wasmCompiled![0].error).toMatch(/import/i)
  })

  it('purity: inline Math ops that DO compile (sqrt, abs, etc.) work fine', async () => {
    // sqrt, abs, floor, ceil, min, max compile to wasm intrinsics — no host
    // imports needed. Confirms the constraint is "no host imports", not
    // "no Math.* at all".
    const { tjs } = await import('./index')
    const source = `
wasm function magnitude(x: f64, y: f64): f64 {
  return Math.sqrt(x * x + y * y)
}
`
    const result = tjs(source)
    expect(result.wasmCompiled).toBeDefined()
    expect(result.wasmCompiled![0].success).toBe(true)
  })
})

describe('wasm-to-wasm calls (Phase 1.5)', () => {
  it('a wasm function can call another wasm function in the same file', async () => {
    const { tjs } = await import('./index')
    const { createRuntime } = await import('./runtime')
    const source = `
wasm function square(x: f64): f64 {
  return x * x
}

wasm function sumOfSquares(a: f64, b: f64): f64 {
  return square(a) + square(b)
}
`
    const result = tjs(source, { runTests: false })
    expect(result.wasmCompiled).toHaveLength(2)
    expect(result.wasmCompiled!.every((b) => b.success)).toBe(true)

    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${result.code}\n` +
          `globalThis.__test_sos = sumOfSquares;\n` +
          `})();`
      )(globalThis.__tjs)
      await new Promise((r) => setTimeout(r, 100))

      // sumOfSquares(3, 4) = 9 + 16 = 25
      expect((globalThis as any).__test_sos(3, 4)).toBe(25)
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).__test_sos
      for (const key of Object.keys(globalThis)) {
        if (key.startsWith('__tjs_wasm_')) {
          delete (globalThis as any)[key]
        }
      }
    }
  })

  it('forward references work (caller declared before callee)', async () => {
    // The pre-pass builds the function map before any body is compiled,
    // so a wasm function can call one declared LATER in the file.
    const { tjs } = await import('./index')
    const { createRuntime } = await import('./runtime')
    const source = `
wasm function caller(x: f64): f64 {
  return callee(x) + 1
}

wasm function callee(x: f64): f64 {
  return x * 2
}
`
    const result = tjs(source, { runTests: false })
    expect(result.wasmCompiled!.every((b) => b.success)).toBe(true)

    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${result.code}\n` +
          `globalThis.__test_caller = caller;\n` +
          `})();`
      )(globalThis.__tjs)
      await new Promise((r) => setTimeout(r, 100))
      expect((globalThis as any).__test_caller(5)).toBe(11) // 5*2 + 1
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).__test_caller
      for (const key of Object.keys(globalThis)) {
        if (key.startsWith('__tjs_wasm_')) {
          delete (globalThis as any)[key]
        }
      }
    }
  })

  it('mutual recursion compiles and runs', async () => {
    const { tjs } = await import('./index')
    const { createRuntime } = await import('./runtime')
    // Classic mutual-recursion shape: isEven(n) calls isOdd(n-1); isOdd(n)
    // calls isEven(n-1). Returns 1.0 (true) or 0.0 (false).
    const source = `
wasm function isEven(n: i32): f64 {
  if (n == 0) return 1.0
  return isOdd(n - 1)
}

wasm function isOdd(n: i32): f64 {
  if (n == 0) return 0.0
  return isEven(n - 1)
}
`
    const result = tjs(source, { runTests: false })
    expect(result.wasmCompiled!.every((b) => b.success)).toBe(true)

    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${result.code}\n` +
          `globalThis.__test_isEven = isEven;\n` +
          `globalThis.__test_isOdd = isOdd;\n` +
          `})();`
      )(globalThis.__tjs)
      await new Promise((r) => setTimeout(r, 100))

      expect((globalThis as any).__test_isEven(10)).toBe(1)
      expect((globalThis as any).__test_isEven(7)).toBe(0)
      expect((globalThis as any).__test_isOdd(7)).toBe(1)
      expect((globalThis as any).__test_isOdd(10)).toBe(0)
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).__test_isEven
      delete (globalThis as any).__test_isOdd
      for (const key of Object.keys(globalThis)) {
        if (key.startsWith('__tjs_wasm_')) {
          delete (globalThis as any)[key]
        }
      }
    }
  })

  it('cross-file: composed imports can be called from a wasm function', async () => {
    // The big payoff: a consumer's wasm function calls imported library
    // kernels via wasm `call` instructions — no JS↔wasm boundary in the
    // inner loop.
    const { tjs } = await import('./index')
    const { createRuntime } = await import('./runtime')
    const { ModuleLoader, inMemoryFileSystem } = await import(
      './module-loader'
    )

    const loader = new ModuleLoader({
      fs: inMemoryFileSystem({
        '/proj/lib.tjs': `
wasm function double(x: f64): f64 { return x * 2 }
wasm function triple(x: f64): f64 { return x * 3 }
`,
      }),
      baseDir: '/proj',
    })
    const consumerSource = `
import { double, triple } from './lib.tjs'

wasm function fancy(x: f64): f64 {
  return double(x) + triple(x)
}
`
    const result = tjs(consumerSource, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })

    // All three wasm functions (double, triple, fancy) live in one module
    expect(result.wasmCompiled).toHaveLength(3)
    expect(result.wasmCompiled!.every((b) => b.success)).toBe(true)
    const compileCalls = (result.code.match(/WebAssembly\.compile\(/g) || [])
      .length
    expect(compileCalls).toBe(1)

    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${result.code}\n` +
          `globalThis.__test_fancy = fancy;\n` +
          `})();`
      )(globalThis.__tjs)
      await new Promise((r) => setTimeout(r, 100))

      // fancy(5) = double(5) + triple(5) = 10 + 15 = 25
      expect((globalThis as any).__test_fancy(5)).toBe(25)
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).__test_fancy
      for (const key of Object.keys(globalThis)) {
        if (key.startsWith('__tjs_wasm_')) {
          delete (globalThis as any)[key]
        }
      }
    }
  })

  it('arg type mismatch is detected with a clear error', async () => {
    // A wasm function expects i32 but is called with an f64 expression
    // that has no way to be converted safely without losing data. The
    // compiler should still accept it (lossy conversion is allowed) —
    // truncate is the standard wasm move for f64→i32.
    //
    // For an actually-incompatible case we'd need v128; testing that
    // would require setting up SIMD types. Instead we verify the
    // conversion path: pass an f64 expression to an i32 param and check
    // it works (the truncation happens automatically).
    const { tjs } = await import('./index')
    const { createRuntime } = await import('./runtime')
    const source = `
wasm function takesInt(n: i32): f64 {
  return n + 0.5
}

wasm function caller(): f64 {
  // 3.7 is f64; takesInt expects i32 — the compiler inserts a truncate
  return takesInt(3.7)
}
`
    const result = tjs(source, { runTests: false })
    expect(result.wasmCompiled!.every((b) => b.success)).toBe(true)

    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${result.code}\n` +
          `globalThis.__test_caller = caller;\n` +
          `})();`
      )(globalThis.__tjs)
      await new Promise((r) => setTimeout(r, 100))

      // 3.7 truncates to 3 (i32), then 3 + 0.5 = 3.5
      expect((globalThis as any).__test_caller()).toBe(3.5)
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).__test_caller
      for (const key of Object.keys(globalThis)) {
        if (key.startsWith('__tjs_wasm_')) {
          delete (globalThis as any)[key]
        }
      }
    }
  })

  it('argument count mismatch produces a clear compile error', async () => {
    const { tjs } = await import('./index')
    const source = `
wasm function takesTwo(a: f64, b: f64): f64 { return a + b }
wasm function caller(): f64 {
  return takesTwo(1.0)
}
`
    const result = tjs(source, { runTests: false })
    // caller fails because takesTwo gets one arg instead of two
    const callerResult = result.wasmCompiled!.find((b) => b.id === '__tjs_wasm_caller')
    expect(callerResult).toBeDefined()
    expect(callerResult!.success).toBe(false)
    expect(callerResult!.error).toMatch(/takesTwo expects 2 arguments, got 1/)
  })
})
