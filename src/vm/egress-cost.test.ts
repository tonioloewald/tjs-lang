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
import { egressValue, membraneValue } from './runtime'

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

  // Refusals END THE RUN (Tonio, 2026-10-04; cumulative review 8). The rows here used to catch a
  // refusal and retry it in a loop, measuring that every retry was billed; four review rounds
  // each found one more refusal path billed short. A refusal that cannot be caught cannot be
  // looped on. See 'a refusal at the capability boundary ends the run' below.
  it('a walk stopped by membraneMaxBytes ends the run, billed for what it read', async () => {
    const r = await new AgentVM().run(
      transpile(`function f(v: [{ i: 0 }]) {
        storeSet({ key: 'k', value: v })
        return { done: true }
      }`).ast,
      { v: big(20_000) },
      {
        fuel: 1e6,
        membraneMaxBytes: 100_000,
        capabilities: { store: memoryStore() },
      }
    )
    expect(r.error?.message).toMatch(/membrane budget/)
    // 100,000 bytes walked at 20,000 bytes per fuel
    expect(r.fuelUsed).toBeGreaterThan(5)
    expect(r.fuelUsed).toBeLessThanOrEqual(1e6)
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

describe('a refused walk is billed whatever refused it (cumulative review 6, B-1)', () => {
  // Round 31 billed a refusal only when its reason said "byte budget". A value refused for its
  // DEPTH, with a megabyte walked first, cost the base cost alone. A guest can build that value,
  // but a 10,000-deep chain takes ~7s of (charged) guest work to build, so these rows call
  // `egressValue` directly. Measured through transpile() once: ~216 fuel and ~250ms a refusal.
  let deep: any = null
  for (let i = 0; i < 10_010; i++) deep = { n: deep }

  it('a heap-refused copy ends the run with its own error, billed once, never overdrawn', async () => {
    const SRC = `function f(v: [{ i: 0 }]) {
      storeSet({ key: 'k', value: v })
      return { done: true }
    }`
    const ast = transpile(SRC).ast
    const opts = (fuel: number, maxHeapBytes: number) => ({
      fuel,
      maxHeapBytes,
      capabilities: { store: memoryStore() },
    })
    const refused = await new AgentVM().run(
      ast,
      { v: big(20_000) },
      opts(1e7, 1_200_000)
    )
    expect(refused.error?.message).toMatch(/Heap limit/)
    // with little fuel to spare it keeps its own error and does not overdraw
    const tight = refused.fuelUsed + 5
    const r = await new AgentVM().run(
      ast,
      { v: big(20_000) },
      opts(tight, 1_200_000)
    )
    expect(r.error?.message).toMatch(/Heap limit/)
    expect(r.fuelUsed).toBeLessThanOrEqual(tight)
    // billed ONCE: against the same copy accepted, refusing adds the reconcile walk (measured
    // +40), not the copy a second time (+74 when round 32 billed the walk again)
    const accepted = await new AgentVM().run(
      ast,
      { v: big(20_000) },
      opts(1e7, 1e8)
    )
    expect(accepted.result).toEqual({ done: true })
    expect(refused.fuelUsed - accepted.fuelUsed).toBeLessThan(55)
  })

  it('a copy larger than the whole heap ceiling stops AT the ceiling, billed for what it walked', () => {
    // Since round 40 the egress budget includes the heap ceiling, so the copy is never built past
    // it for `allocate` to refuse afterwards (I1); the refusal is the walk's, at the ceiling.
    const ctx: any = {
      fuel: { current: 1e6 },
      maxHeapBytes: 1_000,
      heapAccount: { bytes: 0, transient: 0 },
    }
    expect(() => egressValue(ctx, 'op', big(5_000))).toThrow(
      /1000-byte membrane budget/
    )
    // it walked to the 1,000-byte ceiling: 0.05 fuel at 20,000 bytes per fuel
    expect(1e6 - ctx.fuel.current).toBeGreaterThanOrEqual(0.05)
  })

  // Refusals a guest cannot build (its values are a closed domain), billed the same way: the
  // backstop for a value built some way nobody has thought of. The offender comes LAST in key
  // order: since round 40 the walk visits in SOURCE order, so it is reached after the wide part.
  const wideThen = (last: unknown) => ({ wide: big(5_000), z: last })
  class Thing {
    x = 1
  }
  const kinds: Array<[string, unknown]> = [
    ['depth (a guest CAN build this)', wideThen(deep)],
    ['a function', wideThen(() => 1)],
    [
      'an accessor',
      wideThen(
        Object.defineProperty({}, 'g', { get: () => 1, enumerable: true })
      ),
    ],
    ['a class instance', wideThen(new Thing())],
  ]
  for (const [label, value] of kinds) {
    it(`a refusal for ${label} is billed what it walked, no more`, () => {
      const ctx: any = { fuel: { current: 1e6 }, membraneMaxBytes: 1e6 }
      expect(() => egressValue(ctx, 'op', value)).toThrow()
      // the wide part (~170KB at 20,000 bytes per fuel) was read; the 1MB budget was not
      const spent = 1e6 - ctx.fuel.current
      expect(spent).toBeGreaterThan(5)
      expect(spent).toBeLessThan(50)
    })

    it(`a refusal for ${label} under low fuel keeps its own reason`, () => {
      // 40 fuel pays for ~800KB: more than the walk (~430KB with the depth chain), well under the
      // 1MB cap. Round 32 billed the whole budget, so any refusal here read "Out of Fuel".
      const ctx: any = { fuel: { current: 40 }, membraneMaxBytes: 1e6 }
      let message = ''
      try {
        egressValue(ctx, 'op', value)
      } catch (e: any) {
        message = e.message
      }
      expect(message).not.toBe('Out of Fuel')
      expect(ctx.fuel.current).toBeGreaterThan(0)
    })
  }
})

describe('wide values: the walk stops at its budget, and a refusal reports what it cost (review 8)', () => {
  it('a refused N-key object is billed for enumerating its keys', () => {
    // `Object.keys` cannot stop early; round 33 billed at most the (tiny) budget for it
    const wide: Record<string, number> = {}
    for (let i = 0; i < 300_000; i++) wide['k' + i] = i
    const ctx: any = { fuel: { current: 1e6 }, membraneMaxBytes: 1024 }
    expect(() => egressValue(ctx, 'op', wide)).toThrow(/membrane budget/)
    // 300,000 keys × 8 bytes at 20,000 bytes per fuel = 120 fuel
    expect(1e6 - ctx.fuel.current).toBeGreaterThanOrEqual(120)
  })

  it('a refused wide object stops reading descriptors at the budget', () => {
    const wide: Record<string, number> = {}
    for (let i = 0; i < 100_000; i++) wide['k' + i] = i
    let reads = 0
    const counted = new Proxy(wide, {
      getOwnPropertyDescriptor(t, k) {
        reads++
        return Reflect.getOwnPropertyDescriptor(t, k)
      },
    })
    const ctx: any = { fuel: { current: 1e6 }, membraneMaxBytes: 1024 }
    expect(() => egressValue(ctx, 'op', { w: counted })).toThrow(
      /membrane budget/
    )
    // `Object.keys` itself reads every descriptor (it checks each key is enumerable): that is the
    // unavoidable work `enumerated` bills. The walk's OWN reads stop at the budget: without the
    // per-key check it read all 100,000 again.
    expect(reads).toBeLessThan(100_000 + 1_000)
  })

  it('a Map or Set is refused by KIND, without reading a single entry (round 39)', () => {
    let read = 0
    const big = new Map<number, number>()
    for (let i = 0; i < 200_000; i++) big.set(i, i)
    const realEntries = Map.prototype.entries
    Map.prototype.entries = function (this: Map<any, any>) {
      read++
      return realEntries.call(this)
    }
    try {
      const ctx: any = { fuel: { current: 1e6 }, membraneMaxBytes: 1024 }
      expect(() => egressValue(ctx, 'op', { m: big })).toThrow(
        /only plain data \(and Date\) crosses/
      )
    } finally {
      Map.prototype.entries = realEntries
    }
    expect(read).toBe(0)
  })
})

describe('the early bails never refuse what fits (review 9)', () => {
  // A value is accepted EXACTLY when its full-walk cost fits the budget. Round 34's Map/Set bail
  // assumed every queued value costs at least 8, while a repeated reference cost 0, so a Map of
  // shared values that fitted was refused. A repeat now costs one slot, as in the heap model.
  // (Maps and Sets no longer cross at all since round 39; the arrays and objects remain.)
  const shared = { a: 1 }
  const shapes: Array<[string, unknown]> = [
    ['an array of shared objects', Array.from({ length: 1000 }, () => shared)],
    [
      'an object of shared values',
      Object.fromEntries(
        Array.from({ length: 500 }, (_, i) => ['k' + i, shared])
      ),
    ],
  ]
  for (const [label, value] of shapes) {
    it(label, () => {
      const full = membraneValue(value, 1e9)
      expect(full.ok).toBe(true)
      const cost = (full as any).bytes as number
      for (const budget of [cost - 1, cost, cost + 1, Math.floor(cost * 1.1)]) {
        const r = membraneValue(value, budget)
        expect({ budget, ok: r.ok }).toEqual({ budget, ok: budget >= cost })
      }
    })
  }
})

describe('a top-level string is refused like a nested one (review 10, minor)', () => {
  it('same kind, same reason, same bill', () => {
    const str = 'x'.repeat(10_000)
    const top = membraneValue(str, 1_000) as any
    const nested = membraneValue({ s: str }, 1_000) as any
    expect(top.ok).toBe(false)
    expect(nested.ok).toBe(false)
    expect(top.kind).toBe('limit')
    expect(nested.kind).toBe('limit')
    expect(top.reason).toBe(nested.reason)
    expect(top.walked).toBeGreaterThanOrEqual(20_000)
    expect(nested.walked).toBeGreaterThanOrEqual(20_000)
  })
})

describe('egress copies are transient heap, released when the step ends (review 6, gap 6)', () => {
  it('many large copies under a small heap ceiling do not accumulate', async () => {
    const LOOP = `function f(v: [{ i: 0 }], n: 0) {
      let k = 0
      while (k < n) {
        storeSet({ key: 'k', value: v })
        k = k + 1
      }
      return { k }
    }`
    // one copy fits beside the live value; twenty would not, if they were not released
    const r = await new AgentVM().run(
      transpile(LOOP).ast,
      { v: big(10_000), n: 20 },
      {
        fuel: 1e7,
        maxHeapBytes: 2_000_000,
        capabilities: { store: memoryStore() },
      }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ k: 20 })
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
    expect(r.error?.message).toMatch(/a key is required/)
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

describe('cache keys cross the membrane like any other input (cumulative review 6, M-4)', () => {
  it('a cache key over membraneMaxBytes never reaches the store', async () => {
    const store = memoryStore()
    let gets = 0
    store.get = async (k: string) => {
      gets++
      return store.data.get(k)
    }
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          {
            op: 'cache',
            key: 'x'.repeat(200_000),
            steps: [{ op: 'return', value: 1 }],
            result: 'got',
          },
        ],
      } as any,
      {},
      { fuel: 1e5, membraneMaxBytes: 100_000, capabilities: { store } }
    )
    expect(r.error).toBeDefined()
    expect(gets).toBe(0)
  })

  it('a result that cannot cross is a failed step, not a silent miss (M-2, decided)', async () => {
    const store = memoryStore()
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          {
            op: 'cache',
            key: 'k',
            steps: [{ op: 'return', value: { s: 'y'.repeat(100_000) } }],
            result: 'got',
          },
          { op: 'return', value: { got: 'got' } },
        ],
      } as any,
      {},
      { fuel: 1e5, membraneMaxBytes: 50_000, capabilities: { store } }
    )
    expect(r.error?.message).toMatch(/membrane budget/)
    expect(store.data.size).toBe(0)
  })
})
