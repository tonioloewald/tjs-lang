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
const obj = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, `v${i}`]))

/** Each case: how to invoke the atom with an operand of size N. */
const CASES: Array<{
  atom: string
  build: (n: number) => { steps: any[]; args: Record<string, any> }
}> = [
  {
    // varSet/constSet were NOT in this list, and the heap-ceiling walker
    // (`trackHeapWrite` → `estimateBytes`) runs on every one of them. The existing heap
    // tests all used STRINGS, which `estimateBytes` measures in O(1) via `.length` — so
    // the walk's real cost was invisible to this file. Measured before the fix: 500
    // rebinds of a 300k-element array burned 28.8 SECONDS of pegged CPU for 50.2 fuel
    // (574 ms per fuel unit) while a benign program charged the same 50.2 took 1ms.
    //
    // The operand MUST be a non-string, or this case re-tests nothing.
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
  // The five that were still flat-charged at 0.13.0-beta.1. Each measured at 1.20 fuel
  // for N=100 AND N=100,000 before `chargeForSize` was added — a 1000x size difference
  // for identical cost.
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
      // `pick` walks the KEY LIST, so that is the operand whose size must matter.
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
    // LARGE INPUT, SMALL OUTPUT — deliberately. `omit` must walk the whole source object
    // to know what to keep, and this is the shape the heap-write accounting cannot see:
    // it charges for the RESULT, which here is one key. Measured flat: walking a
    // 100,000-key object to produce a 1-key result cost 1.20 fuel, the same as N=1,000.
    //
    // It also matters WHEN the charge lands. Result accounting charges AFTER the work is
    // done, so it can notice a 17-second stall but not prevent one; charging the operand
    // up front is what actually bounds it.
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
 * ENUMERATION, not a list.
 *
 * The block above drives a HAND-WRITTEN set of cases, so it can only catch the atoms
 * someone already suspected. That is exactly how five more flat-charged O(n) atoms
 * survived it: `hash` cost 1.2 fuel for 1KB and for 1MB alike, and 400 `merge`s over a
 * 400k-key object completed in 17.7 SECONDS having spent 400.3 fuel — a ~400x undercharge,
 * in a VM whose entire safety story is that the budget is real.
 *
 * The CHANGELOG's "anyone relying on fuel as a DoS bound should upgrade" closed five
 * atoms. It did not close the CLASS. So: walk the registry, and require every atom to be
 * either DEMONSTRATED to scale or explicitly declared size-insensitive WITH A REASON.
 * Adding an atom now forces the question rather than leaving it to be noticed later.
 */
describe('cost invariant: every atom is accounted for', () => {
  /**
   * Atoms whose work genuinely does not scale with operand size.
   *
   * Each needs a REASON. An unexplained entry is indistinguishable from an oversight,
   * which is the failure mode this whole file exists to prevent.
   */
  const SIZE_INSENSITIVE: Record<string, string> = {
    // Control flow and scoping — the work belongs to the steps they contain, and those
    // are metered on their own account.
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

    // O(1) reads and writes. Binding is separately charged by trackHeapWrite.
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

    // Arithmetic / comparison on scalars.
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

    // IO: cost is dominated by the capability, which is separately timed and quota'd,
    // and the RETURN crosses the membrane, which budgets its size.
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

    // Collection iterators: the per-element cost is paid by the BODY steps they dispatch,
    // exactly like `while`/`repeat`. The iterator itself does O(1) work per element.
    map: 'per-element cost is charged by the body steps',
    filter: 'per-element cost is charged by the body steps',
    reduce: 'per-element cost is charged by the body steps',
    find: 'per-element cost is charged by the body steps; short-circuits',

    // O(1) amortised: mutates the array in place, no copy.
    push: 'Array.prototype.push mutates in place — no traversal, no copy',

    // Bounded by construction rather than by fuel: pattern and input length are hard-
    // capped and dangerous shapes rejected, because backtracking is opaque to the fuel
    // counter and no per-character charge could bound it. See MAX_REGEX_* / redos.ts.
    regexMatch:
      'input and pattern are hard-capped; ReDoS shapes rejected outright',

    // O(names requested), which the guest writes out literally in the step — it cannot be
    // large without the program itself being large.
    varsExport:
      'proportional to the literal key list in the step, not to any operand',

    // Bookkeeping over a small fixed structure.
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
    // The cases driven above, by the atom they exercise.
    const demonstrated = new Set(
      CASES.map((c) => c.atom.replace(/ .*$/, '')) // strip the parenthetical label
    )
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
