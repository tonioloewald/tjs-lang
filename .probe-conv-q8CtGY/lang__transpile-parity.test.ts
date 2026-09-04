/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { transpile as transpileCore } from '/Users/tonioloewald/tjs-lang/src/lang/core'

import { transpile as transpileIndex } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

const SHAPES = [
  [
    'destructured required member (the documented AJS entry shape)',
    `function agent({ apiKey: 'sk-example' }) { return { apiKey } }`,
  ],
  [
    'destructured optional member',
    `function agent({ limit = 10 }) { return { limit } }`,
  ],
  [
    'destructured mixed required + optional',
    `function agent({ query: 'q', limit = 10 }) { return { query, limit } }`,
  ],
  ['top-level required param', `function f(n: 0) { return { n } }`],
  ['top-level optional param', `function f(n = 3) { return { n } }`],
  ['no params', `function f() { return { ok: 1 } }`],
]

describe('the two transpile() entry points agree', () => {
  for (const [label, src] of SHAPES) {
    it(`${label}: same inputSchema.required`, () => {
      const a = transpileCore(src).ast?.inputSchema?.required
      const b = transpileIndex(src).ast?.inputSchema?.required
      expect({ core: a }).toEqual({ core: b })
    })
  }
  it('a missing required input is REJECTED, never filled from the example', async () => {
    const src = `function agent({ apiKey: 'sk-example' }) { return { apiKey } }`
    const vm = new AgentVM()
    for (const [name, t] of [
      ['core', transpileCore],
      ['index', transpileIndex],
    ]) {
      const out = await vm.run(t(src).ast, {}, { fuel: 200 })
      expect({ [name]: out.error !== undefined }).toEqual({ [name]: true })
      expect(out.result?.apiKey).not.toBe('sk-example')
    }
  })
  it('a supplied input still flows through both', async () => {
    const src = `function agent({ apiKey: 'sk-example' }) { return { apiKey } }`
    const vm = new AgentVM()
    for (const t of [transpileCore, transpileIndex]) {
      const out = await vm.run(t(src).ast, { apiKey: 'real' }, { fuel: 200 })
      expect(out.result).toEqual({ apiKey: 'real' })
    }
  })
})
