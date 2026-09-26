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

describe('every source entry × every hostile shape is cheap', () => {
  for (const [entry, run] of Object.entries(SOURCE_ENTRIES))
    for (const [shape, src] of Object.entries(SOURCES))
      it(`${entry} — ${shape}`, async () => {
        const t = performance.now()
        await run(src)
        expect(performance.now() - t).toBeLessThan(BOUND_MS)
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

describe('the TJS parser applies the same paren-depth limit (TJS ⊇ AJS)', () => {
  it('refuses parens nested deeper than the limit, cheaply', () => {
    const t = performance.now()
    expect(() =>
      tjs(`const a = ${'('.repeat(20_000)}1${')'.repeat(20_000)}`)
    ).toThrow(/nest more than/)
    expect(performance.now() - t).toBeLessThan(200)
  })
})
