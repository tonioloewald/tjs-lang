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
