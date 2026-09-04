/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { Type as RealType } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

const CASES = [
  { name: 'Int', example: '1', values: [2, 1.5, -1, '2', true] },

  {
    name: 'Count',
    example: '+0',
    values: [2, 0, -1, 1.5, '2'],
    sourceNarrowing: true,
  },
  { name: 'Frac', example: '1.5', values: [2, 1.5, '1.5'] },
  { name: 'Name', example: "''", values: ['a', 1, null] },
  {
    name: 'Pt',
    example: '{ x: 1, y: 1 }',
    values: [{ x: 1, y: 1 }, { x: 1.5, y: 1 }, { x: 1 }, { x: 1, y: 1, z: 9 }],
  },
  { name: 'Nums', example: '[1]', values: [[1, 2], [1.5], [], ['a']] },
  { name: 'Flag', example: 'true', values: [true, false, 1, 'true'] },

  {
    name: 'Even',
    example: '2',
    predicate:
      "(v) => typeof v === 'number' && Number.isInteger(v) && v % 2 === 0",
    values: [4, 3, 2.5, -2, '2', true, null],
  },
  {
    name: 'Short',
    example: "'ab'",
    predicate: "(v) => typeof v === 'string' && v.length <= 3",
    values: ['a', 'abcd', '', 3, null],
  },
]

const KNOWN_DISAGREEMENTS = new Set([])

/* line 146 */
function inlineType(name, example, predicate) {
  const body = predicate
    ? `Type ${name} {\n  example: ${example}\n  predicate(v) { return (${predicate})(v) }\n}`
    : `Type ${name} { example: ${example} }`
  const { code } = tjs(`${body}\nfunction f(v: ${name}) { return 'ok' }`, {
    filename: 'type-identity.tjs',
  })
  return new Function(`${code}\nreturn ${name}`)()
}
inlineType.__tjs = {
  params: {
    name: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    example: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    predicate: {
      type: {
        kind: 'union',
        members: [
          {
            kind: 'string',
          },
          {
            kind: 'undefined',
          },
        ],
      },
      required: false,
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
  source: 'input.ts:146',
}

describe('type identity: every mechanism answers the same question', () => {
  it('the predicate cases actually exercise the predicate', () => {
    const withPredicate = CASES.filter((c) => c.predicate)
    expect(withPredicate.length).toBeGreaterThan(0)
    const even = inlineType(
      'Even',
      '2',
      "(v) => typeof v === 'number' && Number.isInteger(v) && v % 2 === 0"
    )
    expect(even.check(4)).toBe(true)
    expect(even.check(3)).toBe(false)
    const realEven = RealType(
      'Even',
      (v) => typeof v === 'number' && Number.isInteger(v) && v % 2 === 0,
      2
    )
    expect(realEven.check(4)).toBe(true)
    expect(realEven.check(3)).toBe(false)
  })
  it('the corpus is worth running', () => {
    expect(CASES.length).toBeGreaterThan(4)
    expect(CASES.flatMap((c) => c.values).length).toBeGreaterThan(15)
  })
  const found = new Set()
  for (const c of CASES) {
    it(`inline stub and real runtime agree on ${c.name}`, () => {
      const inline = inlineType(c.name, c.example, c.predicate)
      const real = RealType(
        c.name,
        c.predicate ? new Function(`return (${c.predicate})`)() : undefined,
        new Function(`return (${c.example})`)()
      )
      for (const v of c.values) {
        const key = `${c.name} ${JSON.stringify(v)}`
        const agree = (inline.check(v) === true) === (real.check(v) === true)
        if (!agree) found.add(key)

        if (c.sourceNarrowing) continue

        expect(agree || KNOWN_DISAGREEMENTS.has(key) ? 'ok' : key).toBe('ok')
      }
    })
  }
  it('every known disagreement still happens (none rot into the list)', () => {
    const fixed = [...KNOWN_DISAGREEMENTS].filter((k) => !found.has(k))
    expect(
      fixed.length
        ? `fixed — delete from KNOWN_DISAGREEMENTS in this file: ${fixed.join(
            ', '
          )}`
        : 'ok'
    ).toBe('ok')
  })
  it('the stub is never STRICTER than the real runtime', () => {
    for (const c of CASES) {
      if (c.sourceNarrowing) continue
      const inline = inlineType(c.name, c.example, c.predicate)
      const real = RealType(
        c.name,
        c.predicate ? new Function(`return (${c.predicate})`)() : undefined,
        new Function(`return (${c.example})`)()
      )
      for (const v of c.values) {
        if (real.check(v) === true) {
          expect(
            `${c.name} ${JSON.stringify(v)}: ${inline.check(v) === true}`
          ).toBe(`${c.name} ${JSON.stringify(v)}: true`)
        }
      }
    }
  })
})

describe('type identity: one name, two implementations', () => {
  it('`checkType` from tjs-lang/lang is the runtime one, and the other is unreachable', async () => {
    const [pkg, runtime, inference] = await Promise.all([
      import('/Users/tonioloewald/tjs-lang/src/lang/index'),
      import('/Users/tonioloewald/tjs-lang/src/lang/runtime'),
      import('/Users/tonioloewald/tjs-lang/src/lang/inference'),
    ])
    expect(pkg.checkType).toBe(runtime.checkType)
    expect(pkg.checkType).not.toBe(inference.checkType)
  })
})

describe('Type blocks preserve source-level numeric narrowing', () => {
  const check = (src, v) => {
    const { code } = tjs(`${src}\nfunction f(x: N) { return 'ok' }`, {
      filename: 'n.tjs',
    })
    return new Function(`${code}\nreturn N`)().check(v) === true
  }
  it('`example: +0` rejects a negative, like `n: +0` does', () => {
    expect(check('Type N { example: +0 }', -1)).toBe(false)
    expect(check('Type N { example: +0 }', 2)).toBe(true)
    expect(check('Type N { example: +0 }', 0)).toBe(true)
  })
  it('`example: +0` still rejects a float and a non-number', () => {
    expect(check('Type N { example: +0 }', 1.5)).toBe(false)
    expect(check('Type N { example: +0 }', '2')).toBe(false)
  })
  it('a plain integer example is unaffected — it accepts negatives', () => {
    expect(check('Type N { example: 1 }', -1)).toBe(true)
    expect(check('Type N { example: 1 }', 1.5)).toBe(false)
  })
  it('a user predicate still governs', () => {
    expect(
      check('Type N { example: +0\n  predicate(x) { return x > 10 } }', 5)
    ).toBe(false)
    expect(
      check('Type N { example: +0\n  predicate(x) { return x > 10 } }', 20)
    ).toBe(true)
  })
})

describe('array type errors are accurate in both runtimes', () => {
  const emit = (src, name) =>
    tjs(src, { filename: 'ae.tjs', runTests: false }).code + `\nreturn ${name}`
  const SRC = 'function sum(xs: [0]): 0 { return xs.length }'
  const withRuntime = (body) => new Function(body)()
  const standalone = (body) => {
    const saved = globalThis.__tjs
    delete globalThis.__tjs
    try {
      return new Function(body)()
    } finally {
      globalThis.__tjs = saved
    }
  }
  it('names the ELEMENT type, not just "array"', () => {
    const msg = String(withRuntime(emit(SRC, 'sum'))(['a', 'b']))
    expect(msg).toContain('array of integer')
  })
  for (const [label, run] of [
    ['shared runtime', withRuntime],
    ['standalone (inline stub)', standalone],
  ]) {
    it(`${label}: a wrong ELEMENT reports "got array", not "got object"`, () => {
      const msg = String(run(emit(SRC, 'sum'))(['a', 'b']))
      expect(msg).toContain('got array')
      expect(msg).not.toContain('got object')
    })
    it(`${label}: a NON-array still reports what it really got`, () => {
      expect(String(run(emit(SRC, 'sum'))(42))).toContain('got number')
    })
  }
  it('nests', () => {
    const msg = String(
      withRuntime(emit("function g(m: [['']]): 0 { return 0 }", 'g'))([[1]])
    )
    expect(msg).toContain('array of array of string')
  })
})
