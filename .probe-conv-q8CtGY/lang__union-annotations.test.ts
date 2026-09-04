/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 16 */
function load(src, name) {
  return new Function(
    tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`
  )()
}
load.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    name: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:16',
}

const SHAPES = `Type Circle { example: { kind: 'circle', r: 0.0 } }
Type Rect { example: { kind: 'rect', w: 0.0, h: 0.0 } }
`

/* line 22 */
function isErr(v) {
  return !!v && typeof v === 'object' && v.name === 'MonadicError'
}
isErr.__tjs = {
  params: {
    v: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:22',
}

describe('a union of declared types is enforced', () => {
  const f = load(
    SHAPES + `export function tag(s: Circle | Rect):! '' { return s.kind }\n`,
    'tag'
  )
  it('accepts every member', () => {
    expect(f({ kind: 'circle', r: 2 })).toBe('circle')
    expect(f({ kind: 'rect', w: 1, h: 2 })).toBe('rect')
  })
  it('rejects a value matching NEITHER member', () => {
    expect(isErr(f({ kind: 'tri', a: 1 }))).toBe(true)
    expect(isErr(f(42))).toBe(true)
  })
  it('returns a MonadicError for null rather than THROWING', () => {
    let out
    expect(() => {
      out = f(null)
    }).not.toThrow()
    expect(isErr(out)).toBe(true)
  })
  it('three-member unions work — the nesting case', () => {
    const g = load(
      SHAPES +
        `Type Tri { example: { kind: 'tri', a: 0.0 } }\n` +
        `export function tag3(s: Circle | Rect | Tri):! '' { return s.kind }\n`,
      'tag3'
    )
    expect(g({ kind: 'tri', a: 1 })).toBe('tri')
    expect(g({ kind: 'circle', r: 1 })).toBe('circle')
    expect(isErr(g({ kind: 'hex' }))).toBe(true)
  })
})

describe('an unresolvable member degrades the WHOLE union, loudly', () => {
  const src =
    SHAPES + `export function g(s: Circle | Missing):! 0 { return 1 }\n`
  it('checks nothing rather than checking only the known member', () => {
    expect(load(src, 'g')({ kind: 'rect', w: 1, h: 2 })).toBe(1)
  })
  it('warns, naming the member and how to fix it', () => {
    const w = (tjs(src).warnings ?? []).filter((m) =>
      String(m).includes('could not be resolved')
    )
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('Missing')
    expect(w[0]).toContain('WHOLE union is unchecked')
  })
})

describe('the forms that already worked still do', () => {
  it('a single declared type', () => {
    const f = load(
      SHAPES + `export function h(s: Circle):! 0 { return 1 }`,
      'h'
    )
    expect(f({ kind: 'circle', r: 1 })).toBe(1)
    expect(isErr(f({ nope: 1 }))).toBe(true)
  })
  it('a literal union', () => {
    const f = load(`export function m(x: 'a' | 'b'):! '' { return x }`, 'm')
    expect(f('a')).toBe('a')
    expect(isErr(f('z'))).toBe(true)
  })
  it('a declared Union', () => {
    const f = load(
      `Union Direction 'a cardinal direction' { 'up', 'down' }\n` +
        `export function go(d: Direction):! '' { return d }`,
      'go'
    )
    expect(f('up')).toBe('up')
    expect(isErr(f('sideways'))).toBe(true)
  })
})
