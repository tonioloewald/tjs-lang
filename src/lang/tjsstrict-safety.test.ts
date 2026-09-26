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
