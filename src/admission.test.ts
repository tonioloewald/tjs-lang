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

const CAP = 60_000 // just under the 64KB source default
const BOUND_MS = 1500

/** Hostile SOURCE shapes: each was measured super-linear or unbounded at some point. */
const SOURCES: Record<string, string> = {
  'line comments at the cap': '1 +\n' + '// pad\n'.repeat(CAP / 7) + '1',
  'blank lines at the cap': '1 +\n' + '\n'.repeat(CAP) + '1',
  '64-deep parens, repeated to the cap': (() => {
    const nest = '('.repeat(64) + '1' + ')'.repeat(64)
    return (nest + ' + ').repeat(Math.floor(CAP / (nest.length + 3))) + '1'
  })(),
  'parens nested 20000 deep': '('.repeat(20_000) + '1' + ')'.repeat(20_000),
  // The two shapes that walked past a guard reading a different lexical view (re-review 5):
  // the masker blanks `${…}` and reads `/` after `}` as a regex; the transform recursed into
  // the one and divided by the other.
  'parens nested 20000 deep inside a template ${}':
    '`${' + '('.repeat(20_000) + '1' + ')'.repeat(20_000) + '}`',
  'parens nested 20000 deep after `}` as division': (() => {
    const deep = '('.repeat(20_000) + '1' + ')'.repeat(20_000)
    return `(() => { if (1) {} return 1 })() /${deep}/ 1`
  })(),
  'a megabyte of source': 'x + ' + '1 + '.repeat(250_000) + '1',
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
  'parens nested 20000 deep': /nest more than 64 deep/,
  'parens nested 20000 deep inside a template ${}': /nest more than 64 deep/,
  'parens nested 20000 deep after `}` as division': /nest more than 64 deep/,
  'a megabyte of source': /over the \d+-byte limit/,
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
