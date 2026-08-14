/**
 * A failed run is never cached as a success.
 *
 * `cache` and `memoize` wrote their entry unconditionally. When the body errored, `result`
 * was `undefined` and the entry was stored anyway — so the RETRY read a hit and returned
 * `undefined` with **no error at all**, for the whole TTL:
 *
 *     run 1  ->  error: Unknown Atom: noSuchAtom
 *     run 2  ->  result: { ok: 1 }          ← the failure vanished
 *     stored ->  { "_exp": 1786734601750 }  ← no `val`, and that is a "hit"
 *
 * Every VM failure mode laundered through it: fuel exhaustion, atom timeout, capability
 * denial, and the `maxHeapBytes` ceiling. For `cache` the laundered success is written to
 * the injected store with a 24h default TTL and is therefore shared across processes — so
 * one transient failure could serve `undefined` to every later caller for a day.
 *
 * `runCode` has always had the right shape (`if (ctx.error) return`) a couple of hundred
 * lines above. The two atoms that PERSIST a result did not.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'

const VM = new AgentVM()

/** An in-memory store, so the cache path is exercised end to end. */
function makeStore() {
  const data = new Map<string, unknown>()
  return {
    data,
    caps: {
      store: {
        get: async (k: string) => data.get(k),
        set: async (k: string, v: unknown) => {
          data.set(k, v)
        },
      },
    } as any,
  }
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
    } as any

    const first = await VM.run(ast, {} as any, {
      fuel: 1e5,
      capabilities: caps,
    })
    expect(first.error?.message ?? 'none').toMatch(/Unknown Atom/)

    const second = await VM.run(ast, {} as any, {
      fuel: 1e5,
      capabilities: caps,
    })
    expect(
      second.error?.message ?? 'the failure was served from cache as a success'
    ).toMatch(/Unknown Atom/)
    expect(data.size, 'nothing should have been written').toBe(0)
  })

  it('a SUCCESSFUL run is still cached', async () => {
    // The control. Refusing to write on every path would satisfy the test above and
    // silently turn the cache off.
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
    } as any
    const r = await VM.run(ast, {} as any, { fuel: 1e5, capabilities: caps })
    expect(r.error?.message ?? 'ok').toBe('ok')
    expect(data.size).toBe(1)
    expect(JSON.stringify([...data.values()])).toContain('42')
  })
})

/**
 * `memoize` carries the same guard, and it is DEFENSIVE rather than demonstrated.
 *
 * Its cache lives on the run context, and `seq` stops dispatching once `ctx.error` is set,
 * so within a single run the failing entry cannot be read back — the reuse the `cache`
 * test exhibits has no equivalent path here today. The guard is still correct and still
 * belongs: `ctx.memo` is a plain Map on a context that `runCode`, `agentRun` and any
 * future re-entrant caller can outlive, and "we currently never read it back" is a
 * property of the callers, not of this atom.
 *
 * Recorded explicitly because a test that cannot fail is worse than no test — it reads as
 * coverage. This one asserts the visible behaviour (the error surfaces) and says plainly
 * that it does not prove the guard.
 */
describe('memoize surfaces a failed body', () => {
  it('the error is reported rather than swallowed', async () => {
    const r = await VM.run(
      {
        op: 'seq',
        steps: [
          { op: 'memoize', key: 'm1', steps: [FAILING] },
          { op: 'return', value: { ok: 1 } },
        ],
      } as any,
      {} as any,
      { fuel: 1e5 }
    )
    expect(r.error?.message ?? 'swallowed').toMatch(/Unknown Atom/)
  })
})
