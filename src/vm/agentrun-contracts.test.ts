/**
 * `agentRun` holds a sub-agent to its declared contracts (#3987).
 *
 * `vm.run` refuses arguments that do not match an AST's `inputSchema`, and a result that does not
 * match its `outputSchema` (#3834). `agentRun` ran a sub-agent on the same VM, by token or as an
 * inline AST, with `seq.exec` and checked neither: `double({ n: 0 })` given `{ n: 'x' }` was
 * refused by `vm.run` and returned `{ n: 'xx' }` through `agentRun`. A contract that holds only
 * on one of the two ways to call an agent is not a contract.
 *
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'

const vm = new AgentVM()
const DOUBLE = transpile(
  `function double({ n = 0 }): { n: 0 } { return { n: n + n } }`
).ast
const LIAR = transpile(
  `function liar({ n = 0 }): { n: 0 } { return { n: 'not a number' } }`
).ast

const INLINE = transpile(`function parent({ sub = {}, n = 0 }) {
  const r = agentRun({ agentId: sub, input: { n } })
  return { r }
}`).ast
const BY_TOKEN = transpile(`function parent({ sub = {}, n = 0 }) {
  const token = storeProcedure({ ast: sub })
  const r = agentRun({ agentId: token, input: { n } })
  return { r }
}`).ast

const run = (parent: any, sub: any, n: unknown) =>
  vm.run(parent, { sub, n }, { fuel: 1000 })

for (const [route, parent] of [
  ['an inline AST', INLINE],
  ['a procedure token', BY_TOKEN],
] as const)
  describe(`agentRun with ${route}`, () => {
    it('runs a sub-agent that meets its contracts', async () => {
      const r = await run(parent, DOUBLE, 4)
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ r: { n: 8 } })
    })

    it("refuses input that does not match the sub-agent's declared inputs", async () => {
      // The parent's own `n` is an integer, so this parent's `n` takes a string, which it
      // hands to a sub-agent declaring an integer.
      const loose = transpile(`function parent({ sub = {}, n = '' }) {
  ${
    route === 'a procedure token'
      ? 'const token = storeProcedure({ ast: sub })\n  const r = agentRun({ agentId: token, input: { n } })'
      : 'const r = agentRun({ agentId: sub, input: { n } })'
  }
  return { r }
}`).ast
      const bad = await vm.run(loose, { sub: DOUBLE, n: 'x' }, { fuel: 1000 })
      expect(String(bad.error?.message)).toMatch(/[Ii]nput validation failed/)
      expect(JSON.stringify(bad.result)).not.toContain('xx')
    })

    it("refuses a result that does not match the sub-agent's declared result", async () => {
      const r = await run(parent, LIAR, 4)
      expect(String(r.error?.message)).toMatch(/declared result/)
    })
  })
