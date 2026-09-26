/**
 * Run ARGUMENTS cross the capability membrane, like capability returns.
 *
 * They are host values entering guest state, and they arrived LIVE. `methodCall`'s
 * allowlist filters method NAMES, not owners, so a host class that defines `slice` or `map`
 * had that method invoked by guest code: `Eval({ code: 'svc.slice(0)', context: { svc } })`
 * ran host code. Picture the realistic shape: a service object with a method that can fetch.
 * The copy keeps the data and drops the prototype, so the methods stay behind; an own
 * function or getter is refused outright. (0.14.0; Tonio's call: "data should pass
 * through the membrane".)
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'
import { transpile } from '../lang/index'
import { Eval, SafeFunction } from '../lang/eval'

class Service {
  calls = 0
  token = 'secret'
  slice() {
    this.calls++
    return 'HOST CODE RAN'
  }
  map() {
    this.calls++
    return ['HOST CODE RAN']
  }
}

describe('host methods on an argument are unreachable', () => {
  it('through Eval context', async () => {
    const svc = new Service()
    const r = await Eval({ code: 'svc.slice(0)', context: { svc } })
    expect(r.result).not.toBe('HOST CODE RAN')
    expect(svc.calls).toBe(0)
  })

  it('through SafeFunction arguments', async () => {
    const svc = new Service()
    const fn = await SafeFunction({
      params: ['svc'],
      body: 'return svc.slice(0)',
    })
    const r = await fn(svc)
    expect(r.result).not.toBe('HOST CODE RAN')
    expect(svc.calls).toBe(0)
  })

  it('through vm.run directly — refused by name, and host code never runs', async () => {
    // A class instance is refused outright (0.14.0 final re-review 2, M-2): copying only its
    // own data would thin it silently. Its data crosses when the host passes plain data.
    const svc = new Service()
    const { ast } = transpile('function f({ svc }) { return { t: svc.token } }')
    const refused = await new AgentVM().run(ast, { svc }, { fuel: 100 })
    expect(refused.error?.message).toMatch(/instance of Service/)
    const plain = await new AgentVM().run(
      ast,
      { svc: { token: svc.token } },
      { fuel: 100 }
    )
    expect((plain.result as any).t).toBe('secret')
    expect(svc.calls).toBe(0)
  })
})

describe('what cannot be copied is refused, not run', () => {
  const run = (args: any) =>
    new AgentVM().run(
      transpile('function f({ a }) { return { a } }').ast,
      args,
      { fuel: 100 }
    )

  it('an own function property', async () => {
    const r = await run({ a: { go: () => 1 } })
    expect(r.error?.message).toMatch(/rejected the run arguments/)
  })

  it('a getter, which is never invoked', async () => {
    let ran = false
    const a = Object.defineProperty({}, 'x', {
      get: () => ((ran = true), 1),
      enumerable: true,
    })
    const r = await run({ a })
    expect(r.error?.message).toMatch(/rejected the run arguments/)
    expect(ran).toBe(false)
  })
})

describe('the guest gets a copy', () => {
  it('guest writes never reach the host object', async () => {
    const host = { items: [1, 2] }
    const { ast } = transpile(
      'function f({ host }) { host.items.push(3); return { n: host.items.length } }'
    )
    await new AgentVM().run(ast, { host }, { fuel: 100 })
    expect(host.items).toEqual([1, 2])
  })

  it("large plain data is bounded by the run's FUEL, not the 4MB capability budget", async () => {
    const big = Array.from({ length: 300_000 }, (_, i) => ({ i }))
    const { ast } = transpile(
      'function f({ big }) { return { n: big.length } }'
    )
    // Over the 4MB default: a host passing this much raises argsMaxBytes knowingly.
    const r = await new AgentVM().run(
      ast,
      { big },
      { fuel: 10_000, argsMaxBytes: 64 * 1024 * 1024 }
    )
    expect(r.error).toBeUndefined()
    expect((r.result as any).n).toBe(300_000)
  })
})

describe('admission is budgeted and metered (0.14.0 final re-review 2, B-1)', () => {
  const ast = transpile(
    'function f({ items }) { return { n: items.length } }'
  ).ast

  it('a 10MB argument over the budget is refused CHEAPLY, not walked', async () => {
    const items = new Array(5_000_000).fill(1)
    const t = performance.now()
    const r = await new AgentVM().run(ast, { items }, { fuel: 100 })
    // Fuel was the binding limit, so this IS fuel exhaustion — the message hosts detect.
    expect(r.error?.message).toBe('Out of Fuel')
    expect(performance.now() - t).toBeLessThan(100)
  })

  it('what crosses is charged to fuel', async () => {
    const small = await new AgentVM().run(ast, { items: [1] }, { fuel: 1000 })
    const big = await new AgentVM().run(
      ast,
      { items: new Array(100_000).fill(1) },
      { fuel: 1000 }
    )
    expect(big.fuelUsed - small.fuelUsed).toBeGreaterThan(50)
  })

  it('argsMaxBytes caps it whatever the fuel', async () => {
    const r = await new AgentVM().run(
      ast,
      { items: new Array(10_000).fill(1) },
      { fuel: 1e9, argsMaxBytes: 1024 }
    )
    expect(r.error?.message).toMatch(/1024-byte/)
  })
})

describe('a class instance is refused LOUDLY, not silently thinned (M-2)', () => {
  class Timestamp {
    constructor(private _seconds: number) {}
    get seconds() {
      return this._seconds
    }
  }
  class Acct {
    #b = 5
    get balance() {
      return this.#b
    }
  }
  const run = (args: any) =>
    new AgentVM().run(
      transpile('function f({ doc }) { return { s: doc.createdAt } }').ast,
      args,
      { fuel: 100 }
    )

  it('a Timestamp-shaped argument (prototype getter) names the class and the party', async () => {
    const r = await run({ doc: { createdAt: new Timestamp(50) } })
    expect(r.error?.message).toMatch(
      /run argument contains an instance of Timestamp/
    )
  })

  it('a private-field class is refused, not crossed as {}', async () => {
    const r = await run({ doc: { createdAt: new Acct() } })
    expect(r.error?.message).toMatch(/instance of Acct/)
  })

  it('plain data, Date, Map, arrays and null-prototype objects still cross', async () => {
    const r = await run({
      doc: {
        createdAt: new Date(0),
        m: new Map([[1, 2]]),
        a: [1],
        n: Object.assign(Object.create(null), { x: 1 }),
      },
    })
    expect(r.error).toBeUndefined()
  })
})

describe('admission cannot be opened or outrun (0.14.0 final re-review 3, B-1, B-2)', () => {
  const ast = transpile(
    'function f({ items }) { return { n: items.length } }'
  ).ast
  const items = new Array(5_000_000).fill(1)

  for (const fuel of ['abc', NaN, {}, -1] as any[])
    it(`fuel ${String(fuel)} is refused before any walk`, async () => {
      const t = performance.now()
      const r = await new AgentVM().run(ast, { items }, { fuel })
      expect(r.error?.message).toMatch(/Invalid run option fuel/)
      expect(performance.now() - t).toBeLessThan(50)
    })

  it("at the endpoints' maximum fuel, a 10MB argument is still refused cheaply", async () => {
    const t = performance.now()
    const r = await new AgentVM().run(ast, { items }, { fuel: 10_000 })
    expect(r.error?.message).toMatch(/rejected the run arguments/)
    // Bounded by the 4MB cap, not the input: ~45ns/byte at the walk's worst.
    expect(performance.now() - t).toBeLessThan(400)
  })

  it('a cap-bound refusal is charged, not logged as free', async () => {
    const r = await new AgentVM().run(ast, { items }, { fuel: 10_000 })
    expect(r.fuelUsed).toBeGreaterThan(0)
  })
})
