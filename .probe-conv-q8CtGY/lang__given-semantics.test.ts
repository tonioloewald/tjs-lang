/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 28 */
function load(src, name) {
  return new Function(
    tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`
  )()
}
load.__tjs = {
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
  },
  unsafe: true,
  source: 'input.ts:28',
}

/* line 32 */
function boxed(value) {
  return new Proxy(new String(''), {
    get: (t, k) => (k === 'asCompared' ? () => value : Reflect.get(t, k)),
  })
}
boxed.__tjs = {
  params: {
    value: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:32',
}

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
    const f = load(
      `export function f(x: any):! 0 { given x { NaN { return 1 } } return 0 }`,
      'f'
    )
    expect(f(NaN)).toBe(1)
    expect(f(1)).toBe(0)
  })
  it('does NOT become loose: `==` still refuses type coercion', () => {
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

    expect(load(src, 'f')(0)).toBe(21)
  })
  it('`case` and `fallthrough` inside string literals are not code', () => {
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
    expect(f('a')).toBe('1,2')
    expect(js).not.toContain('swKey')
  })
})

describe('`switch` is left exactly as JavaScript defines it', () => {
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
    const w = (tjs(FALLS).warnings ?? []).filter((m) =>
      String(m).includes('given')
    )
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('given x {')
    expect(w[0]).toContain('fall through')
  })
  it('does not warn about a `switch` in plain JS', () => {
    const w = (tjs(FALLS, { dialect: 'js' }).warnings ?? []).filter((m) =>
      String(m).includes('given')
    )
    expect(w).toEqual([])
  })
})

describe('a lowered `given` is not advised to become a `given`', () => {
  const advice = (src) =>
    tjs(src, { runTests: false, filename: 'a.tjs' }).warnings ?? []
  it('a `given` produces no switch advice', () => {
    const out = advice(
      `function f(x) {\n  given x {\n    'a' { return 1 }\n  } else {\n    return 0\n  }\n}`
    )
    expect(out.join('\n')).not.toContain('`given` is the .tjs form')
  })
  it('the internal lowering never appears in a message', () => {
    const out = advice(
      `function f(x) {\n  given x {\n    'a' { return 1 }\n  } else {\n    return 0\n  }\n}`
    )
    expect(out.join('\n')).not.toContain('swKey')
  })
  it('an author-written `switch` is STILL advised', () => {
    const out = advice(
      `function f(x) {\n  switch (x) {\n    case 1: return 1\n    default: return 0\n  }\n}`
    )
    expect(out.join('\n')).toContain('`given` is the .tjs form')
    expect(out.join('\n')).toContain('given x {')
  })
})
