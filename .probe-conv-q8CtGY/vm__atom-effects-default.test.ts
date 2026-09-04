/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

import {
  defineAtom,
  coreAtoms,
  EFFECTFUL_CORE_OPS,
} from '/Users/tonioloewald/tjs-lang/src/vm/runtime'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { s } from 'tosijs-schema'

/* line 32 */
async function runAtom(atom, op) {
  const vm = new AgentVM({ [op]: atom })
  const ast = Agent.custom({ ...vm['atoms'] })
    .step({ op })
    .as('out')
    .return(s.object({ out: s.any }))
    .toJSON()
  return vm.run(ast, {}, { capabilities: {} })
}
runAtom.__tjs = {
  params: {
    atom: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    op: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:32',
}

describe('defineAtom defaults to io', () => {
  it('an atom defined with no options is io', () => {
    const atom = defineAtom('probe', s.object({}), s.any, async () => 1)
    expect(atom.effects).toBe('io')
  })
  it('…including the string-shorthand form, which takes the docs path', () => {
    const atom = defineAtom(
      'probe2',
      s.object({}),
      s.any,
      async () => 1,
      'docs'
    )
    expect(atom.effects).toBe('io')
  })
  it('`effects: pure` is still an explicit opt-out', () => {
    const atom = defineAtom('probe3', s.object({}), s.any, async () => 1, {
      effects: 'pure',
    })
    expect(atom.effects).toBe('pure')
  })
})

describe('the default has its CONSEQUENCE at the boundary', () => {
  it('an untagged atom returning an accessor is REJECTED', async () => {
    const atom = defineAtom('sdkCall', s.object({}), s.any, async () => ({
      ok: true,
      get status() {
        return 200
      },
    }))
    const result = await runAtom(atom, 'sdkCall')
    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Capability boundary rejected')
  })
  it('an untagged atom cannot hand the guest a LIVE host reference', async () => {
    const host = { rows: [{ id: 1 }] }
    const atom = defineAtom('query', s.object({}), s.any, async () => host)
    const result = await runAtom(atom, 'query')
    expect(result.error).toBeUndefined()

    expect(result.result.out).toEqual(host)
    expect(result.result.out).not.toBe(host)
    expect(result.result.out.rows).not.toBe(host.rows)
  })
  it('and an atom that opts OUT is not membraned — the tag is what decides', async () => {
    const host = { rows: [{ id: 1 }] }
    const atom = defineAtom(
      'localCalc',
      s.object({}),
      s.any,
      async () => host,
      { effects: 'pure' }
    )
    const result = await runAtom(atom, 'localCalc')
    expect(result.error).toBeUndefined()
    expect(result.result.out).toBe(host)
  })
})

describe('core atoms are classified explicitly, not by the default', () => {
  it('every core atom carries a tag', () => {
    const untagged = Object.entries(coreAtoms)
      .filter(([, a]) => a.effects !== 'pure' && a.effects !== 'io')
      .map(([op]) => op)
    expect(untagged).toEqual([])
  })
  it('the effectful list is exactly the set of io core atoms', () => {
    const io = Object.entries(coreAtoms)
      .filter(([, a]) => a.effects === 'io')
      .map(([op]) => op)
      .sort()
    expect(io).toEqual([...EFFECTFUL_CORE_OPS].sort())
  })
  it('data-shaping atoms stayed pure', () => {
    for (const op of ['len', 'jsonStringify', 'map', 'filter']) {
      expect(coreAtoms[op]?.effects, op).toBe('pure')
    }
  })
})
