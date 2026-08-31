/**
 * Does an INFERRED "all members defaulted ⇒ the object is optional" rule read wrongly?
 *
 * The proposal: in native `.tjs`, `f({ a = 1, b = 2 })` may be called as `f()`, because every
 * member already declares a fallback and the pattern-level `= {}` adds nothing. Today it
 * throws, exactly as JavaScript does.
 *
 * `docs/case-study-switch.md` is the reason this is a question rather than a patch. Its
 * finding: a construct whose SHAPE is JavaScript's, but whose behaviour is not, was read
 * **0/5 correct and 5/5 confidently wrong**. An inferred rule here has exactly that property —
 * the signal is the ABSENCE of `= {}`, so the code looks like ordinary JavaScript.
 *
 * ## What is measured
 *
 * One question, four arms, varying only the thing under test:
 *
 *   js-plain    `.js`, no `= {}`   — control. JavaScript throws. A model that gets this wrong
 *                                    is not reading carefully, and its other answers are noise.
 *   js-default  `.js`, with `= {}` — control. JavaScript works. Same reasoning, other way.
 *   tjs-plain   `.tjs`, no `= {}`  — THE ARM. Under the proposal this works. Does the reader
 *                                    say so, or import the JS prior?
 *   tjs-marked  `.tjs`, `{…}?`     — the explicit alternative. A visible mark, so there is
 *                                    nothing to infer.
 *
 * ## How to read the result
 *
 * From the switch work, and fixed before running: **correctness is stable, willingness to
 * commit is not.** So the columns are reported separately and the WRONG column is the one
 * that matters — a confident wrong answer ships bugs, a no-answer only wastes a lookup.
 * A ranking built on the correct-count alone did not replicate last time and was retracted.
 *
 * Not a study. One small model, N samples. It exists to catch a 5/5-wrong result before a
 * semantic divergence ships, which is the cheap half of the problem.
 *
 * Run: bun experiments/agent-legibility/destructured-optional-probe.ts
 * Env: GROK_MODEL (default google/gemma-4-e2b), GROK_SAMPLES (default 5)
 */
const BASE = process.env.TJS_LLM_BASE_URL || 'http://localhost:1234/v1'
const MODEL = process.env.GROK_MODEL || 'google/gemma-4-e2b'
const SAMPLES = Number(process.env.GROK_SAMPLES) || 5
const CALL_TIMEOUT_MS = 60_000

interface Arm {
  name: string
  file: string
  code: string
  /** What a correct reader says `f()` does. */
  answer: 'works' | 'throws'
  why: string
}

const BODY = `  return a + b\n}`

const ARMS: Arm[] = [
  {
    name: 'js-plain',
    file: 'demo.js',
    code: `function f({ a = 1, b = 2 }) {\n${BODY}`,
    answer: 'throws',
    why: 'CONTROL — JavaScript cannot destructure undefined. A wrong answer here means the model is not reading, and its other answers carry no weight.',
  },
  {
    name: 'js-default',
    file: 'demo.js',
    code: `function f({ a = 1, b = 2 } = {}) {\n${BODY}`,
    answer: 'works',
    why: 'CONTROL — the `= {}` is what makes it omittable in JavaScript.',
  },
  {
    name: 'tjs-plain',
    file: 'demo.tjs',
    code: `function f({ a = 1, b = 2 }) {\n${BODY}`,
    answer: 'works',
    why: 'THE ARM — the inferred rule. Shape is identical to js-plain, meaning is not.',
  },
  {
    name: 'tjs-marked',
    file: 'demo.tjs',
    code: `function f({ a = 1, b = 2 }?) {\n${BODY}`,
    answer: 'works',
    why: 'The explicit alternative. `?` marks the object optional, so nothing is inferred.',
  },
]

async function ask(arm: Arm): Promise<'works' | 'throws' | null> {
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You answer what a function call does. Reply with ONLY the word ' +
              'works or throws. /no_think',
          },
          {
            role: 'user',
            content: `This is ${arm.file}.\n\n${arm.code}\n\nCalling f() with no arguments — does it work, or does it throw?`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    })
    if (!res.ok) return null
    const msg = (await res.json()).choices?.[0]?.message ?? {}
    // A reasoning model can leave `content` empty and answer in `reasoning_content`
    // (see src/batteries/audit.ts messageText) — reading only `content` scores it null.
    const raw = String(msg.content || msg.reasoning_content || '')
    const t = raw.trim().toLowerCase()
    if (!t) return null
    // LAST occurrence: a thinking trace often states the wrong answer before correcting.
    const hits = [...t.matchAll(/\b(works|throws)\b/g)]
    return hits.length ? (hits[hits.length - 1][1] as 'works' | 'throws') : null
  } catch {
    return null
  }
}

async function main() {
  console.log(`\n  model: ${MODEL}   samples: ${SAMPLES}\n`)
  const rows: string[] = []
  let controlsClean = true

  for (const arm of ARMS) {
    let correct = 0
    let wrong = 0
    let none = 0
    for (let i = 0; i < SAMPLES; i++) {
      const a = await ask(arm)
      if (a === null) none++
      else if (a === arm.answer) correct++
      else wrong++
    }
    if (arm.name.startsWith('js-') && wrong > 0) controlsClean = false
    rows.push(
      `  ${arm.name.padEnd(12)} correct ${String(correct).padStart(
        2
      )}/${SAMPLES}` +
        `   WRONG ${String(wrong).padStart(2)}   no-answer ${String(
          none
        ).padStart(2)}   ${arm.why.slice(0, 58)}`
    )
    console.log(rows[rows.length - 1])
  }

  console.log(
    `\n  controls ${
      controlsClean ? 'clean' : 'DIRTY — the arms below carry no weight'
    }\n` +
      `  Read the WRONG column, not the correct one. A confident wrong answer ships bugs;\n` +
      `  a no-answer only costs a lookup. (case-study-switch.md §7)\n`
  )
}

main()
