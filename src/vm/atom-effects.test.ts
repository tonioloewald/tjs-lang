import { describe, it, expect } from 'bun:test'
import { coreAtoms, EFFECTFUL_CORE_OPS, type AtomDef } from './runtime'
import { batteryAtoms } from './atoms/index'

const allAtoms = { ...coreAtoms, ...batteryAtoms } as Record<string, AtomDef>

describe('atom effects classification (predicate-safety keystone)', () => {
  it('every atom is classified pure | io', () => {
    for (const [op, atom] of Object.entries(allAtoms)) {
      expect(atom.effects, `${op} has no effects tag`).toMatch(/^(pure|io)$/)
    }
  })

  it('the declared effectful core ops are all tagged io', () => {
    // NOTE: this one is CIRCULAR and is kept only as a wiring check — it iterates
    // EFFECTFUL_CORE_OPS, the same constant that assigns the tag, so it proves the list
    // agrees with itself and cannot fail on an OMISSION. That is how `xmlParse` sat tagged
    // `pure` while calling `ctx.capabilities.xml.parse(...)` for two releases.
    //
    // The test that can actually fail is `atom-effects-scan.test.ts`, which reads each
    // atom's BODY and asks whether the tag matches what it does. Add new atoms there.
    for (const op of EFFECTFUL_CORE_OPS) {
      expect(coreAtoms[op as keyof typeof coreAtoms]?.effects, op).toBe('io')
    }
  })

  it('every battery atom is io (network calls)', () => {
    for (const atom of Object.values(batteryAtoms) as AtomDef[]) {
      expect(atom.effects, atom.op).toBe('io')
    }
  })

  it('the pure substrate a predicate relies on is tagged pure', () => {
    // data / control-flow atoms predicates compose from
    const pure = [
      'map',
      'filter',
      'reduce',
      'find',
      'len',
      'split',
      'join',
      'keys',
      'pick',
      'omit',
      'merge',
      'regexMatch',
      'jsonParse',
      'callLocal',
      'if',
      'while',
      'return',
      'scope',
    ]
    for (const op of pure) {
      expect(coreAtoms[op as keyof typeof coreAtoms]?.effects, op).toBe('pure')
    }
  })

  it('the IO atoms are exactly the ones that may not appear in a predicate', () => {
    const io = Object.values(allAtoms)
      .filter((a) => a.effects === 'io')
      .map((a) => a.op)
    // sanity: the capability-touching atoms are all present
    expect(io).toEqual(
      expect.arrayContaining([
        'httpFetch',
        'storeGet',
        'llmPredict',
        'agentRun',
        'runCode',
        'llmVision',
      ])
    )
    // and none of the pure data ops leaked in
    expect(io).not.toContain('map')
    expect(io).not.toContain('jsonParse')
  })
})
