/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

const VM = new AgentVM()

const CHUNK = 2000

/* line 34 */
function chunk() {
  return Array.from({ length: CHUNK }, (_, i) => i)
}
chunk.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:34',
}

/* line 40 */
function shadowingProgram(n) {
  const steps = []
  for (let i = 0; i < n; i++) {
    steps.push({
      op: 'varSet',
      key: `v${i}`,
      value: { $kind: 'arg', path: 'big' },
    })

    steps.push({ op: 'map', items: [0], as: `v${i}`, steps: [] })
  }
  steps.push({ op: 'return', value: { ok: 1 } })
  return { op: 'seq', steps }
}
shadowingProgram.__tjs = {
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
  source: 'input.ts:40',
}

const SURVIVED = 'completed with ~128KB live under a 64KB cap'

describe('shadowing a name in a child scope does not free its budget', () => {
  it('the control trips: eight live values, no shadowing', async () => {
    const steps = []
    for (let i = 0; i < 8; i++) {
      steps.push({
        op: 'varSet',
        key: `v${i}`,
        value: { $kind: 'arg', path: 'big' },
      })
    }
    steps.push({ op: 'return', value: { ok: 1 } })
    const res = await VM.run(
      { op: 'seq', steps },
      { big: chunk() },
      {
        fuel: 1e6,
        maxHeapBytes: 64 * 1024,
      }
    )
    expect(res.error?.message ?? SURVIVED).toMatch(/Heap limit exceeded/)
  })
  it('trips the ceiling despite every value being shadowed once', async () => {
    const res = await VM.run(
      shadowingProgram(8),
      { big: chunk() },
      {
        fuel: 1e6,
        maxHeapBytes: 64 * 1024,
      }
    )
    expect(
      res.error?.message ?? SURVIVED,
      'child-scope shadowing bought budget back'
    ).toMatch(/Heap limit exceeded/)
  })
  it('still trips when the shadow is a callLocal parameter', async () => {
    const steps = []
    for (let i = 0; i < 8; i++) {
      steps.push({
        op: 'varSet',
        key: `v${i}`,
        value: { $kind: 'arg', path: 'big' },
      })
      steps.push({ op: 'callLocal', name: `h${i}`, args: [0] })
    }
    steps.push({ op: 'return', value: { ok: 1 } })
    const helpers = {}
    for (let i = 0; i < 8; i++) {
      helpers[`h${i}`] = { paramNames: [`v${i}`], steps: [] }
    }
    const res = await VM.run(
      { op: 'seq', helpers, steps },
      { big: chunk() },
      { fuel: 1e6, maxHeapBytes: 64 * 1024 }
    )
    expect(res.error?.message ?? SURVIVED).toMatch(/Heap limit exceeded/)
  })
})

describe('a discarded scope releases its accounting', () => {
  it('a long map over small items does not accumulate to a false positive', async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'map',
            items: Array.from({ length: 5000 }, (_, i) => i),
            as: 'item',
            steps: [],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      {},
      { fuel: 1e6, maxHeapBytes: 64 * 1024 }
    )
    expect(res.error?.message ?? 'ok').toBe('ok')
  })
  it('release does not become amnesia: a value the GUEST binds still trips', async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'map',
            items: [1, 2, 3],
            as: 'item',
            steps: [
              {
                op: 'varSet',
                key: 'held',
                value: { $kind: 'arg', path: 'big' },
              },
            ],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      { big: chunk() },
      { fuel: 1e6, maxHeapBytes: 8 * 1024 }
    )
    expect(res.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })
  /**
   * What `maxHeapBytes` is FOR, written down because an earlier version of this file got
   * it wrong and the wrong version looked more secure.
   *
   * It bounds what the GUEST causes to be retained during a run. A large array written as
   * a LITERAL in the AST is not that: the host parsed and materialised it before `run()`
   * was ever called, so by the time any ceiling could speak, the memory is already
   * allocated and the ceiling cannot un-allocate it. Charging the guest for it is a
   * category error — and charging it once per loop iteration, which is what the code did,
   * is that error multiplied by N.
   *
   * The size of an accepted program is the host's decision, made before the run.
   * `maxHeapBytes` governs what happens after.
   */
  it('does not charge the guest for a literal the HOST already materialised', async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'map',
            items: [chunk(), chunk(), chunk()],
            as: 'item',
            steps: [],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      {},
      { fuel: 1e6, maxHeapBytes: 8 * 1024 }
    )
    expect(res.error?.message ?? 'ok').toBe('ok')
  })
  it('but a guest-allocated array IS accounted, then iterating it is free', async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'data', value: { $kind: 'arg', path: 'big' } },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      { big: chunk() },
      { fuel: 1e6, maxHeapBytes: 8 * 1024 }
    )
    expect(res.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })
  it('surfaces the error instead of swallowing it inside the child scope', async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          { op: 'map', items: [1], as: 'i', steps: [{ op: 'noSuchAtom' }] },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      {},
      { fuel: 1e5 }
    )
    expect(res.error?.message ?? 'swallowed').toMatch(/Unknown Atom/)
  })
  it('surfaces a security-guard rejection from inside a child scope', async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'map',
            items: [1],
            as: 'i',
            steps: [{ op: 'varSet', key: '__proto__', value: 1 }],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      {},
      { fuel: 1e5 }
    )
    expect(res.error?.message ?? 'swallowed').toMatch(/forbidden/)
  })
})

describe('iteration bindings alias, accumulators do not', () => {
  const wide = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: i, keep: i % 2 === 0 }))
  const deep = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: i,
      keep: i % 2 === 0,
      meta: { tags: ['a', 'b'], nested: { x: i, y: [1, 2, 3] } },
    }))
  const filterFuel = async (items) => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'filter',
            items,
            as: 'r',
            condition: {
              $expr: 'member',
              object: { $expr: 'ident', name: 'r' },
              property: 'keep',
            },
          },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      {},
      { fuel: 1e7 }
    )
    expect(res.error?.message ?? 'ok').toBe('ok')
    return res.fuelUsed ?? 0
  }
  it('costs the same for shallow and deep items', async () => {
    const [shallow, nested] = [
      await filterFuel(wide(2000)),
      await filterFuel(deep(2000)),
    ]
    expect(`${shallow.toFixed(1)} / ${nested.toFixed(1)}`).toBe(
      `${shallow.toFixed(1)} / ${shallow.toFixed(1)}`
    )
  })
  it('a value built INSIDE the loop is still accounted', async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'map',
            items: [1, 2, 3],
            as: 'i',
            steps: [
              {
                op: 'varSet',
                key: 'blob',
                value: { $kind: 'arg', path: 'big' },
              },
            ],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      { big: chunk() },
      { fuel: 1e6, maxHeapBytes: 8 * 1024 }
    )
    expect(res.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })
  it("reduce's ACCUMULATOR is still accounted", async () => {
    const res = await VM.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'reduce',
            items: [1, 2, 3, 4],
            as: 'i',
            accumulator: 'acc',
            initial: [],
            steps: [
              {
                op: 'varSet',
                key: 'result',
                value: { $kind: 'arg', path: 'big' },
              },
            ],
          },
          { op: 'return', value: { ok: 1 } },
        ],
      },
      { big: chunk() },
      { fuel: 1e6, maxHeapBytes: 8 * 1024 }
    )
    expect(res.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
  })
})

describe('the heap ledger sees in-place mutation', () => {
  const ident = (name) => ({ $expr: 'ident', name })
  const lit = (value) => ({ $expr: 'literal', value })
  /** Accumulate `n` freshly-allocated ~140KB strings into one array via `push`. */
  const accumulate = (n) => ({
    op: 'seq',
    steps: [
      { op: 'varSet', key: 'big', value: 'x'.repeat(140_000) },
      { op: 'varSet', key: 'list', value: [] },
      { op: 'varSet', key: 'i', value: 0 },
      {
        op: 'while',
        condition: {
          $expr: 'binary',
          op: '<',
          left: ident('i'),
          right: lit(n),
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
  it('a push-accumulate loop is stopped by maxHeapBytes', async () => {
    const r = await new AgentVM().run(
      accumulate(400),
      {},
      {
        fuel: 1e8,
      }
    )
    expect(
      r.error?.message ?? 'ACCEPTED — the ledger did not see the growth'
    ).toMatch(/Heap limit exceeded/)
  })
  it('a small accumulate loop still runs (control)', async () => {
    const r = await new AgentVM().run(
      accumulate(5),
      {},
      {
        fuel: 1e8,
      }
    )
    expect(r.error?.message ?? 'ok').toBe('ok')
  })
  it('rebinding an UNCHANGED array stays cheap', async () => {
    const ast = {
      op: 'seq',
      steps: [
        { op: 'varSet', key: 'big', value: new Array(300_000).fill(1) },
        { op: 'varSet', key: 'i', value: 0 },
        {
          op: 'while',
          condition: {
            $expr: 'binary',
            op: '<',
            left: ident('i'),
            right: lit(500),
          },
          body: [
            { op: 'varSet', key: 'big', value: ident('big') },
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
    const t0 = performance.now()
    const r = await new AgentVM().run(
      ast,
      {},
      {
        fuel: 1e8,
        maxHeapBytes: 512 * 1024 * 1024,
      }
    )
    const ms = performance.now() - t0
    expect(r.error?.message ?? 'ok').toBe('ok')

    expect(ms < 2000 ? 'fast' : `took ${ms.toFixed(0)}ms`).toBe('fast')
  })
})

describe('a refused heap write always explains itself', () => {
  const ident = (name) => ({ $expr: 'ident', name })
  const lit = (value) => ({ $expr: 'literal', value })
  it('a run that cannot afford its own writes fails LOUDLY', async () => {
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'big', value: 'x'.repeat(200_000) },
          { op: 'varSet', key: 'list', value: [] },
          { op: 'varSet', key: 'i', value: 0 },
          {
            op: 'while',
            condition: {
              $expr: 'binary',
              op: '<',
              left: ident('i'),
              right: lit(50),
            },
            body: [
              {
                op: 'push',
                list: ident('list'),
                item: ident('big'),
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
      },
      {},
      { fuel: 20, maxHeapBytes: 512 * 1024 * 1024 }
    )

    expect(r.error).toBeDefined()
    expect(r.error.message).toBe('Out of Fuel')
    expect(r.result?.ok).toBeUndefined()
  })
})
