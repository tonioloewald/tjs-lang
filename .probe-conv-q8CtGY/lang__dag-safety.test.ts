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
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Is, tjsEquals }
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { expectFunction } from '/Users/tonioloewald/tjs-lang/src/lang/tests'

import { Is } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 32 */
function dag(depth, leaf = 1) {
  let n = { leaf }
  for (let i = 0; i < depth; i++) n = { a: n, b: n }
  return n
}
dag.__tjs = {
  params: {
    depth: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
    leaf: {
      type: {
        kind: 'integer',
      },
      required: false,
      default: 1,
    },
  },
  unsafe: true,
  source: 'input.ts:32',
}

const MESSAGE_CAP = 40_000

describe('dag safety (#21)', () => {
  describe('expectFunction (tests.ts) — the injected test-block expect', () => {
    const makeExpect = () => new Function(expectFunction + '\nreturn expect')()
    it('passing toEqual on two deep DAGs returns promptly', () => {
      const ex = makeExpect()
      ex(dag(30)).toEqual(dag(30))
    }, 10_000)
    it('failing toEqual on a deep DAG produces a bounded message', () => {
      const ex = makeExpect()
      let message = ''
      try {
        ex(dag(22)).toEqual(1)
      } catch (e) {
        message = e.message
      }
      expect(message.length).toBeGreaterThan(0)
      expect(message.length).toBeLessThan(MESSAGE_CAP)
    }, 10_000)
    it('failing toEqual on a TRUE CYCLE still formats (JSON.stringify throws on cycles)', () => {
      const ex = makeExpect()
      const cyc = { v: 1 }
      cyc.self = cyc
      let message = ''
      try {
        ex(cyc).toEqual(1)
      } catch (e) {
        message = e.message
      }

      expect(message).toContain('Expected')
      expect(message.length).toBeLessThan(MESSAGE_CAP)
    })
    it('deepEqual still distinguishes structurally UNEQUAL DAGs', () => {
      const ex = makeExpect()

      expect(() => ex(dag(12, 1)).toEqual(dag(12, 2))).toThrow(/Expected/)
    })
  })
  describe('runtime Is() — user-facing structural equality', () => {
    it('compares two deep DAGs promptly', () => {
      expect(Is(dag(30), dag(30))).toBe(true)
    }, 10_000)
    it('distinguishes structurally unequal DAGs', () => {
      expect(Is(dag(12, 1), dag(12, 2))).toBe(false)
    })
    it('terminates on distinct-but-cyclic graphs (was: stack overflow)', () => {
      const a = { v: 1 }
      a.self = a
      const b = { v: 1 }
      b.self = b
      expect(Is(a, b)).toBe(true)
    })
  })
  describe('emitted inline Is — standalone code, no shared runtime', () => {
    it('compares two deep DAGs promptly', () => {
      const { code } = tjs(`function same(a, b) { return Is(a, b) }`)
      const saved = globalThis.__tjs
      delete globalThis.__tjs
      try {
        const same = new Function(code + '\nreturn same')()
        expect(same(dag(30), dag(30))).toBe(true)
        expect(same(dag(12, 1), dag(12, 2))).toBe(false)
      } finally {
        globalThis.__tjs = saved
      }
    }, 10_000)
  })
  describe('transpile-time harness (__deepEqual/__format in js-tests.ts)', () => {
    const DAG_SOURCE = (depth, fail) => `
function mkdag(depth: 5) {
  let n = { leaf: 1 }
  let i = 0
  while (i < depth) {
    n = { a: n, b: n }
    i = i + 1
  }
  return n
}




`
    it('a passing DAG comparison in a test block completes promptly', () => {
      const result = tjs(DAG_SOURCE(30, false), { runTests: 'report' })
      const t = (result.testResults || []).find(
        (r) => r.description === 'dag comparison'
      )
      expect(t?.passed).toBe(true)
    }, 10_000)
    it('a failing DAG comparison reports a bounded error message', () => {
      const result = tjs(DAG_SOURCE(22, true), { runTests: 'report' })
      const t = (result.testResults || []).find(
        (r) => r.description === 'dag comparison'
      )
      expect(t?.passed).toBe(false)
      expect((t?.error || '').length).toBeGreaterThan(0)
      expect((t?.error || '').length).toBeLessThan(MESSAGE_CAP)
    }, 10_000)
  })
})
