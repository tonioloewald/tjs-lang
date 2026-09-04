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
function Generic(tp, pred, d) {
  const c = (a) => {
    if (a === null || a === undefined) return () => true
    if (a.__runtimeType && typeof a.check === 'function')
      return (v) => a.check(v) === true
    if (typeof a === 'function') return (v) => a(v) === true
    return (v) => __match(v, a)
  }
  const f = (...args) => {
    const ck = args.map(c)
    const t = {
      description: d || 'generic',
      __runtimeType: true,
      check: (v) => pred(v, ...ck),
    }
    return t
  }
  f.__runtimeType = true
  f.description = d
  return f
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Generic }
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { preprocess } from '/Users/tonioloewald/tjs-lang/src/lang/parser'

/* line 10 */
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
  source: 'input.ts:10',
}

describe('Generic predicate → verified fuel-bounded guard', () => {
  it('verifies a generic predicate that composes a type-param check', () => {
    const out = src(
      `Generic Box<T> {\n  description: 'a boxed value'\n  predicate(x, T) { return typeof x === 'object' && x !== null && T(x.value) }\n}`
    )
    expect(out).toContain('const Box = Generic(')
    expect(out).toContain('__fuel')
    expect(out).toContain('checkT(')
  })
  it('verifies a two-type-param generic predicate', () => {
    const out = src(
      `Generic Pair<T, U> {\n  description: 'a pair'\n  predicate(x, T, U) { return T(x[0]) && U(x[1]) }\n}`
    )
    expect(out).toContain('__fuel')
    expect(out).toContain('checkT(')
    expect(out).toContain('checkU(')
  })
  it('falls back for an unverifiable generic predicate (loop)', () => {
    const out = src(
      `Generic AllOf<T> {\n  description: 'all match'\n  predicate(xs, T) { for (const x of xs) { if (!T(x)) return false } return true }\n}`
    )
    expect(out).not.toContain('__fuel')
    expect(out).toContain('for (const x of xs)')
    expect(out).toContain('checkT')
  })
})
