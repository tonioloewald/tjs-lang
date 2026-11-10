/**
 * An AJS read of an undeclared name is refused when the agent is transpiled (#4002).
 *
 * `return { v: zzz }` transpiled without a word and `zzz` read `undefined` at run time: a typo
 * became a silent wrong answer. The emitter knows every name a program can read (its locals,
 * parameters, callback and loop variables, the catch binding) and the VM's built-ins, so a read
 * of anything else is refused with the remedy. A helper's name read as a VALUE (`let g = double`,
 * docs-swarm digest A.29) and an atom's are refused by name too: neither is a value in AJS.
 *
 * Guarded in BOTH directions: the second half lists programs that must keep compiling, because a
 * check like this fails by rejecting legal code (feedback: guard both directions).
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './core'
import { builtins } from '../vm/runtime'
import { AJS_GLOBAL_NAMES } from './emitters/ast'

describe('undeclared names are refused', () => {
  const refused: [string, string, RegExp][] = [
    [
      'a typo in a return',
      `function f({ count = 0 }) { return { v: coutn } }`,
      /'coutn' is not defined/,
    ],
    [
      'in an expression',
      `function f({ n = 0 }) { const m = n + zzz\n return { m } }`,
      /'zzz' is not defined/,
    ],
    [
      'in a condition',
      `function f({ n = 0 }) { if (ready) { return { n } }\n return { n } }`,
      /'ready' is not defined/,
    ],
    [
      'in a helper',
      `function g(x) { return x + n }\nfunction f({ n = 3 }) { const d = g(1)\n return { d } }`,
      /'n' is not defined/,
    ],
    [
      'a helper as a value',
      `function double(x) { return x * 2 }\nfunction f({}) { let g = double\n return { g } }`,
      /'double' is a helper/,
    ],
    [
      'an atom as a value',
      `function f({}) { let u = uuid\n return { u } }`,
      /'uuid' is an atom/,
    ],
    [
      'used before its declaration in a block it does not reach',
      `function f({}) { if (true) { const a = 1 }\n return { a } }`,
      /'a' is not defined/,
    ],
  ]
  for (const [what, src, message] of refused)
    it(what, () => {
      expect(() => transpile(src)).toThrow(message)
    })
})

describe('declared names still compile (the other direction)', () => {
  const allowed: [string, string][] = [
    [
      'parameters, destructured with defaults',
      `function f({ a = 1, b = '' }) { return { a, b } }`,
    ],
    [
      'let and const',
      `function f({}) { let a = 1\n const b = a + 1\n return { b } }`,
    ],
    [
      'a loop variable',
      `function f({ xs = [0] }) { let t = 0\n for (const x of xs) { t = t + x }\n return { t } }`,
    ],
    [
      'a while counter',
      `function f({ n = 0 }) { let i = 0\n while (i < n) { i = i + 1 }\n return { i } }`,
    ],
    [
      'callback parameters',
      `function f({ xs = [0] }) { const ys = xs.map((x) => x * 2)\n const zs = xs.filter((x) => x > 0)\n const s = xs.reduce((acc, x) => acc + x, 0)\n return { ys, zs, s } }`,
    ],
    [
      'the catch binding',
      `function f({}) { try { Error('x') } catch (e) { return { e } }\n return {} }`,
    ],
    [
      'built-ins',
      `function f({ s = '' }) { const n = parseInt(s)\n const m = Math.max(1, 2)\n const j = JSON.stringify({ a: 1 })\n const d = Date('2024-01-01')\n return { n, m, j, ok: isNaN(n), u: undefined, inf: Infinity } }`,
    ],
    [
      'shorthand properties',
      `function f({ a = 1 }) { const b = 2\n return { a, b } }`,
    ],
    [
      'a helper calling a helper',
      `function sq(x) { return x * x }\nfunction quad(x) { const s = sq(x)\n return sq(s) }\nfunction f({ n = 2 }) { const q = quad(n)\n return { q } }`,
    ],
    [
      'an outer variable read inside a block',
      `function f({}) { const a = 1\n if (a > 0) { const b = a + 1\n return { b } }\n return { a } }`,
    ],
  ]
  for (const [what, src] of allowed)
    it(what, () => {
      expect(() => transpile(src)).not.toThrow()
    })
})

it("the emitter's global names are exactly the VM's built-ins (drift guard)", () => {
  expect([...AJS_GLOBAL_NAMES].sort()).toEqual(Object.keys(builtins).sort())
})
