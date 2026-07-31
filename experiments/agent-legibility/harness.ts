/**
 * Agent-legibility spike: do EXECUTED VERDICTS beat TYPE ERRORS as a repair signal?
 *
 * The claim worth testing is NOT "TJS beats TypeScript" — we wrote TJS, so that number
 * would be worthless. It's the mechanism: when a model gets a task wrong, does a
 * **runtime verdict** ("called f(2,3), expected 5, got 6") repair it faster than a
 * **static complaint** ("Type 'string' is not assignable to type 'number'")?
 *
 * So both arms are held identical except the feedback string:
 *   - same model, same task, same iteration budget, same temperature
 *   - arm TS  : write TypeScript → `tsc --noEmit` → feed back type errors
 *   - arm TJS : write TJS → transpile + run the signature test → feed back the verdict
 *
 * Metrics (fixed BEFORE looking at results, so a null result is publishable):
 *   solved            — did it ever reach green
 *   iterations        — attempts used (1 = first try; the repair loop is the point)
 *   repairedAfterFail — solved on attempt >1, i.e. the feedback actually helped
 *   tokens            — cost of getting there
 *
 * Known confounds, stated up front rather than discovered later:
 *   - Training-data asymmetry: models have seen far more TypeScript than TJS. This biases
 *     AGAINST TJS on first-attempt syntax, and is exactly why `repairedAfterFail`
 *     (conditional on a first failure) is the more honest measure than raw solve rate.
 *   - Task authorship: tasks are ordinary function specs, not chosen to flatter either arm.
 *   - One small model is not a study. This is a spike to find the real effects and the
 *     instrumentation bugs before designing the study.
 */
import { tjs } from '../../src/lang'
import { fromTS } from '../../src/lang/emitters/from-ts'

const BASE = process.env.TJS_LLM_BASE_URL ?? 'http://localhost:10240/v1'
const MODEL =
  process.env.TJS_LLM_MODEL ?? 'mlx-community/Qwen2.5-1.5B-Instruct-4bit'
const MAX_ATTEMPTS = Number(process.env.SPIKE_ATTEMPTS ?? 4)

export interface Task {
  name: string
  /** Plain-English spec, identical in both arms. */
  spec: string
  /** Function name the solution must export. */
  fn: string
  /** Cases used to judge correctness (never shown verbatim as tests to the model). */
  cases: Array<{ args: any[]; expect: any }>
  /** A TJS signature line demonstrating the example-type idiom, for the TJS arm. */
  tjsSignatureHint: string
}

export const TASKS: Task[] = [
  {
    name: 'median',
    spec: 'Return the median of an array of numbers. For an even-length array, return the average of the two middle values. Return 0 for an empty array.',
    fn: 'median',
    cases: [
      { args: [[1, 3, 2]], expect: 2 },
      { args: [[1, 2, 3, 4]], expect: 2.5 },
      { args: [[]], expect: 0 },
      { args: [[5]], expect: 5 },
    ],
    tjsSignatureHint: `function median(nums: [0.0]): 0.0 { ... }`,
  },
  {
    name: 'titleCase',
    spec: 'Convert a sentence to title case: the first letter of each word uppercased, the rest lowercased. Words are separated by single spaces.',
    fn: 'titleCase',
    cases: [
      { args: ['hello world'], expect: 'Hello World' },
      { args: ['tHE quick BROWN fox'], expect: 'The Quick Brown Fox' },
      { args: [''], expect: '' },
    ],
    tjsSignatureHint: `function titleCase(s: ''): '' { ... }`,
  },
  {
    name: 'rle',
    spec: 'Run-length encode a string: "aaabbc" becomes "a3b2c1". An empty string returns an empty string.',
    fn: 'rle',
    cases: [
      { args: ['aaabbc'], expect: 'a3b2c1' },
      { args: ['abc'], expect: 'a1b1c1' },
      { args: [''], expect: '' },
    ],
    tjsSignatureHint: `function rle(s: ''): '' { ... }`,
  },
  {
    name: 'chunk',
    spec: 'Split an array into chunks of size n, returning an array of arrays. The final chunk may be shorter. If n <= 0, return an empty array.',
    fn: 'chunk',
    cases: [
      { args: [[1, 2, 3, 4, 5], 2], expect: [[1, 2], [3, 4], [5]] },
      { args: [[1, 2], 5], expect: [[1, 2]] },
      { args: [[1, 2], 0], expect: [] },
    ],
    tjsSignatureHint: `function chunk(items: [0], size: 0): [[0]] { ... }`,
  },
]

async function complete(
  messages: any[]
): Promise<{ text: string; tokens: number }> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 700,
    }),
  })
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    tokens: data.usage?.total_tokens ?? 0,
  }
}

/** Pull the first code block, or treat the whole reply as code. */
function extractCode(reply: string): string {
  const fenced = reply.match(/```(?:\w+)?\n([\s\S]*?)```/)
  return (fenced ? fenced[1] : reply).trim()
}

/**
 * Compile a candidate to runnable JS. NEITHER arm's source is valid JavaScript —
 * TS has type annotations, TJS has example-value annotations — so judging with a bare
 * `new Function` marks every correct answer wrong. (It did: the first run scored 0/8
 * while the model was emitting perfectly good code. An experiment whose apparatus
 * silently fails closed produces confident nonsense.)
 */
function toJS(code: string, arm: 'ts' | 'tjs'): string {
  if (arm === 'ts') return fromTS(code).code
  return tjs(code, { runTests: false }).code
}

/** Judge a candidate by RUNNING it against the task's cases. Same judge for both arms. */
function judge(
  code: string,
  task: Task,
  arm: 'ts' | 'tjs'
): { ok: boolean; feedback: string } {
  let fn: any
  try {
    const js = toJS(code, arm)
    fn = new Function(
      `${js}\nreturn typeof ${task.fn} === 'function' ? ${task.fn} : null`
    )()
  } catch (e: any) {
    return {
      ok: false,
      feedback: `The code does not compile/run: ${e.message}`,
    }
  }
  if (!fn)
    return { ok: false, feedback: `No function named ${task.fn} was defined.` }
  for (const c of task.cases) {
    let got: any
    try {
      got = fn(...c.args)
    } catch (e: any) {
      return {
        ok: false,
        feedback: `${task.fn}(${c.args
          .map((a) => JSON.stringify(a))
          .join(', ')}) threw: ${e.message}`,
      }
    }
    if (JSON.stringify(got) !== JSON.stringify(c.expect)) {
      return {
        ok: false,
        feedback: `${task.fn}(${c.args
          .map((a) => JSON.stringify(a))
          .join(', ')}) returned ${JSON.stringify(
          got
        )}, expected ${JSON.stringify(c.expect)}`,
      }
    }
  }
  return { ok: true, feedback: '' }
}

/** TS arm: the model's in-loop signal is `tsc` output (types only, no execution). */
async function tscFeedback(code: string): Promise<string | null> {
  const dir = '/tmp/agent-spike'
  await Bun.write(`${dir}/candidate.ts`, code)
  const proc = Bun.spawnSync(
    [
      'bunx',
      'tsc',
      '--noEmit',
      '--strict',
      '--target',
      'es2022',
      `${dir}/candidate.ts`,
    ],
    { stdout: 'pipe', stderr: 'pipe' }
  )
  const out = (proc.stdout.toString() + proc.stderr.toString()).trim()
  return out ? out.split('\n').slice(0, 6).join('\n') : null
}

/** TJS arm: the in-loop signal is the transpiler's EXECUTED verdict (signature tests). */
function tjsFeedback(code: string): string | null {
  try {
    const result: any = tjs(code, { runTests: true })
    const failures = (result.testResults ?? []).filter((t: any) => !t.passed)
    if (failures.length) {
      return failures
        .slice(0, 3)
        .map((f: any) => f.error ?? f.description)
        .join('\n')
    }
    return null
  } catch (e: any) {
    // A transpile-time signature-test failure throws with the concrete verdict.
    return String(e.message).split('\n').slice(0, 6).join('\n')
  }
}

export interface RunResult {
  arm: 'ts' | 'tjs'
  task: string
  solved: boolean
  attempts: number
  repairedAfterFail: boolean
  tokens: number
  lastFeedback: string
}

async function runArm(task: Task, arm: 'ts' | 'tjs'): Promise<RunResult> {
  const system =
    arm === 'ts'
      ? `You write TypeScript. Reply with ONLY a fenced code block containing a single function declaration. No imports, no exports, no explanation.`
      : `You write TJS. TJS is JavaScript where a parameter's type is written as an EXAMPLE VALUE, not a type name.
For example: ${task.tjsSignatureHint}
'' means "a string", 0 means "an integer", 0.0 means "a number", [0] means "an array of integers".
The return example after the colon is checked by actually CALLING your function.
Reply with ONLY a fenced code block containing a single function declaration. No imports, no exports, no explanation.`

  const messages: any[] = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `${task.spec}\n\nName the function \`${task.fn}\`.`,
    },
  ]

  let tokens = 0
  let lastFeedback = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { text, tokens: t } = await complete(messages)
    tokens += t
    const code = extractCode(text)

    // Ground truth: BOTH arms are judged by execution against the same cases.
    const verdict = judge(code, task, arm)
    if (verdict.ok) {
      return {
        arm,
        task: task.name,
        solved: true,
        attempts: attempt,
        repairedAfterFail: attempt > 1,
        tokens,
        lastFeedback: '',
      }
    }

    // The IN-LOOP signal differs per arm — this is the whole experiment.
    let signal: string
    if (arm === 'ts') {
      signal = (await tscFeedback(code)) ?? verdict.feedback
    } else {
      signal = tjsFeedback(code) ?? verdict.feedback
    }
    lastFeedback = signal

    messages.push({ role: 'assistant', content: text })
    messages.push({
      role: 'user',
      content: `That is not correct yet:\n${signal}\n\nFix it. Reply with ONLY the corrected function in a fenced code block.`,
    })
  }
  return {
    arm,
    task: task.name,
    solved: false,
    attempts: MAX_ATTEMPTS,
    repairedAfterFail: false,
    tokens,
    lastFeedback,
  }
}

export async function main() {
  const reps = Number(process.env.SPIKE_REPS ?? 1)
  const results: RunResult[] = []
  console.log(`model=${MODEL}  attempts<=${MAX_ATTEMPTS}  reps=${reps}\n`)
  for (const task of TASKS) {
    for (let r = 0; r < reps; r++) {
      for (const arm of ['ts', 'tjs'] as const) {
        try {
          const res = await runArm(task, arm)
          results.push(res)
          console.log(
            `${task.name.padEnd(11)} ${arm.padEnd(4)} ${
              res.solved ? 'solved' : 'FAILED'
            } in ${res.attempts} (${res.tokens} tok)${
              res.repairedAfterFail ? ' [repaired]' : ''
            }`
          )
        } catch (e: any) {
          console.log(
            `${task.name.padEnd(11)} ${arm.padEnd(4)} ERROR ${e.message.slice(
              0,
              60
            )}`
          )
        }
      }
    }
  }

  console.log('\n--- summary ---')
  for (const arm of ['ts', 'tjs'] as const) {
    const rs = results.filter((r) => r.arm === arm)
    if (!rs.length) continue
    const solved = rs.filter((r) => r.solved)
    const failedFirst = rs.filter((r) => r.attempts > 1 || !r.solved)
    console.log(
      `${arm.toUpperCase().padEnd(4)} solved ${solved.length}/${rs.length}` +
        `  mean attempts ${(
          rs.reduce((a, b) => a + b.attempts, 0) / rs.length
        ).toFixed(2)}` +
        `  repaired-after-fail ${
          failedFirst.length
            ? (
                (solved.filter((r) => r.repairedAfterFail).length /
                  failedFirst.length) *
                100
              ).toFixed(0) + '%'
            : 'n/a'
        }` +
        `  mean tokens ${Math.round(
          rs.reduce((a, b) => a + b.tokens, 0) / rs.length
        )}`
    )
  }
  return results
}

if (import.meta.main) await main()
