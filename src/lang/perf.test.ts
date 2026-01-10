/**
 * TJS Performance Benchmarks
 *
 * Compares execution overhead between:
 * - Legacy JavaScript (baseline)
 * - TJS transpiled code (currently no runtime validation)
 * - TJS with unsafe blocks (skips type checks, wraps in try-catch)
 *
 * Currently TJS has no runtime type validation, so `unsafe` only adds try-catch
 * overhead. Once runtime validation is added, `unsafe` may be a performance WIN
 * for hot paths where skipping type checks outweighs the try-catch cost.
 *
 * For monadic error handling WITHOUT skipping type checks, use try-without-catch:
 *   try { JSON.parse(s) }  // converts exceptions to AgentError, keeps type checks
 *
 * Run with: SKIP_LLM_TESTS=1 bun test src/lang/perf.test.ts
 */

import { describe, it, expect } from 'bun:test'
import { tjs, wrap, isError } from './index'

const ITERATIONS = 100_000

function benchmark(name: string, fn: () => void): number {
  // Warmup
  for (let i = 0; i < 1000; i++) fn()

  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) fn()
  const elapsed = performance.now() - start

  return elapsed
}

describe('TJS Performance', () => {
  describe('Tight loop overhead', () => {
    it('should measure overhead for simple arithmetic', () => {
      // Legacy JS - baseline
      function legacyDouble(x: number): number {
        return x * 2
      }

      // TJS transpiled
      const tjsResult = tjs(`
        function tjsDouble(x: 0) -> 0 {
          return x * 2
        }
      `)
      const tjsDouble = new Function(`${tjsResult.code}; return tjsDouble;`)()

      // TJS with unsafe
      const unsafeResult = tjs(`
        function unsafeDouble(x: 0) -> 0 {
          unsafe {
            return x * 2
          }
        }
      `)
      const unsafeDouble = new Function(
        `${unsafeResult.code}; return unsafeDouble;`
      )()

      const legacyTime = benchmark('legacy', () => legacyDouble(42))
      const tjsTime = benchmark('tjs', () => tjsDouble(42))
      const unsafeTime = benchmark('unsafe', () => unsafeDouble(42))

      console.log(
        `\n  Simple arithmetic (${ITERATIONS.toLocaleString()} iterations):`
      )
      console.log(`    Legacy JS:  ${legacyTime.toFixed(2)}ms`)
      console.log(
        `    TJS:        ${tjsTime.toFixed(2)}ms (${(
          tjsTime / legacyTime
        ).toFixed(2)}x)`
      )
      console.log(
        `    TJS unsafe: ${unsafeTime.toFixed(2)}ms (${(
          unsafeTime / legacyTime
        ).toFixed(2)}x)`
      )

      // Sanity check - results should be correct
      expect(legacyDouble(21)).toBe(42)
      expect(tjsDouble(21)).toBe(42)
      expect(unsafeDouble(21)).toBe(42)
    })

    it('should measure overhead for object manipulation', () => {
      // Legacy JS
      function legacyTransform(
        x: number,
        y: number
      ): { sum: number; product: number } {
        return { sum: x + y, product: x * y }
      }

      // TJS transpiled
      const tjsResult = tjs(`
        function tjsTransform(x: 0, y: 0) -> { sum: 0, product: 0 } {
          return { sum: x + y, product: x * y }
        }
      `)
      const tjsTransform = new Function(
        `${tjsResult.code}; return tjsTransform;`
      )()

      // TJS with unsafe
      const unsafeResult = tjs(`
        function unsafeTransform(x: 0, y: 0) -> { sum: 0, product: 0 } {
          unsafe {
            return { sum: x + y, product: x * y }
          }
        }
      `)
      const unsafeTransform = new Function(
        `${unsafeResult.code}; return unsafeTransform;`
      )()

      const legacyTime = benchmark('legacy', () => legacyTransform(3, 4))
      const tjsTime = benchmark('tjs', () => tjsTransform(3, 4))
      const unsafeTime = benchmark('unsafe', () => unsafeTransform(3, 4))

      console.log(
        `\n  Object manipulation (${ITERATIONS.toLocaleString()} iterations):`
      )
      console.log(`    Legacy JS:  ${legacyTime.toFixed(2)}ms`)
      console.log(
        `    TJS:        ${tjsTime.toFixed(2)}ms (${(
          tjsTime / legacyTime
        ).toFixed(2)}x)`
      )
      console.log(
        `    TJS unsafe: ${unsafeTime.toFixed(2)}ms (${(
          unsafeTime / legacyTime
        ).toFixed(2)}x)`
      )

      // Sanity check
      expect(legacyTransform(3, 4)).toEqual({ sum: 7, product: 12 })
      expect(tjsTransform(3, 4)).toEqual({ sum: 7, product: 12 })
      expect(unsafeTransform(3, 4)).toEqual({ sum: 7, product: 12 })
    })

    it('should measure overhead for array operations', () => {
      // Legacy JS
      function legacySum(arr: number[]): number {
        let sum = 0
        for (const n of arr) sum += n
        return sum
      }

      // TJS transpiled
      const tjsResult = tjs(`
        function tjsSum(arr: [0]) -> 0 {
          let sum = 0
          for (const n of arr) sum += n
          return sum
        }
      `)
      const tjsSum = new Function(`${tjsResult.code}; return tjsSum;`)()

      // TJS with unsafe
      const unsafeResult = tjs(`
        function unsafeSum(arr: [0]) -> 0 {
          unsafe {
            let sum = 0
            for (const n of arr) sum += n
            return sum
          }
        }
      `)
      const unsafeSum = new Function(
        `${unsafeResult.code}; return unsafeSum;`
      )()

      const testArr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const legacyTime = benchmark('legacy', () => legacySum(testArr))
      const tjsTime = benchmark('tjs', () => tjsSum(testArr))
      const unsafeTime = benchmark('unsafe', () => unsafeSum(testArr))

      console.log(`\n  Array sum (${ITERATIONS.toLocaleString()} iterations):`)
      console.log(`    Legacy JS:  ${legacyTime.toFixed(2)}ms`)
      console.log(
        `    TJS:        ${tjsTime.toFixed(2)}ms (${(
          tjsTime / legacyTime
        ).toFixed(2)}x)`
      )
      console.log(
        `    TJS unsafe: ${unsafeTime.toFixed(2)}ms (${(
          unsafeTime / legacyTime
        ).toFixed(2)}x)`
      )

      // Sanity check
      expect(legacySum(testArr)).toBe(55)
      expect(tjsSum(testArr)).toBe(55)
      expect(unsafeSum(testArr)).toBe(55)
    })

    it('should measure try-catch overhead amortization', () => {
      // When the loop is INSIDE the unsafe block, the try-catch overhead is amortized
      // across many iterations, reducing per-iteration cost (but still slower than no try-catch)

      // Legacy JS - baseline with tight inner loop
      function legacyIntensive(n: number): number {
        let sum = 0
        for (let i = 0; i < n; i++) {
          sum += i * i
        }
        return sum
      }

      // TJS - loop inside function body
      const tjsResult = tjs(`
        function tjsIntensive(n: 0) -> 0 {
          let sum = 0
          for (let i = 0; i < n; i++) {
            sum += i * i
          }
          return sum
        }
      `)
      const tjsIntensive = new Function(
        `${tjsResult.code}; return tjsIntensive;`
      )()

      // TJS unsafe - loop inside unsafe block, try-catch paid once
      const unsafeResult = tjs(`
        function unsafeIntensive(n: 0) -> 0 {
          unsafe {
            let sum = 0
            for (let i = 0; i < n; i++) {
              sum += i * i
            }
            return sum
          }
        }
      `)
      const unsafeIntensive = new Function(
        `${unsafeResult.code}; return unsafeIntensive;`
      )()

      // Each call does 1000 iterations internally
      const INNER_LOOP = 1000
      const legacyTime = benchmark('legacy', () => legacyIntensive(INNER_LOOP))
      const tjsTime = benchmark('tjs', () => tjsIntensive(INNER_LOOP))
      const unsafeTime = benchmark('unsafe', () => unsafeIntensive(INNER_LOOP))

      console.log(
        `\n  Intensive inner loop (${ITERATIONS.toLocaleString()} calls × ${INNER_LOOP} iterations):`
      )
      console.log(`    Legacy JS:  ${legacyTime.toFixed(2)}ms`)
      console.log(
        `    TJS:        ${tjsTime.toFixed(2)}ms (${(
          tjsTime / legacyTime
        ).toFixed(2)}x)`
      )
      console.log(
        `    TJS unsafe: ${unsafeTime.toFixed(2)}ms (${(
          unsafeTime / legacyTime
        ).toFixed(2)}x)`
      )

      // Sanity check - sum of squares 0..999 = 332833500
      const expected = 332833500
      expect(legacyIntensive(INNER_LOOP)).toBe(expected)
      expect(tjsIntensive(INNER_LOOP)).toBe(expected)
      expect(unsafeIntensive(INNER_LOOP)).toBe(expected)
    })

    it('should measure error path overhead for unsafe', () => {
      // TJS unsafe that throws
      const unsafeResult = tjs(`
        function unsafeThrow(x: 0) -> 0 {
          unsafe {
            if (x < 0) throw new Error('negative')
            return x
          }
        }
      `)
      const unsafeThrow = new Function(
        `${unsafeResult.code}; return unsafeThrow;`
      )()

      // Measure success path
      const successTime = benchmark('success', () => unsafeThrow(42))

      // Measure error path
      const errorTime = benchmark('error', () => unsafeThrow(-1))

      console.log(
        `\n  Unsafe error handling (${ITERATIONS.toLocaleString()} iterations):`
      )
      console.log(`    Success path: ${successTime.toFixed(2)}ms`)
      console.log(
        `    Error path:   ${errorTime.toFixed(2)}ms (${(
          errorTime / successTime
        ).toFixed(2)}x)`
      )

      // Sanity check
      expect(unsafeThrow(42)).toBe(42)
      const err = unsafeThrow(-1)
      expect(err.$error).toBe(true)
    })
  })

  describe('Runtime wrap() overhead', () => {
    it('should measure wrap() validation overhead', () => {
      // Unwrapped function - baseline
      function unwrappedAdd(a: number, b: number): number {
        return a + b
      }

      // Wrapped with runtime validation
      const wrappedAdd = wrap((a: number, b: number) => a + b, {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
        returns: { type: 'number' },
      })

      const unwrappedTime = benchmark('unwrapped', () => unwrappedAdd(2, 3))
      const wrappedTime = benchmark('wrapped', () => wrappedAdd(2, 3))

      console.log(
        `\n  wrap() overhead (${ITERATIONS.toLocaleString()} iterations):`
      )
      console.log(`    Unwrapped:  ${unwrappedTime.toFixed(2)}ms`)
      console.log(
        `    Wrapped:    ${wrappedTime.toFixed(2)}ms (${(
          wrappedTime / unwrappedTime
        ).toFixed(2)}x)`
      )
      console.log(
        `    Per-call:   ${(
          ((wrappedTime - unwrappedTime) / ITERATIONS) *
          1000
        ).toFixed(3)}µs`
      )

      // Sanity check
      expect(unwrappedAdd(2, 3)).toBe(5)
      expect(wrappedAdd(2, 3)).toBe(5)
    })

    it('should measure error propagation overhead', () => {
      // Chain of 3 wrapped functions
      const step1 = wrap((x: number) => x * 2, {
        params: { x: { type: 'number', required: true } },
      })
      const step2 = wrap((x: number) => x + 10, {
        params: { x: { type: 'number', required: true } },
      })
      const step3 = wrap((x: number) => x / 2, {
        params: { x: { type: 'number', required: true } },
      })

      // Unwrapped chain for baseline
      const chain = (x: number) => (x * 2 + 10) / 2

      const chainTime = benchmark('chain', () => chain(5))
      const wrappedChainTime = benchmark('wrapped-chain', () =>
        step3(step2(step1(5)))
      )

      console.log(
        `\n  3-function chain (${ITERATIONS.toLocaleString()} iterations):`
      )
      console.log(`    Plain chain:   ${chainTime.toFixed(2)}ms`)
      console.log(
        `    Wrapped chain: ${wrappedChainTime.toFixed(2)}ms (${(
          wrappedChainTime / chainTime
        ).toFixed(2)}x)`
      )

      // Sanity check: (5 * 2 + 10) / 2 = 10
      expect(chain(5)).toBe(10)
      expect(step3(step2(step1(5)))).toBe(10)
    })

    it('should measure error short-circuit benefit', () => {
      // When an error propagates, wrapped functions skip execution
      let step2Called = 0
      let step3Called = 0

      const errorStep = wrap(
        (x: number) => {
          if (x < 0) return { $error: true, message: 'negative' }
          return x
        },
        { params: { x: { type: 'number', required: true } } }
      )

      const step2 = wrap(
        (x: number) => {
          step2Called++
          return x * 2
        },
        { params: { x: { type: 'number', required: true } } }
      )

      const step3 = wrap(
        (x: number) => {
          step3Called++
          return x + 10
        },
        { params: { x: { type: 'number', required: true } } }
      )

      // Run chain with error input
      const errorResult = step3(step2(errorStep(-1) as any) as any)

      console.log(`\n  Error short-circuit:`)
      console.log(`    step2 called: ${step2Called} times (should be 0)`)
      console.log(`    step3 called: ${step3Called} times (should be 0)`)

      expect(isError(errorResult)).toBe(true)
      expect(step2Called).toBe(0) // Never called due to error propagation
      expect(step3Called).toBe(0)
    })
  })
})
