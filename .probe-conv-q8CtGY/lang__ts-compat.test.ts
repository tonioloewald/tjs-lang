function __ub(v) {
  try {
    if (v instanceof String) return String.prototype.valueOf.call(v)
    if (v instanceof Number) return Number.prototype.valueOf.call(v)
    if (v instanceof Boolean) return Boolean.prototype.valueOf.call(v)
  } catch {
    return v
  }
  return v
}
const __ac = Object.create(null)
function __proj(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v
  let k
  try {
    k = v.constructor && v.constructor.name
  } catch {
    return v
  }
  let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null
  if (typeof f !== 'function') {
    try {
      f = v.asCompared
    } catch {
      return v
    }
  }
  if (typeof f !== 'function') return v
  let p
  try {
    p = f.call(v)
  } catch {
    return v
  }
  const t = typeof p
  return p === null ||
    p === undefined ||
    t === 'number' ||
    t === 'string' ||
    t === 'boolean'
    ? p
    : v
}
function Eq(a, b) {
  a = __ub(__proj(a))
  b = __ub(__proj(b))
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b))
    return true
  if ((a === null || a === undefined) && (b === null || b === undefined))
    return true
  return false
}
function DangerousLegacyEquals(a, b) {
  return a == b
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Eq }
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  createRuntime,
  isMonadicError,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

import { fromTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'

/* line 28 */
function compile(src) {
  return tjs(src, { runTests: false })
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
  },
  unsafe: true,
  source: 'input.ts:28',
}

const CASES = [
  {
    name: 'primitive params',
    src: `function f(s: string, n: number, b: boolean) { return s }`,
    supported: true,
  },
  {
    name: 'optional param',
    src: `function f(n?: number) { return n }`,
    supported: true,
  },
  {
    name: 'object literal type',
    src: `function f(o: { id: number, name: string }) { return o }`,
    supported: true,
  },
  {
    name: 'union of primitives',
    src: `function f(x: string | number) { return x }`,
    supported: true,
  },
  {
    name: 'literal union',
    src: `function f(x: 'a' | 'b') { return x }`,
    supported: true,
  },
  {
    name: 'return annotation',
    src: `function f(s: string): string { return s }`,
    supported: true,
  },
  {
    name: 'void return',
    src: `function f(s: string): void { }`,
    supported: true,
  },
  {
    name: 'nullable union',
    src: `function f(x: string | null) { return x }`,
    supported: true,
  },
  {
    name: 'arrow with types',
    src: `const f = (s: string): string => s`,
    supported: true,
  },
  {
    name: 'rest param typed',
    src: `function f(...xs: number[]) { return xs }`,
    supported: true,
  },
  {
    name: 'tuple type',
    src: `function f(p: [number, string]) { return p }`,
    supported: true,
  },
  {
    name: 'export function',
    src: `export function f(s: string) { return s }`,
    supported: true,
  },

  {
    name: 'array T[]',
    src: `function f(a: string[]) { return a }`,
    supported: true,
  },

  {
    name: 'Array<T>',
    src: `function f(a: Array<string>) { return a }`,
    supported: false,
  },
  {
    name: 'Promise<T> return',
    src: `async function f(): Promise<string> { return 'x' }`,
    supported: false,
  },
  {
    name: 'Record<K,V>',
    src: `function f(m: Record<string, number>) { return m }`,
    supported: false,
  },
  {
    name: 'generic function',
    src: `function f<T>(x: T): T { return x }`,
    supported: false,
  },

  {
    name: 'interface',
    src: `interface User { id: number }\nfunction f(u: User) { return u }`,
    supported: false,
  },
  {
    name: 'type alias',
    src: `type ID = string\nfunction f(x: ID) { return x }`,
    supported: false,
  },
  { name: 'enum', src: `enum E { A, B }`, supported: false },
  {
    name: 'import type',
    src: `import type { Foo } from '/Users/tonioloewald/tjs-lang/src/lang/x'\nfunction f(x: number) { return x }`,
    supported: false,
  },

  {
    name: 'class field types',
    src: `class A { x: number = 1; m(s: string): string { return s } }`,
    supported: false,
  },
  {
    name: 'access modifiers',
    src: `class A { private readonly x: number = 1 }`,
    supported: false,
  },

  {
    name: 'as cast',
    src: `function f(x: unknown) { return x as string }`,
    supported: false,
  },

  {
    name: 'param with default',
    src: `function f(n: number = 5) { return n }`,
    supported: false,
  },
]

describe('TypeScript conformance (are we TypeScript++ yet?)', () => {
  for (const c of CASES.filter((c) => c.supported)) {
    it(`accepts: ${c.name}`, () => {
      expect(() => compile(c.src)).not.toThrow()
    })
  }
  for (const c of CASES.filter((c) => !c.supported)) {
    it(`KNOWN GAP: ${c.name}`, () => {
      expect(
        () => compile(c.src),
        `\`${c.name}\` now compiles — promote it to supported: true in this file.`
      ).toThrow()
    })
  }
  it('reports the conformance score', () => {
    const ok = CASES.filter((c) => c.supported).length

    console.log(
      `  TypeScript conformance: ${ok}/${CASES.length} ` +
        `(${Math.round((ok / CASES.length) * 100)}%)`
    )
    expect(ok).toBeGreaterThan(0)
  })
})

describe('semantic drift is a CONVERSION job, not a breaking change', () => {
  const saved = globalThis.__tjs
  const run = (src, v) => {
    globalThis.__tjs = createRuntime()
    try {
      const f = new Function(compile(src).code + '\nreturn f')()
      return isMonadicError(f(v))
    } finally {
      globalThis.__tjs = saved
    }
  }
  it('`n = 5` narrows to an integer — TJS meaning, deliberately kept', () => {
    expect(run(`function f(n = 5) { return n }`, 3.5)).toBe(true)
  })
  it('`n = 5.0` is the rewrite: TS semantics preserved, default intact', () => {
    expect(
      run(`function f(n = 5.0) { return n }`, 3.5),
      '3.5 must be accepted'
    ).toBe(false)
    globalThis.__tjs = createRuntime()
    try {
      const f = new Function(
        compile(`function f(n = 5.0) { return n }`).code + '\nreturn f'
      )()
      expect(f(undefined), 'the default must still be 5').toBe(5)
    } finally {
      globalThis.__tjs = saved
    }
  })
  it('the finer grain the comment should teach is real', () => {
    expect(
      run(`function f(n = 5) { return n }`, 3.5),
      '= 5 rejects a float'
    ).toBe(true)
    expect(
      run(`function f(n = +5) { return n }`, -1),
      '= +5 rejects a negative'
    ).toBe(true)
  })
  it('no drift: `n: number` and `s = ""` already agree with TypeScript', () => {
    expect(run(`function f(n: number) { return n }`, 3.5)).toBe(false)
    expect(run(`function f(s = 'a') { return s }`, 'zz')).toBe(false)
  })
})

describe('the rename seam: acceptance is necessary but NOT sufficient', () => {
  const FOOTGUNS = [
    `function check(a: string, b: number) {`,
    `  if (a == b) return true`,
    `  return false`,
    `}`,
  ].join('\n')
  it('converted output keeps JS `==` semantics while the marker is present', () => {
    const converted = fromTS(FOOTGUNS, { emitTJS: true }).code
    expect(converted).toContain('/* tjs <-')
    const js = compile(converted).code
    expect(
      js.includes('Eq('),
      'with the fromTS marker, modes are OFF and `==` must keep JS semantics'
    ).toBe(false)
  })
  it('dropping the marker flips `==` to TJS equality — a SILENT semantic change', () => {
    const converted = fromTS(FOOTGUNS, { emitTJS: true }).code
    const stripped = converted.replace(/\/\* tjs <- [^*]*\*\/\n?/, '')
    const js = compile(stripped).code
    expect(
      js.includes('Eq('),
      'without the marker `==` compiles to Eq — same source, different meaning. This is ' +
        'the seam: the conversion must rewrite comparisons rather than leave them to ' +
        'change meaning based on a header comment.'
    ).toBe(true)
  })
  it('GAP: conversion emits no warning about semantics that will change', () => {
    const r = fromTS(FOOTGUNS, { emitTJS: true })
    expect(
      (r.warnings ?? []).length,
      'if this is non-zero the converter now warns — update this test and the TODO'
    ).toBe(0)
  })
})

describe('the migration ladder is now PER-CONSTRUCT, not per-mode', () => {
  const src = (d) =>
    `${d}\nfunction f(a: 0, b: 0) { if (a == b) return 1\n return 0 }`
  const usesTjsEquality = (d) => compile(src(d)).code.includes('Eq(')
  it('native TJS has the rules on, with no directive needed', () => {
    expect(usesTjsEquality('')).toBe(true)
  })
  it('TjsCompat still means JS-compatible — that one is DIALECT, not a mode', () => {
    expect(usesTjsEquality('TjsCompat')).toBe(false)
  })
  it('you can no longer opt a single rule back in — the directive is gone', () => {
    expect(() => compile(src('TjsCompat\nTjsEquals'))).toThrow(
      /`TjsEquals` is no longer a mode/
    )
  })
  it('the per-site escape is what replaced it', () => {
    expect(() =>
      compile(`function f(a: 0, b: '') { return DangerousLegacyEquals(a, b) }`)
    ).not.toThrow()
  })
})

describe('bigint is checked as bigint', () => {
  const compile = (src, name) => {
    const out = tjs(src, { runTests: false })
    const prev = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      return new Function(out.code + `\nreturn ${name}`)()
    } finally {
      globalThis.__tjs = prev
    }
  }

  const spellings = [
    ['named type', `function g(n: bigint) { return n }`],
    ['example value', `function g(n: 0n) { return n }`],
    ['named, with return type', `function g(n: bigint): bigint { return n }`],
    ['example, with return type', `function g(n: 0n): 0n { return n }`],
  ]
  for (const [label, src] of spellings) {
    it(`accepts a bigint and rejects a number (${label})`, () => {
      const g = compile(src, 'g')
      expect(g(10n)).toBe(10n)
      expect(isMonadicError(g(10))).toBe(true)
      expect(isMonadicError(g('10'))).toBe(true)
    })
  }
  it('a bigint example round-trips through fromTS back into tjs()', () => {
    const converted = fromTS(
      `export function g(x: bigint): bigint { return x }`,
      { emitTJS: true }
    ).code
    expect(converted).toContain('0n')
    expect(() => tjs(converted, { runTests: false })).not.toThrow()
  })
  it('`tjs types` can serialise a bigint example', () => {
    expect(() => tjs(`function g(x: 0n): 0n { return x }`)).not.toThrow()
  })
})

describe('optional params annotated with a type name', () => {
  const compile = (src, name) => {
    const out = tjs(src, { runTests: false })
    const prev = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      return {
        fn: new Function(out.code + `\nreturn ${name}`)(),
        code: out.code,
      }
    } finally {
      globalThis.__tjs = prev
    }
  }
  for (const type of [
    'number',
    'int',
    'unsigned',
    'float',
    'string',
    'boolean',
  ]) {
    it(`g(n?: ${type}) is callable with no argument`, () => {
      const { fn, code } = compile(`function g(n?: ${type}) { return n }`, 'g')

      expect(code).not.toMatch(new RegExp(`function g\\\\(n = ${type}\\\\)`))

      expect(() => fn()).not.toThrow()
      expect(fn()).toBeUndefined()
    })
  }
  it('still CHECKS the type when an argument is supplied', () => {
    const { fn } = compile(`function g(n?: number) { return n }`, 'g')
    expect(fn(5)).toBe(5)
    expect(isMonadicError(fn('nope'))).toBe(true)
  })
  it('keeps an EXAMPLE default, which is a real value', () => {
    const { fn, code } = compile(`function g(n?: 0) { return n }`, 'g')
    expect(code).toMatch(/function g\(n = 0\)/)
    expect(fn()).toBe(0)
  })
  it('an unresolved user type degrades to any, and says so', () => {
    const result = tjs(`function g(n?: MyThing) { return n }`, {
      runTests: false,
    })
    expect(result.warnings?.join('\n')).toMatch(/could not be resolved/)
    const prev = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      const fn = new Function(result.code + '\nreturn g')()
      expect(() => fn()).not.toThrow()
    } finally {
      globalThis.__tjs = prev
    }
  })
})
