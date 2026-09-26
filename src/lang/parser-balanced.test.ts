/**
 * `extractBalancedContent` with its partner memo answers exactly what the uncached scan does.
 *
 * The memo records, during one scan, the partner (or "never closes") of every nested `(` it
 * walks through, on the argument that a later scan from there would decide identically. This
 * holds that argument to account: at EVERY `(` of a corpus of real files and hostile shapes,
 * queried in source order as the transform queries it, the memoised answer must equal a fresh
 * scan's. The memo is what took an unbalanced `(` run from 60-90s to linear (0.14.0 final
 * re-review 6, B-1) — and a memo that is fast and occasionally WRONG would silently mangle
 * conversions, which is worse than slow.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { Glob } from 'bun'
import { extractBalancedContent } from './parser-params'

function corpus(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const add = (root: string, pattern: string, limit: number) => {
    if (!existsSync(root)) return
    let n = 0
    for (const f of new Glob(pattern).scanSync({
      cwd: root,
      onlyFiles: true,
    })) {
      if (f.includes('node_modules') || f.endsWith('.d.ts')) continue
      const src = readFileSync(join(root, f), 'utf8')
      if (src.length > 40_000) continue // the UNCACHED side is quadratic by construction
      out.push([`${root}/${f}`, src])
      if (++n >= limit) break
    }
  }
  add(join(import.meta.dir), '*.ts', 60)
  add(join(import.meta.dir, '..', 'vm'), '*.ts', 20)
  add(join(import.meta.dir, '..', '..', '.compat-tests'), '**/src/**/*.ts', 60)
  // Hostile shapes: unbalanced runs, parens in strings/templates/regexes, `/` after `)` and `}`.
  out.push(['unbalanced', '('.repeat(300) + 'x' + ')'.repeat(100)])
  out.push([
    'literals',
    "f('(', \"(\", `(${'('}`, /\\(/, a / (b), c) + g((1), [(2)], {k: (3)})",
  ])
  out.push(['regex-after-brace', 'if (a) {} /(x)/.test(y); (1 / (2)) / (3)'])
  out.push(['mixed-unbalanced', ')('.repeat(200) + '((a)(b)' + '('.repeat(50)])
  return out
}

describe('the partner memo agrees with a fresh scan at every `(`', () => {
  const files = corpus()
  it('apparatus: a real corpus with many parens', () => {
    expect(files.length).toBeGreaterThan(40)
  })
  for (const [name, src] of files)
    it(name, () => {
      const memo = new Map<number, number>()
      const disagreements: string[] = []
      for (let p = 0; p < src.length; p++) {
        if (src[p] !== '(') continue
        const fresh = extractBalancedContent(src, p + 1, '(', ')')
        const cached = extractBalancedContent(src, p + 1, '(', ')', memo)
        if (JSON.stringify(fresh) !== JSON.stringify(cached))
          disagreements.push(
            `at ${p}: fresh ${fresh?.endPos ?? 'null'}, memo ${
              cached?.endPos ?? 'null'
            }`
          )
      }
      expect(disagreements.slice(0, 5)).toEqual([])
    })
})
