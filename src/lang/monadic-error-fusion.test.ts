/**
 * `MonadicError` is fused across modules through a shape-versioned global slot, and the inline
 * copy must stay identical to the canonical one.
 *
 * A DIFFERENTIAL test, in the style of `unwrap-boxed.test.ts`: there are two copies of this
 * class — one in `runtime.ts`, one emitted as a string by `emitters/js.ts` — and the only
 * thing that keeps two copies in sync is a test that runs both. Nobody remembers.
 *
 * The stakes are higher here than for an ordinary duplicated helper. Fusion means whichever
 * module loads first WINS the slot for the whole program, so a drift between the copies is not
 * "two slightly different classes in two places" — it is a class whose behaviour depends on
 * module load order. That is the failure mode this file exists to make impossible.
 *
 * Why `MonadicError` is the only prelude member allowed to fuse: it is a plain data class,
 * observationally identical to its canonical version. `Type` throws where its stub is
 * permissive, `FunctionPredicate.check()` returns a reason string where its stub returns
 * `false`, and `typeError` reads config off the global at call time. Fusing any of those would
 * be a behaviour change disguised as a size optimisation. See `docs/runtime-fusion.md`.
 */
import { describe, it, expect } from 'bun:test'
import { MonadicError } from './runtime'
import { tjs } from './index'

/** Construct an instance of the INLINE class, in a fresh realm-ish scope. */
function inlineInstance(args: unknown[]): any {
  // Emit a real module, then evaluate just its prelude with a private slot object, so the
  // inline class is exercised as emitted rather than as a hand-copy of it.
  const emitted = tjs('export function f(v: 0): 0 { return v }', {
    runTests: false,
  }).code
  const preludeLine = emitted.split('\n')[0]
  expect(preludeLine).toContain('MonadicError')
  const fn = new Function(
    'globalThis',
    `${preludeLine};return (...a) => new MonadicError(...a)`
  )
  return fn({} as any)(...args)
}

const ARGS = [
  'the message',
  'a/path.ts:1:f.x',
  'integer',
  'string',
  ['a', 'b'],
  'because',
]

describe('the inline MonadicError matches the canonical one', () => {
  it('every field agrees, constructed from identical arguments', () => {
    const canonical: any = new MonadicError(
      ...(ARGS as [string, string, string, string, string[], string])
    )
    const inline = inlineInstance(ARGS)
    for (const field of [
      'message',
      'name',
      'path',
      'expected',
      'actual',
      'reason',
    ]) {
      expect([field, inline[field]]).toEqual([field, canonical[field]])
    }
    expect(inline.callStack).toEqual(canonical.callStack)
  })

  it('both are Errors named MonadicError, which is what duck-typing keys on', () => {
    const inline = inlineInstance(ARGS)
    expect(inline instanceof Error).toBe(true)
    expect(inline.name).toBe('MonadicError')
    expect('path' in inline).toBe(true)
  })

  it('the constructor takes the same arity, in the same order', () => {
    // Order is invisible in the field check above if two adjacent params were swapped AND the
    // test happened to pass matching values. ARGS uses six distinguishable values so a swap
    // shows up; this pins the arity separately.
    expect(MonadicError.length).toBe(inlineInstance(ARGS).constructor.length)
    expect(MonadicError.length).toBe(6)
  })
})

describe('the fusion slot', () => {
  it('emitted output claims the slot rather than declaring a bare class', () => {
    const code = tjs('export function f(v: 0): 0 { return v }', {
      runTests: false,
    }).code
    expect(code).toContain('__tjs_MonadicError_1')
    expect(code).toContain('??=')
    // A bare top-level `class MonadicError` is what made every module's class distinct.
    expect(code).not.toMatch(/^class MonadicError\b/m)
  })

  it('the canonical runtime resolves through the same slot', () => {
    // Not just "the runtime also has a class". If runtime.ts kept its own, a module that
    // evaluated BEFORE the runtime would hold a different one — and that is the idiomatic
    // order, because ES imports are hoisted above the body that calls installRuntime().
    expect((globalThis as any).__tjs_MonadicError_1).toBe(MonadicError)
  })

  it('the slot key is versioned by SHAPE, not by package version', () => {
    // Keying on the release would mint a new slot every version and fuse nothing. The number
    // moves only if a field is removed or repurposed, so old and new libraries would then get
    // separate slots instead of the newer silently winning.
    const code = tjs('export function f(v: 0): 0 { return v }', {
      runTests: false,
    }).code
    const slot = /__tjs_MonadicError_(\w+)/.exec(code)?.[1]
    expect(slot).toBe('1')
    expect(slot).not.toMatch(/\./) // not a semver
  })
})
