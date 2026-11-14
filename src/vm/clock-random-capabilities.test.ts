/**
 * The wall clock and the random source are CAPABILITIES (#4091, decided 2026-11-14).
 *
 * Guest code read the host's clock (`Date.now()`, `Date()`) and its random source
 * (`Math.random()`, the `random` and `uuid` atoms) directly: ambient authority in a
 * capability VM. A guest could time things (a channel the host never granted), a host could not
 * run a fixed-timestep or lockstep simulation (native tosi-3d asked for an injected clock), and a
 * run could not be replayed. Now `capabilities.clock` ({ now(): ms }) and `capabilities.random`
 * ({ next(): [0, 1) }) supply them, and without them those calls are refused, as `fetch` is.
 * `Eval` and `SafeFunction` pass the real ones by default (`systemClock`, `systemRandom`).
 * `Date(x)` with an argument and date arithmetic read no clock and need nothing.
 *
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'
import { systemClock, systemRandom } from './runtime'
import { Eval } from '../lang/eval'

const run = (body: string, capabilities: Record<string, unknown> = {}) =>
  new AgentVM().run(
    transpile(`function f({}) { ${body} }`).ast,
    {},
    {
      fuel: 1000,
      capabilities,
    }
  )

const fixedClock = { now: () => 86_400_000 } // 1970-01-02T00:00:00Z
const fixedRandom = { next: () => 0.25 }

describe('without the capability, the call is refused', () => {
  const rows: [string, string, RegExp][] = [
    ['Date.now()', 'const t = Date.now()\n return { t }', /clock/],
    ['Date() with no argument', 'const d = Date()\n return { d }', /clock/],
    ['Math.random()', 'const r = Math.random()\n return { r }', /random/],
    ['the random atom', 'const r = random({})\n return { r }', /random/],
    ['the uuid atom', 'const u = uuid({})\n return { u }', /random/],
  ]
  for (const [what, body, why] of rows)
    it(what, async () => {
      const r = await run(body)
      expect(r.error?.message).toMatch(why)
      expect(r.result?.$error).toBe(true) // the run failed: no value got out
    })
})

describe('with the capability, the guest reads exactly what the host injected', () => {
  it('Date.now() and Date() read the clock', async () => {
    const r = await run(
      'const t = Date.now()\n const d = Date()\n return { t, iso: d.format() }',
      { clock: fixedClock }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ t: 86_400_000, iso: '1970-01-02T00:00:00.000Z' })
  })

  it('Math.random(), random and uuid read the random source', async () => {
    const r = await run(
      "const a = Math.random()\n const b = random({ min: 0, max: 8, format: 'integer' })\n const u = uuid({})\n return { a, b, u }",
      { random: fixedRandom }
    )
    expect(r.error).toBeUndefined()
    expect(r.result.a).toBe(0.25)
    expect(r.result.b).toBe(2)
    // deterministic: every byte is floor(0.25 * 256) = 0x40, with the v4 version and variant bits
    expect(r.result.u).toBe('40404040-4040-4040-8040-404040404040')
  })

  it('the same injected sources replay the same run', async () => {
    let i = 0
    const seq = { next: () => [0.1, 0.9, 0.5][i++ % 3] }
    const body =
      'const xs = [Math.random(), Math.random(), Math.random()]\n return { xs }'
    const first = await run(body, { random: seq })
    i = 0
    const second = await run(body, { random: seq })
    expect(second.result).toEqual(first.result)
    expect(first.result.xs).toEqual([0.1, 0.9, 0.5])
  })
})

describe('what a source returns is checked', () => {
  const bad: [string, Record<string, unknown>, string][] = [
    [
      'a clock returning a string',
      { clock: { now: () => '1000' } },
      'const t = Date.now()\n return { t }',
    ],
    [
      'a clock returning NaN',
      { clock: { now: () => NaN } },
      'const t = Date.now()\n return { t }',
    ],
    [
      'a clock returning a Promise',
      { clock: { now: async () => 1000 } },
      'const t = Date.now()\n return { t }',
    ],
    [
      'a random source returning 1',
      { random: { next: () => 1 } },
      'const r = Math.random()\n return { r }',
    ],
    [
      'a random source returning -0.5',
      { random: { next: () => -0.5 } },
      'const r = Math.random()\n return { r }',
    ],
    [
      'a clock that is not an object with now()',
      { clock: () => 1000 },
      'const t = Date.now()\n return { t }',
    ],
  ]
  for (const [what, caps, body] of bad)
    it(`${what} is refused`, async () => {
      const r = await run(body, caps)
      expect(r.error).toBeDefined()
      expect(r.result?.$error).toBe(true)
    })
})

describe('what needs no clock', () => {
  it('Date(x) with an argument, and date arithmetic', async () => {
    const r = await run(
      "const d = Date('2024-01-31T00:00:00Z')\n const e = d.add({ days: 1 })\n return { iso: e.format(), n: Date(0).timestamp }"
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ iso: '2024-02-01T00:00:00.000Z', n: 0 })
  })

  it('Date(undefined) is not a back door to the clock', async () => {
    const r = await run('const d = Date(undefined)\n return { d }')
    expect(r.error?.message).toMatch(/clock/)
  })
})

describe('the convenience entry points pass the real sources', () => {
  it('Eval reads the real clock and random source by default', async () => {
    const before = Date.now()
    const r = await Eval({ code: '[Date.now(), Math.random()]' })
    expect(r.error).toBeUndefined()
    expect(r.result[0]).toBeGreaterThanOrEqual(before)
    expect(r.result[1]).toBeGreaterThanOrEqual(0)
    expect(r.result[1]).toBeLessThan(1)
  })

  it('a caller can inject its own, or refuse one by passing undefined', async () => {
    const fixed = await Eval({
      code: 'Date.now()',
      capabilities: { clock: fixedClock },
    })
    expect(fixed.result).toBe(86_400_000)
    const refused = await Eval({
      code: 'Date.now()',
      capabilities: { clock: undefined },
    })
    expect(refused.error?.message).toMatch(/clock/)
  })

  it('systemClock and systemRandom are the real ones', () => {
    expect(Math.abs(systemClock.now() - Date.now())).toBeLessThan(1000)
    const x = systemRandom.next()
    expect(x >= 0 && x < 1).toBe(true)
  })
})
