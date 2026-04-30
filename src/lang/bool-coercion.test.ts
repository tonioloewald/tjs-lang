/**
 * Boolean coercion rewriter tests.
 *
 * Verifies that `Boolean(new Boolean(false)) === true` and friends are
 * fixed under TjsStandard mode.
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { transpileToJS } from './emitters/js'
import { createRuntime } from './runtime'

function run(src: string): any {
  const r = transpileToJS(src)
  ;(globalThis as any).__tjs = createRuntime()
  try {
    const fn = new Function(r.code + '\nreturn f')()
    return fn()
  } finally {
    delete (globalThis as any).__tjs
  }
}

function emit(src: string): string {
  return transpileToJS(src).code
}

describe('Boolean coercion rewriter (TjsStandard)', () => {
  beforeEach(() => {
    delete (globalThis as any).__tjs
  })

  describe('truthiness contexts unwrap boxed primitives', () => {
    it('fixes `if (new Boolean(false))`', () => {
      const out = run(`function f(){ if (new Boolean(false)) return 'truthy'; return 'falsy' }`)
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
      expect(out).toBe(1) // body runs once, then condition is checked & is false
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
      const out = run(
        `function f(){ return (new Boolean(false)) || 'right' }`
      )
      expect(out).toBe('right')
    })

    it('`new Boolean(true) || x` returns the wrapper (truthy LHS wins)', () => {
      const out = run(`function f(){ return (new Boolean(true)) || 'right' }`)
      // LHS is truthy after unwrap, so JS-style && returns the original LHS
      expect(typeof out).toBe('object')
      expect(out.valueOf()).toBe(true)
    })

    it('`new Boolean(false) && x` returns the wrapper (falsy LHS short-circuits)', () => {
      const out = run(
        `function f(){ return (new Boolean(false)) && 'right' }`
      )
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
      expect(out).toBe(2) // both inc() called once each
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
      ;(globalThis as any).__tjs = createRuntime()
      try {
        const fn = new Function(r.code + '\nreturn f')()
        // Native JS behavior: boxed Boolean(false) is truthy
        expect(fn()).toBe('truthy')
      } finally {
        delete (globalThis as any).__tjs
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
      // Under TjsStandard, the rewrite is applied → __tjs.toBool is referenced
      // → inline runtime includes the function definition
      expect(code).toContain('function toBool')
    })
  })
})
