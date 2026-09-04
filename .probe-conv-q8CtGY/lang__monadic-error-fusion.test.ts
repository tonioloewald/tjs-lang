/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { MonadicError } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 25 */
function inlineInstance(args) {
  const emitted = tjs('export function f(v: 0): 0 { return v }', {
    runTests: false,
  }).code
  const preludeLine = emitted.split('\n')[0]
  expect(preludeLine).toContain('MonadicError')
  const fn = new Function(
    'globalThis',
    `${preludeLine};return (...a) => new MonadicError(...a)`
  )
  return fn({})(...args)
}
inlineInstance.__tjs = {
  params: {
    args: {
      type: {
        kind: 'array',
        items: {
          kind: 'null',
        },
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:25',
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
    const canonical = new MonadicError(...ARGS)
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

    expect(code).not.toMatch(/^class MonadicError\b/m)
  })
  it('the canonical runtime resolves through the same slot', () => {
    expect(globalThis.__tjs_MonadicError_1).toBe(MonadicError)
  })
  it('the slot key is versioned by SHAPE, not by package version', () => {
    const code = tjs('export function f(v: 0): 0 { return v }', {
      runTests: false,
    }).code
    const slot = /__tjs_MonadicError_(\w+)/.exec(code)?.[1]
    expect(slot).toBe('1')
    expect(slot).not.toMatch(/\./)
  })
})
