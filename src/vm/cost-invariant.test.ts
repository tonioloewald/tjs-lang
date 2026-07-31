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
