/**
 * The doc-comment scan is LINEAR (0.14.0-rc.10 review, major 1). `findDocCommentSpans` runs in
 * `parseAgentSource` before any fuel applies, and is a public export since #3604. It was
 * quadratic: a failed opener scanned toward EOF and the outer loop then advanced by ONE, and
 * every opener ran `regions.some` over all literal regions. `'/#'.repeat(k)` took 28s at 128KB.
 * `blankDocComments` was quadratic on its own, rebuilding the string once per span.
 *
 * Two checks:
 *   - the rewrite returns EXACTLY what the old implementation returned (kept below as the
 *     reference), over a hand corpus and a seeded random one built from the characters the scan
 *     cares about;
 *   - its work, counted (not timed), grows linearly on the adversarial shapes.
 */
import { describe, it, expect } from 'bun:test'
import {
  findDocCommentSpans,
  blankDocComments,
  docScanWork,
  scanLiterals,
} from './strip-comments'

/** The pre-rc.10 implementation, verbatim apart from its name. The oracle. */
function referenceSpans(source: string): Array<[number, number]> {
  const regions = scanLiterals(source)
  const insideLiteral = (offset: number): boolean =>
    regions.some((r) => offset >= r.start && offset < r.end)
  const spans: Array<[number, number]> = []
  let i = 0
  while (i < source.length - 1) {
    if (source[i] !== '/' || source[i + 1] !== '#' || insideLiteral(i)) {
      i++
      continue
    }
    let depth = 1
    let j = i + 2
    let sawNewline = false
    let firstCloseWasSingleLine = false
    while (j < source.length - 1 && depth > 0) {
      if (source[j] === '\n') sawNewline = true
      if (source[j] === '/' && source[j + 1] === '#') {
        depth++
        j += 2
        continue
      }
      if (source[j] === '#' && source[j + 1] === '/') {
        if (!sawNewline) firstCloseWasSingleLine = true
        depth--
        j += 2
        continue
      }
      j++
    }
    if (depth !== 0 || !sawNewline || firstCloseWasSingleLine) {
      i++
      continue
    }
    spans.push([i, j])
    i = j
  }
  return spans
}

const referenceBlank = (source: string): string => {
  let out = source
  for (const [s, e] of referenceSpans(source).reverse())
    out =
      out.slice(0, s) + source.slice(s, e).replace(/[^\n]/g, ' ') + out.slice(e)
  return out
}

const HAND = [
  '',
  '/#',
  '#/',
  '/# x\n#/',
  '/# x #/',
  '/#/',
  '/#/#\n#/#/',
  '#/#\n/# a\n#/',
  '/# outer\n /# inner\n #/\n#/ tail',
  '/# a\n /# b #/\n#/',
  "const s = '/# not\\n#/'\n/# real\n#/",
  '`/# t\n#/` /# d\n#/',
  '// /# c\n/# d\n#/',
  '/* /# */ /# e\n#/',
  'x = /#a#/\n/# f\n#/',
  '/# unterminated\n',
  '/#\n#/#\n/#\n#/',
  '/# a\n#/ /# b\n#/ /# c\n#/',
]

/** Seeded generator over the scan's alphabet, so every overlap shape is reached. */
function corpus(n: number, seed = 1): string[] {
  let x = seed
  const rnd = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  // Weighted toward the delimiters and newlines, which is where the decisions are.
  const parts = [
    ...['/#', '/#', '/#', '#/', '#/', '#/', '\n', '\n', '\n', ' ', 'a'],
    ...['/', '#', "'", '"', '`', '//', '/*', '*/'],
  ]
  const out: string[] = []
  for (let k = 0; k < n; k++) {
    let s = ''
    const len = 1 + Math.floor(rnd() * 24)
    for (let m = 0; m < len; m++) s += parts[Math.floor(rnd() * parts.length)]
    out.push(s)
  }
  return out
}

describe('the linear scan agrees with the old one', () => {
  it('on the hand corpus', () => {
    for (const s of HAND) {
      expect(findDocCommentSpans(s)).toEqual(referenceSpans(s))
      expect(blankDocComments(s)).toBe(referenceBlank(s))
    }
  })
  it('on 20,000 generated sources', () => {
    let disagreements = 0
    let withSpans = 0
    for (const s of corpus(20_000)) {
      const ref = referenceSpans(s)
      if (ref.length) withSpans++
      if (JSON.stringify(findDocCommentSpans(s)) !== JSON.stringify(ref)) {
        disagreements++
        if (disagreements === 1)
          expect({ source: s, got: findDocCommentSpans(s) }).toEqual({
            source: s,
            got: ref,
          })
      }
    }
    expect(disagreements).toBe(0)
    // Apparatus: the corpus must actually produce doc comments, or agreement proves little.
    expect(withSpans).toBeGreaterThan(500)
  })
})

describe('its work grows linearly', () => {
  const shapes: [string, (n: number) => string][] = [
    ['unterminated openers', (n) => '/#'.repeat(n)],
    ['unterminated openers with newlines', (n) => '/#\n'.repeat(n)],
    ['openers after string literals', (n) => "'a'/#".repeat(n)],
    ['single-line closes', (n) => '/# #/'.repeat(n)],
    ['many real doc comments', (n) => '/# d\n#/ '.repeat(n)],
  ]
  for (const [what, make] of shapes)
    it(what, () => {
      const work = (n: number) => {
        const src = make(n)
        docScanWork.steps = 0
        findDocCommentSpans(src)
        blankDocComments(src)
        return docScanWork.steps / src.length
      }
      // Per-character work at 1k and 16k copies: linear means it does not grow with n.
      const small = work(1_000)
      const large = work(16_000)
      expect(large).toBeLessThan(small * 1.5 + 1)
    })
})
