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
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Eq, Type }
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { preprocess } from '/Users/tonioloewald/tjs-lang/src/lang/parser'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 14 */
function src(s) {
  return preprocess(s).source
}
src.__tjs = {
  params: {
    s: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:14',
}

describe('multiple verified predicates in one module (no name collision)', () => {
  it('transpiles two Type predicates without a `__pred` clash', () => {
    const out = tjs(
      `Type A 'a' { predicate(x) { return x > 0 } }\n` +
        `Type B 'b' { predicate(x) { return x < 0 } }`
    )
    expect(out.code).not.toContain('__pred$')
    expect(out.code).toContain('__pred_A')
    expect(out.code).toContain('__pred_B')
  })
  it('transpiles a Type + Generic predicate together', () => {
    const out = tjs(
      `Type Pos 'positive' { predicate(x) { return x > 0 } }\n` +
        `Generic Box<T> { description: 'b', predicate(x, T) { return T(x.value) } }`
    )
    expect(out.code).not.toContain('__pred$')
    expect(out.code).toContain('__pred_Pos')
    expect(out.code).toContain('__pred_Box')
  })
})

describe('Type predicate → verified fuel-bounded guard', () => {
  it('compiles a safe predicate-only Type to a fuel-bounded guard', () => {
    const out = src(`Type Pos 'positive' { predicate(x) { return x > 0 } }`)
    expect(out).toContain(`const Pos = Type('positive'`)
    expect(out).toContain('__fuel')
    expect(out).toContain('x > 0')
  })
  it('compiles a safe predicate+example Type, keeping the example schema gate', () => {
    const out = src(
      `Type EvenNum 'even' { example: 2, predicate(x) { return x % 2 === 0 } }`
    )
    expect(out).toContain(`const EvenNum = Type('even'`)
    expect(out).toContain('__fuel')
    expect(out).toContain('__tjs?.validate')
    expect(out).toContain('x % 2 === 0')
  })
  it('verifies a native-TJS predicate using == (rewritten to Eq)', () => {
    const out = src(`Type Five 'five' { predicate(x) { return x == 5 } }`)
    expect(out).toContain('Eq(')
    expect(out).toContain('__fuel')
  })
  it('falls back to the raw arrow for an unverifiable predicate (loop)', () => {
    const out = src(
      `Type AllPos 'all positive' { example: [1], predicate(xs) { for (const x of xs) { if (x <= 0) return false } return true } }`
    )
    expect(out).not.toContain('__fuel')
    expect(out).toContain('for (const x of xs)')
    expect(out).toContain('__tjs?.validate')
  })
  it('falls back for an impure predicate (effectful call)', () => {
    const out = src(
      `Type Reachable 'reachable' { predicate(url) { return fetch(url) } }`
    )
    expect(out).not.toContain('__fuel')
    expect(out).toContain('fetch(url)')
  })
})
