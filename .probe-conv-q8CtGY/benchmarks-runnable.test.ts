/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync } from 'node:fs'

import { join } from 'node:path'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang'

import { scanLiterals } from '/Users/tonioloewald/tjs-lang/src/strip-comments'

const HARNESS = join(
  '/Users/tonioloewald/tjs-lang/src',
  '..',
  'bin',
  'benchmarks.ts'
)
export {}

const source = readFileSync(HARNESS, 'utf8')

/* line 48 */
function fixtures() {
  const out = []
  for (const r of scanLiterals(source)) {
    if (r.kind !== 'template') continue
    const body = source.slice(r.innerStart, r.innerEnd)
    if (!/\bfunction\s+\w+\s*\(/.test(body)) continue
    if (body.includes('${')) continue
    out.push(body)
  }
  return out
}
fixtures.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'array',
      items: {
        kind: 'string',
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:48',
}

describe('the benchmark harness is runnable', () => {
  const found = fixtures()
  it('finds the fixtures (apparatus check)', () => {
    expect(found.length).toBeGreaterThan(4)
  })
  it('every TJS fixture in bin/benchmarks.ts compiles', () => {
    const broken = []
    for (const f of found) {
      try {
        tjs(f, { filename: 'bench.tjs', runTests: false })
      } catch (e) {
        broken.push(`${f.trim().split('\n')[0]} — ${e.message.split('\n')[0]}`)
      }
    }
    expect(broken).toEqual([])
  })
  it('no fixture uses the abolished arrow return form', () => {
    const arrows = found.filter((f) => /\)\s*-[>!?]\s*/.test(f))
    expect(arrows).toEqual([])
  })
})

describe('timings live only in the generated benchmark file', () => {
  it('every millisecond figure in guides/benchmarks.md sits under a date stamp', () => {
    const text = readFileSync(
      join('/Users/tonioloewald/tjs-lang/src', '..', 'guides', 'benchmarks.md'),
      'utf8'
    )
    const lines = text.split('\n')

    const DATE = /\b20\d\d-\d\d-\d\d\b/
    const TIMING = /\b\d+(\.\d+)?\s*(ms|µs|ns)\b/
    const undated = lines.filter((l, i) => {
      if (!TIMING.test(l)) return false
      return !lines.slice(Math.max(0, i - 12), i + 1).some((p) => DATE.test(p))
    })
    expect(undated).toEqual([])
  })
  it('the rule really rejects an undated figure (apparatus check)', () => {
    const DATE = /\b20\d\d-\d\d-\d\d\b/
    const TIMING = /\b\d+(\.\d+)?\s*(ms|µs|ns)\b/
    expect(TIMING.test('safe functions cost 13ms')).toBe(true)
    expect(DATE.test('Generated: 2026-08-18')).toBe(true)
  })
})
export {}
