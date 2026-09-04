/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 15 */
function build(src, names) {
  const r = tjs(src, { filename: 'eu.tjs', runTests: false })
  return {
    ...new Function(`${r.code}\nreturn { ${names.join(', ')} }`)(),
    warnings: r.warnings ?? [],
  }
}
build.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    names: {
      type: {
        kind: 'array',
        items: {
          kind: 'string',
        },
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:15',
}

/* line 22 */
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
  source: 'input.ts:22',
}

const COLOR = `Enum Color 'a css color' {\n  Red = 'red'\n  Green = 'green'\n}\n`

describe('Enum annotations are enforced', () => {
  it('rejects a non-member and accepts a member', () => {
    const m = build(`${COLOR}function f(c: Color) { return c }`, ['f'])
    expect(m.f('red')).toBe('red')
    expect(rejected(m.f('mauve'))).toBe(true)
  })
  it('does not warn that its own declared type is unresolvable', () => {
    const m = build(`${COLOR}function f(c: Color) { return c }`, ['f'])
    expect(m.warnings.filter((w) => w.includes('Color'))).toEqual([])
  })
  it('carries `members`, `names` and `keys` in EMITTED code', () => {
    const m = build(COLOR, ['Color'])
    expect(m.Color.members.Red).toBe('red')
    expect(m.Color.names.red).toBe('Red')
    expect(m.Color.keys).toEqual(['Red', 'Green'])
  })
})

describe('Union annotations are enforced', () => {
  it('rejects a value outside the union', () => {
    const m = build(
      `Union Small 'small' { 1 | 2 }\nfunction f(n: Small) { return n }`,
      ['f']
    )
    expect(m.f(1)).toBe(1)
    expect(rejected(m.f(9))).toBe(true)
  })
})
