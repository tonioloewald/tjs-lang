/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  Eval,
  SafeFunction,
  DEFAULT_MAX_SOURCE_BYTES,
} from '/Users/tonioloewald/tjs-lang/src/lang/eval'

/* line 23 */
function bigSource(kb) {
  const lines = []
  let bytes = 0
  for (let i = 0; bytes < kb * 1024; i++) {
    const line = `const v${i} = 1`
    lines.push(line)
    bytes += line.length + 1
  }
  lines.push('return 1')
  return lines.join('\n')
}
bigSource.__tjs = {
  params: {
    kb: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:23',
}

describe('Eval refuses oversized source before transpiling it', () => {
  it('has a default cap', () => {
    expect(DEFAULT_MAX_SOURCE_BYTES).toBe(64 * 1024)
  })
  it('refuses a 300KB payload, and does so promptly', async () => {
    const t0 = performance.now()
    const r = await Eval({ code: bigSource(300), fuel: 10 })
    const ms = performance.now() - t0
    expect(r.error?.message).toMatch(/over the \d+-byte limit/)

    expect(ms < 500 ? 'prompt' : `took ${ms.toFixed(0)}ms`).toBe('prompt')
  })
  it('returns the refusal as an error, never throws', async () => {
    const p = Eval({ code: bigSource(300), fuel: 10 })
    await expect(p).resolves.toBeDefined()
    expect((await p).error).toBeDefined()
  })
  it('measures BYTES, not string length', async () => {
    const justOverInBytes = '"' + '😀'.repeat(20_000) + '"\nreturn 1'
    expect(justOverInBytes.length).toBeLessThan(DEFAULT_MAX_SOURCE_BYTES)
    expect(Buffer.byteLength(justOverInBytes, 'utf8')).toBeGreaterThan(
      DEFAULT_MAX_SOURCE_BYTES
    )
    const r = await Eval({ code: justOverInBytes, fuel: 10 })
    expect(r.error?.message).toMatch(/over the \d+-byte limit/)
  })
  it('ordinary code is unaffected', async () => {
    expect((await Eval({ code: 'return 1 + 2', fuel: 100 })).result).toBe(3)
  })
  it('can be opted out of for trusted source', async () => {
    const r = await Eval({
      code: bigSource(120),
      fuel: 1_000_000,
      maxSourceBytes: 0,
    })
    expect(r.error).toBeUndefined()
    expect(r.result).toBe(1)
  })
  it('SafeFunction caps its body too, and throws (as it does for other bad input)', async () => {
    await expect(SafeFunction({ body: bigSource(300) })).rejects.toThrow(
      /over the \d+-byte limit/
    )
    const fn = await SafeFunction({ body: 'return a + b', params: ['a', 'b'] })
    expect((await fn(2, 3)).result).toBe(5)
  })
})
