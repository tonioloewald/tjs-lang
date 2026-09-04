/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 21 */
function fn(src) {
  return new Function(
    `${tjs(src, { filename: 'as.tjs', runTests: false }).code}\nreturn f`
  )()
}
fn.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:21',
}

/* line 25 */
function rejected(v) {
  return String(v).startsWith('MonadicError')
}
rejected.__tjs = {
  params: {
    v: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:25',
}

describe('`T[]` parses and enforces', () => {
  it('number[] checks the items, not just arrayness', () => {
    const f = fn(`function f(xs: number[]) { return xs.length }`)
    expect(f([1, 2])).toBe(2)
    expect(rejected(f(['x']))).toBe(true)
    expect(rejected(f('nope'))).toBe(true)
  })
  it('string[] likewise', () => {
    const f = fn(`function f(xs: string[]) { return xs.length }`)
    expect(f(['a'])).toBe(1)
    expect(rejected(f([1]))).toBe(true)
  })
  it('nests: string[][]', () => {
    const f = fn(`function f(xs: string[][]) { return xs.length }`)
    expect(f([['a']])).toBe(1)
    expect(rejected(f([[1]]))).toBe(true)
  })
  it('int[] narrows where number[] does not', () => {
    const ints = fn(`function f(xs: int[]) { return xs.length }`)
    const nums = fn(`function f(xs: number[]) { return xs.length }`)
    expect(rejected(ints([1.5]))).toBe(true)
    expect(rejected(nums([1.5]))).toBe(false)
  })
  it('an unknown element type is left alone rather than guessed', () => {
    expect(() =>
      tjs(`function f(xs: Widget[]) { return xs }`, {
        filename: 'as.tjs',
        runTests: false,
      })
    ).toThrow()
  })
})

describe('rest params enforce their element type', () => {
  it('...xs: number[] rejects a bad element', () => {
    const f = fn(`function f(...xs: number[]) { return xs.length }`)
    expect(f(1, 2)).toBe(2)
    expect(rejected(f(1, 'x'))).toBe(true)
  })
  it('...xs: [0] — the example spelling — still works', () => {
    const f = fn(`function f(...xs: [0]) { return xs.length }`)
    expect(f(1, 2)).toBe(2)
    expect(rejected(f(1, 'x'))).toBe(true)
  })
  it('a rest param after a normal one', () => {
    const f = fn(`function f(a: '', ...xs: number[]) { return xs.length }`)
    expect(f('s', 1, 2)).toBe(2)
    expect(rejected(f(1, 2))).toBe(true)
  })
})

describe('rest params reject a default', () => {
  const compile = (src) => tjs(src, { filename: 'as.tjs', runTests: false })
  it('rejects the annotated spelling that used to slip through', () => {
    expect(() =>
      compile(`function f(...xs: number[] = [1]) { return xs }`)
    ).toThrow(/rest parameter cannot have a default/)
  })
  it('rejects it with the example spelling too', () => {
    expect(() => compile(`function f(...xs: [0] = [1]) { return xs }`)).toThrow(
      /rest parameter cannot have a default/
    )
  })
  it('explains WHY, and shows the fix', () => {
    try {
      compile(`function f(...xs: number[] = [1]) { return xs }`)
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.message).toContain('always bound')
      expect(e.message).toContain('...xs: number[]')
    }
  })
  it('a rest param with no default is unaffected', () => {
    expect(() =>
      compile(`function f(...xs: number[]) { return xs }`)
    ).not.toThrow()
  })
  it('an arrow INSIDE the annotation is not mistaken for a default', () => {
    expect(() =>
      compile(`function f(...fns: [(x) => x]) { return fns }`)
    ).not.toThrow()
  })
})
