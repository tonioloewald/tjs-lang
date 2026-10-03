/**
 * The outbound membrane is a DOOR, and pays like one (cumulative review 5, B-1 and M-1).
 *
 * Round 30 deep-copied every IO atom's input before the base cost and charged nothing for it: a
 * `storeSet` loop over a 100k-element value took 10.8s for the same fuel as 105ms the commit
 * before, and a REFUSED call (caught and retried) cost no fuel at all. These rows hold the rule
 * every other door follows (`docs/vm-budgets.md`): the walk is budgeted by what the run can pay,
 * and the copy is charged before it exists. Plus the two IO atoms that reached a capability around
 * the membrane, `agentRun` and `cache`.
 *
 * Programs come from `transpile()` where AJS can say them. `cache` takes steps, so its rows use a
 * hand-built v1 AST (a persisted format, and the only way to write it).
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { egressValue } from './runtime'

const big = (n: number) => Array.from({ length: n }, (_, i) => ({ i }))

function memoryStore() {
  const data = new Map<string, any>()
  return {
    data,
    get: async (k: string) => data.get(k),
    set: async (k: string, v: any) => {
      data.set(k, v)
    },
  }
}

async function fuelFor(src: string, args: Record<string, any>, fuel = 1e6) {
  const store = memoryStore()
  const r = await new AgentVM().run(transpile(src).ast, args, {
    fuel,
    capabilities: { store },
  })
  return r
}

describe('egress is charged by the bytes it moves', () => {
  const LOOP = `function f(v: [{ i: 0 }], n: 0) {
    let k = 0
    while (k < n) {
      storeSet({ key: 'k', value: v })
      k = k + 1
    }
    return { k }
  }`

  it('N accepted calls on a large value cost fuel proportional to N × size', async () => {
    // Same value, 1 call vs 40: argument admission is identical, so the difference is 39 copies.
    // 20,000 objects ≥ 16 bytes each at 20,000 bytes per fuel is ≥ 16 fuel a copy. (Round 30
    // charged the base cost only: 209 fuel for the 39, against 1,535 now.)
    const one = await fuelFor(LOOP, { v: big(20_000), n: 1 })
    const many = await fuelFor(LOOP, { v: big(20_000), n: 40 })
    expect(one.error).toBeUndefined()
    expect(many.error).toBeUndefined()
    expect(many.fuelUsed - one.fuelUsed).toBeGreaterThan(39 * 16)
  })

  it('a REFUSED call is charged too: catching and retrying is not free', async () => {
    const REFUSED = `function f(v: [{ i: 0 }], n: 0) {
      let k = 0
      let refused = 0
      while (k < n) {
        try {
          storeGet({ key: v })
        } catch (e) {
          refused = refused + 1
        }
        k = k + 1
      }
      return { refused }
    }`
    const one = await fuelFor(REFUSED, { v: big(20_000), n: 1 })
    const many = await fuelFor(REFUSED, { v: big(20_000), n: 40 })
    expect(one.result).toEqual({ refused: 1 })
    expect(many.result).toEqual({ refused: 40 })
    expect(many.fuelUsed - one.fuelUsed).toBeGreaterThan(39 * 16)
  })

  it('a walk stopped by membraneMaxBytes is charged for what it read', async () => {
    const REFUSED = `function f(v: [{ i: 0 }], n: 0) {
      let k = 0
      let refused = 0
      while (k < n) {
        try {
          storeSet({ key: 'k', value: v })
        } catch (e) {
          refused = refused + 1
        }
        k = k + 1
      }
      return { refused }
    }`
    const run = (n: number) =>
      new AgentVM().run(
        transpile(REFUSED).ast,
        { v: big(20_000), n },
        {
          fuel: 1e6,
          membraneMaxBytes: 100_000,
          capabilities: { store: memoryStore() },
        }
      )
    const one = await run(1)
    const many = await run(41)
    expect(many.result).toEqual({ refused: 41 })
    // 100,000 bytes walked per refusal at 20,000 bytes per fuel: 5 fuel each, 40 more refusals.
    expect(many.fuelUsed - one.fuelUsed).toBeGreaterThan(200)
  })

  it('a walk the remaining fuel cannot pay for is Out of Fuel, and stops there', () => {
    // Called directly: in a run, admitting a value as an argument costs more per byte than
    // copying it out, so a program cannot hold a value its fuel cannot copy. The branch is the
    // backstop for a value built some way that is cheaper than its copy.
    // Each element is a Proxy whose descriptor trap counts the walk's visits (a Proxy of a plain
    // object has Object.prototype, so the walk reads it as data).
    let visited = 0
    const counted = Array.from(
      { length: 50_000 },
      (_, i) =>
        new Proxy(
          { i },
          {
            getOwnPropertyDescriptor(t, k) {
              visited++
              return Reflect.getOwnPropertyDescriptor(t, k)
            },
          }
        )
    )
    const ctx: any = { fuel: { current: 1 } }
    expect(() => egressValue(ctx, 'op', counted)).toThrow('Out of Fuel')
    expect(ctx.fuel.current).toBeLessThanOrEqual(0)
    // 1 fuel pays for 20,000 bytes, about a thousand elements; a walk budgeted only by
    // membraneMaxBytes would visit all 50,000.
    expect(visited).toBeLessThan(5_000)
  })
})

describe('every route to a capability goes through it (M-1)', () => {
  it('agentRun: the host receives a copy, so its mutation is not visible to the guest', async () => {
    let received: any
    const agent = {
      run: async (_id: string, input: any) => {
        received = input
        input.a.x = 'MUTATED_BY_HOST'
        return 'ok'
      },
    }
    const r = await new AgentVM().run(
      transpile(`function f() {
        let o = { x: 'guest' }
        agentRun({ agentId: 'other', input: { a: o } })
        return { x: o.x }
      }`).ast,
      {},
      { fuel: 1000, capabilities: { agent } }
    )
    expect(r.error).toBeUndefined()
    expect(received.a.x).toBe('MUTATED_BY_HOST')
    expect(r.result).toEqual({ x: 'guest' })
  })

  it('cache: the store receives a copy, so its mutation is not visible to the guest', async () => {
    const store = memoryStore()
    store.set = async (k: string, v: any) => {
      store.data.set(k, v)
      v.val.x = 'MUTATED_BY_HOST'
    }
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          {
            op: 'cache',
            key: 'k',
            steps: [
              { op: 'varSet', key: 'o', value: { x: 'cached' } },
              { op: 'return', value: 'o' },
            ],
            result: 'got',
          },
          { op: 'return', value: { got: 'got' } },
        ],
      } as any,
      {},
      { fuel: 1000, capabilities: { store } }
    )
    expect(r.error).toBeUndefined()
    expect(store.data.get('cache:k').val.x).toBe('MUTATED_BY_HOST')
    expect(r.result).toEqual({ got: { x: 'cached' } })
  })

  it('cache: a key that is not a string is refused before the store sees it', async () => {
    const store = memoryStore()
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'obj', value: { a: 1 } },
          {
            op: 'cache',
            key: 'obj',
            steps: [{ op: 'return', value: 1 }],
            result: 'got',
          },
        ],
      } as any,
      {},
      { fuel: 1000, capabilities: { store } }
    )
    expect(r.error?.message).toMatch(/key must be a string/)
    expect(store.data.size).toBe(0)
  })
})

describe('v1 ASTs resolve through egress as before', () => {
  it('a bare-string storeGet key naming a variable still reads that variable', async () => {
    const store = memoryStore()
    store.data.set('real-key', 'found')
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'name', value: 'real-key' },
          { op: 'storeGet', key: 'name', result: 'v' },
          { op: 'return', value: { v: 'v' } },
        ],
      } as any,
      {},
      { fuel: 1000, capabilities: { store } }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: 'found' })
  })
})

describe('key-less cache and memoize blocks are keyed by their steps', () => {
  // Both called `hash.exec(...)`, the step wrapper, which returns nothing: every key-less block
  // shared the entry `undefined` and returned ANOTHER block's result. Found when `cache` began
  // refusing a key that is not a string.
  for (const op of ['cache', 'memoize'] as const) {
    it(`${op}: two different blocks keep their own results`, async () => {
      const store = memoryStore()
      const block = (v: string, as: string) => ({
        op,
        steps: [{ op: 'return', value: v }],
        result: as,
      })
      const r = await new AgentVM().run(
        {
          op: 'seq',
          steps: [
            block('first', 'a'),
            block('second', 'b'),
            { op: 'return', value: { a: 'a', b: 'b' } },
          ],
        } as any,
        {},
        { fuel: 1000, capabilities: { store } }
      )
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ a: 'first', b: 'second' })
    })
  }
})
