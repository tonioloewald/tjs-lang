/**
 * The demo model's daily cap — the part that bounds spend.
 *
 * `functions/` had no test lane at all, which is a poor place for that gap: a quota is a
 * budget control, and it now sits in code that ships to a public endpoint. The counting is
 * also the part that is genuinely testable without a network, a model, or a key — the fetch
 * around it is thin.
 *
 * Firestore is stood in for with an in-memory fake. That is enough because `claimQuota`'s
 * contract is small and stated: read both counters inside one transaction, refuse when either
 * is spent, otherwise increment both. What the fake CANNOT prove is that the transaction is
 * genuinely atomic under contention — that is Firestore's job, and the reason the code uses
 * `runTransaction` and `FieldValue.increment` rather than read-then-write.
 */
import { describe, it, expect } from 'bun:test'
// The SOURCE, not the built artifact. Importing `./demo-llm.js` would test whatever was last
// transpiled — and a stale build is exactly the hazard that let an EMPTY module ship, because
// the transpile step used to fail silently. `bunfig.toml` preloads the .tjs plugin, so this is
// the same code the build consumes.
import { claimQuota } from './demo-llm.tjs'

/** Enough Firestore surface for `claimQuota`, and no more. */
function fakeDb(seed: Record<string, { count: number }> = {}) {
  const store: Record<string, any> = { ...seed }
  const ref = (path: string) => ({ path })
  return {
    collection: (c: string) => ({
      doc: (d: string) => ({
        path: `${c}/${d}`,
        collection: (c2: string) => ({
          doc: (d2: string) => ref(`${c}/${d}/${c2}/${d2}`),
        }),
      }),
    }),
    async runTransaction(fn: (tx: any) => Promise<any>) {
      return fn({
        get: async (r: { path: string }) => ({
          exists: r.path in store,
          data: () => store[r.path],
        }),
        // `FieldValue.increment(1)` is opaque here, so the fake applies the increment the
        // real one would. The test is about the DECISION, not Firestore's arithmetic.
        set: (r: { path: string }, v: any) => {
          const current = store[r.path]?.count ?? 0
          store[r.path] = { ...store[r.path], ...v, count: current + 1 }
        },
      })
    },
    _store: store,
  }
}

const NOW = Date.parse('2026-08-30T12:00:00Z')
const LIMITS = { perUser: 3, global: 10 }

describe('the per-user daily cap', () => {
  it('allows a call and reports what is left', async () => {
    const db = fakeDb()
    expect(await claimQuota(db, 'u1', NOW, LIMITS)).toEqual({
      ok: true,
      used: 1,
      remaining: 2,
    })
  })

  it('refuses the call past the limit, naming the reason', async () => {
    const db = fakeDb()
    for (let i = 0; i < 3; i++) await claimQuota(db, 'u1', NOW, LIMITS)
    const over = await claimQuota(db, 'u1', NOW, LIMITS)
    expect(over.ok).toBe(false)
    // The reason is load-bearing: "you have used your calls" and "the demo is busy today"
    // are different messages and only one is the visitor's fault.
    expect(over.reason).toBe('per-user')
    expect(over.remaining).toBe(0)
  })

  it('counts each user separately', async () => {
    const db = fakeDb()
    for (let i = 0; i < 3; i++) await claimQuota(db, 'u1', NOW, LIMITS)
    expect((await claimQuota(db, 'u2', NOW, LIMITS)).ok).toBe(true)
  })

  it('resets on the UTC day boundary', async () => {
    // UTC so the reset is the same instant for everyone. `now` is a parameter precisely so
    // this is testable without freezing a clock.
    const db = fakeDb()
    for (let i = 0; i < 3; i++) await claimQuota(db, 'u1', NOW, LIMITS)
    const tomorrow = Date.parse('2026-08-31T00:00:01Z')
    expect((await claimQuota(db, 'u1', tomorrow, LIMITS)).ok).toBe(true)
  })
})

describe('the global daily ceiling', () => {
  it('refuses once spent, even for a user with allowance left', async () => {
    // This is the cap that actually bounds the bill. Accounts are free to create, so
    // `perUser × unlimited users` is not a budget.
    const db = fakeDb({ 'demoUsage/2026-08-30': { count: 10 } })
    const res = await claimQuota(db, 'fresh-user', NOW, LIMITS)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('global')
    // Still reports the user's OWN remaining allowance — they have not spent anything.
    expect(res.remaining).toBe(3)
  })

  it('is not tripped below the ceiling (control)', async () => {
    // Without this, a global check that always refused would pass the assertion above.
    const db = fakeDb({ 'demoUsage/2026-08-30': { count: 9 } })
    expect((await claimQuota(db, 'fresh-user', NOW, LIMITS)).ok).toBe(true)
  })

  it('counts every user against the same day counter', async () => {
    const db = fakeDb()
    await claimQuota(db, 'a', NOW, LIMITS)
    await claimQuota(db, 'b', NOW, LIMITS)
    expect(db._store['demoUsage/2026-08-30'].count).toBe(2)
  })
})
