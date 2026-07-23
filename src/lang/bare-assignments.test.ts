import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

/**
 * `transformBareAssignments` auto-const's a FIRST bare assignment to an
 * uppercase identifier (native-TJS convenience: `Foo = Type(...)` → `const Foo`).
 * Two invariants it must respect — both were broken and are regression-guarded
 * here (a tosijs live-example crashed because `let B = null; … B = BABYLON`
 * became `const B = BABYLON`, shadowing the outer `B`):
 *   1. It is a TJS feature — must NOT touch plain JS (dialect: 'js'). TJS ⊇ JS.
 *   2. Even in TJS, it must NOT redeclare an already-declared binding.
 */
const code = (src: string, dialect: 'js' | 'tjs') =>
  tjs(src, { dialect, runTests: false }).code

describe('bare assignments (auto-const) — TJS-only, first-assignment-only', () => {
  it('dialect:js — a reassignment of a declared uppercase let is untouched', () => {
    const out = code('let B = null\nfunction f() { B = 1 }', 'js')
    expect(out).not.toContain('const B = 1')
    expect(out).toContain('B = 1')
  })

  it('dialect:js — even an undeclared uppercase assignment (implicit global) is untouched', () => {
    expect(code('Foo = 1', 'js')).not.toContain('const Foo')
  })

  it('dialect:js — the reported repro: B = BABYLON inside a method stays an assignment', () => {
    const out = code(
      'let B = null\nconst s = g({ m(el, BABYLON) { B = BABYLON } })',
      'js'
    )
    expect(out).not.toContain('const B = BABYLON')
    expect(out).toContain('B = BABYLON')
  })

  it('dialect:tjs — reassignment of a declared binding is preserved', () => {
    const out = code('let B = null\nconst s = g({ m() { B = 1 } })', 'tjs')
    expect(out).not.toContain('const B = 1')
  })

  it('dialect:tjs — the feature still fires for a FIRST assignment of an undeclared uppercase name', () => {
    expect(code('Foo = { debug: true }', 'tjs')).toContain('const Foo')
  })

  it('never rewrites lowercase identifiers (only uppercase convention)', () => {
    expect(code('foo = 1', 'tjs')).not.toContain('const foo')
  })

  // Issue #22: a bare-identifier RHS is an alias/reassignment (possibly of a
  // host-scope binding this transform can't see), NOT a definition. Native tjs
  // must not auto-const it, even with no local declaration in the snippet.
  it('dialect:tjs — bare-identifier alias is NOT auto-consted (no local decl)', () => {
    expect(code('B = BABYLON', 'tjs')).not.toContain('const B')
    const inCb = code('const s = g({ m(el, BABYLON) { B = BABYLON } })', 'tjs')
    expect(inCb).not.toContain('const B')
  })

  it('dialect:tjs — the feature still fires for a definition RHS (Type / object / call)', () => {
    expect(code('Foo = { debug: true }', 'tjs')).toContain('const Foo')
    expect(code('Bar = mkThing()', 'tjs')).toContain('const Bar')
  })
})
