/**
 * An IO atom's input schema is checked when the atom is DEFINED (Tonio, 2026-10-04): it must
 * exist, and it may not contain a regex. The outbound membrane validates every call against it,
 * so a missing schema meant "copied, never checked", and a `pattern` ran on the host's regex engine
 * over guest-chosen strings, outside fuel. Refused at registration so the host hears about it
 * before any guest runs.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { defineAtom, coreAtoms, type AtomDef } from './runtime'
import { batteryAtoms } from './atoms'
import { AgentVM } from './vm'
import { transpile } from '../lang/core'

const body = async () => 1

describe('IO atom input schemas, refused at defineAtom', () => {
  it('no input schema', () => {
    expect(() => defineAtom('noSchema', undefined, s.any, body)).toThrow(
      /declares no input schema/
    )
  })

  it('a pure atom may still omit it (its input never leaves the VM)', () => {
    expect(() =>
      defineAtom('pureNoSchema', undefined, s.any, body, { effects: 'pure' })
    ).not.toThrow()
  })

  it('s.object({}) declares "takes nothing"', () => {
    expect(() => defineAtom('none', s.object({}), s.any, body)).not.toThrow()
  })

  const withRegex: Array<[string, unknown]> = [
    ['a builder pattern', s.object({ id: s.string.pattern('^(a+)+$') })],
    [
      'a JSON Schema pattern, nested',
      {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'string', pattern: 'x+' } },
        },
      },
    ],
    [
      'patternProperties',
      { type: 'object', patternProperties: { '^a': { type: 'string' } } },
    ],
    [
      'inside anyOf',
      { anyOf: [{ type: 'number' }, { type: 'string', pattern: 'y' }] },
    ],
  ]
  for (const [label, schema] of withRegex) {
    it(`a regex: ${label}`, () => {
      expect(() => defineAtom('withRegex', schema, s.any, body)).toThrow(
        /uses a regex/
      )
    })
  }

  // Cumulative review 7: round 32 refused `pattern` only as a STRING, so a RegExp passed and ran
  // on the host engine. Presence is refused, whatever the value, at every schema position.
  const re = /^(a+)+$/
  const presence: Array<[string, unknown]> = [
    ['pattern: RegExp', { type: 'string', pattern: re }],
    [
      'pattern: an object with toString',
      { type: 'string', pattern: { toString: () => 'x+' } },
    ],
    ['under items', { type: 'array', items: { type: 'string', pattern: re } }],
    ['under anyOf', { anyOf: [{ type: 'string', pattern: re }] }],
    ['under $defs', { $defs: { s: { type: 'string', pattern: re } } }],
    [
      'under additionalProperties',
      { type: 'object', additionalProperties: { type: 'string', pattern: re } },
    ],
    [
      'a nested builder',
      { type: 'object', properties: { id: s.string.pattern('^(a+)+$') } },
    ],
  ]
  for (const [label, schema] of presence) {
    it(`a regex keyword ${label}`, () => {
      expect(() => defineAtom('withRegex', schema, s.any, body)).toThrow(
        /uses a regex/
      )
    })
  }

  const notJson: Array<[string, unknown, RegExp]> = [
    [
      'a RegExp in a data-free spot',
      { type: 'string', minLength: /x/ },
      /RegExp/,
    ],
    [
      'a class instance',
      { type: 'string', x: new (class Thing {})() },
      /Thing/,
    ],
    [
      'an accessor',
      Object.defineProperty({ type: 'string' }, 'maxLength', {
        get: () => 3,
        enumerable: true,
      }),
      /accessor/,
    ],
    ['a function', { type: 'string', x: () => 1 }, /function/],
  ]
  for (const [label, schema, why] of notJson) {
    it(`a non-JSON value is refused, not converted: ${label}`, () => {
      expect(() => defineAtom('notJson', schema, s.any, body)).toThrow(why)
    })
  }

  it('a cyclic schema is refused', () => {
    const cyclic: any = { type: 'object', properties: {} }
    cyclic.properties.self = cyclic
    expect(() => defineAtom('loopy', cyclic, s.any, body)).toThrow(/is cyclic/)
  })

  it('a dependentRequired or dependencies NAME called pattern is not the keyword', () => {
    const schema = {
      type: 'object',
      properties: { pattern: { type: 'string' }, flags: { type: 'string' } },
      dependentRequired: { pattern: ['flags'] },
      dependencies: { pattern: { required: ['flags'] } },
    }
    expect(() =>
      defineAtom('depsNamedPattern', schema, s.any, body)
    ).not.toThrow()
  })

  it('a PROPERTY named pattern is not the keyword', () => {
    const schema = {
      type: 'object',
      properties: { pattern: { type: 'string' }, patternProperties: {} },
      default: { pattern: 'not a schema' },
    }
    expect(() =>
      defineAtom('fieldNamedPattern', schema, s.any, body)
    ).not.toThrow()
  })

  it('every core and battery IO atom passes (apparatus: the rule is not vacuous)', () => {
    const all: Record<string, AtomDef> = {
      ...(coreAtoms as Record<string, AtomDef>),
      ...(batteryAtoms as Record<string, AtomDef>),
    }
    const io = Object.values(all).filter((a) => a.effects === 'io')
    expect(io.length).toBeGreaterThan(20)
    for (const a of io) expect(a.inputSchema).toBeDefined()
  })
})

describe('the admitted copy is the only schema a call is validated against (review 7)', () => {
  it('changing atom.inputSchema after definition changes nothing', async () => {
    let received: any
    const probe = defineAtom(
      'probe',
      s.object({ x: s.string }),
      s.any,
      async (input: any) => {
        received = input.x
        return { ok: true }
      }
    )
    // the host (or anything holding the atom) swaps in a schema with a catastrophic pattern
    ;(probe as any).inputSchema = {
      type: 'object',
      properties: { x: { type: 'string', pattern: '^(a+)+$' } },
    }
    const r = await new AgentVM({ probe }).run(
      transpile(`function f() { return probe({ x: 'aaaab' }) }`, {
        atoms: { probe },
      } as any).ast,
      {},
      { fuel: 1000 }
    )
    expect(r.error).toBeUndefined()
    expect(received).toBe('aaaab')
  })

  it('an atom tagged io AFTER definition is admitted at its first call, and refused if it cannot be', async () => {
    let calls = 0
    const late = defineAtom(
      'late',
      undefined,
      s.any,
      async () => {
        calls++
        return { ok: true }
      },
      { effects: 'pure' }
    )
    ;(late as any).effects = 'io'
    const r = await new AgentVM({ late }).run(
      transpile(`function f() { return late({}) }`, {
        atoms: { late },
      } as any).ast,
      {},
      { fuel: 1000 }
    )
    expect(r.error?.message).toMatch(/declares no input schema/)
    expect(calls).toBe(0)
  })
})
