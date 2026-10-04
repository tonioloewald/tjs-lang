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

describe('INBOUND refusals split by who got it wrong (Tonio, 2026-10-04; review 10)', () => {
  // A capability returning non-data broke the HOST's contract: the run ends. A return that is too
  // big, or does not match the atom's declared output, is the WORLD's doing: catchable, and every
  // inbound walk is billed so a retry loop pays.
  const stringStore = (chars: number, calls = { n: 0 }) => ({
    get: async () => {
      calls.n++
      return 'x'.repeat(chars)
    },
    set: async () => {},
  })
  const CAUGHT = `function f() {
    try {
      const x = storeGet({ key: 'k' })
      return { caught: false }
    } catch (e) {
      return { caught: true }
    }
  }`

  // Round 35 halted on size, so a response between about half and all of the budget KILLED the
  // run while a bigger one was caught (raw bytes pass the read limit, then grow when decoded).
  // Every size refusal is now the same catchable failure.
  for (const [label, chars] of [
    ['1M chars (2MB, fits)', 1_000_000],
    ['3M chars (6MB, refused)', 3_000_000],
    ['5M chars (10MB, refused)', 5_000_000],
  ] as const) {
    it(`a ${label} return in try behaves like any world failure`, async () => {
      const r = await run(
        CAUGHT,
        {},
        {
          fuel: 1e4,
          capabilities: { store: stringStore(chars) },
        }
      )
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ caught: chars * 2 > 4 * 1024 * 1024 })
    })
  }

  it('a catch-and-retry loop on an oversized return pays for every walk and ends by fuel', async () => {
    const calls = { n: 0 }
    const t0 = performance.now()
    const r = await run(
      `function f() {
        let n = 0
        while (true) {
          try { const x = storeGet({ key: 'k' }) } catch (e) { n = n + 1 }
        }
        return { n }
      }`,
      {},
      { fuel: 1000, capabilities: { store: stringStore(3_000_000, calls) } }
    )
    expect(r.error?.message).toBe('Out of Fuel')
    // each refused walk reads the 4MB budget: 200 fuel at 20,000 bytes per fuel
    expect(calls.n).toBeLessThanOrEqual(6)
    expect(performance.now() - t0).toBeLessThan(3_000)
  })

  it('a capability returning a FUNCTION (the host contract) still ends the run', async () => {
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

  it('a capability returning a GETTER (the host contract) ends the run without running it', async () => {
    let ran = 0
    const store = {
      get: async () =>
        Object.defineProperty({}, 'g', {
          get: () => {
            ran++
            return 1
          },
          enumerable: true,
        }),
      set: async () => {},
    }
    const r = await run(
      `function f() {
        try { const x = storeGet({ key: 'k' }) } catch (e) { return { caught: true } }
        return { done: true }
      }`,
      {},
      { fuel: 1000, capabilities: { store } }
    )
    expect(r.error?.message).toMatch(/Capability boundary rejected/)
    expect(ran).toBe(0)
  })

  it("an IO atom's output that breaks its declared schema is catchable (protocol drift)", async () => {
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
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ caught: true })
  })

  it('an ACCEPTED inbound walk is billed too (a mismatch-and-retry loop pays)', async () => {
    const small = await run(
      `function f() { const x = storeGet({ key: 'k' })
        return { ok: true } }`,
      {},
      { fuel: 1e4, capabilities: { store: stringStore(10) } }
    )
    const big = await run(
      `function f() { const x = storeGet({ key: 'k' })
        return { ok: true } }`,
      {},
      { fuel: 1e4, capabilities: { store: stringStore(1_000_000) } }
    )
    // 2MB walked at 20,000 bytes per fuel
    expect(big.fuelUsed - small.fuelUsed).toBeGreaterThan(90)
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

describe('a THROWN value crosses as a capped string (cumulative review 10, B2)', () => {
  const throwing = (thrown: () => unknown) =>
    defineAtom('boom', s.object({}), s.any, async () => {
      throw thrown()
    })
  const CATCH = `function f() {
    try { boom({}) } catch (e) { return { e } }
    return { done: true }
  }`
  const runWith = (boom: any) =>
    new AgentVM({ boom }).run(
      transpile(CATCH, { atoms: { boom } } as any).ast,
      {},
      { fuel: 1000 }
    )

  it("the review's case: { message: objWithGetter } — no host mutation, getter never runs", async () => {
    const shared = { list: [1, 2, 3] }
    let ran = 0
    const obj = Object.defineProperty({ list: shared.list }, 'x', {
      get: () => {
        ran++
        return 'ran host getter'
      },
      enumerable: true,
    })
    const r = await runWith(throwing(() => ({ message: obj })))
    expect(r.error).toBeUndefined()
    expect(typeof (r.result as any).e).toBe('string')
    expect(shared.list).toEqual([1, 2, 3])
    expect(ran).toBe(0)
  })

  it('a huge string message is capped', async () => {
    const r = await runWith(throwing(() => new Error('y'.repeat(1_000_000))))
    expect(((r.result as any).e as string).length).toBeLessThan(10_000)
  })

  it('an Error whose message is not a string reaches the guest as a string', async () => {
    const r = await runWith(
      throwing(() =>
        Object.assign(new Error('x'), { message: { nested: [1] } })
      )
    )
    expect(typeof (r.result as any).e).toBe('string')
  })
})
