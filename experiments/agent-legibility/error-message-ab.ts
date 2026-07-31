/**
 * Error-message A/B — are OUR diagnostics good repair signals?
 *
 * Error messages are a product surface we fully control and have never measured. The
 * question is not "is the message accurate" (ours are) but "does it cause a fix". A
 * diagnostic that correctly names the problem and leaves the model to guess the remedy
 * is accurate and useless.
 *
 * Method: give the model broken code plus ONE error-message variant, ask for a fix, and
 * judge by transpiling + running the result. Everything else held constant, so the
 * message text is the only independent variable.
 *
 * Variants encode a ladder of helpfulness:
 *   silent   — "that didn't work" (floor: how much does ANY diagnostic buy?)
 *   actual   — exactly what we ship today (the control)
 *   withFix  — ours + what to do instead
 *   withExample — ours + a worked correction
 *
 * If `actual` ≈ `silent`, our messages are decoration. If `withFix` ≫ `actual`, we have a
 * cheap, purely-textual product improvement — no compiler work required.
 *
 *   bun experiments/agent-legibility/error-message-ab.ts
 */
import { ajs } from '../../src/transpiler/index'
import { AgentVM } from '../../src/vm'

const BASE = process.env.TJS_LLM_BASE_URL ?? 'http://localhost:10240/v1'
const MODEL =
  process.env.TJS_LLM_MODEL ?? 'mlx-community/Qwen2.5-1.5B-Instruct-4bit'
const SAMPLES = Number(process.env.ERR_SAMPLES ?? 4)

interface Case {
  name: string
  /** Broken source the model must repair. */
  broken: string
  args: Record<string, any>
  check: (r: any) => boolean
  /** Message variants for the SAME defect. */
  messages: Record<string, string>
}

const CASES: Case[] = [
  {
    name: 'for-loop',
    broken: `function sumToN(n: 0) {
  let total = 0
  for (let i = 1; i <= n; i++) {
    total = total + i
  }
  return { total }
}`,
    args: { n: 4 },
    check: (r) => r.result?.total === 10,
    messages: {
      silent: 'That code did not work.',
      // Verbatim what the transpiler emits today.
      actual: 'Unsupported statement type: ForStatement at <source>:3:2',
      withFix:
        'Unsupported statement type: ForStatement at <source>:3:2. ' +
        'AJS has no `for` loops — rewrite it as a `while` loop with a counter you ' +
        'declare before the loop and increment inside it.',
      withExample:
        'Unsupported statement type: ForStatement at <source>:3:2. ' +
        'AJS has no `for` loops. Use a `while` loop instead, like this:\n' +
        '  let i = 1\n  while (i <= n) {\n    total = total + i\n    i = i + 1\n  }',
    },
  },
  {
    name: 'non-object-return',
    broken: `function double(n: 0) {
  return n * 2
}`,
    args: { n: 5 },
    check: (r) =>
      r.result?.result === 10 ||
      r.result?.value === 10 ||
      r.result?.doubled === 10,
    messages: {
      silent: 'That code did not work.',
      actual: 'Agent must return an object, got number',
      withFix:
        'Agent must return an object, got number. ' +
        'Every AJS function must return an object literal, not a bare value — ' +
        'wrap the result in braces with a named property.',
      withExample:
        'Agent must return an object, got number. ' +
        'Every AJS function must return an object literal. Instead of `return n * 2`, ' +
        'write:\n  return { result: n * 2 }',
    },
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
      max_tokens: 500,
    }),
  })
  if (!res.ok) throw new Error(`LLM ${res.status}`)
  return (await res.json()).choices?.[0]?.message?.content ?? ''
}

const strip = (s: string) => {
  const f = s.match(/```(?:\w+)?\n([\s\S]*?)```/)
  return (f ? f[1] : s).trim()
}

async function repaired(code: string, c: Case): Promise<boolean> {
  try {
    const exec = await new AgentVM({}).run(ajs(code) as any, c.args)
    return c.check(exec)
  } catch {
    return false
  }
}

async function main() {
  console.log(`model=${MODEL}  samples=${SAMPLES}\n`)
  const variants = Object.keys(CASES[0].messages)
  const score: Record<string, { ok: number; n: number }> = {}
  for (const v of variants) score[v] = { ok: 0, n: 0 }

  for (const c of CASES) {
    for (const v of variants) {
      for (let i = 0; i < SAMPLES; i++) {
        score[v].n++
        try {
          const reply = await complete(
            'You fix AJS code. AJS is a JavaScript-like language for a sandboxed VM. ' +
              'Reply with ONLY the corrected function — no fences, no explanation.',
            `This code is wrong:\n\n${c.broken}\n\nThe error was:\n${c.messages[v]}\n\nFix it.`
          )
          if (await repaired(strip(reply), c)) score[v].ok++
        } catch {
          /* counted as a miss */
        }
      }
    }
    console.log(
      `${c.name.padEnd(20)} ` +
        variants.map((v) => `${v}:${score[v].ok}`).join('  ')
    )
  }

  console.log('\n--- repair rate by message variant ---')
  for (const v of variants.sort(
    (a, b) => score[b].ok / score[b].n - score[a].ok / score[a].n
  )) {
    const { ok, n } = score[v]
    console.log(
      `${String(Math.round((ok / n) * 100)).padStart(3)}%  ${v.padEnd(
        12
      )} (${ok}/${n})` + (v === 'actual' ? '   <- what we ship' : '')
    )
  }
}

if (import.meta.main) await main()
