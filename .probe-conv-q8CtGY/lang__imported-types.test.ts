/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 23 */
function link(lib, use, name) {
  const libJs = tjs(lib).code.replace(/^export /gm, '')

  const useJs = tjs(use)
    .code.replace(/^import[^\n]*\n/gm, '')
    .replace(/^export /gm, '')
  const libDecls = libJs.replace(/^const __tjs[\s\S]*?;\n/m, '')
  return new Function(`${useJs}\n${libDecls}\nreturn ${name}`)()
}
link.__tjs = {
  params: {
    lib: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    use: {
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
  source: 'input.ts:23',
}

const LIB = `export Type Within100 {
  description: 'a number from 0 to 100'
  predicate(v) { return typeof v === 'number' && v >= 0 && v <= 100 }
}
`

/* line 39 */
function isErr(v) {
  return !!v && typeof v === 'object' && v.name === 'MonadicError'
}
isErr.__tjs = {
  params: {
    v: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:39',
}

describe('an imported Type is honoured in type position', () => {
  const USE = `import { Within100 } from '/Users/tonioloewald/tjs-lang/src/lang/mymath'

export function pct(v: Within100):! 0 { return v }
`
  it('emits a runtime check rather than degrading to any', () => {
    const code = tjs(USE).code
    expect(code).toContain('Within100.check')
  })
  it('no longer warns that the name could not be resolved', () => {
    const w = (tjs(USE).warnings ?? []).filter((m) =>
      String(m).includes('could not be resolved')
    )
    expect(w).toEqual([])
  })
  it('accepts a conforming value and rejects the rest', () => {
    const pct = link(LIB, USE, 'pct')
    expect(pct(50)).toBe(50)
    expect(isErr(pct(500))).toBe(true)
    expect(isErr(pct('x'))).toBe(true)
  })
  it('degrades rather than throwing when the import is not a runtime type', () => {
    const use = `import { helper } from '/Users/tonioloewald/tjs-lang/src/lang/util'

export function f(v: helper):! 0 { return 1 }
`
    const f = new Function(
      tjs(use)
        .code.replace(/^import[^\n]*\n/gm, '')
        .replace(/^export /gm, '') + '\nconst helper = () => {}\nreturn f'
    )()
    expect(() => f('anything')).not.toThrow()
    expect(f('anything')).toBe(1)
  })
  it('a LOCAL declaration still takes the static path', () => {
    const code = tjs(
      `Type Local { example: 0.0 }\nexport function f(v: Local):! 0 { return 1 }`
    ).code
    expect(code).toContain('__tjs_has_Local')
  })
})
