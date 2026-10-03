/**
 * A refusal at the capability boundary ENDS THE RUN (Tonio, 2026-10-04; cumulative review 8).
 *
 * Rounds 31–34 of the rc.2 reviews each blocked on billing a REFUSED crossing exactly: a guest
 * could catch the refusal and retry it in a loop, so any gap between the work a refusal did and
 * its bill became a repeatable amplifier. A refusal that cannot be caught cannot be looped on.
 *
 * Guarded in both directions: a membrane refusal is not catchable, from any depth (a sub-agent
 * included); an ordinary failure (a capability that throws) still is. Programs come from
 * `transpile()`.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { s } from 'tosijs-schema'
import { defineAtom } from './runtime'

function spyStore() {
  const sets: string[] = []
  return {
    sets,
    get: async () => undefined,
    set: async (k: string) => {
      sets.push(k)
    },
  }
}

const run = (
  src: string,
  args: Record<string, any>,
  opts: Record<string, any>
) => new AgentVM().run(transpile(src).ast, args, opts)

describe('a refusal at the capability boundary ends the run', () => {
  const REFUSED_IN_TRY = `function f(v: [0]) {
    try {
      storeGet({ key: v })
    } catch (e) {
      storeSet({ key: 'caught', value: 1 })
    }
    storeSet({ key: 'after', value: 1 })
    return { done: true }
  }`

  it('try does not catch it, and nothing after it runs', async () => {
    const store = spyStore()
    const r = await run(
      REFUSED_IN_TRY,
      { v: [1, 2, 3] },
      {
        fuel: 1000,
        capabilities: { store },
      }
    )
    expect(r.error?.message).toMatch(
      /'storeGet': its input does not have the shape the atom declares/
    )
    expect(r.result).toBe(r.error)
    expect(store.sets).toEqual([])
  })

  it('under fuel: Infinity it halts with its own reason, not "Out of Fuel"', async () => {
    const store = spyStore()
    const r = await run(
      REFUSED_IN_TRY,
      { v: [1, 2, 3] },
      {
        fuel: Infinity,
        capabilities: { store },
      }
    )
    // Round 33's bill computed Infinity − Infinity, the meter became NaN, and a CAUGHT refusal
    // ended as "Out of Fuel". (Every unlimited run reports fuelUsed NaN, refusal or not: an
    // older defect, carded separately.)
    expect(r.error?.message).toMatch(/does not have the shape/)
    expect(store.sets).toEqual([])
  })

  it('a WALK refusal under fuel: Infinity keeps its own reason (the bill must not compute NaN)', async () => {
    const store = spyStore()
    const r = await run(
      `function f(v: [{ i: 0 }]) {
        try {
          storeSet({ key: 'k', value: v })
        } catch (e) {
          storeSet({ key: 'caught', value: 1 })
        }
        return { done: true }
      }`,
      { v: Array.from({ length: 2000 }, (_, i) => ({ i })) },
      { fuel: Infinity, membraneMaxBytes: 1000, capabilities: { store } }
    )
    expect(r.error?.message).toMatch(/membrane budget/)
    expect(store.sets).toEqual([])
  })

  it('an EMPTY catch as the last statement still ends the run with the refusal', async () => {
    // the catch clears the step error and no later step re-reads the halt: the run's result
    // must report it anyway
    const r = await run(
      `function f(v: [0]) {
        try {
          storeGet({ key: v })
        } catch (e) {}
      }`,
      { v: [1, 2, 3] },
      { fuel: 1000, capabilities: { store: spyStore() } }
    )
    expect(r.error?.message).toMatch(/does not have the shape/)
  })

  it('a hand-built AST ending in try with an empty catch still reports the refusal', async () => {
    // Hand-built on purpose: the transpiler always emits a final step that re-reads the halt, so
    // only an AST like this one (a persisted format) needs the run's result to report it.
    const r = await new AgentVM().run(
      {
        $ajs: 2,
        op: 'seq',
        steps: [
          {
            op: 'try',
            try: [{ op: 'storeGet', key: [1, 2, 3], result: 'x' }],
            catch: [],
          },
        ],
      } as any,
      {},
      { fuel: 1000, capabilities: { store: spyStore() } }
    )
    expect(r.error?.message).toMatch(/does not have the shape/)
    expect(r.result).toBe(r.error)
  })

  it('a refusal in a sub-agent ends the parent too, past the parent try', async () => {
    const store = spyStore()
    const child = transpile(`function child(v: [0]) {
      storeGet({ key: v })
      return { child: true }
    }`).ast
    const r = await run(
      `function f(child: any) {
        try {
          agentRun({ agentId: child, input: { v: [1, 2] } })
        } catch (e) {
          storeSet({ key: 'caught', value: 1 })
        }
        storeSet({ key: 'after', value: 1 })
        return { done: true }
      }`,
      { child },
      { fuel: 1000, capabilities: { store } }
    )
    expect(r.error?.message).toMatch(/does not have the shape/)
    expect(store.sets).toEqual([])
  })

  it('an ORDINARY failure is still catchable (the other direction)', async () => {
    const sets: string[] = []
    const store = {
      get: async () => {
        throw new Error('backend down')
      },
      set: async (k: string) => {
        sets.push(k)
      },
    }
    const r = await run(
      `function f() {
        try {
          storeGet({ key: 'k' })
        } catch (e) {
          storeSet({ key: 'caught', value: 1 })
        }
        return { done: true }
      }`,
      {},
      { fuel: 1000, capabilities: { store } }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ done: true })
    expect(sets).toEqual(['caught'])
  })
})

describe('the INBOUND crossing ends the run too (cumulative review 9)', () => {
  const big = Array.from({ length: 600_000 }, () => 0) // ~4.8MB against the 4MB default
  const bigStore = (calls: { n: number }) => ({
    get: async () => {
      calls.n++
      return big
    },
    set: async () => {},
  })

  it('an over-budget capability return inside try: no catch, nothing after', async () => {
    const calls = { n: 0 }
    const sets: string[] = []
    const store = {
      ...bigStore(calls),
      set: async (k: string) => void sets.push(k),
    }
    const r = await run(
      `function f() {
        try {
          const x = storeGet({ key: 'k' })
        } catch (e) {
          storeSet({ key: 'caught', value: 1 })
        }
        storeSet({ key: 'after', value: 1 })
        return { done: true }
      }`,
      {},
      { fuel: 1000, capabilities: { store } }
    )
    expect(r.error?.message).toMatch(
      /Capability boundary rejected the return of 'storeGet'/
    )
    expect(sets).toEqual([])
  })

  it("the review's catch-and-retry loop ends after ONE walk", async () => {
    const calls = { n: 0 }
    const t0 = performance.now()
    const r = await run(
      `function f() {
        let n = 0
        while (true) {
          try {
            const x = storeGet({ key: 'k' })
          } catch (e) {
            n = n + 1
          }
        }
        return { n }
      }`,
      {},
      { fuel: 1000, capabilities: { store: bigStore(calls) } }
    )
    expect(r.error?.message).toMatch(/Capability boundary rejected/)
    expect(calls.n).toBe(1)
    expect(performance.now() - t0).toBeLessThan(2_000)
  })

  it('a capability returning a function ends the run', async () => {
    const store = { get: async () => ({ f: () => 1 }), set: async () => {} }
    const r = await run(
      `function f() {
        try { const x = storeGet({ key: 'k' }) } catch (e) { return { caught: true } }
        return { done: true }
      }`,
      {},
      { fuel: 1000, capabilities: { store } }
    )
    expect(r.error?.message).toMatch(/Capability boundary rejected/)
  })

  it("an IO atom's output that breaks its declared schema ends the run", async () => {
    const liar = defineAtom(
      'liar',
      s.object({}),
      s.string,
      async () => 42 as any
    )
    const r = await new AgentVM({ liar }).run(
      transpile(
        `function f() {
          try { const x = liar({}) } catch (e) { return { caught: true } }
          return { done: true }
        }`,
        { atoms: { liar } } as any
      ).ast,
      {},
      { fuel: 1000 }
    )
    expect(r.error?.message).toMatch(/Output validation failed for 'liar'/)
  })
})

describe('constructs that loop end promptly after a halt (review 9, gap 4)', () => {
  const opts = () => ({ fuel: 1e5, capabilities: { store: spyStore() } })
  const cases: Array<[string, string]> = [
    [
      'a while body',
      `function f(v: [0]) {
        let i = 0
        while (i < 100000) { storeGet({ key: v }); i = i + 1 }
        return { i }
      }`,
    ],
    [
      'a while body that catches (the case only the halt stops)',
      `function f(v: [0]) {
        let i = 0
        while (i < 100000) {
          try { storeGet({ key: v }) } catch (e) {}
          i = i + 1
        }
        return { i }
      }`,
    ],
    [
      'a for...of body',
      `function f(v: [0]) {
        const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        for (const it of items) { storeGet({ key: v }) }
        return { done: true }
      }`,
    ],
    [
      'a helper called in a loop',
      `function h(v) {
        storeGet({ key: v })
        return 1
      }
      function f(v: [0]) {
        let i = 0
        while (i < 100000) { const r = h(v); i = i + 1 }
        return { i }
      }`,
    ],
  ]
  for (const [label, src] of cases) {
    it(label, async () => {
      const r = await run(src, { v: [1, 2] }, opts())
      expect(r.error?.message).toMatch(/does not have the shape/)
      // one refusal, not 100,000 iterations of skipped steps
      expect(r.fuelUsed).toBeLessThan(50)
    })
  }
})
