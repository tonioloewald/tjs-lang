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

  it('through vm.run directly — and the DATA still arrives', async () => {
    const svc = new Service()
    const { ast } = transpile('function f({ svc }) { return { t: svc.token } }')
    const r = await new AgentVM().run(ast, { svc }, { fuel: 100 })
    expect(r.error).toBeUndefined()
    expect((r.result as any).t).toBe('secret')
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

  it('large plain data is not capped by the capability budget', async () => {
    const big = Array.from({ length: 300_000 }, (_, i) => ({ i }))
    const { ast } = transpile(
      'function f({ big }) { return { n: big.length } }'
    )
    const r = await new AgentVM().run(ast, { big }, { fuel: 1000 })
    expect(r.error).toBeUndefined()
    expect((r.result as any).n).toBe(300_000)
  })
})
