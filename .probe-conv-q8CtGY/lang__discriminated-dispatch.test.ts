function __match(v, ex) {
  if (ex === null) return v === null
  if (ex === undefined) return true
  if (
    ex &&
    typeof ex === 'object' &&
    ex.__runtimeType &&
    typeof ex.check === 'function'
  )
    return ex.check(v) === true
  const t = typeof ex
  if (t === 'number')
    return (
      typeof v === 'number' &&
      (Number.isInteger(ex) ? Number.isInteger(v) : true)
    )
  if (t === 'string' || t === 'boolean') return typeof v === t
  if (Array.isArray(ex)) {
    if (!Array.isArray(v)) return false
    return ex.length ? v.every((x) => __match(x, ex[0])) : true
  }
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const ks = Object.keys(ex)
    return ks.every((k) => k in v && __match(v[k], ex[k]))
  }
  return v === ex
}
function Type(d, p, e) {
  const t = { description: d, __runtimeType: true }
  if (typeof p === 'function') {
    t.check = p
    t.default = e ?? null
  } else {
    const ex = e ?? p
    t.default = ex
    t.__ex = ex
    t.check = (v) => __match(v, ex)
  }
  return t
}
function Exactly(...v) {
  const vals = v.flat()
  return {
    description: 'exactly ' + vals.map((x) => JSON.stringify(x)).join(' | '),
    check: (x) => vals.includes(x),
    values: vals,
    __runtimeType: true,
  }
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Type }
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { Type, Exactly } from '/Users/tonioloewald/tjs-lang/src/types/Type'

/* line 28 */
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
  source: 'input.ts:28',
}

/* line 30 */
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
  source: 'input.ts:30',
}

const SHAPES = `Type Circle { example: { kind: Exactly('circle'), r: 0.0 } }
Type Rect { example: { kind: Exactly('rect'), w: 0.0, h: 0.0 } }
`

describe('a nested Exactly makes a discriminant exact', () => {
  it('the runtime Type honours it', () => {
    const Circle = Type('Circle', undefined, {
      kind: Exactly('circle'),
      r: 0.0,
    })
    expect(Circle.check({ kind: 'circle', r: 1 })).toBe(true)
    expect(Circle.check({ kind: 'rect', r: 1 })).not.toBe(true)
  })
  it('and names the offending field when it fails', () => {
    const Circle = Type('Circle', undefined, {
      kind: Exactly('circle'),
      r: 0.0,
    })
    expect(String(Circle.check({ kind: 'rect', r: 1 }))).toContain('kind')
  })
  it('the type still accepts its own example (the thing that was broken)', () => {
    const Circle = Type('Circle', undefined, {
      kind: Exactly('circle'),
      r: 0.0,
    })
    expect(Circle.check({ kind: 'circle', r: 0.0 })).toBe(true)
  })
  it('EMITTED code honours it too — the inline stub is what ships', () => {
    const f = load(
      SHAPES + `export function f(s: Circle):! 0 { return 1 }`,
      'f'
    )
    expect(f({ kind: 'circle', r: 1 })).toBe(1)
    expect(isErr(f({ kind: 'rect', r: 1 }))).toBe(true)
  })
})

describe('overloads dispatch on the declared type', () => {
  const area = load(
    SHAPES +
      `export function area(s: Circle):! 0.0 { return 3.14159 * s.r * s.r }\n` +
      `export function area(s: Rect):! 0.0 { return s.w * s.h }\n`,
    'area'
  )
  it('picks the variant whose type matches', () => {
    expect(area({ kind: 'circle', r: 2 })).toBeCloseTo(12.56636, 4)
    expect(area({ kind: 'rect', w: 3, h: 4 })).toBe(12)
  })
  it('a value matching NEITHER is an error, not an arbitrary variant', () => {
    const out = area({ kind: 'tri', a: 1 })
    expect(isErr(out)).toBe(true)
    expect(String(out.expected)).toContain('no matching overload')
  })
  it('two distinct named types are no longer "ambiguous"', () => {
    expect(() =>
      tjs(
        SHAPES +
          `export function area(s: Circle):! 0 { return 1 }\n` +
          `export function area(s: Rect):! 0 { return 2 }\n`
      )
    ).not.toThrow()
  })
  it('genuinely ambiguous overloads are STILL rejected', () => {
    expect(() =>
      tjs(
        `export function f(a: 0):! 0 { return 1 }\n` +
          `export function f(b: 0):! 0 { return 2 }\n`
      )
    ).toThrow(/ambiguous/)
  })
})
