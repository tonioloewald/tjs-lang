/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  declaredClassNames,
  dropRedundantNew,
  newExpressionPattern,
} from '/Users/tonioloewald/tjs-lang/src/lang/declared-classes'

import { validateNoNew } from '/Users/tonioloewald/tjs-lang/src/lang/parser-transforms'

/* line 27 */
function rejects(src) {
  try {
    validateNoNew(src)
    return false
  } catch {
    return true
  }
}
rejects.__tjs = {
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
      kind: 'boolean',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:27',
}

describe('rewriting `new` on a locally-declared class', () => {
  const CLS = 'class Point { constructor(x) { this.x = x } }\n'
  it('rewrites the call form', () => {
    expect(dropRedundantNew(`${CLS}const p = new Point(1)`)).toContain(
      'const p = Point(1)'
    )
  })
  it('rewrites the PAREN-LESS form — the case that shipped broken', () => {
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
    expect(rejects(`${CLS}const p = new Point(1)`)).toBe(true)
    expect(rejects(`${CLS}const p = new Point;`)).toBe(true)
  })
  it('names the source form in the diagnostic, not an invented one', () => {
    let message = ''
    try {
      validateNoNew(`${CLS}const p = new Point;`)
    } catch (e) {
      message = String(e.message)
    }
    expect(message).toContain('`new Point`')
  })
})

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
    expect(dropRedundantNew(SRC)).toContain('new Shape.Circle(2)')
  })
  it('a bare `new Shape(…)` is still rejected (control)', () => {
    expect(() =>
      validateNoNew(`class Shape { constructor() {} }\nconst s = new Shape()\n`)
    ).toThrow(/not allowed in TJS/)
  })
})

describe('one predicate for `new X`', () => {
  const REWRITE_CASES = [
    [
      'whitespace then dot',
      'class Shape {}\nconst c = new Shape\n  .Circle(2)',
      false,
    ],
    [
      'comment then dot',
      'class Shape {}\nconst c = new Shape /* why */ .Circle(2)',
      false,
    ],
    ['computed member', 'class Reg {}\nconst r = new Reg[key]()', false],
    ['bare new', 'class Point {}\nconst p = new Point', true],
    ['new with parens', 'class Point {}\nconst p = new Point(1)', true],
  ]
  for (const [label, src, shouldRewrite] of REWRITE_CASES) {
    it(`rewriter: ${label} ${
      shouldRewrite ? 'IS' : 'is NOT'
    } a construction`, () => {
      const out = dropRedundantNew(src)
      expect(out.includes('new ')).toBe(!shouldRewrite)
    })
    it(`checker agrees: ${label}`, () => {
      const check = () => validateNoNew(src)
      if (shouldRewrite) expect(check).toThrow(/not allowed in TJS/)
      else expect(check).not.toThrow()
    })
  }
  it('an exempt `new X.Y()` does not silence a real violation later in the file', () => {
    expect(() =>
      validateNoNew(
        `class Shape { static Circle = class {} }\nclass Point {}\nconst c = new Shape\n  .Circle(2)\nconst p = new Point(1)\n`
      )
    ).toThrow(/new Point/)
  })
  it('every violation is counted, not just the first', () => {
    try {
      validateNoNew(
        `class P {}\nconst a = new P()\nconst b = new P()\nconst c = new P()\n`
      )
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.message).toContain('3 occurrences in total')
    }
  })
})
