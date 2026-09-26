/**
 * ADMISSION, as one table: every entry path × every hostile shape, each outcome CHEAP.
 *
 * The 0.14.0 release cycle blocked five times on one class — work proportional to caller
 * input, done before any budget could stop it — and each fix guarded one door while another
 * stayed open (docs/reviews/0.14.0-final-rereview-4.md). This file is the inventory of doors.
 * **A new way for caller input to reach the VM or the transpiler belongs in `ENTRIES`**, or it
 * is a door with no funnel. Shapes are the ones that were measured going quadratic or
 * unbounded; each row asserts the outcome (refused or run) arrives within a bound ~10x the
 * measured worst case, so a regression to super-linear (seconds, not ms) fails here.
 *
 * The funnel itself is `src/vm/admission.ts`.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm/vm'
import { Eval, SafeFunction } from './lang/eval'
import { transpile, tjs } from './lang/index'

// Just under the 8KB source default (0.14.0) — the cap IS the bound on parse work for
// untrusted AJS; see DEFAULT_MAX_SOURCE_BYTES.
const CAP = 8 * 1024 - 256
const BOUND_MS = 1500
/** Nesting that still fits under the cap, far past the 64-deep limit. */
const DEEP = Math.floor(CAP / 2) - 64

/** Hostile SOURCE shapes: each was measured super-linear or unbounded at some point. */
const SOURCES: Record<string, string> = {
  'line comments at the cap': '1 +\n' + '// pad\n'.repeat(CAP / 7) + '1',
  'blank lines at the cap': '1 +\n' + '\n'.repeat(CAP) + '1',
  '64-deep parens, repeated to the cap': (() => {
    const nest = '('.repeat(64) + '1' + ')'.repeat(64)
    return (nest + ' + ').repeat(Math.floor(CAP / (nest.length + 3))) + '1'
  })(),
  'parens nested to the cap': '('.repeat(DEEP) + '1' + ')'.repeat(DEEP),
  // The two shapes that walked past a guard reading a different lexical view (re-review 5):
  // the masker blanks `${…}` and reads `/` after `}` as a regex; the transform recursed into
  // the one and divided by the other.
  'parens nested to the cap inside a template ${}':
    '`${' + '('.repeat(DEEP) + '1' + ')'.repeat(DEEP) + '}`',
  'parens nested to the cap after `}` as division': (() => {
    const deep = '('.repeat(DEEP) + '1' + ')'.repeat(DEEP)
    return `(() => { if (1) {} return 1 })() /${deep}/ 1`
  })(),
  'a megabyte of source': 'x + ' + '1 + '.repeat(250_000) + '1',
  // UNBALANCED — an unmatched `(` never recurses, so a depth bound cannot see it; each one
  // rescanned to EOF (re-review 6, B-1: 64KB took 60-90s).
  'unbalanced ( to the cap': '('.repeat(CAP),
  'unbalanced ,( to the cap': '[' + ',('.repeat(CAP / 2),
  'unbalanced (? to the cap': '(?'.repeat(CAP / 2),
  "unbalanced (' to the cap": "('".repeat(CAP / 2),
  'many ternary colons in one expression': '(): '.repeat(CAP / 4) + '1',
  // >24 nested DISTINCT substrings: thrashed any size-bounded global cache the passes relied
  // on for linearity (the ternary memo held 16; re-review 7, M-1). A cache is not a bound.
  // Re-review 9's four, each super-linear with no refusal until the cap bounded them:
  'regexes in return types (B-1)':
    '[' + '(a): [x/] => 1,'.repeat(Math.floor(CAP / 15)) + '/]',
  'nested destructuring (B-2)': (() => {
    const d = Math.floor(CAP / 8)
    return `(function (${'{a: '.repeat(d)}b${' }'.repeat(d)}) { return 1 })`
  })(),
  'function head + whitespace run (B-3)': 'function' + ' '.repeat(CAP - 20),
  'brace nesting (B-4)': '{a;'.repeat(Math.floor(CAP / 3)),
  'nested distinct sub-sources, 30 deep': (() => {
    const unit = '('.repeat(30) + 'a' + '):0'.repeat(30) + ','
    return unit.repeat(Math.floor(CAP / unit.length))
  })(),
}

/** Every entry that takes caller SOURCE, as `expr → outcome`. */
const SOURCE_ENTRIES: Record<string, (expr: string) => Promise<unknown>> = {
  'Eval(code)': (e) => Eval({ code: e, fuel: 10, timeoutMs: 1 }),
  'SafeFunction(body)': async (e) => {
    try {
      const fn = await SafeFunction({ body: `return ${e}`, fuel: 10 })
      return await fn()
    } catch (err) {
      return err
    }
  },
  'vm.run(source string)': async (e) => {
    try {
      return await new AgentVM().run(
        `function f() { return { v: ${e} } }`,
        {},
        {
          fuel: 10,
        }
      )
    } catch (err) {
      return err
    }
  },
  'runCode (guest-built source)': (e) =>
    new AgentVM().run(
      {
        op: 'seq',
        steps: [
          { op: 'runCode', code: { $kind: 'arg', path: 'src' }, result: 'r' },
          { op: 'return', value: {} },
        ],
      } as any,
      { src: `function f() { return { v: ${e} } }` },
      {
        fuel: 10_000,
        argsMaxBytes: Infinity,
        capabilities: { code: { transpile: (s: string) => transpile(s).ast } },
      }
    ),
  'transpileCode (guest-built source)': (e) =>
    new AgentVM().run(
      {
        op: 'seq',
        steps: [
          {
            op: 'transpileCode',
            code: { $kind: 'arg', path: 'src' },
            result: 'r',
          },
          { op: 'return', value: {} },
        ],
      } as any,
      { src: `function f() { return { v: ${e} } }` },
      {
        fuel: 10_000,
        argsMaxBytes: Infinity,
        capabilities: { code: { transpile: (s: string) => transpile(s).ast } },
      }
    ),
}

/** The refusal a row EXPECTS — asserted, not just timed: a time bound alone passed while the
 * vm.run source cap was deleted (re-review 5, M-2). null = no refusal is required. */
const EXPECT: Record<string, RegExp | null> = {
  'line comments at the cap': null,
  'blank lines at the cap': null,
  '64-deep parens, repeated to the cap': null,
  // Either bound may fire first: the depth limit, or the work budget (64 levels × 40KB copied).
  'parens nested to the cap': /nest more than 64 deep|too complex to transpile/,
  'parens nested to the cap inside a template ${}':
    /nest more than 64 deep|too complex to transpile/,
  'parens nested to the cap after `}` as division':
    /nest more than 64 deep|too complex to transpile/,
  'a megabyte of source': /over the \d+-byte limit/,
  'unbalanced ( to the cap': null,
  'unbalanced ,( to the cap': null,
  'unbalanced (? to the cap': null,
  "unbalanced (' to the cap": null,
  'many ternary colons in one expression': null,
  'nested distinct sub-sources, 30 deep': null,
  'regexes in return types (B-1)': null,
  'nested destructuring (B-2)': null,
  'function head + whitespace run (B-3)': null,
  'brace nesting (B-4)': null,
}

/** Whatever an entry produced, as a message: a thrown error, an `{ error }` result, or ''. */
function reasonOf(x: any): string {
  if (x instanceof Error) return x.message
  const e = x?.error ?? x?.result?.error
  return e ? String(e.message ?? e) : ''
}

describe('every source entry × every hostile shape is cheap, and refused for the right reason', () => {
  for (const [entry, run] of Object.entries(SOURCE_ENTRIES))
    for (const [shape, src] of Object.entries(SOURCES))
      it(`${entry} — ${shape}`, async () => {
        const t = performance.now()
        const out = await run(src)
        expect(performance.now() - t).toBeLessThan(BOUND_MS)
        const want = EXPECT[shape]
        if (want) expect(reasonOf(out)).toMatch(want)
      })
})

describe('the source and argument caps are honoured at the value given', () => {
  const two = 'function f() { return { v: 1 } }\n' + '// x\n'.repeat(400) // ~2KB
  it('vm.run: maxSourceBytes 1024 refuses 2KB; a higher cap admits it; 0 disables', async () => {
    const vm = new AgentVM()
    expect(reasonOf(await vm.run(two, {}, { maxSourceBytes: 1024 }))).toMatch(
      /over the 1024-byte limit/
    )
    expect(reasonOf(await vm.run(two, {}, { maxSourceBytes: 4096 }))).toBe('')
    expect(reasonOf(await vm.run(two, {}, { maxSourceBytes: 0 }))).toBe('')
  })
  it('Eval / SafeFunction: argsMaxBytes refuses, and raising it admits', async () => {
    const big = 'x'.repeat(3_000_000) // ~6MB at two bytes per character
    expect(
      reasonOf(
        await Eval({ code: 's.length', context: { s: big }, fuel: 10_000 })
      )
    ).toMatch(/budget/)
    const ok = await Eval({
      code: 's.length',
      context: { s: big },
      fuel: 10_000,
      argsMaxBytes: 16 * 1024 * 1024,
    })
    expect(ok.result).toBe(3_000_000)
    const fn = await SafeFunction({
      params: ['s'],
      body: 'return s.length',
      fuel: 10_000,
    })
    expect(reasonOf(await fn(big))).toMatch(/budget/)
    const fn2 = await SafeFunction({
      params: ['s'],
      body: 'return s.length',
      fuel: 10_000,
      argsMaxBytes: 16 * 1024 * 1024,
    })
    expect((await fn2(big)).result).toBe(3_000_000)
  })
})

describe('run-level timeoutMs: 0 means the deadline has passed (re-review 5, M-1)', () => {
  it('…for a compute-only agent too (a zero-delay timer fired after it had finished)', async () => {
    const r = await new AgentVM().run(
      transpile(
        'function f() { let s = 0\nlet i = 0\nwhile (i < 50) { s = s + i\ni = i + 1 }\nreturn { s } }'
      ).ast,
      {},
      { fuel: 1000, timeoutMs: 0 }
    )
    expect(reasonOf(r)).toMatch(/Execution timeout after 0ms/)
  })
  it('a spent deadline is not an unlimited run', async () => {
    const r = await new AgentVM().run(
      transpile(
        'function f() { let r = httpFetch({ url: "https://x.test" })\nreturn { r } }'
      ).ast,
      {},
      {
        fuel: 100,
        timeoutMs: 0,
        capabilities: {
          fetch: () =>
            new Promise((res) => setTimeout(() => res({ ok: true }), 300)),
        },
      }
    )
    expect(reasonOf(r)).toMatch(/timeout|timed out|abort/i)
  })
})

describe('run options that budgets are computed from are refused when they are not numbers', () => {
  const ast = transpile(
    'function f({ items }) { return { n: items.length } }'
  ).ast
  const items = new Array(5_000_000).fill(1)
  const BAD: Array<[string, Record<string, unknown>]> = [
    ['fuel: "abc"', { fuel: 'abc' }],
    ['fuel: NaN', { fuel: NaN }],
    ['fuel: null', { fuel: null }],
    ['fuel: -1', { fuel: -1 }],
    ['timeoutMs: NaN', { timeoutMs: NaN }],
    ['argsMaxBytes: NaN', { argsMaxBytes: NaN }],
    ['maxSourceBytes: "x"', { maxSourceBytes: 'x' }],
    [
      'costOverrides negative (it MINTED fuel)',
      { costOverrides: { varsImport: -400 } },
    ],
    [
      'timeoutOverrides NaN (it disabled the timeout)',
      { timeoutOverrides: { varsImport: NaN } },
    ],
    ['quotas NaN (it read as unlimited)', { quotas: { httpFetch: NaN } }],
  ]
  for (const [label, opts] of BAD)
    it(label, async () => {
      const t = performance.now()
      const r = await new AgentVM().run(ast, { items }, opts as any)
      expect(r.error?.message).toMatch(/Invalid run option/)
      expect(performance.now() - t).toBeLessThan(100)
    })

  it('a function cost that returns a negative is refused where it is charged', async () => {
    const r = await new AgentVM().run(
      transpile('function f() { let a = 1\nreturn { a } }').ast,
      {},
      { fuel: 10, costOverrides: { varSet: () => -1000 } }
    )
    expect(r.error?.message).toMatch(/Invalid fuel cost/)
  })

  it('timeoutMs: Infinity means NO timer — it used to fire after 1ms', async () => {
    const r = await new AgentVM().run(
      transpile('function f() { let a = 1\nreturn { a } }').ast,
      {},
      { fuel: 100, timeoutMs: Infinity }
    )
    expect(r.error).toBeUndefined()
  })
})

describe('the TJS compiler accepts all of JavaScript (JS ⊆ TJS)', () => {
  it('nesting deeper than the AJS limit compiles — the limit is for untrusted code only', () => {
    expect(() =>
      tjs(`const a = ${'('.repeat(100)}1${')'.repeat(100)}`)
    ).not.toThrow()
  })
})

/**
 * A GENERATED grid, because the hand-written table above only catches the shapes it lists —
 * and twice missed ones a reviewer then measured quadratic (0.14.0 final re-review 6). Each
 * token from an alphabet of punctuation, literal openers and keywords is repeated to the
 * cap — balanced or not, since a single bracket repeated IS the unbalanced case — and pushed
 * through `Eval`, the entry the hosted endpoints use. Every row must finish within the bound,
 * whatever it returns. Add a token when a new syntax construct reaches the preprocessor.
 */
const ALPHABET = [
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '`${',
  "'",
  '"',
  '/',
  'a/',
  '():',
  'a',
  ' ',
  '\n',
  '//',
  '/*',
  ',(',
  '(?',
  "('",
  'function f(',
  'class A ',
  'class A (',
  'class A )',
  'class A [',
  ':',
  '=>',
  '?',
  'x:',
  '<',
  'async ',
  'get ',
  '$',
  '\\',
  '#',
  '? :',
  '(a)',
  '[a]',
  '{a:1}',
  '(a: 0) => ',
  'x ? (y) : ',
]

describe('generated grid: every token repeated to the cap is cheap through Eval', () => {
  for (const tok of ALPHABET)
    it(JSON.stringify(tok), async () => {
      const body = tok.repeat(Math.floor(CAP / tok.length))
      const t = performance.now()
      await Eval({ code: `let z = ${body}\nreturn z`, fuel: 10, timeoutMs: 1 })
      expect(performance.now() - t).toBeLessThan(BOUND_MS)
    })
})

describe('an aborted run takes no step and calls no capability (re-review 7, M-2, M-3)', () => {
  const ioFirst = () => {
    const calls: string[] = []
    const ast = transpile(
      'function f() { let r = httpFetch({ url: "https://x.test" })\nreturn { r } }'
    ).ast
    const fetch = async () => {
      calls.push('fetch')
      return { ok: true }
    }
    return { calls, ast, capabilities: { fetch } }
  }

  it('timeoutMs: 0 — the first-step capability is never invoked', async () => {
    const { calls, ast, capabilities } = ioFirst()
    const r = await new AgentVM().run(
      ast,
      {},
      { fuel: 100, timeoutMs: 0, capabilities }
    )
    await new Promise((res) => setTimeout(res, 20)) // let any detached work surface
    expect(calls).toEqual([])
    expect(reasonOf(r)).toMatch(/Execution timeout after 0ms/)
  })

  it('an ALREADY-aborted caller signal — no capability, and it is not called a timeout', async () => {
    const { calls, ast, capabilities } = ioFirst()
    const ac = new AbortController()
    ac.abort()
    const r = await new AgentVM().run(
      ast,
      {},
      { fuel: 100, signal: ac.signal, capabilities }
    )
    await new Promise((res) => setTimeout(res, 20))
    expect(calls).toEqual([])
    expect(reasonOf(r)).toMatch(/aborted by the caller/)
  })

  it('an already-aborted caller signal stops a compute-only agent too', async () => {
    const ac = new AbortController()
    ac.abort()
    const r = await new AgentVM().run(
      transpile(
        'function f() { let s = 0\nlet i = 0\nwhile (i < 50) { s = s + i\ni = i + 1 }\nreturn { s } }'
      ).ast,
      {},
      { fuel: 1000, signal: ac.signal }
    )
    expect(reasonOf(r)).toMatch(/aborted/i)
  })
})

describe('computed method names directly after a keyword (re-review 7 minor)', () => {
  for (const src of [
    'class A { static[Symbol.iterator](n: 0) { return n } }',
    'class A { get[Symbol.toStringTag](): "" { return "a" } }',
    'class A { set[k](v: 0) {} }',
  ])
    it(src, () => {
      expect(() => tjs(src)).not.toThrow()
    })
})

/**
 * PAIRS, not just single tokens: re-review 8 found a quadratic that only a pair shows — an
 * opener followed by an unbalanced bracket (`():(` ~1.9s) — and the grid's own run then found
 * `/\` and `/[` (a regex that never closes on its line, ~2-4s). Every opener × every
 * follower, repeated to the cap, through the AJS preprocessor (the code every source entry
 * shares), each within the bound.
 */
const OPENERS = [
  '():',
  '(a): ',
  '=>',
  '(a) => ',
  '(',
  'function f(',
  'class A ',
  'x ? ',
  '/',
  '`${',
  'a:',
  '(): x | ',
  '/[',
  '[',
  '{',
  '\\',
  '"',
]
const FOLLOWERS = [
  '(',
  '[',
  '{',
  '`',
  "'",
  '/',
  '`${',
  '//',
  '/*',
  ':',
  '?',
  '/[',
  ']',
  '\\',
  '"',
  ')',
  '}',
]

describe('generated PAIR grid: opener × follower, repeated to the cap', () => {
  const { preprocessAgentSource } = require('./lang/parser-agent')
  for (const o of OPENERS)
    it(`${JSON.stringify(o)} × every follower`, () => {
      for (const f of FOLLOWERS) {
        const unit = o + f
        const src = `function f() {\nlet z = ${unit.repeat(
          Math.floor(CAP / unit.length)
        )}\n}`
        const t = performance.now()
        try {
          preprocessAgentSource(src)
        } catch {
          // Refusing (a parse error, a budget) is a fine outcome; only the time is asserted.
        }
        const ms = performance.now() - t
        expect({ unit, slow: ms > BOUND_MS }).toEqual({ unit, slow: false })
      }
    })
})

describe('the transform work budget (TransformWork)', () => {
  const {
    transformParenExpressions,
    WORK_PER_CHAR,
  } = require('./lang/parser-params')
  const ctx = (work: any, src: string) => ({
    originalSource: src,
    requiredParams: new Set(),
    typeNameOptionals: new Set(),
    unsafeFunctions: new Set(),
    safeFunctions: new Set(),
    work,
  })
  it('refuses when the work exceeds the budget', () => {
    const src = 'function f(a: 0) { return (b: 0) => a + b }'
    expect(() =>
      transformParenExpressions(src, ctx({ used: 0, limit: 10 }, src))
    ).toThrow(/too complex to transpile/)
  })
  it('real code uses a small fraction of it (so it can never refuse real code)', () => {
    const { readFileSync } = require('fs')
    const { join } = require('path')
    let worst = 0
    for (const f of [
      'lang/parser.ts',
      'lang/parser-params.ts',
      'vm/runtime.ts',
      'lang/emitters/js.ts',
    ]) {
      const src = readFileSync(join(import.meta.dir, f), 'utf8')
      const work = { used: 0, limit: Infinity }
      transformParenExpressions(src, ctx(work, src))
      worst = Math.max(worst, work.used / src.length)
    }
    // Measured 2026-09-26 across 1,368 files: median 2.0, p99 3.5, max 8.8.
    expect(worst).toBeLessThan(WORK_PER_CHAR / 4)
  })
})

describe('the work budget never refuses VALID AJS under the cap (re-review 9)', () => {
  const { preprocessAgentSource } = require('./lang/parser-agent')
  it('a return type holding hundreds of regex literals', () => {
    const regexes = Array.from({ length: 600 }, (_, i) => `/a${i}/`).join(', ')
    const src = `function f(a: 1): [${regexes}] { return [] }`
    expect(src.length).toBeLessThan(CAP)
    expect(() => preprocessAgentSource(src)).not.toThrow(/too complex/)
  })
  it('deep grouping parens around real content', () => {
    const src = `function f() { return ${'('.repeat(40)}${'1 + '.repeat(
      300
    )}1${')'.repeat(40)} }`
    expect(src.length).toBeLessThan(CAP)
    expect(() => preprocessAgentSource(src)).not.toThrow(/too complex/)
  })
})
