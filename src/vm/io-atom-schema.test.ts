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
