/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { generateDTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/dts'

/* line 28 */
function dts(src) {
  return generateDTS(tjs(src, { runTests: false }), src)
}
dts.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:28',
}

describe('complex TypeScript types survive to the .d.ts', () => {
  it('preserves a conditional type with `infer`', () => {
    const src = `export Generic Unwrap<T> {
  description: 'Unwrap'
  predicate(x, T) { return true }
  declaration {
    // TS: T extends Promise<infer U> ? U : T
  }
}
`
    expect(dts(src)).toContain(
      'export type Unwrap<T> = T extends Promise<infer U> ? U : T;'
    )
  })
  it('preserves a template-literal type containing braces', () => {
    const src = `export Type Route {
  // TS: \`/\${string}/\${number}\`
}
`
    const out = dts(src)
    expect(out).toContain('export type Route = `/${string}/${number}`;')
    expect(out).not.toContain('`/${string;')
  })
  it('emits a parameterized type declared with the `Type` spelling', () => {
    const src = `export Type Boxed<T> {
  predicate(x, T) { return T(x.value) }
  declaration {
    value: T
    path: string
  }
}
`
    const out = dts(src)
    expect(out).toContain('export interface Boxed<T>')
    expect(out).toContain('value: T')
  })
  it('emits identical declarations for the Type and Generic spellings', () => {
    const body = `{
  predicate(x, T) { return true }
  declaration {
    // TS: T extends string ? 1 : 0
  }
}
`
    expect(dts(`export Type Same<T> ${body}`)).toBe(
      dts(`export Generic Same<T> ${body}`)
    )
  })
  it('names a declared type in a signature rather than erasing it to any', () => {
    const src = `export Type Even {
  description: 'an even number'
  example: 2
  predicate(x) { return x % 2 === 0 }
}
export function double(n: Even) { return n * 2 }
`
    const out = dts(src)
    expect(out).toContain('double(n: Even)')
    expect(out).not.toContain('double(n: any)')
  })
})

describe('an empty parameter list does not forbid arguments', () => {
  it('Eval accepts an arbitrary context bag', async () => {
    const { Eval } = await import('/Users/tonioloewald/tjs-lang/src/lang/eval')
    expect(
      (await Eval({ code: 'a + b', context: { a: 1, b: 2 } })).result
    ).toBe(3)
  })
  it('Eval still works with an empty context', async () => {
    const { Eval } = await import('/Users/tonioloewald/tjs-lang/src/lang/eval')
    expect((await Eval({ code: '1 + 1', context: {} })).result).toBe(2)
  })
  it('a DECLARED parameter list still closes the object', async () => {
    const { transpile } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/index'
    )
    const ast = transpile(`function add({ a, b }) { return a + b }`).ast
    expect(ast?.inputSchema?.additionalProperties).toBe(false)
  })
})

describe('accessors emit as accessors, with asymmetric read/write types', () => {
  const SRC = `export class Field {
  constructor() { this._v = '' }
  get value(): '' { return this._v }
  set value(x) { this._v = String(x) }
  get count(): 0 { return this._v.length }
  describe(prefix: ''): '' { return prefix + this._v }
}
`
  it('emits a getter as a getter, with its declared type', () => {
    expect(dts(SRC)).toContain('get value(): string;')
  })
  it('emits a setter as a setter', () => {
    const out = dts(SRC)
    expect(out).toContain('set value(x: any);')

    expect(out).not.toContain('value(): any;')
    expect(out).not.toContain('value(x: any): any;')
  })
  it('read and write types are INDEPENDENT', () => {
    const out = dts(SRC)
    expect(out).toMatch(/get value\(\): string;/)
    expect(out).toMatch(/set value\(x: any\);/)
  })
  it('a getter-only accessor emits no setter', () => {
    const out = dts(SRC)
    expect(out).toContain('get count(): number;')
    expect(out).not.toContain('set count(')
  })
  it('ordinary methods still emit as methods, and now carry their return type', () => {
    const out = dts(SRC)
    expect(out).toContain('describe(prefix: string): string;')
  })
})
