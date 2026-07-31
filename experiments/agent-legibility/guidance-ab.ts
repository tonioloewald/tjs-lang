/**
 * Guidance optimizer — A/B our own documentation against a small model.
 *
 * The grokkability lane answers "can a small model write AJS?" with ONE fixed guide.
 * This answers the more useful question: **which guidance makes it succeed more often?**
 * Cheat sheets, prompt guides, `llms.txt`, example selection — all of it is currently
 * written by intuition and never measured. AJS is explicitly designed to be easy for
 * small models, so the guidance that unlocks that is a product surface, not a README.
 *
 * Method: hold model, tasks, sample count and temperature fixed; vary ONLY the guidance
 * text. Every candidate is judged the same way the real thing is — transpile it, run it
 * in the VM, check the result. Report success rate per variant AND the failure-mode
 * breakdown, because *what* a variant fails to convey is the actionable part: "40% of
 * misses are 'Unknown Atom'" tells you the atom list is the weak section.
 *
 * Usage:
 *   bun experiments/agent-legibility/guidance-ab.ts            # all variants
 *   GUIDANCE_SAMPLES=5 bun experiments/agent-legibility/guidance-ab.ts
 *
 * Interpretation caveat: with N samples per cell this measures a rate with real
 * variance. Treat a <10-point gap at N=3 as noise; raise GUIDANCE_SAMPLES before
 * concluding a variant is better. The failure-mode histogram is usually more
 * informative than the rate at small N.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { ajs } from '../../src/transpiler'
import { AgentVM } from '../../src/vm'

const BASE = process.env.TJS_LLM_BASE_URL ?? 'http://localhost:10240/v1'
const MODEL =
  process.env.TJS_LLM_MODEL ?? 'mlx-community/Qwen2.5-1.5B-Instruct-4bit'
const SAMPLES = Number(process.env.GUIDANCE_SAMPLES ?? 3)

const ROOT = join(import.meta.dir, '../..')
const FULL_GUIDE = readFileSync(join(ROOT, 'guides/ajs-llm-prompt.md'), 'utf8')

/**
 * Guidance variants under test.
 *
 * `full` is the shipped guide — the control. The others are hypotheses about what
 * actually carries the weight: is it the prose rules, the worked examples, or just a
 * terse syntax reminder? Add a variant here to test a docs change BEFORE shipping it.
 */
const VARIANTS: Record<string, string> = {
  /** Control: exactly what we ship today. */
  full: FULL_GUIDE,

  /** Hypothesis: the worked examples do the work; the prose is ballast. */
  examplesOnly: FULL_GUIDE.split('\n')
    .filter((l, i, all) => {
      // keep fenced blocks and their immediate headings
      let inFence = false
      for (let j = 0; j <= i; j++)
        if (all[j].startsWith('```')) inFence = !inFence
      return inFence || all[i].startsWith('```') || /^#{1,3} /.test(l)
    })
    .join('\n'),

  /** Hypothesis: a terse cheat sheet beats a long document for a small model. */
  cheatsheet: `You write AJS: JavaScript-like code that compiles to a JSON AST for a sandboxed VM.

RULES
- One function per file. Parameters use EXAMPLE VALUES as types: (n: 0) means a number, (s: '') a string.
- Use let for variables. Use while for loops (no for/of).
- Return an OBJECT, always: return { result: x }
- Call built-in atoms as plain functions: template({tmpl, vars}), httpFetch({url}).
- No imports, no classes, no arrow functions in expressions, no computed member access with variables.

EXAMPLE
function factorial(n: 0) {
  let result = 1
  let i = n
  while (i > 1) {
    result = result * i
    i = i - 1
  }
  return { result }
}`,

  /** Floor: no guidance at all, to size how much the docs are worth. */
  none: `You write AJS, a JavaScript-like language that compiles to a JSON AST.`,
}

interface Task {
  name: string
  ask: string
  args: Record<string, any>
  check: (r: any) => boolean
}

const TASKS: Task[] = [
  {
    name: 'factorial',
    ask: 'Write an AJS function called "factorial" that takes a required number parameter "n" and returns an object with property "result" containing the factorial. factorial(5) is 120.',
    args: { n: 5 },
    check: (r) => r.result?.result === 120,
  },
  {
    name: 'sumToN',
    ask: 'Write an AJS function called "sumToN" that takes a required number parameter "n" and returns an object with property "total" containing the sum of all integers from 1 to n. sumToN(4) is 10.',
    args: { n: 4 },
    check: (r) => r.result?.total === 10,
  },
  {
    name: 'countdown',
    ask: 'Write an AJS function called "countdown" that takes a required number parameter "n" and returns an object with property "steps" containing how many times you can subtract 1 from n before reaching 0. countdown(3) is 3.',
    args: { n: 3 },
    check: (r) => r.result?.steps === 3,
  },
]

async function complete(system: string, user: string): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      max_tokens: 600,
    }),
  })
  if (!res.ok) throw new Error(`LLM ${res.status}`)
  const d = await res.json()
  return d.choices?.[0]?.message?.content ?? ''
}

const strip = (s: string) => {
  const f = s.match(/```(?:\w+)?\n([\s\S]*?)```/)
  return (f ? f[1] : s).trim()
}

/** Judge exactly as production would: transpile → run in the VM → check the result. */
async function judge(code: string, task: Task): Promise<string | null> {
  try {
    const ast = ajs(code)
    const exec = await new AgentVM({}).run(ast as any, task.args)
    if (task.check(exec)) return null
    return exec.error
      ? `runtime: ${exec.error.message.slice(0, 40)}`
      : 'wrong result'
  } catch (e: any) {
    // Normalize to a failure CLASS — the histogram is the actionable output.
    const m = String(e?.message ?? e).split('\n')[0]
    if (/Unknown Atom/i.test(m)) return 'unknown atom'
    if (/Unexpected token|Parse|SyntaxError/i.test(m)) return 'syntax error'
    if (/must return an object/i.test(m)) return 'did not return object'
    if (/not supported|not yet supported/i.test(m))
      return 'unsupported construct'
    return m.slice(0, 46)
  }
}

async function main() {
  console.log(`model=${MODEL}  samples=${SAMPLES}  tasks=${TASKS.length}`)
  console.log(
    `variants: ${Object.entries(VARIANTS)
      .map(([k, v]) => `${k}(${Math.round(v.length / 100) / 10}k chars)`)
      .join(', ')}\n`
  )

  const summary: Array<{
    variant: string
    ok: number
    n: number
    misses: string[]
  }> = []

  for (const [name, guide] of Object.entries(VARIANTS)) {
    let ok = 0
    let n = 0
    const misses: string[] = []
    for (const task of TASKS) {
      for (let i = 0; i < SAMPLES; i++) {
        n++
        try {
          const reply = await complete(
            `${guide}\n\nRespond with ONLY the function code — no markdown fences, no explanation.`,
            task.ask
          )
          const miss = await judge(strip(reply), task)
          if (miss === null) ok++
          else misses.push(miss)
        } catch (e: any) {
          misses.push(`harness: ${e.message.slice(0, 30)}`)
        }
      }
    }
    summary.push({ variant: name, ok, n, misses })
    const hist = misses.reduce<Record<string, number>>((a, m) => {
      a[m] = (a[m] || 0) + 1
      return a
    }, {})
    console.log(
      `${name.padEnd(13)} ${ok}/${n} = ${String(
        Math.round((ok / n) * 100)
      ).padStart(3)}%   ` +
        Object.entries(hist)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([m, c]) => `${c}× ${m}`)
          .join(' | ')
    )
  }

  console.log('\n--- ranking ---')
  for (const s of [...summary].sort((a, b) => b.ok / b.n - a.ok / a.n)) {
    console.log(
      `${String(Math.round((s.ok / s.n) * 100)).padStart(3)}%  ${s.variant}` +
        `${s.variant === 'full' ? '   <- shipped guide (control)' : ''}`
    )
  }
}

if (import.meta.main) await main()
