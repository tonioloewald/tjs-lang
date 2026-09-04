/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 26 */
function compile(src) {
  return tjs(src, { filename: 't.tjs', runTests: false }).code
}
compile.__tjs = {
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
  source: 'input.ts:26',
}

/* line 28 */
function load(src, name) {
  return new Function(`${compile(src)}\nreturn ${name}`)()
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

describe('a type-name optional does not delete another function default', () => {
  /**
   * Every case here defaults to an IDENTIFIER, deliberately.
   *
   * The emitter only deletes when the default is an `Identifier` — `n = 5` is a `Literal`
   * and was never at risk. A first draft of these tests used literal defaults and passed
   * against the BROKEN implementation, which is exactly how a name-keyed side channel
   * survives a 3,500-test suite.
   */
  it('keeps a genuine default in a sibling function', () => {
    const src = `
const fallback = 7
function a(n?: number) { return n }
function b(n = fallback) { return n }
`
    expect(load(src, 'b')()).toBe(7)
  })
  it('still deletes the dangling annotation in the function that has it', () => {
    const src = `
const fallback = 7
function a(n?: number) { return n }
function b(n = fallback) { return n }
`
    expect(() => load(src, 'a')()).not.toThrow()
    expect(load(src, 'a')()).toBe(undefined)
  })
  it('holds for an arrow function', () => {
    const src = `
const fallback = 7
function a(n?: number) { return n }
const b = (n = fallback) => n
`
    expect(load(src, 'b')()).toBe(7)
  })
  it('holds for a class method', () => {
    const src = `
const greeting = 'hi'
function a(value?: string) { return value }
class C {
  m(value = greeting) { return value }
}
`
    const C = load(src, 'C')
    expect(new C().m()).toBe('hi')
  })
})

describe('class method parameters are rewritten like function parameters', () => {
  const C = () =>
    load(
      `
class C {
  optional(value?: string) { return value }
  required(x: 0) { return x }
  defaulted(n = 3) { return n }
}
`,
      'C'
    )
  it('an optional type-name annotation does not become a dangling default', () => {
    expect(new (C())().optional()).toBe(undefined)
  })
  it('a required annotation does not become a silent default', () => {
    expect(new (C())().required(5)).toBe(5)
  })
  it('a genuine default is left alone', () => {
    expect(new (C())().defaulted()).toBe(3)
  })
})

describe('a required destructured member does not delete a sibling default', () => {
  it('keeps a defaulted member in another function', () => {
    const src = `
function a({x: 2}) { return x }
function b({x = 5}) { return x }
`
    expect(load(src, 'b')({})).toBe(5)
  })
  it('still enforces required in the function that declared it', () => {
    const src = `
function a({x: 2}) { return x }
function b({x = 5}) { return x }
`
    const a = load(src, 'a')

    expect(String(a({}))).toContain('Error')
  })
})

describe('a shared name AND a shared value still keep the two apart', () => {
  it('declaration beside declaration', () => {
    expect(
      load(
        `
function scale(factor: 1) { return factor }
function grow(factor = 1) { return factor + 1 }
`,
        'grow'
      )()
    ).toBe(2)
  })
  it('declaration beside class method', () => {
    const C = load(
      `
function step(amount: 1) { return amount }
class Counter { bump(amount = 1) { return amount } }
`,
      'Counter'
    )
    expect(new C().bump()).toBe(1)
  })
  it('declaration beside arrow', () => {
    expect(
      load(
        `
function a(n: 0) { return n }
const b = (n = 0) => n + 1
`,
        'b'
      )()
    ).toBe(1)
  })
  it('destructured member beside destructured member', () => {
    expect(
      load(
        `
function a({x: 2}) { return x }
function b({x = 2}) { return x }
`,
        'b'
      )({})
    ).toBe(2)
  })
  it('and the REQUIRED one is still required', () => {
    expect(
      String(
        load(
          `
function scale(factor: 1) { return factor }
function grow(factor = 1) { return factor + 1 }
`,
          'scale'
        )()
      )
    ).toContain('Expected')
  })
  it('a string literal shared between two functions', () => {
    expect(
      load(
        `
function need(label: '') { return label }
function want(label = '') { return label + '!' }
`,
        'want'
      )()
    ).toBe('!')
  })
})
