/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

/* line 20 */
function inlineArrKinds() {
  const code = tjs(`function f(xs: [0]):! 0 { return xs.length }\n`).code
  expect(code).toContain('function __arrKinds')
  return new Function(code + '\nreturn __arrKinds')()
}
inlineArrKinds.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'any',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:20',
}

/* line 27 */
function runtimeDescribe(value) {
  const saved = globalThis.__tjs
  try {
    const rt = createRuntime()
    const err = rt.typeError('p', 'array of integer', value)
    return String(err.actual)
  } finally {
    globalThis.__tjs = saved
  }
}
runtimeDescribe.__tjs = {
  params: {
    value: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:27',
}

describe('array diagnostics: the two copies agree', () => {
  const CASES = [
    ['empty', []],
    ['homogeneous numbers', [1, 2, 3]],
    ['mixed', [1, 'a', null, {}]],
    ['five kinds stops at four', [1, 'a', null, {}, true]],
    ['nested arrays', [[1], [2]]],
    ['exactly at the cap', Array.from({ length: 64 }, () => 1)],
    ['one past the cap', Array.from({ length: 65 }, () => 1)],
    ['long and homogeneous', Array.from({ length: 5000 }, () => 'x')],

    ['four kinds, more behind', [1, 'a', true, null, {}, Symbol('x')]],
    ['exactly four kinds, nothing behind', [1, 'a', true, null]],
  ]
  const arrKinds = inlineArrKinds()
  it('the inline copy really came from the emitter (apparatus check)', () => {
    expect(arrKinds([1, 'a'])).toBe('array of number | string')
  })
  for (const [label, value] of CASES) {
    it(label, () => {
      expect(arrKinds(value)).toBe(runtimeDescribe(value))
    })
  }
  it('marks a sampled answer, so the message never overclaims', () => {
    expect(runtimeDescribe([1, 'a', true, null, {}, Symbol('x')])).toBe(
      'array of number | string | boolean | null …'
    )
    expect(runtimeDescribe([1, 'a', true, null])).toBe(
      'array of number | string | boolean | null'
    )
    expect(runtimeDescribe(Array.from({ length: 65 }, () => 1))).toBe(
      'array of number …'
    )
    expect(runtimeDescribe([1, 2, 3])).toBe('array of number')
  })
  it('a huge array costs the same as a small one', () => {
    const small = Array.from({ length: 64 }, () => 1)
    const huge = Array.from({ length: 2_000_000 }, () => 1)
    const time = (v) => {
      let best = Infinity
      for (let k = 0; k < 5; k++) {
        const t0 = performance.now()
        arrKinds(v)
        best = Math.min(best, performance.now() - t0)
      }
      return best
    }

    expect(time(huge)).toBeLessThan(Math.max(time(small), 0.01) * 50)
  })
})
