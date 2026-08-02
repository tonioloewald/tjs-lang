/**
 * `unsafe <expression>` — the per-construct escape.
 *
 * The design goal is that the FILE EXTENSION is the only gate, the way ESM made
 * `"use strict"` implicit. That only works if the rules are unconditional, and rules can
 * only be unconditional if legitimate exceptions are expressible AT THE SITE. A per-file
 * mode opt-out cannot do that: disabling a rule for a whole file also silences the next,
 * accidental use of it.
 *
 * So `unsafe` marks one construct as deliberate. It has zero runtime cost — the marker is
 * a compile-time assertion of intent, removed before emit.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { stripUnsafeMarkers, maskUnsafe } from '../strip-comments'

const compile = (src: string) => tjs(src, { runTests: false })

describe('unsafe exempts one construct', () => {
  it('permits a construct the rule would reject', () => {
    expect(() =>
      compile(
        `function f(x: 0) { const d = unsafe new Date(x)\n return d.getTime() }`
      )
    ).not.toThrow()
  })

  it('the rule still applies everywhere else — that is the whole point', () => {
    expect(() =>
      compile(`function f(x: 0) { return new Date(x).getTime() }`)
    ).toThrow(/new Date\(\) is not allowed/)
  })

  it('works for the other flagged constructs', () => {
    expect(() =>
      compile(`function f() { return unsafe Date.now() }`)
    ).not.toThrow()
    expect(() =>
      compile(`function f(s: '') { return unsafe new Function(s) }`)
    ).not.toThrow()
  })

  it('works in argument position, not just at statement level', () => {
    expect(() =>
      compile(`function f() { return [unsafe Date.now(), 1] }`)
    ).not.toThrow()
  })

  it('leaves no trace in the output — zero runtime cost', () => {
    const code = compile(
      `function f(x: 0) { const d = unsafe new Date(x)\n return d.getTime() }`
    ).code
    expect(code).not.toContain('unsafe')
    expect(code).toContain('new Date(')
  })
})

describe('unsafe does not break legal JavaScript (TJS ⊇ JS)', () => {
  // Reserving the keyword would be simpler, but a variable named `unsafe` is legal JS and
  // must stay legal — a subset violation is a bug (PRINCIPLES.md).
  it('a variable named `unsafe` still works', () => {
    expect(() =>
      compile(`function f() { const unsafe = 1\n return unsafe }`)
    ).not.toThrow()
  })

  it('ASI hazard: `unsafe` at end of line does NOT swallow the next statement', () => {
    // `let r = unsafe` / `foo()` is two statements in JS. Only a SAME-LINE `unsafe foo()`
    // is the marker, because juxtaposed expressions on one line are not valid JS and so
    // cannot mean anything else.
    const src = `const unsafe = 1\nlet r = unsafe\nfoo()\n`
    expect(stripUnsafeMarkers(src)).toBe(src)
  })

  it('a same-line marker IS recognised', () => {
    expect(stripUnsafeMarkers(`let d = unsafe new Date(1)\n`)).toBe(
      `let d =        new Date(1)\n`
    )
  })

  it('offsets are preserved so reported positions stay accurate', () => {
    const src = `let d = unsafe new Date(1)\n`
    expect(stripUnsafeMarkers(src)).toHaveLength(src.length)
    expect(maskUnsafe(src)).toHaveLength(src.length)
  })

  it('`unsafe` inside a string or comment is not a marker', () => {
    const src = `const s = 'unsafe new Date(1)'\n// unsafe new Date(2)\n`
    expect(maskUnsafe(src)).toBe(src)
  })
})
