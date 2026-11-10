/**
 * A helper function sees its parameters, never the run's arguments (#3988).
 *
 * `callLocal` gave a helper a fresh scope but spread the caller's context, `args` included, and a
 * name the helper does not declare falls back to the run's arguments. So `function g(x) { return
 * x + n }` called from `f({ n = 3 })` with `{ n: 10 }` returned 11: the helper read the agent's
 * input by name. Helpers are top-level siblings, not closures; they see only their parameters.
 *
 * Two layers now hold it. The transpiler refuses the read of an undeclared name (#4002), so
 * transpiled source cannot express the leak; the VM rows below therefore run ASTs hand-edited
 * from transpile() output (a helper's read of its own parameter renamed to the run argument),
 * the shape the transpiler will not write, which is what the VM must still be safe against.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'

const vm = new AgentVM()

/** transpile(), then rename the helpers' reads of `from` to `to`. */
const withHelperRead = (src: string, from: string, to: string) => {
  const { ast } = transpile(src) as any
  const helpers = JSON.parse(
    JSON.stringify(ast.helpers).replaceAll(`"name":"${from}"`, `"name":"${to}"`)
  )
  return { ...ast, helpers }
}

describe("a helper cannot read the run's arguments", () => {
  it('the transpiler refuses the read', () => {
    expect(() =>
      transpile(`function g(x) { return { leaked: n } }
function f({ n = 3 }) { const d = g(1)\n return { d } }`)
    ).toThrow(/'n' is not defined/)
  })

  it('the VM: a free name in a helper does not resolve to a run argument', async () => {
    const ast = withHelperRead(
      `function g(x, y) { return { leaked: y } }
function f({ n = 3 }) { const d = g(1, 2)\n return { d } }`,
      'y',
      'n'
    )
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

  it('the VM: a helper calling a helper is isolated too', async () => {
    const ast = withHelperRead(
      `function inner(y) { return { leaked: y } }
function outer(x) { return inner(x) }
function f({ n = 3 }) {
  const d = outer(1)
  return { d }
}`,
      'y',
      'n'
    )
    const r = await vm.run(ast, { n: 10 }, { fuel: 200 })
    expect(JSON.stringify(r.result ?? null)).not.toContain('10')
  })
})
