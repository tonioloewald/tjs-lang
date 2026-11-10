/**
 * An AJS object literal with a computed key is refused, not silently renamed (#3989).
 *
 * `{ [k]: 1 }` with `k = 'z'` returned `{ k: 1 }`: the emitter read the key expression's NAME as
 * the key. The VM's object node has fixed string keys, so a key known only at run time is refused
 * with the remedy, `Object.fromEntries([[k, v]])`, which runs through the method table. A computed
 * key that is a literal (`['a']`) is known here and still works.
 *
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './core'
import { AgentVM } from '../vm/ast'

const vm = new AgentVM()

describe('computed object keys in AJS', () => {
  it('a key known only at run time is refused, with the remedy', () => {
    expect(() =>
      transpile(
        `function f({ k = 'z' }) { const o = { [k]: 1 }\n return { o } }`
      )
    ).toThrow(/computed key.*Object\.fromEntries/s)
  })

  it('also in a returned object', () => {
    expect(() =>
      transpile(`function f({ k = 'z' }) { return { [k]: 1 } }`)
    ).toThrow(/computed key/)
  })

  it('a literal computed key still works', async () => {
    const { ast } = transpile(
      `function f({}) { const o = { ['a b']: 1 }\n return { o } }`
    )
    expect((await vm.run(ast, {}, { fuel: 100 })).result).toEqual({
      o: { 'a b': 1 },
    })
  })

  it('the remedy works', async () => {
    const { ast } = transpile(
      `function f({ k = 'z' }) { const o = Object.fromEntries([[k, 1]])\n return { o } }`
    )
    expect((await vm.run(ast, { k: 'z' }, { fuel: 100 })).result).toEqual({
      o: { z: 1 },
    })
  })
})
