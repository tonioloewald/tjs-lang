/**
 * The keystone, end to end: a canonical verified predicate as *pushdown payload*
 * and *cache key* at the same time.
 *
 * This is the payoff for canonicalization. One object, produced once at author time,
 * is simultaneously:
 *   - the filter the store evaluates at the data (rows never cross the wire),
 *   - the cache key that identifies that query (stable across reformatting),
 *   - safe to ship, because it was verified pure before it was given an identity.
 *
 * The architectural constraint worth preserving: **the VM never parses the predicate.**
 * It forwards it as data. That's what keeps the acorn-dependent canonicalizer out of the
 * lean `tjs-lang/vm` bundle, and it's why the same payload works for a remote store.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from '../vm'
import { canonicalizePredicate } from '../lang/predicate-canonical'

const VM = new AgentVM()

const ADULT = `function isAdult(p) { return p.age >= 18 }`
const ROWS = [
  { name: 'ada', age: 36 },
  { name: 'kid', age: 9 },
  { name: 'bob', age: 18 },
]

/** A store that understands predicates, with a cache keyed on the canonical key. */
function makeStore() {
  const cache = new Map<string, any[]>()
  const stats = { evaluated: 0, cacheHits: 0, rowsScanned: 0 }
  return {
    stats,
    cache,
    get: async () => undefined,
    set: async () => {},
    queryPredicate: async ({ predicate }: any) => {
      if (cache.has(predicate.key)) {
        stats.cacheHits++
        return cache.get(predicate.key)!
      }
      stats.evaluated++
      // A real store compiles/translates the canonical AST to its query language.
      // Here we just honor the one predicate we know, to keep the test about the
      // plumbing rather than about reimplementing a query planner.
      stats.rowsScanned += ROWS.length
      const out = ROWS.filter((r) => r.age >= 18)
      cache.set(predicate.key, out)
      return out
    },
  }
}

const agent = (predicate: unknown) => ({
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
})

describe('predicate pushdown: canonical predicate as payload AND cache key', () => {
  it('pushes the predicate to the store and returns filtered rows', async () => {
    const store = makeStore()
    const pred = canonicalizePredicate(ADULT)
    const res = await VM.run(
      agent(pred) as any,
      {},
      { capabilities: { store } }
    )

    expect(res.error).toBeUndefined()
    expect(res.result.rows.map((r: any) => r.name)).toEqual(['ada', 'bob'])
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

    await VM.run(agent(a) as any, {}, { capabilities: { store } })
    await VM.run(agent(b) as any, {}, { capabilities: { store } })

    // Without canonicalization the second run would miss and rescan — every
    // reformat would bust the cache. This is the concrete payoff.
    expect(store.stats.evaluated).toBe(1)
    expect(store.stats.cacheHits).toBe(1)
  })

  it('a semantically DIFFERENT predicate does not collide', async () => {
    const store = makeStore()
    await VM.run(
      agent(canonicalizePredicate(ADULT)) as any,
      {},
      {
        capabilities: { store },
      }
    )
    await VM.run(
      agent(
        canonicalizePredicate(`function isAdult(p) { return p.age >= 21 }`)
      ) as any,
      {},
      { capabilities: { store } }
    )
    // Two evaluations, no cache hit — a cache that collided here would serve the
    // wrong rows, which for an auth predicate is a data-exposure bug.
    expect(store.stats.evaluated).toBe(2)
    expect(store.stats.cacheHits).toBe(0)
  })

  it('fails loudly on a store that cannot evaluate predicates', async () => {
    // Degrading to an unfiltered read would silently return rows the caller meant
    // to exclude. Better to refuse and point at storeQuery + filter.
    const plain = { get: async () => undefined, set: async () => {} }
    const res = await VM.run(
      agent(canonicalizePredicate(ADULT)) as any,
      {},
      { capabilities: { store: plain } }
    )
    expect(res.error?.message).toMatch(/queryPredicate' missing/)
  })

  it('rejects anything that is not a canonical verified predicate', async () => {
    // Raw source is NOT acceptable: it hasn't been verified pure, so it has no
    // business being treated as an identity or shipped to a store.
    const res = await VM.run(
      agent(ADULT) as any,
      {},
      {
        capabilities: { store: makeStore() },
      }
    )
    expect(res.error?.message).toMatch(/canonical verified predicate/)
  })
})
