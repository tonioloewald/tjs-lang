/**
 * `TjsStrict` opts TS-originated code into FULL TJS — including input validation.
 *
 * Converted TypeScript gets JS semantics by default (`safety none`), which is right: a TS type
 * is a claim, not a check, and converting a file must not change what it does. `TjsStrict`
 * (or `/* @tjs TjsStrict *\/` in the .ts source) is the documented way back to "full TJS;
 * .tjs has this already". It set every MODE and left safety at the compat `none` — so the
 * one opt-in a TypeScript author can write turned on `==` and `Date` rules but never
 * validated a single argument. Three TypeScript playground examples promised "invalid calls
 * return error objects" and printed `Hello, 42!`.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { fromTS } from './emitters/from-ts'
import { createRuntime, isMonadicError } from './runtime'

function load(src: string, name: string) {
  const saved = (globalThis as any).__tjs
  ;(globalThis as any).__tjs = createRuntime()
  try {
    return new Function(tjs(src).code + `\nreturn ${name}`)()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}
const GREET_TS = `function greet(name: string): string { return 'Hello, ' + name }`

describe('TjsStrict restores input validation on TS-originated code', () => {
  it('apparatus: plain converted TS does NOT validate (JS semantics)', () => {
    const greet = load(fromTS(GREET_TS, { emitTJS: true }).code, 'greet')
    expect(greet(42)).toBe('Hello, 42')
  })

  it('`/* @tjs TjsStrict */` in the .ts source validates inputs', () => {
    const src = fromTS('/* @tjs TjsStrict */\n' + GREET_TS, { emitTJS: true })
    const greet = load(src.code, 'greet')
    expect(greet('World')).toBe('Hello, World')
    expect(isMonadicError(greet(42))).toBe(true)
  })

  it('TjsStrict in converted TJS validates inputs', () => {
    const greet = load(
      `TjsStrict\n/* tjs <- input.ts */\nfunction greet(name: ''):! '' { return 'Hello, ' + name }`,
      'greet'
    )
    expect(isMonadicError(greet(42))).toBe(true)
  })

  it('an EXPLICIT safety directive still wins over TjsStrict', () => {
    const greet = load(
      `safety none\nTjsStrict\n/* tjs <- input.ts */\nfunction greet(name: ''):! '' { return 'Hello, ' + name }`,
      'greet'
    )
    expect(greet(42)).toBe('Hello, 42')
  })

  it('native .tjs is unchanged: validates with or without TjsStrict', () => {
    const src = `function greet(name: ''):! '' { return 'Hello, ' + name }`
    expect(isMonadicError(load(src, 'greet')(42))).toBe(true)
    expect(isMonadicError(load('TjsStrict\n' + src, 'greet')(42))).toBe(true)
  })
})

describe('TjsStrict does not reject VALID TypeScript', () => {
  // Once TjsStrict validated, fromTS shapes that had never been checked started rejecting
  // valid calls: an inline optional member lost its `?`, `T[]` became "array of null", and
  // TS `object` became a plain-object type that refused arrays. (review M-3)
  const call = (ts: string, name: string, ...args: unknown[]) => {
    const fn = load(
      fromTS('/* @tjs TjsStrict */\n' + ts, { emitTJS: true }).code,
      name
    )
    return fn(...args)
  }

  it('an inline optional member may be absent — and is still checked when present', () => {
    const ts = 'function f(o: { a?: number; b: string }): number { return 1 }'
    expect(call(ts, 'f', { b: 'x' })).toBe(1)
    expect(isMonadicError(call(ts, 'f', { b: 'x', a: 'no' }))).toBe(true)
  })

  it('an unconstrained generic array accepts any elements', () => {
    expect(
      call('function f<T>(x: T[]): number { return 1 }', 'f', ['a', 2])
    ).toBe(1)
  })

  it('TS `object` accepts arrays and functions, as TypeScript does', () => {
    const ts = 'function f(x: object): number { return 1 }'
    expect(call(ts, 'f', [1])).toBe(1)
    expect(call(ts, 'f', () => 1)).toBe(1)
  })
})

describe('`Array<T>` means what `T[]` means', () => {
  it('under TjsStrict, in an annotation', () => {
    const run = (ts: string, arg: unknown) =>
      load(
        fromTS('/* @tjs TjsStrict */\n' + ts, { emitTJS: true }).code,
        'f'
      )(arg)
    expect(
      run('function f(x: Array<object>): number { return 1 }', [[1]])
    ).toBe(1)
    expect(
      run('function f(x: Array<{ a?: number }>): number { return 1 }', [{}])
    ).toBe(1)
  })
})

describe('converted unions and aliases are checked — not dropped (re-review 2, B-1)', () => {
  // `fromTS` emits the BLOCK form (`Type X { example: … }`) for every TS union and alias, and
  // the block's example reader took one TOKEN: `A | B`, `Node | null` and a bare alias read
  // nothing, so the type became `Type('X')` and accepted everything — or read only `''` of
  // `string | number` and rejected valid numbers.
  const PRE = 'interface Node { v: number }\ninterface Leaf { leaf: string }\n'
  const ROWS: Array<[string, unknown, unknown]> = [
    ['type Id = string | number', 1, true],
    ['type U = string | undefined', undefined, 5],
    ['type MaybeNode = Node | null', null, 5],
    ['type Alias = Node', { v: 1 }, 5],
    ['type Either = Node | Leaf', { leaf: 'x' }, { v: 'x' }],
  ]
  for (const [alias, good, bad] of ROWS)
    it(alias, () => {
      const name = alias.match(/type (\w+)/)![1]
      const ts = `/* @tjs TjsStrict */\n${PRE}${alias}\nfunction f(x: ${name}): number { return 1 }`
      const f = load(fromTS(ts, { emitTJS: true }).code, 'f')
      expect(f(good)).toBe(1)
      expect(isMonadicError(f(bad))).toBe(true)
    })

  it('an example that cannot be read is an ERROR, not a type that checks nothing', () => {
    expect(() => tjs('Type T { example: 1 +* 2 }')).toThrow(/could not be read/)
  })
})

describe('0.14.0 final review: nullable shapes and nested optionals (M-1, M-2)', () => {
  const strict = (ts: string, name: string) =>
    load(fromTS('/* @tjs TjsStrict */\n' + ts, { emitTJS: true }).code, name)

  it('M-1: a converted `{…} | null` parameter accepts null instead of THROWING', () => {
    const f = strict(
      'function f(o: { a: number } | null): number { return o ? o.a : 0 }',
      'f'
    )
    expect(f(null)).toBe(0)
    expect(f({ a: 2 })).toBe(2)
    expect(isMonadicError(f({ a: 'x' }))).toBe(true)
  })

  it('M-1: native `.tjs` too, and at a NESTED nullable level', () => {
    const g = load(
      'function g(o: { a: 0 } | null):! 0 { return o ? o.a : 0 }',
      'g'
    )
    expect(g(null)).toBe(0)
    expect(isMonadicError(g({ a: 'x' }))).toBe(true)
    const h = load(
      'function h(o: { p: { a: 0 } | null }):! 0 { return o.p ? o.p.a : 0 }',
      'h'
    )
    expect(h({ p: null })).toBe(0)
    expect(h({ p: { a: 3 } })).toBe(3)
    expect(isMonadicError(h({ p: { a: 'x' } }))).toBe(true)
  })

  it('M-2: a nested optional member does not make its parent required', () => {
    const fa = strict(
      'interface A { name: string; b?: { c?: string } }\nfunction fa(a: A): number { return 1 }',
      'fa'
    )
    expect(fa({ name: 'x' })).toBe(1)
    expect(fa({ name: 'x', b: {} })).toBe(1)
    expect(isMonadicError(fa({ name: 'x', b: { c: 5 } }))).toBe(true)
  })

  it('M-2: an optional array of optional elements, and the control', () => {
    const fc = strict(
      'interface C { tags?: (string | undefined)[] }\nfunction fc(c: C): number { return 1 }',
      'fc'
    )
    expect(fc({})).toBe(1)
    expect(fc({ tags: ['a', undefined] })).toBe(1)
    const fd = strict(
      'interface D { b?: { c: string } }\nfunction fd(d: D): number { return 1 }',
      'fd'
    )
    expect(fd({})).toBe(1)
    expect(isMonadicError(fd({ b: {} }))).toBe(true)
  })
})
