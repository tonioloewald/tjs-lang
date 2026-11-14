/**
 * An AJS input-validation refusal names the field that failed (2026-11-14). It said only
 * "args do not match expected schema", so a host could not tell which argument was wrong.
 * The message keeps that prefix (hosts match on it) and appends the first failure.
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'

const ast = transpile(
  "function f({ item: 'mug', qty: 1 }) { return { item, qty } }"
).ast
const refusal = async (args: Record<string, unknown>) =>
  (await new AgentVM().run(ast, args, { fuel: 100 })).error?.message

describe('the refusal names the field', () => {
  it('a value of the wrong type', async () => {
    expect(await refusal({ item: 'mug', qty: 'two' })).toMatch(
      /^Input validation failed: .*\(qty: Expected integer\)/
    )
  })
  it('a missing argument', async () => {
    expect(await refusal({ qty: 1 })).toMatch(/Missing item/)
  })
  it('good arguments run (the other direction)', async () => {
    expect(await refusal({ item: 'mug', qty: 2 })).toBeUndefined()
  })
})
