/**
 * A parameter annotation on a function nested inside an expression is an annotation, never a
 * default (#3147).
 *
 * `preprocess` turns `(x: '' | null)` into `(x = '' | null)` and records the offset; the
 * emitter then deletes the `= …` for the functions it processes. It processed declarations,
 * named arrows, methods and class fields, but not an arrow that is an OPERAND, so
 * `globalThis.NOPE || ((x: '' | null) => x)` kept `x = '' | null`, a default that evaluates
 * to 0. Validation for these functions is a larger change; this pins that the annotation
 * never becomes a runtime default.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

function run(src: string, name: string): any {
  const prev = (globalThis as any).__tjs
  ;(globalThis as any).__tjs = createRuntime()
  try {
    const code = tjs(src, { runTests: false }).code
    return new Function(`${code}\nreturn ${name}`)()
  } finally {
    ;(globalThis as any).__tjs = prev
  }
}

const SHAPES: Array<[string, string]> = [
  ['an operand of ||', `const g = globalThis.NOPE || ((x: '' | null) => x)`],
  ['a call argument', `const g = [0].map(() => (x: 0) => x)[0]`],
  ['an array element', `const g = [(x: 'a') => x][0]`],
  ['an object property', `const g = { f: (x: 0) => x }.f`],
  ['a conditional branch', `const g = globalThis.NOPE ? null : (x: 0) => x`],
  [
    'a function expression',
    `const g = globalThis.NOPE || function (x: 0) { return x }`,
  ],
  [
    'a returned arrow',
    `function mk() { return (x: 0, y: '') => [x, y] }\nconst g = mk()`,
  ],
]

describe('a nested function keeps its annotation out of its defaults', () => {
  for (const [where, src] of SHAPES)
    it(where, () => {
      const g = run(src, 'g')
      expect(g()).toEqual(
        where === 'a returned arrow' ? [undefined, undefined] : undefined
      )
      const code = tjs(src, { runTests: false }).code
      expect(code).not.toMatch(/\(x = /)
    })

  it('a real default on a nested arrow is kept', () => {
    const g = run(`const g = globalThis.NOPE || ((x = 5) => x)`, 'g')
    expect(g()).toBe(5)
  })
})
