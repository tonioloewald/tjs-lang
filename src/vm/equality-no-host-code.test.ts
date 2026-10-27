/**
 * The VM's own equality runs NO host code on the values it compares (#3531).
 *
 * `eqValue` (src/vm/runtime.ts) promises slot reads only: "a boxed subclass must not get to
 * run guest-supplied code inside the VM's own equality". The tosijs-proxy change (c50ec53)
 * made the shared `unwrapBoxed` do a property GET of `Symbol.for('xin-value')` on every
 * object, and a GET runs a getter or a Proxy trap. Guest values are membraned data and
 * cannot carry one, but an embedder atom tagged `effects: 'pure'` bypasses the membrane, so a
 * host Proxy it returns reached the comparison and its trap ran, unmetered, inside guest
 * evaluation. Rows are built from `transpile()` output, as the VM test rows must be.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { defineAtom } from './runtime'

describe('VM equality runs no host code on what it compares', () => {
  const run = async (body: string) => {
    const traps: PropertyKey[] = []
    const record = (k: PropertyKey) => traps.push(k)
    const hostile = new Proxy(
      {},
      {
        get(_t, key) {
          record(key)
          return undefined
        },
        getPrototypeOf() {
          record('getPrototypeOf')
          return Object.prototype
        },
        has(_t, key) {
          record(key)
          return false
        },
      }
    )
    const leak = defineAtom('leak', s.object({}), s.any, async () => hostile, {
      effects: 'pure',
    })
    const { ast } = transpile(`function f() {
      let x = leak({})
      ${body}
      return { done: true }
    }`)
    await new AgentVM({ leak }).run(ast, {})
    return traps
  }

  it('== adds no trap to those the rest of the program already runs', async () => {
    const without = await run('')
    const withEq = await run('let same = x == 1\n let other = 1 != x')
    expect(withEq).toEqual(without)
  })

  it('== still unwraps a real boxed primitive', async () => {
    const { ast } = transpile(`function f({ a }) { return { same: a == 'x' } }`)
    // A boxed String crosses the membrane as data only if the host passes one: build it
    // directly in a pure atom so it reaches the comparison unmembraned.
    const boxed = defineAtom(
      'boxed',
      s.object({}),
      s.any,
      async () => new String('x'),
      {
        effects: 'pure',
      }
    )
    const { ast: ast2 } = transpile(`function f() {
      let b = boxed({})
      return { same: b == 'x' }
    }`)
    const r: any = await new AgentVM({ boxed }).run(ast2, {})
    expect(r.result?.same ?? r.same).toBe(true)
    void ast
  })
})
