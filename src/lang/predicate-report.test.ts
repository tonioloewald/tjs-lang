/**
 * The `tjs()` result surfaces per-`Type`/`Generic` predicate verification status
 * (`result.predicates`) so tools can flag unverifiable predicates, and mirrors
 * the unverified ones into `result.warnings`. (#9 / the #5 warn-on-fallback tail.)
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

describe('predicate verification is reported on the transpile result', () => {
  it('a safe Type predicate → verified, no warning', () => {
    const r = tjs("Type Pos 'positive' { predicate(x) { return x > 0 } }")
    expect(r.predicates).toEqual([
      { name: 'Pos', kind: 'Type', verified: true },
    ])
    expect(r.warnings).toBeUndefined()
  })

  it('an unverifiable Type predicate → not verified + reason + warning', () => {
    const r = tjs(
      "Type Bad 'bad' { predicate(xs) { for (const x of xs) { if (x<0) return false } return true } }"
    )
    const p = r.predicates?.[0]
    expect(p).toMatchObject({ name: 'Bad', kind: 'Type', verified: false })
    expect(p?.reason).toMatch(/loop/i)
    expect(p?.reason).not.toContain('__pred_') // internal name not leaked
    expect(r.warnings?.some((w) => /Bad.*not verifiable/.test(w))).toBe(true)
  })

  it('reports Generic predicates too', () => {
    const r = tjs(
      "Generic Box<T> { description: 'b', predicate(x, T) { return T(x.value) } }"
    )
    expect(r.predicates?.[0]).toMatchObject({
      name: 'Box',
      kind: 'Generic',
      verified: true,
    })
  })

  it('reports each predicate in a multi-predicate module', () => {
    const r = tjs(
      "Type A 'a' { predicate(x) { return x > 0 } }\n" +
        "Type B 'b' { predicate(xs) { for (const x of xs) {} return true } }"
    )
    const byName = Object.fromEntries(
      (r.predicates ?? []).map((p) => [p.name, p.verified])
    )
    expect(byName).toEqual({ A: true, B: false })
  })

  it('omits `predicates` when there are none', () => {
    expect(tjs('function f() { return 1 }').predicates).toBeUndefined()
  })
})
