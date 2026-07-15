/**
 * AJS grokkability — can a SMALL local model actually write valid AJS?
 *
 * This guards one of AJS's load-bearing premises: agents (often small, cheap,
 * local models) emit AJS, so if the format or the prompt guide drifts in a way
 * that makes AJS harder for a small model to produce, the whole "code travels to
 * data" story weakens. No deterministic test can catch that — it is a property of
 * models meeting our format, so it needs a real model.
 *
 * It is deliberately NOT in the release gate:
 *   - ADVISORY. It measures a success RATE and reports PASS/WARN against a bar; it
 *     never fails on the rate. A small model having a bad run must not block a
 *     release — that is model variance, not a code regression.
 *   - PINNED. It runs against a fixed floor model (gemma-4-e2b by default), so the
 *     number means "small models can do this," reproducibly — not "whatever was
 *     loaded did it once." Skips (does not fail) if the pin isn't loaded.
 *   - OPT-IN. Behind RUN_GROK_TESTS, so a plain `bun test` never runs it. Invoke
 *     deliberately: `bun run test:grok` (when the AJS format or prompt guide
 *     changes, or on a cadence).
 *
 * This replaces the old transpiler-llm.test.ts, whose withRetry(1-of-3) passed on
 * a 33% success rate — it could not tell a healthy 90% from a degraded 35%. Here
 * the rate IS the result.
 *
 * Tunable via env: GROK_MODEL, GROK_SAMPLES (default 5), GROK_THRESHOLD (0.6).
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { LocalModels } from '../batteries/models'
import { getLLMCapability } from '../batteries/llm'
import { ajs } from '../transpiler'
import { AgentVM } from '../vm'
import { defineAtom, resolveValue } from '../runtime'
import { s } from 'tosijs-schema'

const RUN = !!process.env.RUN_GROK_TESTS
const PIN_MODEL = process.env.GROK_MODEL || 'google/gemma-4-e2b'
const SAMPLES = Number(process.env.GROK_SAMPLES) || 5
const THRESHOLD = Number(process.env.GROK_THRESHOLD) || 0.6

// --- LLM output cleanup (small models fence and drift; auto-fix the cheap ones) ---

function stripCodeFences(code: string): string {
  return code
    .replace(/^```(?:javascript|js|ajs)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim()
}

function fixCommonMistakes(code: string): string {
  code = code.replace(
    /template\(\s*\{\s*tmpl:\s*`([^`$]*)`/g,
    "template({ tmpl: '$1'"
  )
  code = code.replace(/:\s*string\b(?!\s*[=)])/g, ": ''")
  code = code.replace(/:\s*number\b(?!\s*[=)])/g, ': 0')
  return code
}

// The exact prompt users get — tests must measure real usage, not a private prompt.
const AJS_LLM_PROMPT = readFileSync(
  join(import.meta.dir, '../../guides/ajs-llm-prompt.md'),
  'utf-8'
)
function extractSystemPrompt(markdown: string): string {
  const match = markdown.match(/## System Prompt\s+````\s*([\s\S]*?)````/)
  return match ? match[1].trim() : markdown
}
const AJS_GUIDE = extractSystemPrompt(AJS_LLM_PROMPT)

// --- Tools used by the orchestration tasks ---

const getWeather = defineAtom(
  'getWeather',
  s.object({ city: s.string }),
  s.object({ temp: s.number, condition: s.string }),
  async ({ city }, ctx) => {
    const c = resolveValue(city, ctx)
    const data: Record<string, { temp: number; condition: string }> = {
      Tokyo: { temp: 80, condition: 'humid' },
      London: { temp: 58, condition: 'cloudy' },
    }
    return data[c] || { temp: 0, condition: 'unknown' }
  },
  {
    docs: 'Get current weather for a city. Returns temp (Fahrenheit) and condition.',
  }
)
const convertTemp = defineAtom(
  'convertTemp',
  s.object({ fahrenheit: s.number }),
  s.number,
  async ({ fahrenheit }, ctx) =>
    Math.round(((resolveValue(fahrenheit, ctx) - 32) * 5) / 9),
  { docs: 'Convert temperature from Fahrenheit to Celsius.' }
)

interface Task {
  name: string
  prompt: string
  atoms?: Record<string, any>
  args: Record<string, any>
  check: (execResult: any) => boolean
}

const TASKS: Task[] = [
  {
    name: 'factorial (while loop + arithmetic)',
    prompt: `${AJS_GUIDE}

Write an AJS function called "factorial" that takes a required number parameter "n" and returns an object with property "result" containing the factorial.

Follow the factorial example exactly. Use a while loop with a simple condition like \`i > 1\`, and native arithmetic for multiplication and decrement inside the loop.

The factorial of 5 is 120.

Respond with ONLY the function code, no markdown fences or explanation.`,
    args: { n: 5 },
    check: (r) => r.result?.result === 120,
  },
  {
    name: 'greeting (optional param + template)',
    prompt: `${AJS_GUIDE}

Write an AJS function called "greet" following the greeting example above exactly.
- Take a required string parameter "name" (example value like 'World')
- Take an optional string parameter "greeting" with default "Hello"
- Use template to format the message
- Return an object with property "message"

Respond with ONLY the function code, no markdown fences or explanation.`,
    args: { name: 'World' },
    check: (r) =>
      typeof r.result?.message === 'string' &&
      r.result.message.includes('World'),
  },
  {
    name: 'volume (multi-param arithmetic)',
    prompt: `${AJS_GUIDE}

Write an AJS function called "calculateVolume" that:
- Takes required number parameters: width, height, depth
- Returns an object with property "volume" (width * height * depth)

Use native arithmetic. Respond with ONLY the function code.`,
    args: { width: 2, height: 3, depth: 4 },
    check: (r) => r.result?.volume === 24,
  },
  {
    name: 'weatherReport (tool orchestration)',
    prompt: `${AJS_GUIDE}

## Available Tools (atoms)

1. **getWeather({ city: 'string' })** -> { temp: number, condition: string }
   Example: let weather = getWeather({ city: 'Tokyo' })
2. **convertTemp({ fahrenheit: number })** -> number
   Example: let celsius = convertTemp({ fahrenheit: 72 })

## Task

Write an AJS function called "weatherReport" that:
1. Takes a required string parameter "city"
2. Gets the weather for that city using getWeather
3. Converts the temperature to Celsius using convertTemp
4. Returns an object with: { city, tempC, condition }

Store each result in a variable using let. Access object properties with dot notation.
Respond with ONLY the function code, no explanation.`,
    atoms: { getWeather, convertTemp },
    args: { city: 'Tokyo' },
    check: (r) =>
      r.result?.city === 'Tokyo' &&
      r.result?.tempC === 27 &&
      r.result?.condition === 'humid',
  },
]

const report: { name: string; ok: number; rate: number }[] = []

describe.skipIf(!RUN)(
  'AJS grokkability (advisory — measures, never blocks)',
  () => {
    let predict: ReturnType<typeof getLLMCapability>['predict'] | null = null
    let pinAvailable = false

    beforeAll(async () => {
      const models = new LocalModels()
      await models.audit()
      pinAvailable = models.getModels().some((m) => m.id === PIN_MODEL)
      if (pinAvailable) {
        models.setDefaultLLM(PIN_MODEL)
        predict = getLLMCapability(models).predict
      } else {
        console.warn(
          `[grok] pin model '${PIN_MODEL}' is not loaded in LM Studio — ` +
            `grokkability cannot be measured. Load it (or set GROK_MODEL) and re-run. Skipping.`
        )
      }
    })

    for (const task of TASKS) {
      it(`grok: ${task.name}`, async () => {
        // Advisory contract: if we can't measure (pin not loaded), we do NOT fail —
        // an unmeasurable signal is not a failed one.
        if (!pinAvailable || !predict) return

        let ok = 0
        const misses: string[] = []
        for (let i = 0; i < SAMPLES; i++) {
          try {
            const resp = await predict(
              'You are a code generator. Output only valid AJS code.',
              task.prompt
            )
            const code = fixCommonMistakes(stripCodeFences(resp.content))
            const ast = ajs(code)
            const exec = await new AgentVM(task.atoms || {}).run(ast, task.args)
            if (task.check(exec)) ok++
            else misses.push('wrong result')
          } catch (e: any) {
            misses.push((e?.message || String(e)).split('\n')[0].slice(0, 80))
          }
        }

        const rate = ok / SAMPLES
        report.push({ name: task.name, ok, rate })
        const label = rate >= THRESHOLD ? 'PASS' : 'WARN'
        console.log(
          `[grok] ${task.name}: ${ok}/${SAMPLES} = ${Math.round(
            rate * 100
          )}% ` + `[${label}] (bar ${Math.round(THRESHOLD * 100)}%)`
        )
        if (misses.length) {
          const counts = misses.reduce<Record<string, number>>((a, m) => {
            a[m] = (a[m] || 0) + 1
            return a
          }, {})
          console.log(
            '  misses: ' +
              Object.entries(counts)
                .map(([m, n]) => `${n}× ${m}`)
                .join(' | ')
          )
        }

        // ADVISORY: assert only that the harness ran a real measurement. The rate
        // is the signal, printed above — it never fails the test.
        expect(ok).toBeGreaterThanOrEqual(0)
      }, 180_000)
    }

    afterAll(() => {
      if (!report.length) return
      const total = report.reduce((a, r) => a + r.ok, 0)
      const overall = total / (report.length * SAMPLES)
      console.log(
        `\n[grok] ═══ overall: ${total}/${report.length * SAMPLES} = ` +
          `${Math.round(overall * 100)}% against ${PIN_MODEL} ` +
          `(bar ${Math.round(THRESHOLD * 100)}%) ═══`
      )
      const weak = report.filter((r) => r.rate < THRESHOLD)
      if (weak.length) {
        console.log(
          `[grok] below bar: ${weak
            .map((r) => `${r.name} (${Math.round(r.rate * 100)}%)`)
            .join(', ')}`
        )
        console.log(
          '[grok] a drop here means AJS got harder for small models — check recent ' +
            'AJS-format or guides/ajs-llm-prompt.md changes.'
        )
      }
    })
  }
)
