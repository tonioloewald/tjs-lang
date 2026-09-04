/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs, wrap, isError } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { configure } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

const ITERATIONS = 100_000

/* line 47 */
function benchmark(name, fn) {
  for (let i = 0; i < 1000; i++) fn()
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) fn()
  const elapsed = performance.now() - start
  return elapsed
}
benchmark.__tjs = {
  params: {
    name: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    fn: {
      type: {
        kind: 'any',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'number',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:47',
}

describe('TJS Performance', () => {
  describe('CLI cold start', () => {
    it('should measure tjsx cold start time', async () => {
      const { execSync } = await import('child_process')
      const path = await import('path')

      const testFile = '/tmp/perf-test.tjs'
      const { writeFileSync } = await import('fs')
      writeFileSync(testFile, `function add(a: 1, b: 2): 3 { return a + b }`)
      const cliPath = path.join(
        '/Users/tonioloewald/tjs-lang/src/lang',
        '../cli/tjsx.ts'
      )

      const times = []
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

      expect(median).toBeLessThan(500)
    })
    it('should measure tjs emit time', async () => {
      const { execSync } = await import('child_process')
      const path = await import('path')
      const testFile = '/tmp/perf-test.tjs'
      const cliPath = path.join(
        '/Users/tonioloewald/tjs-lang/src/lang',
        '../cli/tjs.ts'
      )
      const times = []
      for (let i = 0; i < 5; i++) {
        const start = performance.now()
        execSync(`bun ${cliPath} emit ${testFile}`, { stdio: 'pipe' })
        times.push(performance.now() - start)
      }
      times.sort((a, b) => a - b)
      const median = times[Math.floor(times.length / 2)]
      console.log(`\n  tjs emit cold start (5 runs):`)
      console.log(`    Median: ${median.toFixed(0)}ms`)

      expect(median).toBeLessThan(500)
    })
    it('should measure tjs check time', async () => {
      const { execSync } = await import('child_process')
      const path = await import('path')
      const testFile = '/tmp/perf-test.tjs'
      const cliPath = path.join(
        '/Users/tonioloewald/tjs-lang/src/lang',
        '../cli/tjs.ts'
      )
      const times = []
      for (let i = 0; i < 5; i++) {
        const start = performance.now()
        execSync(`bun ${cliPath} check ${testFile}`, { stdio: 'pipe' })
        times.push(performance.now() - start)
      }
      times.sort((a, b) => a - b)
      const median = times[Math.floor(times.length / 2)]
      console.log(`\n  tjs check cold start (5 runs):`)
      console.log(`    Median: ${median.toFixed(0)}ms`)

      expect(median).toBeLessThan(500)
    })
  })
  describe('Tight loop overhead', () => {
    it('should measure overhead for simple arithmetic', () => {
      function legacyDouble(x) {
        return x * 2
      }

      const tjsResult = tjs(`
        function tjsDouble(x: 0): 0 {
          return x * 2
        }
      `)
      const tjsDouble = new Function(`${tjsResult.code}; return tjsDouble;`)()

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

      expect(legacyDouble(21)).toBe(42)
      expect(tjsDouble(21)).toBe(42)
      expect(unsafeDouble(21)).toBe(42)
    })
    it('should measure overhead for object manipulation', () => {
      function legacyTransform(x, y) {
        return { sum: x + y, product: x * y }
      }

      const tjsResult = tjs(`
        function tjsTransform(x: 0, y: 0): { sum: 0, product: 0 } {
          return { sum: x + y, product: x * y }
        }
      `)
      const tjsTransform = new Function(
        `${tjsResult.code}; return tjsTransform;`
      )()

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

      expect(legacyTransform(3, 4)).toEqual({ sum: 7, product: 12 })
      expect(tjsTransform(3, 4)).toEqual({ sum: 7, product: 12 })
      expect(unsafeTransform(3, 4)).toEqual({ sum: 7, product: 12 })
    })
    it('should measure overhead for array operations', () => {
      function legacySum(arr) {
        let sum = 0
        for (const n of arr) sum += n
        return sum
      }

      const tjsResult = tjs(`
        function tjsSum(arr: [0]): 0 {
          let sum = 0
          for (const n of arr) sum += n
          return sum
        }
      `)
      const tjsSum = new Function(`${tjsResult.code}; return tjsSum;`)()

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

      expect(legacySum(testArr)).toBe(55)
      expect(tjsSum(testArr)).toBe(55)
      expect(unsafeSum(testArr)).toBe(55)
    })
    it('should measure intensive inner loop overhead', () => {
      function legacyIntensive(n) {
        let sum = 0
        for (let i = 0; i < n; i++) {
          sum += i * i
        }
        return sum
      }

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

      const INNER_LOOP = 1000
      const CALLS = 5_000
      const bench = (fn) => {
        for (let i = 0; i < 500; i++) fn()
        const t0 = performance.now()
        for (let i = 0; i < CALLS; i++) fn()
        return performance.now() - t0
      }
      const legacyTime = bench(() => legacyIntensive(INNER_LOOP))
      const tjsTime = bench(() => tjsIntensive(INNER_LOOP))
      const unsafeTime = bench(() => unsafeIntensive(INNER_LOOP))

      console.log(
        `\n  Intensive inner loop (${CALLS.toLocaleString()} calls × ${INNER_LOOP} iterations)` +
          ` — in-process, JIT-history dependent; NOT a benchmark. Use \`bun run bench\`.`
      )
      console.log(`    Legacy JS:  ${legacyTime.toFixed(2)}ms`)
      console.log(`    TJS:        ${tjsTime.toFixed(2)}ms`)
      console.log(`    TJS unsafe: ${unsafeTime.toFixed(2)}ms`)

      const expected = 332833500
      expect(legacyIntensive(INNER_LOOP)).toBe(expected)
      expect(tjsIntensive(INNER_LOOP)).toBe(expected)
      expect(unsafeIntensive(INNER_LOOP)).toBe(expected)
    })
    it('should measure error path overhead for try block', () => {
      const tryResult = tjs(`
        function tryThrow(x: 0): 0 {
          try {
            if (x < 0) throw new Error('negative')
            return x
          }
        }
      `)
      const tryThrow = new Function(`${tryResult.code}; return tryThrow;`)()

      const successTime = benchmark('success', () => tryThrow(42))

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

      expect(tryThrow(42)).toBe(42)
      const err = tryThrow(-1)
      expect(err).toBeInstanceOf(Error)
    })
  })
  describe('Runtime wrap() overhead', () => {
    it('should measure wrap() validation overhead', () => {
      function unwrappedAdd(a, b) {
        return a + b
      }

      const wrappedAdd = wrap((a, b) => a + b, {
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

      expect(unwrappedAdd(2, 3)).toBe(5)
      expect(wrappedAdd(2, 3)).toBe(5)
    })
    it('should measure error propagation overhead', () => {
      const step1 = wrap((x) => x * 2, {
        params: { x: { type: 'number', required: true } },
      })
      const step2 = wrap((x) => x + 10, {
        params: { x: { type: 'number', required: true } },
      })
      const step3 = wrap((x) => x / 2, {
        params: { x: { type: 'number', required: true } },
      })

      const chain = (x) => (x * 2 + 10) / 2
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

      expect(chain(5)).toBe(10)
      expect(step3(step2(step1(5)))).toBe(10)
    })
    it('should compare wrap() vs unsafe (!) overhead', () => {
      const wrappedAdd = wrap((a, b) => a + b, {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
      })

      const unsafeResult = tjs(`
        function unsafeAdd(! a: 0, b: 0): 0 {
          return a + b
        }
      `)
      const unsafeAdd = new Function(
        `${unsafeResult.code}; return unsafeAdd;`
      )()

      const plainAdd = (a, b) => a + b
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

      expect(plainAdd(2, 3)).toBe(5)
      expect(wrappedAdd(2, 3)).toBe(5)
      expect(unsafeAdd(2, 3)).toBe(5)
    })
    it('should measure error short-circuit benefit', () => {
      let step2Called = 0
      let step3Called = 0
      const errorStep = wrap(
        (x) => {
          if (x < 0) return { $error: true, message: 'negative' }
          return x
        },
        { params: { x: { type: 'number', required: true } } }
      )
      const step2 = wrap(
        (x) => {
          step2Called++
          return x * 2
        },
        { params: { x: { type: 'number', required: true } } }
      )
      const step3 = wrap(
        (x) => {
          step3Called++
          return x + 10
        },
        { params: { x: { type: 'number', required: true } } }
      )

      const errorResult = step3(step2(errorStep(-1)))
      console.log(`\n  Error short-circuit:`)
      console.log(`    step2 called: ${step2Called} times (should be 0)`)
      console.log(`    step3 called: ${step3Called} times (should be 0)`)
      expect(isError(errorResult)).toBe(true)
      expect(step2Called).toBe(0)
      expect(step3Called).toBe(0)
    })
  })
  describe('Safety levels overhead', () => {
    it('should compare all safety levels', () => {
      const plain = (x) => x * 2

      const createWrapped = () =>
        wrap((x) => x * 2, {
          params: { x: { type: 'number', required: true } },
          returns: { type: 'number' },
        })

      configure({ safety: 'none' })
      const wrappedNone = createWrapped()
      const noneTime = benchmark('none', () => wrappedNone(5))

      configure({ safety: 'inputs' })
      const wrappedInputs = createWrapped()
      const inputsTime = benchmark('inputs', () => wrappedInputs(5))

      configure({ safety: 'all' })
      const wrappedAll = createWrapped()
      const allTime = benchmark('all', () => wrappedAll(5))

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

      configure({ safety: 'inputs' })

      expect(plain(5)).toBe(10)
      expect(wrappedNone(5)).toBe(10)
      expect(wrappedInputs(5)).toBe(10)
      expect(wrappedAll(5)).toBe(10)
    })

    it('should measure per-function safety flags', () => {
      configure({ safety: 'none' })

      const baseFn = (x) => x * 2

      const normal = wrap(baseFn, {
        params: { x: { type: 'number', required: true } },
      })

      const safe = wrap(baseFn, {
        params: { x: { type: 'number', required: true } },
        safe: true,
      })

      const unsafe = wrap(baseFn, {
        params: { x: { type: 'number', required: true } },
        unsafe: true,
      })

      expect(unsafe).toBe(baseFn)

      for (let i = 0; i < 1000; i++) {
        baseFn(5)
        normal(5)
        safe(5)
      }

      const plainTime = benchmark('plain', () => baseFn(5))
      const normalTime = benchmark('normal', () => normal(5))
      const safeTime = benchmark('safe', () => safe(5))

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

      configure({ safety: 'inputs' })
      expect(normal(5)).toBe(10)
      expect(safe(5)).toBe(10)
      expect(unsafe(5)).toBe(10)
    })
    it('should measure inputs-only vs all validation', () => {
      const plain = (x) => x * 2

      configure({ safety: 'inputs' })
      const inputsOnly = wrap((x) => x * 2, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
      })

      configure({ safety: 'all' })
      const allValidation = wrap((x) => x * 2, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
      })

      configure({ safety: 'inputs' })
      const safeReturn = wrap((x) => x * 2, {
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

      configure({ safety: 'inputs' })
      expect(inputsOnly(5)).toBe(10)
      expect(allValidation(5)).toBe(10)
      expect(safeReturn(5)).toBe(10)
    })
  })
})
export {}
