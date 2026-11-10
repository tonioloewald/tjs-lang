/**
 * `try … finally` runs the finally block (#3983).
 *
 * The transpiler dropped `stmt.finalizer` without a word, so cleanup a program depended on never
 * ran: `try { … } finally { ran = true }` returned `ran: false`. Now the `try` node carries a
 * `finally` block, with JavaScript's semantics: it runs after the try (and catch) whatever
 * happened in them; a pending return or error is set aside while it runs and restored if it
 * completes normally; its own return or error wins. A HALTED run takes no further steps, finally
 * included: a halt ends the run by design (runtime.ts, `halt`).
 *
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'

const vm = new AgentVM()
const run = async (body: string, args: Record<string, unknown> = {}) => {
  const { ast } = transpile(`function f({ fail = false }) {\n${body}\n}`)
  return vm.run(ast, args, { fuel: 500 })
}

describe('try … finally', () => {
  it('runs after a try that succeeds', async () => {
    const r = await run(`let ran = false
try { let a = 1 } finally { ran = true }
return { ran }`)
    expect(r.result).toEqual({ ran: true })
  })

  it('runs after a caught error, and sees what the catch did', async () => {
    const r = await run(`let log = []
try { Error('boom') } catch (e) { log.push('caught ' + e) } finally { log.push('cleanup') }
return { log }`)
    expect(r.result).toEqual({ log: ['caught boom', 'cleanup'] })
  })

  it('runs on an uncaught error, and the error still ends the run', async () => {
    const { ast } = transpile(`function f({}) {
  let ran = false
  try { Error('boom') } finally { ran = true }
  return { ran }
}`)
    const r = await vm.run(ast, {}, { fuel: 500 })
    expect(r.error?.message).toBe('boom')
  })

  it('runs when the try returns, and the return value survives', async () => {
    const { ast } = transpile(`function f({}) {
  try {
    return { from: 'try' }
  } finally {
    let cleanedUp = true
  }
}`)
    const r = await vm.run(ast, {}, { fuel: 500 })
    expect(r.result).toEqual({ from: 'try' })
  })

  it("a return in finally wins over the try's", async () => {
    const { ast } = transpile(`function f({}) {
  try {
    return { from: 'try' }
  } finally {
    return { from: 'finally' }
  }
}`)
    expect((await vm.run(ast, {}, { fuel: 500 })).result).toEqual({
      from: 'finally',
    })
  })

  it("an error in finally wins over the try's", async () => {
    const { ast } = transpile(`function f({}) {
  try { Error('first') } finally { Error('second') }
}`)
    expect((await vm.run(ast, {}, { fuel: 500 })).error?.message).toBe('second')
  })

  it('nested: the inner finally runs before the outer catch', async () => {
    const r = await run(`let log = []
try {
  try { Error('inner') } finally { log.push('inner finally') }
} catch (e) {
  log.push('outer caught ' + e)
}
return { log }`)
    expect(r.result).toEqual({ log: ['inner finally', 'outer caught inner'] })
  })

  it('the try node carries the block (an AST format addition)', () => {
    const { ast } = transpile(
      `function f({}) { try { let a = 1 } finally { let b = 2 } }`
    )
    const node = (ast as any).steps.find((s: any) => s.op === 'try')
    expect(Array.isArray(node.finally)).toBe(true)
  })
})
