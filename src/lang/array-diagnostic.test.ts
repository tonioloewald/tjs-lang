/**
 * The "array of X | Y" diagnostic exists in TWO copies, and both are on the ERROR path.
 *
 * `describeActual` in the runtime and `__arrKinds` in the emitted inline runtime must give
 * the same answer, because emitted code calls the inline one BARE — the stub always wins,
 * so it is the shipped semantics, not a fallback (`docs/type-identity.md`).
 *
 * Both used to stop only after seeing four distinct element types. That bounds the
 * MESSAGE, not the WORK: a homogeneous `number[]` never reaches four kinds, so a
 * ten-million-element array was walked end to end just to conclude "array of number" — on
 * the failure path, where a validation error inside a loop pays it every iteration. The
 * scan is now capped at 64 elements and a trailing `…` marks that the answer came from a
 * sample rather than the whole array.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

/** Pull the emitted `__arrKinds` out of real transpiler output and make it callable. */
function inlineArrKinds(): (v: unknown[]) => string {
  const code = tjs(`function f(xs: [0]):! 0 { return xs.length }\n`).code
  expect(code).toContain('function __arrKinds')
  return new Function(code + '\nreturn __arrKinds')() as any
}

/** The runtime's answer, reached through a real validation failure. */
function runtimeDescribe(value: unknown): string {
  const saved = (globalThis as any).__tjs
  try {
    const rt = createRuntime()
    const err: any = rt.typeError('p', 'array of integer', value)
    return String(err.actual)
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

describe('array diagnostics: the two copies agree', () => {
  const CASES: Array<[string, unknown[]]> = [
    ['empty', []],
    ['homogeneous numbers', [1, 2, 3]],
    ['mixed', [1, 'a', null, {}]],
    ['five kinds stops at four', [1, 'a', null, {}, true]],
    ['nested arrays', [[1], [2]]],
    ['exactly at the cap', Array.from({ length: 64 }, () => 1)],
    ['one past the cap', Array.from({ length: 65 }, () => 1)],
    ['long and homogeneous', Array.from({ length: 5000 }, () => 'x')],
    // Four kinds reached EARLY, with more elements behind them. The early return omitted
    // the `…`, so a message that had seen 4 of 6 read as exhaustive — contradicting the
    // very invariant the marker was added for.
    ['four kinds, more behind', [1, 'a', true, null, {}, Symbol('x')]],
    ['exactly four kinds, nothing behind', [1, 'a', true, null]],
  ]

  const arrKinds = inlineArrKinds()

  it('the inline copy really came from the emitter (apparatus check)', () => {
    // A hand-written stand-in would make every case below agree with itself.
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
    // The bound is what matters; assert a RATIO so a slow machine scales the same way.
    const small = Array.from({ length: 64 }, () => 1)
    const huge = Array.from({ length: 2_000_000 }, () => 1)
    const time = (v: unknown[]) => {
      let best = Infinity
      for (let k = 0; k < 5; k++) {
        const t0 = performance.now()
        arrKinds(v)
        best = Math.min(best, performance.now() - t0)
      }
      return best
    }
    // Uncapped, `huge` walked ~31,000× more elements. Capped, both scan 64.
    expect(time(huge)).toBeLessThan(Math.max(time(small), 0.01) * 50)
  })
})
