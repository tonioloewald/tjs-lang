/**
 * Is JAVASCRIPT's destructured-default behaviour itself misread?
 *
 * The first probe (`destructured-optional-probe.ts`) asked whether TJS could infer
 * "all members defaulted ⇒ object optional". It could not: 4/5 confidently wrong. But its
 * CONTROLS were not clean either — gemma got plain JavaScript wrong 2/5, qwen 1/5 — and that
 * was written off as instrument noise.
 *
 * That may have been the wrong call. If the JavaScript baseline is itself unreliable, then
 * "TJS diverges from JS" is a weaker objection than it sounds: you cannot lose a clarity you
 * never had. `new Boolean(false)` being truthy is the canonical example — a rule everyone
 * gets wrong, which is why `guides/footguns.md` exists.
 *
 * So this probe treats JavaScript as an ARM, not a control, and asks two questions instead of
 * one:
 *
 *   arity   "Can f() be called with no arguments?"        — the optionality question
 *   fill    "f({ a: 5 }) — what is b?"                    — the partial-payload question
 *
 * The second matters because it is where JS and TJS AGREE (both fill `b` from its default),
 * so a wrong answer there is not a TJS problem at all — it is evidence the construct is hard
 * regardless of language.
 *
 * ## Reading it
 *
 * Same rule as before (`docs/case-study-switch.md` §7): report correct / wrong / no-answer
 * separately, and weight the WRONG column. What is new is the comparison BETWEEN languages on
 * the same question. Three outcomes are interesting:
 *
 *   - JS read reliably, TJS not  -> TJS is making things worse. Do not ship the inferred rule.
 *   - Both read badly            -> the construct is a footgun in both. A visible mark is an
 *                                   improvement over the status quo, not a regression from it.
 *   - Both read well             -> the first probe's dirty controls really were noise.
 *
 * Run: bun experiments/agent-legibility/destructured-baseline-probe.ts
 * Env: GROK_MODEL (default qwen/qwen3.8-27b — the first probe showed gemma-4-e2b cannot
 *      answer the baseline), GROK_SAMPLES (default 5)
 */
const BASE = process.env.TJS_LLM_BASE_URL || 'http://localhost:1234/v1'
const MODEL = process.env.GROK_MODEL || 'qwen/qwen3.8-27b'
const SAMPLES = Number(process.env.GROK_SAMPLES) || 5
const CALL_TIMEOUT_MS = 90_000

type Question = 'arity' | 'fill'

interface Arm {
  name: string
  file: string
  code: string
  /** Correct answers, per question. `null` = not asked for this arm. */
  arity: 'yes' | 'no'
  fill: string
}

const BODY = `  return [a, b]\n}`

const ARMS: Arm[] = [
  {
    name: 'js-plain',
    file: 'demo.js',
    code: `function f({ a = 1, b = 2 }) {\n${BODY}`,
    // JavaScript cannot destructure undefined.
    arity: 'no',
    fill: '2',
  },
  {
    name: 'js-default',
    file: 'demo.js',
    code: `function f({ a = 1, b = 2 } = {}) {\n${BODY}`,
    arity: 'yes',
    fill: '2',
  },
  {
    name: 'ts-plain',
    file: 'demo.ts',
    code: `function f({ a = 1, b = 2 }: { a?: number; b?: number }) {\n${BODY}`,
    // Identical to js-plain at runtime — the annotation changes nothing.
    arity: 'no',
    fill: '2',
  },
  {
    name: 'tjs-marked',
    file: 'demo.tjs',
    code: `function f({ a = 1, b = 2 }?) {\n${BODY}`,
    arity: 'yes',
    fill: '2',
  },
]

const PROMPTS: Record<Question, { system: string; ask: (a: Arm) => string }> = {
  arity: {
    system:
      'You answer whether a call is allowed. Reply with ONLY the word yes or no. /no_think',
    ask: (a) =>
      `This is ${a.file}.\n\n${a.code}\n\nCan f() be called with no arguments at all?`,
  },
  fill: {
    system:
      'You answer what a variable holds. Reply with ONLY a number. /no_think',
    ask: (a) =>
      `This is ${a.file}.\n\n${a.code}\n\nInside the call f({ a: 5 }), what is the value of b?`,
  },
}

async function ask(arm: Arm, q: Question): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: PROMPTS[q].system },
          { role: 'user', content: PROMPTS[q].ask(arm) },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    })
    if (!res.ok) return null
    const msg = (await res.json()).choices?.[0]?.message ?? {}
    // A reasoning model can leave `content` empty and answer in `reasoning_content`.
    const t = String(msg.content || msg.reasoning_content || '')
      .trim()
      .toLowerCase()
    if (!t) return null
    // LAST match: a thinking trace often states a wrong answer before correcting itself.
    const pat = q === 'arity' ? /\b(yes|no)\b/g : /\b(\d+|undefined)\b/g
    const hits = [...t.matchAll(pat)]
    return hits.length ? hits[hits.length - 1][1] : null
  } catch {
    return null
  }
}

async function main() {
  console.log(`\n  model: ${MODEL}   samples: ${SAMPLES}\n`)
  console.log(
    '  arm            question   correct   WRONG   no-answer   expected'
  )
  console.log('  ' + '─'.repeat(66))
  for (const arm of ARMS) {
    for (const q of ['arity', 'fill'] as Question[]) {
      const want = q === 'arity' ? arm.arity : arm.fill
      let correct = 0
      let wrong = 0
      let none = 0
      for (let i = 0; i < SAMPLES; i++) {
        const a = await ask(arm, q)
        if (a === null) none++
        else if (a === want) correct++
        else wrong++
      }
      console.log(
        `  ${arm.name.padEnd(14)} ${q.padEnd(10)} ${String(correct).padStart(
          5
        )}/${SAMPLES}   ${String(wrong).padStart(5)}   ${String(none).padStart(
          9
        )}   ${want}`
      )
    }
  }
  console.log(
    '\n  If JS/TS read as badly as TJS, the construct is a footgun in every language and a\n' +
      '  visible mark is an improvement on the status quo rather than a regression from it.\n'
  )
}

main()
