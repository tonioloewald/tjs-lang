/**
 * The cost invariant — regression armor for the `==` bug class.
 *
 * **Invariant:** every evaluation step charges fuel ≥ c·(work it performs). Equivalently:
 * no atom may do work proportional to its operand's SIZE while charging a flat cost.
 *
 * This class of bug has now bitten twice. First `==`, which walked a structure to compare
 * it but charged one flat `EXPR_FUEL_COST` (also a fuel-bypass DoS). Then, measured while
 * writing this file: `jsonStringify` serialized a **2,000,000-element array for 1.2 fuel and
 * completed under a 10-fuel budget** — because the flat `cost:` in `defineAtom` is charged
 * once per call regardless of operand width. `join`, `split` and `template` were the same.
 *
 * Fuel that doesn't track work isn't a budget, it's decoration — and the VM's entire safety
 * story ("infinite loops are impossible, run anyone's code") rests on the budget being real.
 *
 * So this test is deliberately **mechanical rather than exemplary**: it drives each
 * size-sensitive atom at growing N and asserts fuel actually grows. It is a cheap stand-in
 * for a mechanized proof of the cost model — it won't prove soundness, but it catches the
 * next flat-charged O(n) atom before an attacker does.
 *
 * **Adding an atom whose work scales with input size? Add it here.** If it can't pass, it
 * needs `chargeForSize` (see runtime.ts), not an exemption.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'

const VM = new AgentVM()

/** Run one atom over an N-sized operand and report the fuel it cost. */
async function fuelFor(
  steps: any[],
  args: Record<string, any>
): Promise<number> {
  const res = await VM.run(
    { op: 'seq', steps: [...steps, { op: 'return', value: {} }] } as any,
    args,
    {
      fuel: 50_000_000, // generous: we're measuring the charge, not enforcing it
    }
  )
  if (res.error) throw new Error(`unexpected VM error: ${res.error.message}`)
  return res.fuelUsed
}

const arr = (n: number) => Array.from({ length: n }, (_, i) => 'x' + i)
const str = (n: number) => 'x'.repeat(n)

/** Each case: how to invoke the atom with an operand of size N. */
const CASES: Array<{
  atom: string
  build: (n: number) => { steps: any[]; args: Record<string, any> }
}> = [
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
  const BIG = 100_000 // 100x the operand

  for (const { atom, build } of CASES) {
    it(`${atom}: 100x the input costs ~100x the marginal fuel`, async () => {
      // Measure MARGINAL fuel (above the atom's fixed overhead), else a flat
      // `cost: 1` baseline swamps the signal at small N and a correctly-charged
      // atom looks under-charged. Isolating the size-dependent component is what
      // the invariant is actually about.
      const base = build(1)
      const s = build(SMALL)
      const b = build(BIG)
      const fBase = await fuelFor(base.steps, base.args)
      const mSmall = (await fuelFor(s.steps, s.args)) - fBase
      const mBig = (await fuelFor(b.steps, b.args)) - fBase

      // A flat-charged atom has ZERO marginal cost — that's the bug, and it trips
      // the first assertion. Proportional charging scores ~100x; demand 10x so the
      // bound survives constant-factor tuning while failing hard on a flat charge.
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
    // Regression: this exact program completed on 10 fuel before chargeForSize.
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
      } as any,
      { d: Array.from({ length: 500_000 }, (_, i) => i) },
      { fuel: 10 }
    )
    expect(res.error?.message).toBe('Out of Fuel')
  }, 60_000)
})

/**
 * The SPACE budget, complementing the time budget above.
 *
 * Fuel meters cumulative work, which bounds how much a program allocates over its
 * lifetime but not how much it holds at once. Measured: `x = x + x` charges honestly,
 * yet at ~10KB-per-fuel a legitimate 100,000-fuel budget still buys ~1GB of live
 * string — a run can pay full price and still take the host down. `maxHeapBytes`
 * (default 64MB) bounds peak live guest state.
 */
describe('heap ceiling: peak live state is bounded', () => {
  const double = {
    $expr: 'binary',
    op: '+',
    left: { $expr: 'ident', name: 'x' },
    right: { $expr: 'ident', name: 'x' },
  }

  const doubling = (iters: number) => {
    const steps: any[] = [{ op: 'varSet', key: 'x', value: 'a'.repeat(1024) }]
    for (let i = 0; i < iters; i++)
      steps.push({ op: 'varSet', key: 'x', value: double })
    steps.push({ op: 'return', value: {} })
    return { op: 'seq', steps }
  }

  it('stops exponential growth even with effectively unlimited fuel', async () => {
    // 26 doublings of 1KB = ~64GB if left alone. Fuel is not the thing stopping it.
    const res = await VM.run(doubling(26) as any, {}, { fuel: 10_000_000 })
    expect(res.error?.message).toMatch(/Heap limit exceeded/)
  }, 60_000)

  it('respects an explicit maxHeapBytes', async () => {
    const res = await VM.run(
      doubling(20) as any,
      {},
      {
        fuel: 10_000_000,
        maxHeapBytes: 1024 * 1024, // 1MB
      }
    )
    expect(res.error?.message).toMatch(/Heap limit exceeded/)
  }, 60_000)

  it('overwriting a variable frees its budget (no false positive)', async () => {
    // Per-key accounting: assigning a big value repeatedly to the SAME key must not
    // accumulate, or an ordinary loop would trip the ceiling.
    const steps: any[] = []
    for (let i = 0; i < 50; i++)
      steps.push({ op: 'varSet', key: 'buf', value: 'x'.repeat(200_000) })
    steps.push({ op: 'return', value: {} })
    const res = await VM.run(
      { op: 'seq', steps } as any,
      {},
      { fuel: 10_000_000 }
    )
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
      } as any,
      {},
      { fuel: 1000 }
    )
    expect(res.error).toBeUndefined()
  })
})

describe('the §1 sweep, verified rather than assumed', () => {
  // The audit said "finish the sweep against the named list" — concat, slice, join, sort
  // and friends. They were covered by ALLOCATING_METHODS all along, but nobody had
  // MEASURED it, so the item sat open. Measuring it is the difference between believing
  // and knowing, and it costs one test.
  const withMethod = async (method: string, n: number, args: any[] = []) => {
    const ast: any = {
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
      // 100x the data must cost far more than a constant. Flat cost here would be the
      // same bypass class as the jsonStringify one that shipped in 0.12.0.
      expect(
        large / small,
        `${method} appears to charge a flat cost`
      ).toBeGreaterThan(5)
    })
  }
})

describe('fuel exhaustion cannot be caught and resumed', () => {
  // `try` clears ctx.error when a catch block exists — including "Out of Fuel". The worry
  // was that a loop wrapping its body in try/catch could swallow exhaustion and run
  // forever, defeating the termination guarantee (S1/S4) entirely.
  //
  // It cannot: clearing the error buys exactly one more atom, because the next one charges
  // against an already-exhausted budget and errors again immediately.
  const loop = (limit: number): any => ({
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
    // Near the budget, not far past it — the catch must not buy meaningful extra work.
    expect(r.fuelUsed).toBeLessThan(60)
  })

  it('POSITIVE CONTROL: the same loop really does iterate when fuel allows', async () => {
    // Without this, a loop that silently never ran would look like a passing security test.
    const r = await new AgentVM().run(loop(20), {}, { fuel: 100_000 })
    expect(r.fuelUsed, 'the loop must actually execute').toBeGreaterThan(5)
  })
})
