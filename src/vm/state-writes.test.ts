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

/**
 * Every child scope owns its heap ledger, and gives it back.
 *
 * The ledger used to be shared by reference across scopes and keyed by bare variable
 * NAME, so a child binding `x` was accounted as REPLACING the parent's `x` while the
 * parent's value stayed live. Shadowing freed budget: 112× over a 6MB cap, reachable from
 * ordinary transpiled AJS because the guest names the `as` variable.
 *
 * Two halves have to stay together, which is exactly the pairing this file already exists
 * to mechanise for `setStateVar`:
 *
 *   - a fresh `heapPerKey` per scope, or shadowing frees budget (a BYPASS)
 *   - a `releaseScope` when it is discarded, or accounting leaks (a false positive)
 *
 * `callLocal` is why this is a source scan rather than a note. It builds its scope by
 * hand instead of calling `createChildScope`, so it silently kept the shared ledger after
 * `createChildScope` was fixed — the same "fixed in X, twin kept the bug" shape as
 * `varsLet`, the membrane, and the fifteen literal scanners.
 */
describe('child scopes own and release their heap ledger', () => {
  // Comments and string contents blanked, so the prose above — which names both helpers
  // and quotes the required override — cannot satisfy the checks it describes.
  const source = maskLiterals(
    readFileSync(join(import.meta.dir, 'runtime.ts'), 'utf-8')
  )

  const lines = source.split('\n')

  const callsTo = (name: string) =>
    // Definition sites (`function name(`) are not calls.
    (source.match(new RegExp(`(?<!function )\\b${name}\\(`, 'g')) ?? [])
      .length -
    (source.match(new RegExp(`function ${name}\\(`, 'g')) ?? []).length

  /**
   * A `{ ...ctx, … state: … }` object literal is a child scope by another name, and the
   * spread shares `heapPerKey` by reference. `createChildScope`'s own body is one of
   * these and is excluded: it hands the scope to a caller, who owns the release.
   */
  const defLine = lines.findIndex((l) =>
    l.includes('function createChildScope')
  )
  const handBuilt = lines.flatMap((line, i) => {
    if (!/\.\.\.ctx\b/.test(line)) return []
    if (i > defLine && i < defLine + 12) return [] // createChildScope itself
    const block = lines.slice(i, i + 20).join('\n')
    return /\bstate:/.test(block) ? [{ line: i + 1, block }] : []
  })

  it('every child scope is released exactly once', () => {
    // Count SCOPE SITES, not `createChildScope` calls: three of them are hand-built and
    // do not go through the helper, which is precisely how `callLocal` kept the shared
    // ledger after the helper was fixed.
    const sites = callsTo('createChildScope') + handBuilt.length
    expect(
      sites,
      'the scan found no child scopes — apparatus failure'
    ).toBeGreaterThan(6)
    expect(
      `${sites} scopes / ${callsTo('releaseScope')} released`,
      'an unreleased scope leaks accounting until an unrelated program trips a ' +
        'ceiling it is nowhere near'
    ).toBe(`${sites} scopes / ${sites} released`)
  })

  it('a hand-built child scope gets its own ledger', () => {
    expect(
      handBuilt.length,
      'apparatus: hand-built scopes exist'
    ).toBeGreaterThan(0)
    const offenders = handBuilt
      .filter(({ block }) => !/heapPerKey(:|\s*=)/.test(block))
      .map(({ line }) => `runtime.ts:${line}`)
    expect(
      offenders,
      'a hand-built child scope must set `heapPerKey: new Map()`, or shadowing a ' +
        "caller's variable frees its budget — see callLocal"
    ).toEqual([])
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
