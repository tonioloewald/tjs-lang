/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { canonicalizePredicate } from '/Users/tonioloewald/tjs-lang/src/lang/predicate-canonical'

const VM = new AgentVM()

const ADULT = `function isAdult(p) { return p.age >= 18 }`

const ROWS = [
  { name: 'ada', age: 36 },
  { name: 'kid', age: 9 },
  { name: 'bob', age: 18 },
]

/* line 29 */
function makeStore() {
  const cache = new Map()
  const stats = { evaluated: 0, cacheHits: 0, rowsScanned: 0 }
  return {
    stats,
    cache,
    get: async () => undefined,
    set: async () => {},
    queryPredicate: async ({ predicate }) => {
      if (cache.has(predicate.key)) {
        stats.cacheHits++
        return cache.get(predicate.key)
      }
      stats.evaluated++

      stats.rowsScanned += ROWS.length
      const out = ROWS.filter((r) => r.age >= 18)
      cache.set(predicate.key, out)
      return out
    },
  }
}
makeStore.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:29',
}

/* line 54 */
function agent(predicate) {
  return {
    op: 'seq',
    steps: [
      {
        op: 'storeQueryWhere',
        collection: 'users',
        predicate,
        result: 'rows',
      },
      { op: 'return', value: { rows: { $expr: 'ident', name: 'rows' } } },
    ],
  }
}
agent.__tjs = {
  params: {
    predicate: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:54',
}

describe('predicate pushdown: canonical predicate as payload AND cache key', () => {
  it('pushes the predicate to the store and returns filtered rows', async () => {
    const store = makeStore()
    const pred = canonicalizePredicate(ADULT)
    const res = await VM.run(agent(pred), {}, { capabilities: { store } })
    expect(res.error).toBeUndefined()
    expect(res.result.rows.map((r) => r.name)).toEqual(['ada', 'bob'])
    expect(store.stats.evaluated).toBe(1)
  })
  it('a REFORMATTED predicate hits the same cache entry', async () => {
    const store = makeStore()
    const a = canonicalizePredicate(ADULT)
    const b = canonicalizePredicate(`
      // same rule, different spelling and parameter name
      function isAdult( person )   {
        return person.age  >=  18
      }`)
    await VM.run(agent(a), {}, { capabilities: { store } })
    await VM.run(agent(b), {}, { capabilities: { store } })

    expect(store.stats.evaluated).toBe(1)
    expect(store.stats.cacheHits).toBe(1)
  })
  it('a semantically DIFFERENT predicate does not collide', async () => {
    const store = makeStore()
    await VM.run(
      agent(canonicalizePredicate(ADULT)),
      {},
      {
        capabilities: { store },
      }
    )
    await VM.run(
      agent(
        canonicalizePredicate(`function isAdult(p) { return p.age >= 21 }`)
      ),
      {},
      { capabilities: { store } }
    )

    expect(store.stats.evaluated).toBe(2)
    expect(store.stats.cacheHits).toBe(0)
  })
  it('fails loudly on a store that cannot evaluate predicates', async () => {
    const plain = { get: async () => undefined, set: async () => {} }
    const res = await VM.run(
      agent(canonicalizePredicate(ADULT)),
      {},
      { capabilities: { store: plain } }
    )
    expect(res.error?.message).toMatch(/queryPredicate' missing/)
  })
  it('rejects anything that is not a canonical verified predicate', async () => {
    const res = await VM.run(
      agent(ADULT),
      {},
      {
        capabilities: { store: makeStore() },
      }
    )
    expect(res.error?.message).toMatch(/canonical verified predicate/)
  })
})
