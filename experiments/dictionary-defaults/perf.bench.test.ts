/**
 * Spike B — dictionary-defaults perf validation (docs/dictionary-defaults.md §10).
 *
 * Check-then-fill benchmarked against a CANONICAL CORRECT implementation —
 * not against the broken idioms. A baseline must produce the same result to
 * be a baseline: shallow spread drops nested defaults and mutating assign
 * corrupts the shared default object, so their speed is meaningless. They
 * appear as clearly-labeled reference rows only.
 *
 * Correct baselines:
 *   - per-shape spread merge — what a careful dev hand-writes for a KNOWN
 *     shape ({...D, ...p, pos: {...D.pos, ...p.pos}}). The real bar: it is
 *     the fastest correct thing humans actually write.
 *   - generic recursive deep-merge — the correct shape-agnostic hand-roll.
 *   - structuredClone-then-fill — the safe-but-slow variant.
 *
 * Cases per the spec: complete payload (the hot path — must be ≈ scan-only,
 * zero OUTPUT allocation, returns by reference), one-absent, no-arg.
 *
 * Gated by SKIP_BENCHMARKS (test:fast skips; the full pre-tag gate runs it).
 * Timing assertions are LOOSE catastrophic-regression guards over many
 * iterations — never tight ratios on single calls (the vector-search lesson).
 */
import { describe, it, expect } from 'bun:test'
import { buildDescriptor, merge, type ExcessPolicy } from './merge'

const STRIP = { excess: 'strip' as ExcessPolicy }

/** Realistic tosijs-3d-ish camera/scene options bag: 8 members, 3 nested. */
const DEFAULTS = {
  position: { x: 0, y: 0, z: 5 },
  target: { x: 0, y: 0, z: 0 },
  fov: 60,
  near: 0.1,
  far: 1000.5,
  controls: { orbit: true, pan: true, zoomSpeed: 1.5 },
  background: '',
  shadows: true,
}
type Opts = typeof DEFAULTS
const descriptor = buildDescriptor(DEFAULTS)

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------

/** CANONICAL: per-shape spread — correct for this known shape. The bar. */
function perShapeSpread(p: Partial<Opts> = {}): Opts {
  return {
    ...DEFAULTS,
    ...p,
    position: { ...DEFAULTS.position, ...p.position },
    target: { ...DEFAULTS.target, ...p.target },
    controls: { ...DEFAULTS.controls, ...p.controls },
  }
}

/** CANONICAL: generic recursive deep-merge — correct, shape-agnostic. */
function genericDeepMerge(defaults: any, p: any): any {
  if (p === undefined) return structuredClone(defaults)
  const out: any = {}
  for (const k of Object.keys(defaults)) {
    const d = defaults[k]
    const v = p[k]
    if (v === undefined) {
      out[k] = d !== null && typeof d === 'object' ? structuredClone(d) : d
    } else if (
      d !== null &&
      typeof d === 'object' &&
      !Array.isArray(d) &&
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v)
    ) {
      out[k] = genericDeepMerge(d, v)
    } else {
      out[k] = v
    }
  }
  return out
}

/** CANONICAL (safe-but-slow): clone everything, then overlay. */
function cloneThenFill(p: Partial<Opts> = {}): Opts {
  const out: any = structuredClone(DEFAULTS)
  for (const k of Object.keys(p) as (keyof Opts)[]) {
    const v = p[k]
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

/** REFERENCE ONLY — INCORRECT: drops nested defaults on partials. */
function shallowSpread(p: Partial<Opts> = {}): Opts {
  return { ...DEFAULTS, ...p } as Opts
}

// ---------------------------------------------------------------------------
// Workloads
// ---------------------------------------------------------------------------

const COMPLETE: Opts = {
  position: { x: 1, y: 2, z: 3 },
  target: { x: 0, y: 1, z: 0 },
  fov: 75,
  near: 0.5,
  far: 500.5,
  controls: { orbit: true, pan: false, zoomSpeed: 2.5 },
  background: 'sky',
  shadows: false,
}
const ONE_ABSENT = { ...COMPLETE } as Partial<Opts>
delete (ONE_ABSENT as any).fov
const PARTIAL_NESTED: Partial<Opts> = { position: { x: 9 } as any, fov: 30 }

const N = 200_000

function bench(label: string, fn: () => unknown): number {
  for (let i = 0; i < 10_000; i++) fn() // warm
  const t0 = performance.now()
  for (let i = 0; i < N; i++) fn()
  const ms = performance.now() - t0
  console.log(
    `  ${label.padEnd(44)} ${ms.toFixed(0).padStart(6)}ms / ${N / 1000}k  (${(
      (ms * 1e6) /
      N
    ).toFixed(0)} ns/op)`
  )
  return ms
}

describe.skipIf(!!process.env.SKIP_BENCHMARKS)(
  'spike B: check-then-fill vs canonical correct merges',
  () => {
    it('all correct implementations agree before we time anything', () => {
      // A baseline only counts if it does the same job. Prove agreement on
      // every workload first — this is what disqualifies shallowSpread.
      for (const p of [COMPLETE, ONE_ABSENT, PARTIAL_NESTED, undefined]) {
        const ours = merge(descriptor, DEFAULTS, p as any, STRIP)
        expect(ours).toEqual(perShapeSpread(p as any))
        expect(ours).toEqual(genericDeepMerge(DEFAULTS, p))
        expect(ours).toEqual(cloneThenFill(p as any))
      }
      // …and show the incorrect one genuinely differs (nested default lost):
      expect(shallowSpread(PARTIAL_NESTED).position.y).toBeUndefined()
      expect(
        (merge(descriptor, DEFAULTS, PARTIAL_NESTED as any, STRIP) as any)
          .position.y
      ).toBe(0)
    })

    it('complete payload: check-then-fill is by-reference; correct baselines allocate', () => {
      console.log('\n=== complete payload (the hot path) ===')
      const ours = bench('check-then-fill (returns payload by ref)', () =>
        merge(descriptor, DEFAULTS, COMPLETE, STRIP)
      )
      const spread = bench('per-shape spread (canonical bar)', () =>
        perShapeSpread(COMPLETE)
      )
      bench('generic deep-merge', () => genericDeepMerge(DEFAULTS, COMPLETE))
      bench('structuredClone-then-fill', () => cloneThenFill(COMPLETE))
      bench('[INCORRECT, reference] shallow spread', () =>
        shallowSpread(COMPLETE)
      )

      // Identity, not equality: the zero-OUTPUT-allocation proof.
      expect(merge(descriptor, DEFAULTS, COMPLETE, STRIP)).toBe(COMPLETE)
      // Loose catastrophic guard only: scanning must not cost more than a
      // few multiples of the canonical bar (which allocates 4 objects).
      expect(ours).toBeLessThan(spread * 8)
    })

    it('one member absent: fill path competitive with the canonical bar', () => {
      console.log('\n=== one absent member ===')
      const ours = bench('check-then-fill', () =>
        merge(descriptor, DEFAULTS, ONE_ABSENT as any, STRIP)
      )
      const spread = bench('per-shape spread (canonical bar)', () =>
        perShapeSpread(ONE_ABSENT)
      )
      bench('generic deep-merge', () => genericDeepMerge(DEFAULTS, ONE_ABSENT))
      bench('structuredClone-then-fill', () => cloneThenFill(ONE_ABSENT))
      expect(ours).toBeLessThan(spread * 10)
    })

    it('nested partial + no-arg', () => {
      console.log('\n=== nested partial ===')
      bench('check-then-fill', () =>
        merge(descriptor, DEFAULTS, PARTIAL_NESTED as any, STRIP)
      )
      bench('per-shape spread (canonical bar)', () =>
        perShapeSpread(PARTIAL_NESTED)
      )
      console.log('\n=== no-arg (full default clone) ===')
      const ours = bench('check-then-fill (fresh clone)', () =>
        merge(descriptor, DEFAULTS, undefined, STRIP)
      )
      const sc = bench('structuredClone(DEFAULTS)', () =>
        structuredClone(DEFAULTS)
      )
      bench('per-shape spread (canonical bar)', () => perShapeSpread())
      // Our literal-walking clone should beat structuredClone comfortably.
      expect(ours).toBeLessThan(sc * 2)
    })
  }
)
