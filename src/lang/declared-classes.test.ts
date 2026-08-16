/**
 * The converter and the checker agree about `new X`, because they are one rule.
 *
 * `new` on a locally-declared class is an error in TJS, and that idea was implemented
 * twice in the same release: the converter REWROTE `new X(` -> `X(` and required the
 * paren, the validator REJECTED `new X` and did not. The disagreement was reachable in two
 * shipped CLI commands:
 *
 *     tjs convert pt.ts --emit-tjs    # leaves `const p = new Point;` verbatim
 *     tjs check pt.tjs                # exit 1: "`new Point()` is not allowed in TJS"
 *
 * A migration on-ramp that emits source its own checker rejects is the worst version of
 * this bug: the user did what the tool told them to and the tool then blamed them.
 *
 * The last describe block is the one that matters. Testing the paren-less case only fixes
 * the instance; asserting that NOTHING the rewriter leaves behind is rejected by the
 * validator fixes the class, and would have failed on the original pair.
 */
import { describe, it, expect } from 'bun:test'
import {
  declaredClassNames,
  dropRedundantNew,
  newExpressionPattern,
} from './declared-classes'
import { validateNoNew } from './parser-transforms'
import { validateNoNew } from './parser-transforms'

const rejects = (src: string): boolean => {
  try {
    validateNoNew(src)
    return false
  } catch {
    return true
  }
}

describe('rewriting `new` on a locally-declared class', () => {
  const CLS = 'class Point { constructor(x) { this.x = x } }\n'

  it('rewrites the call form', () => {
    expect(dropRedundantNew(`${CLS}const p = new Point(1)`)).toContain(
      'const p = Point(1)'
    )
  })

  it('rewrites the PAREN-LESS form — the case that shipped broken', () => {
    // `new Point` is a zero-argument construction, so `Point()`.
    expect(dropRedundantNew(`${CLS}const p = new Point;`)).toContain(
      'const p = Point();'
    )
  })

  it('leaves a built-in alone — `new` is mandatory there', () => {
    const src = `${CLS}const d = new Date(0)\nconst m = new Map()`
    const out = dropRedundantNew(src)
    expect(out).toContain('new Date(0)')
    expect(out).toContain('new Map()')
  })

  it('leaves `new X.Inner()` alone — that constructs something else', () => {
    const src = `${CLS}const i = new Point.Inner()`
    expect(dropRedundantNew(src)).toContain('new Point.Inner()')
  })

  it('does not rewrite inside a string or a comment', () => {
    const src = `${CLS}const s = 'new Point(1)'\n// new Point(2)\n`
    const out = dropRedundantNew(src)
    expect(out).toContain("'new Point(1)'")
    expect(out).toContain('// new Point(2)')
  })

  it('does not confuse a name with a longer one sharing its prefix', () => {
    const src =
      'class Point {}\nclass PointList {}\nconst a = new PointList(1)\n'
    expect(dropRedundantNew(src)).toContain('const a = PointList(1)')
  })
})

describe('finding declared classes', () => {
  it('ignores a `class` mentioned in a string or comment', () => {
    expect(
      declaredClassNames("const s = 'class Ghost {}'\n// class Phantom {}")
    ).toEqual([])
  })

  it('deduplicates', () => {
    expect(declaredClassNames('class A {}\nclass A {}')).toEqual(['A'])
  })

  it('the pattern is not vacuous', () => {
    const re = newExpressionPattern(['A'])
    expect('new A(1)'.match(re)?.length).toBe(1)
  })
})

/**
 * The invariant, not the instance.
 */
describe('the rewriter and the validator cannot disagree', () => {
  const CLS = 'class Point { constructor(x) { this.x = x } }\n'

  const CASES = [
    `${CLS}const p = new Point(1)`,
    `${CLS}const p = new Point;`,
    `${CLS}const p = new Point`,
    `${CLS}const p = new    Point   (1)`,
    `${CLS}const p = new Point()\nconst q = new Point`,
    `${CLS}function f() { return new Point(1) }`,
    'class Point {}\nclass PointList {}\nconst a = new PointList(1)\nconst b = new Point\n',
  ]

  for (const src of CASES) {
    const label = src.split('\n').slice(1).join(' ').trim().slice(0, 48)
    it(`converter output passes the checker: ${label}`, () => {
      const converted = dropRedundantNew(src)
      expect(
        rejects(converted) ? `REJECTED: ${converted}` : 'accepted',
        'the converter emitted TJS that our own checker refuses'
      ).toBe('accepted')
    })
  }

  it('the checker still rejects what the converter never produces', () => {
    // Control: if `validateNoNew` accepted everything, every assertion above would be
    // vacuous. Hand-written `new Point` must still be an error.
    expect(rejects(`${CLS}const p = new Point(1)`)).toBe(true)
    expect(rejects(`${CLS}const p = new Point;`)).toBe(true)
  })

  it('names the source form in the diagnostic, not an invented one', () => {
    // It used to say "`new Point()` is not allowed" for source reading `new Point`,
    // sending the reader to look for a call that is not there.
    let message = ''
    try {
      validateNoNew(`${CLS}const p = new Point;`)
    } catch (e: any) {
      message = String(e.message)
    }
    expect(message).toContain('`new Point`')
  })
})

/**
 * `new X.Y()` is a construction of `Y`, and the checker must agree with the converter.
 *
 * `validateNoNew` built its own per-class regex, and `\b` after the name is satisfied by a
 * `.` — so `new Shape.Circle(2)` matched as `new Shape`. `tjs convert` emits that line
 * verbatim (correctly: `dropRedundantNew` exempts member access) and `tjs check` then
 * rejected it, naming the WRONG class and offering a remedy that is runtime-fatal if
 * followed — `Shape(…)` is not what the author wrote, and calling a class constructor
 * without `new` throws.
 *
 * Converter-and-checker disagreement is precisely what this module was created to end. It
 * shared the name list but not the match, which is the subtler half of the same mistake.
 *
 * The CASES array above has no member-access form, which is why nothing caught it.
 */
describe('member access is not a construction of the outer name', () => {
  const SRC = `class Shape {
  static Circle = class { constructor(r) { this.r = r } }
}
const c = new Shape.Circle(2)
`

  it('the checker accepts it', () => {
    expect(() => validateNoNew(SRC)).not.toThrow()
  })

  it('the rewriter leaves it alone', () => {
    // Both halves of the agreement, asserted together — that is the invariant.
    expect(dropRedundantNew(SRC)).toContain('new Shape.Circle(2)')
  })

  it('a bare `new Shape(…)` is still rejected (control)', () => {
    // Without this, exempting everything would pass both tests above and delete the rule.
    expect(() =>
      validateNoNew(`class Shape { constructor() {} }\nconst s = new Shape()\n`)
    ).toThrow(/not allowed in TJS/)
  })
})
