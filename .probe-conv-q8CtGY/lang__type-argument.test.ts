/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { typeArgumentSource } from '/Users/tonioloewald/tjs-lang/src/lang/inference'

/* line 23 */
function box() {
  const { code } = tjs(`Type Box<T> {\n  example: { value: T }\n}`, {
    filename: 'ta.tjs',
  })
  return new Function(`${code}\nreturn Box`)()
}
box.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'any',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:23',
}

/* line 31 */
function predicate(name) {
  const src = typeArgumentSource(name)
  expect(src).not.toBeNull()
  return new Function(`return ${src}`)()
}
predicate.__tjs = {
  params: {
    name: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'any',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:31',
}

describe('a primitive kind has a predicate representation', () => {
  it('int accepts integers and rejects floats, strings and null', () => {
    const isInt = predicate('int')
    expect([2, -3, 0].every(isInt)).toBe(true)
    expect([1.5, '2', null, undefined, {}].some(isInt)).toBe(false)
  })
  it('unsigned additionally rejects negatives', () => {
    const isU = predicate('unsigned')
    expect([0, 7].every(isU)).toBe(true)
    expect(isU(-1)).toBe(false)
  })
  it('float accepts any number, including integers', () => {
    const isF = predicate('float')
    expect([1.5, 2, -0.5].every(isF)).toBe(true)
    expect(isF('2')).toBe(false)
  })
  it('a declared type name is NOT translated', () => {
    expect(typeArgumentSource('MyThing')).toBeNull()
    expect(typeArgumentSource('Box')).toBeNull()
  })
})

describe('a predicate works as a type argument, and composes', () => {
  it('Box(<int predicate>) checks the parameter slot', () => {
    const B = box()(predicate('int'))
    expect(B.check({ value: 7 })).toBe(true)
    expect(B.check({ value: 1.5 })).toBe(false)
    expect(B.check({ value: 's' })).toBe(false)
    expect(B.check({})).toBe(false)
  })
  it('Box<Box<int>> — a parameterized type is itself a type argument', () => {
    const Box = box()
    const BoxBoxInt = Box(Box(predicate('int')))
    expect(BoxBoxInt.check({ value: { value: 7 } })).toBe(true)
    expect(BoxBoxInt.check({ value: { value: 1.5 } })).toBe(false)
    expect(BoxBoxInt.check({ value: 7 })).toBe(false)
  })
  it('agrees with the parameter path on the same question', () => {
    const { code } = tjs(`function f(n: int) { return 'ok' }`, {
      filename: 'ta.tjs',
    })
    const f = new Function(`${code}\nreturn f`)()
    const isInt = predicate('int')
    for (const v of [2, -3, 0, 1.5, '2', null, {}]) {
      expect(`${JSON.stringify(v)}:${f(v) === 'ok'}`).toBe(
        `${JSON.stringify(v)}:${isInt(v)}`
      )
    }
  })
})

describe('`b: Box<int>` in annotation position', () => {
  const compile = (src) => {
    const { code } = tjs(`Type Box<T> {\n  example: { value: T }\n}\n${src}`, {
      filename: 'ta.tjs',
    })
    return { code, mod: new Function(`${code}\nreturn f`)() }
  }
  it('checks the type argument at the boundary', () => {
    const { mod } = compile(`function f(b: Box<int>) { return b.value }`)
    expect(mod({ value: 7 })).toBe(7)
    expect(String(mod({ value: 1.5 }))).toContain('Expected Box_int')
    expect(String(mod({ value: 's' }))).toContain('Expected Box_int')
  })
  it('distinguishes two applications of the same type', () => {
    const { mod } = compile(`function f(b: Box<string>) { return b.value }`)
    expect(mod({ value: 'a' })).toBe('a')
    expect(String(mod({ value: 1 }))).toContain('Expected Box_string')
  })
  it('carries `unsigned` through, negatives included', () => {
    const { mod } = compile(`function f(b: Box<unsigned>) { return b.value }`)
    expect(mod({ value: 2 })).toBe(2)
    expect(String(mod({ value: -1 }))).toContain('Expected Box_unsigned')
  })
  it('builds the applied type ONCE, not per call', () => {
    const { code } = compile(`function f(b: Box<int>) { return b.value }`)
    expect(code.match(/const Box_int = /g)?.length).toBe(1)
  })
  it('names the binding after the annotation, not a counter', () => {
    const { code } = compile(`function f(b: Box<int>) { return b.value }`)
    expect(code).toContain('const Box_int =')
    expect(code).not.toContain('__ta_')
  })
  it('leaves an ordinary annotation completely alone', () => {
    const { code } = compile(`function f(b: Box) { return b.value }`)
    expect(code).not.toContain('const Box_')
  })
})
