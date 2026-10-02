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
import {
  compileRegex,
  execRegex,
  RegexCompiler,
  RegexError,
  REGEX_FUEL_PER_STEP,
  threadBytes,
} from './regex'

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

describe("case-insensitive matching uses JavaScript's Canonicalize", () => {
  // the characters whose folds are not plain upper/lower pairs
  const chars = 'sSſkKKσςΣµμΜßẞåÅÅθϑϴΘiIİıΩω'
  for (const flags of ['i', 'iu'])
    it(`/x/${flags} for every pair in ${chars}`, () => {
      for (const p of chars)
        for (const c of chars) {
          for (const src of [p, `[${p}]`, `[^${p}]`])
            expect({ src, c, m: ours(src, flags, c) }).toEqual({
              src,
              c,
              m: native(src, flags, c),
            })
        }
      for (const src of ['\\w', '\\W', '[a-z]', '[^a-z]', '\\b'])
        for (const c of chars)
          expect({ src, c, m: ours(src, flags, c) }).toEqual({
            src,
            c,
            m: native(src, flags, c),
          })
    })
})

describe('every unit of engine work is charged (rc.2 eighth re-review B1–B3)', () => {
  // Wall time per unit of fuel charged must stay within the VM's own exchange rate (the default
  // timeout is 10ms per fuel), however hostile the shape. These are the review's shapes: zero-width
  // closures, wide capture arrays, a huge class, case folding, many registers.
  const hostile: Array<[string, string, string]> = [
    ['(?:a?){0,2000}b', '', 'a'.repeat(2000)],
    ['(a?){0,200}(b?){0,200}c', '', 'ab'.repeat(2000)],
    ['(' + '()'.repeat(200) + ')*x', '', 'y'.repeat(5000)],
    ['[' + 'a'.repeat(400_000) + ']', '', 'b'.repeat(20_000)],
    ['[a-zσ' + 'ſ'.repeat(2000) + ']+$', 'iu', 'ΣςS'.repeat(5000) + '!'],
    ['(?:|a|b|c|d|e|f|g|h)*z', '', 'abcdefgh'.repeat(2000)],
  ]
  for (const [src, flags, input] of hostile)
    it(`/${src.slice(0, 40)}/${flags}`, () => {
      let work = 0
      const t = performance.now()
      const re = compileRegex(src, flags, (n) => (work += n))
      execRegex(re, input, 0, (n) => (work += n))
      const ms = performance.now() - t
      const fuel = work * REGEX_FUEL_PER_STEP
      expect({ ms, fuel, ok: ms <= 10 * fuel + 50 }).toMatchObject({ ok: true })
      expect(threadBytes(re)).toBeGreaterThan(0)
    })

  it('a capture copy is charged in proportion to its width', () => {
    const work = (src: string) => {
      let n = 0
      execRegex(compileRegex(src), 'a'.repeat(200), 0, (k) => (n += k))
      return n
    }
    expect(work('(?:' + '(a)?'.repeat(100) + ')b')).toBeGreaterThan(
      5 * work('(?:' + '(?:a)?'.repeat(100) + ')b')
    )
  })
})

describe('a class probe is charged in proportion to its search (B3)', () => {
  it('a class of many separate ranges costs more per test than a single character', () => {
    const wide =
      '[' +
      Array.from({ length: 4000 }, (_, i) =>
        String.fromCharCode(0x100 + i * 2)
      ).join('') +
      ']'
    const work = (src: string) => {
      let n = 0
      execRegex(compileRegex(src), 'z'.repeat(2000), 0, (k) => (n += k))
      return n
    }
    // ~12 probes of a binary search over 4000 ranges, against ~2 for one range
    expect(work(wide) - work('[a]')).toBeGreaterThanOrEqual(2000 * 8)
  })
})

describe('sizes that grow with the pattern are capped (B2)', () => {
  for (const [what, src, why] of [
    ['a count beyond the cap', '(?:){1000000000000}', /count too large/],
    [
      'an empty body repeated a hundred million times',
      '(?:(?:){10000}){10000}',
      /too large/,
    ],
    ['deep nesting', '('.repeat(300) + ')'.repeat(300), /nested too deeply/],
    ['too many groups', '(a)'.repeat(300), /too many groups/],
  ] as const)
    it(`${what} is refused promptly, even unmetered`, () => {
      const t = performance.now()
      expect(() => compileRegex(src)).toThrow(why)
      expect(performance.now() - t).toBeLessThan(500)
    })

  it('compilation is charged', () => {
    let work = 0
    compileRegex('a{5000}', '', (n) => (work += n))
    expect(work).toBeGreaterThanOrEqual(5000)
    let empty = 0
    compileRegex('(?:){5000}', '', (n) => (empty += n))
    expect(empty).toBeGreaterThanOrEqual(5000)
  })

  it('a meter that throws stops compilation and matching', () => {
    const stop = () => {
      throw new Error('stop')
    }
    expect(() => compileRegex('a{5000}', '', stop)).toThrow('stop')
    expect(() => execRegex(compileRegex('a+b'), 'aaa', 0, stop)).toThrow('stop')
  })
})

describe('nested and lazy quantifiers over empty-matchable bodies agree with JavaScript (fuzz)', () => {
  // The empty-iteration check and capture resets are where a Pike VM most easily departs from a
  // backtracker; this grammar is built from atoms that can match nothing.
  function pattern(r: () => number, depth: number): string {
    const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]
    const q = () =>
      pick(['*', '+', '?', '{0,2}', '{1,3}', '{2}', '']) +
      (r() < 0.4 ? '?' : '')
    if (depth > 2) return pick(['a', 'b', 'a?', '(?:)', '()', '(a?)', 'b*?'])
    const n = 1 + Math.floor(r() * 2)
    let s = ''
    for (let i = 0; i < n; i++) {
      const k = r()
      const inner = pattern(r, depth + 1)
      s +=
        k < 0.4
          ? '(' + inner + ')' + q()
          : k < 0.6
          ? '(?:' + inner + '|' + pattern(r, depth + 1) + ')' + q()
          : k < 0.8
          ? '(?:' + inner + ')' + q()
          : inner
    }
    return s
  }

  for (const flags of ['', 'i'])
    it(`400 patterns × 30 inputs, flags '${flags}'`, () => {
      const r = rng(77 + flags.length)
      let compared = 0
      for (let p = 0; p < 400; p++) {
        const src = pattern(r, 0)
        try {
          new RegExp(src, flags)
        } catch {
          continue
        }
        for (let k = 0; k < 30; k++) {
          let s = ''
          const len = Math.floor(r() * 7)
          for (let j = 0; j < len; j++)
            s += r() < 0.5 ? 'a' : r() < 0.7 ? 'b' : 'A'
          expect({ src, s, m: ours(src, flags, s) }).toEqual({
            src,
            s,
            m: native(src, flags, s),
          })
          compared++
        }
      }
      expect(compared).toBeGreaterThan(10_000) // apparatus
    })
})

describe('the transpiler refuses an unsupported regex literal at its source', () => {
  it('a backreference is a TranspileError with a location, not a failure inside a run', async () => {
    const { transpile } = await import('../lang/index')
    expect(() =>
      transpile('function f(s: "") { return s.search(/(a)\\1/) }')
    ).toThrow(/Backreferences are not supported.*:1:\d+/)
    expect(() =>
      transpile('function f(s: "") { return s.search(/a+/) }')
    ).not.toThrow()
  })
})

describe('allocation is charged as it is made (rc.2 eleventh re-review M1, m1)', () => {
  it('I1: a refusing meter stops compilation part-way, before the program is built', () => {
    let calls = 0
    let bytes = 0
    expect(() =>
      compileRegex(
        'a{10000}',
        '',
        () => {},
        (n) => {
          calls++
          if ((bytes += n) > 100_000) throw new Error('refused')
        }
      )
    ).toThrow('refused')
    // ~10,000 instructions would be built; the refusal came after a small fraction
    expect(calls).toBeLessThan(3000)
  })

  it('class escapes are charged as they are pushed, so a refusal comes before the table grows', () => {
    // a million escapes would build ~11M unmerged range entries; a meter that refuses at 100KB
    // must stop the parse after about a thousand of them, not after building them all
    const t = performance.now()
    let bytes = 0
    expect(() =>
      compileRegex(
        '[' + '\\S'.repeat(1_000_000) + ']',
        '',
        () => {},
        (b) => {
          if ((bytes += b) > 100_000) throw new Error('refused')
        }
      )
    ).toThrow('refused')
    expect(performance.now() - t).toBeLessThan(50)
  })

  it('class escapes are charged for what they allocate, and share their tables', () => {
    let bytes = 0
    const n = 50_000
    compileRegex(
      '[' + '\\S'.repeat(n) + ']',
      '',
      () => {},
      (b) => (bytes += b)
    )
    expect(bytes).toBeGreaterThanOrEqual(n * 8) // a slot per escape, at least
  })

  it("allocation is charged as work, so a pre-run compiler's one budget bounds memory too", () => {
    const wide =
      '[' +
      Array.from({ length: 120_000 }, (_, i) =>
        String.fromCharCode(0x4e00 + 2 * i)
      ).join('') +
      ']'
    // its work is under the floor's step budget; what it ALLOCATES is charged as work too
    let work = 0
    let bytes = 0
    compileRegex(
      wide,
      '',
      (n) => (work += n),
      (b) => (bytes += b)
    )
    expect(work).toBeGreaterThanOrEqual(bytes / 64)
    expect(() => new RegexCompiler(10).compile(wide)).toThrow(
      /too large to compile/
    )
  })
})
