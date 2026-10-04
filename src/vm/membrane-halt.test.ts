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
import { defineAtom, AgentError, membraneValue, egressValue } from './runtime'

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

describe('could plain JSON have done this? (cumulative review 11)', () => {
  // The criterion behind `kind`: a refusal JSON can trigger is the WORLD's ('limit', catchable); a
  // refusal JSON cannot express is the HOST's ('shape', ends the run). Round 36 put depth on the
  // host's side, and 20KB of nested JSON from a server halted any agent.
  it("the review's deep body: nested JSON from a capability is caught, and billed", async () => {
    const deep = JSON.parse('['.repeat(10_050) + ']'.repeat(10_050))
    const store = { get: async () => deep, set: async () => {} }
    const r = await run(
      `function f() {
        try { const x = storeGet({ key: 'k' }) } catch (e) { return { caught: true } }
        return { caught: false }
      }`,
      {},
      { fuel: 1e4, capabilities: { store } }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ caught: true })
  })

  it('no JSON value is ever refused as shape (generated)', () => {
    let seed = 7
    const rand = () =>
      (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    // bounded by a NODE budget, not just depth: fan-out at every level is exponential
    let nodes = 0
    const gen = (d: number): unknown => {
      nodes++
      const r = rand()
      if (d > 12 || nodes > 3_000 || r < 0.2)
        return [null, true, 1.5, 'x'.repeat(Math.floor(rand() * 5000))][
          Math.floor(rand() * 4)
        ]
      if (r < 0.5)
        return Array.from({ length: Math.floor(rand() * 40) }, () => gen(d + 1))
      return Object.fromEntries(
        Array.from({ length: Math.floor(rand() * 20) }, (_, i) => [
          'k' + i,
          gen(d + 1),
        ])
      )
    }
    const fresh = () => {
      nodes = 0
      return gen(0)
    }
    const deepChain = (n: number) => JSON.parse('['.repeat(n) + ']'.repeat(n))
    const values = [
      ...Array.from({ length: 200 }, () => JSON.parse(JSON.stringify(fresh()))),
      deepChain(10_050),
      deepChain(50_000),
    ]
    for (const v of values)
      for (const budget of [64, 4096, 1e6]) {
        const r = membraneValue(v, budget) as any
        if (!r.ok) expect(r.kind).toBe('limit')
      }
  })

  it('a SHAPE refusal under low fuel still ends the run with its own reason', async () => {
    const store = {
      get: async () => ({
        // `f` LAST: the walk visits in source order, so it is reached after the 800KB pad
        // exhausts the fuel
        pad: 'z'.repeat(400_000),
        f: () => 1,
      }),
      set: async () => {},
    }
    const r = await run(
      `function f() {
        try { const x = storeGet({ key: 'k' }) } catch (e) { return { caught: true } }
        return { done: true }
      }`,
      {},
      { fuel: 10, capabilities: { store } }
    )
    expect(r.error?.message).toMatch(/Capability boundary rejected/)
  })
})

describe('an error is reduced where it ENTERS guest scope (cumulative review 11, B2)', () => {
  const thrower = (make: () => unknown) =>
    defineAtom('boom', s.object({}), s.any, async () => {
      throw make()
    })
  const CATCH = `function f() {
    try { boom({}) } catch (e) { return { e, op: errorOp } }
    return { done: true }
  }`
  const runWith = (boom: any) =>
    new AgentVM({ boom }).run(
      transpile(CATCH, { atoms: { boom } } as any).ast,
      {},
      { fuel: 1000 }
    )

  it('an AgentError whose op is a host object: the guest never gets the object', async () => {
    const shared = { list: [1] }
    const r = await runWith(thrower(() => new AgentError('m', shared as any)))
    expect((r.result as any).op).not.toBe(shared)
    expect((r.result as any).op).toBeUndefined()
  })

  it('an AgentError with a 1M-char message is capped', async () => {
    const r = await runWith(
      thrower(() => new AgentError('z'.repeat(1_000_000), 'boom'))
    )
    expect(((r.result as any).e as string).length).toBeLessThan(10_000)
  })

  it('a FORGED AgentError whose message getter returns an object: no object reaches the guest', async () => {
    const live = { live: true }
    const forged = Object.create(AgentError.prototype, {
      message: {
        get() {
          return live
        },
      },
      op: { value: 'boom' },
    })
    const r = await runWith(thrower(() => forged))
    expect(typeof (r.result as any).e).toBe('string')
    expect((r.result as any).e).not.toBe(live)
  })
})

describe('native errors keep their messages, for the guest and the host (cumulative review 12, B1)', () => {
  // Round 37 read own data properties only, so a DOMException (a prototype getter), new Error()
  // and throw 42 all became a generic text, for the guest AND the host.
  const thrower = (make: () => unknown) =>
    defineAtom('boom', s.object({}), s.any, async () => {
      throw make()
    })
  const caughtBy = async (make: () => unknown) => {
    const boom = thrower(make)
    const r = await new AgentVM({ boom }).run(
      transpile(
        `function f() {
          try { boom({}) } catch (e) { return { e } }
          return { done: true }
        }`,
        { atoms: { boom } } as any
      ).ast,
      {},
      { fuel: 1000 }
    )
    return (r.result as any).e
  }
  const hostSees = async (make: () => unknown) => {
    const boom = thrower(make)
    const r = await new AgentVM({ boom }).run(
      transpile(
        `function f() { boom({})
        return { done: true } }`,
        { atoms: { boom } } as any
      ).ast,
      {},
      { fuel: 1000 }
    )
    return r.error?.message
  }
  const cases: Array<[string, () => unknown, string]> = [
    [
      'a DOMException TimeoutError',
      () => new DOMException('The operation timed out.', 'TimeoutError'),
      'The operation timed out.',
    ],
    [
      'a DOMException AbortError',
      () => new DOMException('aborted here', 'AbortError'),
      'aborted here',
    ],
    ['new Error() with no message', () => new Error(), ''],
    ['throw 42', () => 42, '42'],
    [
      'an Error subclass with a message getter',
      () =>
        new (class extends Error {
          get message() {
            return 'from a getter'
          }
        })(),
      'from a getter',
    ],
  ]
  for (const [label, make, expected] of cases) {
    it(label, async () => {
      expect(await caughtBy(make)).toBe(expected)
      expect(await hostSees(make)).toBe(expected)
    })
  }
})

describe('shared memory and unreadable values (cumulative review 12, B2 and follow-ups)', () => {
  it('a SharedArrayBuffer view from a capability ends the run, and later host writes are unseen', async () => {
    const view = new Uint8Array(new SharedArrayBuffer(8))
    const store = { get: async () => ({ v: view }), set: async () => {} }
    const r = await run(
      `function f() {
        try { const x = storeGet({ key: 'k' }) } catch (e) { return { caught: true } }
        return { done: true }
      }`,
      {},
      { fuel: 1000, capabilities: { store } }
    )
    view[0] = 99
    expect(r.error?.message).toMatch(/Capability boundary rejected/)
  })

  it("a Proxy whose trap throws during the walk is the host's: the run ends", async () => {
    const trap = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('trap')
        },
      }
    )
    const store = { get: async () => ({ p: trap }), set: async () => {} }
    const r = await run(
      `function f() {
        try { const x = storeGet({ key: 'k' }) } catch (e) { return { caught: true } }
        return { done: true }
      }`,
      {},
      { fuel: 1000, capabilities: { store } }
    )
    expect(r.error?.message).toMatch(/could not be read as data/)
  })

  it('the membrane never calls structuredClone: a stub that throws changes nothing (round 39)', () => {
    const real = globalThis.structuredClone
    try {
      ;(globalThis as any).structuredClone = () => {
        throw new Error('structuredClone must not be called')
      }
      const r = membraneValue(
        { a: [1, { b: 'c' }], d: new Date(5) },
        1e6
      ) as any
      expect(r.ok).toBe(true)
      expect(r.value).toEqual({ a: [1, { b: 'c' }], d: new Date(5) })
    } finally {
      ;(globalThis as any).structuredClone = real
    }
  })
})

describe('the membrane builds its copy: checked = forwarded (cumulative review 13, round 39)', () => {
  const crossed = (v: unknown) => membraneValue(v, 1e8) as any

  // Every disguise from review 13: refused, or read as the plain object it presents (whose slots
  // then never cross). Never a live or mis-sized copy.
  it('a SAB view with an own `buffer` shadow is refused', () => {
    const view = new Uint8Array(new SharedArrayBuffer(8))
    Object.defineProperty(view, 'buffer', { value: new ArrayBuffer(8) })
    expect(crossed({ v: view }).kind).toBe('shape')
  })

  it('a prototype-swapped SharedArrayBuffer crosses as an empty plain object, never shared', () => {
    const sab = new SharedArrayBuffer(8)
    Object.setPrototypeOf(sab, Object.prototype)
    const r = crossed({ v: sab })
    expect(r.ok).toBe(true)
    expect(r.value.v).toEqual({})
    expect(r.value.v).not.toBe(sab)
    expect(Object.getPrototypeOf(r.value.v)).toBe(Object.prototype)
  })

  it('a small view over 50MB is refused (it was charged 43 bytes and cloned 50MB)', () => {
    const view = new Uint8Array(new ArrayBuffer(50_000_000), 0, 1)
    expect(crossed({ v: view }).kind).toBe('shape')
  })

  it('an own byteLength shadow and prototype-swapped ArrayBuffer and Map carry nothing', () => {
    const ab = new ArrayBuffer(10_000_000)
    Object.setPrototypeOf(ab, Object.prototype)
    const m = new Map(Array.from({ length: 20_000 }, (_, i) => [i, i]))
    Object.setPrototypeOf(m, Object.prototype)
    const r = membraneValue({ ab, m }, 1024) as any
    expect(r.ok).toBe(true)
    expect(r.value).toEqual({ ab: {}, m: {} })
    expect(r.bytes).toBeLessThan(1024)
  })

  it('a Blob, RegExp, Error, typed array, Map and Set are refused', () => {
    for (const v of [
      new Blob(['x']),
      /r/,
      new Error('e'),
      new Float32Array(2),
      new Map(),
      new Set(),
    ])
      expect(crossed({ v }).kind).toBe('shape')
  })

  it('an EXACT Date crosses by brand as a fresh Date; a subclass, a swapped one or own fields are refused (review 14)', () => {
    const r = crossed({ a: new Date(1) })
    expect(r.ok).toBe(true)
    expect(Object.getPrototypeOf(r.value.a)).toBe(Date.prototype)
    expect(r.value.a.getTime()).toBe(1)
    class D extends Date {}
    const swapped = new Date(7)
    Object.setPrototypeOf(swapped, Object.prototype)
    const fields = Object.assign(new Date(3), { tz: 'UTC' })
    for (const d of [new D(2), swapped, fields]) {
      const refused = crossed({ d })
      expect(refused.ok).toBe(false)
      expect(refused.kind).toBe('shape')
    }
  })

  it('the copy is never the input, at any depth; cycles and sharing are preserved', () => {
    const shared = { s: 1 }
    const input: any = { a: [shared, shared], n: Object.create(null) }
    input.self = input
    const r = crossed(input)
    expect(r.ok).toBe(true)
    expect(r.value).not.toBe(input)
    expect(r.value.a[0]).not.toBe(shared)
    expect(r.value.a[0]).toBe(r.value.a[1])
    expect(r.value.self).toBe(r.value)
    expect(Object.getPrototypeOf(r.value.n)).toBe(null)
  })

  it('a key named __proto__ stays DATA in the copy', () => {
    const input = JSON.parse('{"__proto__": {"polluted": true}, "x": 1}')
    const r = crossed(input)
    expect(r.ok).toBe(true)
    expect(Object.getPrototypeOf(r.value)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(r.value, '__proto__')).toBe(
      true
    )
    expect(({} as any).polluted).toBeUndefined()
  })

  it('sparse arrays keep their holes, and key order is preserved', () => {
    const arr = [1, , 3] // eslint-disable-line no-sparse-arrays
    const r = crossed({ z: 1, a: 2, arr })
    expect(Object.keys(r.value)).toEqual(['z', 'a', 'arr'])
    expect(1 in r.value.arr).toBe(false)
    expect(r.value.arr.length).toBe(3)
  })
})

describe('round 40: heap-bounded egress, key order, conversion advice (review 14)', () => {
  it('an outbound copy over the heap ceiling is refused by the heap gate where it lands (round 42)', () => {
    const ctx: any = {
      fuel: { current: 1e9 },
      maxHeapBytes: 100_000,
      heapAccount: { bytes: 0, transient: 0 },
      heapRoots: new Set(),
    }
    let thrown: any
    try {
      egressValue(
        ctx,
        'op',
        Array.from({ length: 200_000 }, (_, i) => i)
      )
    } catch (e) {
      thrown = e
    }
    expect(thrown?.message).toMatch(/Heap limit/)
  })

  it('key order holds when object-valued keys sit between primitives', () => {
    const r = membraneValue(
      { z: 1, o: { p: 1 }, a: 2, n: [3], m: 'x' },
      1e6
    ) as any
    expect(Object.keys(r.value)).toEqual(['z', 'o', 'a', 'n', 'm'])
    const arr: any = [0]
    arr.q = { x: 1 }
    arr.r = 2
    arr.s = { y: 2 }
    expect(Object.keys((membraneValue(arr, 1e6) as any).value)).toEqual([
      '0',
      'q',
      'r',
      's',
    ])
  })

  it("an array's non-index properties keep their source order", () => {
    const arr: any = [1, 2]
    arr.z = 1
    arr.a = 2
    arr.m = 3
    const r = membraneValue(arr, 1e6) as any
    expect(Object.keys(r.value)).toEqual(['0', '1', 'z', 'a', 'm'])
  })

  it('a refused built-in says how to convert it', () => {
    const cases: Array<[unknown, RegExp]> = [
      [
        new Map(),
        /JSON cannot express a Map: use an object, or an array of \[key, value\] pairs/,
      ],
      [new Set(), /JSON cannot express a Set: use an array/],
      [
        new Float32Array(2),
        /JSON cannot express a Float32Array: use Array\.from\(it\)/,
      ],
      [/re/, /JSON cannot express a RegExp/],
    ]
    for (const [v, why] of cases)
      expect((membraneValue({ v }, 1e6) as any).reason).toMatch(why)
  })
})

describe('no copy is written through an inherited setter (review 15, M1; arrays built null-prototype, objects defined)', () => {
  it('an accessor on Object.prototype is never called, and the key survives (both directions)', () => {
    let calls = 0
    Object.defineProperty(Object.prototype, 'hook', {
      configurable: true,
      get() {
        return undefined
      },
      set() {
        calls++
      },
    })
    try {
      const input = { hook: { secret: 1 }, a: 1 }
      const r = membraneValue(input, 1e6) as any
      expect(r.ok).toBe(true)
      expect(Object.keys(r.value)).toEqual(['hook', 'a'])
      expect(Object.getOwnPropertyDescriptor(r.value, 'hook')?.value).toEqual({
        secret: 1,
      })
      const ctx: any = {
        fuel: { current: 1e6 },
        heapAccount: { bytes: 0, transient: 0 },
        heapRoots: new Set(),
      }
      const out = egressValue(ctx, 'op', input)
      expect(Object.getOwnPropertyDescriptor(out, 'hook')?.value).toEqual({
        secret: 1,
      })
      expect(calls).toBe(0)
    } finally {
      delete (Object.prototype as any).hook
    }
  })

  it('an index accessor on Array.prototype is never called', () => {
    let calls = 0
    Object.defineProperty(Array.prototype, '1', {
      configurable: true,
      get() {
        return undefined
      },
      set() {
        calls++
      },
    })
    try {
      const r = membraneValue([1, 2, 3], 1e6) as any
      expect(r.ok).toBe(true)
      expect(Object.getOwnPropertyDescriptor(r.value, '1')?.value).toBe(2)
      expect(Object.getPrototypeOf(r.value)).toBe(Array.prototype)
      expect(calls).toBe(0)
    } finally {
      delete (Array.prototype as any)['1']
    }
  })

  it('under FROZEN intrinsics, ordinary JSON such as { toString: "x" } crosses (subprocess)', () => {
    const script = `
      const { membraneValue } = await import(${JSON.stringify(
        import.meta.dir + '/runtime.ts'
      )})
      Object.freeze(Object.prototype); Object.freeze(Array.prototype)
      const r = membraneValue({ toString: 'x', valueOf: 1, list: [1, 2], nested: { constructor: 'c' } }, 1e6)
      console.log(JSON.stringify({ ok: r.ok, value: r.value }))
    `
    const out = Bun.spawnSync(['bun', '-e', script]).stdout.toString().trim()
    expect(JSON.parse(out)).toEqual({
      ok: true,
      value: {
        toString: 'x',
        valueOf: 1,
        list: [1, 2],
        nested: { constructor: 'c' },
      },
    })
  })
})

describe('the crossing is bounded by membraneMaxBytes and fuel; the heap applies where values land (round 42)', () => {
  // Rounds 40–41 bounded the crossing by the heap ceiling too, in the membrane's byte scale (not
  // the heap's), so it refused values that fit, and it reconciled the whole heap on every crossing
  // (cumulative review 16). Removed (Tonio); vm-budgets.md I1 states the exception.
  it("review 16's false refusal: a value that fits the heap crosses and binds", async () => {
    const obj = Object.fromEntries(
      Array.from({ length: 2000 }, (_, i) => ['k' + i, i])
    )
    const r = await run(
      `function f() { const x = storeGet({ key: 'k' })
        return { n: 1 } }`,
      {},
      {
        fuel: 1e6,
        maxHeapBytes: 45_000,
        capabilities: { store: { get: async () => obj, set: async () => {} } },
      }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ n: 1 })
  })

  it('an INBOUND return over the heap ceiling is refused at its bind, catchably', async () => {
    const big = Array.from({ length: 300_000 }, (_, i) => i) // ~2.4MB
    const store = { get: async () => big, set: async () => {} }
    const r = await run(
      `function f() {
        try { const x = storeGet({ key: 'k' }) } catch (e) { return { caught: e } }
        return { caught: false }
      }`,
      {},
      { fuel: 1e6, maxHeapBytes: 1_000_000, capabilities: { store } }
    )
    expect(r.error).toBeUndefined()
    expect((r.result as any).caught).toMatch(/Heap limit exceeded/)
  })

  it("review 16's cost case: crossings near the ceiling do not reconcile the heap each time", async () => {
    // K small crossings while ~half the heap is held: fuel grows linearly in K (no per-crossing
    // whole-heap walk). Measured against K/10 crossings of the same program.
    const SRC = (k: number) => `function f(held: [0]) {
      let i = 0
      while (i < ${k}) { const x = storeGet({ key: 'k' }); i = i + 1 }
      return { n: held.length }
    }`
    const held = Array.from({ length: 50_000 }, (_, i) => i)
    const opts = {
      fuel: 1e7,
      maxHeapBytes: 1_000_000,
      capabilities: { store: { get: async () => 1, set: async () => {} } },
    }
    const few = await run(SRC(20), { held }, opts)
    const many = await run(SRC(200), { held }, opts)
    expect(few.error).toBeUndefined()
    expect(many.error).toBeUndefined()
    // ~5 fuel per iteration is the loop itself; a whole-heap reconcile per crossing (round 41)
    // adds ~50 fuel per walk for 50k nodes
    expect((many.fuelUsed - few.fuelUsed) / 180).toBeLessThan(20)
  })
})

describe('a lying Proxy length never puts an unwalked host value in the copy (review 17, B1)', () => {
  // `new Array(v.length)` with a length trap returning an object made `[hostObj]`, and the walk
  // never saw it: a live host reference reached the guest, and the guest mutated a host array.
  const hostObj = { secret: 'live' }
  const hostArr: unknown[] = ['host']
  const liar = (length: unknown) =>
    new Proxy([] as unknown[], {
      get: (t, k) => (k === 'length' ? length : Reflect.get(t, k)),
      getOwnPropertyDescriptor: (t, k) =>
        k === 'length'
          ? {
              value: length,
              writable: true,
              enumerable: false,
              configurable: false,
            }
          : Reflect.getOwnPropertyDescriptor(t, k),
      ownKeys: () => ['length'],
    })
  const lies: Array<[string, unknown]> = [
    ['an object', hostObj],
    ['an array', hostArr],
    ['a function', () => 1],
    ['a string', '5'],
    ['NaN', NaN],
    ['2^32', 2 ** 32],
  ]
  for (const [label, length] of lies) {
    it(`a length that is ${label} is refused, never copied (capability return)`, async () => {
      const store = {
        get: async () => ({ list: liar(length) }),
        set: async () => {},
      }
      const r = await run(
        `function f() {
          const x = storeGet({ key: 'k' })
          return { h: x.list[0] }
        }`,
        {},
        { fuel: 1000, capabilities: { store } }
      )
      expect(r.error?.message).toMatch(/Capability boundary rejected/)
      expect((r.result as any)?.h).not.toBe(hostObj)
      expect(hostArr).toEqual(['host'])
    })
    it(`a length that is ${label} is refused (run argument)`, async () => {
      const r = await run(
        `function f(list: [0]) { return { h: list[0] } }`,
        { list: liar(length) },
        { fuel: 1000 }
      )
      expect(r.error).toBeDefined()
      expect((r.result as any)?.h).not.toBe(hostObj)
    })
  }

  it('a descriptor of 0 with a get trap returning a host object: nothing leaks into the copy', () => {
    const p = new Proxy([] as unknown[], {
      get: (t, k) => (k === 'length' ? hostObj : Reflect.get(t, k)),
    })
    const r = membraneValue({ list: p }, 1e6) as any
    expect(r.ok).toBe(true)
    expect(r.value.list).toEqual([])
    expect(r.value.list.length).toBe(0)
  })

  it('a descriptor that disagrees with get: only what the descriptor says is copied', () => {
    const p = new Proxy([1, 2], {
      get: (t, k) => (k === 'length' ? hostObj : Reflect.get(t, k)),
    })
    const r = membraneValue(p, 1e6) as any
    expect(r.ok).toBe(true)
    expect(r.value).toEqual([1, 2])
  })
})

describe('the Date intrinsics are captured at load (review 17, M1)', () => {
  it('replacing globalThis.Date changes nothing the membrane recognises or builds', () => {
    const RealDate = globalThis.Date
    const real = new RealDate(42)
    class Fake extends RealDate {}
    ;(globalThis as any).Date = Fake
    try {
      const ok = membraneValue({ d: real }, 1e6) as any
      expect(ok.ok).toBe(true)
      expect(Object.getPrototypeOf(ok.value.d)).toBe(RealDate.prototype)
      const fake = membraneValue({ d: new Fake(1) }, 1e6) as any
      expect(fake.ok).toBe(false)
    } finally {
      ;(globalThis as any).Date = RealDate
    }
  })
})

describe('one admission step: an Array subclass is refused, never thinned (review 18, M1 + C1)', () => {
  // The array branch never checked the prototype, so a class with a deny getter on its prototype
  // arrived as a plain array and the getter read as undefined (the M-2 class).
  class Rule extends Array {
    get denied() {
      return true
    }
  }
  const lyingProto = new Proxy([1, 2], {
    getPrototypeOf: () => Rule.prototype,
  })
  const cases: Array<[string, () => unknown]> = [
    ['an Array subclass with a prototype getter', () => new Rule()],
    ['a Proxy over an array reporting a subclass prototype', () => lyingProto],
  ]
  for (const [label, make] of cases) {
    it(`${label} is refused (capability return)`, async () => {
      const store = { get: async () => ({ rule: make() }), set: async () => {} }
      const r = await run(
        `function f() {
          const x = storeGet({ key: 'k' })
          return { denied: x.rule.denied }
        }`,
        {},
        { fuel: 1000, capabilities: { store } }
      )
      expect(r.error?.message).toMatch(/an Array subclass/)
    })
    it(`${label} is refused (run argument)`, async () => {
      const r = await run(
        `function f(rule: [0]) { return { n: 1 } }`,
        { rule: make() },
        {
          fuel: 1000,
        }
      )
      expect(r.error?.message).toMatch(/an Array subclass/)
    })
  }

  it('an array from another realm is refused like a cross-realm object (node:vm)', async () => {
    const { runInNewContext } = await import('node:vm')
    const foreign = runInNewContext('[1, 2, 3]')
    expect((membraneValue({ a: foreign }, 1e6) as any).kind).toBe('shape')
  })

  it('a Proxy reporting an index past its length is refused, and no copy outgrows its length', () => {
    const p = new Proxy([] as unknown[], {
      ownKeys: () => ['length', '4294967294'],
      getOwnPropertyDescriptor: (t, k) =>
        k === '4294967294'
          ? { value: 1, writable: true, enumerable: true, configurable: true }
          : Reflect.getOwnPropertyDescriptor(t, k),
    })
    const r = membraneValue({ p }, 1e6) as any
    expect(r.ok).toBe(false)
    expect(r.kind).toBe('shape')
    expect(r.reason).toMatch(/past its length/)
  })
})

describe('an array is never admitted as a plain object (review 19, F1)', () => {
  // Round 44 admitted arrays only with Array.prototype, so a real array with its prototype
  // swapped to null or Object.prototype fell through to "plain", lost `length`, and the review's
  // deny check (`if (x.blocked.length > 0) allowed = false`) failed OPEN.
  const DENY = `function f() {
    const x = storeGet({ key: 'k' })
    let allowed = true
    if (x.blocked.length > 0) { allowed = false }
    return { allowed, n: x.blocked.length }
  }`
  for (const [label, proto] of [
    ['a null prototype', null],
    ['Object.prototype', Object.prototype],
  ] as const) {
    it(`an array with ${label} crosses as an array (capability return): the deny check holds`, async () => {
      const blocked = Object.setPrototypeOf(['mallory'], proto)
      const store = { get: async () => ({ blocked }), set: async () => {} }
      const r = await run(DENY, {}, { fuel: 1000, capabilities: { store } })
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ allowed: false, n: 1 })
    })
    it(`an array with ${label} crosses as an array (run argument)`, async () => {
      const r = await run(
        `function f(list: ['']) { return { n: list.length } }`,
        { list: Object.setPrototypeOf(['a', 'b'], proto) },
        { fuel: 1000 }
      )
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ n: 2 })
    })
  }
})

describe('the membrane uses captured intrinsics only (review 19, S1)', () => {
  it('replacing Array.isArray and Object.defineProperty changes nothing it admits or builds', () => {
    const realIsArray = Array.isArray
    const realDefine = Object.defineProperty
    ;(Array as any).isArray = () => false
    ;(Object as any).defineProperty = () => {
      throw new Error('hijacked')
    }
    try {
      const r = membraneValue({ a: [1, 2], b: { c: 3 } }, 1e6) as any
      expect(r.ok).toBe(true)
      expect(realIsArray(r.value.a)).toBe(true)
      expect(r.value.b.c).toBe(3)
    } finally {
      ;(Array as any).isArray = realIsArray
      ;(Object as any).defineProperty = realDefine
    }
  })
})
