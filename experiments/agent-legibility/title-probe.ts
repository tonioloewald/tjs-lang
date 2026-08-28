/**
 * Title / framing probe — blind-test positioning the way we blind-test syntax.
 *
 * `switch-probe.ts` asks "shown this code and nothing else, what does a reader conclude?".
 * This asks the same question of a TITLE: shown it and nothing else, what does a reader
 * think the book is about, and — as a particular kind of developer — would they pick it up?
 *
 * ## The methodological trap this is built around
 *
 * `ASSUMPTIONS.md` A13 already records it: **direct approval questions measure
 * agreeableness.** Ask a model "would you read this?" and it says yes, to everything,
 * warmly. Any title set scored that way comes back 90%+ and ranks nothing.
 *
 * So there are two instruments, and only one of them is an opinion:
 *
 *   1. **SUBJECT (comprehension, checkable).** "In one line, what is this book about?"
 *      Scored against what the book IS about — a title that reads as something else has
 *      failed, regardless of how appealing it is. This is the analogue of asking what a
 *      `switch` returns, and it is the half that produces a right answer.
 *   2. **CHOICE (forced pairwise).** Never "would you read it?" — always "you can take
 *      exactly one of these two; which?", with a persona, and with **both orderings run**
 *      so position bias is visible rather than absorbed. A forced choice cannot be
 *      answered agreeably; something has to lose.
 *
 * ## Personas
 *
 * The same title reads differently to someone who loves TypeScript and someone who left it.
 * `TypeScript: The Good Parts` promises a skeptic's inventory to one and an endorsement to
 * the other. Persona is therefore a variable, not a framing detail.
 *
 * ## What this can and cannot tell you
 *
 * It measures FIRST-CONTACT reading — what a title signals cold, to a reader with no
 * context. That is exactly the situation of someone scrolling a list, and exactly not the
 * situation of someone who has heard of the project. It says nothing about whether the book
 * is good, and a model is not a market. Treat a clear loss as informative and a narrow win
 * as noise.
 *
 *   bun experiments/agent-legibility/title-probe.ts
 *
 * Env: TJS_LLM_MODEL, TJS_LLM_BASE_URL, PROBE_SAMPLES, PROBE_TIMEOUT_MS, PROBE_STAMP.
 */
const BASE = process.env.TJS_LLM_BASE_URL ?? 'http://localhost:1234/v1'
const MODEL = process.env.TJS_LLM_MODEL ?? 'qwen/qwen3.8-27b'
const SAMPLES = Number(process.env.PROBE_SAMPLES ?? 3)
const CALL_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 180_000)
const RESULTS = new URL('./title-probe-results.md', import.meta.url).pathname

/**
 * What the book actually is, so SUBJECT answers can be scored rather than admired.
 *
 * Deliberately concrete: a skeptic's inventory of what TypeScript got right, used as the
 * design brief for a language where types survive to runtime.
 */
const SUBJECT_KEYWORDS = [
  'typescript',
  'type',
  'javascript',
  'runtime',
  'language',
  'design',
]

const TITLES: Record<string, string> = {
  good_parts: 'TypeScript: The Good Parts',
  good_parts_sub: 'TypeScript: The Good Parts — and what to do about the rest',
  types_at_runtime: 'Types That Survive: JavaScript with Runtime Contracts',
  better_javascript: 'The Better JavaScript',
  examples_are_types: 'Types Are Examples',
  // A deliberately opaque title. The NEGATIVE control: if this scores as well as the others
  // on SUBJECT, the instrument is not reading titles, it is being agreeable.
  opaque_control: 'Beyond the Boundary',
}

const PERSONAS: Record<string, string> = {
  ts_enthusiast:
    'You are a working TypeScript developer who likes TypeScript and uses it daily.',
  js_developer:
    'You are a working JavaScript developer who has deliberately avoided TypeScript.',
  skeptic:
    'You are an experienced engineer who is skeptical of new languages and of hype.',
}

async function chat(system: string, user: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: `${system} /no_think` },
          { role: 'user', content: user },
        ],
        temperature: 0.7, // opinions, not traces — some spread is wanted here
        max_tokens: 300,
      }),
    })
    if (!res.ok) return null
    const msg = (await res.json()).choices?.[0]?.message ?? {}
    const text: string = msg.content || ''
    return text.trim() || null
  } catch {
    return null
  }
}

/** 1. SUBJECT — checkable. Does the title convey what the book is about? */
async function subjectPass() {
  console.log('=== SUBJECT: "in one line, what is this book about?" ===')
  console.log(
    '   scored on whether the answer names the actual subject matter\n'
  )
  for (const [key, title] of Object.entries(TITLES)) {
    let hits = 0
    const answers: string[] = []
    for (let i = 0; i < SAMPLES; i++) {
      const a = await chat(
        'You judge books by their titles alone. One line, no preamble.',
        `A programming book is titled "${title}". In one line, what is it about?`
      )
      if (!a) continue
      answers.push(a.replace(/\s+/g, ' ').slice(0, 90))
      const lower = a.toLowerCase()
      if (SUBJECT_KEYWORDS.filter((k) => lower.includes(k)).length >= 2) hits++
    }
    console.log(`  ${key.padEnd(18)} ${hits}/${SAMPLES}  "${title}"`)
    for (const a of answers.slice(0, 1)) console.log(`      e.g. ${a}`)
  }
}

/**
 * 2. CHOICE — forced pairwise, both orderings.
 *
 * Running A-then-B and B-then-A separately is the point: a model that simply prefers the
 * first option it is shown will score 50/50 across the pair, which is visible. Absorbing
 * both into one number would hide it.
 */
async function choicePass(a: string, b: string) {
  console.log(`\n=== CHOICE: "${TITLES[a]}"  vs  "${TITLES[b]}" ===`)
  for (const [pkey, persona] of Object.entries(PERSONAS)) {
    let aWins = 0
    let n = 0
    for (const [first, second] of [
      [a, b],
      [b, a],
    ]) {
      for (let i = 0; i < SAMPLES; i++) {
        const reply = await chat(
          `${persona} Answer with ONLY the number 1 or 2.`,
          `You have time to read exactly one of these. Which do you pick?\n` +
            `1. ${TITLES[first]}\n2. ${TITLES[second]}`
        )
        if (!reply) continue
        const m = reply.match(/[12]/)
        if (!m) continue
        n++
        const picked = m[0] === '1' ? first : second
        if (picked === a) aWins++
      }
    }
    const pct = n ? Math.round((aWins / n) * 100) : 0
    console.log(
      `  ${pkey.padEnd(16)} ${aWins}/${n} chose "${TITLES[a]}"  (${pct}%)` +
        (n === 0 ? '  — NO ANSWERS' : '')
    )
  }
}

async function main() {
  console.log(`model=${MODEL}  samples=${SAMPLES}\n`)
  await subjectPass()
  await choicePass('good_parts', 'better_javascript')
  await choicePass('good_parts', 'types_at_runtime')
  console.log(
    `\nNOTE: SUBJECT is checkable; CHOICE is opinion under a forced comparison, which is\n` +
      `the only form that resists the agreeableness A13 records. N=${SAMPLES} per ordering.\n` +
      `A split near 50% across BOTH orderings means position bias, not a tie. A model is\n` +
      `not a market: read a clear loss, ignore a narrow win.`
  )
}

main()
