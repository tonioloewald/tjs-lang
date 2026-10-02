/**
 * The VM's regex engine agrees with JavaScript's — a DIFFERENTIAL test.
 *
 * `regex.ts` replaces the host's backtracking engine for guest regexes, so its answers must be the
 * native ones: for every pattern in the corpus and every input (hand-picked edge cases plus seeded
 * random strings over the pattern's alphabet), the match position, end and every capture group
 * must equal native `RegExp#exec`. And it must stay linear on the shapes that make backtracking
 * explode, while refusing (clearly) what it does not support.
 */
import { describe, it, expect } from 'bun:test'
import { compileRegex, execRegex, RegexError } from './regex'

const noCharge = () => {}

function native(src: string, flags: string, input: string, from = 0) {
  const re = new RegExp(src, flags.includes('y') ? flags : flags + 'g')
  re.lastIndex = from
  const m = re.exec(input)
  if (!m) return null
  return {
    index: m.index,
    end: m.index + m[0].length,
    captures: [...m].map((g, k) =>
      g === undefined ? undefined : k === 0 ? [m.index, m.index + g.length] : g
    ),
  }
}

function ours(src: string, flags: string, input: string, from = 0) {
  const m = execRegex(compileRegex(src, flags), input, from, noCharge)
  if (!m) return null
  return {
    index: m.index,
    end: m.end,
    captures: m.captures.map((c, k) =>
      c === undefined ? undefined : k === 0 ? c : input.slice(c[0], c[1])
    ),
  }
}

/** A seeded PRNG, so a failure reproduces. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

const CORPUS: Array<[string, string, string]> = [
  // [pattern, flags, alphabet for random inputs]
  ['abc', '', 'abcx'],
  ['a|ab', '', 'ab'],
  ['ab|a', '', 'ab'],
  ['a*', '', 'ab'],
  ['a+', '', 'ab'],
  ['a?b', '', 'ab'],
  ['a*?b', '', 'ab'],
  ['a+?', '', 'a'],
  ['(a|b)*c', '', 'abc'],
  ['(a*)(b*)', '', 'ab'],
  ['(a*?)(b*)', '', 'ab'],
  ['(a|(b))+', '', 'ab'],
  ['(?:ab)+', '', 'abx'],
  ['(?<x>a+)(?<y>b?)', '', 'ab'],
  ['a{2}', '', 'a'],
  ['a{2,}', '', 'ab'],
  ['a{1,3}?', '', 'a'],
  ['(ab){1,2}c', '', 'abc'],
  ['[abc]+', '', 'abcd'],
  ['[^ab]+', '', 'abcd'],
  ['[a-c]{2}', '', 'abcd'],
  ['\\d+\\.\\d*', '', '12.a'],
  ['\\w+\\s\\w+', '', 'ab c'],
  ['\\bab\\b', '', 'ab c'],
  ['\\Bb', '', 'ab '],
  ['^a', 'm', 'a\nb'],
  ['b$', 'm', 'b\na'],
  ['^a.*$', '', 'ab\n'],
  ['a.b', 's', 'a\nb'],
  ['A+b', 'i', 'aAbB'],
  ['[A-C]+', 'i', 'abcd'],
  ['(a+)+$', '', 'ab'],
  ['a*a*c', '', 'ac'],
  ['(x*)*y', '', 'xy'],
  ['(a?){2}a{2}', '', 'a'],
  ['', '', 'ab'],
  ['()|a', '', 'a'],
  ['\\u0041\\x42', '', 'AB'],
  ['😀+', 'u', 'a😀'],
  ['.', 'u', 'a😀'],
  ['[😀a]', 'u', 'a😀b'],
]

describe('the VM regex engine matches JavaScript (differential)', () => {
  for (const [src, flags, alphabet] of CORPUS) {
    it(`/${src}/${flags}`, () => {
      const r = rng(src.length * 7919 + flags.length)
      const chars = [...alphabet]
      const inputs = ['', alphabet, alphabet + alphabet]
      for (let k = 0; k < 120; k++) {
        const len = Math.floor(r() * 9)
        let s = ''
        for (let j = 0; j < len; j++) s += chars[Math.floor(r() * chars.length)]
        inputs.push(s)
      }
      for (const input of inputs)
        for (const from of [0, 1]) {
          if (from > input.length) continue
          expect({ input, from, m: ours(src, flags, input, from) }).toEqual({
            input,
            from,
            m: native(src, flags, input, from),
          })
        }
    })
  }

  it('sticky matches only AT the position', () => {
    expect(ours('b', 'y', 'ab', 0)).toBeNull()
    expect(ours('b', 'y', 'ab', 1)).toEqual(native('b', 'y', 'ab', 1))
  })
})

describe('it stays linear where backtracking explodes', () => {
  const steps = (src: string, input: string) => {
    let n = 0
    execRegex(compileRegex(src), input, 0, (k) => (n += k))
    return n
  }
  for (const src of [
    '(a+)+$',
    'a*a*c',
    '(a|a)*b',
    '(\\d+)+x',
    '\\d+\\d+\\d+x',
  ]) {
    it(`/${src}/`, () => {
      const small = steps(src, 'a'.repeat(1000) + '!')
      const big = steps(src, 'a'.repeat(4000) + '!')
      // 4× the input: ~4× the work (linear), never 16× or 2^n
      expect(big / small).toBeLessThan(6)
      const t = performance.now()
      execRegex(compileRegex(src), 'a'.repeat(50_000) + '!', 0, noCharge)
      expect(performance.now() - t).toBeLessThan(2000)
    })
  }
})

describe('unsupported features are refused, clearly', () => {
  for (const [src, flags, why] of [
    ['(a)\\1', '', /Backreferences/],
    ['(?<n>a)\\k<n>', '', /Backreferences/],
    ['a(?=b)', '', /Lookahead/],
    ['(?<=a)b', '', /Lookahead/],
    ['\\p{L}', 'u', /Unicode property/],
    ['a', 'v', /Unsupported regex flags/],
    ['a', 'd', /Unsupported regex flags/],
    ['a{3}{4}{5}{6}{7}{8}', '', /too large|Nothing to repeat/],
  ] as const)
    it(`/${src}/${flags}`, () => {
      expect(() => compileRegex(src, flags)).toThrow(why)
      expect(() => compileRegex(src, flags)).toThrow(RegexError)
    })
})

describe('random patterns agree with JavaScript (grammar fuzz)', () => {
  // Patterns built from the supported grammar over a two-letter alphabet, so they collide often:
  // alternation, groups (capturing and not), every quantifier greedy and lazy, classes, anchors.
  function pattern(r: () => number, depth: number): string {
    const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]
    const atom = (): string => {
      const k = r()
      if (depth > 2 || k < 0.45)
        return pick(['a', 'b', '.', '[ab]', '[^a]', '\\w', '^', '$', '\\b'])
      if (k < 0.7) return '(' + pattern(r, depth + 1) + ')'
      if (k < 0.85) return '(?:' + pattern(r, depth + 1) + ')'
      return pattern(r, depth + 1) + '|' + pattern(r, depth + 1)
    }
    let s = ''
    const n = 1 + Math.floor(r() * 3)
    for (let i = 0; i < n; i++) {
      let a = atom()
      if (!['^', '$', '\\b'].includes(a) && r() < 0.5)
        a +=
          pick(['*', '+', '?', '{2}', '{0,2}', '{1,}']) + (r() < 0.3 ? '?' : '')
      s += a
    }
    return s
  }

  it('300 patterns × 40 inputs', () => {
    const r = rng(20261002)
    let compared = 0
    for (let p = 0; p < 300; p++) {
      const src = pattern(r, 0)
      try {
        new RegExp(src)
      } catch {
        continue // not valid JavaScript either
      }
      for (let k = 0; k < 40; k++) {
        let s = ''
        const len = Math.floor(r() * 8)
        for (let j = 0; j < len; j++) s += r() < 0.5 ? 'a' : 'b'
        expect({ src, s, m: ours(src, '', s) }).toEqual({
          src,
          s,
          m: native(src, '', s),
        })
        compared++
      }
    }
    expect(compared).toBeGreaterThan(8000) // apparatus
  })
})
