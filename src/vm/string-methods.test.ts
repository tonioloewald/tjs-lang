/**
 * The VM's replace/replaceAll/match/search/split agree with JavaScript's — a DIFFERENTIAL test —
 * and charge, before building it, at least what they build.
 */
import { describe, it, expect } from 'bun:test'
import { compileRegex, threadBytes } from './regex'
import * as vm from './string-methods'

const meter = () => {
  const m = {
    bytes: 0,
    steps: 0,
    alloc: (b: number) => void (m.bytes += b),
    steps_: 0,
  } as any
  m.steps = (n: number) => void (m.steps_ += n)
  return m as vm.Meters & { bytes: number }
}

const PATTERNS: Array<[string, string]> = [
  ['a', ''],
  ['a', 'g'],
  ['(a)(b)?', 'g'],
  ['(?<x>a)(?<y>b)?', 'g'],
  ['x*', 'g'],
  ['', 'g'],
  ['b+', ''],
  ['\\s*,\\s*', 'g'],
  ['(\\d+)', 'g'],
  ['😀', 'gu'],
  ['.', 'gu'],
  ['^', 'gm'],
]
const INPUTS = [
  '',
  'a',
  'ab',
  'banana',
  'a, b ,c',
  'x1y22z333',
  'a😀b😀',
  'line1\nline2\nab',
  'aaa',
]
const REPLACEMENTS = [
  '-',
  '$$',
  '$&',
  '$`',
  "$'",
  '[$1]',
  '$2$1',
  '$<x>|$<y>',
  '$0',
  '$10',
  '$',
  '$<nope>',
]

describe('replace / replaceAll', () => {
  for (const [src, flags] of PATTERNS)
    for (const repl of REPLACEMENTS)
      it(`/${src}/${flags} → ${JSON.stringify(repl)}`, () => {
        for (const s of INPUTS) {
          const m = meter()
          const ours = vm.replace(s, compileRegex(src, flags), repl, m)
          expect({ s, ours }).toEqual({
            s,
            ours: s.replace(new RegExp(src, flags), repl),
          })
          expect(m.bytes).toBeGreaterThanOrEqual(
            ours === s ? 0 : ours.length * 2
          )
          if (flags.includes('g')) {
            const all = vm.replaceAll(
              s,
              compileRegex(src, flags),
              repl,
              meter()
            )
            expect({ s, all }).toEqual({
              s,
              all: s.replaceAll(new RegExp(src, flags), repl),
            })
          }
        }
      })

  it('string patterns are literal', () => {
    for (const s of INPUTS)
      for (const p of ['a', '', '.', 'an', 'zz'])
        for (const repl of REPLACEMENTS) {
          expect(vm.replace(s, p, repl, meter())).toBe(s.replace(p, repl))
          expect(vm.replaceAll(s, p, repl, meter())).toBe(s.replaceAll(p, repl))
        }
  })

  it('replaceAll refuses a non-global regex, as JavaScript does', () => {
    expect(() =>
      vm.replaceAll('a', compileRegex('a', ''), 'b', meter())
    ).toThrow(/global/)
  })
})

describe('match / search', () => {
  for (const [src, flags] of PATTERNS)
    it(`/${src}/${flags}`, () => {
      for (const s of INPUTS) {
        const native = s.match(new RegExp(src, flags))
        const ours = vm.match(s, compileRegex(src, flags), meter()) as any
        expect({ s, ours: ours && [...ours] }).toEqual({
          s,
          ours: native && [...native],
        })
        if (native && !flags.includes('g')) {
          expect(ours.index).toBe(native.index)
          expect(ours.groups ? { ...ours.groups } : undefined).toEqual(
            native.groups ? { ...native.groups } : undefined
          )
        }
        expect(vm.search(s, compileRegex(src, flags), meter())).toBe(
          s.search(new RegExp(src, flags))
        )
      }
    })

  it('a STRING pattern is compiled as a regex, as JavaScript does', () => {
    for (const s of INPUTS)
      for (const p of ['a', '.', 'n+', '\\d']) {
        expect(vm.search(s, p, meter())).toBe(s.search(p))
        const ours = vm.match(s, p, meter()) as any
        const native = s.match(p)
        expect(ours && [...ours]).toEqual(native && [...native])
      }
  })
})

describe('split', () => {
  const seps: Array<string | [string, string] | undefined> = [
    undefined,
    '',
    ',',
    'a',
    'an',
    ['', ''],
    [',', ''],
    ['\\s*,\\s*', ''],
    ['(,)', ''],
    ['(a)|(b)', ''],
    ['x*', ''],
    ['😀', 'u'],
    ['', 'u'],
  ]
  for (const sep of seps)
    it(`split(${JSON.stringify(sep)})`, () => {
      for (const s of [...INPUTS, 'a,b,,c', ','])
        for (const limit of [undefined, 0, 1, 2, -1]) {
          const ours = vm.split(
            s,
            Array.isArray(sep) ? compileRegex(sep[0], sep[1]) : sep,
            limit,
            meter()
          )
          const native = s.split(
            (Array.isArray(sep) ? new RegExp(sep[0], sep[1]) : sep) as any,
            limit
          )
          expect({ s, limit, ours }).toEqual({ s, limit, ours: native })
        }
    })
})

describe('charged before built (rc.2 eighth re-review B1, M4)', () => {
  it("an operation charges the regex's worst-case thread memory once", () => {
    const re = compileRegex('(a|b|c)' + 'x?'.repeat(500), 'g')
    const m = meter()
    vm.search('abc', re, m)
    expect(m.bytes).toBeGreaterThanOrEqual(threadBytes(re))
  })

  it('each substitution is charged before it is built, so a refusal comes early', () => {
    // a meter that refuses past 1MB: a 10MB output must be refused after about a tenth of
    // its substitutions, not after building all of them
    let subsBuilt = 0
    let bytes = 0
    const alloc = (b: number) => {
      bytes += b
      if (bytes > 1_000_000) throw new Error('refused')
    }
    const s = 'a'.repeat(1000)
    expect(() =>
      vm.replaceAll(
        s,
        'a',
        '$&'.repeat(5000), // 5000 chars per substitution, 1000 substitutions
        {
          steps: () => subsBuilt++,
          alloc,
        }
      )
    ).toThrow('refused')
    // steps are charged once per substitution plus the template parse; refused well before 1000
    expect(subsBuilt).toBeLessThan(300)
  })
})
