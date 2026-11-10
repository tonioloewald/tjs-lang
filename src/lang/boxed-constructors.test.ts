/**
 * Native TJS refuses the boxed-primitive constructors (#4012, 0.14).
 *
 * `new String(x)`, `new Number(x)` and `new Boolean(x)` are almost always a mistake for the
 * conversion functions (`String(x)` …), and the result is an object that is truthy even when it
 * holds `false`. The deliberate uses (a primitive passed by reference, a tagged value) keep a
 * spelling that says what it means: `Object(x)`. So a native `.tjs` file refuses the three
 * constructors, with that remedy. `==` and truthiness still unwrap boxed values, which arrive
 * from JavaScript libraries, converted code and `Object(x)`.
 *
 * Guarded in both directions: plain JavaScript (`dialect: 'js'`) and converted TypeScript keep
 * them, or TJS would stop being a superset of JavaScript (PRINCIPLES.md).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { fromTS } from './emitters/from-ts'
import { graduate } from './graduate'

describe('native TJS refuses boxed-primitive constructors', () => {
  for (const ctor of ['String', 'Number', 'Boolean'])
    it(`new ${ctor}(…) is refused, with the remedy`, () => {
      expect(() =>
        tjs(`const v = new ${ctor}(1)`, { runTests: false })
      ).toThrow(new RegExp(`new ${ctor}.*${ctor}\\(x\\).*Object\\(x\\)`, 's'))
    })

  it('the deprecated unsafe prefix is not an escape (Object(x) is)', () => {
    expect(() =>
      tjs(`const v = unsafe new String('x')`, { runTests: false })
    ).toThrow(/Object\(x\)/)
  })
})

describe('what stays legal', () => {
  const legal: [string, string][] = [
    [
      'the conversion functions',
      `const s = String(1)\nconst n = Number('2')\nconst b = Boolean(0)`,
    ],
    ['a deliberate boxed object', `const box = Object('x')`],
    ['the words in a string', `const msg = 'use new String(x) never'`],
    ['a member named Number', `const o = { Number: 1 }\nconst n = o.Number`],
  ]
  for (const [what, src] of legal)
    it(what, () => {
      expect(() => tjs(src, { runTests: false })).not.toThrow()
    })

  it("plain JavaScript keeps them (dialect: 'js')", () => {
    expect(() =>
      tjs(`const v = new String('x')`, { runTests: false, dialect: 'js' })
    ).not.toThrow()
  })

  it('converted TypeScript keeps them', () => {
    const converted = fromTS(`export const v = new String('x')`, {
      emitTJS: true,
    }).code
    expect(() => tjs(converted, { runTests: false })).not.toThrow()
  })
})

describe('conversion rewrites them exactly', () => {
  const load = (code: string) =>
    new Function(
      `${tjs(code, { runTests: false }).code.replace(
        /^export /gm,
        ''
      )}\nreturn f`
    )()

  it('a Symbol argument still throws, converted and graduated (String(sym) would not)', () => {
    const converted = fromTS(
      `export function f(x: any): any { return new String(x) }`,
      { emitTJS: true }
    ).code
    expect(converted).toContain('Object(`${x}`)')
    const graduated = graduate(converted)
    expect(graduated.refused).toBeUndefined()
    for (const code of [converted, graduated.code])
      expect(() => load(code)(Symbol('s'))).toThrow(TypeError)
  })
})
