/**
 * The ASI guard does not empty a brace-less control statement's body.
 *
 * TJS puts a `;` in front of a line that starts with `(`, `[` or a backtick, so it cannot
 * silently continue the previous line. After a bare control HEADER that line is the statement's
 * BODY — and the `;` became the body (an empty statement), so
 *
 *     if (c === '*')
 *       [min, max] = [0, Infinity]
 *     else …
 *
 * orphaned the `else`: valid JavaScript refused by native TJS (found when the VM's regex parser
 * entered the dogfood corpus, 2026-10-02). A COMPLETE one-line statement ending in `)` —
 * `if (a) foo(b)` — is not a header: the next line is still the footgun the guard exists for.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const compiles = (src: string) => {
  tjs(src, { runTests: false })
  return true
}
const run = (src: string, name: string, ...args: unknown[]) =>
  new Function(tjs(src, { runTests: false }).code + `\nreturn ${name}`)()(
    ...args
  )

describe('a brace-less control body keeps its body', () => {
  const rows: Array<[string, string, unknown[], unknown]> = [
    [
      'if / else if / else, destructuring bodies',
      `function q(c) {\n  let a\n  let b\n  if (c === '*')\n    [a, b] = [0, 1]\n  else if (c === '+')\n    [a, b] = [1, 2]\n  else\n    [a, b] = [9, 9]\n  return [a, b]\n}`,
      ['+'],
      [1, 2],
    ],
    [
      'while',
      `function w() {\n  let xs = []\n  let i = 0\n  while (i++ < 2)\n    [xs[xs.length]] = [i]\n  return xs\n}`,
      [],
      [1, 2],
    ],
    [
      'for',
      `function g() {\n  let out = []\n  for (let i = 0; i < 2; i++)\n    (out.push(i))\n  return out\n}`,
      [],
      [0, 1],
    ],
    // a FALSE condition: emptied, the body would run anyway and r would be 2
    [
      'a header with parens inside',
      `function h(x) {\n  let r = 0\n  if ((x).length > (5))\n    [r] = [x.length]\n  return r\n}`,
      ['ab'],
      0,
    ],
  ]
  for (const [name, src, args, want] of rows)
    it(name, () => {
      expect(run(src, src.match(/function (\w+)/)![1], ...args)).toEqual(want)
    })

  it('a COMPLETE one-line if is not a header: the next line is still separated', () => {
    // JavaScript would read `foo(b)[x] = 1`; TJS keeps them apart, as it always has
    const src = `function k(b) {\n  let x = 0\n  const foo = (v) => [v]\n  if (b) foo(b)\n  [x] = [7]\n  return x\n}`
    expect(compiles(src)).toBe(true)
    expect(run(src, 'k', true)).toBe(7)
  })
})
