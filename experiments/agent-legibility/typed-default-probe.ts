/**
 * Is `name: Type = default` (#3596) read and written the way it means?
 *
 * The syntax is TypeScript's own, so the bet is LEAST SURPRISE: a reader carries the TS
 * meaning over (a typed, optional parameter with a default) and a writer reaches for it
 * unprompted. Two things can go wrong, and each is measured:
 *
 *   READ  — TJS CHECKS the type at runtime, where TypeScript only checks at compile time. A
 *           reader importing the JS prior would say `grant('maybe')` returns 'maybe'.
 *   WRITE — asked for a parameter that must be 'light' or 'dark' and defaults to 'light', does
 *           a model produce TJS that compiles and behaves, and does it use this spelling?
 *
 * ## Read arms (one question each)
 *
 *   js-control      `.js`  `mode = 'grant'`          grant('maybe') -> 'maybe'  CONTROL
 *   tjs-untyped     `.tjs` `mode = 'grant'`          grant('maybe') -> 'maybe'  CONTROL: the
 *                                                     default makes the type string
 *   tjs-typed       `.tjs` `mode: 'grant'|'deny' = 'grant'`  grant('maybe') -> error  THE ARM
 *   tjs-typed-dflt  `.tjs` same                       grant()        -> 'grant'  the default
 *
 * As in the earlier probes (case-study-switch.md §7): the WRONG column decides, since a
 * confident wrong answer ships bugs and a no-answer only costs a lookup. Not a study: one
 * model at a time, N samples, to catch a 5/5-wrong result before it ships.
 *
 * Run: bun experiments/agent-legibility/typed-default-probe.ts
 * Env: GROK_MODEL (default google/gemma-4-e2b), GROK_SAMPLES (default 5),
 *      TJS_LLM_BASE_URL (default http://localhost:1234/v1)
 */
import { tjs } from '../../src/lang/index'

const BASE = process.env.TJS_LLM_BASE_URL || 'http://localhost:1234/v1'
const MODEL = process.env.GROK_MODEL || 'google/gemma-4-e2b'
const SAMPLES = Number(process.env.GROK_SAMPLES) || 5
const CALL_TIMEOUT_MS = 90_000

async function chat(system: string, user: string): Promise<string> {
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    })
    if (!res.ok) return ''
    const msg = (await res.json()).choices?.[0]?.message ?? {}
    // A reasoning model may answer in `reasoning_content` (see src/batteries/audit.ts).
    return String(msg.content || msg.reasoning_content || '')
  } catch {
    return ''
  }
}

interface ReadArm {
  name: string
  file: string
  code: string
  call: string
  /** The two answers offered; the first is what a correct reader says. */
  correct: string
  wrong: string
  why: string
}

const READ: ReadArm[] = [
  {
    name: 'js-control',
    file: 'auth.js',
    code: `function grant(mode = 'grant') {\n  return mode\n}`,
    call: `grant('maybe')`,
    correct: 'maybe',
    wrong: 'error',
    why: 'CONTROL: plain JavaScript returns its argument.',
  },
  {
    name: 'tjs-untyped',
    file: 'auth.tjs',
    code: `function grant(mode = 'grant') {\n  return mode\n}`,
    call: `grant('maybe')`,
    correct: 'maybe',
    wrong: 'error',
    why: "CONTROL: in TJS the default's type is string; 'maybe' is a string.",
  },
  {
    name: 'tjs-typed',
    file: 'auth.tjs',
    code: `function grant(mode: 'grant' | 'deny' = 'grant') {\n  return mode\n}`,
    call: `grant('maybe')`,
    correct: 'error',
    wrong: 'maybe',
    why: 'THE ARM: TJS checks the type at runtime, so this returns an error.',
  },
  {
    name: 'tjs-typed-dflt',
    file: 'auth.tjs',
    code: `function grant(mode: 'grant' | 'deny' = 'grant') {\n  return mode\n}`,
    call: `grant()`,
    correct: 'grant',
    wrong: 'error',
    why: 'The default applies when the argument is omitted.',
  },
]

const TJS_NOTE =
  'TJS is JavaScript where parameter types are checked at runtime: a call with a wrong-typed ' +
  'argument returns an error value instead of running the function.'

async function read(arm: ReadArm): Promise<'correct' | 'wrong' | null> {
  const raw = (
    await chat(
      `${TJS_NOTE} You answer what a call returns. Reply with ONLY one word: ` +
        `${arm.correct} or ${arm.wrong}. /no_think`,
      `This is ${arm.file}.\n\n${arm.code}\n\nWhat does ${arm.call} return: ` +
        `${arm.correct} or ${arm.wrong}?`
    )
  )
    .trim()
    .toLowerCase()
  const words = [arm.correct, arm.wrong].map((w) => w.toLowerCase())
  // LAST occurrence: a thinking trace often states the wrong answer before correcting.
  const hits = [...raw.matchAll(new RegExp(`\\b(${words.join('|')})\\b`, 'g'))]
  if (!hits.length) return null
  return hits[hits.length - 1][1] === words[0] ? 'correct' : 'wrong'
}

/** The WRITE task: spec only, no hint of the spelling beyond what TJS is. */
async function write(): Promise<{
  compiles: boolean
  behaves: boolean
  usedTypedDefault: boolean
  code: string
}> {
  const raw = await chat(
    `${TJS_NOTE} In TJS a parameter's type is given after a colon, as in TypeScript. ` +
      'Reply with ONLY the code, no explanation, no markdown fences. /no_think',
    'Write a TJS function `setTheme(theme)` whose parameter must be the string ' +
      "'light' or the string 'dark', defaulting to 'light' when omitted. It returns the theme."
  )
  const code = raw
    .replace(/<think>[^]*?<\/think>/g, '')
    .replace(/```[a-z]*\n?/g, '')
    .trim()
  const usedTypedDefault = /setTheme\s*\(\s*theme\s*:[^)=]+=[^)]+\)/.test(code)
  let compiles = false
  let behaves = false
  try {
    const g = globalThis as any
    const prev = g.__tjs
    g.__tjs = undefined
    let setTheme: any
    try {
      setTheme = new Function(
        `${tjs(code, { runTests: false }).code.replace(
          /^export /gm,
          ''
        )}\nreturn setTheme`
      )()
    } finally {
      g.__tjs = prev
    }
    compiles = typeof setTheme === 'function'
    behaves =
      compiles &&
      setTheme() === 'light' &&
      setTheme('dark') === 'dark' &&
      setTheme('blue') instanceof Error
  } catch {
    // did not compile
  }
  return { compiles, behaves, usedTypedDefault, code }
}

async function main() {
  console.log(`\n  model: ${MODEL}   samples: ${SAMPLES}\n\n  READ`)
  let controlsClean = true
  for (const arm of READ) {
    let correct = 0
    let wrong = 0
    let none = 0
    for (let i = 0; i < SAMPLES; i++) {
      const a = await read(arm)
      if (a === 'correct') correct++
      else if (a === 'wrong') wrong++
      else none++
    }
    if (arm.why.startsWith('CONTROL') && wrong > 0) controlsClean = false
    console.log(
      `  ${arm.name.padEnd(
        15
      )} correct ${correct}/${SAMPLES}   WRONG ${wrong}   no-answer ${none}   ${
        arm.why
      }`
    )
  }
  console.log(
    `  controls ${
      controlsClean ? 'clean' : 'DIRTY: the arms carry no weight'
    }\n\n  WRITE`
  )
  let compiles = 0
  let behaves = 0
  let typed = 0
  const samples: string[] = []
  for (let i = 0; i < SAMPLES; i++) {
    const r = await write()
    if (r.compiles) compiles++
    if (r.behaves) behaves++
    if (r.usedTypedDefault) typed++
    samples.push(r.code.split('\n')[0].slice(0, 90))
  }
  console.log(
    `  compiles ${compiles}/${SAMPLES}   behaves ${behaves}/${SAMPLES}   used \`theme: T = d\` ${typed}/${SAMPLES}`
  )
  for (const s of samples) console.log(`    ${s}`)
  console.log()
}

main()
