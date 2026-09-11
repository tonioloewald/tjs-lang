/**
 * `/# … #/` — TJS's own doc comment: multi-line, nestable, and able to quote any syntax.
 *
 * ## The problem it solves
 *
 * `/*# … *\/` is an ordinary JavaScript block comment, and JavaScript block comments do not
 * nest — so it ends at the first `*\/` inside it. A doc comment that cannot contain `*\/`
 * cannot document comment syntax, which is exactly what a language's own documentation must
 * do. Escaping works and is what this repo did; an escape you have to remember is a trap, and
 * it fails as a parse error some distance from the cause.
 *
 * ## Why claiming this syntax breaks nothing
 *
 * Single-line `/# x #/` is **valid JavaScript today** — a regex literal. Claiming it outright
 * would make legal JS illegal (`PRINCIPLES.md` invariant 1). But a regex literal cannot
 * contain a raw newline, so a span containing one is already `Unterminated regular
 * expression`. The newline requirement IS the subset-preservation argument, and the first
 * describe block below is that argument as a test rather than a claim.
 */
import { describe, it, expect } from 'bun:test'
import { parse } from 'acorn'
import { findDocCommentSpans, blankDocComments } from '../strip-comments'
import { tjs } from './index'

const spans = (src: string) => findDocCommentSpans(src)
const isValidJs = (src: string) => {
  try {
    parse(src, { ecmaVersion: 'latest' })
    return true
  } catch {
    return false
  }
}

describe('the newline rule is the subset argument', () => {
  it('a single-line /#…#/ is valid JS, so it is NOT claimed', () => {
    const src = `const re = /# comment #/`
    // The premise: this parses today.
    expect(isValidJs(src)).toBe(true)
    // Therefore we must leave it alone.
    expect(spans(src)).toEqual([])
  })

  it('a multi-line /#…#/ is already invalid JS, so it is free to claim', () => {
    const src = `/# one\n two #/\nconst a = 1`
    // The premise, measured rather than assumed: acorn rejects it as an unterminated regex.
    expect(isValidJs(src)).toBe(false)
    expect(spans(src).length).toBe(1)
  })

  it('a regex at statement start still parses and is untouched', () => {
    const src = `/#/.test(x)`
    expect(isValidJs(src)).toBe(true)
    expect(spans(src)).toEqual([])
  })
})

describe('it can quote what /*# … */ cannot', () => {
  const QUOTABLE: Array<[string, string]> = [
    ['a block comment terminator', `/# docs\nwrite */ here #/\nconst a = 1`],
    ['a block comment opener', `/# docs\nwrite /* here #/\nconst a = 1`],
    [
      'a whole legacy doc comment',
      `/# docs\nlike /*# this */ one #/\nconst a = 1`,
    ],
    ['a line comment', `/# docs\n// like this #/\nconst a = 1`],
  ]

  for (const [label, src] of QUOTABLE) {
    it(`quotes ${label} with no escaping`, () => {
      expect({ [label]: spans(src).length }).toEqual({ [label]: 1 })
    })
  }

  it('nests, because we own the delimiter', () => {
    const src = `/# outer\n  /# inner\n  #/\nstill outer #/\nconst a = 1`
    const found = spans(src)
    expect(found.length).toBe(1)
    // One span covering the whole thing — the inner close did not end the outer.
    expect(src.slice(found[0]![0], found[0]![1])).toContain('still outer')
  })
})

describe('the scan is literal-aware — the house defect class', () => {
  it('does not span from a regex into a later string', () => {
    // A raw scan matches `/#/\nconst s = "#/` and calls it a doc comment. Both lines are
    // ordinary, legal JavaScript.
    const src = `const a = /#/\nconst s = "#/"\nconst b = 2`
    expect(isValidJs(src)).toBe(true)
    expect(spans(src)).toEqual([])
  })

  it('a doc comment quoted inside a string is data', () => {
    const src = `const doc = "/# not a doc comment\\n #/"\nconst a = 1`
    expect(spans(src)).toEqual([])
  })

  it('a doc comment inside a template literal is data', () => {
    const src = 'const doc = `/# not a doc comment\n #/`\nconst a = 1'
    expect(spans(src)).toEqual([])
  })
})

describe('blanking preserves offsets and line numbers', () => {
  it('replaces the span with spaces, keeping newlines', () => {
    const src = `/# doc\n more #/\nconst a = 1`
    const out = blankDocComments(src)
    expect(out.length).toBe(src.length)
    expect(out.split('\n').length).toBe(src.split('\n').length)
    expect(out.trim()).toBe('const a = 1')
  })

  it('what remains parses as JavaScript', () => {
    // The point of blanking rather than deleting: every later pass reports positions that
    // still point at the right column of the right line.
    const src = `/# doc\n more #/\nconst a = 1\n/# second\n doc #/\nconst b = 2`
    expect(isValidJs(blankDocComments(src))).toBe(true)
  })

  it('leaves a single-line regex alone (control)', () => {
    const src = `const re = /# x #/\nconst a = 1`
    expect(blankDocComments(src)).toBe(src)
  })
})

describe('a doc comment is INERT — no downstream pass sees into it', () => {
  // The structural payoff, and the reason blanking happens at the first point any pass
  // touches the source rather than inside `preprocess`. A doc comment exists to QUOTE syntax,
  // so it is the single place in a file most likely to contain the constructs every scanner
  // is hunting for. Blanking it up front makes the ~30 downstream passes unable to see into
  // it at all — a structural fix for this project's dominant defect class, rather than one
  // more scanner that has to remember.
  //
  // Found by this test: `transpileToJS` calls `extractTests` on RAW source, BEFORE
  // `preprocess` runs, so a `test '…' { … }` written inside a doc comment was extracted and
  // executed. Blanking in `preprocess` alone was too late.
  const QUOTING = [
    "Use a test block: test 'adds' { expect(1).toBe(1) }",
    'Mark legacy code: unsafe new Date(x)',
    'Declare a type: Type Age 0',
    'Compile natively: wasm function dot(a: Float32Array, n: i32): f64 { }',
    'Compare deeply: a Is b',
  ]

  const source = `/# ## Documenting TJS\n${QUOTING.join(
    '\n'
  )}\n#/\nfunction f(a: 0): 0 { return a }`

  it('no test block is extracted from inside it', () => {
    const r = tjs(source, { filename: 'a.tjs', runTests: 'report' }) as any
    // The signature test for `f` is legitimate and expected; nothing else should appear.
    const fromDoc = (r.testResults ?? []).filter(
      (t: any) =>
        !t.isSignatureTest && !String(t.description).includes('signature')
    )
    expect(fromDoc).toEqual([])
  })

  it('no warning is raised by the constructs it quotes', () => {
    const r = tjs(source, { filename: 'a.tjs', runTests: false }) as any
    expect(r.warnings ?? []).toEqual([])
  })

  it('and the code around it still compiles and runs', () => {
    const r = tjs(source, { filename: 'a.tjs', runTests: false })
    const f = new Function(`${r.code}\nreturn f`)() as any
    expect(f(7)).toBe(7)
  })

  it('under dialect js it is left alone — there it is a regex', () => {
    // PRINCIPLES.md invariant 1: plain-JS semantics must be preserved, and in plain JS
    // `/#…#/` is a regex literal. Blanking it there would make legal JavaScript illegal.
    const js = `const re = /# x #/\nexport const a = 1`
    expect(tjs(js, { dialect: 'js', runTests: false }).code).toContain(
      '/# x #/'
    )
  })
})
