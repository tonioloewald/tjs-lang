/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 28 */
function run(src, expr) {
  return new Function(
    `${tjs(src, { filename: 'tdz.tjs', runTests: false }).code}\nreturn ${expr}`
  )()
}
run.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    expr: {
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

describe('a type used before its declaration does not crash the module', () => {
  it('Enum declared after the function that names it', () => {
    const src = `
function paint(c: Color) { return c }
const first = paint('red')
Enum Color 'a colour' {
  Red = 'red'
  Green = 'green'
}
`
    expect(run(src, 'first')).toBe('red')
  })
  it('Type declared after the function that names it', () => {
    const src = `
function double(n: Even) { return n * 2 }
const early = double(4)
Type Even 'an even number' {
  example: 0
  predicate(v) { return v % 2 === 0 }
}
`
    expect(run(src, 'early')).toBe(8)
  })
  it('the early call is UNCHECKED, not silently wrong', () => {
    const src = `
function double(n: Even) { return n * 2 }
const early = double(3)
Type Even 'an even number' {
  example: 0
  predicate(v) { return v % 2 === 0 }
}
`
    expect(run(src, 'early')).toBe(6)
  })
})

describe('checking still works once the type is initialised', () => {
  const src = `
Type Even 'an even number' {
  example: 0
  predicate(v) { return v % 2 === 0 }
}
function double(n: Even) { return n * 2 }
`
  it('accepts a valid value', () => {
    expect(run(src, 'double(4)')).toBe(8)
  })
  it('REJECTS an invalid value', () => {
    expect(String(run(src, 'double(3)'))).toContain('Even')
  })
  it('rejects after a late declaration too, once evaluation has finished', () => {
    const late = `
function double(n: Even) { return n * 2 }
Type Even 'an even number' {
  example: 0
  predicate(v) { return v % 2 === 0 }
}
`
    expect(String(run(late, 'double(3)'))).toContain('Even')
    expect(run(late, 'double(4)')).toBe(8)
  })
})
