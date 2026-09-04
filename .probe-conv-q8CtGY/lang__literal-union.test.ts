/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { generateDTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/dts'

import { functionMetaToJSONSchema } from '/Users/tonioloewald/tjs-lang/src/lang/json-schema'

/* line 34 */
function fn(src, name = 'f') {
  return new Function(
    `${tjs(src, { filename: 'lu.tjs', runTests: false }).code}\nreturn ${name}`
  )()
}
fn.__tjs = {
  params: {
    src: {
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
      required: false,
      default: 'f',
    },
  },
  unsafe: true,
  source: 'input.ts:34',
}

/* line 39 */
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
  source: 'input.ts:39',
}

describe('a literal union narrows to its members', () => {
  it('accepts a member and rejects a non-member', () => {
    const f = fn(`function f(x: 'yes' | 'no') { return x }`)
    expect(f('yes')).toBe('yes')
    expect(f('no')).toBe('no')
    expect(rejected(f('maybe'))).toBe(true)
  })
  it('used to collapse to `string` — the regression this guards', () => {
    const f = fn(`function f(x: 'a' | 'b') { return x }`)
    expect(rejected(f('c'))).toBe(true)
  })
  it('works with three or more members, and with numbers', () => {
    const f = fn(`function f(x: 1 | 2 | 3) { return x }`)
    expect(f(2)).toBe(2)
    expect(rejected(f(4))).toBe(true)
    expect(rejected(f('2'))).toBe(true)
  })
  it('names the members in the error, not the mechanism', () => {
    const f = fn(`function f(x: 'yes' | 'no') { return x }`)
    expect(String(f('maybe'))).toContain('"yes" | "no"')
  })
})

describe('membership is `==`, with the consequences that implies', () => {
  it('a boxed primitive is a member', () => {
    const f = fn(`function f(x: 'yes' | 'no') { return x }`)
    expect(rejected(f(new String('yes')))).toBe(false)
    expect(rejected(f(new String('maybe')))).toBe(true)
  })
  it('`+0 | +1` is identical to `0 | 1`', () => {
    const plus = fn(`function f(n: +0 | +1) { return n }`)
    const plain = fn(`function f(n: 0 | 1) { return n }`)
    for (const v of [0, 1, 2, -1, 1.5]) {
      expect(`${v}:${rejected(plus(v))}`).toBe(`${v}:${rejected(plain(v))}`)
    }
  })
  it('`1 | 1.0` is a ONE-member union', () => {
    const f = fn(`function f(n: 1 | 1.0) { return n }`)
    expect(f(1)).toBe(1)
    expect(rejected(f(2))).toBe(true)
  })
  it('a boxed number is a member', () => {
    const f = fn(`function f(n: 1 | 2) { return n }`)
    expect(rejected(f(new Number(2)))).toBe(false)
  })
})

describe('what a literal union is NOT', () => {
  it('a MIXED-type union still widens, as before', () => {
    const f = fn(`function f(x: 0 | '') { return x }`)
    expect(f(1)).toBe(1)
    expect(f('s')).toBe('s')
    expect(rejected(f(true))).toBe(true)
  })
  it('a nullable union is unaffected', () => {
    const f = fn(`function f(x: 0 | null) { return x }`)
    expect(f(5)).toBe(5)
    expect(f(null)).toBe(null)
  })
  it('a union of TYPE NAMES is not a literal union', () => {
    const f = fn(`function f(x: string | number) { return x }`)
    expect(f('a')).toBe('a')
    expect(f(1)).toBe(1)
  })
})

describe('literal unions survive a return annotation', () => {
  const ok = (src) =>
    expect(() => tjs(src, { filename: 'lu.tjs' })).not.toThrow()
  it('string union with a worked return example', () => {
    ok("function pick(x: 'yes' | 'no'): 'yes' { return x }")
  })
  it('numeric union with a worked return example', () => {
    ok('function n(x: 1 | 2): 1 { return x }')
  })
  it('union with a type-only return example', () => {
    ok("function pick(x: 'yes' | 'no'):! '' { return x }")
  })
  it('a union member containing a pipe is not split on it', () => {
    ok("function pick(x: 'a|b' | 'c'): 'a|b' { return x }")
  })
  it('an INCONSISTENT worked example still fails — as it must', () => {
    expect(() =>
      tjs("function pick(x: 'yes' | 'no'): '' { return x }", {
        filename: 'lu.tjs',
      })
    ).toThrow(/signature example is inconsistent/)
  })
})

describe('a literal union reaches the artifacts', () => {
  const SRC = `export function pick(x: 'yes' | 'no'): 'yes' { return x }`
  const result = () => tjs(SRC, { filename: 'lu.tjs' })
  it('__tjs metadata carries the members', () => {
    const code = result().code
    expect(code).toContain('"kind": "literal-union"')
    expect(code.replace(/\s+/g, ' ')).toContain('"values": [ "yes", "no" ]')
  })
  it('the .d.ts is a real TypeScript literal union', () => {
    expect(generateDTS(result(), SRC)).toContain('pick(x: "yes" | "no")')
  })
  it('the JSON Schema is an enum', () => {
    const meta = result().metadata?.pick
    const schema = functionMetaToJSONSchema({
      params: meta.params,
      name: 'pick',
    })
    expect(schema?.input?.properties?.x?.enum).toEqual(['yes', 'no'])
  })
  it('a NUMERIC literal union too', () => {
    const src = `export function n(x: 1 | 2): 1 { return x }`
    const r = tjs(src, { filename: 'lu.tjs' })
    expect(generateDTS(r, src)).toContain('n(x: 1 | 2)')
  })
})

describe('literal unions nested and nullable', () => {
  const ok = (src) =>
    expect(() => tjs(src, { filename: 'lu.tjs' })).not.toThrow()
  it('inside an array', () => {
    ok(`function tag(xs: ['yes' | 'no']): 1 { return 1 }`)
  })
  it('inside an object member', () => {
    ok(`function cfg(o: { mode: 'a' | 'b' }): 1 { return 1 }`)
  })
  it('nested two deep', () => {
    ok(`function d(o: { a: { b: 'x' | 'y' } }): 1 { return 1 }`)
  })
  /**
   * SIBLINGS SURVIVE THE COLLAPSE.
   *
   * Every case above puts the union in a container by ITSELF, and that is why the whole
   * multi-member class shipped broken in 0.13.0. `collapseUnions` handed the entire bracket
   * body to itself recursively, found the first depth-0 `|`, and returned only the left of
   * it — so everything after the union inside that bracket was discarded.
   *
   * The result was that whether a file compiles depended on the ORDER of members:
   *
   *     function cfg(o: { mode: 'a' | 'b', other: 1 })   -> THREW
   *     function h(o:   { other: 1, mode: 'a' | 'b' })   -> passed
   *
   * The array case is worse than a throw, because it is silent: `['a' | 'b', 'c']` collapsed
   * to a one-element array, so the signature test ran against a SHORTER argument and passed
   * while checking less than it claimed.
   *
   * Both orders are asserted deliberately. One order alone would have gone green throughout.
   */
  it('an object member after the union survives', () => {
    ok(`function cfg(o: { mode: 'a' | 'b', other: 1 }): 1 { return 1 }`)
  })
  it('an object member before the union survives', () => {
    ok(`function h(o: { other: 1, mode: 'a' | 'b' }): 1 { return 1 }`)
  })
  it('a union between two other members survives', () => {
    ok(`function m(o: { a: 1, mode: 'x' | 'y', b: 2 }): 1 { return 1 }`)
  })
  it('the collapse does not shorten an array', () => {
    ok(`function tag(xs: ['yes' | 'no', 'x']): 2 { return xs.length }`)
  })
  it('two unions in one container both collapse', () => {
    ok(`function t(o: { a: 'p' | 'q', b: 'r' | 's' }): 1 { return 1 }`)
  })
  it('a pipe inside a string is still data', () => {
    ok(`function s(x: 'a|b' | 'c'): 'a|b' { return x }`)
  })
  it('an inconsistent worked example still fails (control)', () => {
    expect(() =>
      tjs(`function w(x: 'yes' | 'no'): '' { return x }`, {
        filename: 'lu.tjs',
      })
    ).toThrow(/signature example is inconsistent/)
  })
  it('a nullable union keeps `| null` in the .d.ts', () => {
    const src = `export function pick(x: 'yes' | 'no' | null): 'yes' { return x ?? 'yes' }`
    expect(generateDTS(tjs(src, { filename: 'lu.tjs' }), src)).toContain(
      '"yes" | "no" | null'
    )
  })
  it('a non-nullable union does NOT gain one (control)', () => {
    const src = `export function q(x: 'yes' | 'no'): 'yes' { return x }`
    const dts = generateDTS(tjs(src, { filename: 'lu.tjs' }), src)
    expect(dts).toContain('"yes" | "no"')
    expect(dts).not.toContain('| null')
  })
})
