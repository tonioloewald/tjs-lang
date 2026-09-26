/**
 * The colon-disambiguation primitive (`docs/parser-primitives.md`, primitive #2).
 *
 * Tested directly rather than only through the transforms, because the whole point of the
 * layer is that the question has ONE answer that can be examined on its own. A primitive only
 * reachable through its caller is not a primitive, it is a private helper with extra steps.
 *
 * Both directions matter and fail differently. A ternary read as an annotation DELETES a
 * branch of the program (the bug); an annotation read as a ternary leaves TJS syntax in the
 * emitted JavaScript. The second is louder, which is exactly why it needs pinning too — a
 * guard that errs safe in one direction tends to be tuned until it errs safe in neither.
 */
import { describe, it, expect } from 'bun:test'
import { isTernaryColon } from './expression-context'

/** Index of the colon marked by `^` on the line below the source. */
const at = (src: string, marker: string) =>
  src.indexOf(marker) + marker.indexOf(':')

describe('isTernaryColon', () => {
  const ternaries: Array<[string, string, string]> = [
    [
      'parenthesized consequent — the shape that broke RpcServer.ts',
      'const o = { write: flag ? ((r) => f(r)) : (r) => g(r) }',
      ') : (',
    ],
    ['plain ternary', 'const x = a ? b : c', ' : '],
    ['arrow consequent', 'const x = a ? (r) => 1 : (r) => 2', ' : ('],
    ['inside a call argument', 'f(a ? b : c)', ' : '],
    ['after a property colon', 'const o = { k: a ? b : c }', ' : c'],
  ]
  for (const [label, src, marker] of ternaries) {
    it(`says YES: ${label}`, () => {
      expect(isTernaryColon(src, at(src, marker))).toBe(true)
    })
  }

  const notTernaries: Array<[string, string, string]> = [
    ['an arrow return type', 'const f = (a) : 0 => a', ') : 0'],
    ['an object property', 'const o = { a: 1 }', 'a: 1'],
    ['a property before a ternary', 'const o = { k: a ? b : c }', 'k: a'],
    [
      'a return type after optional chaining',
      'const f = (a) : 0 => a?.b',
      ') : 0',
    ],
    ['a return type after nullish', 'const f = (a) : 0 => a ?? 1', ') : 0'],
  ]
  for (const [label, src, marker] of notTernaries) {
    it(`says NO: ${label}`, () => {
      expect(isTernaryColon(src, at(src, marker))).toBe(false)
    })
  }

  it('matches inner ternaries rather than counting totals', () => {
    // `a ? b : c ? d : e` — the SECOND colon belongs to the second ternary. A version that
    // counted `?` and `:` and compared totals gets this right by luck and gets
    // `{ write: flag ? x : y }` wrong, because the property colon lands in the total.
    const src = 'const x = a ? b : c ? d : e'
    // +1 — `indexOf(' : ')` finds the SPACE. The first version of this test asserted on a
    // space and got `false`, which is correct behaviour for the question it actually asked.
    expect(isTernaryColon(src, src.indexOf(' : c') + 1)).toBe(true)
    expect(isTernaryColon(src, src.lastIndexOf(' : ') + 1)).toBe(true)
  })

  it('a colon inside a literal is not a colon', () => {
    // The lexical layer underneath must still be doing its job.
    const src = "const f = (a) => 'x ? y : z'"
    expect(isTernaryColon(src, src.indexOf(' : z'))).toBe(false)
  })

  it('is not confused by a safety marker', () => {
    // `(? a: 0)` — the TJS parameter safety marker is a `?` that never takes an alternative.
    const src = 'function f(? a: 0) { return a }'
    expect(isTernaryColon(src, src.indexOf('a: 0') + 1)).toBe(false)
  })
})

describe('the forward ternary pass agrees with the backward walk at every `:`', () => {
  const { readFileSync, existsSync } = require('fs')
  const { join } = require('path')
  const { Glob } = require('bun')
  const { isTernaryColon, isTernaryColonScan } = require('./expression-context')
  const files: Array<[string, string]> = []
  const add = (root: string, pattern: string, limit: number) => {
    if (!existsSync(root)) return
    let n = 0
    for (const f of new Glob(pattern).scanSync({
      cwd: root,
      onlyFiles: true,
    })) {
      if (f.includes('node_modules') || f.endsWith('.d.ts')) continue
      const src = readFileSync(join(root, f), 'utf8')
      if (src.length > 60_000) continue // the reference is quadratic by construction
      files.push([`${root}/${f}`, src])
      if (++n >= limit) break
    }
  }
  add(import.meta.dir, '*.ts', 60)
  add(join(import.meta.dir, '..', '..', '.compat-tests'), '**/src/**/*.ts', 80)
  files.push([
    'hostile',
    [
      'a ? b : c : d ? e : f',
      'x ?? y : z ?. w : (p ? q : r) : s',
      '(? a: 0, ! b: 1) => a ? b : c',
      'f(a, b ? c : d), g ? (h ? i : j) : k',
      ') ? a : b ] : c } ? d : e',
      'a ?: b ?! c :: d ? e :: f : g',
      '{ write: flag ? ((r) => f(r)) : (r) => {} }',
      "k ? `${x ? 1 : 2}` : '?:' ; y ? /:/ : z",
    ].join('\n'),
  ])
  it('apparatus: a real corpus', () => expect(files.length).toBeGreaterThan(40))
  for (const [name, src] of files)
    it(name, () => {
      const bad: string[] = []
      for (let i = 0; i < src.length; i++)
        if (
          src[i] === ':' &&
          isTernaryColon(src, i) !== isTernaryColonScan(src, i)
        )
          bad.push(
            `at ${i}: forward ${isTernaryColon(
              src,
              i
            )}, walk ${isTernaryColonScan(src, i)}`
          )
      expect(bad.slice(0, 5)).toEqual([])
    })
})
