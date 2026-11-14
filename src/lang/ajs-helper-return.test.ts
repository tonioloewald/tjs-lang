/**
 * An AJS helper's declared result is enforced, as the entry's is (decided 2026-11-14: "if you
 * define your function to emit X we should verify we do or emit an error"). `h(x): ''` was
 * accepted and ignored. A mismatch raises an Error naming the helper (catchable, like any
 * Error); a callback's own `return` inside the helper is not checked against it; a helper with
 * no annotation is unchanged. Rows run transpile() output.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './core'
import { AgentVM } from '../vm/ast'

const run = async (src: string) => {
  const r = await new AgentVM().run(transpile(src).ast, {}, { fuel: 1000 })
  return r.error ? { error: r.error.message } : { result: r.result }
}

describe("a helper's declared result", () => {
  it('a matching value passes through', async () => {
    expect(
      await run(
        `function h(x): '' { return x }\nfunction f({}) { let a = h('ok')\n return { a } }`
      )
    ).toEqual({ result: { a: 'ok' } })
  })
  it('a mismatch is an error naming the helper', async () => {
    expect(
      (
        await run(
          `function h(x): '' { return x }\nfunction f({}) { let a = h(5)\n return { a } }`
        )
      ).error
    ).toMatch(
      /helper h returned a value that does not match its declared result/
    )
  })
  it('the error is catchable', async () => {
    expect(
      await run(
        `function h(x): '' { return x }\nfunction f({}) { try { let a = h(5) } catch (e) { return { caught: true } }\n return {} }`
      )
    ).toEqual({ result: { caught: true } })
  })
  it('an object result is checked member by member', async () => {
    const src = (v: string) =>
      `function h(): { n: 0 } { return ${v} }\nfunction f({}) { let r = h()\n return { r } }`
    expect((await run(src('{ n: 3 }'))).result).toEqual({ r: { n: 3 } })
    expect((await run(src("{ n: 'x' }"))).error).toMatch(/helper h/)
  })
})

describe('what is not checked (the other direction)', () => {
  it("a callback's return inside the helper is the callback's own", async () => {
    expect(
      await run(
        `function h(xs): 0 { let ys = xs.map((x) => { return x + 'a' })\n return ys.length }\nfunction f({}) { let n = h([1, 2])\n return { n } }`
      )
    ).toEqual({ result: { n: 2 } })
  })
  it('a helper with no annotation returns anything', async () => {
    expect(
      await run(
        `function h(x) { return x }\nfunction f({}) { let a = h(5)\n return { a } }`
      )
    ).toEqual({ result: { a: 5 } })
  })
})
