/**
 * Regexes in predicates: the promise is that a CERTIFIED predicate cannot hang, whatever the
 * pattern and whatever the input.
 *
 * It used to be kept by recognising dangerous shapes: a match on the host's backtracking engine is
 * opaque to the fuel counter, so the verifier refused the exponential star-height class
 * (`(a+)+`, `(a*)*`, …). Recognition is never complete — `/a*a*c/` is polynomial, passed the
 * screen, and took seconds on a few thousand characters inside a `$predicate` that travels as data
 * (rc.2 eighth re-review M5). Now the promise is kept by construction:
 *
 *   - `compilePredicate` lowers every regex literal onto the VM's LINEAR engine, its work charged
 *     to the predicate's fuel. ReDoS shapes are ordinary, metered work; the verifier refuses only
 *     what that engine refuses (backreferences, lookaround, `\p{…}`).
 *   - `emitVerifiedPredicate` produces self-contained output that cannot carry the engine, so a
 *     native match there would be unbounded: a cluster with a regex literal is NOT certified for
 *     emission (it still runs, as unverified code).
 *
 * Don't "fix" a red row here by editing the expectation — see CLAUDE.md "Guardrail Tests".
 */
import { describe, it, expect } from 'bun:test'
import {
  verifyPredicate,
  emitVerifiedPredicate,
  compilePredicate,
  PredicateFuelExhausted,
} from './predicate'
import { preprocess } from './parser'

/** Verify a single predicate whose body uses the given regex literal. */
const verifyRe = (re: string) =>
  verifyPredicate(`function p(s) { return ${re}.test(s) }`)

const SHAPES: Array<[string, string]> = [
  ['nested +', '/(a+)+$/'],
  ['nested *', '/(a*)*b/'],
  ['plus-in-star', '/([a-z]+)*!/'],
  ['dot-star star', '/(.*)*!/'],
  ['digit nest', '/(\\d+)+x/'],
  ['unbounded brace nest', '/(a{2,})+$/'],
  ['doubly nested group', '/((a+))+$/'],
  ['polynomial (the shape star-height missed)', '/a*a*c/'],
  ['polynomial, three runs', '/\\d+\\d+\\d+x/'],
]

describe('backtracking shapes are certified, because they run on the linear engine', () => {
  for (const [label, re] of SHAPES)
    it(`${label}: ${re} — certified, and bounded on hostile input`, () => {
      expect(verifyRe(re)).toMatchObject({ safe: true, diagnostics: [] })
      const { p } = compilePredicate(`function p(s) { return ${re}.test(s) }`, [
        'p',
      ])
      const hostile = 'a'.repeat(6000) + '1'.repeat(3000) + '!'
      const t = performance.now()
      let outcome: unknown
      try {
        outcome = p(hostile)
      } catch (e) {
        outcome = e
      }
      // either an answer or the budget's refusal — never a hang
      expect(
        typeof outcome === 'boolean' ||
          outcome instanceof PredicateFuelExhausted
      ).toBe(true)
      expect(performance.now() - t).toBeLessThan(2000)
    })

  it('a tiny budget stops a regex mid-match', () => {
    const { p } = compilePredicate(
      'function p(s) { return /a*a*c/.test(s) }',
      ['p'],
      { fuel: 50 }
    )
    expect(() => p('a'.repeat(5000))).toThrow(PredicateFuelExhausted)
  })
})

describe('what the linear engine refuses is not certified', () => {
  for (const [label, re] of [
    ['backreference', '/(a)\\1/'],
    ['lookahead', '/a(?=b)/'],
    ['lookbehind', '/(?<=a)b/'],
    ['property escape', '/\\p{L}/u'],
  ] as const)
    it(`${label}: ${re}`, () => {
      const r = verifyRe(re)
      expect(r.safe).toBe(false)
      expect(
        r.diagnostics.some((d) =>
          /not supported by the linear regex engine/.test(d.message)
        )
      ).toBe(true)
    })
})

describe('ordinary patterns verify and match as JavaScript does', () => {
  const rows: Array<[string, string, string[]]> = [
    ['char class +', '/[a-z]+/', ['abc', '123', '']],
    ['bounded braces', '/\\d{3}-\\d{4}/', ['555-1234', '55-1234']],
    ['alternation repeated', '/(foo|bar)+/', ['foobar', 'baz']],
    ['anchored hex, i', '/^#[0-9a-f]{6}$/i', ['#A0b1C2', '#a0b1c', 'x#a0b1c2']],
    ['single star', '/foo.*bar/', ['foo--bar', 'foo\nbar']],
  ]
  for (const [label, re, inputs] of rows)
    it(`${label}: ${re}`, () => {
      expect(verifyRe(re)).toMatchObject({ safe: true, diagnostics: [] })
      const { p } = compilePredicate(`function p(s) { return ${re}.test(s) }`, [
        'p',
      ])
      const native = new Function(`return ${re}`)() as RegExp
      for (const s of inputs) expect(p(s)).toBe(native.test(s))
    })

  it('string methods taking the regex dispatch into the linear engine', () => {
    const src = `function p(s) {
      return [s.match(/(\\d+)-(\\d+)/), s.replace(/\\d/g, 'n'), s.split(/-/), s.search(/-/),
        s.replace(/(\\d)/g, (m, d) => d + d), [...s.matchAll(/\\d+/g)].length]
    }`
    const { p } = compilePredicate(src, ['p'])
    const native = new Function(`${src}; return p`)()
    expect(JSON.stringify(p('12-345'))).toBe(JSON.stringify(native('12-345')))
  })
})

describe('emitted guards cannot carry the engine, so a regex is not certified there', () => {
  it('emitVerifiedPredicate refuses any regex literal (no code)', () => {
    for (const re of ['/(a+)+$/', '/^#[0-9a-f]{6}$/']) {
      const r = emitVerifiedPredicate(
        `function p(s) { return ${re}.test(s) }`,
        'p'
      )
      expect(r.safe).toBe(false)
      expect(r.code).toBeUndefined()
      expect(r.diagnostics[0].message).toMatch(
        /cannot be verified in an emitted guard/
      )
    }
  })

  it('a Type predicate with a regex falls back (no verified guard)', () => {
    const out = preprocess(
      `Type Hex 'hex' { predicate(s) { return /^#[0-9a-f]{6}$/.test(s) } }`
    ).source
    expect(out).not.toContain('__fuel') // not certified → raw fallback
    expect(out).toContain('[0-9a-f]{6}') // raw body preserved
  })

  it('a Type predicate without a regex still compiles to a verified guard', () => {
    const out = preprocess(
      `Type Short 'ab' { predicate(s) { return s.length < 5 } }`
    ).source
    expect(out).toContain('__fuel')
  })
})

describe('round 5 (rc.2 ninth re-review)', () => {
  it('M1: an empty `u` match over astral input advances by a code point, as JavaScript does', () => {
    const src = `function p(s) {
      return [s.replace(/(?:)/gu, (m) => '-'), [...s.matchAll(/(?:)/gu)].length, s.replace(/(?:)/gu, '-')]
    }`
    const { p } = compilePredicate(src, ['p'])
    const native = new Function(`${src}; return p`)()
    for (const s of ['😀', 'a😀b', ''])
      expect(JSON.stringify(p(s))).toBe(JSON.stringify(native(s)))
  })

  it('m3: a sticky, non-global regex honours and updates lastIndex', () => {
    const src = `function p(s) {
      const a = /a/y
      a.lastIndex = 1
      const r1 = s.replace(a, 'x')
      const b = /a/y
      b.lastIndex = 1
      const m = s.match(b)
      return [r1, a.lastIndex, m && m.index, b.lastIndex, s.search(/a/y)]
    }`
    const { p } = compilePredicate(src, ['p'])
    const native = new Function(`${src}; return p`)()
    for (const s of ['ba', 'ab', 'bb'])
      expect(JSON.stringify(p(s))).toBe(JSON.stringify(native(s)))
  })

  it('matchAll starts at lastIndex and leaves it unchanged (tenth re-review)', () => {
    const src = `function p(s) { const r = /a/g; r.lastIndex = 2; const out = [...s.matchAll(r)].map((m) => m.index); return [out, r.lastIndex] }`
    const { p } = compilePredicate(src, ['p'])
    const native = new Function(`${src}; return p`)()
    for (const s of ['aaaa', 'a', ''])
      expect(JSON.stringify(p(s))).toBe(JSON.stringify(native(s)))
  })

  it('m2: the names the compiled form injects are reserved', () => {
    for (const src of [
      'function p(s) { const __rx = () => /x/; return __rx().test(s) }',
      'function p(s) { const __fuel = () => 0; return __fuel() === 0 }',
    ])
      expect(
        verifyPredicate(src).diagnostics.some((d) => /reserved/.test(d.message))
      ).toBe(true)
  })

  it('M2: verification has a per-source compile budget', () => {
    const lits = Array.from(
      { length: 100 },
      () => '/(?:(?:){10000}){99}/.test(s)'
    ).join(' || ')
    const t = performance.now()
    const r = verifyPredicate(`function p(s) { return ${lits} }`)
    expect(r.safe).toBe(false)
    expect(performance.now() - t).toBeLessThan(500)
  })
})
