import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { maskLiterals } from '../strip-comments'
import { AgentVM } from './vm'

/**
 * Every binding into guest scope goes through `setStateVar`.
 *
 * Two guards belong together and were applied separately, so each was present at some
 * sites and absent at others: `assertSafeProperty` (a variable named `__proto__` would
 * mutate the scope object's prototype) and `trackHeapWrite` (the `maxHeapBytes` ceiling).
 *
 * `varSet`/`constSet` had both. `varsLet` and `varsImport` — the two atoms whose entire
 * job is binding variables — had only the first, so the heap ceiling was bypassed
 * completely: verified, a 40MB argument bound under a 1KB cap. The loop binds and the
 * catch binding had neither.
 *
 * Nobody decided `varsLet` should be exempt. The accounting was added to the two atoms
 * someone happened to be looking at, which is the same "fixed in X, twin kept the bug"
 * shape as the membrane, the vision probe, and the fifteen literal scanners. So the
 * invariant is mechanised rather than remembered.
 */
describe('state writes are funnelled through one guarded helper', () => {
  // Comments and strings blanked, so the prose in `setStateVar`'s own doc comment
  // explaining what a bare `ctx.state[…] =` looks like does not count as one.
  const source = maskLiterals(
    readFileSync(join(import.meta.dir, 'runtime.ts'), 'utf-8')
  )

  it('has no bare state assignment outside setStateVar', () => {
    const lines = source.split('\n')
    const helperStart = lines.findIndex((l) =>
      l.includes('function setStateVar')
    )
    expect(helperStart, 'setStateVar must exist').toBeGreaterThan(-1)
    const helperEnd = lines.findIndex((l, i) => i > helperStart && l === '}')

    const offenders: string[] = []
    lines.forEach((line, i) => {
      if (i >= helperStart && i <= helperEnd) return // the helper itself
      // `ctx.state[x] = …` / `scopedCtx.state[x] = …`, but not `==`/`===` comparisons.
      if (/\bstate\[[^\]]+\]\s*=(?!=)/.test(line)) {
        offenders.push(`runtime.ts:${i + 1}: ${line.trim()}`)
      }
    })

    expect(
      offenders,
      'bind through setStateVar(ctx, key, value, op) — it applies BOTH the ' +
        'prototype-pollution guard and the heap ceiling, which is the pairing that ' +
        'kept coming apart'
    ).toEqual([])
  })

  it('the scan is not vacuously passing', () => {
    // A regex that matched nothing would make the check above trivially true.
    expect(source).toMatch(/function setStateVar/)
    expect(source.match(/setStateVar\(/g)?.length ?? 0).toBeGreaterThan(8)
  })
})

describe('the heap ceiling covers every binding atom', () => {
  const VM = new AgentVM()
  const big = 'x'.repeat(40 * 1024 * 1024)

  const BINDERS: Array<[string, any[], Record<string, unknown>]> = [
    [
      'varSet',
      [{ op: 'varSet', key: 'huge', value: { $kind: 'arg', path: 'big' } }],
      { big },
    ],
    [
      'constSet',
      [{ op: 'constSet', key: 'huge', value: { $kind: 'arg', path: 'big' } }],
      { big },
    ],
    // These two bypassed it entirely — 40MB bound under a 1KB cap, no error.
    [
      'varsLet',
      [{ op: 'varsLet', huge: { $kind: 'arg', path: 'big' } }],
      { big },
    ],
    ['varsImport', [{ op: 'varsImport', keys: ['big'] }], { big }],
  ]

  for (const [name, steps, args] of BINDERS) {
    it(`${name} respects maxHeapBytes`, async () => {
      const res = await VM.run(
        { op: 'seq', steps: [...steps, { op: 'return', value: {} }] } as any,
        args as any,
        { fuel: 1000, maxHeapBytes: 1024 }
      )
      expect(res.error?.message, `${name} bound 40MB under a 1KB cap`).toMatch(
        /Heap limit exceeded/
      )
    })
  }
})
