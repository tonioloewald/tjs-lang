/**
 * The LLM batteries' output schema is OPEN with named fields (tosijs-schema `.open`, adopted
 * with ^1.12.0 — tjs-lang board #2117). It used to be `s.record(s.any)`: open, but it said
 * nothing about the fields and rejected nothing. Pinned both ways: newer provider fields pass,
 * a WRONG type in a named field fails.
 */
import { describe, it, expect } from 'bun:test'
import { validate } from 'tosijs-schema'
import { batteryAtoms } from './index'

describe('LLM battery output: named fields, open to additions', () => {
  for (const op of ['llmPredictBattery', 'llmVision'] as const) {
    const schema = (batteryAtoms as any)[op].outputSchema
    it(`${op} accepts a provider's extra fields (reasoning_content) and a null content`, () => {
      expect(
        validate(
          { role: 'assistant', content: 'hi', reasoning_content: '…' },
          schema
        )
      ).toBe(true)
      expect(validate({ role: 'assistant', content: null }, schema)).toBe(true)
      expect(
        validate({ role: 'assistant', tool_calls: [{ id: 'x' }] }, schema)
      ).toBe(true)
    })
    it(`${op} rejects a wrong type in a named field (record(any) never could)`, () => {
      expect(validate({ role: 5, content: 'hi' }, schema)).toBe(false)
      expect(validate({ tool_calls: 'not an array' }, schema)).toBe(false)
      expect(validate('a bare string', schema)).toBe(false)
    })
  }
})
