import { describe, it, expect } from 'bun:test'
import { ajs } from '../transpiler'
import { transpile } from '../lang'
import { AgentVM } from '../vm'

/**
 * Local helper functions: an agent source file may declare multiple top-level
 * functions. The LAST is the entry point; the preceding ones are helpers,
 * invoked via the `callLocal` atom. Helpers are top-level siblings — isolated
 * scopes that see only their parameters, like ordinary functions.
 */
describe('Local helper functions', () => {
  const VM = new AgentVM()
  const run = async (src: string, args: Record<string, any>) =>
    (await VM.run(ajs(src), args)).result

  it('invokes a scalar-returning helper from the entry function', async () => {
    const result = await run(
      `
      function double(x) { return x * 2 }
      function main(n) {
        const d = double(n)
        return { d }
      }`,
      { n: 5 }
    )
    expect(result.d).toBe(10)
  })

  it('lets a helper call another helper', async () => {
    const result = await run(
      `
      function double(x) { return x * 2 }
      function addOne(x) {
        const d = double(x)
        return d + 1
      }
      function main(n) {
        const a = double(n)
        const b = addOne(n)
        return { a, b }
      }`,
      { n: 5 }
    )
    expect(result).toEqual({ a: 10, b: 11 })
  })

  it('allows helpers to return arrays and objects', async () => {
    const result = await run(
      `
      function pair(x) { return [x, x] }
      function wrap(x) { return { value: x } }
      function main(n) {
        const p = pair(n)
        const w = wrap(n)
        return { p, w }
      }`,
      { n: 3 }
    )
    expect(result).toEqual({ p: [3, 3], w: { value: 3 } })
  })

  it('supports idiomatic TJS typed/example params (colon shorthand)', async () => {
    // Examples are representative values: floats for a fractional-scaling fn.
    const result = await run(
      `
      function scale(x: 1.5, factor: 0.5): 0.75 { return x * factor }
      function main(n: 1.5): 0.75 {
        const s = scale(n, 0.5)
        return { s }
      }`,
      { n: 3 }
    )
    expect(result.s).toBe(1.5)
  })

  it('supports multiple parameters', async () => {
    const result = await run(
      `
      function add(a, b) { return a + b }
      function main(x, y) {
        const sum = add(x, y)
        return { sum }
      }`,
      { x: 7, y: 8 }
    )
    expect(result.sum).toBe(15)
  })

  it('isolates helper scope — helpers cannot see the caller locals', async () => {
    // `secret` is a local in main (= 42). The helper references a bare
    // `secret`; under isolation it is NOT in scope, so AJS falls back to the
    // bare-string literal "secret". A scope leak would instead expose main's
    // 42 — so the guarantee is simply: the helper never sees the caller value.
    const result = await run(
      `
      function leak(x) { return { x, secret } }
      function main(n) {
        const secret = 42
        const r = leak(n)
        return r
      }`,
      { n: 1 }
    )
    expect(result.x).toBe(1)
    expect(result.secret).not.toBe(42) // no leak of caller's local
    expect(result.secret).toBe('secret') // AJS bare-string fallback
  })

  it('does not let helper return exit the caller agent', async () => {
    // The helper returns, then main keeps running and returns its own object.
    const result = await run(
      `
      function step(x) { return x + 100 }
      function main(n) {
        const a = step(n)
        const b = step(a)
        return { a, b }
      }`,
      { n: 1 }
    )
    expect(result).toEqual({ a: 101, b: 201 })
  })

  // --- transpile-time guards -------------------------------------------------

  const expectTranspileError = (src: string, match: RegExp) =>
    expect(() => transpile(src, { vmTarget: true })).toThrow(match)

  it('rejects helper calls nested inside expressions', () => {
    expectTranspileError(
      `
      function double(x) { return x * 2 }
      function main(n) { return { v: double(n) + 1 } }`,
      /cannot be called inside an expression/
    )
  })

  it('supports recursion (bounded by fuel/timeout, not rejected)', async () => {
    // Recursive factorial — by-reference dispatch makes this a runtime loop.
    const result = await run(
      `
      function fact(n) {
        if (n <= 1) { return 1 }
        const prev = fact(n - 1)
        return n * prev
      }
      function main(n) {
        const f = fact(n)
        return { f }
      }`,
      { n: 5 }
    )
    expect(result.f).toBe(120)
  })

  it('supports mutual recursion', async () => {
    const result = await run(
      `
      function isEven(n) {
        if (n == 0) { return true }
        const r = isOdd(n - 1)
        return r
      }
      function isOdd(n) {
        if (n == 0) { return false }
        const r = isEven(n - 1)
        return r
      }
      function main(n) {
        const even = isEven(n)
        return { even }
      }`,
      { n: 10 }
    )
    expect(result.even).toBe(true)
  })

  it('turns runaway recursion into a clean error, not a host crash', async () => {
    // Unbounded recursion: must surface as a monadic error (depth cap or fuel),
    // never a thrown RangeError that crashes the host VM.
    const out = await VM.run(
      ajs(`
      function loop(n) { const r = loop(n); return r }
      function main(n) { const v = loop(n); return { v } }`),
      { n: 1 },
      { fuel: 100000 }
    )
    expect(out.error).toBeDefined()
    expect(out.error?.message).toMatch(/depth|fuel/i)
  })

  it('rejects arity mismatches', () => {
    expectTranspileError(
      `
      function add(a, b) { return a + b }
      function main(n) { const v = add(n); return { v } }`,
      /expects 2 argument\(s\), got 1/
    )
  })

  it('rejects same-name same-arity functions (collision)', () => {
    // Two identical-signature `dup` declarations collide. The polymorphic-merge
    // pass (which runs during parse, before helper extraction) catches this
    // first — either way it's a clear, deterministic rejection.
    expectTranspileError(
      `
      function dup(x) { return x }
      function dup(x) { return x }
      function main(n) { const v = dup(n); return { v } }`,
      /ambiguous signatures|Duplicate helper/
    )
  })

  it('still transpiles a single-function agent (no helpers)', async () => {
    const result = await run(`function main(n) { return { n } }`, { n: 9 })
    expect(result.n).toBe(9)
  })
})
