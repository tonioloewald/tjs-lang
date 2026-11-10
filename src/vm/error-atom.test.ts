/**
 * `Error(message)` keeps a computed message (#3982).
 *
 * The atom read `step.args[0]` without resolving it. A literal message survived only because v2
 * writes a literal as a bare string; `Error('bad ' + x)`, `Error(msg)` and a template arrived as
 * expression nodes, and `String(node)` is '[object Object]'. Now the argument is resolved. A
 * string, number or boolean is the message; anything else is refused by name rather than coerced,
 * because ToString on a guest object is an unbudgeted allocation the VM refuses everywhere else.
 *
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'

const vm = new AgentVM()
const caught = async (raise: string, args: Record<string, unknown> = {}) => {
  const { ast } = transpile(`function f({ x = 'y', n = 0 }) {
  try {
    ${raise}
  } catch (e) {
    return { m: e }
  }
  return { m: 'not raised' }
}`)
  return (await vm.run(ast, args, { fuel: 200 })).result?.m
}

describe('Error() keeps its message', () => {
  it('a literal', async () => {
    expect(await caught(`Error('bad x')`)).toBe('bad x')
  })
  it('a concatenation', async () => {
    expect(await caught(`Error('bad ' + x)`, { x: 'input' })).toBe('bad input')
  })
  it('a template', async () => {
    expect(await caught('Error(`bad ${x}`)', { x: 'input' })).toBe('bad input')
  })
  it('a variable', async () => {
    expect(await caught(`const msg = 'from a variable'\n    Error(msg)`)).toBe(
      'from a variable'
    )
  })
  it('a number', async () => {
    expect(await caught(`Error(n)`, { n: 42 })).toBe('42')
  })
  it('no argument', async () => {
    expect(await caught(`Error()`)).toBe('Error')
  })
  it('an object is refused by name, not coerced', async () => {
    expect(await caught(`const o = { a: 1 }\n    Error(o)`)).toMatch(
      /Error\(\) takes a string/
    )
  })
  it('uncaught, the run reports the computed message', async () => {
    const { ast } = transpile(`function f({ x = 'y' }) { Error('bad ' + x) }`)
    const r = await vm.run(ast, { x: 'input' }, { fuel: 100 })
    expect(r.error?.message).toBe('bad input')
  })
})
