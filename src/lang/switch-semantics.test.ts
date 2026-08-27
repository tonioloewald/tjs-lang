/**
 * `switch` in native `.tjs` is Swift's, not C's (#43) — all four items, behaviourally.
 *
 * These assert what the emitted code DOES, not what it looks like. The transform's output
 * shape is an implementation detail; "does an arm fall through" is the promise.
 *
 * The four:
 *   1. `case` compares with `Eq` semantics, so `switch` agrees with `==` in the same file
 *   2. `case 'a', 'b':` — multiple values without fallthrough
 *   3. `break` is implicit; `fallthrough` is the opt-in keyword
 *   4. each arm has its own scope
 *
 * Item 1 is the one that gets left behind, per the issue's own implementation note: implicit
 * `break` is the visible satisfying change and the comparison fix is invisible. It is first
 * here for that reason.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

/** Transpile and return the named export, ready to call. */
const load = (src: string, name: string) =>
  new Function(tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`)()

/** A tosijs-style boxed scalar: a live proxy with no internal slot. */
const boxed = (value: unknown) =>
  new Proxy(new String(''), {
    get: (t, k) => (k === 'asCompared' ? () => value : Reflect.get(t, k)),
  })

const DISPATCH = `export function f(x: any):! '' {
  const out = []
  switch (x) {
    case 'a', 'b':
      out.push('ab')
    case 'c':
      out.push('c')
      fallthrough
    case 'd':
      out.push('d')
    case 'e':
      out.push('e')
      return out.join(',')
  }
  return out.join(',') + '|end'
}
`

describe('1. case compares the way `==` does', () => {
  it('a value-like object matches a literal case (#42, the original report)', () => {
    // The whole reason #42 was filed: `x == 'c'` was true while `switch (x) case 'c'` was
    // not, in the same file, with no operator to reach for instead.
    expect(load(DISPATCH, 'f')(boxed('c'))).toBe('c,d|end')
  })

  it('`undefined` and `null` are one key, as Eq says', () => {
    const f = load(
      `export function f(x: any):! 0 { switch (x) { case null: return 1 } return 0 }`,
      'f'
    )
    expect(f(null)).toBe(1)
    expect(f(undefined)).toBe(1)
  })

  it('NaN matches itself — which `===` cannot express', () => {
    // `Eq(NaN, NaN)` is true; a plain `switch` uses `===`, where NaN matches nothing.
    const f = load(
      `export function f(x: any):! 0 { switch (x) { case NaN: return 1 } return 0 }`,
      'f'
    )
    expect(f(NaN)).toBe(1)
    expect(f(1)).toBe(0)
  })

  it('does NOT become loose: `==` still refuses type coercion', () => {
    // The control. TJS `==` is footgun-free `===`, not `==`; `switch` must inherit exactly
    // that and no more, or this change would have smuggled in the coercion TJS removed.
    const f = load(
      `export function f(x: any):! 0 { switch (x) { case 5: return 1 } return 0 }`,
      'f'
    )
    expect(f(5)).toBe(1)
    expect(f('5')).toBe(0)
    expect(f(true)).toBe(0)
  })
})

describe('2. multi-value cases', () => {
  it('several values share one arm, without fallthrough', () => {
    const f = load(DISPATCH, 'f')
    expect(f('a')).toBe('ab|end')
    expect(f('b')).toBe('ab|end')
  })
})

describe('3. break is implicit, fallthrough is opt-in', () => {
  const f = load(DISPATCH, 'f')

  it('an arm ends by itself', () => {
    expect(f('d')).toBe('d|end')
  })

  it('`fallthrough` still cascades — and only as far as the next arm', () => {
    // 'c' says fallthrough, so 'd' runs; 'd' does NOT, so 'e' must not.
    expect(f('c')).toBe('c,d|end')
  })

  it('an arm that returns still returns', () => {
    expect(f('e')).toBe('e')
  })

  it('no match runs nothing', () => {
    expect(f('z')).toBe('|end')
  })

  it('warns at exactly the arms whose meaning changed', () => {
    // The one compatibility surface, and the reason it warns rather than silently changing:
    // 'ab' and 'd' previously fell through and no longer do. 'c' says `fallthrough`, 'e'
    // returns, and the final arm has nothing to fall into — none of those changed meaning.
    const w = (tjs(DISPATCH).warnings ?? []).filter((m) =>
      String(m).includes('falls through implicitly')
    )
    expect(w).toHaveLength(2)
  })

  it('does not warn about a `break` inside a loop inside an arm', () => {
    // Arm-level analysis: a `break` in a nested loop means "exit the loop" and must keep
    // meaning that, so the arm still needs its implicit one — but the arm genuinely did
    // fall through before, so the warning is correct here and the test pins the COUNT.
    const src = `export function f(x: any):! 0 {
  let n = 0
  switch (x) {
    case 'a':
      for (;;) { n = 1; break }
    case 'b':
      n = n + 10
  }
  return n
}`
    expect(load(src, 'f')('a')).toBe(1) // 1, not 11 — the arm ended
    const w = (tjs(src).warnings ?? []).filter((m) =>
      String(m).includes('falls through implicitly')
    )
    expect(w).toHaveLength(1)
  })

  it('an if/else where both branches return is not a fallthrough', () => {
    // `terminates()` recurses, so this must NOT warn. A diagnostic that cries wolf is the
    // failure #40 was about.
    const src = `export function f(x: any):! 0 {
  switch (x) {
    case 'a':
      if (x == 'a') { return 1 } else { return 2 }
    case 'b':
      return 3
  }
  return 0
}`
    expect(load(src, 'f')('a')).toBe(1)
    expect(
      (tjs(src).warnings ?? []).filter((m) =>
        String(m).includes('falls through implicitly')
      )
    ).toHaveLength(0)
  })

  it('stacked empty cases still stack, and are not warned about', () => {
    // The overwhelmingly common existing use of fallthrough. If this had changed, the
    // compatibility surface would have been enormous instead of nearly nil.
    const src = `export function f(x: any):! 0 {
  switch (x) {
    case 'a':
    case 'b':
      return 1
  }
  return 0
}`
    expect(load(src, 'f')('a')).toBe(1)
    expect(load(src, 'f')('b')).toBe(1)
    expect(
      (tjs(src).warnings ?? []).filter((m) =>
        String(m).includes('falls through implicitly')
      )
    ).toHaveLength(0)
  })
})

describe('4. each arm has its own scope', () => {
  it('two arms may declare the same const', () => {
    // Plain JS rejects this at PARSE time — a switch body is one block scope, so it is a
    // spec early error. Reaching this at all required bracing the arms before acorn sees
    // the source (`braceSwitchArms`).
    const src = `export function f(x: any):! 0 {
  switch (x) {
    case 'a':
      const y = 1
      return y
    case 'b':
      const y = 2
      return y
    default:
      const y = 3
      return y
  }
}`
    const f = load(src, 'f')
    expect([f('a'), f('b'), f('z')]).toEqual([1, 2, 3])
  })

  it('a hand-braced arm keeps working', () => {
    // People have been writing these for years because `no-case-declarations` made them.
    // The change must not punish the workaround it obsoletes.
    const src = `export function f(x: any):! 0 {
  switch (x) {
    case 'a': { const y = 1; return y }
    case 'b': { const y = 2; return y }
  }
  return 0
}`
    const f = load(src, 'f')
    expect([f('a'), f('b')]).toEqual([1, 2])
  })
})

describe('nesting and other things that must not break', () => {
  it('a switch inside a switch arm', () => {
    // The first implementation corrupted `src/rbac/rules.tjs` into `export func{ if (…`
    // exactly here: an outer arm patch that re-emitted its body text clobbered the inner
    // switch's patches. Every patch is now anchored in gap text instead.
    const src = `export function f(a: any, b: any):! 0 {
  switch (a) {
    case 'x':
      switch (b) {
        case 1:
          return 11
        case 2:
          return 12
      }
      return 10
    case 'y':
      return 20
  }
  return 0
}`
    const f = load(src, 'f')
    expect([f('x', 1), f('x', 2), f('x', 9), f('y', 1)]).toEqual([
      11, 12, 10, 20,
    ])
  })

  it('an arm whose last statement is a ternary return', () => {
    // The second failure: `bool-coercion` replaces a whole ternary as a SPANNING patch, and
    // an insertion sitting on that span's end boundary was relocated to before it. This is
    // the shape from `src/rbac/rules.tjs` that caught it.
    const src = `export function f(x: any):! 0 {
  switch (x) {
    case 'a':
      return x == 'a' ? 1 : 2
    case 'b':
      return 3
  }
  return 0
}`
    const f = load(src, 'f')
    expect([f('a'), f('b'), f('z')]).toEqual([1, 3, 0])
  })

  it('a switch inside a loop keeps `break` meaning the switch', () => {
    // Why the transform never rewrites to an if-chain: `break` in a switch breaks the
    // switch, but in an `if` it breaks the LOOP. That rewrite would silently change control
    // flow in every switch inside a loop.
    const src = `export function f(n: any):! 0 {
  let hits = 0
  for (let i = 0; i < 3; i = i + 1) {
    switch (i) {
      case 0:
        hits = hits + 1
      case 1:
        hits = hits + 10
    }
  }
  return hits
}`
    // i=0 -> +1 (arm ends), i=1 -> +10, i=2 -> no match. Loop runs all three times.
    expect(load(src, 'f')(0)).toBe(11)
  })

  it('`case` and `fallthrough` inside string literals are not code', () => {
    // The repo's dominant defect class. This transform is AST-driven so it should be
    // immune, and the literal must come out byte-identical — `not.toThrow()` cannot see
    // silent rewriting.
    const src = `export function f(x: any):! '' {
  const s = "case 'a': fallthrough // switch"
  switch (x) {
    case 'q':
      return s
  }
  return s
}`
    const f = load(src, 'f')
    expect(f('q')).toBe("case 'a': fallthrough // switch")
    expect(f('z')).toBe("case 'a': fallthrough // switch")
  })
})

describe('plain JS is untouched — the subset invariant', () => {
  it('C fallthrough survives under `dialect: js`', () => {
    // PRINCIPLES.md: options-off TJS ⊇ JS. Converted output carries `/* tjs <- … */`, which
    // means JS semantics, and that is the boundary #37 taught us to respect — a switch
    // rewritten there would change the meaning of every converted file.
    const src = `export function f(x) {
  const out = []
  switch (x) {
    case 'a':
      out.push(1)
    case 'b':
      out.push(2)
  }
  return out.join(',')
}`
    const js = tjs(src, { dialect: 'js' }).code
    const f = new Function(js.replace(/^export /gm, '') + '\nreturn f')()
    expect(f('a')).toBe('1,2') // still falls through
    expect(js).not.toContain('swKey')
  })
})
