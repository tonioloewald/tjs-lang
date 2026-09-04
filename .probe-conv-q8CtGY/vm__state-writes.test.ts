/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync } from 'fs'

import { join } from 'path'

import { maskLiterals } from '/Users/tonioloewald/tjs-lang/src/strip-comments'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

describe('state writes are funnelled through one guarded helper', () => {
  const source = maskLiterals(
    readFileSync(
      join('/Users/tonioloewald/tjs-lang/src/vm', 'runtime.ts'),
      'utf-8'
    )
  )
  it('has no bare state assignment outside setStateVar', () => {
    const lines = source.split('\n')
    const helperStart = lines.findIndex((l) =>
      l.includes('function setStateVar')
    )
    expect(helperStart, 'setStateVar must exist').toBeGreaterThan(-1)
    const helperEnd = lines.findIndex((l, i) => i > helperStart && l === '}')
    const offenders = []
    lines.forEach((line, i) => {
      if (i >= helperStart && i <= helperEnd) return

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
    expect(source).toMatch(/function setStateVar/)
    expect(source.match(/setStateVar\(/g)?.length ?? 0).toBeGreaterThan(8)
  })
})
export {}

describe('child scopes own and release their heap ledger', () => {
  const source = maskLiterals(
    readFileSync(
      join('/Users/tonioloewald/tjs-lang/src/vm', 'runtime.ts'),
      'utf-8'
    )
  )
  const lines = source.split('\n')
  const callsTo = (name) =>
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
    if (i > defLine && i < defLine + 12) return []
    const block = lines.slice(i, i + 20).join('\n')
    return /\bstate:/.test(block) ? [{ line: i + 1, block }] : []
  })
  it('every child scope is released exactly once', () => {
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
export {}

describe('the heap ceiling covers every binding atom', () => {
  const VM = new AgentVM()
  const big = 'x'.repeat(40 * 1024 * 1024)
  const BINDERS = [
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
        { op: 'seq', steps: [...steps, { op: 'return', value: {} }] },
        args,
        { fuel: 1000, maxHeapBytes: 1024 }
      )
      expect(res.error?.message, `${name} bound 40MB under a 1KB cap`).toMatch(
        /Heap limit exceeded/
      )
    })
  }
})
