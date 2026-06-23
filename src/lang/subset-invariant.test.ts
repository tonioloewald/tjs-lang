import { describe, it, expect } from 'bun:test'
import { tjs, transpile } from './index'

/**
 * Guards the language subset invariants engraved in PRINCIPLES.md:
 *
 *   AJS  ⊆  TJS            — every legal AJS source is legal TJS source
 *   JS   ⊆  TJS (no modes) — every legal JS program is legal TJS
 *
 * TJS may do MORE with the same source (enforce contracts, run signature
 * tests) but must never REJECT source the subset accepts. The classic way this
 * breaks: a build-time signature test that can't *run* (it calls an AJS atom
 * that doesn't exist at build time, etc.) gets escalated into a transpile
 * error. Such tests must be *inconclusive*, never failing.
 */
describe('Language subset invariants (PRINCIPLES.md)', () => {
  // Representative AJS-shaped sources. Each must be valid AJS (transpile to a
  // VM AST) AND valid TJS (tjs() must not throw). Several carry return types
  // and call atoms — the exact shape that used to be illegal TJS.
  const ajsSnippets: Array<[string, string]> = [
    [
      'agent returning an object (no types)',
      `function main(n: 0) {\n  return { doubled: n * 2 }\n}`,
    ],
    [
      'atom call + return type',
      `function main(url: ''): { x: '' } {\n  const x = httpFetch({ url })\n  return { x }\n}`,
    ],
    [
      'helper with a typed signature',
      `function double(x: 0): 0 {\n  return x * 2\n}\nfunction main(n: 0) {\n  const d = double(n)\n  return { d }\n}`,
    ],
    [
      'helper that calls an atom + return type',
      `function fetchIt(u: ''): '' {\n  const r = httpFetch({ url: u })\n  return r\n}\nfunction main(url: '') {\n  const x = fetchIt(url)\n  return { x }\n}`,
    ],
    [
      'consistent signature example still validates',
      `function add(a: 2, b: 3): 5 {\n  return a + b\n}\nfunction main(x: 0, y: 0) {\n  const s = add(x, y)\n  return { s }\n}`,
    ],
  ]

  describe('TJS ⊇ AJS', () => {
    for (const [label, src] of ajsSnippets) {
      it(`valid as both AJS and TJS: ${label}`, () => {
        // Valid AJS (produces a VM AST)…
        expect(() => transpile(src, { vmTarget: true })).not.toThrow()
        // …and therefore must be valid TJS (never rejected).
        expect(() => tjs(src)).not.toThrow()
      })
    }
  })

  it('un-runnable signature tests are inconclusive, not failures', () => {
    const r = tjs(
      `function main(url: ''): { x: '' } {\n  const x = httpFetch({ url })\n  return { x }\n}`
    )
    const sig = r.testResults?.find((t: any) => t.isSignatureTest)
    expect(sig).toBeDefined()
    expect(sig?.passed).toBe(false)
    expect(sig?.inconclusive).toBe(true)
  })

  it('still REJECTS a genuinely inconsistent signature example (validation intact)', () => {
    // 2 + 3 = 5, not 99 — the test runs cleanly and mismatches → hard failure.
    expect(() =>
      tjs(`function add(a: 2, b: 3): 99 {\n  return a + b\n}`)
    ).toThrow(/inconsistent/)
  })

  describe('TJS (no modes) ⊇ JS', () => {
    // Plain JavaScript under options-off TJS (TjsCompat disables all modes).
    const jsSnippets: Array<[string, string]> = [
      ['arithmetic fn', `function f(x) { return x + 1 }`],
      [
        'control flow + array methods',
        `function f(xs) {\n  let total = 0\n  for (const x of xs) { total += x }\n  return xs.map(v => v * 2).filter(v => v > total)\n}`,
      ],
      [
        'object + destructuring',
        `function f(o) {\n  const { a, b } = o\n  return { ...o, sum: a + b }\n}`,
      ],
    ]
    for (const [label, src] of jsSnippets) {
      it(`accepts plain JS: ${label}`, () => {
        expect(() => tjs(`TjsCompat\n${src}`)).not.toThrow()
      })
    }
  })
})
