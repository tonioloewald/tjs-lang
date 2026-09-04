/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { transpile } from '/Users/tonioloewald/tjs-lang/src/lang/core'

const ACCEPTED = [
  [
    'function + object return',
    `function f({ input }) { return { output: input * 2 } }`,
  ],
  [
    'let / const',
    `function f(n) { let x = 10\n const y = 'hello'\n return { x, y, n } }`,
  ],
  [
    'if / else',
    `function f(x) { if (x > 5) { return { size: 'big' } } else { return { size: 'small' } } }`,
  ],
  [
    'for...of',
    `function f(items) { const results = []\n for (let item of items) { results.push(item) }\n return { results } }`,
  ],
  [
    'while',
    `function f(count) { while (count > 0) { count = count - 1 }\n return { count } }`,
  ],
  [
    'try/catch',
    `function f(x) { try { return { x } } catch (e) { return { error: e.message } } }`,
  ],
  [
    'template literal',
    `function f(name) { let message = \`Hello, \${name}!\`\n return { message } }`,
  ],
  [
    'object/array literal',
    `function f() { let obj = { a: 1, b: 2 }\n let arr = [1, 2, 3]\n return { obj, arr } }`,
  ],
  [
    'spread (object)',
    `function f(d, o) { let merged = { ...d, ...o }\n return { merged } }`,
  ],
  [
    'spread (array)',
    `function f(a1, a2) { let combined = [...a1, ...a2]\n return { combined } }`,
  ],
  [
    'ternary',
    `function f(x) { let r = x > 0 ? 'positive' : 'non-positive'\n return { r } }`,
  ],
  [
    'logical && || ??',
    `function f(a, b, d) { let v = a && b\n let fb = a || d\n let n = a ?? d\n return { v, fb, n } }`,
  ],

  ['colon shorthand params', `function f(n: 0, s: 'x') { return { n, s } }`],
  ['default param', `function f(limit = 10) { return { limit } }`],
  ['return type annotation', `function f(n: 0): { v: 0 } { return { v: n } }`],

  [
    'destructured parameter',
    `function agent({ apiKey }) { return { apiKey } }`,
  ],
  [
    'local helpers (last = entry)',
    `function double(x) { return x * 2 }\nfunction main(n) { const d = double(n)\n return { d } }`,
  ],
  [
    'helper calling helper',
    `function double(x) { return x * 2 }\nfunction addOne(x) { const d = double(x)\n return d + 1 }\nfunction main(n) { const a = addOne(n)\n return { a } }`,
  ],
  [
    'recursion',
    `function fact(n) { if (n <= 1) { return 1 }\n const p = fact(n - 1)\n return n * p }\nfunction main(n) { const f = fact(n)\n return { f } }`,
  ],

  [
    'line comment with apostrophe',
    `function f(n) {\n // don't confuse the quote scanner\n return { n }\n}`,
  ],
  [
    'block comment',
    `function f(n) {\n /* block\n comment */\n return { n }\n}`,
  ],
  [
    '== and !=',
    `function f(a, b) { const e = a == b\n const n = a != b\n return { e, n } }`,
  ],
  [
    '=== and !==',
    `function f(a, b) { const e = a === b\n const n = a !== b\n return { e, n } }`,
  ],
  ['member access', `function f(o) { return { v: o.a.b } }`],
  ['literal index', `function f(items) { return { first: items[0] } }`],
  [
    'atom call',
    `function f(query) { let results = storeSearch({ query })\n return { results } }`,
  ],
  [
    'nested object/array return',
    `function f(a) { return { o: { k: a }, xs: [a] } }`,
  ],
  [
    'arrow in expression',
    `function f(xs) { const ys = xs.map(x => x * 2)\n return { ys } }`,
  ],
  ['hashbang', `#!/usr/bin/env node\nfunction f(n) { return { n } }`],
]

const REJECTED = [
  [
    'C-style for',
    `function f() { let t = 0\n for (let i = 0; i < 10; i++) { t = t + i }\n return { t } }`,
  ],
  [
    'destructuring declaration (object)',
    `function f(user) { let { name } = user\n return { name } }`,
  ],
  [
    'destructuring declaration (array)',
    `function f(items) { let [first] = items\n return { first } }`,
  ],
]

describe('AJS accepts everything DOCS-AJS.md says it has', () => {
  for (const [label, src] of ACCEPTED) {
    it(`accepts: ${label}`, () => {
      expect(() => transpile(src)).not.toThrow()
    })
  }
})

describe('AJS rejects what it does not have (documented boundary)', () => {
  for (const [label, src] of REJECTED) {
    it(`rejects: ${label}`, () => {
      expect(() => transpile(src)).toThrow()
    })
  }
})
