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
import { compilePredicate, emitVerifiedPredicate } from './lang/predicate'
import { defineAtom } from './vm/runtime'
import { checkedQuota } from './vm/admission'

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
  // (The DENSEST destructuring shape runs once, through Eval, below: all source entries share
  // one parser, and running it through six of them cost ~2s of fast-lane time for nothing.)
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
  // The path vm.run(source)'s deprecation recommends, used IN-PROCESS: opt-in cap.
  'transpile (in-process, capped)': async (e) => {
    try {
      return transpile(`function f() { return { v: ${e} } }`, {
        maxSourceBytes: 8 * 1024,
      })
    } catch (err) {
      return err
    }
  },
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

describe('vm.run(source) is deprecated, noted once in the flight recorder', () => {
  it('exactly one notice per process, none for ASTs, and it names where to parse', () => {
    // Paths from `import.meta.dir`, which the dogfood harness rewrites to the real tree when it
    // relocates this file; `require.resolve('./x')` it does not rewrite.
    const SRC = import.meta.dir
    // A fresh PROCESS: the once-flag is process-wide, and an in-process test passed even with
    // the record call deleted (re-review 10).
    const script = `
      import { AgentVM } from ${JSON.stringify(SRC + '/vm/vm.ts')}
      import { createRuntime } from ${JSON.stringify(SRC + '/lang/runtime.ts')}
      import { transpile } from ${JSON.stringify(SRC + '/lang/index.ts')}
      globalThis.__tjs = createRuntime()
      const vm = new AgentVM()
      await vm.run(transpile('function f() { return { a: 0 } }').ast, {}, { fuel: 50 })
      const before = globalThis.__tjs.records({ source: 'vm' }).length
      const r = await vm.run('function f() { return { a: 1 } }', {}, { fuel: 50 })
      await vm.run('function f() { return { a: 2 } }', {}, { fuel: 50 })
      const notes = globalThis.__tjs.records({ source: 'vm' }).filter((x) => /deprecated/.test(x.message))
      console.log(JSON.stringify({ before, n: notes.length, a: r.result.a, msg: notes[0]?.message }))
    `
    const out = Bun.spawnSync(['bun', '-e', script], {
      cwd: import.meta.dir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const res = JSON.parse(
      new TextDecoder().decode(out.stdout).trim().split('\n').pop()!
    )
    expect(res.before).toBe(0)
    expect(res.n).toBe(1)
    expect(res.a).toBe(1)
    expect(res.msg).toMatch(
      /caller's machine, or in a worker or separate process/
    )
    expect(res.msg).toMatch(/maxSourceBytes/)
  })
})

describe('re-review 10: caps that were fail-open or unreachable', () => {
  it('Eval and SafeFunction refuse a NaN or negative maxSourceBytes (they disabled the cap)', async () => {
    for (const bad of [NaN, -1]) {
      const r = await Eval({ code: '1', maxSourceBytes: bad as any })
      expect(reasonOf(r)).toMatch(/Invalid maxSourceBytes/)
      await expect(
        SafeFunction({ body: 'return 1', maxSourceBytes: bad as any })
      ).rejects.toThrow(/Invalid maxSourceBytes/)
    }
  })
  it('SafeFunction measures the ASSEMBLED source — params cannot carry a payload past the cap', async () => {
    const d = 3000
    const params = [`${'{a: '.repeat(d)}b${' }'.repeat(d)}`]
    await expect(SafeFunction({ params, body: 'return 1' })).rejects.toThrow(
      /over the \d+-byte limit/
    )
  })
  it('runCode honours a LOWER run maxSourceBytes (re-review 12: it may only lower the guest cap)', async () => {
    const code = { transpile: (s: string) => transpile(s).ast }
    const src = 'function f() { return { v: 1 } }\n' + '// pad\n'.repeat(500) // ~3.5KB
    const ast = {
      op: 'seq',
      steps: [
        { op: 'runCode', code: { $kind: 'arg', path: 'src' }, result: 'r' },
        { op: 'return', value: {} },
      ],
    } as any
    const admitted = await new AgentVM().run(
      ast,
      { src },
      { fuel: 10_000, capabilities: { code } }
    )
    expect(reasonOf(admitted)).toBe('')
    const lowered = await new AgentVM().run(
      ast,
      { src },
      { fuel: 10_000, maxSourceBytes: 2048, capabilities: { code } }
    )
    expect(reasonOf(lowered)).toMatch(/over the 2048-byte limit/)
  })
})

describe('the documented worst case at the cap (densest nested destructuring)', () => {
  it('through Eval — the figure CHANGELOG and admission.ts quote (~455ms)', async () => {
    const d = Math.floor((CAP - 40) / 4)
    const code = `(function (${'{a:'.repeat(d)}b${'}'.repeat(d)}) { return 1 })`
    const t = performance.now()
    await Eval({ code, fuel: 10, timeoutMs: 1 })
    expect(performance.now() - t).toBeLessThan(BOUND_MS)
  })
})

describe('re-review 11: the cap is validated in the funnel, and the guest path is never uncapped', () => {
  it('transpile(source, { maxSourceBytes }) refuses NaN, negative, null and strings', () => {
    for (const bad of [NaN, -1, null, '8192'] as any[])
      expect(() =>
        transpile('function f() { return { a: 1 } }', { maxSourceBytes: bad })
      ).toThrow(/Invalid maxSourceBytes/)
    // 0 and Infinity disable it, as documented.
    for (const off of [0, Infinity])
      expect(() =>
        transpile('function f() { return { a: 1 } }', { maxSourceBytes: off })
      ).not.toThrow()
  })
  // 0 and Infinity disable the run's cap; 64KB raises it. None of them may reach the guest
  // path — text the guest builds can come from llmPredict output (re-reviews 11 and 12).
  it.each([0, Infinity, 64 * 1024])(
    'a run maxSourceBytes of %p does NOT widen guest-built source for runCode',
    async (runMax) => {
      const code = { transpile: (src: string) => transpile(src).ast }
      const src = 'function f() { return { v: 1 } }\n' + '// pad\n'.repeat(1500) // ~10KB
      const ast = {
        op: 'seq',
        steps: [
          { op: 'runCode', code: { $kind: 'arg', path: 'src' }, result: 'r' },
          { op: 'return', value: {} },
        ],
      } as any
      const r = await new AgentVM().run(
        ast,
        { src },
        {
          fuel: 10_000,
          maxSourceBytes: runMax,
          capabilities: { code },
        }
      )
      expect(reasonOf(r)).toMatch(/over the 8192-byte limit/)
    }
  )
})

describe('re-review 12: every budget option is read through the funnel', () => {
  // exponential recursion: 2^40 calls unless fuel stops it
  const RUNAWAY = `
    function b(n) { if (n <= 0) return false; return b(n - 1) || b(n - 1) }
    function spin(x) { return b(40) }`

  it('compilePredicate stops a runaway at a real budget, and refuses a budget that is not one', () => {
    const t = performance.now()
    const { spin } = compilePredicate(RUNAWAY, ['spin'], { fuel: 1000 })
    expect(() => spin(1)).toThrow(/fuel budget \(1000\)/)
    expect(performance.now() - t).toBeLessThan(BOUND_MS)
    // NaN made `--fuel < 0` never true: the call ran unbounded (reproduced at >10s).
    for (const bad of [NaN, -1, null, '1; x()'] as any[])
      expect(() => compilePredicate(RUNAWAY, ['spin'], { fuel: bad })).toThrow(
        /Invalid fuel/
      )
  })

  it('emitVerifiedPredicate refuses the same values, before any of them reaches emitted source', () => {
    for (const bad of [NaN, -1, null, '1; x()'] as any[])
      expect(() =>
        emitVerifiedPredicate(RUNAWAY, 'spin', { fuel: bad })
      ).toThrow(/Invalid fuel/)
    // A real budget: the runaway returns false (a guard answers a boolean question).
    const r = emitVerifiedPredicate(RUNAWAY, 'spin', { fuel: 1000 })
    const guard = new Function(`return ${r.code}`)()
    const t = performance.now()
    expect(guard(1)).toBe(false)
    expect(performance.now() - t).toBeLessThan(BOUND_MS)
  })

  it('Infinity is an explicit "no limit" — accepted, as it is for every other ceiling', () => {
    const ok = `function isPos(x) { return x > 0 }`
    expect(compilePredicate(ok, ['isPos'], { fuel: Infinity }).isPos(1)).toBe(
      true
    )
    // ...but not in EMITTED code, which runs in someone else's program (re-review 13, G-11).
    expect(() =>
      emitVerifiedPredicate(ok, 'isPos', { fuel: Infinity })
    ).toThrow(/must be finite/)
  })

  it('compilePredicate splices only VERIFIED names into generated source', () => {
    const ok = `function isPos(x) { return x > 0 }`
    expect(() =>
      compilePredicate(ok, ['isPos }; globalThis.pwned = 1; ({ x'])
    ).toThrow(/not a predicate in the verified cluster/)
    expect((globalThis as any).pwned).toBeUndefined()
  })

  it('an atom with an invalid static timeoutMs is refused where it is defined', () => {
    for (const bad of [NaN, -1, '10'] as any[])
      expect(() =>
        defineAtom('bad', undefined, undefined, async () => 1, {
          timeoutMs: bad,
        })
      ).toThrow(/Invalid timeoutMs of atom 'bad'/)
  })

  it('an atom with timeoutMs: Infinity does not make every run on the VM unbounded', () => {
    const forever = defineAtom('forever', undefined, undefined, async () => 1, {
      timeoutMs: Infinity,
    })
    const vm = new AgentVM({ forever })
    expect(Number.isFinite(vm.defaultRunTimeout)).toBe(true)
  })

  it('a refusal names the bad value (JSON rendered NaN as "null")', async () => {
    const r = await new AgentVM().run(
      { op: 'seq', steps: [] } as any,
      {},
      {
        fuel: NaN,
      }
    )
    expect(reasonOf(r)).toMatch(/fuel: NaN/)
    expect(() => transpile('1', { maxSourceBytes: -Infinity })).toThrow(
      /-Infinity/
    )
  })
})

describe('re-review 13: every run option is classified, and quotaUsed is a counter', () => {
  const ping = defineAtom('ping', undefined, undefined, async () => 1, {
    effects: 'pure',
  })
  const fourPings = {
    op: 'seq',
    steps: [1, 2, 3, 4].map(() => ({ op: 'ping' })),
  } as any

  it('a corrupted quotaUsed is refused — it used to switch the quota off', async () => {
    // NaN: `NaN >= 1` is false, so every call ran. -100 granted a hundred extra calls. A
    // string concatenated ('x1111'). Infinity is a corrupted COUNT, not "no limit".
    for (const bad of [NaN, -100, 'x', Infinity, null] as any[]) {
      const calls: number[] = []
      const counted = defineAtom(
        'ping',
        undefined,
        undefined,
        async () => {
          calls.push(1)
        },
        { effects: 'pure' }
      )
      const r = await new AgentVM({ ping: counted }).run(
        fourPings,
        {},
        {
          quotas: { ping: 1 },
          quotaUsed: { ping: bad },
        }
      )
      expect(reasonOf(r)).toMatch(/Invalid run option quotaUsed\.ping/)
      expect(calls.length).toBe(0)
    }
    for (const bad of [[], 'counts', 3] as any[]) {
      const r = await new AgentVM({ ping }).run(
        fourPings,
        {},
        {
          quotaUsed: bad,
        }
      )
      expect(reasonOf(r)).toMatch(/Invalid run option quotaUsed/)
    }
  })

  it('a valid shared counter still holds the quota across runs', async () => {
    const quotaUsed = {}
    const vm = new AgentVM({ ping })
    const one = { op: 'seq', steps: [{ op: 'ping' }] } as any
    expect(
      reasonOf(await vm.run(one, {}, { quotas: { ping: 1 }, quotaUsed }))
    ).toBe('')
    expect(
      reasonOf(await vm.run(one, {}, { quotas: { ping: 1 }, quotaUsed }))
    ).toMatch(/[Qq]uota/)
  })

  it('a hand-built atom with an invalid timeoutMs is refused when the VM is BUILT', () => {
    // defineAtom checks its own; an atom object written by hand used to reach vm.run and throw
    // out of the defaultRunTimeout getter (re-review 13, F-2).
    for (const bad of [NaN, -1, '10'] as any[]) {
      const handBuilt = { ...ping, op: 'handBuilt', timeoutMs: bad }
      expect(() => new AgentVM({ handBuilt } as any)).toThrow(
        /Invalid timeoutMs of atom 'handBuilt'/
      )
    }
  })
})

describe('re-review 14: a table is checked over exactly the set its reads resolve', () => {
  const counted = () => {
    const calls: number[] = []
    const ping = defineAtom(
      'ping',
      undefined,
      undefined,
      async () => {
        calls.push(1)
      },
      { effects: 'pure' }
    )
    return { calls, vm: new AgentVM({ ping }) }
  }
  const fivePings = {
    op: 'seq',
    steps: [1, 2, 3, 4, 5].map(() => ({ op: 'ping' })),
  } as any
  const nonEnumerable = (value: unknown) =>
    Object.defineProperty({}, 'ping', { value, enumerable: false })
  const getter = (first: unknown, then: unknown) => {
    let reads = 0
    return Object.defineProperty({}, 'ping', {
      get: () => (reads++ === 0 ? first : then),
      enumerable: true,
    })
  }

  // Every shape re-review 14 reproduced making all 5 calls against a cap of 2.
  const hostile: Record<string, Record<string, unknown>> = {
    'quotas as a Map': { quotas: new Map([['ping', 2]]) },
    'quotas inheriting NaN': { quotas: Object.create({ ping: NaN }) },
    'quotas with a non-enumerable NaN': { quotas: nonEnumerable(NaN) },
    'quotas behind a getter': { quotas: getter(2, NaN) },
    'quotaUsed inheriting -100': {
      quotas: { ping: 2 },
      quotaUsed: Object.create({ ping: -100 }),
    },
    'quotaUsed with a non-enumerable -100': {
      quotas: { ping: 2 },
      quotaUsed: nonEnumerable(-100),
    },
    'quotaUsed behind a getter': {
      quotas: { ping: 2 },
      quotaUsed: getter(0, -100),
    },
  }
  for (const [label, options] of Object.entries(hostile))
    it(`${label} is refused before any call`, async () => {
      const { calls, vm } = counted()
      const r = await vm.run(fivePings, {}, options)
      expect(reasonOf(r)).toMatch(/Invalid run option quota/)
      expect(calls.length).toBe(0)
    })

  it('the baseline still stops at the cap', async () => {
    const { calls, vm } = counted()
    const r = await vm.run(fivePings, {}, { quotas: { ping: 2 } })
    expect(reasonOf(r)).toMatch(/Quota exceeded/)
    expect(calls.length).toBe(2)
  })

  it('a quotas table changed AFTER admission changes nothing — the VM reads a snapshot', async () => {
    const { calls, vm } = counted()
    const quotas: Record<string, number> = { ping: 2 }
    const bump = defineAtom('bump', undefined, undefined, async () => {
      quotas.ping = NaN
    })
    const vm2 = new AgentVM({ ping: (vm as any).atoms.ping, bump })
    const ast = {
      op: 'seq',
      steps: [{ op: 'bump' }, ...fivePings.steps],
    } as any
    const r = await vm2.run(ast, {}, { quotas })
    expect(reasonOf(r)).toMatch(/Quota exceeded/)
    expect(calls.length).toBe(2)
  })

  it('a shared quotaUsed corrupted MID-RUN refuses the next step', async () => {
    const { calls } = counted()
    const quotaUsed: Record<string, any> = {}
    const corrupt = defineAtom('corrupt', undefined, undefined, async () => {
      quotaUsed.ping = -100
    })
    const ping = defineAtom(
      'ping',
      undefined,
      undefined,
      async () => {
        calls.push(1)
      },
      { effects: 'pure' }
    )
    const ast = {
      op: 'seq',
      steps: [{ op: 'ping' }, { op: 'corrupt' }, ...fivePings.steps],
    } as any
    const r = await new AgentVM({ ping, corrupt }).run(
      ast,
      {},
      {
        quotas: { ping: 2 },
        quotaUsed,
      }
    )
    expect(reasonOf(r)).toMatch(/Invalid quotaUsed\.ping/)
    expect(calls.length).toBe(1)
  })

  it("an atom named like an Object.prototype member is not charged by the prototype's function", async () => {
    const toString = defineAtom(
      'toString',
      undefined,
      undefined,
      async () => 1,
      {
        effects: 'pure',
        cost: 1,
      }
    )
    const r = await new AgentVM({ toString }).run(
      { op: 'seq', steps: [{ op: 'toString' }] } as any,
      {},
      { costOverrides: {}, fuel: 10 }
    )
    expect(reasonOf(r)).toBe('')
  })

  it('a function timeoutMs on defineAtom is still supported (its result is checked per call)', () => {
    expect(() =>
      defineAtom('slow', undefined, undefined, async () => 1, {
        timeoutMs: (() => 50) as any,
      })
    ).not.toThrow()
  })
})

describe("re-review 14 (pre-empted): a lying shared counter cannot lower this run's count", () => {
  it('a Proxy quotaUsed that always reports 0 still stops at the cap', async () => {
    const calls: number[] = []
    const ping = defineAtom(
      'ping',
      undefined,
      undefined,
      async () => {
        calls.push(1)
      },
      { effects: 'pure' }
    )
    const liar = new Proxy({} as Record<string, number>, {
      getOwnPropertyDescriptor: () => undefined, // "never counted"
      set: () => true,
    })
    const r = await new AgentVM({ ping }).run(
      { op: 'seq', steps: [1, 2, 3, 4, 5].map(() => ({ op: 'ping' })) } as any,
      {},
      { quotas: { ping: 2 }, quotaUsed: liar }
    )
    expect(reasonOf(r)).toMatch(/Quota exceeded/)
    expect(calls.length).toBe(2)
  })
})

describe('re-review 15: the options are read ONCE, and the run reads only what was checked', () => {
  const setup = () => {
    const calls: number[] = []
    const ping = defineAtom(
      'ping',
      undefined,
      undefined,
      async () => {
        calls.push(1)
      },
      { effects: 'pure' }
    )
    return { calls, vm: new AgentVM({ ping }) }
  }
  const fourPings = {
    op: 'seq',
    steps: [1, 2, 3, 4].map(() => ({ op: 'ping' })),
  } as any

  it('a getter-backed quotas is refused — it answered the check {ping:1} and the run {ping:NaN}', async () => {
    const { calls, vm } = setup()
    let m = 0
    const options = {
      get quotas() {
        return m++ === 0 ? { ping: 1 } : { ping: NaN }
      },
    }
    const r = await vm.run(fourPings, {}, options as any)
    expect(reasonOf(r)).toMatch(/Invalid run option quotas: an accessor/)
    expect(calls.length).toBe(0)
  })

  it('a getter-backed fuel is refused', async () => {
    const { calls, vm } = setup()
    let m = 0
    const options = {
      get fuel() {
        return m++ === 0 ? 1 : NaN
      },
    }
    const r = await vm.run(fourPings, {}, options as any)
    expect(reasonOf(r)).toMatch(/Invalid run option fuel: an accessor/)
    expect(calls.length).toBe(0)
  })

  it('an options object built on defaults (Object.create) still works', async () => {
    const { calls, vm } = setup()
    const defaults = { quotas: { ping: 2 } }
    const r = await vm.run(fourPings, {}, Object.create(defaults))
    expect(reasonOf(r)).toMatch(/Quota exceeded/)
    expect(calls.length).toBe(2)
  })

  it('a Proxy table that answers the check 1 and a later read NaN is held to 1', async () => {
    const { calls, vm } = setup()
    let n = 0
    const table = new Proxy({} as Record<string, number>, {
      ownKeys: () => ['ping'],
      getOwnPropertyDescriptor: () => ({
        value: n++ === 0 ? 1 : NaN,
        writable: true,
        enumerable: true,
        configurable: true,
      }),
      get: () => NaN,
    })
    const r = await vm.run(fourPings, {}, { quotas: table })
    expect(reasonOf(r)).toMatch(/Quota exceeded/)
    expect(calls.length).toBe(1)
  })

  it('a frozen or read-only quotaUsed is refused at admission, naming it', async () => {
    const { vm } = setup()
    for (const quotaUsed of [
      Object.freeze({}),
      Object.defineProperty({}, 'ping', {
        value: 0,
        writable: false,
        enumerable: true,
      }),
    ]) {
      const r = await vm.run(fourPings, {}, { quotas: { ping: 2 }, quotaUsed })
      expect(reasonOf(r)).toMatch(
        /Invalid run option quotaUsed.*(extensible|read-only)/
      )
    }
  })

  it('a quotaUsed whose write-back throws ends the run with a clean AgentError', async () => {
    const { calls, vm } = setup()
    const throwing = new Proxy({} as Record<string, number>, {
      set: () => {
        throw new Error('storage offline')
      },
    })
    const r = await vm.run(
      fourPings,
      {},
      { quotas: { ping: 2 }, quotaUsed: throwing }
    )
    expect(r.error).toBeDefined()
    expect(reasonOf(r)).toMatch(/storage offline/)
    expect(calls.length).toBe(0)
  })

  it('quota accounting order is pinned: a step refused for fuel still spends its quota slot', async () => {
    // Deliberate and conservative: the quota is checked and counted BEFORE fuel, so a quota'd
    // call can never have happened without being counted. The cost is that a step refused for
    // fuel spends a slot it did not use.
    const quotaUsed: Record<string, number> = {}
    const { vm } = setup()
    await vm.run(
      { op: 'seq', steps: [{ op: 'ping' }] } as any,
      {},
      { quotas: { ping: 5 }, quotaUsed, costOverrides: { ping: 1000 }, fuel: 1 }
    )
    expect(quotaUsed.ping).toBe(1)
  })

  it('a function timeoutMs on defineAtom is USED: its result times the atom out', async () => {
    const slow = defineAtom(
      'slow',
      undefined,
      undefined,
      () => new Promise((resolve) => setTimeout(resolve, 300)),
      { timeoutMs: (() => 20) as any }
    )
    const t = performance.now()
    const r = await new AgentVM({ slow }).run(
      { op: 'seq', steps: [{ op: 'slow' }] } as any,
      {},
      { timeoutMs: 5000 }
    )
    expect(reasonOf(r)).toMatch(/timed out/)
    expect(performance.now() - t).toBeLessThan(250)
  })
})

describe('re-review 16 follow-ups', () => {
  it('options that are not an object are refused — a function carrying quotas was read as {}', async () => {
    const f: any = () => 0
    f.quotas = { ping: 'x' }
    f.fuel = NaN
    for (const bad of [f, null, 3, 'fuel'] as any[]) {
      const r = await new AgentVM().run(
        { op: 'seq', steps: [] } as any,
        {},
        bad
      )
      expect(reasonOf(r)).toMatch(/Invalid run options/)
    }
  })

  it('a cyclic prototype on the options is refused, not looped on', async () => {
    const cyclic: any = new Proxy({}, { getPrototypeOf: () => cyclic })
    const t = performance.now()
    const r = await new AgentVM().run(
      { op: 'seq', steps: [] } as any,
      {},
      cyclic
    )
    expect(reasonOf(r)).toMatch(/prototype chain/)
    expect(performance.now() - t).toBeLessThan(BOUND_MS)
  })

  it('checkedQuota refuses a non-budget quota at the read (the second line)', () => {
    expect(() => checkedQuota(NaN, 'ping')).toThrow(/Invalid quota for 'ping'/)
    expect(checkedQuota(3, 'ping')).toBe(3)
  })

  it("the run's own slot is spent even when the shared write-back throws", async () => {
    const calls: number[] = []
    const ping = defineAtom(
      'ping',
      undefined,
      undefined,
      async () => {
        calls.push(1)
      },
      { effects: 'pure' }
    )
    let first = true
    const flaky = new Proxy({} as Record<string, number>, {
      set: (t, k, v) => {
        if (first) {
          first = false
          throw new Error('flaky store')
        }
        ;(t as any)[k] = v
        return true
      },
    })
    const r = await new AgentVM({ ping }).run(
      { op: 'seq', steps: [{ op: 'ping' }] } as any,
      {},
      { quotas: { ping: 1 }, quotaUsed: flaky }
    )
    expect(reasonOf(r)).toMatch(/flaky store/)
    expect(calls.length).toBe(0) // counted before the call; the call never happened
  })
})
