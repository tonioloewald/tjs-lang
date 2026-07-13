/**
 * `tjs-lang/editors` — the framework-free barrel (#10).
 *
 * The reason this export exists: tosijs-ui hand-rolled a weaker, line-based
 * version of scope collection because we never exported ours. The tests below
 * pin the two properties that make the real one worth importing — it is
 * AST-based (so destructuring works, which is how idiomatic examples bind
 * everything), and it drags no editor framework in behind it.
 */
import { describe, it, expect } from 'bun:test'
import {
  collectScopeSymbols,
  introspectValue,
  scopeCaptureEpilogue,
} from './index'

describe('tjs-lang/editors barrel', () => {
  it('collects destructured bindings — the case a line-based scraper misses', () => {
    const names = collectScopeSymbols(`
      const { todoApp } = tosi({ items: [] })
      const { h1, ul } = elements
      const [first, , third] = xs
      function greet() {}
    `).map((s) => s.name)

    expect(names).toContain('todoApp')
    expect(names).toContain('h1')
    expect(names).toContain('ul')
    expect(names).toContain('first')
    expect(names).toContain('third')
    expect(names).toContain('greet')
  })

  it('records origin, so a consumer can introspect the real value', () => {
    const [sym] = collectScopeSymbols(`const { h1 } = elements`)
    // To find out what `h1` IS, evaluate `elements.h1` in the live scope.
    expect(sym.origin?.expr).toBe('elements')
    expect(sym.origin?.member).toBe('h1')
  })

  it('builds a scope-capture epilogue for the run’s top-level bindings', () => {
    const epilogue = scopeCaptureEpilogue(
      `const { app } = tosi({})\nlet count = 1`,
      '__cap'
    )
    expect(epilogue).toContain('__cap({')
    expect(epilogue).toContain('app')
    expect(epilogue).toContain('count')
  })

  it('returns an empty epilogue when there is nothing to capture', () => {
    // Safe to append unconditionally.
    expect(scopeCaptureEpilogue('console.log(1)', '__cap')).toBe('')
  })

  it('cannot break the code it observes', () => {
    // The epilogue must be appendable to a real program and still run.
    const src = `const { a } = { a: 41 }\nconst b = a + 1`
    const captured: any[] = []
    const fn = new Function(
      '__cap',
      src + scopeCaptureEpilogue(src, '__cap')
    ) as (cap: (s: any) => void) => void
    fn((scope) => captured.push(scope))

    expect(captured[0]).toEqual({ a: 41, b: 42 })
  })

  it('introspects a live value into members', () => {
    const members = introspectValue({ name: 'x', go: () => {} })
    const byLabel = Object.fromEntries(members.map((m) => [m.label, m.type]))
    expect(byLabel.name).toBe('property')
    expect(byLabel.go).toBe('method')
  })
})
