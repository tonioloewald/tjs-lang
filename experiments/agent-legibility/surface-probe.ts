/**
 * Surface-syntax probe — do design choices cause cognitive wins/losses, independent
 * of familiarity?
 *
 * The problem with "is Python indentation better?" is that any direct test measures
 * **corpus frequency**, not cognition: models have read millions of Python files. Two
 * design moves separate the effects:
 *
 * 1. **Comprehension, not generation.** Show the same program in different surfaces and
 *    ask what it RETURNS. No parser is needed, so we can probe syntaxes that don't exist
 *    — including ones we're only considering. Generation would require implementing each
 *    variant; comprehension costs nothing but a prompt.
 * 2. **A neutral substrate.** Variants are surface renderings of the same tiny imperative
 *    program, not of Python or JS. A model can still lean on priors (indentation evokes
 *    Python, braces evoke C/JS) — that transfer is itself measurable, and is the point:
 *    a surface that recruits a strong prior IS cognitively cheaper, and that's a real
 *    design finding rather than a confound to apologise for.
 *
 * What this can and can't tell you: it measures whether a model can TRACK state through a
 * surface. It does not measure authoring ergonomics, error recovery, or what happens at
 * scale. Treat a win here as "worth testing properly in generation", not as a verdict.
 *
 *   bun experiments/agent-legibility/surface-probe.ts
 */
const BASE = process.env.TJS_LLM_BASE_URL ?? 'http://localhost:10240/v1'
const MODEL =
  process.env.TJS_LLM_MODEL ?? 'mlx-community/Qwen2.5-1.5B-Instruct-4bit'
const SAMPLES = Number(process.env.PROBE_SAMPLES ?? 4)

/**
 * One program, many surfaces. Semantics identical in every variant:
 *   total = 0; i = 1; while i <= 4: total = total + i; i = i + 1  →  10
 * Calibrated DOWN from `i*i` (=30): at 1.5B every surface scored 0-20% on the harder
 * program, i.e. the instrument was saturated at the floor and could not discriminate
 * between surfaces at all. An instrument pinned at its floor measures nothing.
 * A loop with an accumulator forces the model to actually track state rather than
 * pattern-match a known snippet.
 */
const ANSWER = 10

const SURFACES: Record<string, string> = {
  /** C/JS-family braces + semicolons. Maximum JS prior. */
  braces: `function f() {
  let total = 0;
  let i = 1;
  while (i <= 4) {
    total = total + i;
    i = i + 1;
  }
  return total;
}`,

  /** Braces, newline-terminated (this is TjsStandard — a choice we made on taste). */
  bracesNoSemi: `function f() {
  let total = 0
  let i = 1
  while (i <= 4) {
    total = total + i
    i = i + 1
  }
  return total
}`,

  /** Significant indentation, Python-shaped. Maximum Python prior. */
  indent: `def f():
    total = 0
    i = 1
    while i <= 4:
        total = total + i
        i = i + 1
    return total`,

  /** Indentation WITHOUT Python keywords — isolates layout from vocabulary. */
  indentNeutral: `func f
    let total = 0
    let i = 1
    loop while i <= 4
        total = total + i
        i = i + 1
    give total`,

  /** S-expressions: homoiconic, zero precedence ambiguity, low familiarity. */
  sexpr: `(define (f)
  (let loop ((total 0) (i 1))
    (if (<= i 4)
        (loop (+ total i) (+ i 1))
        total)))`,

  /**
   * CONFOUND CONTROL. The s-expr variant differs from the others in TWO ways: parenthesised
   * surface AND functional state-threading (a recursive loop with an explicit accumulator)
   * instead of mutation. If s-expr's advantage is really about immutability rather than
   * parentheses, this brace-syntax recursive version should score like s-expr, not like the
   * other brace variants. Changing one thing at a time is the whole game.
   */
  bracesRecursive: `function f() {
  function loop(total, i) {
    if (i <= 4) {
      return loop(total + i, i + 1)
    }
    return total
  }
  return loop(0, 1)
}`,

  /** Explicit end-markers instead of braces or layout (Lua/Ruby family). */
  endKeyword: `function f()
  local total = 0
  local i = 1
  while i <= 4 do
    total = total + i
    i = i + 1
  end
  return total
end`,
}

async function ask(code: string): Promise<number | null> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You trace code precisely. Reply with ONLY the final numeric result — digits, nothing else.',
        },
        { role: 'user', content: `What does calling f() return?\n\n${code}` },
      ],
      temperature: 0.3,
      max_tokens: 60,
    }),
  })
  if (!res.ok) return null
  const text = (await res.json()).choices?.[0]?.message?.content ?? ''
  const m = text.match(/-?\d+/)
  return m ? Number(m[0]) : null
}

async function main() {
  console.log(`model=${MODEL}  samples=${SAMPLES}  correct answer=${ANSWER}\n`)
  const rows: Array<{ name: string; ok: number; answers: number[] }> = []

  for (const [name, code] of Object.entries(SURFACES)) {
    let ok = 0
    const answers: number[] = []
    for (let i = 0; i < SAMPLES; i++) {
      const got = await ask(code)
      if (got !== null) answers.push(got)
      if (got === ANSWER) ok++
    }
    rows.push({ name, ok, answers })
    // Wrong answers are diagnostic: 6 = stopped at i<4, 15 = ran to i=5, etc.
    // etc. WHICH way a surface misleads is more useful than the bare rate.
    const wrong = answers.filter((a) => a !== ANSWER)
    console.log(
      `${name.padEnd(15)} ${ok}/${SAMPLES} = ${String(
        Math.round((ok / SAMPLES) * 100)
      ).padStart(3)}%   ${wrong.length ? 'wrong: ' + wrong.join(', ') : ''}`
    )
  }

  console.log(
    '\n--- ranking (comprehension only; not an authoring verdict) ---'
  )
  for (const r of [...rows].sort((a, b) => b.ok - a.ok)) {
    console.log(
      `${String(Math.round((r.ok / SAMPLES) * 100)).padStart(3)}%  ${r.name}`
    )
  }
}

if (import.meta.main) await main()
