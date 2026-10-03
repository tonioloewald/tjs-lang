/**
 * Atoms take NAMED arguments (Tonio, 2026-10-03), checked at both ends without reading a schema.
 *
 * Rounds 14 to 17 of the 0.14.0-rc.2 reviews tried to decide positional versus named per atom by
 * reading its input schema. Each round fixed one shape (`random()`, a positional embedder atom, a
 * named `args` record, an optional array) and the next review found another (`args: s.any`). The
 * rule is now syntactic. A call to an atom is a single object literal, or nothing. The transpiler
 * refuses anything else with an instructive error, checked on the SYNTAX: the AST encodes
 * `foo(a, b)` as an input named `args`, indistinguishable from `foo({ args: [a, b] })`, so the VM
 * cannot and does not police it. Local functions and `Error('message')` are positional by design.
 *
 * Rows use `transpile()` output; the one hand-built row is a persisted rc.1 shape, and says so.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { AgentVM as AstVM } from './ast'
import { defineAtom } from './runtime'

const greet = defineAtom(
  'greet',
  s.object({ name: s.string.optional }),
  s.string,
  async ({ name }: { name?: string }) => `hi ${name ?? 'you'}`,
  { effects: 'pure' }
)
// the shape the old rules kept guessing about: an untyped input called `args`
const loose = defineAtom(
  'loose',
  s.object({ args: s.any }),
  s.any,
  async ({ args }: { args?: unknown }) => args ?? 'none',
  { effects: 'pure' }
)
const atoms = { greet, loose } as any

const RUNS: Array<[string, string, unknown]> = [
  ['named call', "greet({ name: 'ann' })", 'hi ann'],
  ['empty call', 'greet()', 'hi you'],
  ['core atom, empty call', 'random() >= 0 ? 1 : 1', 1],
  ['named call to an input called args', 'loose({ args: [1, 2] })', [1, 2]],
]

const REFUSED_AT_TRANSPILE: Array<[string, string]> = [
  ['positional values to a named atom', "greet('ann')"],
  ['positional values to an untyped args atom', 'loose(1, 2, 3)'],
  ['positional values to a core atom', "storeSet('k', 1)"],
  ['a single non-literal argument', 'greet(opts)'],
]

for (const [label, VM] of [
  ['vm', AgentVM],
  ['vm-ast', AstVM],
] as const)
  describe(`${label}: atoms take named arguments`, () => {
    const run = (ast: unknown) =>
      new (VM as any)(atoms).run(ast, {}, { fuel: 1000 })

    for (const [cell, call, want] of RUNS)
      it(`runs: ${cell}`, async () => {
        // an atom call is a statement: bind it, then use it
        const src = call.includes('?')
          ? `function f() { const r = random()\n return { v: r >= 0 ? 1 : 1 } }`
          : `function f() { const v = ${call}\n return { v } }`
        const r = await run(transpile(src).ast)
        expect(r.error).toBeUndefined()
        expect(r.result).toEqual({ v: want })
      })

    it('runs: positional calls that are functions (a local helper, Error)', async () => {
      const r = await run(
        transpile(`function twice(a, b) { return a * 2 + b }
        function f() {
          let got = ''
          try { Error('boom') } catch (e) { got = e }
          const t = twice(3, 1)
          return { t, got }
        }`).ast
      )
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ t: 7, got: 'boom' })
    })

    // hand-built: in the AST every input is named, and `args` is just a name (it is how the
    // emitter encodes Error('x') and a local call). The VM does not police call syntax.
    it('runs: a persisted `args: []` from an empty call (hand-built, rc.1 emitter)', async () => {
      const r = await run({
        op: 'seq',
        steps: [
          { op: 'greet', args: [], result: 'v' },
          { op: 'return', value: { v: 'v' } },
        ],
      })
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ v: 'hi you' })
    })
  })

describe('the transpiler refuses a positional atom call, naming the shape that works', () => {
  for (const [cell, call] of REFUSED_AT_TRANSPILE)
    it(cell, () => {
      expect(() =>
        transpile(`function f(opts) { const v = ${call}\n return { v } }`)
      ).toThrow(/takes named arguments: write \w+\(\{ name: value, … \}\)/)
    })
})
