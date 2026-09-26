/**
 * AJS scoping at the VM: `const` belongs to a binding in a scope, and a callback body is a
 * function. Found by the 0.14.0 final re-review of `Eval` (M-1) and the probes around it.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'
import { transpile } from '../lang/index'

const vm = new AgentVM()
const run = async (body: string) => {
  const r = await vm.run(
    transpile(`function f() {\n${body}\n}`).ast,
    {},
    { fuel: 200 }
  )
  return { result: r.result as any, error: r.error?.message }
}

describe('const is per binding, per scope', () => {
  it('a block const shadows an outer let', async () => {
    expect(
      (await run('let x = 1\n{ const x = 5 }\nreturn { x }')).result
    ).toEqual({ x: 1 })
  })
  it('an inner const does not make the OUTER binding const', async () => {
    expect(
      (await run('let x = 1\n{ const x = 5 }\nx = 7\nreturn { x }')).result
    ).toEqual({ x: 7 })
  })
  it('reassigning a const — in its own scope or from a block — is still refused', async () => {
    expect((await run('const x = 1\nx = 2\nreturn { x }')).error).toMatch(
      /reassign const/
    )
    expect((await run('const x = 1\n{ x = 2 }\nreturn { x }')).error).toMatch(
      /reassign const/
    )
  })
})

describe('a callback body is a function', () => {
  it('a block-bodied map callback may return a scalar', async () => {
    expect(
      (await run('const r = [1, 2].map(v => { return v * 3 })\nreturn { r }'))
        .result
    ).toEqual({ r: [3, 6] })
  })
  it('…or an object, which is not dropped', async () => {
    expect(
      (
        await run(
          'const r = [1, 2].map(v => { return { d: v } })\nreturn { r }'
        )
      ).result
    ).toEqual({ r: [{ d: 1 }, { d: 2 }] })
  })
  it('early return inside a callback', async () => {
    expect(
      (
        await run(
          'const r = [1, 2, 3].map(v => { if (v > 1) { return 9 }\nreturn 0 })\nreturn { r }'
        )
      ).result
    ).toEqual({ r: [0, 9, 9] })
  })
  it('a block-bodied reduce callback', async () => {
    expect(
      (
        await run(
          'const r = [1, 2].reduce((a, v) => { return a + v }, 0)\nreturn { r }'
        )
      ).result
    ).toEqual({ r: 3 })
  })
  it('a callback return does not end the agent, and the agent rule still holds', async () => {
    expect(
      (
        await run(
          'const r = [1].map(v => { return 5 })\nreturn { r, after: 1 }'
        )
      ).result
    ).toEqual({ r: [5], after: 1 })
    expect((await run('return 5')).error).toMatch(/must return an object/)
  })
})
