/**
 * Assignment means what it means in JavaScript (tjs-lang#59, board #2700 — found by
 * tosijs-platform assessing AJS for render-on-store).
 *
 * Two defects, both SILENT wrong answers, the worst kind in a language whose other refusals
 * are loud:
 *
 * 1. Every compound assignment stored only its right-hand side (`n -= 2` → 2, `s += 'b'` →
 *    'b'), and `i++` / `i--` as a statement were dropped with only a warning.
 * 2. An assignment to an OUTER variable inside a `for…of` body was lost: the body runs in a
 *    child scope, and assignment and declaration compiled to the same step, which always
 *    wrote to the current scope — so `s = s + w` created a shadow that died with the
 *    iteration. (It worked in `while`, whose body is not a scope.)
 *
 * The fix: compound and update operators lower to `x = x op y`, and assignment compiles to
 * `varAssign`, which writes to the scope that OWNS the binding and charges that scope's
 * heap ledger. Declarations still compile to `varSet`/`constSet`.
 */
import { describe, it, expect } from 'bun:test'
import { Eval } from '../lang/eval'
import { transpile } from '../lang/core'

const run = async (code: string) => {
  const r = await Eval({ code, fuel: 100_000 })
  return r.error ? { error: r.error.message } : r.result
}

describe('assignment semantics (#59)', () => {
  const table: Array<[string, unknown]> = [
    // compound assignment
    [`let s = 'a'; s += 'b'; return s`, 'ab'],
    [`let n = 5; n -= 2; return n`, 3],
    [`let n = 5; n *= 3; return n`, 15],
    [`let n = 9; n /= 3; return n`, 3],
    [`let n = 7; n %= 4; return n`, 3],
    [`let n = 2; n **= 3; return n`, 8],
    [`let a = null; a ??= 4; return a`, 4],
    [`let a = 1; a ??= 4; return a`, 1],
    [`let b = 0; b ||= 9; return b`, 9],
    [`let b = 2; b ||= 9; return b`, 2],
    [`let c = 1; c &&= 6; return c`, 6],
    [`let c = 0; c &&= 6; return c`, 0],
    // update expressions as statements
    [`let i = 1; i++; return i`, 2],
    [`let i = 1; i--; return i`, 0],
    [`let i = 1; ++i; return i`, 2],
    // outer reassignment from a for…of body
    [`let s = ''; for (const w of ['a','b']) { s = s + w } return s`, 'ab'],
    [`let s = ''; for (const w of ['a','b']) { s += w } return s`, 'ab'],
    [
      `let t = 0; for (const v of [1,2,3]) { let u = v * 2; t = t + u } return t`,
      12,
    ],
    [
      `let n = 0; for (const a of [1,2]) { for (const b of [10,20]) { n += a * b } } return n`,
      90,
    ],
    // controls that already worked keep working
    [
      `let s = ''; let i = 0; while (i < 2) { s = s + 'x'; i = i + 1 } return s`,
      'xx',
    ],
    [`let s = ''; if (true) { s = 'y' } return s`, 'y'],
    [
      `let out = []; for (const w of ['a','b']) { out.push(w) } return out.join('')`,
      'ab',
    ],
    // a body-local declaration shadows; it does not leak
    [`let x = 1; for (const v of [5]) { let x = v } return x`, 1],
  ]
  for (const [code, expected] of table)
    it(code, async () => {
      expect(await run(code)).toEqual(expected)
    })

  it('assigning an outer const from a loop body is refused', async () => {
    const r = await run(`const k = 1; for (const v of [2]) { k = v } return k`)
    expect(r).toEqual({
      error: expect.stringMatching(/Cannot reassign const variable 'k'/),
    })
  })

  it('an update expression used as a VALUE is refused loudly, not miscompiled', () => {
    expect(() =>
      transpile(`function f() { let i = 1; let j = i++; return { j } }`)
    ).toThrow(/\+\+|update/i)
  })
})

describe('varAssign and the heap ceiling', () => {
  // An assignment from a loop body writes the OWNER scope, so it must be charged to the
  // owner's ledger: not the body's, which `releaseScope` empties at the end of every
  // iteration (that would hand the guest the budget back), and not nowhere.
  const { AgentVM } = require('../vm/vm')
  const runAjs = async (code: string, maxHeapBytes: number) => {
    const { ast } = transpile(code)
    const r = await new AgentVM().run(
      ast,
      {},
      { fuel: 1_000_000, maxHeapBytes }
    )
    return r.error ? { error: r.error.message } : r.result
  }
  const grow = (rounds: number) => `function f() {
      let s = ''
      for (const i of ${JSON.stringify(
        Array.from({ length: rounds }, (_, i) => i)
      )}) {
        s = s + 'x'.repeat(10000)
      }
      return { n: s.length }
    }`

  it('an outer string grown from a loop body is held to the ceiling', async () => {
    // ~200 × 10KB chars (≥ 2MB) against a 1MB ceiling.
    expect(await runAjs(grow(200), 1024 * 1024)).toEqual({
      error: expect.stringMatching(/heap|memory|limit/i),
    })
  })

  it('the same loop well under the ceiling is not refused (no false trip, no double count)', async () => {
    expect(await runAjs(grow(20), 4 * 1024 * 1024)).toEqual({ n: 200_000 })
  })

  it("the body's scope ending does not free what the outer variable still holds", async () => {
    // Grow `s` to ~1.2MB from inside a loop, then bind ANOTHER 1.2MB at the top: 2.4MB live
    // under a 2MB ceiling must fail. If the loop's release had freed s's bytes, it passed.
    const code = `function f() {
      let s = ''
      for (const i of ${JSON.stringify(
        Array.from({ length: 60 }, (_, i) => i)
      )}) {
        s = s + 'x'.repeat(10000)
      }
      let t = 'y'.repeat(600000)
      return { n: s.length + t.length }
    }`
    expect(await runAjs(code, 2 * 1024 * 1024)).toEqual({
      error: expect.stringMatching(/heap|memory|limit/i),
    })
  })
})
