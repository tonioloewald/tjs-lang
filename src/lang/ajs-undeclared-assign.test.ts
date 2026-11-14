/**
 * AJS refuses an assignment to an undeclared name, as it refuses a read of one (#4103).
 *
 * #4002 made a READ of an undeclared name a transpile error, but an assignment still declared the
 * name silently: `let total = 0; totl = 5` returned `{ total: 0, totl: 5 }`, so a misspelt target
 * left the real variable unchanged, a silent wrong answer of the same class #4002 closed. Decided
 * 2026-11-14 (Tonio): refuse it.
 *
 * Guarded both ways: assignment to a declared name (in this scope or an outer one, a parameter,
 * a loop variable, a hoisted var, a host-provided global) still compiles.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './core'
import { Eval } from './eval'

describe('an assignment to an undeclared name is refused', () => {
  const rows: [string, string][] = [
    [
      'a misspelt target',
      `function f({}) { let total = 0\n totl = 5\n return { total } }`,
    ],
    ['a compound assignment', `function f({}) { n += 1\n return {} }`],
    [
      'inside a block',
      `function f({ ok = true }) { if (ok) { y = 2 }\n return {} }`,
    ],
    [
      'inside a loop',
      `function f({ xs = [1] }) { for (const x of xs) { acc = x }\n return {} }`,
    ],
    [
      'in a helper',
      `function h(x) { z = x\n return x }\nfunction f({}) { let r = h(1)\n return { r } }`,
    ],
  ]
  for (const [what, src] of rows)
    it(what, () => {
      expect(() => transpile(src)).toThrow(/is not (declared|defined).*let/)
    })
})

describe('assignment to a declared name still compiles (the other direction)', () => {
  const rows: [string, string][] = [
    [
      'a let in the same scope',
      `function f({}) { let a = 1\n a = 2\n return { a } }`,
    ],
    [
      'an outer let from inside a block',
      `function f({ ok = true }) { let a = 1\n if (ok) { a = 2 }\n return { a } }`,
    ],
    [
      'an outer let from inside a loop',
      `function f({ xs = [1, 2] }) { let t = 0\n for (const x of xs) { t += x }\n return { t } }`,
    ],
    ['a parameter', `function f({ n = 1 }) { n = n + 1\n return { n } }`],
    ['a hoisted var', `function f({}) { v = 1\n var v\n return { v } }`],
    [
      'the catch binding',
      `function f({}) { try { Error('x') } catch (e) { e = 'y'\n return { e } }\n return {} }`,
    ],
  ]
  for (const [what, src] of rows)
    it(what, () => {
      expect(() => transpile(src)).not.toThrow()
    })

  it("Eval's context keys can be assigned", async () => {
    const r = await Eval({ code: 'n = n + 1\nreturn n', context: { n: 1 } })
    expect(r.error).toBeUndefined()
    expect(r.result).toBe(2)
  })
})

describe('a top-level statement is refused where it is written (#4103)', () => {
  it('a top-level const, which no function could read', () => {
    expect(() =>
      transpile(`const RATE = 2\nfunction f({}) { return { r: 1 } }`)
    ).toThrow(/top-level variable is never run/)
  })
  it('a top-level call, which never ran', () => {
    expect(() =>
      transpile(`console.log('hi')\nfunction f({}) { return {} }`)
    ).toThrow(/top-level statement is never run/)
  })
  it('a directive and a stray semicolon are fine', () => {
    expect(() =>
      transpile(
        `'use strict'\nfunction h(x) { return x };\nfunction f({}) { return {} }`
      )
    ).not.toThrow()
  })
})
