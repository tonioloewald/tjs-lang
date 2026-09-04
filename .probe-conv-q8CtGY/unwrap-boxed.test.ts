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
const tjsEquals = Symbol.for('tjs.equals')
function Is(a, b) {
  return __goIs(a, b, 0, null)
}
function __goIs(a, b, d, m) {
  if (a != null && typeof a === 'object' && typeof a[tjsEquals] === 'function')
    return a[tjsEquals](b)
  if (b != null && typeof b === 'object' && typeof b[tjsEquals] === 'function')
    return b[tjsEquals](a)
  if (a != null && typeof a === 'object' && typeof a.Equals === 'function')
    return a.Equals(b)
  if (b != null && typeof b === 'object' && typeof b.Equals === 'function')
    return b.Equals(a)
  a = __ub(__proj(a))
  b = __ub(__proj(b))
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b))
    return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (d >= 8) {
    if (m === null) m = new WeakMap()
    let s = m.get(a)
    if (s) {
      if (s.has(b)) return true
    } else {
      s = new WeakSet()
      m.set(a, s)
    }
    s.add(b)
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [k, v] of a)
      if (!b.has(k) || !__goIs(v, b.get(k), d + 1, m)) return false
    return true
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a instanceof RegExp && b instanceof RegExp)
    return a.toString() === b.toString()
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => __goIs(v, b[i], d + 1, m))
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a),
    kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => __goIs(a[k], b[k], d + 1, m))
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Eq, Is, tjsEquals }
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  unwrapBoxed,
  UNWRAP_BOXED_SOURCE,
} from '/Users/tonioloewald/tjs-lang/src/unwrap-boxed'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  Is as sharedIs,
  Eq as sharedEq,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

const emittedUb = new Function(`${UNWRAP_BOXED_SOURCE}\nreturn __ub`)()

class Liar extends Number {
  valueOf() {
    return 999
  }
}

class LyingString extends String {
  valueOf() {
    return 'gotcha'
  }
  toString() {
    return 'gotcha'
  }
}

const HOSTILE = [
  ['plain number', 42],
  ['plain string', 'x'],
  ['boxed number', new Number(7)],
  ['boxed string', new String('s')],
  ['boxed boolean', new Boolean(false)],
  ['null', null],
  ['undefined', undefined],
  ['subclass with lying valueOf', new Liar(1)],
  ['String subclass with lying valueOf', new LyingString('real')],
  [
    'Proxy faking Boolean.prototype',
    new Proxy({}, { getPrototypeOf: () => Boolean.prototype }),
  ],
  [
    'Proxy with hasInstance trap',
    new Proxy(
      {},
      { get: (_t, k) => (k === Symbol.hasInstance ? () => true : undefined) }
    ),
  ],
  ['object', { a: 1 }],
  ['array', [1, 2]],
]

describe('the two unwrappers agree', () => {
  for (const [label, value] of HOSTILE) {
    it(`${label}`, () => {
      const run = (f) => {
        try {
          return `ok:${String(f(value))}`
        } catch (e) {
          return `threw:${e?.constructor?.name}`
        }
      }

      expect(run(emittedUb)).toBe(run(unwrapBoxed))
    })
  }
  it('neither ever throws — that is the point', () => {
    for (const [, value] of HOSTILE) {
      expect(() => unwrapBoxed(value)).not.toThrow()
      expect(() => emittedUb(value)).not.toThrow()
    }
  })
  it('reads the SLOT, not the overridden method', () => {
    expect(unwrapBoxed(new Liar(1))).toBe(1)
    expect(emittedUb(new Liar(1))).toBe(1)
  })
})

describe('the operators built on it agree, end to end', () => {
  const load = (src, name) =>
    new Function(
      `${
        tjs(src, { filename: 'ub.tjs', runTests: false }).code
      }\nreturn ${name}`
    )()
  it('`Is` does not run a hostile valueOf', () => {
    const emitted = load('function f(a, b) { return Is(a, b) }', 'f')
    const liar = new Liar(1)
    expect(emitted(liar, 999)).toBe(sharedIs(liar, 999))
    expect(emitted(liar, 999)).toBe(false)
  })
  it('`==` returns rather than throwing on a lying Proxy', () => {
    const emitted = load('function f(a, b) { return a == b }', 'f')
    const p = new Proxy({}, { getPrototypeOf: () => Boolean.prototype })
    expect(() => emitted(p, true)).not.toThrow()
    expect(emitted(p, true)).toBe(sharedEq(p, true))
  })
  it('the ordinary cases still work', () => {
    const eq = load('function f(a, b) { return a == b }', 'f')
    expect(eq(new Number(1), 1)).toBe(true)
    expect(eq(new String('a'), 'a')).toBe(true)
    expect(eq(new Boolean(false), false)).toBe(true)
    expect(eq('5', 5)).toBe(false)
  })
})
