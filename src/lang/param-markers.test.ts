/**
 * `extractParamMarkers` was O(n × literals) — and the shape of the fix has to be proven,
 * not asserted.
 *
 * The old walk asked `regions.some(…)` at EVERY character and appended one character at a
 * time. On a 174KB file that was 152ms, quadrupling with each doubling of input: a
 * transpiler pass that gets slower per byte the bigger your file is. The new one is a
 * forward cursor over the ascending region list plus `indexOf` jumps between candidates.
 *
 * Two things need proving, and a benchmark alone proves neither:
 *
 *   1. The rewrite is BEHAVIOUR-PRESERVING. The naive version below is the old
 *      implementation, kept verbatim as a reference oracle and run against the same corpus.
 *      (It is a copy on purpose. A test that re-derives the answer with the new algorithm
 *      only proves the new algorithm equals itself.)
 *   2. The complexity is actually gone. The growth assertion is a RATIO, not a wall-clock
 *      threshold — a slow machine scales the same way, so it does not flake, but a
 *      reintroduced `.some()` per position fails it loudly.
 */
import { describe, it, expect } from 'bun:test'
import {
  extractParamMarkers,
  PARAM_REQUIRED_MARKER as REQ,
  PARAM_TYPENAME_MARKER as OPT,
} from './parser-params'
import { scanLiterals } from '../strip-comments'

/** The pre-fix implementation, verbatim. The oracle. */
function naive(src: string) {
  const required = new Set<number>()
  const typeName = new Set<number>()
  if (!src.includes(REQ) && !src.includes(OPT)) {
    return { source: src, required, typeName }
  }
  const regions = scanLiterals(src).filter(
    (r) => r.kind === 'string' || r.kind === 'template' || r.kind === 'regex'
  )
  const literalAt = (pos: number) =>
    regions.some((r) => pos >= r.innerStart && pos < r.innerEnd)
  let out = ''
  let i = 0
  while (i < src.length) {
    const inLiteral = literalAt(i)
    const isReq = !inLiteral && src.startsWith(REQ, i)
    const isOpt = !inLiteral && !isReq && src.startsWith(OPT, i)
    if (isReq || isOpt) {
      i += (isReq ? REQ : OPT).length
      if (out.endsWith(' ')) out = out.slice(0, -1)
      ;(isReq ? required : typeName).add(out.length)
      continue
    }
    out += src[i]
    i++
  }
  return { source: out, required, typeName }
}

const CORPUS: Array<[string, string]> = [
  ['no markers at all', `function f(a, b) { return a + b }`],
  ['one required', `function f(a = 1 ${REQ}) { return a }`],
  ['both kinds', `function f(a = 1 ${REQ}, b = number ${OPT}) { return a }`],
  [
    'marker text inside a string',
    `const s = 'x${REQ}y'\nfunction f(a = 1 ${REQ}) {}`,
  ],
  [
    'marker text inside a template',
    'const s = `x' + REQ + '`\nfunction f(a = 1 ' + REQ + ') {}',
  ],
  [
    'marker text inside a regex class',
    `const r = /[${REQ}]/\nfunction f(a = 1 ${REQ}) {}`,
  ],
  [
    'the shared prefix but neither marker',
    `const s = '/*!tjs-nope*/'\nfunction f(a = 1 ${REQ}) {}`,
  ],
  [
    'a truncated marker at end of input',
    `function f(a = 1 ${REQ}) {}\n// /*!tjs-`,
  ],
  ['adjacent markers', `function f(a = 1 ${REQ}${OPT}) {}`],
  ['no space before the marker', `function f(a = 1${REQ}) {}`],
  ['marker at offset zero', `${REQ}function f(a) {}`],
  [
    'literal after the last marker',
    `function f(a = 1 ${REQ}) { return '${REQ}' }`,
  ],
]

describe('extractParamMarkers: the fast walk agrees with the old one', () => {
  it('the oracle really is the old behaviour (apparatus check)', () => {
    // If `naive` were accidentally a re-export of the real function, every case below
    // would agree for the wrong reason.
    expect(naive.toString()).toContain('regions.some')
    expect(naive.toString()).toContain('out += src[i]')
  })

  for (const [label, src] of CORPUS) {
    it(label, () => {
      const got = extractParamMarkers(src)
      const want = naive(src)
      expect(got.source).toBe(want.source)
      expect([...got.required].sort()).toEqual([...want.required].sort())
      expect([...got.typeName].sort()).toEqual([...want.typeName].sort())
    })
  }

  it('agrees on a large generated corpus', () => {
    let src = ''
    for (let i = 0; i < 200; i++) {
      src += `function f${i}(a = ${i} ${REQ}, b = number ${OPT}) {\n  const m = 'text ${i} with ${REQ} inside'\n  return m + a\n}\n`
    }
    const got = extractParamMarkers(src)
    const want = naive(src)
    expect(got.source).toBe(want.source)
    expect([...got.required]).toEqual([...want.required])
    expect([...got.typeName]).toEqual([...want.typeName])
  })
})

describe('extractParamMarkers scales linearly', () => {
  const gen = (n: number) => {
    let s = ''
    for (let i = 0; i < n; i++) {
      s += `function f${i}(a = ${i} ${REQ}) {\n  const m = 'literal text ${i} words here'\n  return m + a\n}\n`
    }
    return s
  }

  // BEST of N, not the mean. This runs inside the full suite alongside everything else,
  // and a mean folds in whatever else the machine was doing — which is how the first
  // version of this test passed alone and failed under load. The minimum is the closest
  // thing to an uncontended sample, and it is what makes the ratio stable rather than the
  // absolute number, which is machine-dependent by nature.
  const time = (src: string) => {
    extractParamMarkers(src) // warm the memoized literal scan
    let best = Infinity
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now()
      extractParamMarkers(src)
      best = Math.min(best, performance.now() - t0)
    }
    return best
  }

  it('quadrupling the input does not 16× the work', () => {
    const small = gen(800)
    const large = gen(3200) // 4× the input
    const ratio = time(large) / Math.max(time(small), 0.1)
    // Linear predicts ~4×. The old quadratic walk measured ~13× across an equivalent
    // pair (11.7ms → 152.1ms). 8 sits comfortably between the two, so this fails on a
    // reintroduced per-position scan and not on a busy machine.
    expect(ratio).toBeLessThan(8)
  })
})
