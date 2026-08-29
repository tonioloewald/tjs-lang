/**
 * `switch` → `given`, and — more importantly — where it refuses.
 *
 * Adding a better construct is not fixing the language; existing code keeps the defect. But
 * an upgrade you have to check by hand is worth nothing, so the interesting assertions here
 * are the ones about DECLINING: the rewrite must never change behaviour, and must say so
 * where it cannot proceed.
 */
import { describe, it, expect } from 'bun:test'
import { switchToGiven } from './switch-to-given'
import { tjs } from './index'

/** Run the rewritten TJS and the original, and demand they agree. */
function agree(src: string, name: string, inputs: unknown[]) {
  const out = switchToGiven(src)
  const load = (code: string) =>
    new Function(
      tjs(code, { runTests: false }).code.replace(/^export /gm, '') +
        `\nreturn ${name}`
    )()
  // The ORIGINAL is run as plain JS semantics, because `switch` means C's `switch`.
  const before = load(src)
  const after = load(out.code)
  for (const i of inputs) {
    expect(after(i), `input ${JSON.stringify(i)}`).toEqual(before(i))
  }
  return out
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
    // No `switch` STATEMENT left — the words `switch` and `break` survive in the note, which
    // is the point of the note, so a bare `not.toContain` here would assert against itself.
    expect(out.code).not.toMatch(/\bswitch\s*\(/)
  })

  it('stacked empty arms become multi-value — they were never fallthrough', () => {
    // `case 'rect': case 'square':` is how C spells "these share a block". `given` spells it
    // directly, so this is the one place the rewrite makes the code shorter as well as safer.
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
    // Dead code in `given`, so it must not survive as a statement.
    expect(out.code).not.toMatch(/^\s*break\b/m)
  })

  it('carries a note explaining the change, at the site', () => {
    // The only thing that travels with a diff hunk or a snippet pasted into chat.
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
    // Arm-level analysis: `break` inside a loop exits the LOOP, so the arm still runs on.
    // Reading it as a terminator would rewrite a genuine cascade and change behaviour.
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
    // The other side of that analysis — it must not be so conservative it converts nothing.
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
    // The first version deleted all of them: arm text is sliced from the first statement to
    // the last, so anything between arms simply vanished — on our own source that destroyed
    // a twenty-line rationale block, silently, while every test stayed green.
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
    // The input is TJS by definition — `f(x: any):! 0.0` stops strict acorn at the first
    // annotation. Parsing strictly made the whole file silently no-op, which reads exactly
    // like "there was nothing to convert".
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
