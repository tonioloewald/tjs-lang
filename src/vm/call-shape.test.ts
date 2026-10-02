/**
 * How a call's arguments reach an atom: the whole table, in one place (`callShape` in runtime.ts).
 *
 * Rounds 14 and 15 of the 0.14.0-rc.2 reviews each fixed ONE cell of this table, in a different
 * place, and broke a neighbouring cell: refusing positional calls caught `random()`; dropping
 * `args` from `foo()` in the emitter then left positional embedder atoms with `args` undefined.
 * So every cell is asserted here, from `transpile()` output, on both VM builds. The two
 * hand-built rows are persisted ASTs (an older emitter's shapes), and say so.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { AgentVM as AstVM } from './ast'
import { defineAtom } from './runtime'

// a POSITIONAL embedder atom: its schema declares `args`
const countArgs = defineAtom(
  'countArgs',
  s.object({ args: s.array(s.any) }),
  s.number,
  async ({ args }: { args: unknown[] }) => args.length,
  { effects: 'pure' }
)
// a NAMED embedder atom whose inputs are all optional
const greet = defineAtom(
  'greet',
  s.object({ name: s.string.optional }),
  s.string,
  async ({ name }: { name?: string }) => `hi ${name ?? 'you'}`,
  { effects: 'pure' }
)
// a NAMED input that happens to be called `args` (as runCode's is): a record, not positional
const withArgs = defineAtom(
  'withArgs',
  s.object({ code: s.string.optional, args: s.record(s.any).optional }),
  s.any,
  async ({ args }: { args?: Record<string, unknown> }) => args ?? 'none',
  { effects: 'pure' }
)
// a positional atom whose `args` is OPTIONAL (the Error atom's shape: type ['array', 'null'])
const optArgs = defineAtom(
  'optArgs',
  s.object({ args: s.array(s.any).optional }),
  s.number,
  async ({ args }: { args?: unknown[] }) => (args ?? []).length,
  { effects: 'pure' }
)
const atoms = { countArgs, greet, withArgs, optArgs } as any

const CELLS: Array<[string, string, unknown]> = [
  // [cell, call, result or /refusal/]
  ['positional atom, empty call', 'countArgs()', 0],
  ['positional atom, values', 'countArgs(1, 2, 3)', 3],
  ['named atom, empty call', 'greet()', 'hi you'],
  ['named atom, named call', "greet({ name: 'ann' })", 'hi ann'],
  [
    'named atom, positional values',
    "greet('ann')",
    /'greet' takes named arguments: greet\(\{ name \}\)/,
  ],
  ['core named atom, empty call', 'random()', 'number'],
  ['optional positional atom, values', "optArgs('a', 'b')", 2],
  ['optional positional atom, empty call', 'optArgs()', 0],
  ['named `args` record, named call', 'withArgs({ args: { n: 2 } })', { n: 2 }],
  ['named `args` record, empty call', 'withArgs()', 'none'],
  [
    'named `args` record, positional values',
    "withArgs('x')",
    /'withArgs' takes named arguments: withArgs\(\{ code, args \}\)/,
  ],
]

for (const [label, VM] of [
  ['vm', AgentVM],
  ['vm-ast', AstVM],
] as const)
  describe(`${label}: every cell of the call-shape table`, () => {
    for (const [cell, call, want] of CELLS)
      it(cell, async () => {
        const r = await new (VM as any)(atoms).run(
          transpile(`function f() { const v = ${call}\n return { v } }`).ast,
          {},
          { fuel: 1000 }
        )
        if (want instanceof RegExp)
          expect(r.error?.message ?? 'admitted').toMatch(want)
        else if (want === 'number') {
          expect(r.error).toBeUndefined()
          expect(typeof (r.result as any).v).toBe('number')
        } else {
          expect(r.error).toBeUndefined()
          expect(r.result).toEqual({ v: want })
        }
      })

    // hand-built: persisted shapes. bccbecb's emitter wrote NO `args` for `foo()`; earlier ones
    // wrote `args: []` for it. Both must keep running.
    for (const [shape, step] of [
      ['args absent', { op: 'countArgs', result: 'v' }],
      ['args: [] to a named atom', { op: 'greet', args: [], result: 'v' }],
    ] as const)
      it(`persisted shape: ${shape}`, async () => {
        const r = await new (VM as any)(atoms).run(
          { op: 'seq', steps: [step, { op: 'return', value: { v: 'v' } }] },
          {},
          { fuel: 1000 }
        )
        expect(r.error).toBeUndefined()
        expect(r.result).toEqual({ v: shape === 'args absent' ? 0 : 'hi you' })
      })
  })
