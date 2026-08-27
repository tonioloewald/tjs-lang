/**
 * Switch-semantics probe — can a model READ native-TJS `switch` correctly (#43)?
 *
 * TJS makes `break` implicit. That is a **silent** semantic change from C/JS: the same
 * source text means something different, with no syntax to signal it. So the risk is not
 * that a model rejects the code — it is that a model reads it confidently and wrongly, and
 * every prior it has says "fallthrough".
 *
 * Follows `surface-probe.ts`: **comprehension, not generation.** Show the code, ask what it
 * returns. Generation would measure whether a 1.5B can write TJS, which A7 already refuted;
 * reading is the question that decides whether the change is safe to ship.
 *
 * ## The arms, and the hypothesis each one tests
 *
 * `c_control`   — explicit `break`, ordinary JS. POSITIVE CONTROL. If this is not near
 *                 100%, the instrument cannot read `switch` at all and every other number
 *                 on the page is noise. `FINDINGS.md` §1 is the whole reason this arm
 *                 exists: a harness that fails closed looks exactly like a strong result.
 * `c_fallthru`  — no `break`, read as JS. The NEGATIVE control: the same text as `tjs_bare`,
 *                 scored against C semantics. Together the two measure how hard the prior
 *                 pulls, which is the actual difficulty of the change.
 * `tjs_bare`    — no `break`, read as `.tjs`. The shipping default.
 * `tjs_rule`    — same, plus a prose comment stating the RULE ("break is implicit").
 * `tjs_example` — same, plus a comment carrying a WORKED EXAMPLE of the behaviour.
 *                 These two are the actionable A/B: `convert` has to emit one of them.
 * `tjs_multi`   — `case 'a', 'b':`. New syntax that has to be understood cold, since no
 *                 model has seen it in JS.
 *
 * ## Why the comment arms are split, and what the prior actually says
 *
 * The first draft of this probe predicted a comment would fail, citing A3. That reads our
 * own findings wrong, and the correction matters because it changes what `convert` emits.
 *
 * Guidance helps ENORMOUSLY: `none` scores 0%, a 0.6k cheat sheet 67%. What A3 refutes is
 * narrower — prose RULES underperform WORKED EXAMPLES, measured twice: a prose remedy 0/5
 * where the same remedy shown as code scored 5/5, and 50% vs 80% in the error-message A/B.
 *
 * So the live question is not "does a comment help" (it should) but "which comment". That
 * is exactly the decision `convert` faces, so the two forms are separate arms and the
 * finding is directly actionable rather than merely interesting.
 *
 * ## Reading the results
 *
 * WHICH wrong answer matters more than the rate. `'1,2'` in a TJS arm is the model applying
 * C fallthrough — the specific misreading this change creates. `'1'` in `c_fallthru` is the
 * opposite error and means the prompt leaked our semantics.
 *
 *   bun experiments/agent-legibility/switch-probe.ts
 *
 * Env: TJS_LLM_BASE_URL, TJS_LLM_MODEL, PROBE_SAMPLES.
 */
const BASE = process.env.TJS_LLM_BASE_URL ?? 'http://localhost:1234/v1'
const MODEL = process.env.TJS_LLM_MODEL ?? 'qwen/qwen3.8-27b'
const SAMPLES = Number(process.env.PROBE_SAMPLES ?? 5)
/** Per-call ceiling. A 27B reasoning model can exceed a minute on a cold cache. */
const CALL_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 180_000)
/** Runs append here so results accumulate and can be compared across models/dates. */
const RESULTS = new URL('./switch-probe-results.md', import.meta.url).pathname

/**
 * One program per arm. Every arm is the same shape, and `f('a')` discriminates the two
 * semantics in one token: C falls into the second arm and answers `1,2`; TJS stops and
 * answers `1`.
 *
 * Deliberately tiny. `surface-probe.ts` had to calibrate DOWN because the instrument was
 * pinned at its floor and could not discriminate at all — here the tracing is trivial on
 * purpose, so the only thing being measured is which `switch` rule the model applies.
 */
interface Arm {
  code: string
  /** The argument to trace. Multi-value arms use 'b' — see MULTI. */
  call: string
  /** The correct answer under the semantics this arm is read with. */
  answer: string
  /** The answer that means "applied the other language's rule". */
  confusion: string
  lang: 'js' | 'tjs'
}

const body = (cases: string) => `function f(x) {
  const out = []
  switch (x) {
${cases}
  }
  return out.join(',')
}`

const HEADER =
  '// tjs is a new JS-family language — see https://tjs-platform.web.app\n'

/**
 * The multi-value arm asks about `f('b')`, not `f('a')`, and that is not arbitrary.
 *
 * `case 'a', 'b':` IS valid JavaScript — a SequenceExpression evaluating to `'b'` — so a JS
 * reading is a real, checkable answer rather than a parse error:
 *
 *     f('a') -> ''      JS: the case value is 'b', so nothing matches
 *     f('b') -> '1,2'   JS: matches, then falls through
 *     TJS:   f('b') -> '1'
 *
 * The first version asked about `f('a')`, where the JS answer is the EMPTY STRING — which
 * this harness cannot distinguish from "no answer", and whose `confusion` value was
 * mis-specified as '1,2' on top of that. Asking about `f('b')` makes both readings non-empty
 * and distinct, so the applied-other-rule column means something.
 */
const MULTI = `    case 'a', 'b':\n      out.push(1)\n    case 'c':\n      out.push(2)`
const PLAIN = `    case 'a':\n      out.push(1)\n    case 'b':\n      out.push(2)`
const RULE = `    // in .tjs, break is implicit — an arm never falls through unless it says \`fallthrough\`\n`
const MULTI_RULE = `    // in .tjs, \`case 'a', 'b':\` is ONE arm matching either value, and break is implicit\n`

const ARMS: Record<string, Arm> = {
  c_control: {
    lang: 'js',
    call: 'a',
    code: body(
      `    case 'a':\n      out.push(1)\n      break\n    case 'b':\n      out.push(2)\n      break`
    ),
    answer: '1',
    confusion: '1,2',
  },
  tjs_bare: {
    lang: 'tjs',
    call: 'a',
    code: body(PLAIN),
    answer: '1',
    confusion: '1,2',
  },
  tjs_rule: {
    lang: 'tjs',
    call: 'a',
    code: body(RULE + PLAIN),
    answer: '1',
    confusion: '1,2',
  },
  // Does merely NAMING the language help? The model has no training data for TJS, so this
  // cannot retrieve knowledge — it can only stop the model assuming JS. It might equally
  // make it guess. That is the experiment, and it came straight from the last run's
  // reasoning transcript ("there is a language 'TJS'… maybe").
  tjs_header: {
    lang: 'tjs',
    call: 'a',
    code: HEADER + body(PLAIN),
    answer: '1',
    confusion: '1,2',
  },
  // What `convert` would actually emit: name the language AND state the rule.
  tjs_header_rule: {
    lang: 'tjs',
    call: 'a',
    code: HEADER + body(RULE + PLAIN),
    answer: '1',
    confusion: '1,2',
  },
  // The construct with NO JS precedent, finally measurable.
  tjs_multi: {
    lang: 'tjs',
    call: 'b',
    code: body(MULTI),
    answer: '1',
    confusion: '1,2',
  },
  tjs_multi_rule: {
    lang: 'tjs',
    call: 'b',
    code: body(MULTI_RULE + MULTI),
    answer: '1',
    confusion: '1,2',
  },
}

/**
 * The file extension is the ONLY signal of which language this is — which is exactly the
 * situation a reader is in, and the thing the probe exists to measure. Nothing here states
 * the fallthrough rule; saying it in the prompt would measure instruction-following rather
 * than legibility.
 */
async function ask(arm: Arm): Promise<string | null> {
  const file = arm.lang === 'tjs' ? 'demo.tjs' : 'demo.js'
  // A transport failure must cost ONE sample, not the whole sweep. Two earlier runs died
  // partway and lost every arm after the failure — which reads as "we never measured it"
  // rather than "one call timed out", and is how `tjs_multi` went unmeasured twice.
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
              'You trace code precisely. Reply with ONLY the returned string, no quotes, ' +
              'no explanation. /no_think',
          },
          {
            role: 'user',
            content: `This is ${file}. What does f('${arm.call}') return?\n\n${arm.code}`,
          },
        ],
        temperature: 0.3,
        // Generous, because the instrument is a REASONING model: the first run gave five
        // nulls on `tjs_multi` where 7,277 characters of reasoning exhausted a 2,000-token
        // budget before any `content` was emitted. That is not a wrong answer, it is no
        // answer, and scoring it as wrong would have read as 'models cannot parse
        // multi-value cases'. Nulls stay in their own column for the same reason.
        max_tokens: 12000,
      }),
    })
    if (!res.ok) return null
    const msg = (await res.json()).choices?.[0]?.message ?? {}
    // A reasoning model puts its answer in `reasoning_content` and leaves `content` EMPTY —
    // which arrives downstream as an unexplained parse failure. See the TODO entry; this is
    // the same trap, named here so a null is never silently read as a wrong answer.
    const text: string = msg.content || ''
    if (!text.trim()) return null
    const m = text.trim().match(/[\d,]+/)
    return m ? m[0] : null
  } catch {
    return null
  }
}

async function main() {
  console.log(`model=${MODEL}  samples=${SAMPLES}  /no_think\n`)
  const rows: Array<[string, number, number, number, string[]]> = []

  for (const [name, arm] of Object.entries(ARMS)) {
    let ok = 0
    let confused = 0
    let nulls = 0
    const others: string[] = []
    for (let i = 0; i < SAMPLES; i++) {
      const got = await ask(arm)
      if (got === null) nulls++
      else if (got === arm.answer) ok++
      else if (got === arm.confusion) confused++
      else others.push(got)
    }
    rows.push([name, ok, confused, nulls, others])
    console.log(
      `${name.padEnd(16)} f('${arm.call}') expect ${arm.answer.padEnd(4)} ` +
        `${String(ok).padStart(2)}/${SAMPLES} = ${String(
          Math.round((ok / SAMPLES) * 100)
        ).padStart(3)}%  applied-other-rule: ${confused}` +
        (nulls ? `  no-answer: ${nulls}` : '') +
        (others.length ? `  other: ${others.join(' ')}` : '')
    )
  }

  const get = (n: string) => rows.find((r) => r[0] === n)?.[1] ?? 0
  const control = rows.find((r) => r[0] === 'c_control')!
  console.log()
  if (control[1] < SAMPLES * 0.8) {
    console.log(
      `APPARATUS CHECK FAILED — c_control scored ${control[1]}/${SAMPLES}. The model cannot\n` +
        `reliably trace an ordinary switch, so every number above is noise. Do not read them.`
    )
    return
  }
  console.log(
    'apparatus: c_control passed — the instrument can read `switch`.\n'
  )
  for (const [what, bare, guided] of [
    ['implicit break', 'tjs_bare', 'tjs_rule'],
    ['multi-value case', 'tjs_multi', 'tjs_multi_rule'],
  ] as const) {
    console.log(
      `${what.padEnd(18)} no comment ${get(
        bare
      )}/${SAMPLES}   with comment ${get(guided)}/${SAMPLES}`
    )
  }
  console.log(
    `\nfile header alone  ${get('tjs_header')}/${SAMPLES}   ` +
      `header + rule ${get('tjs_header_rule')}/${SAMPLES}   (bare ${get(
        'tjs_bare'
      )}/${SAMPLES})\n` +
      `  The header only NAMES the language; no TJS exists in any training corpus, so it\n` +
      `  cannot retrieve knowledge — it can only stop the model assuming JS, or make it guess.`
  )
  console.log(
    `\nNOTE: N=${SAMPLES} per arm, ONE model, \`/no_think\`. A spike, not a study — treat a\n` +
      `difference under about ${Math.ceil(
        SAMPLES * 0.4
      )} as noise and raise PROBE_SAMPLES first.`
  )

  // Append rather than overwrite: the value of this file is the SERIES. A single run is a
  // spike; several across models and dates is evidence.
  const stamp = process.env.PROBE_STAMP ?? 'unstamped'
  const lines = [
    ``,
    `## ${stamp} — ${MODEL}, N=${SAMPLES}`,
    ``,
    `| arm | call | expects | correct | applied-other-rule | no-answer | other |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    ...rows.map(
      ([n, ok, conf, nulls, other]) =>
        `| \`${n}\` | \`f('${ARMS[n].call}')\` | \`${
          ARMS[n].answer
        }\` | **${ok}/${SAMPLES}** | ${conf} | ${nulls} | ${
          other.join(' ') || '—'
        } |`
    ),
    ``,
  ]
  const { appendFileSync } = await import('node:fs')
  appendFileSync(RESULTS, lines.join('\n'))
  console.log(`\nappended to ${RESULTS}`)
}

main()
