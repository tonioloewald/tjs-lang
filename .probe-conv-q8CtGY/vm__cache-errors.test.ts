/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

const VM = new AgentVM()

/* line 26 */
function makeStore() {
  const data = new Map()
  return {
    data,
    caps: {
      store: {
        get: async (k) => data.get(k),
        set: async (k, v) => {
          data.set(k, v)
        },
      },
    },
  }
}
makeStore.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:26',
}

const FAILING = { op: 'noSuchAtom' }

describe('cache does not persist a failed run', () => {
  it('reports the error on the retry, not a cached undefined', async () => {
    const { caps, data } = makeStore()
    const ast = {
      op: 'seq',
      steps: [
        { op: 'cache', key: 'k1', ttlMs: 60_000, steps: [FAILING] },
        { op: 'return', value: { ok: 1 } },
      ],
    }
    const first = await VM.run(
      ast,
      {},
      {
        fuel: 1e5,
        capabilities: caps,
      }
    )
    expect(first.error?.message ?? 'none').toMatch(/Unknown Atom/)
    const second = await VM.run(
      ast,
      {},
      {
        fuel: 1e5,
        capabilities: caps,
      }
    )
    expect(
      second.error?.message ?? 'the failure was served from cache as a success'
    ).toMatch(/Unknown Atom/)
    expect(data.size, 'nothing should have been written').toBe(0)
  })
  it('a SUCCESSFUL run is still cached', async () => {
    const { caps, data } = makeStore()
    const ast = {
      op: 'seq',
      steps: [
        {
          op: 'cache',
          key: 'ok',
          ttlMs: 60_000,
          steps: [{ op: 'varSet', key: 'result', value: 42 }],
        },
        { op: 'return', value: { ok: 1 } },
      ],
    }
    const r = await VM.run(ast, {}, { fuel: 1e5, capabilities: caps })
    expect(r.error?.message ?? 'ok').toBe('ok')
    expect(data.size).toBe(1)
    expect(JSON.stringify([...data.values()])).toContain('42')
  })
})

describe('memoize surfaces a failed body', () => {
  it('the error is reported rather than swallowed', async () => {
    const r = await VM.run(
      {
        op: 'seq',
        steps: [
          { op: 'memoize', key: 'm1', steps: [FAILING] },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      {},
      { fuel: 1e5 }
    )
    expect(r.error?.message ?? 'swallowed').toMatch(/Unknown Atom/)
  })
})
