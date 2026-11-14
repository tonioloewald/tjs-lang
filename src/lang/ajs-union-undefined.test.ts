/**
 * A literal-union member of an AJS contract refuses `undefined` (#4100, a 0.14.0 blocker).
 *
 * `label: 'low' | 'high'` emitted `{ enum: ['low', 'high'] }` with no `type`. The member was
 * required, but a key holding `undefined` counts as present, and the validator skips an enum for
 * an undefined value, so `{ score: 12, label: undefined }` met the declared result and the key
 * vanished when the result became JSON: a contract violation the host never heard about. The
 * same hole admitted `{ label: undefined }` as an argument. `label: ''` was always refused,
 * because it carries `type: 'string'`; a literal union now carries its type too.
 *
 * Guarded both ways: the declared values, and `| undefined` (optional), still work.
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './core'
import { AgentVM } from '../vm/ast'

const run = (src: string, args: Record<string, unknown> = {}) =>
  new AgentVM().run(transpile(src).ast, args, { fuel: 1000 })

const RESULT = `function score({ n = 12, which = 'none' }): { score: 0, label: 'low' | 'high' } {
  let o = { a: 1 }
  if (which == 'low') { return { score: n, label: 'low' } }
  if (which == 'typo') { return { score: n, label: o.typo } }
  return { score: n, label: undefined }
}`

describe('a declared result', () => {
  it('refuses undefined for a literal-union member', async () => {
    const r = await run(RESULT)
    expect(r.error?.message).toMatch(/declared result type/)
  })
  it('refuses a misspelt read that yields undefined', async () => {
    const r = await run(RESULT, { which: 'typo' })
    expect(r.error?.message).toMatch(/declared result type/)
  })
  it('accepts a declared value', async () => {
    const r = await run(RESULT, { which: 'low' })
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ score: 12, label: 'low' })
  })
  it('a mixed literal union keeps each value and refuses undefined', async () => {
    const src = `function f({ v = 'a' }): { x: 'a' | 1 | true } { if (v == 'u') { return { x: undefined } } \n if (v == 'n') { return { x: 1 } } \n return { x: 'a' } }`
    expect((await run(src)).result).toEqual({ x: 'a' })
    expect((await run(src, { v: 'n' })).result).toEqual({ x: 1 })
    expect((await run(src, { v: 'u' })).error?.message).toMatch(
      /declared result type/
    )
  })
})

describe('a declared input', () => {
  const INPUT = `function f({ label: 'low' | 'high' }) { return { label } }`
  it('refuses { label: undefined }', async () => {
    const r = await run(INPUT, { label: undefined })
    expect(r.error?.message).toMatch(/Input validation failed/)
  })
  it('refuses a value outside the union', async () => {
    expect((await run(INPUT, { label: 'mid' })).error).toBeDefined()
  })
  it('accepts a declared value', async () => {
    expect((await run(INPUT, { label: 'high' })).result).toEqual({
      label: 'high',
    })
  })
})

describe('| undefined still means optional (the other direction)', () => {
  it("a result member written 'a' | 'b' | undefined may be absent", async () => {
    const r = await run(
      `function f({}): { x: 'a' | 'b' | undefined, y: 0 } { return { y: 1 } }`
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ y: 1 })
  })
})
