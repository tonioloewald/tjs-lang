/**
 * Tests for playground examples
 *
 * By default, uses LM Studio if available. Set SKIP_LLM_TESTS=1 to use mocks.
 * Vision tests require a vision-capable model.
 */

// Provide browser globals (document, window, etc.) for capabilities.ts
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import {
  checkVision,
  isEmbeddingModel,
  looksLikeVisionModel,
} from '../src/batteries/audit'
import { VISION_MODEL, LLM_BASE_URL } from '../src/batteries/config'
GlobalRegistrator.register()

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

afterAll(() => {
  GlobalRegistrator.unregister()
})

// Poison pill: detect concurrent execution
let activeTests = 0
let maxConcurrentTests = 0

function trackTestStart() {
  activeTests++
  maxConcurrentTests = Math.max(maxConcurrentTests, activeTests)
}

function trackTestEnd() {
  activeTests--
}
import { examples } from './src/examples'
import { AgentVM, transpile, coreAtoms, batteryAtoms, tjs } from '../src'
import { withRetry } from '../src/test-utils'

import {
  buildLLMCapability,
  buildLLMBattery,
  getLocalModels,
  type LLMSettings,
} from './src/capabilities'

// Use the SAME code path as the playground
// The backend is a CONFIG choice, not a constant. This was pinned to LM Studio's port, so
// the demo examples silently ran against nothing when the server was MLX — reporting
// "0 models, 0 vision-capable" rather than an error. `LLM_BASE_URL` honours
// TJS_LLM_BASE_URL and falls back to the LM Studio default.
const LM_STUDIO_URL = LLM_BASE_URL

// Test settings that mirror what the playground uses
const testSettings: LLMSettings = {
  preferredProvider: 'custom',
  customLlmUrl: LM_STUDIO_URL,
  openaiKey: '',
  anthropicKey: '',
  deepseekKey: '',
}

let llmCapability: ReturnType<typeof buildLLMCapability>
let llmBattery: ReturnType<typeof buildLLMBattery>
let hasLLM = false
let hasVision = false

// The capability objects the tests actually inject. Set in beforeAll to either
// the live builders wrapped in a mock fallback (when LM Studio is up) or the
// mocks (when it isn't / SKIP_LLM_TESTS). See withLiveFallback below.
let activeLLM: { predict: (...a: any[]) => Promise<any> }
let activeBattery: { predict: (...a: any[]) => Promise<any>; embed?: any }

// A NAME HINT, not a filter. Model ids are a terrible way to detect multimodality — this
// list had `gemma-3` but not `gemma-4`, so a genuinely vision-capable model was excluded
// and every vision example silently skipped. (Exactly the defect that makes
// mlx-omni-server refuse all VLMs but one.) It is now only used to decide what to PROBE
// FIRST; `checkVision` decides the answer, because it actually asks the model.
// (`looksLikeVisionModel` / `isEmbeddingModel` now live in src/batteries/audit.ts —
// three copies of the name heuristic had drifted apart, one of them stale.)

// Mock fetch for HTTP APIs (weather, iTunes, GitHub) - these we still mock
// because they're external APIs, not local LLM
const createHttpFetchCapability = () => {
  // Load real images from disk for tests
  const fs = require('fs')
  const path = require('path')
  const staticDir = path.join(__dirname, 'static')
  const testDataDir = path.join(__dirname, '..', 'test-data')

  const loadImage = (dir: string, filename: string): Uint8Array => {
    try {
      const buffer = fs.readFileSync(path.join(dir, filename))
      return new Uint8Array(buffer)
    } catch {
      // Fallback to minimal JPEG header if file not found
      return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    }
  }

  const mockResponses: Record<string, { body: any; contentType: string }> = {
    '/photo-1.jpg': {
      body: loadImage(staticDir, 'photo-1.jpg'),
      contentType: 'image/jpeg',
    },
    '/photo-2.jpg': {
      body: loadImage(staticDir, 'photo-2.jpg'),
      contentType: 'image/jpeg',
    },
    '/test-shapes.jpg': {
      body: loadImage(testDataDir, 'test-shapes.jpg'),
      contentType: 'image/jpeg',
    },
    '/test-text.jpg': {
      body: loadImage(testDataDir, 'test-text.jpg'),
      contentType: 'image/jpeg',
    },
  }

  const jsonResponses: Record<string, any> = {
    'open-meteo.com': {
      current_weather: {
        temperature: 18.5,
        windspeed: 12.3,
        weathercode: 1,
        time: '2024-01-15T12:00',
      },
    },
    'itunes.apple.com': {
      resultCount: 3,
      results: [
        {
          artistName: 'The Beatles',
          trackName: 'Yesterday',
          collectionName: 'Help!',
        },
        {
          artistName: 'The Beatles',
          trackName: 'Yesterday',
          collectionName: '1',
        },
        {
          artistName: 'Frank Sinatra',
          trackName: 'Yesterday',
          collectionName: 'My Way',
        },
      ],
    },
    'api.github.com': {
      total_count: 2,
      items: [
        {
          full_name: 'user/tosijs',
          stargazers_count: 100,
          description: 'A great library',
        },
        {
          full_name: 'other/tosijs-demo',
          stargazers_count: 50,
          description: 'Demo project',
        },
      ],
    },
  }

  return async (url: string, options?: any) => {
    let response: Response | undefined

    for (const [path, data] of Object.entries(mockResponses)) {
      if (url.endsWith(path)) {
        response = new Response(data.body, {
          headers: { 'content-type': data.contentType },
        })
        break
      }
    }

    if (!response) {
      for (const [domain, jsonData] of Object.entries(jsonResponses)) {
        if (url.includes(domain)) {
          response = new Response(JSON.stringify(jsonData), {
            headers: { 'content-type': 'application/json' },
          })
          break
        }
      }
    }

    if (!response && url.includes('/texts/')) {
      response = new Response(
        'This is sample text content for testing the summarizer example.',
        { headers: { 'content-type': 'text/plain' } }
      )
    }

    if (!response) {
      throw new Error(`Unmocked URL: ${url}`)
    }

    // Same dataUrl handling as playground.ts
    if (options?.responseType === 'dataUrl') {
      const buffer = await response.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      const ct =
        response.headers.get('content-type') || 'application/octet-stream'
      return `data:${ct};base64,${base64}`
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return response.json()
    }
    return response.text()
  }
}

const httpFetch = createHttpFetchCapability()

// Simple mock LLM for when LM Studio isn't available
const mockLLM = {
  predict: async (prompt: string) => {
    if (prompt.includes('capital of France')) return 'Paris'
    if (prompt.includes('Summarize'))
      return 'This is a summary of the provided text.'
    if (prompt.includes('Extract person info')) {
      return JSON.stringify({
        name: 'John Smith',
        age: 35,
        occupation: 'software engineer',
        location: 'San Francisco',
        hobbies: ['hiking', 'photography'],
      })
    }
    if (prompt.includes('cover versions') || prompt.includes('NOT by')) {
      return JSON.stringify({
        covers: [
          { track: 'Yesterday', artist: 'Frank Sinatra', album: 'My Way' },
        ],
      })
    }
    if (prompt.includes('Extract the math expression')) return '23 * 47 + 156'
    if (prompt.includes('Calculate:')) return '1237'
    if (prompt.includes('friendly response')) return 'The answer is 1,237!'
    if (prompt.includes('research agent'))
      return '1. Point one\n2. Point two\n3. Point three'
    if (prompt.includes('writer agent'))
      return 'This is a well-written paragraph.'
    if (prompt.includes('editor agent'))
      return 'Suggestion: Add more detail.\n\nImproved: Better paragraph.'
    // LLM Code Solver - generate valid AsyncJS code (Fibonacci)
    if (prompt.includes('function called "solve"')) {
      return `function solve() {
  let a = 0
  let b = 1
  let i = 0
  while (i < 10) {
    let temp = a + b
    a = b
    b = temp
    i = i + 1
  }
  return { result: a }
}`
    }
    // LLM Code Generator - return code without execution
    if (
      prompt.includes('Write an AsyncJS function') &&
      prompt.includes('factorial')
    ) {
      return JSON.stringify({
        code: `function factorial(n: 5) {
  let result = 1
  let i = n
  while (i > 1) {
    result = result * i
    i = i - 1
  }
  return { result }
}`,
        description: 'Calculates the factorial of n using iteration.',
      })
    }
    return 'Mock LLM response'
  },
}

// Mock LLM battery wrapper (for when LM Studio isn't available)
const mockLLMBattery = {
  predict: async (
    system: string,
    user: any,
    tools?: any[],
    responseFormat?: any
  ) => {
    const prompt = typeof user === 'string' ? user : user.text
    const content = await mockLLM.predict(prompt)
    return { content }
  },
  embed: async () => {
    throw new Error('Embedding not available in mock')
  },
}

/**
 * Wrap a LIVE capability so LM Studio flakiness degrades to the mock instead of
 * failing the release gate.
 *
 * The "runs successfully" tests assert that an example TRANSPILES AND EXECUTES
 * end to end — not that the model returned any particular content — so an LLM
 * infrastructure hiccup (a transient 400 mid-run, a dropped connection while a
 * model swaps) is not a code regression and must not block a tag. This retries
 * the live call once, then falls back to the mock with a visible warning, so the
 * gate blocks on code, never on LM Studio's health.
 *
 * Safe precisely because our LLM request/response shape is guarded deterministically
 * elsewhere (src/batteries/llm-transport.test.ts). A genuinely malformed request
 * would fail THAT suite loudly; degrading here cannot mask it. And a broken example
 * still fails: its transpile/VM error surfaces from vm.run, not from predict.
 */
/**
 * How many predicts went LIVE vs fell back to the mock.
 *
 * Without this the lane can rot to all-mock and stay green forever: every example would
 * still "run successfully", against a stub, proving nothing about the integration this
 * suite exists to prove. Observed in a real run — five fallback warnings, all tests green.
 * The floor is asserted at the end of the run (see the `describe` at the bottom).
 */
const liveCalls = { live: 0, fallback: 0 }

/**
 * How long one live model call may take before the harness stops waiting on it.
 *
 * Comfortably above a healthy vision inference and comfortably below the 120s test
 * timeout, so a slow server produces a labelled fallback instead of an unexplained red.
 */
const LIVE_BUDGET_MS = 45_000

function withLiveFallback<T extends { predict: (...a: any[]) => Promise<any> }>(
  live: T,
  mock: { predict: (...a: any[]) => Promise<any> },
  label: string
): T {
  const predict = async (...args: any[]) => {
    let lastErr: any
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        // A BUDGET, not just a try/catch.
        //
        // This degraded to the mock when the live model ERRORED, but not when it was
        // merely slow — so a loaded server did not fall back, it ran out the test's own
        // 120s timeout and failed the gate. Observed in a full `bun test`: the vision
        // examples timed out at 120s with "2 requests pending", and passed in 8s when run
        // alone. That is exactly the "blocks on code, not LM Studio health" case this
        // wrapper exists for; slowness just was not one of the failures it recognised.
        //
        // The budget is generous — vision inference on a local model is genuinely slow —
        // but it is well inside the test timeout, so exceeding it produces a labelled
        // fallback rather than an unexplained red.
        // The timer is CLEARED. `Promise.race` settles, it does not cancel the loser, so
        // an un-cleared timeout kept a 45s handle alive per call — which both holds the
        // process open and, in a suite making hundreds of calls, piles up handles for no
        // reason. The budget is a guard, not a schedule.
        let timer: ReturnType<typeof setTimeout> | undefined
        const result = await Promise.race([
          live.predict(...args),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`live LLM exceeded ${LIVE_BUDGET_MS}ms`)),
              LIVE_BUDGET_MS
            )
          }),
        ]).finally(() => clearTimeout(timer))
        liveCalls.live++
        return result
      } catch (e) {
        lastErr = e
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * attempt))
      }
    }
    liveCalls.fallback++
    console.warn(
      `[examples] ${label}: live LLM failed after retries ` +
        `(${String(lastErr?.message || lastErr).split('\n')[0]}); ` +
        'falling back to mock so the gate blocks on code, not LM Studio health.'
    )
    return mock.predict(...args)
  }
  return { ...live, predict }
}

beforeAll(async () => {
  // Skip LLM if SKIP_LLM_TESTS is set
  if (process.env.SKIP_LLM_TESTS) {
    console.log('SKIP_LLM_TESTS set, using mocks')
    hasLLM = false
    activeLLM = mockLLM
    activeBattery = mockLLMBattery
    return
  }

  // Use the SAME builders as the playground
  llmCapability = buildLLMCapability(testSettings)
  llmBattery = buildLLMBattery(testSettings)
  hasLLM = llmCapability !== null

  if (hasLLM) {
    // Vision capability, via the SHARED probe in batteries/audit.ts.
    //
    // This used to be a local copy, and it had drifted: it still sent a 1x1 PNG, which real
    // vision preprocessors reject ("Cannot handle this data type: (1,1,1)"). That bug was
    // found and fixed once — in audit.ts — and the duplicate here kept it alive, quietly
    // false-negativing genuinely multimodal models so every vision test self-skipped.
    //
    // A DECLARED model is checked first, because on-demand servers (mlx-omni-server) report
    // an EMPTY /v1/models: there is nothing to discover, so discovery alone finds no vision.
    try {
      if (VISION_MODEL) {
        hasVision = await checkVision(LM_STUDIO_URL, VISION_MODEL)
        console.log(
          `Vision: ${VISION_MODEL} (declared) → ${
            hasVision ? 'works' : 'NOT usable'
          }`
        )
      } else {
        const models = await getLocalModels(LM_STUDIO_URL)
        // Probe likely candidates first, but do not EXCLUDE on the name — only
        // `checkVision` knows, because only it asks.
        const candidates = models
          .filter((m) => !isEmbeddingModel(m))
          .sort(
            (a, b) =>
              Number(looksLikeVisionModel(b)) - Number(looksLikeVisionModel(a))
          )
        console.log(
          `${models.length} models, ${candidates.length} chat candidates`
        )
        for (const model of candidates) {
          if (await checkVision(LM_STUDIO_URL, model)) {
            hasVision = true
            console.log(`Vision: ${model} → works`)
            break
          }
        }
      }
    } catch (e) {
      console.log('Could not determine vision capability:', e)
    }
  } else {
    console.log('No LLM configured, using mocks')
  }

  // Live if available (wrapped so a flaky LM Studio degrades to the mock), else mock.
  activeLLM = hasLLM ? withLiveFallback(llmCapability, mockLLM, 'llm') : mockLLM
  activeBattery = hasLLM
    ? withLiveFallback(llmBattery, mockLLMBattery, 'llmBattery')
    : mockLLMBattery
}, 30000)

describe('Playground Examples', () => {
  const vm = new AgentVM({ ...coreAtoms, ...batteryAtoms })

  it('every example declares a language this test can route (apparatus check)', () => {
    // The routing used to be a guess, and the guess was wrong for one example — which
    // meant it was checked by the WEAKER branch and an AJS regression in it would have
    // gone unnoticed. If a future example declares something unroutable, fail here rather
    // than silently falling into the AJS branch.
    for (const e of examples) {
      expect([undefined, 'ajs', 'tjs']).toContain(e.lang)
    }
    // And the file really is all AsyncJS today. If that stops being true, the person who
    // adds a TJS example has to say so.
    expect(examples.every((e) => (e.lang ?? 'ajs') === 'ajs')).toBe(true)
  })

  for (const example of examples) {
    const isVision = example.name.startsWith('Vision:')
    const shouldFail =
      example.name === 'Fuel Exhaustion' || example.name === 'Fuel Limits'
    // Examples that generate and run code need retry due to LLM variability
    const needsRetry = example.code.includes('runCode(')
    // DECLARED, not sniffed — see the `lang` field on `Example`.
    const isTjs = example.lang === 'tjs'

    it(`${example.name} - transpiles correctly`, () => {
      if (isTjs) {
        // TJS examples use the TJS transpiler
        const result = tjs(example.code)
        expect(result.code).toBeDefined()
        expect(result.metadata).toBeDefined()
      } else {
        const result = transpile(example.code)
        expect(result.ast).toBeDefined()
        expect(result.error).toBeUndefined()
      }
    })

    if (shouldFail) {
      it(`${example.name} - runs out of fuel as expected`, async () => {
        const result = transpile(example.code)
        const runResult = await vm.run(result.ast, {}, { fuel: 1000 })
        expect(runResult.error).toBeDefined()
        const errorMsg =
          typeof runResult.error === 'string'
            ? runResult.error
            : runResult.error?.message || JSON.stringify(runResult.error)
        expect(errorMsg.toLowerCase()).toContain('fuel')
      })
    } else if (isVision) {
      // Vision tests - check hasVision at runtime, not registration time
      it(`${example.name} - runs successfully`, async () => {
        if (!hasVision) {
          console.log(`Skipping ${example.name}: no vision model available`)
          return // Skip gracefully at runtime
        }

        trackTestStart()
        try {
          const result = transpile(example.code)

          const args: Record<string, any> = {}
          if (result.signature?.parameters) {
            for (const [key, param] of Object.entries(
              result.signature.parameters
            )) {
              if ('default' in param) {
                args[key] = param.default
              }
            }
          }

          // Override with small test images for faster tests
          if (example.name === 'Vision: OCR') {
            args.imageUrl = '/test-text.jpg'
          } else if (example.name === 'Vision: Classification') {
            args.imageUrl = '/test-shapes.jpg'
          }

          // Use the SAME capabilities as the playground.
          // Vision inference on a local model can take a while; give it an
          // explicit budget well above the slow-atom timeout so the test is
          // deterministic regardless of the run-level default.
          const runResult = await vm.run(result.ast, args, {
            fuel: 100000,
            timeoutMs: 180000,
            capabilities: {
              fetch: httpFetch,
              llm: activeLLM,
              llmBattery: activeBattery,
              code: {
                transpile: (source: string) => transpile(source).ast,
              },
            },
          })

          expect(runResult.error).toBeUndefined()
          expect(runResult.result).toBeDefined()
        } finally {
          trackTestEnd()
        }
      }, 240000) // bun-test timeout above the vm timeoutMs (180s) + overhead
    } else if (needsRetry) {
      // Examples that use runCode need retry due to LLM variability
      it(`${example.name} - runs successfully`, async () => {
        await withRetry(async () => {
          trackTestStart()
          try {
            const result = transpile(example.code)

            const args: Record<string, any> = {}
            if (result.signature?.parameters) {
              for (const [key, param] of Object.entries(
                result.signature.parameters
              )) {
                if ('default' in param) {
                  args[key] = param.default
                }
              }
            }

            const runResult = await vm.run(result.ast, args, {
              fuel: 100000,
              capabilities: {
                fetch: httpFetch,
                llm: activeLLM,
                llmBattery: activeBattery,
                code: {
                  transpile: (source: string) => transpile(source).ast,
                },
              },
            })

            if (runResult.error) {
              throw new Error(
                runResult.error.message || String(runResult.error)
              )
            }
            expect(runResult.result).toBeDefined()
          } finally {
            trackTestEnd()
          }
        })
      }, 360000) // 3 attempts * 120s each
    } else if (isTjs) {
      // TJS examples run via direct JS execution
      it(`${example.name} - runs successfully`, async () => {
        trackTestStart()
        try {
          const result = tjs(example.code)
          // Execute the transpiled JS code
          const fn = new Function(
            result.code + '\nreturn typeof greet === "function" ? greet : null'
          )
          const greetFn = fn()
          if (greetFn) {
            const output = greetFn('Test', 1)
            expect(output).toContain('Hello')
          }
        } finally {
          trackTestEnd()
        }
      }, 10000)
    } else {
      it(
        `${example.name} - runs successfully`,
        async () => {
          trackTestStart()
          try {
            const result = transpile(example.code)

            const args: Record<string, any> = {}
            if (result.signature?.parameters) {
              for (const [key, param] of Object.entries(
                result.signature.parameters
              )) {
                if ('default' in param) {
                  args[key] = param.default
                }
              }
            }

            // Use the SAME capabilities as the playground
            const runResult = await vm.run(result.ast, args, {
              fuel: 100000, // High fuel for real LLM calls
              capabilities: {
                fetch: httpFetch,
                llm: activeLLM,
                llmBattery: activeBattery,
                code: {
                  transpile: (source: string) => transpile(source).ast,
                },
              },
            })

            expect(runResult.error).toBeUndefined()
            expect(runResult.result).toBeDefined()
          } finally {
            trackTestEnd()
          }
          // Sized to the RETRY ARITHMETIC, not to a guess — the same reasoning as the vision
          // block above (`3 attempts * 120s each`).
          //
          // `withLiveFallback` budgets each live call at LIVE_BUDGET_MS and retries once, so a
          // single `predict` can cost ~90s before it degrades to the mock. An example making
          // several calls therefore could not fit in 120s however healthy the fallback was:
          // the Multi-Agent Pipeline example spent its whole budget on the first call and was
          // killed during the second. That kill then let the runner start the next test while
          // this one was still running, which tripped the file's concurrency poison pill — two
          // reds, one cause, and neither named it.
          //
          // Deliberately NOT fixed by latching "this channel is unhealthy, use the mock from
          // now on". That would bound the run, but it converts one transient blip into a
          // mostly-mocked run, which is precisely what the `did not silently degrade to mocks`
          // guard below exists to catch. Waiting is cheaper than losing coverage in a pre-tag
          // gate.
        },
        4 * (2 * LIVE_BUDGET_MS + 1000)
      ) // 4 live calls, worst case, with headroom
    }
  }

  // Poison pill: fail if tests ran concurrently
  it('tests must run sequentially (use --max-concurrency 1)', () => {
    expect(maxConcurrentTests).toBeLessThanOrEqual(1)
  })
})

describe('Example Code Quality', () => {
  it('all examples have unique names', () => {
    const names = examples.map((e) => e.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('all examples have descriptions', () => {
    for (const example of examples) {
      expect(example.description.length).toBeGreaterThan(5)
    }
  })

  it('LLM examples are marked with requiresApi', () => {
    for (const example of examples) {
      if (
        example.code.includes('llmPredict') ||
        example.code.includes('llmVision')
      ) {
        expect(example.requiresApi).toBe(true)
      }
    }
  })
})

// Guards the gate-resilience helper itself: a flaky live LLM must degrade to the
// mock, and a healthy one must pass through untouched. Deterministic (no LM Studio),
// so it runs in test:fast and proves the fallback without having to break a server.
describe('withLiveFallback — gate resilience', () => {
  it('retries once, then falls back to the mock when the live LLM keeps failing', async () => {
    let liveCalls = 0
    const brokenLive = {
      predict: async () => {
        liveCalls++
        throw new Error('LLM Error: 400 - transient')
      },
    }
    const mock = { predict: async () => 'MOCK CONTENT' }

    const wrapped = withLiveFallback(brokenLive, mock, 'test')
    expect(await wrapped.predict('anything')).toBe('MOCK CONTENT')
    expect(liveCalls).toBe(2) // one retry before giving up
  })

  it('passes the live result through untouched when it succeeds', async () => {
    let mockCalls = 0
    const live = { predict: async () => 'LIVE CONTENT' }
    const mock = {
      predict: async () => {
        mockCalls++
        return 'MOCK'
      },
    }
    expect(await withLiveFallback(live, mock, 'test').predict('x')).toBe(
      'LIVE CONTENT'
    )
    expect(mockCalls).toBe(0) // mock never touched on the happy path
  })

  it('preserves non-predict members (e.g. embed) of the live capability', () => {
    const live = { predict: async () => 'x', embed: async () => [1, 2, 3] }
    const wrapped = withLiveFallback(live, { predict: async () => 'm' }, 'test')
    expect(typeof wrapped.embed).toBe('function')
  })
})

/**
 * The live lane must actually BE live.
 *
 * `withLiveFallback` degrades a transient LM Studio hiccup to the mock so the release gate
 * blocks on code rather than on server health — which is right, and which also means the
 * whole suite can silently become a mock suite and stay green forever. Observed in a real
 * run: five fallback warnings, every test passing, nothing integrated.
 *
 * So: when a live LLM was configured, assert that most calls actually reached it. This is
 * the difference between "the examples run" and "the examples run against the thing they
 * claim to run against".
 */
describe('the live-LLM lane did not silently degrade to mocks', () => {
  it('most predicts reached the real model', () => {
    if (!hasLLM) {
      // No model configured — mocks are the intended path, not a degradation.
      expect(liveCalls.live + liveCalls.fallback).toBeGreaterThanOrEqual(0)
      return
    }
    const total = liveCalls.live + liveCalls.fallback
    if (total === 0) return // no example exercised predict in this run

    const liveRatio = liveCalls.live / total
    expect(
      liveRatio,
      `only ${liveCalls.live}/${total} predicts reached the live model — the rest fell ` +
        `back to mocks. Green here would mean the integration is untested, not working. ` +
        `Check LM Studio, or the request shape (src/batteries/llm-transport.test.ts).`
    ).toBeGreaterThan(0.5)
  })
})
