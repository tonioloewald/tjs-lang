/**
 * Does `Exactly(…)` explain itself? (#45)
 *
 * The `switch` probe measured a construct with a **wrong prior**: every model has read
 * millions of C-family switches, so it confidently applied fallthrough and a comment was the
 * only thing that moved it (0/5 -> 5/5).
 *
 * `Exactly('a', 'b')` is the opposite case. No model has seen it, so there is no prior to
 * overcome — only a gap, and a name chosen to fill it. **If a well-chosen name does the work
 * of a comment, that is worth knowing before we decide what `convert` emits**, and it
 * generalises: it would mean the expensive intervention is only needed where we CONTRADICT
 * an existing habit, not everywhere we add something new.
 *
 * ## The question asked
 *
 * "Is `f('z')` a valid call — yes or no?" Validity, not the return value, because a model
 * cannot be expected to know TJS returns a `MonadicError` rather than throwing. Validity is
 * answerable from the annotation alone, and it discriminates cleanly:
 *
 *   - read as EXACT   -> no
 *   - read as EXAMPLE -> yes  (an example widens: `'a'` means "a string")
 *
 * ## Arms
 *
 * `ts_control`      `.ts`, `x: 'a' | 'b'` — TypeScript literal union. POSITIVE CONTROL: a
 *                   model definitely knows this one, so a wrong answer here means the
 *                   instrument cannot reason about call validity and nothing else counts.
 * `exactly_bare`    `.tjs`, `x: Exactly('a', 'b')` — the real question. Does the word suffice?
 * `exactly_comment` the same, plus a one-line rule comment.
 * `pipe_bare`       `.tjs`, `x: 'a' | 'b'` — what the CURRENT spelling conveys cold. Under
 *                   proposal B this becomes "any string", so a model answering "no" here is
 *                   reading it as TypeScript, which is precisely the confusion B removes.
 * `example_bare`    `.tjs`, `x: 'a'` — the example rule itself. Expected to score badly; it
 *                   is the baseline that says how much of TJS a model can infer unaided.
 *
 *   bun experiments/agent-legibility/exactly-probe.ts
 *
 * Env: TJS_LLM_MODEL, TJS_LLM_BASE_URL, PROBE_SAMPLES, PROBE_TIMEOUT_MS, PROBE_ARMS.
 */
const BASE = process.env.TJS_LLM_BASE_URL ?? 'http://localhost:1234/v1'
const MODEL = process.env.TJS_LLM_MODEL ?? 'qwen/qwen3.8-27b'
const SAMPLES = Number(process.env.PROBE_SAMPLES ?? 5)
const CALL_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 180_000)

interface Arm {
  lang: 'ts' | 'tjs'
  code: string
  /** 'no' = the call is rejected; 'yes' = accepted. */
  answer: 'yes' | 'no'
  why: string
}

const RULE =
  "// in .tjs a type is an EXAMPLE, so 'a' means any string; Exactly('a','b') means\n" +
  '// the value must BE one of those\n'

const ARMS: Record<string, Arm> = {
  ts_control: {
    lang: 'ts',
    code: `function f(x: 'a' | 'b') {\n  return x\n}`,
    answer: 'no',
    why: 'TypeScript literal union — the model definitely knows this',
  },
  exactly_bare: {
    lang: 'tjs',
    code: `function f(x: Exactly('a', 'b')) {\n  return x\n}`,
    answer: 'no',
    why: 'does the WORD carry it, with no comment and no prior?',
  },
  exactly_comment: {
    lang: 'tjs',
    code: RULE + `function f(x: Exactly('a', 'b')) {\n  return x\n}`,
    answer: 'no',
    why: 'the same, with the one-line rule that worked for switch',
  },
  pipe_bare: {
    lang: 'tjs',
    code: `function f(x: 'a' | 'b') {\n  return x\n}`,
    answer: 'no',
    why: 'what the CURRENT spelling conveys — today exact, under B "any string"',
  },
  example_bare: {
    lang: 'tjs',
    code: `function f(x: 'a') {\n  return x\n}`,
    answer: 'yes',
    why: 'the example rule unaided — the floor',
  },
}

async function ask(arm: Arm): Promise<'yes' | 'no' | null> {
  const file = arm.lang === 'tjs' ? 'demo.tjs' : 'demo.ts'
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
              'You judge whether a call is allowed by a function signature. ' +
              'Answer with ONLY the word yes or no. /no_think',
          },
          {
            role: 'user',
            content: `This is ${file}.\n\n${arm.code}\n\nIs the call f('z') valid?`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    })
    if (!res.ok) return null
    const msg = (await res.json()).choices?.[0]?.message ?? {}
    const t = String(msg.content || '')
      .trim()
      .toLowerCase()
    if (!t) return null
    if (/^\W*no\b/.test(t)) return 'no'
    if (/^\W*yes\b/.test(t)) return 'yes'
    return null
  } catch {
    return null
  }
}

async function main() {
  console.log(`model=${MODEL}  samples=${SAMPLES}  /no_think\n`)
  const only = process.env.PROBE_ARMS?.split(',').map((s) => s.trim())
  const score: Record<string, number> = {}

  for (const [name, arm] of Object.entries(ARMS)) {
    if (only && !only.includes(name)) continue
    let ok = 0
    let other = 0
    let nulls = 0
    for (let i = 0; i < SAMPLES; i++) {
      const a = await ask(arm)
      if (a === null) nulls++
      else if (a === arm.answer) ok++
      else other++
    }
    score[name] = ok
    console.log(
      `  ${name.padEnd(17)} expect ${arm.answer.padEnd(3)} ${ok}/${SAMPLES}` +
        `  other: ${other}${nulls ? `  no-answer: ${nulls}` : ''}   ${arm.why}`
    )
  }

  console.log()
  if ((score.ts_control ?? SAMPLES) < SAMPLES * 0.8) {
    console.log(
      `APPARATUS CHECK FAILED — ts_control ${score.ts_control}/${SAMPLES}. The model cannot\n` +
        `judge call validity at all, so nothing above is readable.`
    )
    return
  }
  console.log('apparatus: ts_control passed.\n')
  console.log(
    `Exactly(): bare ${score.exactly_bare ?? '—'}/${SAMPLES}   with comment ${
      score.exactly_comment ?? '—'
    }/${SAMPLES}\n` +
      `  If bare already scores, the NAME is doing the comment's job — which would mean\n` +
      `  guidance is needed where we CONTRADICT a prior (switch), not where we add a\n` +
      `  well-named novelty. That is a cheaper rule than "comment everything".`
  )
  console.log(
    `\npipe 'a'|'b' read as exact: ${
      score.pipe_bare ?? '—'
    }/${SAMPLES}  — a high score here is a model\n` +
      `  applying TYPESCRIPT's reading, which is exactly the ambiguity proposal B removes.`
  )
}

main()
