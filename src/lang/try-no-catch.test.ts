/**
 * A `try` with no `catch` turns a throw into a MonadicError, with or without a shared runtime
 * (#4116). It built `new (__tjs?.MonadicError ?? Error)`, so standalone (the inline runtime only)
 * it made a plain Error: `isMonadicError` was false, and a checked callee replaced it with a new
 * error instead of passing it on.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

const SRC = `function risky(x: 0) { try { if (x > 1) { throw new Error('too big') } \n return x } }
function describe2(n: 0) { return 'n=' + n }
const r = risky(5)
const through = describe2(r)
const ok = isMonadicError(r)`

for (const withRuntime of [false, true])
  describe(`try without catch (${
    withRuntime ? 'shared runtime' : 'standalone'
  })`, () => {
    const load = () => {
      const saved = (globalThis as any).__tjs
      if (withRuntime) (globalThis as any).__tjs = createRuntime()
      else delete (globalThis as any).__tjs
      try {
        return new Function(tjs(SRC).code + '\nreturn [r, through, ok]')()
      } finally {
        ;(globalThis as any).__tjs = saved
      }
    }
    it('the throw becomes a MonadicError that propagates unchanged', () => {
      const [r, through, ok] = load()
      expect(ok).toBe(true)
      expect(r.message).toBe('too big')
      expect(through).toBe(r)
    })
  })
