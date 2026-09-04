/* tjs <- input.ts */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  createRuntime,
  isMonadicError,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

import { typeDescriptorToJSONSchema } from '/Users/tonioloewald/tjs-lang/src/lang/json-schema'

let saved

beforeAll(() => {
  saved = globalThis.__tjs
  globalThis.__tjs = createRuntime()
})

afterAll(() => {
  globalThis.__tjs = saved
})

/* line 28 */
function compile(src, name = 'f') {
  return new Function(tjs(src, { runTests: false }).code + `\nreturn ${name}`)()
}
compile.__tjs = {
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
  source: 'input.ts:28',
}

describe('sound TS type names are honoured as runtime types', () => {
  it('string / number / boolean validate, exactly like example types', () => {
    const s = compile(`function f(s: string) { return s }`)
    expect(s('ok')).toBe('ok')
    expect(isMonadicError(s(42)), '`s: string` must reject a number').toBe(true)
    const n = compile(`function f(n: number) { return n }`)
    expect(n(1.5)).toBe(1.5)
    expect(isMonadicError(n('nope'))).toBe(true)
    const b = compile(`function f(b: boolean) { return b }`)
    expect(b(true)).toBe(true)
    expect(isMonadicError(b('nope'))).toBe(true)
  })
  it('a TS name and the equivalent example agree', () => {
    const viaName = compile(`function f(s: string) { return s }`)
    const viaExample = compile(`function f(s: '') { return s }`)
    expect(isMonadicError(viaName(42))).toBe(isMonadicError(viaExample(42)))
    expect(viaName('x')).toBe(viaExample('x'))
  })
  it('unions of sound types validate', () => {
    const u = compile(`function f(a: string | number) { return a }`)
    expect(u('x')).toBe('x')
    expect(u(1)).toBe(1)
    expect(isMonadicError(u(true))).toBe(true)
  })
  it('`any`/`unknown` mean what they say — unconstrained', () => {
    for (const src of [
      `function f(a: any) { return a }`,
      `function f(a: unknown) { return a }`,
    ]) {
      const f = compile(src)
      expect(isMonadicError(f(42))).toBe(false)
      expect(isMonadicError(f('x'))).toBe(false)
    }
  })
  it('an unresolvable user type degrades to best-effort, not an error', () => {
    const f = compile(`function f(a: MyThing) { return a }`)
    expect(isMonadicError(f(42))).toBe(false)
  })
  it('`string[]` parses and enforces', () => {
    const f = new Function(
      `${
        tjs(`function f(a: string[]) { return a.length }`, { runTests: false })
          .code
      }\nreturn f`
    )()
    expect(f(['a'])).toBe(1)
    expect(String(f([1]))).toContain('MonadicError')
  })
})

describe('best-effort degradation teaches the ladder', () => {
  it('an unresolvable type warns and suggests example / sound type / predicate', () => {
    const r = tjs(`function f(a: MyThing) { return a }`, { runTests: false })
    const w = (r.warnings ?? []).join('\n')
    expect(w).toContain('MyThing')
    expect(w).toContain('best effort')

    expect(w).toMatch(/Type MyThing \{ predicate/)
  })
  it('does NOT warn when `any`/`unknown` was asked for explicitly', () => {
    const r = tjs(`function f(a: any, b: unknown) { return a }`, {
      runTests: false,
    })
    expect(r.warnings ?? []).toEqual([])
  })
  it('does NOT warn for sound types or examples', () => {
    const r = tjs(`function f(a: string, b: 3, c: 3.0) { return a }`, {
      runTests: false,
    })
    expect(r.warnings ?? []).toEqual([])
  })
})

describe('TJS numeric extensions: int / unsigned', () => {
  it('int rejects a float; unsigned rejects a negative', () => {
    const i = compile(`function f(n: int) { return n }`)
    expect(i(5)).toBe(5)
    expect(isMonadicError(i(3.5))).toBe(true)
    const u = compile(`function f(n: unsigned) { return n }`)
    expect(u(5)).toBe(5)
    expect(isMonadicError(u(-1))).toBe(true)
  })
  it('the named type and its example shorthand are the SAME type', () => {
    const pairs = [
      ['int', '5', 3.5],
      ['unsigned', '+5', -1],
      ['number', '5.0', 'x'],
      ['float', '5.0', 'x'],
    ]
    for (const [named, example, bad] of pairs) {
      const a = compile(`function f(n: ${named}) { return n }`)
      const b = compile(`function f(n: ${example}) { return n }`)
      expect(
        isMonadicError(a(bad)),
        `\`n: ${named}\` and \`n: ${example}\` must agree on ${JSON.stringify(
          bad
        )}`
      ).toBe(isMonadicError(b(bad)))
    }
  })
  it('`uint` is an alias for unsigned', () => {
    const u = compile(`function f(n: uint) { return n }`)
    expect(isMonadicError(u(-1))).toBe(true)
    expect(u(3)).toBe(3)
  })
  it('naming them does not narrow plain `number` (pasted TS is unaffected)', () => {
    const n = compile(`function f(n: number) { return n }`)
    expect(isMonadicError(n(3.5))).toBe(false)
    expect(isMonadicError(n(-1))).toBe(false)
  })
  it('they no longer trigger the unresolved-type warning', () => {
    const r = tjs(
      `function f(a: int, b: unsigned, c: uint, d: float) { return a }`,
      {
        runTests: false,
      }
    )
    expect(r.warnings ?? []).toEqual([])
  })
})

describe('pattern-constrained strings (descriptor level)', () => {
  const patternType = { kind: 'string', pattern: '^\\d{5}$' }
  it('a pattern descriptor emits a real runtime check', () => {
    const f = compile(`function f(s: '') { return s }`)
    f.__tjs.params.s.type = patternType

    const check = new Function(
      'v',
      `return (typeof v !== 'string' || !new RegExp(${JSON.stringify(
        patternType.pattern
      )}, "").test(v))`
    )
    expect(check('12345'), '"12345" must pass').toBe(false)
    expect(check('nope'), '"nope" must fail').toBe(true)
    expect(check(12345), 'a non-string must fail').toBe(true)
  })
  it('reaches JSON Schema via the NATIVE `pattern` keyword', () => {
    expect(typeDescriptorToJSONSchema(patternType)).toEqual({
      type: 'string',
      pattern: '^\\d{5}$',
    })
  })
  it('omits `pattern` when flags make it untranslatable', () => {
    expect(typeDescriptorToJSONSchema({ ...patternType, flags: 'i' })).toEqual({
      type: 'string',
    })
  })
  it('a BARE regexp does not silently mean a constrained string', () => {
    const f = compile(`function f(s: /^\\d+$/) { return s }`)
    expect(isMonadicError(f('anything')), 'must not enforce the pattern').toBe(
      false
    )
  })
})
