/**
 * AJS parameter contracts: an unknown type name is refused (#4101), and `| undefined` makes a
 * parameter optional (#4106).
 *
 * `function s({ a: integer })` is a RENAME in JavaScript (`a` bound to a variable `integer`), so `a`
 * was never imported and its contract silently vanished: `{ a: 'x', b: 2 }` was accepted. And
 * `note: '' | undefined` stayed required on a parameter, while the same spelling in a declared
 * result made the member optional.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './core'
import { AgentVM } from '../vm/ast'

describe('an unknown type name in a parameter', () => {
  it('is refused, with the remedy', () => {
    expect(() => transpile(`function s({ a: integer }) { return {} }`)).toThrow(
      /'integer' is not a type AJS knows.*a: 0 for an integer/
    )
  })
  it('known type names and examples still work (the other direction)', () => {
    const { ast } = transpile(
      `function s({ a: string, b: int, c: 0.0 }) { return { a, b, c } }`
    )
    expect([...ast.inputSchema.required].sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('| undefined on a parameter', () => {
  const ast = transpile(
    `function f({ note: '' | undefined, n: 0 }) { return { note, n } }`
  ).ast
  const run = (args: any) => new AgentVM().run(ast, args, { fuel: 100 })
  it('makes it optional', async () => {
    expect(ast.inputSchema.required).toEqual(['n'])
    expect((await run({ n: 1 })).error).toBeUndefined()
  })
  it('still checks it when given', async () => {
    expect((await run({ n: 1, note: 'hi' })).result).toEqual({
      note: 'hi',
      n: 1,
    })
    expect((await run({ n: 1, note: 5 })).error?.message).toMatch(/note/)
  })
})
