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
    // headers that span lines, or carry a label / `await` (rc.2 eighth re-review M2). A FALSE
    // condition each time: emptied, the body would run anyway.
    [
      'a header spanning lines',
      `function m(a, b) {\n  let r = [0]\n  if (a &&\n    b)\n    [r] = [[1]]\n  return r\n}`,
      [false, true],
      [0],
    ],
    [
      'else if spanning lines',
      `function n(a, b) {\n  let r = 0\n  if (a) r = 1\n  else if (b ||\n    a)\n    [r] = [2]\n  return r\n}`,
      [false, false],
      0,
    ],
    [
      'a labelled for',
      `function lab() {\n  let s = 0\n  outer: for (let i = 0; i < 3; i++)\n    [s] = [s + i]\n  return s\n}`,
      [],
      3,
    ],
    [
      'a header with a string holding a paren',
      `function str(x) {\n  let r = 0\n  if (x === ')(')\n    [r] = [1]\n  return r\n}`,
      ['no'],
      0,
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

  it('for await (…) is a header', async () => {
    const src = `async function fa(xs) {\n  let out = []\n  for await (const x of xs)\n    [out[out.length]] = [x]\n  return out\n}`
    expect(await run(src, 'fa', [1, 2])).toEqual([1, 2])
  })

  it('a member named like a keyword is not a header', () => {
    // `o.if(…)` is a call; the line after it is the footgun and keeps its guard
    const src = `function mem() {\n  let x = 0\n  const o = { if: (v) => [v] }\n  o.if(1)\n  [x] = [5]\n  return x\n}`
    expect(run(src, 'mem')).toBe(5)
  })

  it('a COMPLETE one-line if is not a header: the next line is still separated', () => {
    // JavaScript would read `foo(b)[x] = 1`; TJS keeps them apart, as it always has
    const src = `function k(b) {\n  let x = 0\n  const foo = (v) => [v]\n  if (b) foo(b)\n  [x] = [7]\n  return x\n}`
    expect(compiles(src)).toBe(true)
    expect(run(src, 'k', true)).toBe(7)
  })
})
