/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  extractParamMarkers,
  PARAM_REQUIRED_MARKER as REQ,
  PARAM_TYPENAME_MARKER as OPT,
} from '/Users/tonioloewald/tjs-lang/src/lang/parser-params'

import { scanLiterals } from '/Users/tonioloewald/tjs-lang/src/strip-comments'

/* line 29 */
function naive(src) {
  const required = new Set()
  const typeName = new Set()
  if (!src.includes(REQ) && !src.includes(OPT)) {
    return { source: src, required, typeName }
  }
  const regions = scanLiterals(src).filter(
    (r) => r.kind === 'string' || r.kind === 'template' || r.kind === 'regex'
  )
  const literalAt = (pos) =>
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
naive.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:29',
}

const CORPUS = [
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
  const gen = (n) => {
    let s = ''
    for (let i = 0; i < n; i++) {
      s += `function f${i}(a = ${i} ${REQ}) {\n  const m = 'literal text ${i} words here'\n  return m + a\n}\n`
    }
    return s
  }

  const time = (src) => {
    extractParamMarkers(src)
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
    const large = gen(3200)
    const ratio = time(large) / Math.max(time(small), 0.1)

    expect(ratio).toBeLessThan(8)
  })
})
