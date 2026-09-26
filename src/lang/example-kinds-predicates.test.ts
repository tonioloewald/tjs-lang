/**
 * Recursive Types meet USER code: predicates, negation, and error propagation.
 *
 * Re-review 4 (docs/reviews/0.14.0-example-kinds-rereview-4.md) found that the recursive
 * solver's core held, and that its edges did not:
 *   - B-1: a Type's PREDICATE ran on a value whose example match was only ASSUMED inside a
 *     solve — `x.n` ran on `null` and the TypeError escaped `.check`.
 *   - M-1: a predicate that NEGATES another Type's `.check` saw an optimistic `true`, and
 *     statuses only move true → false — so it failed OPEN on acyclic data.
 *   - M-2: a MonadicError passed object-shaped parameters (`o: {}`, an all-optional shape).
 * The rule now: user code never observes an assumption. A recursive Type's predicate runs
 * only on values structurally valid at the fixed point, and every opaque check (predicate
 * Types, Generics, Enums…) runs in EXACT mode, outside the solve.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime, MonadicError, isMonadicError } from './runtime'
import * as runtime from './runtime'

function load(src: string, names: string[], withRuntime = false) {
  const saved = (globalThis as any).__tjs
  if (withRuntime) (globalThis as any).__tjs = createRuntime()
  else delete (globalThis as any).__tjs
  try {
    return new Function(tjs(src).code + `\nreturn [${names.join(',')}]`)()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}
const upstream = () => new MonadicError('upstream', '<test>', 'x', 'y')

describe('a predicate never runs on an assumed value (B-1)', () => {
  for (const withRuntime of [false, true])
    it(`a recursive list with a dereferencing predicate (${
      withRuntime ? 'runtime' : 'standalone'
    })`, () => {
      const [T, sum] = load(
        'Type T {\n  example: { next: T | null, n: 0 }\n  predicate(x) { return x.n >= 0 }\n}\n' +
          'function sum(list: T):! 0 { return list.n }',
        ['T', 'sum'],
        withRuntime
      )
      expect(T.check({ n: 1, next: null })).toBe(true)
      expect(T.check({ n: 1, next: { n: 2, next: null } })).toBe(true)
      expect(T.check({ n: 1, next: { n: -1, next: null } })).toBe(false)
      expect(sum({ n: 1, next: null })).toBe(1) // does not THROW
      let deep: any = null
      for (let i = 0; i < 20000; i++) deep = { n: i, next: deep }
      expect(T.check(deep)).toBe(true) // any depth, predicate and all
    })
})

describe('a negating predicate is exact, in both directions (M-1)', () => {
  const SRC =
    'Type Admin { example: { admin: true } }\n' +
    'Type NotAdmin {\n  example: {}\n  predicate(x) { return !Admin.check(x) }\n}\n' +
    'Type Req { example: { user: NotAdmin } }\n' +
    'Type Priv {\n  example: {}\n  predicate(x) { return !Req.check(x) }\n}\n' +
    'function guest(r: Req):! 0 { return 1 }'
  it('valid input is accepted, invalid rejected', () => {
    const [Req, Priv, guest] = load(SRC, ['Req', 'Priv', 'guest'])
    const v = { user: { admin: 'no' } } // admin is not a boolean → not Admin → NotAdmin
    expect(Req.check(v)).toBe(true)
    expect(Priv.check(v)).toBe(false) // it was ACCEPTED (fail open)
    expect(guest(v)).toBe(1)
    const a = { user: { admin: true } }
    expect(Req.check(a)).toBe(false)
    expect(Priv.check(a)).toBe(true)
  })
})

describe('a MonadicError is never an object shape (M-2)', () => {
  const PARAMS: Array<[string, string]> = [
    ['o: {}', ''],
    ["o: { path: '' }", ''],
    ['o: P', 'Type P { example: { x: 0 | undefined } }\n'],
    ['o: { x: 0 | undefined }', ''],
    ['o = { x: 0 }', ''],
  ]
  for (const [param, pre] of PARAMS)
    for (const withRuntime of [false, true])
      it(`${param} propagates an upstream error (${
        withRuntime ? 'runtime' : 'standalone'
      })`, () => {
        const [f] = load(
          `${pre}function f(${param}):! 0 { return 1 }`,
          ['f'],
          withRuntime
        )
        const e = upstream()
        expect(f(e)).toBe(e)
      })

  it('an error carried in an options bag propagates — the same in both forms', () => {
    const [f, g] = load(
      'function f(o: { x: 0 }):! 0 { return 1 }\nfunction g(o = { x: 0 }):! 0 { return 1 }',
      ['f', 'g']
    )
    const e = upstream()
    expect(f({ x: e })).toBe(e)
    expect(g({ x: e })).toBe(e)
  })

  it('a nested dictionary does not merge an error into its defaults', () => {
    const [f] = load('function f(o = { inner: { x: 0 } }):! 0 { return 1 }', [
      'f',
    ])
    const e = upstream()
    expect(f({ inner: e })).toBe(e)
  })

  it('an error element propagates only when the element check FAILS', () => {
    const [nums, anys] = load(
      'function nums(xs: [0]):! 0 { return xs.length }\nfunction anys(xs: [any]):! 0 { return xs.length }',
      ['nums', 'anys']
    )
    const e = upstream()
    expect(nums([1, e])).toBe(e)
    expect(anys([1, e])).toBe(2) // `[any]` accepts it: the body runs
  })

  it('polymorphic dispatch propagates too', () => {
    const [area] = load(
      'function area(r: 0.0):! 0.0 { return r }\nfunction area(w: 0.0, h: 0.0):! 0.0 { return w * h }',
      ['area']
    )
    const e = upstream()
    expect(area(e)).toBe(e)
    expect(area(2, 3)).toBe(6)
  })
})

describe('the three typeError copies agree (differential)', () => {
  const inst = createRuntime()
  const COPIES: Array<[string, (...a: any[]) => any]> = [
    ['exported', runtime.typeError],
    ['instance', inst.typeError],
  ]
  // The inline stub, reached through emitted code with no runtime installed.
  const stub = (() => {
    const saved = (globalThis as any).__tjs
    delete (globalThis as any).__tjs
    try {
      return new Function(
        tjs('function f(x: 0):! 0 { return x }').code +
          '\nreturn __tjs.typeError'
      )()
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  })()
  COPIES.push(['inline stub', stub])

  const e = upstream()
  const plain = new Error('plain')
  const ROWS: Array<[string, any[], (r: any) => boolean]> = [
    ['a MonadicError value propagates', ['p', 'x', e], (r) => r === e],
    [
      'a plain Error is a NEW type error',
      ['p', 'x', plain],
      (r) => isMonadicError(r) && r !== plain,
    ],
    [
      'a MonadicError root propagates',
      ['p', 'x', 1, undefined, e],
      (r) => r === e,
    ],
    [
      'a plain root, error value: the value',
      ['p', 'x', e, undefined, { a: 1 }],
      (r) => r === e,
    ],
    [
      'an error CARRIED in the failed value propagates',
      ['p', 'x', { a: 1, b: [2, { c: e }] }],
      (r) => r === e,
    ],
    [
      'a carried error behind a getter is not read',
      [
        'p',
        'x',
        Object.defineProperty({}, 'g', { get: () => e, enumerable: true }),
      ],
      (r) => isMonadicError(r) && r !== e,
    ],
    [
      'a cyclic value without an error terminates with a new error',
      [
        'p',
        'x',
        (() => {
          const o: any = {}
          o.o = o
          return o
        })(),
      ],
      (r) => isMonadicError(r) && r !== e,
    ],
    [
      'null root, plain value: a new error',
      ['p', 'x', 5, undefined, null],
      (r) => isMonadicError(r) && r !== e,
    ],
  ]
  for (const [label, args, want] of ROWS)
    it(label, () => {
      for (const [name, fn] of COPIES)
        expect({ name, ok: want(fn(...args)) }).toEqual({ name, ok: true })
    })
})

describe('bounded work at size', () => {
  it('a 30-way union of recursive types over 60k nodes is linear and accepted', () => {
    const R = 30
    const types = Array.from(
      { length: R },
      (_, i) => `Type A${i} { example: { next: U | null, k${i}: 0 } }`
    ).join('\n')
    const [U] = load(
      types +
        '\nType U { example: ' +
        Array.from({ length: R }, (_, i) => `A${i}`).join(' | ') +
        ' }',
      ['U']
    )
    let v: any = null
    for (let i = 0; i < 60000; i++) v = { next: v, [`k${R - 1}`]: i }
    const t = performance.now()
    expect(U.check(v)).toBe(true)
    expect(performance.now() - t).toBeLessThan(1500)
  })

  it('a 300k-object tree: accepted, one node per object', () => {
    const [T] = load('Type T { example: { v: 0.0, kids: [T] } }', ['T'])
    const mk = (d: number): any =>
      d === 0
        ? { v: 1, kids: [] }
        : { v: 1, kids: Array.from({ length: 12 }, () => mk(d - 1)) }
    const tree = mk(5) // ~270k objects
    const t = performance.now()
    expect(T.check(tree)).toBe(true)
    expect(performance.now() - t).toBeLessThan(2000)
  })
})

describe('the cases the boundary exists for (need NESTING to reach)', () => {
  it('a predicate reading two levels into ASSUMED structure never runs on it', () => {
    // `x.next` lacks `next`, so it is not an L, so x is not an L — the predicate must not run
    // on x while x.next is merely assumed (it would read `undefined.n` and throw).
    const [L] = load(
      'Type L {\n  example: { next: L | null, n: 0 }\n  predicate(x) { return x.next === null || x.next.next === null || x.next.next.n >= 0 }\n}',
      ['L']
    )
    expect(() => L.check({ n: 1, next: { n: 2 } })).not.toThrow()
    expect(L.check({ n: 1, next: { n: 2 } })).toBe(false)
    expect(L.check({ n: 1, next: { n: 2, next: null } })).toBe(true)
  })

  it('negating a RECURSIVE type inside another type’s solve is exact, both ways', () => {
    const [Tree] = load(
      'Type Bad { example: { next: Bad | null, bad: true } }\n' +
        'Type NotBad {\n  example: {}\n  predicate(x) { return !Bad.check(x) }\n}\n' +
        'Type Tree { example: { kids: [Tree], tag: NotBad } }',
      ['Tree']
    )
    // Bad fails one level DOWN (its recursive part), so only a real solve can say so; the
    // shallow pre-check alone would decide a top-level failure exactly.
    const notBad = { next: { next: null, bad: 'no' }, bad: true }
    const ok = { kids: [{ kids: [], tag: notBad }], tag: {} }
    expect(Tree.check(ok)).toBe(true) // over-rejected when Bad.check answered optimistically
    const bad = {
      kids: [{ kids: [], tag: { next: null, bad: true } }],
      tag: {},
    }
    expect(Tree.check(bad)).toBe(false)
  })
})

describe('an OLDER installed runtime does not change what emitted code returns (m-6)', () => {
  // A 0.13-shaped global: no `abi`, and a typeError that ignores `root` and never
  // propagates. 0.14 code used it whenever it existed, so the caller's error came back
  // replaced by a new "got object" one.
  it('emitted code falls back to its inline runtime, and the error propagates', () => {
    const saved = (globalThis as any).__tjs
    const stale: any = {
      version: '0.13.13',
      typeError: (p: string) => new MonadicError('stale ' + p, p, 'x', 'y'),
      isMonadicError,
    }
    stale.createRuntime = () => stale
    ;(globalThis as any).__tjs = stale
    try {
      const f = new Function(
        tjs('function f(o: { x: 0 }):! 0 { return 1 }').code + '\nreturn f'
      )()
      const e = upstream()
      expect(f({ x: e })).toBe(e)
      expect(f(e)).toBe(e)
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  })

  it('a current runtime is still used when installed', () => {
    const saved = (globalThis as any).__tjs
    const rt = createRuntime()
    ;(globalThis as any).__tjs = rt
    try {
      const code = tjs('function f(x: 0):! 0 { return x }').code
      expect(code).toContain('abi >=')
      expect(rt.abi).toBeGreaterThanOrEqual(2)
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  })
})

describe('a declared Type parameter propagates a carried error (m-2)', () => {
  it('p: Pt called with { x: err } returns err, and a recursive Type too', () => {
    const [pt, tree] = load(
      'Type Pt { example: { x: 0, y: 0 } }\nType T { example: { v: 0, kids: [T] } }\n' +
        'function pt(p: Pt):! 0 { return 1 }\nfunction tree(t: T):! 0 { return 1 }',
      ['pt', 'tree']
    )
    const e = upstream()
    expect(pt({ x: e, y: 1 })).toBe(e)
    expect(tree({ v: 1, kids: [{ v: 2, kids: [e] }] })).toBe(e)
    expect(pt({ x: 1, y: 2 })).toBe(1)
    expect(isMonadicError(pt({ x: 'no', y: 2 }))).toBe(true)
  })
})

describe('a stack overflow inside a nested runtime check is recorded, not silent', () => {
  it('rejects, and leaves a flight-recorder entry', () => {
    const saved = (globalThis as any).__tjs
    const rt = createRuntime()
    ;(globalThis as any).__tjs = rt
    try {
      const T = new Function(
        tjs(
          'function loop(x) { return loop(x) }\n' +
            'Type Bad {\n  example: {}\n  predicate(x) { return loop(x) }\n}\n' +
            'Type T { example: { next: T | null, b: Bad } }'
        ).code + '\nreturn T'
      )()
      rt.clearRecords()
      expect(T.check({ next: { next: null, b: {} }, b: {} })).toBe(false)
      expect(
        rt.records().some((r: any) => /ran out of stack/.test(r.message))
      ).toBe(true)
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  })
})

describe('the carried-error search is bounded by KEYS, in every copy', () => {
  it('a 1M-element failing argument costs little on the failure path', () => {
    const [nums] = load('function nums(xs: [0]):! 0 { return 1 }', ['nums'])
    const big = Array.from({ length: 1_000_000 }, (_, i) => i)
    big[999_999] = 'no' as any
    const t = performance.now()
    const r = nums(big)
    expect(isMonadicError(r)).toBe(true)
    // The element check itself walks the array; the search must add little on top.
    expect(performance.now() - t).toBeLessThan(150)
  })
  it('an error beyond the bound is not found — a NEW error, not a hang', () => {
    const e = upstream()
    const deep = Array.from({ length: 10_000 }, () => ({ a: 1 }))
    ;(deep as any).push({ e })
    for (const [name, fn] of [
      ['exported', runtime.typeError],
      ['instance', createRuntime().typeError],
    ] as const) {
      const r = (fn as any)('p', 'x', deep)
      expect({ name, fresh: isMonadicError(r) && r !== e }).toEqual({
        name,
        fresh: true,
      })
    }
  })
})
