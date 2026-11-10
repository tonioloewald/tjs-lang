/**
 * A custom atom tagged 'pure' returns guest data only (#3991, decided 2026-11-11).
 *
 * 'pure' skips the membrane, because core atoms operate on data already inside the VM. A HOST
 * atom tagged 'pure' that returned a Map, a class instance or an object with a getter put a live
 * host object into guest state and into `run.result`: the closed guest value domain broken by a
 * host's mistake. Now a custom pure atom's return is CHECKED (no copy): JSON data plus an exact
 * Date, own data properties only, the membrane's own rules (`admitKind`). Non-data ends the run,
 * like any boundary refusal that is a bug. Core atoms stay exempt.
 *
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'
import { defineAtom } from './runtime'

class Point {
  constructor(public x: number) {}
}

const returning = (value: () => unknown) =>
  defineAtom('give', s.object({}), undefined, async () => value(), {
    effects: 'pure',
  })

const run = async (value: () => unknown) => {
  const give = returning(value)
  const vm = new AgentVM({ give })
  const { ast } = transpile(
    `function f({}) { const v = give({}) \n return { v } }`,
    { atoms: { give } } as any
  )
  return vm.run(ast, {}, { fuel: 1000 })
}

describe("a custom 'pure' atom returns guest data only", () => {
  const refused: [string, () => unknown, RegExp][] = [
    ['a Map', () => new Map([['a', 1]]), /Map/],
    ['a class instance', () => ({ p: new Point(1) }), /class|Point/],
    ['a function', () => ({ f: () => 1 }), /function/],
    [
      'a getter',
      () => Object.defineProperty({}, 'g', { get: () => 1, enumerable: true }),
      /accessor/,
    ],
  ]
  for (const [what, value, reason] of refused)
    it(`refuses ${what}, and the run ends`, async () => {
      const r = await run(value)
      expect(r.error?.message).toMatch(reason)
      expect(JSON.stringify(r.result ?? null)).not.toContain('"v"')
    })

  const allowed: [string, () => unknown][] = [
    ['plain data', () => ({ a: [1, 'two', null, true], b: { c: 3 } })],
    ['an exact Date', () => ({ when: new Date(0) })],
    [
      'a shared reference and a cycle',
      () => {
        const o: any = { n: 1 }
        o.self = o
        return { a: o, b: o }
      },
    ],
  ]
  for (const [what, value] of allowed)
    it(`admits ${what}`, async () => {
      const r = await run(value)
      expect(r.error).toBeUndefined()
    })
})
