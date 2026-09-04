/* tjs <- input.ts */

import { describe, it, expect, afterEach } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

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

/* line 39 */
/* TODO: TS types degraded — mode: 'sync-throw' | 'async-reject' */
function hostileWasm(mode) {
  function boom() {
    throw new Error('no WebAssembly compiler available')
  }
  globalThis.WebAssembly = {
    Module: boom,
    Instance: boom,
    instantiate:
      mode === 'sync-throw'
        ? boom
        : () => Promise.reject(new Error('no WebAssembly compiler available')),
  }
}
hostileWasm.__tjs = {
  params: {
    mode: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:25',
}

/* line 57 */
function load() {
  return new Function(
    tjs(SRC).code.replace(/^export /gm, '') + '\nreturn dbl'
  )()
}
load.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:57',
}

describe('wasm fallback survives an engine with no compiler', () => {
  it('the apparatus really removes wasm (control)', () => {
    hostileWasm('sync-throw')
    expect(() => new globalThis.WebAssembly.Module()).toThrow(
      /no WebAssembly compiler/
    )
  })
  it('a SYNCHRONOUS throw from instantiate does not escape', () => {
    hostileWasm('sync-throw')
    expect(() => load()).not.toThrow()
  })
  it('and the fallback actually runs, producing the right answer', () => {
    hostileWasm('sync-throw')
    expect(load()([1, 2, 3], 3)).toEqual([2, 4, 6])
  })
  it('an async REJECTION still falls back too (the case that already worked)', () => {
    hostileWasm('async-reject')
    expect(load()([1, 2, 3], 3)).toEqual([2, 4, 6])
  })
  it('with a real engine, the module still loads and computes', () => {
    globalThis.WebAssembly = realWA
    expect(load()([1, 2, 3], 3)).toEqual([2, 4, 6])
  })
})
