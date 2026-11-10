/**
 * A `/* @tjs TjsStrict *\/` inside a STRING is text, not the file's mode (literal blindness).
 *
 * `extractTjsModes` matched its pattern over raw source, so a test file holding TypeScript
 * fixtures in template strings (one of them annotated `TjsStrict`) converted as a TjsStrict file:
 * TJS semantics for the whole file, no conversion rewrites. Found by the dogfood ratchet when
 * native TJS began refusing `new Boolean(…)` (#4012): the file's own real `new Boolean(false)`,
 * written for JavaScript semantics, was refused. The scan now reads a literal-masked view that
 * keeps comments, the view built for exactly this question (strip-comments.ts).
 */
import { describe, it, expect } from 'bun:test'
import { fromTS } from './emitters/from-ts'

describe('TjsStrict is read from comments, never from strings', () => {
  it('a template string mentioning the annotation does not set the mode', () => {
    const src = [
      'const fixture = `/* @tjs TjsStrict */ export const x = 1`',
      'export function f(a: any, b: any): boolean { return a == b }',
    ].join('\n')
    const out = fromTS(src, { emitTJS: true }).code
    expect(out.startsWith('TjsStrict')).toBe(false)
    // converted with JavaScript semantics: == is spelled out for graduation
    expect(out).toContain('DangerousLegacyEquals(a, b)')
    // and the fixture text is byte-identical
    expect(out).toContain('`/* @tjs TjsStrict */ export const x = 1`')
  })

  it('quoted inside a LINE comment does not set it either', () => {
    const src = [
      '// a `/* @tjs TjsStrict */` comment would opt in',
      'export function f(a: any, b: any): boolean { return a == b }',
    ].join('\n')
    expect(fromTS(src, { emitTJS: true }).code).toContain(
      'DangerousLegacyEquals(a, b)'
    )
  })

  it('a real annotation still sets it', () => {
    const out = fromTS(
      `/* @tjs TjsStrict */\nexport function f(a: any, b: any): boolean { return a == b }`,
      { emitTJS: true }
    ).code
    expect(out).not.toContain('DangerousLegacyEquals')
  })
})
