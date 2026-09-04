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
function toBool(v) {
  v = __proj(v)
  try {
    if (v instanceof Boolean) return Boolean(Boolean.prototype.valueOf.call(v))
    if (v instanceof Number) return Boolean(Number.prototype.valueOf.call(v))
    if (v instanceof String) return Boolean(String.prototype.valueOf.call(v))
  } catch (e) {}
  return Boolean(v)
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { toBool }
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect, beforeEach } from 'bun:test'

import { transpileToJS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/js'

import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

/* line 12 */
function run(src) {
  const r = transpileToJS(src)
  globalThis.__tjs = createRuntime()
  try {
    const fn = new Function(r.code + '\nreturn f')()
    return fn()
  } finally {
    delete globalThis.__tjs
  }
}
run.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:12',
}

/* line 23 */
function emit(src) {
  return transpileToJS(src).code
}
emit.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:23',
}

describe('Boolean coercion rewriter (TjsStandard)', () => {
  beforeEach(() => {
    delete globalThis.__tjs
  })
  describe('truthiness contexts unwrap boxed primitives', () => {
    it('fixes `if (new Boolean(false))`', () => {
      const out = run(
        `function f(){ if (new Boolean(false)) return 'truthy'; return 'falsy' }`
      )
      expect(out).toBe('falsy')
    })
    it('fixes `while (new Boolean(false))`', () => {
      const out = run(
        `function f(){ let n = 0; const g = new Boolean(false); while (g) { n++; if (n>2) break }; return n }`
      )
      expect(out).toBe(0)
    })
    it('fixes `do {} while (new Boolean(false))`', () => {
      const out = run(
        `function f(){ let n = 0; const g = new Boolean(false); do { n++ } while (g && n < 3); return n }`
      )
      expect(out).toBe(1)
    })
    it('fixes `for (_; new Boolean(false); _)`', () => {
      const out = run(
        `function f(){ let n = 0; const g = new Boolean(false); for (let i = 0; g; i++) { n++; if (n>2) break }; return n }`
      )
      expect(out).toBe(0)
    })
    it('fixes `!new Boolean(false)`', () => {
      const out = run(`function f(){ return !new Boolean(false) }`)
      expect(out).toBe(true)
    })
    it('fixes `new Boolean(false) ? a : b`', () => {
      const out = run(`function f(){ return new Boolean(false) ? 'a' : 'b' }`)
      expect(out).toBe('b')
    })
    it('fixes `Boolean(new Boolean(false))`', () => {
      const out = run(`function f(){ return Boolean(new Boolean(false)) }`)
      expect(out).toBe(false)
    })
  })
  describe('logical operators preserve value-returning semantics', () => {
    it('`new Boolean(false) || x` returns x', () => {
      const out = run(`function f(){ return (new Boolean(false)) || 'right' }`)
      expect(out).toBe('right')
    })
    it('`new Boolean(true) || x` returns the wrapper (truthy LHS wins)', () => {
      const out = run(`function f(){ return (new Boolean(true)) || 'right' }`)

      expect(typeof out).toBe('object')
      expect(out.valueOf()).toBe(true)
    })
    it('`new Boolean(false) && x` returns the wrapper (falsy LHS short-circuits)', () => {
      const out = run(`function f(){ return (new Boolean(false)) && 'right' }`)
      expect(typeof out).toBe('object')
      expect(out.valueOf()).toBe(false)
    })
    it('`new Boolean(true) && x` returns x', () => {
      const out = run(`function f(){ return (new Boolean(true)) && 'right' }`)
      expect(out).toBe('right')
    })
    it("`a || b` doesn't double-evaluate side effects", () => {
      const out = run(
        `function f(){ let n = 0; const inc = () => { n++; return new Boolean(false) }; const r = inc() || inc(); return n }`
      )
      expect(out).toBe(2)
    })
  })
  describe('nested coercion contexts', () => {
    it('handles `if (a && b)`', () => {
      const out = run(
        `function f(){ const a = new Boolean(false); const b = true; if (a && b) return 'in'; return 'out' }`
      )
      expect(out).toBe('out')
    })
    it('handles `if (!(a && b))`', () => {
      const out = run(
        `function f(){ const a = new Boolean(false); const b = true; if (!(a && b)) return 'not'; return 'is' }`
      )
      expect(out).toBe('not')
    })
    it('handles `f(a && b)` (LogicalExpression inside CallExpression)', () => {
      const out = run(
        `function f(){ const a = new Boolean(false); const id = (x) => x; const r = id(a && true); return Boolean(r) }`
      )
      expect(out).toBe(false)
    })
  })
  describe('does not break normal JS', () => {
    it('truthy primitives still truthy', () => {
      const out = run(`function f(){ if (1) return 'in'; return 'out' }`)
      expect(out).toBe('in')
    })
    it('falsy primitives still falsy', () => {
      const out = run(`function f(){ if (0) return 'in'; return 'out' }`)
      expect(out).toBe('out')
    })
    it('plain objects still truthy', () => {
      const out = run(`function f(){ if ({}) return 'in'; return 'out' }`)
      expect(out).toBe('in')
    })
    it('arrays still truthy', () => {
      const out = run(`function f(){ if ([]) return 'in'; return 'out' }`)
      expect(out).toBe('in')
    })
    it('?? is unchanged (only checks null/undefined, not truthy)', () => {
      const out = run(`function f(){ return null ?? 'fallback' }`)
      expect(out).toBe('fallback')
    })
    it('`new Boolean(false) ?? x` returns the wrapper (it is not null/undef)', () => {
      const out = run(`function f(){ return (new Boolean(false)) ?? 'x' }`)
      expect(typeof out).toBe('object')
    })
    it('`Boolean(true)` (no boxed arg) still returns true', () => {
      const out = run(`function f(){ return Boolean(1) }`)
      expect(out).toBe(true)
    })
  })
  describe('mode gating', () => {
    it('TjsCompat disables the rewrite (preserves JS footgun)', () => {
      const r = transpileToJS(
        `TjsCompat\nfunction f(){ if (new Boolean(false)) return 'truthy'; return 'falsy' }`
      )
      globalThis.__tjs = createRuntime()
      try {
        const fn = new Function(r.code + '\nreturn f')()

        expect(fn()).toBe('truthy')
      } finally {
        delete globalThis.__tjs
      }
    })
    it('emits __tjs.toBool calls under TjsStandard', () => {
      const code = emit(`function f(){ if (x) return 1 }`)
      expect(code).toContain('__tjs.toBool(')
    })
    it('does not emit __tjs.toBool calls under TjsCompat', () => {
      const code = emit(`TjsCompat\nfunction f(){ if (x) return 1 }`)
      expect(code).not.toContain('__tjs.toBool(')
    })
  })
  describe('inline-runtime fallback includes toBool', () => {
    it('emitted code includes toBool function when used', () => {
      const code = emit(`function f(){ if (x) return 1 }`)

      expect(code).toContain('function toBool')
    })
  })
})
