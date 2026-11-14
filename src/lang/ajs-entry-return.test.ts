/**
 * An AJS entry function that falls off the end returns `{}`, as a bare `return` does (#4102,
 * decided 2026-11-14). It gave `result: undefined` with no error, against the rule that an agent
 * returns an object. The transpiler ends the entry with a bare `return`; the VM runs the AST as
 * written (the VM is correct, AJS is friendly).
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './core'
import { AgentVM } from '../vm/ast'

const run = async (src: string) => {
  const r = await new AgentVM().run(transpile(src).ast, {}, { fuel: 100 })
  return r.error ? { error: r.error.message } : { result: r.result }
}

describe('an entry with no return on some path', () => {
  it('no return at all gives {}', async () => {
    expect(await run('function f() { let x = 1 }')).toEqual({ result: {} })
  })
  it('a branch that does not return gives {}', async () => {
    expect(
      await run('function f({ n = 1 }) { if (n > 5) { return { big: true } } }')
    ).toEqual({ result: {} })
  })
  it('a return that runs still wins', async () => {
    expect(
      await run('function f({ n = 9 }) { if (n > 5) { return { big: true } } }')
    ).toEqual({ result: { big: true } })
  })
  it('a declared result still applies: {} does not meet { x: 0 }', async () => {
    expect((await run('function f({}): { x: 0 } { let y = 1 }')).error).toMatch(
      /declared result type/
    )
  })
  it('a helper keeps its own return semantics (only the entry is changed)', async () => {
    expect(
      await run(
        'function h(x) { let y = x }\nfunction f({}) { let v = h(1)\n return { v } }'
      )
    ).toEqual({ result: {} }) // v is undefined, dropped as JSON
  })
})
