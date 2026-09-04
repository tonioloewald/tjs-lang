/**
 * The two `transpile()` entry points must agree on the input contract.
 *
 * `src/lang/core.ts` and `src/lang/index.ts` each export a `transpile`, and they are the
 * roots of two different published bundles — `tjs-lang/lang` (via `transpiler.ts` → `core`)
 * and `tjs-lang` (via `index`). They are hand-maintained parallel implementations, and on
 * 2026-09-04 they had drifted one line apart: `core` forwarded `requiredValueOffsets`,
 * `index` did not.
 *
 * That single line produced OPPOSITE contracts for the documented AJS entry shape:
 *
 *     function agent({ apiKey: 'sk-example' }) { return { apiKey } }
 *
 *     tjs-lang        -> required: ['apiKey'];  vm.run(ast, {}) rejects        ✓
 *     tjs-lang/lang   -> no required;           vm.run(ast, {}) returns
 *                                               { apiKey: 'sk-example' }        ✗
 *
 * The failure is not a missing warning — it is the EXAMPLE VALUE, credential-shaped for a
 * parameter called `apiKey`, silently substituted for an input the caller never supplied.
 * The cause was in `emitters/ast.ts`: the offsets branch inspected only top-level
 * `AssignmentPattern` params, so an `ObjectPattern` matched nothing, and because the branch
 * was an `else if` the name-based fallback was skipped too.
 *
 * This file asserts the PROPERTY (the two agree) rather than the fix, so it keeps holding if
 * the duplication is ever collapsed into one implementation — which is the real remedy and
 * remains open in TODO.md.
 */
import { describe, it, expect } from 'bun:test'
import { transpile as transpileCore } from './core'
import { transpile as transpileIndex } from './index'
import { AgentVM } from '../vm'

const SHAPES: Array<[string, string]> = [
  [
    'destructured required member (the documented AJS entry shape)',
    `function agent({ apiKey: 'sk-example' }) { return { apiKey } }`,
  ],
  [
    'destructured optional member',
    `function agent({ limit = 10 }) { return { limit } }`,
  ],
  [
    'destructured mixed required + optional',
    `function agent({ query: 'q', limit = 10 }) { return { query, limit } }`,
  ],
  ['top-level required param', `function f(n: 0) { return { n } }`],
  ['top-level optional param', `function f(n = 3) { return { n } }`],
  ['no params', `function f() { return { ok: 1 } }`],
]

describe('the two transpile() entry points agree', () => {
  for (const [label, src] of SHAPES) {
    it(`${label}: same inputSchema.required`, () => {
      const a = (transpileCore(src).ast as any)?.inputSchema?.required
      const b = (transpileIndex(src).ast as any)?.inputSchema?.required
      expect({ core: a }).toEqual({ core: b })
    })
  }

  it('a missing required input is REJECTED, never filled from the example', async () => {
    // The consequence, asserted directly rather than via the schema — this is what a
    // consumer actually experiences, and it is the reason the drift mattered.
    const src = `function agent({ apiKey: 'sk-example' }) { return { apiKey } }`
    const vm = new AgentVM()
    for (const [name, t] of [
      ['core', transpileCore],
      ['index', transpileIndex],
    ] as const) {
      const out: any = await vm.run(t(src).ast, {}, { fuel: 200 })
      expect({ [name]: out.error !== undefined }).toEqual({ [name]: true })
      expect(out.result?.apiKey).not.toBe('sk-example')
    }
  })

  it('a supplied input still flows through both', async () => {
    // The floor. Two entry points that rejected everything would satisfy the above.
    const src = `function agent({ apiKey: 'sk-example' }) { return { apiKey } }`
    const vm = new AgentVM()
    for (const t of [transpileCore, transpileIndex]) {
      const out: any = await vm.run(
        t(src).ast,
        { apiKey: 'real' },
        { fuel: 200 }
      )
      expect(out.result).toEqual({ apiKey: 'real' })
    }
  })
})
