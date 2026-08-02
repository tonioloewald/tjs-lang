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
import { fromTS } from './emitters/from-ts'

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

describe('abolishing a mode (TjsDate was the first)', () => {
  // The end state: the file extension is the only gate. A rule that can be dialed off
  // per-file is not a rule, and once a per-file lever exists it needs a spelling — which
  // is how the mode system grew. `unsafe` replaces the lever, so the mode can go.
  it('the rule cannot be dialed off in native TJS', () => {
    const src = `function f(x: 0) { return new Date(x).getTime() }`
    expect(() => compile(src)).toThrow(/new Date\(\) is not allowed/)
    // …and no directive rescues it, because there is no directive any more.
    expect(() => compile(`TjsStrict\n${src}`)).toThrow(
      /new Date\(\) is not allowed/
    )
  })

  it('an abolished directive TEACHES instead of becoming a ReferenceError', () => {
    // Left unhandled, a removed directive is just a bare identifier — it would emit
    // `TjsDate is not defined` at runtime, which explains nothing.
    expect(() => compile(`TjsDate\nfunction f(x: 0) { return x }`)).toThrow(
      /no longer a mode.*unsafe new Date/s
    )
  })

  it('plain JS keeps raw Date — abolishing a mode must not break TJS ⊇ JS', () => {
    expect(() =>
      tjs(`function f(x) { return new Date(x).getTime() }`, {
        runTests: false,
        dialect: 'js',
      })
    ).not.toThrow()
  })
})

describe('/* @tjs-unsafe */ — the bridge for TypeScript source', () => {
  // TJS-only syntax cannot appear in a .ts file: tsc rejects `unsafe new Date(x)`. Without
  // a bridge, a TypeScript source that legitimately needs an exception has no way to say
  // so — which is what kept our own Timestamp.ts and LegalDate.ts from graduating.
  it('converts to the real marker and satisfies the rule', () => {
    const ts = `export function f(x: number): number {\n  const d = /* @tjs-unsafe */ new Date(x)\n  return d.getTime()\n}\n`
    const converted = fromTS(ts, { emitTJS: true }).code
    expect(converted).toContain('unsafe new Date(')
    expect(converted).not.toContain('@tjs-unsafe')

    // …and the result compiles with the rule ON, which is the whole point.
    expect(() =>
      compile(converted.replace(/\/\* tjs <- [^*]*\*\/\n?/, ''))
    ).not.toThrow()
  })

  it('an UNannotated new Date() in the same file is still caught', () => {
    // The reason this is per-construct rather than per-file: the accidental one must
    // still fail.
    const ts = `export function f(x: number): number {\n  return new Date(x).getTime()\n}\n`
    const converted = fromTS(ts, { emitTJS: true }).code
    expect(() =>
      compile(converted.replace(/\/\* tjs <- [^*]*\*\/\n?/, ''))
    ).toThrow(/new Date\(\) is not allowed/)
  })
})
