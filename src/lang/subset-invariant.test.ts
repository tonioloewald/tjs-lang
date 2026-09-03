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
        expect(() => transpile(src)).not.toThrow()
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
      // Two ordinary local helpers that happen to share a name. The polymorphic merge
      // grouped by NAME across the whole file, with no notion of scope, so this was rejected
      // as "variants 1 and 2 have ambiguous signatures" — legal JavaScript that TJS refused.
      //
      // Five of the thirteen known compat-corpus failures were this, all filed under the
      // wrong cause because the error described the merge's internal state rather than the
      // merge being wrong to have formed a group at all.
      //
      // This corpus did not catch it because it was three snippets. That is the real lesson:
      // "JS ⊆ TJS" cannot be spot-checked, and a guard this cheap should be fed every
      // ordinary shape somebody thinks of. The rows below are the adjacent ones.
      [
        'same-named locals in sibling scopes',
        `function a() { function f(x) { return x } return f(1) }\nfunction b() { function f(x) { return x } return f(2) }`,
      ],
      [
        'a local shadowing a top-level function',
        `function f(x) { return x }\nfunction g() { function f(y) { return y * 2 } return f(2) }`,
      ],
      [
        'a name reused as function, let and const in different scopes',
        `function a() { function n() { return 1 } return n() }\nfunction b() { let n = 2; return n }\nfunction c() { const n = 3; return n }`,
      ],
      [
        'same-named helpers nested two levels deep',
        `function a() { function m() { function h() { return 1 } return h() } return m() }\nfunction b() { function m() { function h() { return 2 } return h() } return m() }`,
      ],
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

  /**
   * The language's own keywords must not steal identifiers from JavaScript.
   *
   * `unsafe` and the `Legacy*` bridges are ordinary-looking words, and JS programs are
   * entitled to use them as names — `opts.unsafe` is a plausible option flag. Every one of
   * these shipped BROKEN in 0.13.0-beta.1: the `unsafe` marker scanner matched after a `.`
   * and could not tell an identifier followed by a word-shaped infix operator from the
   * marker, so all three threw `SyntaxError` and did so in `dialect: 'js'` too, where
   * there is no escape hatch to reach for.
   *
   * Both spellings are checked deliberately: `dialect: 'js'` is the programmatic promise,
   * and a `.tjs` file must ALSO accept these, because they are legal JavaScript and TJS is
   * a superset — the marker is a new meaning for a NEW syntactic position, not a reserved
   * word.
   */
  describe('TJS ⊇ JS — language keywords do not steal identifiers', () => {
    const identifierSnippets: Array<[string, string]> = [
      [
        'unsafe as a member, then infix',
        `const o = {}\nconst r = o.unsafe instanceof Function`,
      ],
      [
        'unsafe as an optional member',
        `const o = {}\nconst r = o?.unsafe instanceof Function`,
      ],
      [
        'unsafe as a variable, then instanceof',
        `let unsafe = Date\nconst r = unsafe instanceof Function`,
      ],
      [
        'unsafe as a variable, then in',
        `let unsafe = 'a'\nconst r = unsafe in { a: 1 }`,
      ],
      [
        'unsafe as a for-of binding',
        `let unsafe\nfor (unsafe of [1, 2]) { console.log(unsafe) }`,
      ],
      ['unsafe as an option flag', `function f(o) { return o.unsafe ? 1 : 2 }`],
      [
        'unsafe as a declared function',
        `function unsafe(x) { return x }\nconst r = unsafe(1)`,
      ],
    ]
    for (const [label, src] of identifierSnippets) {
      for (const dialect of ['js', 'tjs'] as const) {
        it(`accepts legal JS (dialect: '${dialect}'): ${label}`, () => {
          expect(() => tjs(src, { dialect, runTests: false })).not.toThrow()
        })
      }
    }
  })
})
