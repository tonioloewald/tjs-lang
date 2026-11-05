/**
 * An AJS agent's DECLARED RESULT is enforced (#3834). `function f(n: 0): { x: 0 }` recorded
 * its return type in the signature and nowhere else, so `return { x: 'str', extra: 1 }` ran
 * clean: a typed function that did not emit what it said it would. The transpiler now writes
 * the declared result as the AST's `outputSchema`, and `vm.run` validates the agent's result
 * against it (charged, like the input schema), ending the run in an error on a mismatch.
 *
 * The rule (Tonio, 2026-11-05): insofar as you wrote an agent as a typed function, its output
 * meets the contract or the run is an error. An agent returns an object, so a declared result
 * that is not an object can never be met and is refused at transpile time.
 *
 * Rows run transpile() output on the AST VM, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './core'
import { AgentVM } from '../vm/ast'

const vm = new AgentVM()
const run = async (
  src: string,
  args: Record<string, unknown> = {},
  fuel = 1000
) => vm.run(transpile(src).ast, args, { fuel })

describe('a declared AJS result is enforced', () => {
  const rows: [string, string, Record<string, unknown>, boolean][] = [
    // [what, source, args, whether the result meets the contract]
    [
      'a matching result',
      'function f(n: 0): { x: 0 } { return { x: n } }',
      { n: 3 },
      true,
    ],
    [
      'a wrongly typed member',
      "function f(n: 0): { x: 0 } { return { x: 'str' } }",
      { n: 3 },
      false,
    ],
    [
      'an integer member given a fraction',
      'function f(n: 1.5): { x: 0 } { return { x: n } }',
      { n: 1.5 },
      false,
    ],
    [
      'an undeclared member',
      'function f(n: 0): { x: 0 } { return { x: n, extra: 1 } }',
      { n: 3 },
      false,
    ],
    [
      'a missing member',
      'function f(n: 0): { x: 0, y: 0 } { return { x: n } }',
      { n: 3 },
      false,
    ],
    [
      'no result at all',
      'function f(n: 0): { x: 0 } { const y = n }',
      { n: 3 },
      false,
    ],
    [
      'a literal union member',
      "function f(m: ''): { m: 'a' | 'b' } { return { m } }",
      { m: 'z' },
      false,
    ],
    [
      'a nested shape',
      "function f(n: 0): { p: { q: '' } } { return { p: { q: 'ok' } } }",
      { n: 1 },
      true,
    ],
  ]
  for (const [what, src, args, ok] of rows)
    it(what, async () => {
      const r = await run(src, args)
      if (ok) expect(r.error).toBeUndefined()
      else expect(String(r.error?.message)).toMatch(/declared result/)
    })

  it('the contract is in the AST, where any VM can read it', () => {
    const { ast } = transpile('function f(n: 0): { x: 0 } { return { x: n } }')
    expect((ast as any).outputSchema).toEqual({
      type: 'object',
      properties: { x: { type: 'integer' } },
      additionalProperties: false,
      required: ['x'],
    })
  })

  it('no annotation, no contract: undeclared results are unchanged', async () => {
    const { ast } = transpile("function f(n: 0) { return { x: 'anything' } }")
    expect((ast as any).outputSchema).toBeUndefined()
    expect((await vm.run(ast, { n: 1 })).result).toEqual({ x: 'anything' })
  })

  it("a run that fails reports ITS error, not the contract's", async () => {
    const r = await run(
      "function f(n: 0): { x: 0 } { const r = httpFetch({ url: 'https://example.test' }); return { x: n } }",
      { n: 1 }
    )
    expect(String(r.error?.message)).not.toMatch(/declared result/)
  })

  it('checking the result is paid for: a run that cannot afford it is out of fuel', async () => {
    const src =
      'function f(n: 0): { xs: [0] } { const xs = []; let i = 0; while (i < n) { xs.push(i); i = i + 1 } return { xs } }'
    const rich = await run(src, { n: 2000 }, 100_000)
    expect(rich.error).toBeUndefined()
    const { ast } = transpile(src)
    const plain = { ...(ast as any) }
    delete plain.outputSchema
    const unchecked = await vm.run(plain, { n: 2000 }, { fuel: 100_000 })
    expect(rich.fuelUsed).toBeGreaterThan(unchecked.fuelUsed)
    // exactly the fuel the unchecked run used: nothing left to validate with
    const poor = await vm.run(ast, { n: 2000 }, { fuel: unchecked.fuelUsed })
    expect(String(poor.error?.message)).toMatch(/Out of Fuel/)
  })
})

describe('a declared result that can never be met is refused at transpile time', () => {
  for (const ann of ['0', "''", 'true', '[0]'])
    it(`: ${ann}`, () => {
      expect(() =>
        transpile(`function f(n: 0): ${ann} { return { n } }`)
      ).toThrow(/returns an object/)
    })
})
