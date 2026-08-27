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

const ARMS: Record<string, Arm> = {
  c_control: {
    lang: 'js',
    code: body(
      `    case 'a':\n      out.push(1)\n      break\n    case 'b':\n      out.push(2)\n      break`
    ),
    answer: '1',
    confusion: '1,2',
  },
  c_fallthru: {
    lang: 'js',
    code: body(
      `    case 'a':\n      out.push(1)\n    case 'b':\n      out.push(2)`
    ),
    answer: '1,2',
    confusion: '1',
  },
  tjs_bare: {
    lang: 'tjs',
    code: body(
      `    case 'a':\n      out.push(1)\n    case 'b':\n      out.push(2)`
    ),
    answer: '1',
    confusion: '1,2',
  },
  // The RULE, stated as prose. What you reach for by default.
  tjs_rule: {
    lang: 'tjs',
    code: body(
      `    // in .tjs, break is implicit — an arm never falls through unless it says \`fallthrough\`\n` +
        `    case 'a':\n      out.push(1)\n    case 'b':\n      out.push(2)`
    ),
    answer: '1',
    confusion: '1,2',
  },
  // The same fact as a WORKED EXAMPLE, which is the form A3 says models actually use.
  tjs_example: {
    lang: 'tjs',
    code: body(
      `    // break is implicit in .tjs:\n` +
        `    //   f('a') -> '1'      arm ends here\n` +
        `    //   to cascade, write \`fallthrough\` as the arm's last statement\n` +
        `    case 'a':\n      out.push(1)\n    case 'b':\n      out.push(2)`
    ),
    answer: '1',
    confusion: '1,2',
  },
  tjs_multi: {
    lang: 'tjs',
    code: body(
      `    case 'a', 'b':\n      out.push(1)\n    case 'c':\n      out.push(2)`
    ),
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
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You trace code precisely. Reply with ONLY the returned string, no quotes, no explanation.',
        },
        {
          role: 'user',
          content: `This is ${file}. What does f('a') return?\n\n${arm.code}`,
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
}

async function main() {
  console.log(`model=${MODEL}  samples=${SAMPLES}\n`)
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
    const pct = Math.round((ok / SAMPLES) * 100)
    console.log(
      `${name.padEnd(13)} expect ${arm.answer.padEnd(4)} ` +
        `${String(ok).padStart(2)}/${SAMPLES} = ${String(pct).padStart(3)}%  ` +
        `applied-other-rule: ${confused}` +
        (nulls ? `  no-answer: ${nulls}` : '') +
        (others.length ? `  other: ${others.join(' ')}` : '')
    )
  }

  const get = (n: string) => rows.find((r) => r[0] === n)!
  const control = get('c_control')
  console.log()
  if (control[1] < SAMPLES * 0.8) {
    console.log(
      `APPARATUS CHECK FAILED — c_control scored ${control[1]}/${SAMPLES}. The model cannot\n` +
        `reliably trace an ordinary switch, so every number above is noise. Do not read them.`
    )
    return
  }
  console.log(
    'apparatus check: c_control passed — the instrument can read `switch`.'
  )
  const bare = get('tjs_bare')[1]
  const rule = get('tjs_rule')[1]
  const example = get('tjs_example')[1]
  console.log(
    `comment A/B (this decides what \`convert\` emits):\n` +
      `  none ${bare}/${SAMPLES}   prose-rule ${rule}/${SAMPLES}   worked-example ${example}/${SAMPLES}\n` +
      `  Prior: guidance helps a lot (none=0%, cheatsheet=67%); RULES underperform EXAMPLES\n` +
      `  (0/5 vs 5/5, and 50% vs 80%). If that holds here, emit the example form.`
  )
  console.log(
    `NOTE: N=${SAMPLES} per arm. This is a spike, not a study — treat a difference under\n` +
      `about ${Math.ceil(
        SAMPLES * 0.4
      )} as noise, and re-run with PROBE_SAMPLES higher before believing it.`
  )
}

main()
