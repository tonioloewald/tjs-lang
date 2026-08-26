/**
 * `wasm { } fallback { }` must take the fallback when the ENGINE has no wasm compiler,
 * not only when the module fails to validate.
 *
 * The async retry lived inside the `catch` of the sync attempt, with nothing around it:
 *
 *     try { …sync instantiate… }
 *     catch (syncErr) { pending.push(WebAssembly.instantiate(…).catch(__fail)) }
 *
 * `WebAssembly.instantiate` normally returns a promise and rejects, so `.catch` was assumed
 * sufficient. Under memory pressure SpiderMonkey instead throws `no WebAssembly compiler
 * available` SYNCHRONOUSLY — and that throw escaped, taking down the whole module, in a file
 * whose `fallback` block exists precisely so the program does not need WebAssembly.
 *
 * So `fallback` covered "this module failed to validate" but not "this engine has no wasm
 * compiler right now", which is the broader case and the one an author cannot code around:
 * intermittent, resource-dependent, roughly 1 run in 6 on a loaded Firefox. Reported from
 * tosijs-ui's Playwright lane (issue #36).
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { tjs } from './index'

const SRC = `export function dbl(arr: [1.0], len: 1):! [1.0] {
  wasm {
    for (let i = 0; i < len; i++) { arr[i] = arr[i] * 2.0 }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
  return arr
}
`

const realWA = globalThis.WebAssembly
afterEach(() => {
  globalThis.WebAssembly = realWA
})

/** An engine whose WebAssembly entry points all throw the way `mode` says. */
function hostileWasm(mode: 'sync-throw' | 'async-reject') {
  // A regular function, not an arrow: `new WebAssembly.Module(...)` uses `new`, and an
  // arrow is not a constructor — it would throw "boom is not a constructor" instead of the
  // engine message, which is a different failure wearing the same shape. (The apparatus
  // check below caught exactly that.)
  function boom(): never {
    throw new Error('no WebAssembly compiler available')
  }
  globalThis.WebAssembly = {
    Module: boom,
    Instance: boom,
    instantiate:
      mode === 'sync-throw'
        ? boom
        : () => Promise.reject(new Error('no WebAssembly compiler available')),
  } as any
}

const load = () =>
  new Function(tjs(SRC).code.replace(/^export /gm, '') + '\nreturn dbl')()

describe('wasm fallback survives an engine with no compiler', () => {
  it('the apparatus really removes wasm (control)', () => {
    hostileWasm('sync-throw')
    expect(() => new (globalThis.WebAssembly as any).Module()).toThrow(
      /no WebAssembly compiler/
    )
  })

  it('a SYNCHRONOUS throw from instantiate does not escape', () => {
    // The reported case. Before the fix this threw out of module evaluation.
    hostileWasm('sync-throw')
    expect(() => load()).not.toThrow()
  })

  it('and the fallback actually runs, producing the right answer', () => {
    // Surviving load is not enough — the point of `fallback` is that the program works.
    hostileWasm('sync-throw')
    expect(load()([1, 2, 3], 3)).toEqual([2, 4, 6])
  })

  it('an async REJECTION still falls back too (the case that already worked)', () => {
    // The control for the fix: guarding the sync throw must not break the path that was
    // already correct.
    hostileWasm('async-reject')
    expect(load()([1, 2, 3], 3)).toEqual([2, 4, 6])
  })

  it('with a real engine, the module still loads and computes', () => {
    globalThis.WebAssembly = realWA
    expect(load()([1, 2, 3], 3)).toEqual([2, 4, 6])
  })
})
