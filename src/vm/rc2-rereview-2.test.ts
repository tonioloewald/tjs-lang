/**
 * docs/reviews/0.14.0-rc.2-rereview-2.md — both blockers, pinned through `transpile()`: the
 * heap test that should have caught B2 built `push` by hand with a `result` the transpiler
 * never emits, so it guarded a path that does not ship. Every program here is what a user's
 * source actually becomes.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { s } from 'tosijs-schema'
import { AgentVM } from './vm'
import { defineAtom } from './runtime'

const run = (src: string, opts: Record<string, unknown> = {}) =>
  new AgentVM().run(transpile(src).ast, {}, { fuel: 1_000_000, ...opts })

describe('B1: the const rule asks about the scope the write actually lands in', () => {
  it('a block `let` may shadow an outer `const` (legal JavaScript)', async () => {
    const r = await run(`function f() {
      const x = 1
      let out = []
      for (const i of [1, 2]) { let x = i * 10; out.push(x) }
      return { out, x }
    }`)
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ out: [10, 20], x: 1 })
  })

  it('...including when the shadowing value comes from an atom result', async () => {
    const r = await run(`function f() {
      const x = 'outer'
      let out = []
      for (const i of [1, 2]) { let x = [i, i].join('-'); out.push(x) }
      return { out, x }
    }`)
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ out: ['1-1', '2-2'], x: 'outer' })
  })

  it('assigning an outer `const` from inside a block is still refused', async () => {
    const r = await run(`function f() {
      const x = 1
      for (const i of [1]) { x = 2 }
      return { x }
    }`)
    expect(r.error?.message ?? '').toMatch(/const/)
  })

  it('every write path honours it — varsImport over a const is refused', async () => {
    const ast = {
      op: 'seq',
      steps: [
        { op: 'constSet', key: 'x', value: 1 },
        { op: 'varsImport', keys: ['x'] },
        { op: 'return', value: { x: 'x' } },
      ],
    }
    const r = await new AgentVM().run(ast as any, { x: 2 })
    expect(r.error?.message ?? '').toMatch(/const/)
  })
})

describe('B2: in-place mutation is charged to the heap budget', () => {
  const CAP = { maxHeapBytes: 1_000_000 }

  it('a transpiled `arr.push(x)` statement', async () => {
    const r = await run(
      `function f() {
        let arr = []
        let s = 'x'.repeat(1000)
        let i = 0
        while (i < 20000) { arr.push(s + i); i = i + 1 }
        return { len: arr.length }
      }`,
      CAP
    )
    expect(r.error?.message ?? '').toMatch(/heap|memory/i)
  })

  it('`arr.fill(big)` through methodCall', async () => {
    const r = await run(
      `function f() {
        let arr = [1]
        let i = 0
        while (i < 2000) { arr.fill('y'.repeat(1000) + i); i = i + 1 }
        return { len: arr.length }
      }`,
      CAP
    )
    expect(r.error?.message ?? '').toMatch(/heap|memory/i)
  })

  it("the guest Set's `add`", async () => {
    const r = await run(
      `function f() {
        let set = Set([])
        let i = 0
        while (i < 2000) { set.add('z'.repeat(1000) + i); i = i + 1 }
        return { n: set.size }
      }`,
      CAP
    )
    expect(r.error?.message ?? '').toMatch(/heap|memory/i)
  })

  it("a Set's contents are visible to the heap walk at all", async () => {
    // Two Sets over the same 4MB of strings: the args are charged once on entry, and each Set
    // holds its own array of them. Before, a Set's closure was invisible to the walk.
    const big = Array.from({ length: 2000 }, (_, i) => 'w'.repeat(1000) + i)
    const program = (sets: number) =>
      new AgentVM().run(
        transpile(`function f({ items }) {
          ${Array.from(
            { length: sets },
            (_, i) => `let s${i} = Set(items)`
          ).join('\n')}
          return { ok: true }
        }`).ast,
        { items: big },
        { fuel: 1_000_000, maxHeapBytes: 6_000_000 }
      )
    expect((await program(0)).error).toBeUndefined()
    expect((await program(2)).error?.message ?? '').toMatch(/heap|memory/i)
  })

  it('an ordinary program under the cap is unaffected', async () => {
    const r = await run(
      `function f() {
        let arr = []
        let i = 0
        while (i < 200) { arr.push(i); i = i + 1 }
        return { len: arr.length }
      }`,
      CAP
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ len: 200 })
  })

  it('an append loop stays linear in fuel', async () => {
    const fuelFor = async (n: number) =>
      (
        await run(`function f() {
          let arr = []
          let i = 0
          while (i < ${n}) { arr.push('abcdefgh' + i); i = i + 1 }
          return { len: arr.length }
        }`)
      ).fuelUsed
    const a = await fuelFor(1000)
    const b = await fuelFor(4000)
    expect(b / a).toBeLessThan(6)
  })
})

describe('follow-ups', () => {
  it('an AST op naming an Object.prototype member is an Unknown Atom', async () => {
    for (const op of ['toString', 'constructor', '__defineGetter__']) {
      const r = await new AgentVM().run(
        { op: 'seq', steps: [{ op }] } as any,
        {}
      )
      expect(r.error?.message ?? '').toMatch(/Unknown Atom/)
    }
  })

  it('the v1 return projection reads bindings, never inherited members', async () => {
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'a', value: 1 },
          {
            op: 'return',
            schema: { properties: { a: {}, toString: {}, valueOf: {} } },
          },
        ],
      } as any,
      {}
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ a: 1, toString: undefined, valueOf: undefined })
  })

  it("runCode cannot call the caller's helpers", async () => {
    const code = { transpile: (src: string) => transpile(src).ast }
    const ast = {
      op: 'seq',
      helpers: {
        secret: {
          paramNames: [],
          steps: [{ op: 'return', value: { $expr: 'literal', value: 'TOP' } }],
        },
      },
      steps: [
        {
          op: 'runCode',
          code: 'function g() { let v = secret(); return { v } }',
          result: 'r',
        },
        { op: 'return', value: { r: 'r' } },
      ],
    }
    const r = await new AgentVM().run(
      ast as any,
      {},
      { capabilities: { code } }
    )
    expect(JSON.stringify(r.result ?? {})).not.toContain('TOP')
  })

  it('an atom that runs steps on a context with a replaced state is refused, by name', async () => {
    const swap = defineAtom(
      'swap',
      s.object({}),
      s.any,
      async (_i: any, ctx: any) => {
        ctx.state = {} // its OWN context, state replaced — not a copy
        await ctx
          .resolver('seq')
          .exec(
            { op: 'seq', steps: [{ op: 'varSet', key: 'v', value: 1 }] },
            ctx
          )
      },
      { effects: 'pure' }
    )
    const r = await new AgentVM({ swap }).run(
      { op: 'seq', steps: [{ op: 'swap' }] } as any,
      {}
    )
    expect(r.error?.message ?? '').toMatch(/createChildScope|resolveInputs/)
  })
})
