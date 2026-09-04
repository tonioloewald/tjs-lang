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
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Eq }
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

import { evaluateExpr } from '/Users/tonioloewald/tjs-lang/src/vm/runtime'

/* line 12 */
function lit(value) {
  return { $expr: 'literal', value }
}
lit.__tjs = {
  params: {
    value: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:12',
}

/* line 13 */
/* TODO: TS types degraded — op: '==' | '!=' */
function evalEq(op, a, b) {
  return evaluateExpr(
    { $expr: 'binary', op, left: lit(a), right: lit(b) },
    { state: {}, args: {} }
  )
}
evalEq.__tjs = {
  params: {
    op: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    a: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    b: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:16',
}

describe('AJS == / != — footgun-free, NOT structural (consistent with TJS)', () => {
  it('distinct arrays/objects are NOT equal (the divergence fix)', () => {
    expect(evalEq('==', [1, 2], [1, 2])).toBe(false)
    expect(evalEq('==', { a: 1 }, { a: 1 })).toBe(false)
    expect(evalEq('!=', [1, 2], [1, 2])).toBe(true)
  })
  it('identity still holds for the same reference', () => {
    const shared = { a: 1 }
    expect(evalEq('==', shared, shared)).toBe(true)
    const arr = [1, 2]
    expect(evalEq('==', arr, arr)).toBe(true)
  })
  it('no type coercion', () => {
    expect(evalEq('==', '5', 5)).toBe(false)
    expect(evalEq('==', '', false)).toBe(false)
    expect(evalEq('==', 0, false)).toBe(false)
  })
  it('unwraps boxed primitives', () => {
    expect(evalEq('==', new Boolean(false), false)).toBe(true)
    expect(evalEq('==', new Number(5), 5)).toBe(true)
  })
  it('null/undefined equal; NaN equal to itself', () => {
    expect(evalEq('==', null, undefined)).toBe(true)
    expect(evalEq('==', NaN, NaN)).toBe(true)
    expect(evalEq('==', null, 0)).toBe(false)
  })
  it('scalars compare as expected', () => {
    expect(evalEq('==', 1, 1)).toBe(true)
    expect(evalEq('==', 'x', 'x')).toBe(true)
    expect(evalEq('!=', 1, 2)).toBe(true)
  })
  it('=== / !== remain strict identity (unchanged)', () => {
    expect(evalEq('===', [1], [1])).toBe(false)
    expect(evalEq('===', 5, 5)).toBe(true)
  })
})

describe('VM equality is not fooled by hostile values', () => {
  const VM = new AgentVM()
  const lit = (value) => ({ $expr: 'literal', value })
  /** `a == b` as the VM evaluates it. */
  async function vmEq(a, b) {
    const r = await VM.run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'a', value: a },
          { op: 'varSet', key: 'b', value: b },
          {
            op: 'return',
            value: {
              eq: {
                $expr: 'binary',
                op: '==',
                left: { $expr: 'ident', name: 'a' },
                right: { $expr: 'ident', name: 'b' },
              },
            },
          },
        ],
      },
      {},
      { fuel: 1e6 }
    )
    return { eq: r.result?.eq, error: r.error?.message }
  }
  it('does not run an overridden valueOf', async () => {
    class Liar extends Number {
      valueOf() {
        return 999
      }
    }

    const { eq, error } = await vmEq(new Liar(1), 999)
    expect(error ?? 'ok').toBe('ok')
    expect(eq).toBe(false)
  })
  it('reads the slot, so a boxed primitive still compares equal', async () => {
    const { eq } = await vmEq(new Number(7), 7)
    expect(eq).toBe(true)
  })
  it('a lying Proxy does not escape as a thrown exception', async () => {
    const p = new Proxy({}, { getPrototypeOf: () => Boolean.prototype })
    const { eq, error } = await vmEq(p, true)
    expect(error ?? 'ok').toBe('ok')
    expect(eq).toBe(false)
  })
  it('a Symbol.hasInstance trap does not either', async () => {
    const p = new Proxy(
      {},
      {
        get: (_t, k) => (k === Symbol.hasInstance ? () => true : undefined),
      }
    )
    const { error } = await vmEq(p, 1)
    expect(error ?? 'ok').toBe('ok')
  })
  it('no coercion — the VM `==` is footgun-free `===`', async () => {
    expect((await vmEq('5', 5)).eq).toBe(false)
    expect((await vmEq('', false)).eq).toBe(false)
    expect((await vmEq(null, undefined)).eq).toBe(true)
    void lit
  })
})
