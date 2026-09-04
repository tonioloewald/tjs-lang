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
function DangerousLegacyEquals(a, b) {
  return a == b
}
function DangerousLegacyNot(a, b) {
  return a != b
}
function LegacyExactly(a, b) {
  return a === b
}
function LegacyNotExactly(a, b) {
  return a !== b
}
function LegacyDefault(v) {
  return v
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

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  createRuntime,
  Eq,
  Is,
  toBool,
  DangerousLegacyEquals,
  DangerousLegacyNot,
  LegacyExactly,
  LegacyNotExactly,
  LegacyDefault,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

let saved

beforeAll(() => {
  saved = globalThis.__tjs
  globalThis.__tjs = createRuntime()
})

afterAll(() => {
  globalThis.__tjs = saved
})

describe('legacy equality reproduces JavaScript exactly', () => {
  it('DangerousLegacyEquals coerces, where TJS `==` refuses to', () => {
    expect(DangerousLegacyEquals(1, '1')).toBe(true)
    expect(Eq(1, '1')).toBe(false)
    expect(DangerousLegacyEquals(0, '')).toBe(true)
    expect(DangerousLegacyEquals(false, [])).toBe(true)
  })
  it("LegacyExactly keeps JS's two famous warts", () => {
    expect(LegacyExactly(NaN, NaN)).toBe(false)
    expect(Eq(NaN, NaN)).toBe(true)

    expect(LegacyExactly(new String('a'), 'a')).toBe(false)
    expect(Eq(new String('a'), 'a')).toBe(true)
  })
  it('null vs undefined: legacy `===` separates, TJS `==` does not', () => {
    expect(LegacyExactly(null, undefined)).toBe(false)
    expect(DangerousLegacyEquals(null, undefined)).toBe(true)
    expect(Eq(null, undefined)).toBe(true)
  })
  it('the negations are exact inversions', () => {
    for (const [a, b] of [
      [1, '1'],
      [NaN, NaN],
      [null, undefined],
      [{}, {}],
    ]) {
      expect(DangerousLegacyNot(a, b)).toBe(!DangerousLegacyEquals(a, b))
      expect(LegacyNotExactly(a, b)).toBe(!LegacyExactly(a, b))
    }
  })
})

describe('they work in emitted standalone code', () => {
  const NAMES = [
    ['DangerousLegacyEquals', true],
    ['DangerousLegacyNot', false],
    ['LegacyExactly', false],
    ['LegacyNotExactly', true],
  ]
  for (const [name, expected] of NAMES) {
    it(`${name} is inlined and runs`, () => {
      const code = tjs(`function f(a: 0, b: '') { return ${name}(a, b) }`, {
        runTests: false,
      }).code
      expect(code).toContain(`function ${name}(`)
      const f = new Function(code + '\nreturn f')()
      expect(f(1, '1')).toBe(expected)
    })
  }
  it('are NOT inlined when unused — no dead weight', () => {
    const code = tjs(`function f(a: 0, b: 0) { return a == b }`, {
      runTests: false,
    }).code
    expect(code).not.toContain('function DangerousLegacyEquals(')
  })
})

describe('LegacyDefault — per-parameter escape from dictionary defaults', () => {
  const fn = (src) =>
    new Function(tjs(src, { runTests: false }).code + '\nreturn f')()
  it('a bare object literal merges on partial (TJS dictionary semantics)', () => {
    const f = fn(`function f(args = {x: 0, y: 0}) { return args }`)
    expect(f({ x: 5 })).toEqual({ x: 5, y: 0 })
  })
  it('LegacyDefault restores JavaScript: atomic, no merge', () => {
    const f = fn(
      `function f(args = LegacyDefault({x: 0, y: 0})) { return args }`
    )
    expect(f({ x: 5 })).toEqual({ x: 5 })
  })
  it('…and still applies the whole default when the argument is omitted', () => {
    const f = fn(
      `function f(args = LegacyDefault({x: 0, y: 0})) { return args }`
    )
    expect(f()).toEqual({ x: 0, y: 0 })
  })
  it('is identity at runtime — the marker is compile-time only', () => {
    const obj = { a: 1 }
    expect(LegacyDefault(obj)).toBe(obj)
  })
  it('is inlined into standalone output when used', () => {
    const code = tjs(
      `function f(args = LegacyDefault({x: 0})) { return args }`,
      {
        runTests: false,
      }
    ).code
    expect(code).toContain('function LegacyDefault(')
  })
})

describe('Eq cannot be made to run user code (the safe path must BE safe)', () => {
  class Bomb extends String {
    valueOf() {
      throw new Error('boom')
    }
  }
  class Liar extends Number {
    valueOf() {
      return 999
    }
  }
  it('an overridden valueOf on a boxed subclass cannot throw from inside Eq', () => {
    expect(() => Eq(new Bomb('x'), 'x')).not.toThrow()
    expect(Eq(new Bomb('x'), 'x')).toBe(true)
  })
  it('…and cannot lie about the value', () => {
    expect(Eq(new Liar(5), 5)).toBe(true)
    expect(Eq(new Liar(5), 999)).toBe(false)
  })
  it('a plain object with valueOf is untouched by Eq — but not by `==`', () => {
    let called = false
    const probe = {
      valueOf() {
        called = true
        return 1
      },
    }
    Eq(probe, 1)
    expect(called, 'Eq must not coerce a plain object').toBe(false)
    DangerousLegacyEquals(probe, 1)
    expect(called, '`==` does — which is why the name says Dangerous').toBe(
      true
    )
  })
  it('unwrapping still works for ordinary boxed primitives', () => {
    expect(Eq(new String('a'), 'a')).toBe(true)
    expect(Eq(new Boolean(false), false)).toBe(true)
  })
})

describe('boxed primitives cannot run user code in ANY comparison path', () => {
  class BoolBomb extends Boolean {
    valueOf() {
      throw new Error('boom')
    }
  }
  class BoolLiar extends Boolean {
    valueOf() {
      return true
    }
  }
  class NumSpy extends Number {
    static ran = 0
    valueOf() {
      NumSpy.ran++
      return 999
    }
  }
  const OPERATORS = [
    ['Eq(v, false)', (v) => Eq(v, false)],
    ['toBool(v)', (v) => toBool(v)],
    ['Is(v, false)', (v) => Is(v, false)],
  ]
  for (const [label, apply] of OPERATORS) {
    it(`${label} does not throw when valueOf throws`, () => {
      expect(() => apply(new BoolBomb(false))).not.toThrow()
    })
    it(`${label} reads the real slot, not the overridden valueOf`, () => {
      const v = new BoolLiar(false)
      const result = apply(v)
      expect(
        label === 'toBool(v)' ? result === false : result === true,
        `${label} must reflect the boxed false`
      ).toBe(true)
    })
    it(`${label} runs no user code at all`, () => {
      NumSpy.ran = 0
      apply(new NumSpy(5))
      expect(NumSpy.ran, `${label} invoked a user valueOf`).toBe(0)
    })
  }
  it('an instanceof-lying Proxy cannot throw a raw TypeError out of an operator', () => {
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error('trap')
        },
      }
    )
    const original = Object.getOwnPropertyDescriptor(
      Boolean,
      Symbol.hasInstance
    )
    Object.defineProperty(Boolean, Symbol.hasInstance, {
      value: () => true,
      configurable: true,
    })
    try {
      for (const [label, apply] of OPERATORS) {
        expect(() => apply(trap), label).not.toThrow()
      }
    } finally {
      if (original) Object.defineProperty(Boolean, Symbol.hasInstance, original)
      else delete Boolean[Symbol.hasInstance]
    }
  })
})
