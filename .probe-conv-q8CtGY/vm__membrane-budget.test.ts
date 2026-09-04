/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

const VM = new AgentVM()

/* line 39 */
async function cross(payload, membraneMaxBytes) {
  const r = await VM.run(
    {
      op: 'seq',
      steps: [
        { op: 'httpFetch', url: 'https://example.test/x', result: 'd' },
        { op: 'return', value: { ok: 1 } },
      ],
    },
    {},
    {
      fuel: 1e7,
      capabilities: { fetch: async () => payload },
      ...(membraneMaxBytes === undefined ? {} : { membraneMaxBytes }),
    }
  )
  return r.error?.message ?? null
}
cross.__tjs = {
  params: {
    payload: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    membraneMaxBytes: {
      type: {
        kind: 'union',
        members: [
          {
            kind: 'number',
          },
          {
            kind: 'undefined',
          },
        ],
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:39',
}

/* line 59 */
function floats(n) {
  return new Array(n).fill(0.5)
}
floats.__tjs = {
  params: {
    n: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:59',
}

describe('the membrane is actually engaged (apparatus check)', () => {
  it('rejects an accessor — if this passes, every test below is vacuous', async () => {
    const payload = {
      ok: true,
      get status() {
        return 200
      },
    }
    expect(await cross(payload)).toMatch(/accessor/)
  })
})

describe('array elements are not billed for their index names', () => {
  it('accepts an array whose real size is well inside the budget', async () => {
    expect(await cross(floats(200_000))).toBe(null)
  })
  it('scales — a longer array is not penalised for longer indices', async () => {
    expect(await cross(floats(500_000))).toBe(null)
  })
  it('a RAG-shaped return of 300 embeddings crosses', async () => {
    const docs = Array.from({ length: 300 }, (_, i) => ({
      id: `doc-${i}`,
      v: floats(768),
    }))
    expect(await cross(docs)).toBe(null)
  })
  it('an array genuinely over budget is STILL rejected', async () => {
    expect(await cross(floats(1_000_000))).toMatch(/membrane budget/)
  })
  it('the values themselves are still budgeted, at a small cap', async () => {
    expect(await cross(floats(100_000), 256 * 1024)).toMatch(/membrane budget/)
  })
})

describe('non-index own properties keep their name charge', () => {
  it('a long property name on an array is billed', async () => {
    const arr = [1, 2, 3]
    arr['n'.repeat(40_000)] = 1
    expect(await cross(arr, 64 * 1024)).toMatch(/membrane budget/)
  })
  it('a non-index accessor on an array is still rejected', async () => {
    const arr = [1, 2, 3]
    Object.defineProperty(arr, 'meta', {
      enumerable: true,
      get() {
        return 'host code ran'
      },
    })
    expect(await cross(arr)).toMatch(/accessor/)
  })
  it('a value nested under an array index is still walked', async () => {
    const arr = [{ deep: { fn: () => 1 } }]
    expect(await cross(arr)).toMatch(/function/)
  })
})

describe('object property names are unchanged', () => {
  it('a plain object with huge keys is still billed for them', async () => {
    const obj = {}
    for (let i = 0; i < 40; i++) obj['k'.repeat(2000) + i] = 1

    expect(await cross(obj, 64 * 1024)).toMatch(/membrane budget/)
  })
  it('an object with numeric-LOOKING string keys is billed for them', async () => {
    const obj = {}
    for (let i = 0; i < 8000; i++) obj[String(i).padStart(20, '0')] = 1

    expect(await cross(obj, 128 * 1024)).toMatch(/membrane budget/)
  })
})

describe('an oversized array is refused without being enumerated', () => {
  const budget = 1024
  for (const n of [100_000, 1_000_000, 2_000_000]) {
    it(`${n} elements is refused promptly`, async () => {
      const t0 = performance.now()
      expect(await cross(floats(n), budget)).toMatch(/membrane budget/)
      const ms = performance.now() - t0

      expect(ms < 150 ? 'prompt' : `took ${ms.toFixed(0)}ms`).toBe('prompt')
    })
  }
  it('a hugely sparse array is REFUSED, and refused promptly', async () => {
    const sparse = []
    sparse.length = 1_000_000_000
    sparse[0] = 1
    sparse[500_000_000] = 2
    sparse[999_999_999] = 3
    const t0 = performance.now()
    expect(await cross(sparse)).toMatch(/membrane budget/)
    const ms = performance.now() - t0

    expect(ms < 5000 ? 'prompt' : `took ${ms.toFixed(0)}ms`).toBe('prompt')
  })
  it('an ordinary sparse array still crosses', async () => {
    const sparse = []
    sparse.length = 10_000
    sparse[0] = 1
    sparse[9_999] = 2
    expect(await cross(sparse)).toBe(null)
  })
  it('an accessor past the dense prefix is still caught', async () => {
    const arr = new Array(100).fill(1)
    Object.defineProperty(arr, 100, {
      enumerable: true,
      get() {
        return 'host code ran'
      },
    })
    expect(await cross(arr)).toMatch(/accessor/)
  })
})
