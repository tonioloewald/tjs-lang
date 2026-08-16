/**
 * The membrane budget bills what CROSSES, not what the walk had to name.
 *
 * `readOwnData` charged `k.length * 2 + 8` for every own key, and the array branch runs
 * over `Object.keys(arr)` — so each element was billed for the *string form of its own
 * index*. Nothing of the sort crosses: `structuredClone` copies an array's elements as
 * slots, and `"199999"` is never materialised, let alone stored.
 *
 * The overcharge is not a rounding error, and it grows with array length because indices
 * get longer:
 *
 *     500,000 floats   real 3.81MB   charged 13.14MB   (9.32MB of it phantom index names)
 *
 * Against the documented 4MB default that cut effective array capacity ~3.4×, so a
 * perfectly ordinary RAG return — a few hundred documents' worth of embeddings, well
 * inside the budget the user configured — came back as
 * `Capability boundary rejected the return of 'storeVectorSearch'`. The user's remedy is
 * to raise `membraneMaxBytes`, i.e. to weaken the OOM guard to buy back capacity that was
 * never actually being used.
 *
 * A non-index own property on an array (`arr.meta = …`) is a real property name that
 * `structuredClone` does serialise, so it keeps its name charge. Both kinds are still
 * WALKED — the accessor rejection and the recursion into values are unchanged. This is
 * about the price, not the inspection.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'

const VM = new AgentVM()

/**
 * Drive a capability return across the membrane.
 *
 * `result:` (not `as:`) is what binds an atom's output — and the membrane only runs on a
 * BOUND result. An earlier probe of this very finding used `as:`, saw everything accepted,
 * and concluded the bug did not reproduce. The accessor control below exists so that
 * mistake cannot be made silently again: if the membrane is not running, it fails.
 */
async function cross(payload: unknown, membraneMaxBytes?: number) {
  const r = await VM.run(
    {
      op: 'seq',
      steps: [
        { op: 'httpFetch', url: 'https://example.test/x', result: 'd' },
        { op: 'return', value: { ok: 1 } },
      ],
    } as any,
    {} as any,
    {
      fuel: 1e7,
      capabilities: { fetch: async () => payload } as any,
      ...(membraneMaxBytes === undefined ? {} : { membraneMaxBytes }),
    }
  )
  return r.error?.message ?? null
}

/** 8 bytes each, which is also what the walk charges for a number. */
const floats = (n: number) => new Array(n).fill(0.5)

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
    // 200k floats = 1.53MB of data against the 4MB default. Unfixed, the index names add
    // ~3.76MB and this is rejected.
    expect(await cross(floats(200_000))).toBe(null)
  })

  it('scales — a longer array is not penalised for longer indices', async () => {
    // 500k floats = 3.81MB, still under 4MB. Unfixed: charged 13.14MB.
    expect(await cross(floats(500_000))).toBe(null)
  })

  it('a RAG-shaped return of 300 embeddings crosses', async () => {
    // The reported symptom: 300 docs x 768 floats ~= 1.84MB.
    const docs = Array.from({ length: 300 }, (_, i) => ({
      id: `doc-${i}`,
      v: floats(768),
    }))
    expect(await cross(docs)).toBe(null)
  })

  it('an array genuinely over budget is STILL rejected', async () => {
    // The control. Charging nothing per element would pass every test above and turn the
    // OOM guard off. 1M floats = 8MB of real data against a 4MB cap.
    expect(await cross(floats(1_000_000))).toMatch(/membrane budget/)
  })

  it('the values themselves are still budgeted, at a small cap', async () => {
    // 100k floats = 0.76MB of data; a 256KB budget must refuse it.
    expect(await cross(floats(100_000), 256 * 1024)).toMatch(/membrane budget/)
  })
})

describe('non-index own properties keep their name charge', () => {
  it('a long property name on an array is billed', async () => {
    // `structuredClone` does serialise this key, so the name is real bytes. 40k chars of
    // name (80KB) against a 64KB budget.
    const arr: any = [1, 2, 3]
    arr['n'.repeat(40_000)] = 1
    expect(await cross(arr, 64 * 1024)).toMatch(/membrane budget/)
  })

  it('a non-index accessor on an array is still rejected', async () => {
    // The array branch must keep VISITING non-index properties — only the price changed.
    const arr: any = [1, 2, 3]
    Object.defineProperty(arr, 'meta', {
      enumerable: true,
      get() {
        return 'host code ran'
      },
    })
    expect(await cross(arr)).toMatch(/accessor/)
  })

  it('a value nested under an array index is still walked', async () => {
    const arr: any = [{ deep: { fn: () => 1 } }]
    expect(await cross(arr)).toMatch(/function/)
  })
})

describe('object property names are unchanged', () => {
  it('a plain object with huge keys is still billed for them', async () => {
    const obj: Record<string, number> = {}
    for (let i = 0; i < 40; i++) obj['k'.repeat(2000) + i] = 1
    // 80k chars of key = 160KB against a 64KB budget.
    expect(await cross(obj, 64 * 1024)).toMatch(/membrane budget/)
  })

  it('an object with numeric-LOOKING string keys is billed for them', async () => {
    // Not an array: `{ '0': …, '1': … }` really does store those names, and
    // `structuredClone` really does serialise them. The exemption is for the array branch
    // only, so a plain object must not inherit it.
    const obj: Record<string, number> = {}
    for (let i = 0; i < 8000; i++) obj[String(i).padStart(20, '0')] = 1
    // 8000 x 20 chars = 320KB of names against a 128KB budget.
    expect(await cross(obj, 128 * 1024)).toMatch(/membrane budget/)
  })
})
