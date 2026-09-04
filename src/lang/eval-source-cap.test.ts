/**
 * Transpilation happens BEFORE `vm.run`, so `fuel` and `timeoutMs` do not bound it.
 *
 * Both are properties of the run. `Eval` transpiles first, and `preprocess` is super-linear
 * in source length, so a caller who asks for `{ fuel: 10, timeoutMs: 1 }` can still be made
 * to spend minutes of synchronous host time. Measured before the cap existed:
 *
 *     50 KB  -> 0.1s     500 KB -> 3.9s      fuelUsed 0.2 at every size
 *    200 KB  -> 0.8s     1.8 MB -> ~145s
 *
 * On a hosted endpoint that is denial-of-wallet as much as denial-of-service, and it needs no
 * valid AJS at all — the cost is paid before the parser decides the input is garbage.
 *
 * The cap is on BYTES because that is what the caller controls and the only quantity knowable
 * before the expensive step. It is not a performance tuning knob; it is the only budget that
 * applies to compilation.
 */
import { describe, it, expect } from 'bun:test'
import { Eval, SafeFunction, DEFAULT_MAX_SOURCE_BYTES } from './eval'

/** Valid, parseable source of roughly `kb` kilobytes — unique names, so the transpiler
 *  rejects it for SIZE if at all, never for a duplicate declaration. */
const bigSource = (kb: number): string => {
  const lines: string[] = []
  let bytes = 0
  for (let i = 0; bytes < kb * 1024; i++) {
    const line = `const v${i} = 1`
    lines.push(line)
    bytes += line.length + 1
  }
  lines.push('return 1')
  return lines.join('\n')
}

describe('Eval refuses oversized source before transpiling it', () => {
  it('has a default cap', () => {
    expect(DEFAULT_MAX_SOURCE_BYTES).toBe(64 * 1024)
  })

  it('refuses a 300KB payload, and does so promptly', async () => {
    const t0 = performance.now()
    const r: any = await Eval({ code: bigSource(300), fuel: 10 })
    const ms = performance.now() - t0
    expect(r.error?.message).toMatch(/over the \d+-byte limit/)
    // The point is that it did not TRANSPILE it. Refusal is a length check; 300KB took
    // ~2.5s to compile before the cap, so anything in that range means the guard is running
    // after the work rather than before it.
    expect(ms < 500 ? 'prompt' : `took ${ms.toFixed(0)}ms`).toBe('prompt')
  })

  it('returns the refusal as an error, never throws', async () => {
    // `Eval` is documented as monadic and the hosted endpoints return `result.error` to the
    // caller. A size check that threw would become a 500, and an unhandled rejection for
    // anyone who never wrote a catch.
    const p = Eval({ code: bigSource(300), fuel: 10 })
    await expect(p).resolves.toBeDefined()
    expect((await p).error).toBeDefined()
  })

  it('measures BYTES, not string length', async () => {
    // A multi-byte payload must not buy several times the budget. Each emoji is 4 bytes.
    const justOverInBytes = '"' + '😀'.repeat(20_000) + '"\nreturn 1' // ~80KB, ~20K chars
    expect(justOverInBytes.length).toBeLessThan(DEFAULT_MAX_SOURCE_BYTES)
    expect(Buffer.byteLength(justOverInBytes, 'utf8')).toBeGreaterThan(
      DEFAULT_MAX_SOURCE_BYTES
    )
    const r: any = await Eval({ code: justOverInBytes, fuel: 10 })
    expect(r.error?.message).toMatch(/over the \d+-byte limit/)
  })

  it('ordinary code is unaffected', async () => {
    // The floor. A cap of zero would satisfy every assertion above.
    expect((await Eval({ code: 'return 1 + 2', fuel: 100 })).result).toBe(3)
  })

  it('can be opted out of for trusted source', async () => {
    // `maxSourceBytes: 0` disables it — meaningful when the source is your own, e.g.
    // compiled at build time. Asserts the opt-out ACCEPTS (returns a result), not merely
    // that it declines to complain.
    const r: any = await Eval({
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
