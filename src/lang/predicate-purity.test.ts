/**
 * A verified predicate may not touch state outside itself.
 *
 * GUARDRAIL, and a regression pin for a defect that shipped: `verifyPredicate` checked
 * **calls** — effectful globals, unknown methods, ReDoS — and never looked at **assignments**
 * or **outer-scope references** at all. So all four of the cases below were certified
 * `safe: true`, and "verified pure" actually meant *"calls nothing effectful"*, which is a
 * far weaker claim than the badge makes.
 *
 * `redos-lint.test.ts` states the doctrine for this file and it applies here unchanged:
 *
 * > Over-flagging only costs the "verified" badge; certifying a dangerous pattern is a
 * > broken promise.
 *
 * Purity is the entire contract behind the badge. A verified predicate compiles to native JS
 * and is trusted without further checking, and `docs/type-system-north-star.md` has
 * predicates travelling to other runtimes as serialized ASTs — where "pure" is precisely what
 * makes them portable. An impure predicate does not port, and nothing said so.
 *
 * The second describe block matters as much as the first: this check must not become an
 * excuse to reject ordinary pure code. A verifier that flags everything is as useless as one
 * that flags nothing, and `src/css/` depends on real predicates keeping the badge.
 */
import { describe, it, expect } from 'bun:test'
import { verifyPredicate } from './predicate'

const verdict = (src: string) => verifyPredicate(src).safe

describe('a verified predicate cannot reach outside itself', () => {
  const IMPURE: Array<[string, string]> = [
    [
      'writes a property on globalThis',
      `function f(a) { globalThis.hit = a; return true }`,
    ],
    [
      'writes a property on window',
      `function f(a) { window.hit = a; return true }`,
    ],
    [
      'mutates an outer let',
      `let count = 0\nfunction f(a) { count += 1; return count > 0 }`,
    ],
    [
      'increments an outer let',
      `let count = 0\nfunction f(a) { count++; return true }`,
    ],
    [
      'mutates an element of an outer array',
      `const seen = []\nfunction f(a) { seen[0] = a; return true }`,
    ],
    [
      'assigns to an outer binding directly',
      `let last = null\nfunction f(a) { last = a; return true }`,
    ],
    [
      // The binding must actually be WRITTEN somewhere for the read to be
      // nondeterministic — the write here is module-level, so no other function in the
      // cluster is impure and this isolates the READ.
      'reads outer state that something else writes',
      `let count = 0\ncount = 5\nfunction f(a) { return count > 0 }`,
    ],
  ]

  for (const [label, src] of IMPURE) {
    it(`rejects: ${label}`, () => {
      expect({ [label]: verdict(src) }).toEqual({ [label]: false })
    })
  }

  it('names the offending binding, not just "unsafe"', () => {
    // A diagnostic that does not say WHICH name escaped is a diagnostic nobody can act on.
    const r = verifyPredicate(
      `let count = 0\nfunction f(a) { count += 1; return true }`
    )
    expect(r.diagnostics.map((d) => d.message).join(' ')).toContain('count')
  })
})

describe('...but ordinary pure code keeps the badge', () => {
  const PURE: Array<[string, string]> = [
    ['a trivial comparison', `function f(a) { return a > 0 }`],
    [
      'local const and arithmetic',
      `function f(a) { const b = a * 2; return b > 3 }`,
    ],
    [
      'local mutation of a local binding',
      `function f(a) { let t = a; t += 1; return t > 0 }`,
    ],
    [
      'writing a property of a LOCAL object',
      `function f(a) { const o = {}; o.x = a; return o.x === a }`,
    ],
    [
      'writing an element of a LOCAL array',
      `function f(a) { const out = []; out[0] = a; return out.length === 1 }`,
    ],
    [
      'reading a module-level const',
      `const K = 3\nfunction f(a) { return a > K }`,
    ],
    [
      'composing with another predicate',
      `function g(a) { return a > 0 }\nfunction f(a) { return g(a) }`,
    ],
    [
      'a parameter shadowing an outer name is LOCAL',
      `let count = 0\nfunction f(count) { count += 1; return count > 0 }`,
    ],
    [
      'a nested arrow’s own binding is local to it',
      `function f(a) { return [1, 2].every((n) => { let t = n; t += a; return t > 0 }) }`,
    ],
    [
      // The shape `src/css/` actually ships: a lookup table emitted as `var` and never
      // touched again. Keying mutability on the DECLARATION KEYWORD rejected all of these
      // and cost the badge to the library that is the main consumer of it. What matters is
      // whether anything writes the binding, not how it was declared.
      'a module-level `var` table that is never written',
      `var TABLE = ['a', 'b']\nfunction f(v) { return TABLE.includes(v) }`,
    ],
    [
      'a module-level `let` that is never written',
      `let LIMIT = 10\nfunction f(v) { return v < LIMIT }`,
    ],
  ]

  for (const [label, src] of PURE) {
    it(`accepts: ${label}`, () => {
      const r = verifyPredicate(src)
      expect({
        [label]: r.safe,
        why: r.diagnostics.map((d) => d.message),
      }).toEqual({
        [label]: true,
        why: [],
      })
    })
  }
})
