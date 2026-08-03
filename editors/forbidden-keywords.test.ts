import { describe, it, expect } from 'bun:test'
import { tjs } from '../src/lang'
import { FORBIDDEN_KEYWORDS as TJS_FORBIDDEN } from './tjs-syntax'
import { FORBIDDEN_KEYWORDS as AJS_FORBIDDEN } from './ajs-syntax'

/**
 * The editor's idea of "forbidden" must match the compiler's.
 *
 * The TJS list was derived by subtracting a 14-item allow-list from AJS's 42-item list, so
 * it encoded the AJS SANDBOX's restrictions rather than TJS's. Measured: 41 of those 42
 * tokens are legal TJS. `switch`/`case`/`default` are ordinary control flow;
 * `type`/`module`/`is`/`as` are ordinary identifiers — all painted red in the live
 * playground and in every consumer of `tjs-lang/editors/codemirror`. A shipped example got
 * three false squiggles on the property name `type`.
 *
 * A highlighter that disagrees with the compiler teaches the language wrongly, and it is
 * the first thing a new user sees. So both directions are checked: what is listed must
 * genuinely fail, and what was removed must genuinely compile.
 */

/** Does `.tjs` accept this token in a plausible legal-JavaScript position? */
function isLegalTJS(token: string): boolean {
  const shapes = [
    `function f() { const ${token} = 1; return ${token} }`,
    `function f(o = {}) { return o.${token} }`,
  ]
  return shapes.some((src) => {
    try {
      tjs(src, { runTests: false })
      return true
    } catch {
      return false
    }
  })
}

describe('the TJS forbidden list matches what the compiler rejects', () => {
  for (const token of TJS_FORBIDDEN) {
    it(`\`${token}\` is genuinely rejected`, () => {
      // `eval` is rejected as a CALL, which is the only way anyone writes it.
      const src =
        token === 'eval'
          ? `function f(s: '') { return eval(s) }`
          : `function f() { ${token} x = 1; return x }`
      expect(() => tjs(src, { runTests: false })).toThrow()
    })
  }

  it('does not paint legal TJS red', () => {
    const falsePositives = TJS_FORBIDDEN.filter((t) => t !== 'eval').filter(
      isLegalTJS
    )
    expect(
      falsePositives,
      'these are legal TJS and must not be flagged by the editor'
    ).toEqual([])
  })

  it('the tokens removed from the AJS list really are legal', () => {
    // The regression this replaces, stated positively: everything AJS forbids and TJS
    // does not must actually compile. If one of these starts failing, the LIST is not
    // wrong — the language changed, and that deserves a deliberate decision.
    const wronglyRejected = AJS_FORBIDDEN.filter(
      (t) => !(TJS_FORBIDDEN as readonly string[]).includes(t)
    ).filter((t) => !isLegalTJS(t))
    expect(
      wronglyRejected,
      'AJS forbids these and TJS is supposed to allow them'
    ).toEqual([])
  })

  it('AJS keeps its own, longer list — it is a sandbox', () => {
    // Guard against someone "simplifying" by pointing both at the same array.
    expect(AJS_FORBIDDEN.length).toBeGreaterThan(TJS_FORBIDDEN.length * 5)
    expect(AJS_FORBIDDEN).toContain('new')
    expect(TJS_FORBIDDEN as readonly string[]).not.toContain('new')
  })
})
