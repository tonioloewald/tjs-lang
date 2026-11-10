/**
 * An atom called inside an expression is refused when the agent is transpiled (#3984).
 *
 * `return { id: uuid() }` transpiled, then failed at run time with "Atom calls in expressions not
 * yet supported", while a local helper in the same position was refused at transpile time with
 * the remedy. The VM runs an AST as written and owes nobody a helpful message; preventing the
 * mistake and explaining the fix is the transpiler's job (CLAUDE.md, Security Model). `Error` and
 * `filter` share an atom's name and are legitimate in an expression, so they stay.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from './core'
import { AgentVM } from '../vm/ast'
import { defineAtom } from '../vm/runtime'

describe('an atom inside an expression', () => {
  it('a core atom is refused, with the remedy', () => {
    expect(() =>
      transpile(`function f({}) { return { id: uuid({}) } }`)
    ).toThrow(/uuid.*inside an expression.*const/s)
  })

  it('a host atom is refused too', () => {
    const lookup = defineAtom(
      'lookup',
      s.object({ key: s.string }),
      s.any,
      async () => 1,
      { effects: 'pure' }
    )
    expect(() =>
      transpile(`function f({ k = '' }) { const n = 1 + lookup({ key: k }) }`, {
        atoms: { lookup },
      } as any)
    ).toThrow(/lookup.*inside an expression/s)
  })

  it('the remedy works: bind the result first', async () => {
    const { ast } = transpile(`function f({}) {
  const id = uuid({})
  return { ok: typeof id == 'string' }
}`)
    const r = await new AgentVM().run(ast, {}, { fuel: 100 })
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ ok: true })
  })

  it('Error() and filter() are still allowed in an expression', () => {
    expect(() =>
      transpile(`function f({ items = [0] }) {
  const evens = filter(items, { type: 'array' })
  return { evens }
}`)
    ).not.toThrow()
  })
})
