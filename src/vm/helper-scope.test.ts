/**
 * A helper function sees its parameters, never the run's arguments (#3988).
 *
 * `callLocal` gave a helper a fresh scope but spread the caller's context, `args` included, and a
 * name the helper does not declare falls back to the run's arguments. So `function g(x) { return
 * x + n }` called from `f({ n = 3 })` with `{ n: 10 }` returned 11: the helper read the agent's
 * input by name. Helpers are top-level siblings, not closures; they see only their parameters.
 *
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'

const vm = new AgentVM()

describe("a helper cannot read the run's arguments", () => {
  it('a free name in a helper does not resolve to a run argument', async () => {
    const { ast } = transpile(`function g(x) { return { leaked: n } }
function f({ n = 3 }) {
  const d = g(1)
  return { d }
}`)
    const r = await vm.run(ast, { n: 10 }, { fuel: 200 })
    expect(JSON.stringify(r.result ?? null)).not.toContain('10')
  })

  it('a parameter with the same name is still the parameter', async () => {
    const { ast } = transpile(`function g(n) { return n * 2 }
function f({ n = 3 }) {
  const d = g(5)
  return { d }
}`)
    const r = await vm.run(ast, { n: 10 }, { fuel: 200 })
    expect(r.result).toEqual({ d: 10 })
  })

  it('a helper calling a helper is isolated too', async () => {
    const { ast } = transpile(`function inner() { return { leaked: n } }
function outer(x) { return inner() }
function f({ n = 3 }) {
  const d = outer(1)
  return { d }
}`)
    const r = await vm.run(ast, { n: 10 }, { fuel: 200 })
    expect(JSON.stringify(r.result ?? null)).not.toContain('10')
  })
})
