/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

const VM = new AgentVM()

/* line 30 */
async function fuelFor(steps, args) {
  const res = await VM.run(
    { op: 'seq', steps: [...steps, { op: 'return', value: {} }] },
    args,
    {
      fuel: 50_000_000,
    }
  )
  if (res.error) throw new Error(`unexpected VM error: ${res.error.message}`)
  return res.fuelUsed
}
fuelFor.__tjs = {
  params: {
    steps: {
      type: {
        kind: 'array',
        items: {
          kind: 'null',
        },
      },
      required: true,
      default: null,
    },
    args: {
      type: {
        kind: 'object',
        shape: {},
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'number',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:30',
}

/* line 45 */
function arr(n) {
  return Array.from({ length: n }, (_, i) => 'x' + i)
}
arr.__tjs = {
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
  source: 'input.ts:45',
}

/* line 46 */
function str(n) {
  return 'x'.repeat(n)
}
str.__tjs = {
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
  source: 'input.ts:46',
}

/* line 47 */
function obj(n) {
  return Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`k${i}`, `v${i}`])
  )
}
obj.__tjs = {
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
  source: 'input.ts:47',
}

const CASES = [
  {
    atom: 'varSet (heap walk over a structure)',
    build: (n) => ({
      steps: [{ op: 'varSet', key: 'v', value: { $kind: 'arg', path: 'd' } }],
      args: { d: arr(n).map((x) => ({ x })) },
    }),
  },
  {
    atom: 'constSet (heap walk over a structure)',
    build: (n) => ({
      steps: [{ op: 'constSet', key: 'v', value: { $kind: 'arg', path: 'd' } }],
      args: { d: arr(n).map((x) => ({ x })) },
    }),
  },

  {
    atom: 'hash',
    build: (n) => ({
      steps: [{ op: 'hash', value: { $kind: 'arg', path: 'd' }, result: 'h' }],
      args: { d: str(n) },
    }),
  },
  {
    atom: 'keys',
    build: (n) => ({
      steps: [{ op: 'keys', obj: { $kind: 'arg', path: 'd' }, result: 'k' }],
      args: { d: obj(n) },
    }),
  },
  {
    atom: 'merge',
    build: (n) => ({
      steps: [
        {
          op: 'merge',
          a: { $kind: 'arg', path: 'd' },
          b: { $kind: 'arg', path: 'd' },
          result: 'm',
        },
      ],
      args: { d: obj(n) },
    }),
  },
  {
    atom: 'pick',
    build: (n) => ({
      steps: [
        {
          op: 'pick',
          obj: { $kind: 'arg', path: 'd' },
          keys: { $kind: 'arg', path: 'ks' },
          result: 'p',
        },
      ],
      args: { d: obj(n), ks: Object.keys(obj(n)) },
    }),
  },
  {
    atom: 'omit',
    build: (n) => ({
      steps: [
        {
          op: 'omit',
          obj: { $kind: 'arg', path: 'd' },
          keys: { $kind: 'arg', path: 'ks' },
          result: 'o',
        },
      ],
      args: {
        d: obj(n),
        ks: Array.from({ length: Math.max(0, n - 1) }, (_, i) => `k${i}`),
      },
    }),
  },
  {
    atom: 'jsonStringify',
    build: (n) => ({
      steps: [
        {
          op: 'jsonStringify',
          value: { $kind: 'arg', path: 'd' },
          result: 's',
        },
      ],
      args: { d: arr(n) },
    }),
  },
  {
    atom: 'jsonParse',
    build: (n) => ({
      steps: [
        { op: 'jsonParse', str: { $kind: 'arg', path: 'd' }, result: 's' },
      ],
      args: { d: JSON.stringify(arr(n)) },
    }),
  },
  {
    atom: 'join',
    build: (n) => ({
      steps: [
        {
          op: 'join',
          list: { $kind: 'arg', path: 'd' },
          sep: ',',
          result: 's',
        },
      ],
      args: { d: arr(n) },
    }),
  },
  {
    atom: 'split',
    build: (n) => ({
      steps: [
        {
          op: 'split',
          str: { $kind: 'arg', path: 'd' },
          sep: ',',
          result: 's',
        },
      ],
      args: { d: arr(n).join(',') },
    }),
  },
  {
    atom: 'template',
    build: (n) => ({
      steps: [
        {
          op: 'template',
          tmpl: 'prefix {{v}} suffix',
          vars: { v: { $kind: 'arg', path: 'd' } },
          result: 's',
        },
      ],
      args: { d: str(n) },
    }),
  },
]

describe('cost invariant: fuel tracks operand size', () => {
  const SMALL = 1_000
  const BIG = 100_000
  for (const { atom, build } of CASES) {
    it(`${atom}: 100x the input costs ~100x the marginal fuel`, async () => {
      const base = build(1)
      const s = build(SMALL)
      const b = build(BIG)
      const fBase = await fuelFor(base.steps, base.args)
      const mSmall = (await fuelFor(s.steps, s.args)) - fBase
      const mBig = (await fuelFor(b.steps, b.args)) - fBase

      const detail =
        `${atom}: marginal fuel ${mSmall.toFixed(3)} at N=${SMALL}, ` +
        `${mBig.toFixed(3)} at N=${BIG} (fixed overhead ${fBase.toFixed(
          2
        )}). ` +
        `Work scales with operand size but fuel does not — a fuel bypass. ` +
        `Use chargeForSize() in the atom implementation.`
      expect(mBig, detail).toBeGreaterThan(0)
      expect(mBig / Math.max(mSmall, 1e-9), detail).toBeGreaterThan(10)
    }, 60_000)
  }
  it('a tiny fuel budget cannot buy a huge operation (the original bypass)', async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'jsonStringify',
            value: { $kind: 'arg', path: 'd' },
            result: 's',
          },
          { op: 'return', value: {} },
        ],
      },
      { d: Array.from({ length: 500_000 }, (_, i) => i) },
      { fuel: 10 }
    )
    expect(res.error?.message).toBe('Out of Fuel')
  }, 60_000)
})

describe('cost invariant: every atom is accounted for', () => {
  /**
   * Atoms whose work genuinely does not scale with operand size.
   *
   * Each needs a REASON. An unexplained entry is indistinguishable from an oversight,
   * which is the failure mode this whole file exists to prevent.
   */
  const SIZE_INSENSITIVE = {
    seq: 'dispatches nested steps; each is metered itself',
    scope: 'dispatches nested steps',
    if: 'evaluates one condition, dispatches one branch',
    while: 'per-iteration cost is charged by the body',
    repeat: 'per-iteration cost is charged by the body',
    tryCatch: 'dispatches nested steps',
    callLocal: 'the helper body is metered as it runs',
    return: 'hands back an existing reference; no traversal',
    throw: 'constructs one error',
    noop: 'does nothing',

    varSet: 'binds one name; the heap walk is charged by trackHeapWrite',
    constSet: 'binds one name; the heap walk is charged by trackHeapWrite',
    varsLet: 'binds names; charged by trackHeapWrite',
    varsImport: 'binds names; charged by trackHeapWrite',
    len: 'reads .length / key count without materialising anything',
    get: 'one property read',
    set: 'one property write',
    has: 'one lookup',
    first: 'one index read',
    last: 'one index read',

    add: 'scalar arithmetic',
    sub: 'scalar arithmetic',
    mul: 'scalar arithmetic',
    div: 'scalar arithmetic',
    mod: 'scalar arithmetic',
    eq: 'O(1) by design — see the note at the top of this file',
    neq: 'O(1) by design',
    gt: 'scalar comparison',
    gte: 'scalar comparison',
    lt: 'scalar comparison',
    lte: 'scalar comparison',
    not: 'one negation',
    and: 'short-circuit on scalars',
    or: 'short-circuit on scalars',

    httpFetch: 'capability-bound; return is size-checked by the membrane',
    storeGet: 'capability-bound; return size-checked by the membrane',
    storeSet: 'capability-bound',
    storeQuery: 'capability-bound',
    storeQueryWhere: 'capability-bound',
    storeVectorSearch: 'capability-bound',
    llmPredict: 'capability-bound',
    agentRun: 'the nested run has its own fuel budget',
    transpileCode: 'capability-bound',
    runCode: 'the nested run has its own fuel budget',
    xmlParse: 'capability-bound; return size-checked by the membrane',
    consoleLog: 'writes one line',
    consoleWarn: 'writes one line',
    consoleError: 'writes one line',
    random: 'one value',
    uuid: 'one value',

    map: 'per-element cost is charged by the body steps',
    filter: 'per-element cost is charged by the body steps',
    reduce: 'per-element cost is charged by the body steps',
    find: 'per-element cost is charged by the body steps; short-circuits',

    push: 'Array.prototype.push mutates in place — no traversal, no copy',

    regexMatch:
      'input and pattern are hard-capped; ReDoS shapes rejected outright',

    varsExport:
      'proportional to the literal key list in the step, not to any operand',

    Error: 'constructs one error object',
    try: 'dispatches nested steps',
    varGet: 'one scope lookup',
    cache:
      'one map lookup/insert; the cached VALUE is charged where it is produced',
    memoize: 'one map lookup; the memoized steps are metered when they run',
    storeProcedure: 'registers one entry',
    releaseProcedure: 'removes one entry',
    clearExpiredProcedures:
      'sweeps a registry the guest cannot grow without paying',
  }
  it('every registered atom either scales or is declared size-insensitive', () => {
    const demonstrated = new Set(CASES.map((c) => c.atom.replace(/ .*$/, '')))
    const unaccounted = Object.keys(new AgentVM().atoms ?? {})
      .filter((op) => !demonstrated.has(op) && !(op in SIZE_INSENSITIVE))
      .sort()
    expect(
      unaccounted,
      'each of these must EITHER get a CASES entry proving its fuel grows with operand ' +
        'size, OR a SIZE_INSENSITIVE entry saying why it does not — an atom that walks ' +
        'its operand for a flat cost is a fuel bypass, and fuel that does not track work ' +
        'is not a budget'
    ).toEqual([])
  })
})

describe('heap ceiling: peak live state is bounded', () => {
  const double = {
    $expr: 'binary',
    op: '+',
    left: { $expr: 'ident', name: 'x' },
    right: { $expr: 'ident', name: 'x' },
  }
  const doubling = (iters) => {
    const steps = [{ op: 'varSet', key: 'x', value: 'a'.repeat(1024) }]
    for (let i = 0; i < iters; i++)
      steps.push({ op: 'varSet', key: 'x', value: double })
    steps.push({ op: 'return', value: {} })
    return { op: 'seq', steps }
  }
  it('stops exponential growth even with effectively unlimited fuel', async () => {
    const res = await VM.run(doubling(26), {}, { fuel: 10_000_000 })
    expect(res.error?.message).toMatch(/Heap limit exceeded/)
  }, 60_000)
  it('respects an explicit maxHeapBytes', async () => {
    const res = await VM.run(
      doubling(20),
      {},
      {
        fuel: 10_000_000,
        maxHeapBytes: 1024 * 1024,
      }
    )
    expect(res.error?.message).toMatch(/Heap limit exceeded/)
  }, 60_000)
  it('overwriting a variable frees its budget (no false positive)', async () => {
    const steps = []
    for (let i = 0; i < 50; i++)
      steps.push({ op: 'varSet', key: 'buf', value: 'x'.repeat(200_000) })
    steps.push({ op: 'return', value: {} })
    const res = await VM.run({ op: 'seq', steps }, {}, { fuel: 10_000_000 })
    expect(res.error).toBeUndefined()
  }, 60_000)
  it('ordinary programs are unaffected', async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'a', value: 'hello' },
          { op: 'varSet', key: 'b', value: [1, 2, 3] },
          { op: 'return', value: {} },
        ],
      },
      {},
      { fuel: 1000 }
    )
    expect(res.error).toBeUndefined()
  })
})

describe('the §1 sweep, verified rather than assumed', () => {
  const withMethod = async (method, n, args = []) => {
    const ast = {
      op: 'seq',
      steps: [
        {
          op: 'varSet',
          key: 'a',
          value: Array.from({ length: n }, (_, i) => i),
        },
        {
          op: 'varSet',
          key: 'out',
          value: {
            $expr: 'methodCall',
            object: { $expr: 'ident', name: 'a' },
            method,
            arguments: args,
          },
        },
      ],
    }
    const r = await new AgentVM().run(ast, {}, { fuel: 50_000_000 })
    expect(r.error, `${method} should run cleanly`).toBeUndefined()
    return r.fuelUsed
  }
  for (const method of ['concat', 'slice', 'join', 'toReversed', 'toSorted']) {
    it(`${method} charges in proportion to size`, async () => {
      const small = await withMethod(method, 1_000)
      const large = await withMethod(method, 100_000)

      expect(
        large / small,
        `${method} appears to charge a flat cost`
      ).toBeGreaterThan(5)
    })
  }
})

describe('fuel exhaustion cannot be caught and resumed', () => {
  const loop = (limit) => ({
    op: 'seq',
    steps: [
      { op: 'varSet', key: 'i', value: 0 },
      {
        op: 'while',
        condition: {
          $expr: 'binary',
          op: '<',
          left: { $expr: 'ident', name: 'i' },
          right: limit,
        },
        body: [
          {
            op: 'try',
            try: [{ op: 'varSet', key: 'x', value: 'work' }],
            catch: [{ op: 'varSet', key: 'caught', value: true }],
          },
          {
            op: 'varSet',
            key: 'i',
            value: {
              $expr: 'binary',
              op: '+',
              left: { $expr: 'ident', name: 'i' },
              right: 1,
            },
          },
        ],
      },
    ],
  })
  it('a catch-everything loop still dies of fuel, near budget', async () => {
    const r = await new AgentVM().run(loop(1e9), {}, { fuel: 50 })
    expect(r.error?.message).toMatch(/Out of Fuel/)

    expect(r.fuelUsed).toBeLessThan(60)
  })
  it('POSITIVE CONTROL: the same loop really does iterate when fuel allows', async () => {
    const r = await new AgentVM().run(loop(20), {}, { fuel: 100_000 })
    expect(r.fuelUsed, 'the loop must actually execute').toBeGreaterThan(5)
  })
})

describe('re-walking what is already accounted', () => {
  const ident = (name) => ({ $expr: 'ident', name })
  const lit = (value) => ({ $expr: 'literal', value })
  async function reduceFuel(n) {
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'src', value: new Array(n).fill(1) },
          {
            op: 'reduce',
            items: ident('src'),
            initial: [],
            as: 'item',
            accumulator: 'acc',
            steps: [
              {
                op: 'push',
                list: ident('acc'),
                item: ident('item'),
                result: 'acc',
              },
            ],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      {},
      { fuel: 1e9, maxHeapBytes: 512 * 1024 * 1024 }
    )
    expect(r.error?.message ?? 'ok').toBe('ok')
    return r.fuelUsed
  }
  it('reduce with a growing accumulator costs LINEAR fuel', async () => {
    const a = await reduceFuel(1000)
    const b = await reduceFuel(4000)

    expect(
      b / a < 6 ? 'linear' : `${(b / a).toFixed(1)}x fuel for 4x items`
    ).toBe('linear')
  })
  it('callLocal does not re-walk an unchanged argument', async () => {
    const ast = {
      op: 'seq',
      helpers: {
        noop: { paramNames: ['xs'], steps: [{ op: 'return', value: lit(1) }] },
      },
      steps: [
        { op: 'varSet', key: 'big', value: new Array(20_000).fill(1) },
        { op: 'varSet', key: 'i', value: 0 },
        {
          op: 'while',
          condition: {
            $expr: 'binary',
            op: '<',
            left: ident('i'),
            right: lit(400),
          },
          body: [
            {
              op: 'callLocal',
              name: 'noop',
              args: [ident('big')],
              result: 'r',
            },
            {
              op: 'varSet',
              key: 'i',
              value: {
                $expr: 'binary',
                op: '+',
                left: ident('i'),
                right: lit(1),
              },
            },
          ],
        },
        { op: 'return', value: { ok: 1 } },
      ],
    }
    const r = await new AgentVM().run(
      ast,
      {},
      {
        fuel: 1e9,
        maxHeapBytes: 512 * 1024 * 1024,
      }
    )
    expect(r.error?.message ?? 'ok').toBe('ok')
    const used = r.fuelUsed

    expect(used < 1000 ? 'cheap' : `${used.toFixed(0)} fuel`).toBe('cheap')
  })
  it('a helper param that SHADOWS a caller variable is still accounted', async () => {
    const big = () =>
      new Array(300_000).fill('yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy')
    const r = await new AgentVM().run(
      {
        op: 'seq',
        helpers: {
          eat: {
            paramNames: ['big'],
            steps: [{ op: 'return', value: lit(1) }],
          },
        },
        steps: [
          { op: 'varSet', key: 'big', value: big() },
          { op: 'callLocal', name: 'eat', args: [lit(null)], result: 'r1' },
          { op: 'varSet', key: 'more', value: big() },
          { op: 'varSet', key: 'more2', value: big() },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      {},
      { fuel: 1e9, maxHeapBytes: 32 * 1024 * 1024 }
    )
    expect(r.error?.message ?? 'ACCEPTED — the bypass is open').toMatch(
      /Heap limit exceeded/
    )
  })
})

describe('the heap walk charges and enforces on every path', () => {
  const ident = (name) => ({ $expr: 'ident', name })
  const lit = (value) => ({ $expr: 'literal', value })
  /** Accumulate through `push` — the append fast path — on a budget too small for it. */
  const appendProgram = (iterations) => ({
    op: 'seq',
    steps: [
      { op: 'varSet', key: 'big', value: 'x'.repeat(50_000) },
      { op: 'varSet', key: 'list', value: [] },
      { op: 'varSet', key: 'i', value: 0 },
      {
        op: 'while',
        condition: {
          $expr: 'binary',
          op: '<',
          left: ident('i'),
          right: lit(iterations),
        },
        body: [
          {
            op: 'push',
            list: ident('list'),
            item: {
              $expr: 'binary',
              op: '+',
              left: ident('big'),
              right: ident('i'),
            },
            result: 'list',
          },
          {
            op: 'varSet',
            key: 'i',
            value: {
              $expr: 'binary',
              op: '+',
              left: ident('i'),
              right: lit(1),
            },
          },
        ],
      },
      { op: 'return', value: { ok: 1 } },
    ],
  })
  it('a run that exhausts its budget appending is stopped, and blames the append', async () => {
    const r = await new AgentVM().run(
      appendProgram(300),
      {},
      {
        fuel: 1000,

        maxHeapBytes: 512 * 1024 * 1024,
      }
    )
    expect(r.error).toBeDefined()
    expect(r.error.message).toBe('Out of Fuel')

    expect(r.error.op).toBe('push')
  })
  it('the budget is a ceiling, not a suggestion', async () => {
    for (const fuel of [50, 200, 1000]) {
      const r = await new AgentVM().run(
        appendProgram(300),
        {},
        {
          fuel,
          maxHeapBytes: 512 * 1024 * 1024,
        }
      )
      expect(r.error?.message).toBe('Out of Fuel')

      expect(r.fuelUsed).toBeLessThan(fuel * 1.1)
    }
  })
})
