/**
 * Infix `Is` / `IsNot` find their operands by STRUCTURE (#3830). The operand pattern was
 * `[\w][\w.\[\]()]*`, parentheses as identifier characters, unbalanced, so
 * `console.log(a Is b)` compiled to `Is(console.log(a, b))`: a different program, no error.
 * Operands are now postfix chains with balanced groups (and array/object literals), and where
 * another operator touches an operand, so that infix precedence would decide the meaning, the
 * transform refuses and names the remedy: `Is(a, b)`.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const run = (body: string, ...args: unknown[]) => {
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return new Function(
      `${
        tjs(`function f(a, b, o) { ${body} }`, { runTests: false }).code
      }\nreturn f`
    )()(...args)
  } finally {
    g.__tjs = prev
  }
}

describe('operands are found by structure', () => {
  it('inside a call: console.log(a Is b) logs the comparison', () => {
    const seen: unknown[] = []
    const log = console.log
    console.log = (...v: unknown[]) => seen.push(...v)
    try {
      run('console.log(a Is b)', [1], [1])
    } finally {
      console.log = log
    }
    expect(seen).toEqual([true])
  })

  const rows: [string, unknown[], unknown][] = [
    ['return a Is b', [[1], [1]], true],
    ['return a IsNot b', [[1], [2]], true],
    ['return [1, 2] Is [1, 2]', [], true],
    ['return { x: 1 } Is { x: 1 }', [], true],
    [
      'return o.list[0] Is o.list[1]',
      [null, null, { list: [{ k: 1 }, { k: 1 }] }],
      true,
    ],
    ['return Math.max(a, 1) Is Math.max(b, 1)', [3, 3], true],
    ['return (a) Is (b)', [{ z: 1 }, { z: 2 }], false],
    ['return a Is b && b Is a', [[1], [1]], true],
    ['return a Is b ? "same" : "different"', [[1], [2]], 'different'],
    ["return 'a Is b'", [], 'a Is b'], // a string is data
    ['const s = a Is b\n  b Is a\n  return s', [[1], [1]], true], // statement per line
    ['const Is2 = 1; return Is2', [], 1],
  ]
  for (const [body, args, want] of rows)
    it(body, () => expect(run(body, ...args)).toEqual(want))
})

describe('where precedence would decide, it refuses with the remedy', () => {
  for (const body of [
    'return 1 + a Is b',
    'return a Is b + 1',
    'return !a Is b',
    'return a == b Is a',
    'const x = 1 +\n  a Is b; return x', // a continued line is not a new statement
  ])
    it(body, () => {
      expect(() => run(body, 1, 1)).toThrow(/Is\(a, b\)|write .*Is\(/)
    })
})
