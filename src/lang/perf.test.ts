/**
 * TJS performance CHARACTERISATION — not the project's performance numbers.
 *
 * ## Read this before quoting anything this file prints
 *
 * The ratios narrated below are measured IN-PROCESS, inside a long-lived `bun test` run,
 * and they depend on what the JIT did earlier in that process far more than on the code
 * under test. Measured on one machine, same commit, same code, one afternoon:
 *
 *     this file alone .............. TJS 2.18x baseline
 *     `bun test src/lang/` ......... TJS 5.05x baseline
 *     full `bun test` .............. TJS 116.75x baseline   <- and 3005ms, over the 5s timeout
 *
 * A 54x spread for identical code. The baseline is the unstable half: `legacyIntensive(1000)`
 * is a pure function called with a constant, so the JIT can hoist it out of the timing loop
 * entirely — measured at 3.3 Gops/s, which is not a speed, it is an absence. Adding a sink
 * for the result does not change it (verified), because the value is still available to
 * fold; the fix is not a sink here, it is not measuring in a shared process at all.
 *
 * **The authoritative numbers come from `bun run bench`**, which runs each lane in a
 * controlled harness and writes `benchmarks.md`. Where this file and that file disagree —
 * and they do, by roughly 10x on wrap() overhead — that file is right. This one exists to
 * catch gross behavioural regressions and to keep the correctness assertions honest, which
 * is what it actually asserts: every timing here is narration, and every `expect` is a
 * correctness check.
 *
 * This mattered practically: `guides/benchmarks.md` published a 17-28x overhead claim for
 * seven months, and numbers of exactly this shape are where that came from.
 *
 * Compares execution overhead between:
 * - Legacy JavaScript (baseline)
 * - TJS transpiled code (with inline validation)
 * - TJS unsafe (!) functions (no validation wrapper)
 *
 * For monadic error handling, use try-without-catch:
 *   try { JSON.parse(s) }  // converts exceptions to AgentError
 *
 * Run with: SKIP_LLM_TESTS=1 bun test src/lang/perf.test.ts
 */

import { describe, it, expect } from 'bun:test'
import { tjs, wrap, isError } from './index'
import { configure } from './runtime'

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
  describe('CLI cold start', () => {
    it('should measure tjsx cold start time', async () => {
      const { execSync } = await import('child_process')
      const path = await import('path')

      // Create a simple test file
      const testFile = '/tmp/perf-test.tjs'
      const { writeFileSync } = await import('fs')
      writeFileSync(testFile, `function add(a: 1, b: 2): 3 { return a + b }`)

      const cliPath = path.join(import.meta.dir, '../cli/tjsx.ts')

      // Measure cold start (5 runs, take median)
      const times: number[] = []
      for (let i = 0; i < 5; i++) {
        const start = performance.now()
        execSync(`bun ${cliPath} ${testFile}`, { stdio: 'pipe' })
        times.push(performance.now() - start)
      }

      times.sort((a, b) => a - b)
      const median = times[Math.floor(times.length / 2)]
      const min = times[0]
      const max = times[times.length - 1]

      console.log(`\n  tjsx cold start (5 runs):`)
      console.log(`    Min:    ${min.toFixed(0)}ms`)
      console.log(`    Median: ${median.toFixed(0)}ms`)
      console.log(`    Max:    ${max.toFixed(0)}ms`)

      // Regression guardrail, not a micro-benchmark: this wall-clock is
      // dominated by `bun` process spawn + module-graph load (the one-line
      // transpile is negligible), so it's machine- and load-dependent. Keep the
      // bar generous — it catches a gross regression (cold start ballooning to
      // seconds) without flaking on a loaded box or slower CI.
      expect(median).toBeLessThan(500)
    })

    it('should measure tjs emit time', async () => {
      const { execSync } = await import('child_process')
      const path = await import('path')

      const testFile = '/tmp/perf-test.tjs'
      const cliPath = path.join(import.meta.dir, '../cli/tjs.ts')

      const times: number[] = []
      for (let i = 0; i < 5; i++) {
        const start = performance.now()
        execSync(`bun ${cliPath} emit ${testFile}`, { stdio: 'pipe' })
        times.push(performance.now() - start)
      }

      times.sort((a, b) => a - b)
      const median = times[Math.floor(times.length / 2)]

      console.log(`\n  tjs emit cold start (5 runs):`)
      console.log(`    Median: ${median.toFixed(0)}ms`)

      // Generous regression guardrail — see the tjsx cold-start note above.
      expect(median).toBeLessThan(500)
    })

    it('should measure tjs check time', async () => {
      const { execSync } = await import('child_process')
      const path = await import('path')

      const testFile = '/tmp/perf-test.tjs'
      const cliPath = path.join(import.meta.dir, '../cli/tjs.ts')

      const times: number[] = []
      for (let i = 0; i < 5; i++) {
        const start = performance.now()
        execSync(`bun ${cliPath} check ${testFile}`, { stdio: 'pipe' })
        times.push(performance.now() - start)
      }

      times.sort((a, b) => a - b)
      const median = times[Math.floor(times.length / 2)]

      console.log(`\n  tjs check cold start (5 runs):`)
      console.log(`    Median: ${median.toFixed(0)}ms`)

      // Generous regression guardrail — see the tjsx cold-start note above.
      expect(median).toBeLessThan(500)
    })
  })

  describe('Tight loop overhead', () => {
    it('should measure overhead for simple arithmetic', () => {
      // Legacy JS - baseline
      function legacyDouble(x: number): number {
        return x * 2
      }

      // TJS transpiled
      const tjsResult = tjs(`
        function tjsDouble(x: 0): 0 {
          return x * 2
        }
      `)
      const tjsDouble = new Function(`${tjsResult.code}; return tjsDouble;`)()

      // TJS with unsafe (!) - no validation wrapper
      const unsafeResult = tjs(`
        function unsafeDouble(! x: 0): 0 {
          return x * 2
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
        function tjsTransform(x: 0, y: 0): { sum: 0, product: 0 } {
          return { sum: x + y, product: x * y }
        }
      `)
      const tjsTransform = new Function(
        `${tjsResult.code}; return tjsTransform;`
      )()

      // TJS with unsafe (!) - no validation wrapper
      const unsafeResult = tjs(`
        function unsafeTransform(! x: 0, y: 0): { sum: 0, product: 0 } {
          return { sum: x + y, product: x * y }
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
        function tjsSum(arr: [0]): 0 {
          let sum = 0
          for (const n of arr) sum += n
          return sum
        }
      `)
      const tjsSum = new Function(`${tjsResult.code}; return tjsSum;`)()

      // TJS with unsafe (!) - no validation wrapper
      const unsafeResult = tjs(`
        function unsafeSum(! arr: [0]): 0 {
          let sum = 0
          for (const n of arr) sum += n
          return sum
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

    it('should measure intensive inner loop overhead', () => {
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
        function tjsIntensive(n: 0): 0 {
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

      // TJS unsafe (!) - no validation wrapper
      const unsafeResult = tjs(`
        function unsafeIntensive(! n: 0): 0 {
          let sum = 0
          for (let i = 0; i < n; i++) {
            sum += i * i
          }
          return sum
        }
      `)
      const unsafeIntensive = new Function(
        `${unsafeResult.code}; return unsafeIntensive;`
      )()

      // Each call does 1000 iterations internally.
      //
      // BOUNDED WORK. At the file-wide 100,000 calls this is 100 MILLION inner iterations
      // per lane, three lanes plus warmups — and in a full `bun test` the TJS lanes took
      // 3005ms each, putting the test over bun's 5s timeout. It squeaked under on Bun
      // 1.3.14 and stopped doing so on 1.4; the timeout was never the real budget, the
      // work was. Nothing here asserts on a duration, so the loop count only has to be
      // large enough to be a fair shape — 5,000 calls is 5 million iterations, still an
      // honest workload and ~20x inside the limit.
      const INNER_LOOP = 1000
      const CALLS = 5_000
      const bench = (fn: () => void) => {
        for (let i = 0; i < 500; i++) fn()
        const t0 = performance.now()
        for (let i = 0; i < CALLS; i++) fn()
        return performance.now() - t0
      }
      const legacyTime = bench(() => legacyIntensive(INNER_LOOP))
      const tjsTime = bench(() => tjsIntensive(INNER_LOOP))
      const unsafeTime = bench(() => unsafeIntensive(INNER_LOOP))

      // RAW TIMES, NO RATIO — deliberately.
      //
      // Bounding the work stopped the timeout but did not make the comparison valid: in a
      // full `bun test` this still reads 1.37ms vs 155ms, a "113x" that is an artifact of
      // the baseline being folded away, not a cost TJS imposes. `bun run bench` measures
      // the same thing at ~2x.
      //
      // A ratio is the quotable part, and a wrong quotable number is worse than no number:
      // `guides/benchmarks.md` carried "17-28x overhead" for seven months, and it came from
      // exactly this shape. So this prints what it actually observed and refuses to divide.
      console.log(
        `\n  Intensive inner loop (${CALLS.toLocaleString()} calls × ${INNER_LOOP} iterations)` +
          ` — in-process, JIT-history dependent; NOT a benchmark. Use \`bun run bench\`.`
      )
      console.log(`    Legacy JS:  ${legacyTime.toFixed(2)}ms`)
      console.log(`    TJS:        ${tjsTime.toFixed(2)}ms`)
      console.log(`    TJS unsafe: ${unsafeTime.toFixed(2)}ms`)

      // Sanity check - sum of squares 0..999 = 332833500
      const expected = 332833500
      expect(legacyIntensive(INNER_LOOP)).toBe(expected)
      expect(tjsIntensive(INNER_LOOP)).toBe(expected)
      expect(unsafeIntensive(INNER_LOOP)).toBe(expected)
    })

    it('should measure error path overhead for try block', () => {
      // TJS try-without-catch converts exceptions to monadic errors
      const tryResult = tjs(`
        function tryThrow(x: 0): 0 {
          try {
            if (x < 0) throw new Error('negative')
            return x
          }
        }
      `)
      const tryThrow = new Function(`${tryResult.code}; return tryThrow;`)()

      // Measure success path
      const successTime = benchmark('success', () => tryThrow(42))

      // Measure error path (try-without-catch returns monadic error)
      const errorTime = benchmark('error', () => tryThrow(-1))

      console.log(
        `\n  Try-without-catch error handling (${ITERATIONS.toLocaleString()} iterations):`
      )
      console.log(`    Success path: ${successTime.toFixed(2)}ms`)
      console.log(
        `    Error path:   ${errorTime.toFixed(2)}ms (${(
          errorTime / successTime
        ).toFixed(2)}x)`
      )

      // Sanity check
      expect(tryThrow(42)).toBe(42)
      const err = tryThrow(-1)
      expect(err).toBeInstanceOf(Error)
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

    it('should compare wrap() vs unsafe (!) overhead', () => {
      // Wrapped function with validation
      const wrappedAdd = wrap((a: number, b: number) => a + b, {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
      })

      // TJS unsafe (!) version - no wrapper at all
      const unsafeResult = tjs(`
        function unsafeAdd(! a: 0, b: 0): 0 {
          return a + b
        }
      `)
      const unsafeAdd = new Function(
        `${unsafeResult.code}; return unsafeAdd;`
      )()

      // Plain function baseline
      const plainAdd = (a: number, b: number) => a + b

      const plainTime = benchmark('plain', () => plainAdd(2, 3))
      const wrappedTime = benchmark('wrapped', () => wrappedAdd(2, 3))
      const unsafeTime = benchmark('unsafe', () => unsafeAdd(2, 3))

      console.log(
        `\n  wrap() vs unsafe (!) (${ITERATIONS.toLocaleString()} iterations):`
      )
      console.log(`    Plain:    ${plainTime.toFixed(2)}ms (baseline)`)
      console.log(
        `    Wrapped:  ${wrappedTime.toFixed(2)}ms (${(
          wrappedTime / plainTime
        ).toFixed(2)}x) - with validation`
      )
      console.log(
        `    Unsafe:   ${unsafeTime.toFixed(2)}ms (${(
          unsafeTime / plainTime
        ).toFixed(2)}x) - no wrapper`
      )

      // Sanity check
      expect(plainAdd(2, 3)).toBe(5)
      expect(wrappedAdd(2, 3)).toBe(5)
      expect(unsafeAdd(2, 3)).toBe(5)
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

  describe('Safety levels overhead', () => {
    it('should compare all safety levels', () => {
      // Plain function - baseline
      const plain = (x: number) => x * 2

      // Create wrapped functions for each test
      const createWrapped = () =>
        wrap((x: number) => x * 2, {
          params: { x: { type: 'number', required: true } },
          returns: { type: 'number' },
        })

      // Test safety: 'none'
      configure({ safety: 'none' })
      const wrappedNone = createWrapped()
      const noneTime = benchmark('none', () => wrappedNone(5))

      // Test safety: 'inputs'
      configure({ safety: 'inputs' })
      const wrappedInputs = createWrapped()
      const inputsTime = benchmark('inputs', () => wrappedInputs(5))

      // Test safety: 'all'
      configure({ safety: 'all' })
      const wrappedAll = createWrapped()
      const allTime = benchmark('all', () => wrappedAll(5))

      // Plain baseline
      const plainTime = benchmark('plain', () => plain(5))

      console.log(
        `\n  Safety levels (${ITERATIONS.toLocaleString()} iterations):`
      )
      console.log(`    Plain:           ${plainTime.toFixed(2)}ms (baseline)`)
      console.log(
        `    safety: 'none':  ${noneTime.toFixed(2)}ms (${(
          noneTime / plainTime
        ).toFixed(2)}x)`
      )
      console.log(
        `    safety: 'inputs': ${inputsTime.toFixed(2)}ms (${(
          inputsTime / plainTime
        ).toFixed(2)}x)`
      )
      console.log(
        `    safety: 'all':   ${allTime.toFixed(2)}ms (${(
          allTime / plainTime
        ).toFixed(2)}x)`
      )

      // Reset to default
      configure({ safety: 'inputs' })

      // Sanity checks
      expect(plain(5)).toBe(10)
      expect(wrappedNone(5)).toBe(10)
      expect(wrappedInputs(5)).toBe(10)
      expect(wrappedAll(5)).toBe(10)
    })

    // NOTE: unsafe {} block test removed - the feature was removed because
    // it provided no performance benefit (wrapper decision is at transpile time)

    it('should measure per-function safety flags', () => {
      configure({ safety: 'none' })

      // Use the SAME base function to eliminate JIT variance
      const baseFn = (x: number) => x * 2

      // Normal function (no validation with safety: 'none')
      const normal = wrap(baseFn, {
        params: { x: { type: 'number', required: true } },
      })

      // Safe function (forces validation)
      const safe = wrap(baseFn, {
        params: { x: { type: 'number', required: true } },
        safe: true,
      })

      // Unsafe function (skips validation) - returns baseFn itself
      const unsafe = wrap(baseFn, {
        params: { x: { type: 'number', required: true } },
        unsafe: true,
      })

      // Verify unsafe returns the original function
      expect(unsafe).toBe(baseFn)

      // Warmup
      for (let i = 0; i < 1000; i++) {
        baseFn(5)
        normal(5)
        safe(5)
      }

      // Benchmark
      const plainTime = benchmark('plain', () => baseFn(5))
      const normalTime = benchmark('normal', () => normal(5))
      const safeTime = benchmark('safe', () => safe(5))
      // unsafe === baseFn, so this tests the same function
      benchmark('unsafe', () => unsafe(5))

      console.log(
        `\n  Per-function flags with safety: 'none' (${ITERATIONS.toLocaleString()} iterations):`
      )
      console.log(`    Plain/(!):  ${plainTime.toFixed(2)}ms (baseline)`)
      console.log(
        `    Normal:    ${normalTime.toFixed(2)}ms (${(
          normalTime / plainTime
        ).toFixed(2)}x) - wrapped, follows global`
      )
      console.log(
        `    (?) safe:  ${safeTime.toFixed(2)}ms (${(
          safeTime / plainTime
        ).toFixed(2)}x) - forces validation`
      )
      console.log(
        `    Note: (!) unsafe returns original function, so it's identical to plain`
      )

      // Reset
      configure({ safety: 'inputs' })

      expect(normal(5)).toBe(10)
      expect(safe(5)).toBe(10)
      expect(unsafe(5)).toBe(10)
    })

    it('should measure inputs-only vs all validation', () => {
      const plain = (x: number) => x * 2

      // Inputs only (default)
      configure({ safety: 'inputs' })
      const inputsOnly = wrap((x: number) => x * 2, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
      })

      // All validation
      configure({ safety: 'all' })
      const allValidation = wrap((x: number) => x * 2, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
      })

      // Force output validation with -?
      configure({ safety: 'inputs' })
      const safeReturn = wrap((x: number) => x * 2, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
        safeReturn: true,
      })

      const plainTime = benchmark('plain', () => plain(5))
      const inputsTime = benchmark('inputs', () => inputsOnly(5))
      const allTime = benchmark('all', () => allValidation(5))
      const safeReturnTime = benchmark('safeReturn', () => safeReturn(5))

      console.log(
        `\n  Input vs Output validation (${ITERATIONS.toLocaleString()} iterations):`
      )
      console.log(
        `    Plain:              ${plainTime.toFixed(2)}ms (baseline)`
      )
      console.log(
        `    Inputs only:        ${inputsTime.toFixed(2)}ms (${(
          inputsTime / plainTime
        ).toFixed(2)}x)`
      )
      console.log(
        `    Inputs + outputs:   ${allTime.toFixed(2)}ms (${(
          allTime / plainTime
        ).toFixed(2)}x)`
      )
      console.log(
        `    -? (force output):  ${safeReturnTime.toFixed(2)}ms (${(
          safeReturnTime / plainTime
        ).toFixed(2)}x)`
      )

      // Reset
      configure({ safety: 'inputs' })

      expect(inputsOnly(5)).toBe(10)
      expect(allValidation(5)).toBe(10)
      expect(safeReturn(5)).toBe(10)
    })
  })
})
