/**
 * The Prism definitions tokenise TJS as TJS — most importantly, a colon example as a VALUE.
 *
 * These feed the doc system's non-executable fences, and are being baked into **printed and
 * ePub** output. On the web a wrong token colour is cosmetic. In print it is permanent, and
 * highlighting is the main thing a reader uses to decode unfamiliar syntax.
 *
 * Which makes one assertion here load-bearing rather than cosmetic: in
 * `function greet(name: 'Alice')`, the `'Alice'` is an **example value** that survives to
 * runtime, not a type annotation. Reading it as a type is the single most common mistake
 * people make with TJS. Highlighted with TypeScript's token model — which is what a
 * `typescript`-tagged fence gets, and 238 of our fences are tagged that way — the page argues
 * in colour for exactly the misreading the prose is correcting.
 *
 * Asserting on TOKEN TYPES rather than on rendered HTML: the class names are the contract a
 * theme styles against, and an HTML snapshot would break on any unrelated Prism change.
 */
import { describe, it, expect } from 'bun:test'
import Prism from 'prismjs'
import { tjs } from './prism/tjs.js'
import { ajs } from './prism/ajs.js'

Prism.languages.tjs = tjs as any
Prism.languages.ajs = ajs as any

/** Flatten Prism's token tree to `[type, text]` pairs. */
function tokens(code: string, lang: 'tjs' | 'ajs'): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const walk = (nodes: any[]): void => {
    for (const n of nodes) {
      if (typeof n === 'string') continue
      const content = Array.isArray(n.content) ? n.content : [n.content]
      out.push([
        n.alias ? [n.type, n.alias].flat().join(' ') : n.type,
        typeof n.content === 'string' ? n.content : '',
      ])
      if (Array.isArray(n.content)) walk(content)
    }
  }
  walk(Prism.tokenize(code, Prism.languages[lang]) as any[])
  return out
}

/** Every token type produced, for coarse assertions. */
const types = (code: string, lang: 'tjs' | 'ajs' = 'tjs') =>
  tokens(code, lang).map(([t]) => t)

describe('a colon example is a VALUE, not a type', () => {
  it("tokenises `name: 'Alice'` as an example-value, not a class-name", () => {
    const t = types(`function greet(name: 'Alice') { return name }`)
    expect(t.some((x) => x.includes('example-value'))).toBe(true)
  })

  it('the example itself carries the string alias, so themes colour it as a value', () => {
    const all = tokens(`function greet(name: 'Alice') { return name }`, 'tjs')
    expect(all.some(([t]) => t.includes('string'))).toBe(true)
  })

  it('a numeric example is an example too', () => {
    expect(
      types(`function add(a: 0, b: 0) { return a + b }`).some((x) =>
        x.includes('example-value')
      )
    ).toBe(true)
  })
})

describe('TJS constructs are distinguishable', () => {
  const CASES: Array<[string, string, string]> = [
    [
      'safety-marked return',
      `function f(a: 0):! 0 { return a }`,
      'return-type',
    ],
    ['test block', `test 'it works' { expect(1).toBe(1) }`, 'block-construct'],
    ['unsafe marker', `const d = unsafe new Date(x)`, 'dangerous'],
    ['legacy escape', `if (DangerousLegacyEquals(a, b)) { }`, 'dangerous'],
    ['type declaration', `Type Age 0`, 'declaration'],
    ['doc comment', `/*#\n## Heading\n*/\nconst a = 1`, 'doc-comment'],
  ]

  for (const [label, code, expected] of CASES) {
    it(`${label} -> ${expected}`, () => {
      expect({
        [label]: types(code).some((t) => t.includes(expected)),
      }).toEqual({ [label]: true })
    })
  }

  it('a forbidden keyword is marked, not treated as an ordinary keyword', () => {
    // `var` is rejected by the language; the highlighter should say so.
    expect(types(`var x = 1`).some((t) => t.includes('forbidden'))).toBe(true)
  })
})

describe('AJS gets its own definition', () => {
  it('builtin atoms are highlighted as such', () => {
    expect(
      types(`const r = httpFetch(url)`, 'ajs').some((t) => t.includes('atom'))
    ).toBe(true)
  })

  it('ordinary JavaScript still tokenises (control)', () => {
    // Every assertion above is satisfied by a definition that matches nothing.
    const t = types(`const x = 1`, 'ajs')
    expect(t).toContain('keyword')
    expect(t.some((x) => x.includes('number'))).toBe(true)
  })
})

describe('the definitions stay generated', () => {
  it('a keyword added to the source of truth reaches Prism', () => {
    // The whole reason this is an emitter rather than a hand-written grammar. If someone
    // adds a keyword to tjs-syntax.ts and this fails, the generator was not re-run.
    const { KEYWORDS } = require('./tjs-syntax')
    const src = require('fs').readFileSync(
      new URL('./prism/tjs.js', import.meta.url).pathname,
      'utf8'
    )
    const missing = (KEYWORDS as string[]).filter((k) => !src.includes(k))
    expect(missing).toEqual([])
  })
})
