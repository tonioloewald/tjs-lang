/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { switchToGiven } from '/Users/tonioloewald/tjs-lang/src/lang/switch-to-given'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 14 */
function agree(src, name, inputs) {
  const out = switchToGiven(src)
  const load = (code) =>
    new Function(
      tjs(code, { runTests: false }).code.replace(/^export /gm, '') +
        `\nreturn ${name}`
    )()

  const before = load(src)
  const after = load(out.code)
  for (const i of inputs) {
    expect(after(i), `input ${JSON.stringify(i)}`).toEqual(before(i))
  }
  return out
}
agree.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    name: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    inputs: {
      type: {
        kind: 'array',
        items: {
          kind: 'null',
        },
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:14',
}

describe('rewrites where it provably means the same thing', () => {
  const SAFE = `export function area(s: any):! 0.0 {
  switch (s.kind) {
    case 'circle':
      return 3.14 * s.r * s.r
    case 'rect':
    case 'square':
      return s.w * s.h
    default:
      return 0
  }
}`
  it('produces `given`, and behaviour is unchanged', () => {
    const out = agree(SAFE, 'area', [
      { kind: 'circle', r: 2 },
      { kind: 'rect', w: 3, h: 4 },
      { kind: 'square', w: 2, h: 2 },
      { kind: 'tri' },
    ])
    expect(out.rewritten).toBe(1)
    expect(out.notes).toEqual([])
    expect(out.code).toContain('given s.kind {')

    expect(out.code).not.toMatch(/\bswitch\s*\(/)
  })
  it('stacked empty arms become multi-value — they were never fallthrough', () => {
    expect(switchToGiven(SAFE).code).toContain("'rect', 'square' {")
  })
  it('`default` becomes the `else` block', () => {
    expect(switchToGiven(SAFE).code).toContain('} else {')
  })
  it('drops the trailing `break`, which `given` makes implicit', () => {
    const src = `export function f(x: any):! 0 {
  let n = 0
  switch (x) {
    case 'a':
      n = 1
      break
    case 'b':
      n = 2
      break
  }
  return n
}`
    const out = agree(src, 'f', ['a', 'b', 'z'])
    expect(out.rewritten).toBe(1)

    expect(out.code).not.toMatch(/^\s*break\b/m)
  })
  it('carries a note explaining the change, at the site', () => {
    expect(switchToGiven(SAFE).code).toContain('upgraded from `switch`')
  })
})

describe('DECLINES where it would change behaviour', () => {
  const CASCADE = `export function f(x: any):! '' {
  const out = []
  switch (x) {
    case 'a':
      out.push(1)
    case 'b':
      out.push(2)
  }
  return out.join(',')
}`
  it('a real cascade is left as `switch`', () => {
    const out = switchToGiven(CASCADE)
    expect(out.rewritten).toBe(0)
    expect(out.code).toBe(CASCADE)
  })
  it('and says why, with the remedy', () => {
    const out = switchToGiven(CASCADE)
    expect(out.notes).toHaveLength(1)
    expect(out.notes[0]).toContain('cascade')
    expect(out.notes[0]).toContain('break')
  })
  it('an arm ending in a nested loop `break` is NOT treated as terminating', () => {
    const src = `export function f(x: any):! 0 {
  let n = 0
  switch (x) {
    case 0:
      for (;;) { n = 1; break }
    case 1:
      n = n + 10
  }
  return n
}`
    expect(switchToGiven(src).rewritten).toBe(0)
  })
  it('an if/else where BOTH branches leave is convertible', () => {
    const src = `export function f(x: any):! 0 {
  switch (x) {
    case 'a':
      if (x == 'a') { return 1 } else { return 2 }
    case 'b':
      return 3
  }
  return 0
}`
    const out = agree(src, 'f', ['a', 'b', 'z'])
    expect(out.rewritten).toBe(1)
  })
})

describe('comments survive, which is most of the value of the file', () => {
  const COMMENTED = `export function f(x: any):! 0 {
  switch (x) {
    // why this arm exists
    case 'a':
      return 1
    /* a block comment
       over two lines */
    case 'b':
      return 2
    default:
      // the leftover
      return 0
    // trailing, after the last arm
  }
}`
  it('carries every comment across', () => {
    const out = switchToGiven(COMMENTED)
    expect(out.rewritten).toBe(1)
    for (const c of [
      'why this arm exists',
      'a block comment',
      'over two lines',
      'the leftover',
      'trailing, after the last arm',
    ]) {
      expect(out.code, `lost: ${c}`).toContain(c)
    }
  })
  it('and the result still transpiles', () => {
    expect(() =>
      tjs(switchToGiven(COMMENTED).code, { runTests: false })
    ).not.toThrow()
  })
})

describe('things that must not break', () => {
  it('leaves a file with no switch exactly as it was', () => {
    const src = `export function f(x: 0):! 0 { return x + 1 }`
    const out = switchToGiven(src)
    expect(out.code).toBe(src)
    expect(out.rewritten).toBe(0)
  })
  it('parses TJS, not just JavaScript', () => {
    const src = `export function f(x: any):! 0 {
  switch (x) {
    case 'a': return 1
  }
  return 0
}`
    expect(switchToGiven(src).rewritten).toBe(1)
  })
  it('a `switch` inside a `switch` converts both', () => {
    const src = `export function f(a: any, b: any):! 0 {
  switch (a) {
    case 'x':
      switch (b) {
        case 1: return 11
        default: return 10
      }
    default:
      return 0
  }
}`
    const out = switchToGiven(src)
    expect(out.rewritten).toBe(2)
    expect(out.code.match(/given /g)).toHaveLength(2)
    const f = new Function(
      tjs(out.code, { runTests: false }).code.replace(/^export /gm, '') +
        '\nreturn f'
    )()
    expect([f('x', 1), f('x', 9), f('y', 1)]).toEqual([11, 10, 0])
  })
  it('the word `switch` inside a string is not code', () => {
    const src = `export function f(x: 0):! '' { return "switch (x) { case 1: }" }`
    expect(switchToGiven(src).code).toBe(src)
  })
})
