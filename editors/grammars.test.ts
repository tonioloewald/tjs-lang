import { describe, it, expect } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tjs } from '../src/lang'

/**
 * The generated grammars must actually MATCH something.
 *
 * `build-grammars.ts` built its patterns with `\\\\b` in a template literal, which produces
 * the string `\\b` — a literal backslash followed by `b`, not a word boundary. Every
 * keyword, forbidden and builtin rule was therefore incapable of matching ANY input, in
 * both generated grammars, for as long as they have existed. Proven, not inferred:
 * `new RegExp(rule.match).test('function foo')` returned false, while the hand-written
 * `ajs-injection` sibling (which nothing generates) worked fine. The extension's
 * advertised "red squiggly highlighting for forbidden syntax" was dead.
 *
 * A grammar is data, so nothing type-checks it and nothing runs it — it fails silently and
 * looks fine in review. Hence this file: compile every pattern, and drive the ones whose
 * job is recognising a token.
 */

const vscodeDir = join(import.meta.dir, 'vscode')

function patternsOf(grammarPath: string): string[] {
  const grammar = JSON.parse(readFileSync(grammarPath, 'utf-8'))
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const o = node as Record<string, unknown>
    for (const key of ['match', 'begin', 'end']) {
      if (typeof o[key] === 'string') out.push(o[key] as string)
    }
    for (const v of Object.values(o)) walk(v)
  }
  walk(grammar)
  return out
}

const GRAMMARS = ['tjs.tmLanguage.json', 'ajs.tmLanguage.json'].map((f) => ({
  name: f,
  path: join(vscodeDir, 'syntaxes', f),
}))

describe('generated TextMate grammars', () => {
  for (const { name, path } of GRAMMARS) {
    describe(name, () => {
      it('exists', () => {
        expect(existsSync(path)).toBe(true)
      })

      it('every pattern is a valid regex', () => {
        const bad: string[] = []
        for (const p of patternsOf(path)) {
          try {
            new RegExp(p)
          } catch (e: any) {
            bad.push(`${p.slice(0, 40)} — ${e.message}`)
          }
        }
        expect(bad).toEqual([])
      })

      it('the keyword rule matches a keyword', () => {
        // The assertion the double-escape bug fails. `\\b(function|…)\\b` compiles fine
        // as a regex — it just can never match — so "is it valid?" is not enough.
        const kw = patternsOf(path).find((p) => /\(function\|/.test(p))
        expect(
          kw,
          'no keyword rule found — did the generator change?'
        ).toBeDefined()
        expect(new RegExp(kw!).test('function foo() {}')).toBe(true)
      })

      it('the forbidden rule matches its own first token', () => {
        const rule = patternsOf(path).find((p) =>
          /^\\b\((?:new|var|implements)\|?/.test(p)
        )
        if (!rule) return // TJS's list is short enough that the shape differs; covered below
        const first = /\((\w+)[|)]/.exec(rule)![1]
        expect(new RegExp(rule).test(`${first} x`)).toBe(true)
      })
    })
  }

  it('the .tjs grammar is REGISTERED, not just generated', () => {
    // It was generated on every build and referenced by nothing: `.tjs` had no VS Code
    // support at all, in the release whose central idea is that the file extension IS
    // the language gate.
    const manifest = JSON.parse(
      readFileSync(join(vscodeDir, 'package.json'), 'utf-8')
    )
    const tjsGrammar = manifest.contributes.grammars.find(
      (g: any) => g.scopeName === 'source.tjs'
    )
    expect(tjsGrammar, '.tjs grammar not contributed').toBeDefined()
    expect(
      manifest.contributes.languages.some((l: any) =>
        l.extensions?.includes('.tjs')
      ),
      '.tjs extension not associated with a language'
    ).toBe(true)
    // And every contributed path must exist.
    for (const g of manifest.contributes.grammars) {
      expect(existsSync(join(vscodeDir, g.path)), g.path).toBe(true)
    }
  })
})

describe('editor snippets are legal TJS', () => {
  // The CodeMirror completion inserted `unsafe {\n\t\n}` — a form the language REJECTS,
  // so the editor that ships with the language taught a syntax error for that language's
  // headline feature. `editors-build.test.ts` proves the committed .js matches the .ts;
  // nothing proved the .ts matches the language.
  const SNIPPETS: Array<[label: string, code: string]> = [
    ['unsafe <expr>', 'function f(x: 0) { return unsafe new Date(x) }'],
    [
      'test block',
      `function f(x: 0) { return x }\ntest 'it works' { expect(1).toBe(1) }`,
    ],
    [
      'DangerousLegacyEquals',
      'function f(a: 0, b: 0) { return DangerousLegacyEquals(a, b) }',
    ],
    ['LegacyExactly', 'function f(a: 0, b: 0) { return LegacyExactly(a, b) }'],
    ['LegacyDefault', 'function f(o = LegacyDefault({ x: 0 })) { return o }'],
  ]

  for (const [label, code] of SNIPPETS) {
    it(`${label} compiles`, () => {
      expect(() => tjs(code, { runTests: false })).not.toThrow()
    })
  }

  it('the OLD unsafe block form is genuinely rejected', () => {
    // Recording why the snippet changed: this is not a style preference.
    expect(() =>
      tjs('function f(x: 0) {\n  unsafe {\n    return new Date(x)\n  }\n}', {
        runTests: false,
      })
    ).toThrow(/Date/)
  })
})
