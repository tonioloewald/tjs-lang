/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

/* line 26 */
function build(src, names) {
  const { code } = tjs(src, { filename: 'arrow.tjs', runTests: false })
  return new Function(`${code}\nreturn { ${names.join(', ')} }`)()
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
  returns: {
    type: {
      kind: 'object',
      shape: {},
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:26',
}

/* line 31 */
function isErr(v) {
  return String(v).startsWith('MonadicError')
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
  source: 'input.ts:31',
}

describe('arrow and function-expression params are validated', () => {
  it('an arrow rejects a bad argument, like a declaration does', () => {
    const m = build(
      `function decl(n: 0) { return n }\nconst arrow = (n: 0) => n`,
      ['decl', 'arrow']
    )

    expect(isErr(m.decl('x'))).toBe(true)
    expect(isErr(m.arrow('x'))).toBe(true)
    expect(m.arrow(3)).toBe(3)
  })
  it('a block-bodied arrow is validated too', () => {
    const m = build(`const f = (n: 0) => { return n * 2 }`, ['f'])
    expect(isErr(f_call(m, 'x'))).toBe(true)
    expect(m.f(3)).toBe(6)
  })
  it('`const f = function (…)` is validated', () => {
    const m = build(`const f = function (n: 0) { return n }`, ['f'])
    expect(isErr(m.f('x'))).toBe(true)
    expect(m.f(3)).toBe(3)
  })
  it('multiple params, and a good call still passes through', () => {
    const m = build(`const add = (a: 0, b: 0) => a + b`, ['add'])
    expect(m.add(2, 3)).toBe(5)
    expect(isErr(m.add(2, 'x'))).toBe(true)
    expect(isErr(m.add('x', 3))).toBe(true)
  })
  it('an UNANNOTATED arrow is untouched', () => {
    const m = build(`const f = (n) => n`, ['f'])
    expect(m.f('x')).toBe('x')
    expect(m.f(3)).toBe(3)
  })
  it('an exported arrow is validated', () => {
    const { code } = tjs(`export const f = (n: 0) => n`, {
      filename: 'arrow.tjs',
      runTests: false,
    })

    const f = new Function(`${code.replace(/^export /gm, '')}\nreturn f`)()
    expect(isErr(f('x'))).toBe(true)
    expect(f(3)).toBe(3)
  })
  it('carries `__tjs` metadata, like a declaration', () => {
    const m = build(`const f = (n: 0) => n`, ['f'])
    expect(m.f.__tjs?.params?.n).toBeTruthy()
  })
})

/* line 94 */
function f_call(m, arg) {
  return m.f(arg)
}
f_call.__tjs = {
  params: {
    m: {
      type: {
        kind: 'object',
        shape: {},
      },
      required: true,
      default: null,
    },
    arg: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:94',
}

describe('arrows and declarations agree about required parameters', () => {
  const load = (src, name) =>
    new Function(
      `${tjs(src, { filename: 'p.tjs', runTests: false }).code}\nreturn ${name}`
    )()
  const FORMS = [
    ['declaration', 'function subject(n: 0) { return n * 2 }'],
    ['arrow', 'const subject = (n: 0) => n * 2'],
    ['arrow with block body', 'const subject = (n: 0) => { return n * 2 }'],
    ['function expression', 'const subject = function (n: 0) { return n * 2 }'],
    ['async arrow', 'const subject = async (n: 0) => n * 2'],
  ]
  for (const [label, src] of FORMS) {
    it(`${label}: a missing required argument is an error`, async () => {
      const fn = load(src, 'subject')
      expect(String(await fn())).toContain('Expected integer')
    })
    it(`${label}: a wrong-typed argument is an error`, async () => {
      const fn = load(src, 'subject')
      expect(String(await fn('x'))).toContain('Expected integer')
    })
    it(`${label}: a valid argument passes through`, async () => {
      expect(await load(src, 'subject')(3)).toBe(6)
    })
  }
  it('`=` still means optional, in an arrow too', () => {
    expect(load('const f = (n = 5) => n * 2', 'f')()).toBe(10)
  })
})

describe('an arrow return annotation is not thrown away', () => {
  const load = (src, name) =>
    new Function(
      `${tjs(src, { filename: 'p.tjs', runTests: false }).code}\nreturn ${name}`
    )()
  it('produces `returns` metadata', () => {
    const h = load('const h = (n: 0): 0 => n * 2', 'h')
    expect(h.__tjs?.returns?.type?.kind).toBe('integer')
  })
  it('`:?` validates the return value', () => {
    const bad = load("const bad = (n: 0):? 0 => 'not a number'", 'bad')
    expect(String(bad(1))).toContain('Expected integer')
  })
  it('`:?` lets a correct return through', () => {
    expect(load('const good = (n: 0):? 0 => n * 2', 'good')(2)).toBe(4)
  })
  it('survives a parameter default containing a paren', () => {
    const f = load('const f = (n = Math.max(1, 2)): 0 => n', 'f')
    expect(f.__tjs?.returns?.type?.kind).toBe('integer')
  })
})

describe('a parenthesised concise arrow body emits parseable JS', () => {
  const load = (src, name) => {
    const { code } = tjs(src, { filename: 'p.tjs', runTests: false })

    try {
      new Function(code)
    } catch (e) {
      throw new Error(`emitted JS does not parse: ${e.message}\n---\n${code}`, {
        cause: e,
      })
    }
    return new Function(`${code}\nreturn ${name}`)()
  }
  it('returns an object literal', () => {
    expect(
      load('const point = (x: 0, y: 0) => ({ x, y })', 'point')(1, 2)
    ).toEqual({
      x: 1,
      y: 2,
    })
  })
  it('works with NO annotations — this is plain JavaScript', () => {
    expect(load('const plain = (a, b) => ({ a, b })', 'plain')(1, 2)).toEqual({
      a: 1,
      b: 2,
    })
  })
  it('handles a parenthesised NON-object expression', () => {
    expect(load('const inc = (n: 0) => (n + 1)', 'inc')(4)).toBe(5)
  })
  it('handles an async parenthesised body', async () => {
    const a = load('const a = async (n: 0) => ({ n })', 'a')
    expect(await a(5)).toEqual({ n: 5 })
  })
  it('handles an exported one', () => {
    const { code } = tjs('export const mk = (n: 0) => ({ n })', {
      filename: 'p.tjs',
      runTests: false,
    })
    expect(() => new Function(code.replace(/^export /gm, ''))).not.toThrow()
  })
  it('still VALIDATES — growing a body must not lose the checks', () => {
    const point = load('const point = (x: 0, y: 0) => ({ x, y })', 'point')
    expect(String(point('a', 2))).toContain('Expected integer')
  })
  it('the unparenthesised forms still work', () => {
    expect(load('const dbl = (n: 0) => n * 2', 'dbl')(3)).toBe(6)
    expect(load('const box = (n: 0) => [n]', 'box')(3)).toEqual([3])
  })
})

describe('signature anchoring', () => {
  const returnsOf = (src, name) =>
    tjs(src, { filename: 'a.tjs', runTests: false }).metadata?.[name]?.returns
      ?.kind ?? null
  it('a same-named binding in another scope does not steal the anchor', () => {
    expect(
      returnsOf(
        `function outer() { const helper = (a) => a; return helper }\nexport function helper(x: 0): 0 { return x }`,
        'helper'
      )
    ).toBe('integer')
  })
  it('a non-first declarator is still found', () => {
    expect(returnsOf(`export const a = 1, mk = (x: 0): 0 => x`, 'mk')).toBe(
      'integer'
    )
  })
  it('a function with genuinely no annotation still reports none', () => {
    expect(returnsOf(`export function bare(x: 0) { return x }`, 'bare')).toBe(
      null
    )
  })
})

describe('return validation and hoisting', () => {
  const run = (src, expr) => {
    const saved = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      return new Function(
        `${
          tjs(src, { filename: 'h.tjs', runTests: false }).code
        }\nreturn ${expr}`
      )()
    } finally {
      globalThis.__tjs = saved
    }
  }
  it('a call ABOVE the declaration is validated', () => {
    const out = run(
      `const early = bad()\nfunction bad():? 0 { return 'BAD' }`,
      'early'
    )
    expect(String(out)).toContain('MonadicError')
  })
  it('a call below it still is (control)', () => {
    const out = run(
      `function bad():? 0 { return 'BAD' }\nconst late = bad()`,
      'late'
    )
    expect(String(out)).toContain('MonadicError')
  })
  it('a VALID return still passes through', () => {
    expect(run(`function good():? 0 { return 5 }\nconst r = good()`, 'r')).toBe(
      5
    )
  })
  it('a `let` arrow LOADS — the wrapper must not hoist above it', () => {
    expect(run(`let f = (x: 0):? 0 => x * 1.5\nconst r = f(2)`, 'r')).toBe(3)
  })
  it('a `let` function expression loads too', () => {
    expect(
      run(`let k = function (x: 0):? 0 { return x * 1.5 }\nconst r = k(2)`, 'r')
    ).toBe(3)
  })
  it('an arrow still validates — its wrapper cannot hoist', () => {
    const out = run(`const mk = (n: 0):? 0 => 'BAD'\nconst r = mk(1)`, 'r')
    expect(String(out)).toContain('MonadicError')
  })
})
