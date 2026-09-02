/**
 * `given` — the fixed dispatch construct, all four properties, behaviourally (#43, #48).
 *
 * These assert what the emitted code DOES, not what it looks like. The transform's output
 * shape is an implementation detail; "does an arm fall through" is the promise.
 *
 * These properties first shipped as a fixed `switch`. The probe then measured that fix and
 * found it worse than the defect for a reader — identical text traced 5/5 as `.js` and 0/5
 * as `.tjs`, applying C fallthrough confidently every time, because the extension carries
 * nothing and the shape still said "C switch". So the semantics moved to a construct that
 * LOOKS different, and `switch` was left exactly as JavaScript defines it.
 *
 * The four:
 *   1. arms compare with `Eq` semantics, so dispatch agrees with `==` in the same file
 *   2. `case 'a', 'b':` — multiple values without fallthrough
 *   3. arms never fall through — there is no cascade and no keyword for one. `switch`
 *      remains available, unchanged, for the rare case that genuinely wants C's behaviour
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
  given x {
    'a', 'b' { out.push('ab') }
    'c' { out.push('c') }
    'd' { out.push('d') }
    'e' { out.push('e'); return out.join(',') }
  }
  return out.join(',') + '|end'
}
`

describe('1. case compares the way `==` does', () => {
  it('a value-like object matches a literal case (#42, the original report)', () => {
    // The whole reason #42 was filed: `x == 'c'` was true while `switch (x) case 'c'` was
    // not, in the same file, with no operator to reach for instead.
    expect(load(DISPATCH, 'f')(boxed('c'))).toBe('c|end')
  })

  it('`undefined` and `null` are one key, as Eq says', () => {
    const f = load(
      `export function f(x: any):! 0 { given x { null { return 1 } } return 0 }`,
      'f'
    )
    expect(f(null)).toBe(1)
    expect(f(undefined)).toBe(1)
  })

  it('NaN matches itself — which `===` cannot express', () => {
    // `Eq(NaN, NaN)` is true; a plain `switch` uses `===`, where NaN matches nothing.
    const f = load(
      `export function f(x: any):! 0 { given x { NaN { return 1 } } return 0 }`,
      'f'
    )
    expect(f(NaN)).toBe(1)
    expect(f(1)).toBe(0)
  })

  it('does NOT become loose: `==` still refuses type coercion', () => {
    // The control. TJS `==` is footgun-free `===`, not `==`; `switch` must inherit exactly
    // that and no more, or this change would have smuggled in the coercion TJS removed.
    const f = load(
      `export function f(x: any):! 0 { given x { 5 { return 1 } } return 0 }`,
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

  it('an arm that returns still returns', () => {
    expect(f('e')).toBe('e')
  })

  it('no match runs nothing', () => {
    expect(f('z')).toBe('|end')
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
  given x {
    'a' { const y = 1; return y }
    'b' { const y = 2; return y }
  } else { const y = 3; return y }
}`
    const f = load(src, 'f')
    expect([f('a'), f('b'), f('z')]).toEqual([1, 2, 3])
  })

  it('an explicitly braced arm body still works', () => {
    // People have been writing these for years because `no-case-declarations` made them.
    // The change must not punish the workaround it obsoletes.
    const src = `export function f(x: any):! 0 {
  given x {
    'a' { { const y = 1; return y } }
    'b' { { const y = 2; return y } }
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
    // C semantics, unchanged: i=0 matches and FALLS THROUGH (+1 then +10), i=1 matches
    // (+10), i=2 no match. 21. `given` is where fallthrough does not happen.
    expect(load(src, 'f')(0)).toBe(21)
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

describe('`switch` is left exactly as JavaScript defines it', () => {
  // The deliberate NON-change. #43 fixed `switch` in place; the probe then measured that fix
  // and found it worse than the defect for a reader — identical text traced 5/5 as `.js` and
  // 0/5 as `.tjs`, applying C fallthrough confidently every time. A fix nobody can see is a
  // hazard, so it was reverted and the semantics moved to `given`.
  const FALLS = `export function f(x: any):! '' {
  const out = []
  switch (x) {
    case 'a':
      out.push(1)
    case 'b':
      out.push(2)
  }
  return out.join(',')
}`

  it('still falls through, in native .tjs', () => {
    expect(load(FALLS, 'f')('a')).toBe('1,2')
  })

  it('and identically under `dialect: js` — no divergence to explain', () => {
    const js = tjs(FALLS, { dialect: 'js' }).code
    const f = new Function(js.replace(/^export /gm, '') + '\nreturn f')()
    expect(f('a')).toBe('1,2')
  })

  it('warns, and the warning shows `given` as code rather than describing it', () => {
    // A remedy shown as code repaired 80% where the same advice as prose repaired 50% and a
    // bare diagnostic 0% (ASSUMPTIONS A1). The warning is the only thing a reader of a
    // `switch` will see, so it carries the replacement.
    const w = (tjs(FALLS).warnings ?? []).filter((m) =>
      String(m).includes('given')
    )
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('given x {')
    expect(w[0]).toContain('fall through')
  })

  it('does not warn about a `switch` in plain JS', () => {
    // `dialect: 'js'` is not being offered a TJS construct — TJS ⊇ JS means plain JS is
    // never nagged about syntax it cannot use.
    const w = (tjs(FALLS, { dialect: 'js' }).warnings ?? []).filter((m) =>
      String(m).includes('given')
    )
    expect(w).toEqual([])
  })
})

describe('a lowered `given` is not advised to become a `given`', () => {
  // `given` lowers to a C `switch` BEFORE acorn, so by the time `switchAdvice` walks the AST
  // the two are indistinguishable — and every `given` was told to use `given`. The advice
  // quoted the lowering back at the author:
  //
  //     given __tjs.swKey(x) {
  //
  // which nobody can write, and which leaks an internal helper into a user-facing message.
  // It also failed `tjs check --max-warnings 0`, so adopting the construct the advice
  // recommends broke the build — the worst possible shape for a nudge toward a new feature.
  const advice = (src: string) =>
    tjs(src, { runTests: false, filename: 'a.tjs' }).warnings ?? []

  it('a `given` produces no switch advice', () => {
    const out = advice(
      `function f(x) {\n  given x {\n    'a' { return 1 }\n  } else {\n    return 0\n  }\n}`
    )
    expect(out.join('\n')).not.toContain('`given` is the .tjs form')
  })

  it('the internal lowering never appears in a message', () => {
    // Independent of whether advice fires at all — `__tjs.swKey` must never reach a user.
    const out = advice(
      `function f(x) {\n  given x {\n    'a' { return 1 }\n  } else {\n    return 0\n  }\n}`
    )
    expect(out.join('\n')).not.toContain('swKey')
  })

  it('an author-written `switch` is STILL advised', () => {
    // The guard must not silence the advice it was protecting. Without this, skipping every
    // switch would satisfy both assertions above.
    const out = advice(
      `function f(x) {\n  switch (x) {\n    case 1: return 1\n    default: return 0\n  }\n}`
    )
    expect(out.join('\n')).toContain('`given` is the .tjs form')
    expect(out.join('\n')).toContain('given x {')
  })
})
