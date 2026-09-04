function __ub(v) {
  try {
    if (v instanceof String) return String.prototype.valueOf.call(v)
    if (v instanceof Number) return Number.prototype.valueOf.call(v)
    if (v instanceof Boolean) return Boolean.prototype.valueOf.call(v)
  } catch {
    return v
  }
  return v
}
const __ac = Object.create(null)
function __proj(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v
  let k
  try {
    k = v.constructor && v.constructor.name
  } catch {
    return v
  }
  let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null
  if (typeof f !== 'function') {
    try {
      f = v.asCompared
    } catch {
      return v
    }
  }
  if (typeof f !== 'function') return v
  let p
  try {
    p = f.call(v)
  } catch {
    return v
  }
  const t = typeof p
  return p === null ||
    p === undefined ||
    t === 'number' ||
    t === 'string' ||
    t === 'boolean'
    ? p
    : v
}
function Eq(a, b) {
  a = __ub(__proj(a))
  b = __ub(__proj(b))
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b))
    return true
  if ((a === null || a === undefined) && (b === null || b === undefined))
    return true
  return false
}
function TypeOf(v) {
  return v === null ? 'null' : typeof v
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Eq, TypeOf }
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { Eq, TypeOf } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

const VALUES = [
  ['1', 1],
  ['1.0', 1.0],
  ['+1', +1],
  ['new Number(1)', new Number(1)],
  ['0', 0],
  ['-0', -0],
  ["'1'", '1'],
  ['true', true],
  ['false', false],
  ['null', null],
  ['undefined', undefined],
  ['NaN', NaN],
  ['{}', {}],
  ['[]', []],
]

describe('=== is strictly stricter than ==', () => {
  it('every pair `a === b` also satisfies `a == b`', () => {
    const violations = []
    for (const [an, a] of VALUES) {
      for (const [bn, b] of VALUES) {
        if (a === b && !Eq(a, b)) {
          violations.push(`${an} === ${bn} but Eq() says no`)
        }
      }
    }
    expect(violations).toEqual([])
  })
  it('and == is genuinely LOOSER somewhere, or the claim is vacuous', () => {
    expect(Eq(new Number(1), 1)).toBe(true)
    expect(new Number(1) === 1).toBe(false)
    expect(Eq(null, undefined)).toBe(true)
    expect(null === undefined).toBe(false)
  })
})

describe('numeric identity: the source/value boundary', () => {
  it('`+1`, `1` and `1.0` are one value', () => {
    expect(+1 === 1).toBe(true)
    expect(1 === 1.0).toBe(true)
    expect(Eq(+1, 1)).toBe(true)
    expect(Eq(1, 1.0)).toBe(true)
    expect([TypeOf(1), TypeOf(1.0), TypeOf(+1)]).toEqual([
      'number',
      'number',
      'number',
    ])
  })
  it('`==` does not coerce across types', () => {
    expect(Eq('1', 1)).toBe(false)
    expect(Eq('', false)).toBe(false)
    expect(Eq(0, false)).toBe(false)
  })
  it('NaN equals itself, unlike in JavaScript', () => {
    expect(Eq(NaN, NaN)).toBe(true)

    const nan = NaN
    expect(nan === nan).toBe(false)
  })
})

describe('`==` is NOT typeof-gated', () => {
  it('null == undefined even though TypeOf disagrees', () => {
    expect(TypeOf(null)).toBe('null')
    expect(TypeOf(undefined)).toBe('undefined')
    expect(TypeOf(null)).not.toBe(TypeOf(undefined))
    expect(Eq(null, undefined)).toBe(true)
  })
  it('a boxed primitive equals its primitive despite TypeOf disagreeing', () => {
    expect(TypeOf(new Number(1))).toBe('object')
    expect(TypeOf(1)).toBe('number')
    expect(Eq(new Number(1), 1)).toBe(true)
  })
})

describe('Set.has is not the language equality', () => {
  const members = new Set([1, null, NaN])
  const byEq = (v) => [...members].some((m) => Eq(m, v))
  it('agrees on plain values and on NaN', () => {
    expect([members.has(1.0), byEq(1.0)]).toEqual([true, true])
    expect([members.has(NaN), byEq(NaN)]).toEqual([true, true])
    expect([members.has(2), byEq(2)]).toEqual([false, false])
  })
  it('DISAGREES on a boxed primitive', () => {
    expect(members.has(new Number(1))).toBe(false)
    expect(byEq(new Number(1))).toBe(true)
  })
  it('DISAGREES on undefined against a null member', () => {
    expect(members.has(undefined)).toBe(false)
    expect(byEq(undefined)).toBe(true)
  })
  it('normalising the probe reconciles them', () => {
    const canon = (v) => {
      if (v === undefined) return null
      if (v instanceof Number) return Number.prototype.valueOf.call(v)
      if (v instanceof String) return String.prototype.valueOf.call(v)
      if (v instanceof Boolean) return Boolean.prototype.valueOf.call(v)
      return v
    }
    const canonical = new Set([...members].map(canon))
    for (const v of [1.0, new Number(1), undefined, NaN, 2, 'x']) {
      expect(`${String(v)}:${canonical.has(canon(v))}`).toBe(
        `${String(v)}:${byEq(v)}`
      )
    }
  })
})
