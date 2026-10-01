/**
 * docs/reviews/0.14.0-rc.2-rereview.md — the findings the first rc.2 remediation left open or
 * introduced, each pinned by the shape that reproduced it. The review raised the cycle flag, so
 * each is closed STRUCTURALLY rather than per site, and the structural rule has its own guard:
 * `guest-key-writes.test.ts` (B4) and the required heap fields on `RuntimeContext` (M1).
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { defineAtom, createChildScope, releaseScope } from './runtime'
import { AST_VERSION_KEY } from './ast-version'

const code = { transpile: (src: string) => transpile(src).ast }
const lit = (value: unknown) => ({ $expr: 'literal', value })
const ident = (name: string) => ({ $expr: 'ident', name })

describe('B4 sibling sites: no atom builds an object by assigning a guest-chosen __proto__', () => {
  // Each source holds an OWN `__proto__` key (JSON.parse defines it; it does not set the
  // prototype). Copying it by assignment would replace the copy's prototype, hiding the payload
  // from the heap walk while the guest can still read it.
  const PROTO = `JSON.parse('{"__proto__": {"hidden": 1}}')`
  const table: Array<[string, string]> = [
    [
      'omit',
      `let o = ${PROTO}; let r = omit({ obj: o, keys: [] }); return { r }`,
    ],
    [
      'pick',
      `let o = ${PROTO}; let r = pick({ obj: o, keys: ['__proto__'] }); return { r }`,
    ],
  ]
  for (const [name, body] of table)
    it(name, async () => {
      const r = await new AgentVM().run(
        transpile(`function f() { ${body} }`).ast,
        {}
      )
      expect(r.error?.message ?? '').toMatch(/__proto__/)
    })

  it('varsExport alias (its keys are literal, so a JSON AST)', async () => {
    const ast = JSON.parse(
      `{"op":"seq","steps":[{"op":"varSet","key":"x","value":1},{"op":"varsExport","keys":{"__proto__":"x"},"result":"r"}]}`
    )
    const r = await new AgentVM().run(ast, {})
    expect(r.error?.message ?? '').toMatch(/__proto__/)
  })

  it('agentRun input', async () => {
    const sub = { op: 'seq', steps: [{ op: 'return', value: {} }] }
    const ast = JSON.parse(
      JSON.stringify({
        [AST_VERSION_KEY]: 2,
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'sub', value: lit(sub) },
          {
            op: 'agentRun',
            agentId: ident('sub'),
            input: { $expr: 'literal', value: 'PLACEHOLDER' },
          },
        ],
      }).replace('"PLACEHOLDER"', '{"__proto__": {"hidden": 1}}')
    )
    const r = await new AgentVM().run(ast, {})
    expect(r.error?.message ?? '').toMatch(/__proto__/)
  })

  it('a raw object value in a JSON AST (resolveValue)', async () => {
    const ast = JSON.parse(
      `{"op":"seq","steps":[{"op":"return","value":{"o":{"__proto__":{"hidden":1}}}}]}`
    )
    const r = await new AgentVM().run(ast, {})
    expect(r.error?.message ?? '').toMatch(/__proto__/)
  })

  it('a custom atom input key in a JSON AST (resolveAtomInputs)', async () => {
    const echo = defineAtom('echo', undefined, s.any, async (i: any) => i, {
      effects: 'pure',
    })
    const ast = JSON.parse(
      `{"$ajs":2,"op":"seq","steps":[{"op":"echo","__proto__":{"hidden":1},"result":"r"}]}`
    )
    const r = await new AgentVM({ echo }).run(ast, {})
    expect(r.error?.message ?? '').toMatch(/__proto__/)
  })

  it('pick reads OWN properties only — it never hands the guest an inherited host function', async () => {
    const r = await new AgentVM().run(
      transpile(`function f() {
        let r = pick({ obj: { a: 1 }, keys: ['a', 'constructor', 'toString'] })
        return { vals: Object.values(r) }
      }`).ast,
      {}
    )
    expect(r.error).toBeUndefined()
    expect(r.result.vals).toEqual([1, undefined, undefined])
  })
})

describe('M1: an atom that runs nested steps does not run them under its resolved-inputs context', () => {
  // A custom atom with the default `resolveInputs` runs under a DERIVED context. Steps it
  // executes must resolve their values and be accounted against the run — not inherit the
  // derived context's "already resolved" flag, nor write to an accounting the run never sees.
  const blob = new Array(200_000).fill(7)
  const wrap = defineAtom(
    'wrap',
    s.object({}),
    s.any,
    async (_input, ctx) => {
      await ctx.resolver('seq')!.exec(
        {
          op: 'seq',
          steps: [
            { op: 'varSet', key: 'seven', value: lit(7) },
            { op: 'varSet', key: 'big', value: lit(blob) },
          ],
        },
        ctx
      )
    },
    { effects: 'pure' }
  )
  const program = {
    [AST_VERSION_KEY]: 2,
    op: 'seq',
    steps: [
      { op: 'wrap' }, // FIRST: no accounting can have been created by an earlier write
      { op: 'return', value: { seven: ident('seven') } },
    ],
  }

  it('nested steps resolve their values', async () => {
    const r = await new AgentVM({ wrap }).run(program as any, {})
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ seven: 7 })
  })

  it('nested writes count against the heap ceiling', async () => {
    const r = await new AgentVM({ wrap }).run(
      program as any,
      {},
      {
        maxHeapBytes: 100_000,
        fuel: 100_000,
      }
    )
    expect(r.error?.message ?? '').toMatch(/heap|memory|maxHeapBytes/i)
  })
})

describe('M1: a scope created under a resolved-inputs context runs steps normally', () => {
  it('createChildScope does not inherit the flag', async () => {
    const scoped = defineAtom(
      'scoped',
      s.object({}),
      s.any,
      async (_input, ctx) => {
        const child = createChildScope(ctx)
        try {
          await ctx
            .resolver('seq')!
            .exec(
              { op: 'seq', steps: [{ op: 'varSet', key: 'v', value: lit(7) }] },
              child
            )
          return child.state.v
        } finally {
          releaseScope(child)
        }
      },
      { effects: 'pure' }
    )
    const r = await new AgentVM({ scoped }).run(
      {
        [AST_VERSION_KEY]: 2,
        op: 'seq',
        steps: [
          { op: 'scoped', result: 'v' },
          { op: 'return', value: { v: ident('v') } },
        ],
      } as any,
      {}
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: 7 })
  })
})

describe("M2: runCode is its own program — the caller's scope is not on its chain", () => {
  const run = (guest: string) =>
    new AgentVM().run(
      transpile(`function f({ src }) {
        let allowed = ['a']
        let secret = 'TOPSECRET'
        let r = runCode({ code: src, args: { n: 2 } })
        return { allowed, r }
      }`).ast,
      { src: guest },
      { fuel: 10_000, capabilities: { code } }
    )

  it("cannot mutate a caller's array in place", async () => {
    const r = await run(`function g() { allowed.push('evil'); return {} }`)
    expect(r.result?.allowed ?? ['a']).toEqual(['a'])
  })

  it("cannot read a caller's variable", async () => {
    const r = await run(`function g() { return { leaked: secret } }`)
    expect(r.result?.r?.leaked).toBeUndefined()
  })

  it('reads the args it is given', async () => {
    const r = await run(`function g({ n }) { return { twice: n * 2 } }`)
    expect(r.error).toBeUndefined()
    expect(r.result.r).toEqual({ twice: 4 })
  })

  it('an assignment inside a loop in runCode keeps its value after the loop', async () => {
    const r = await run(`function g() {
      let total = 0
      for (const x of [1, 2, 3]) { total = total + x }
      return { total }
    }`)
    expect(r.error).toBeUndefined()
    expect(r.result.r).toEqual({ total: 6 })
  })
})

describe("a sub-agent runs ITS OWN helpers, not the caller's", () => {
  const helper = (value: unknown) => ({
    paramNames: [],
    steps: [{ op: 'return', value: lit(value) }],
  })
  it('agentRun (inline AST)', async () => {
    const sub = {
      op: 'seq',
      helpers: { h: helper('sub') },
      steps: [
        { op: 'callLocal', name: 'h', args: [], result: 'v' },
        { op: 'return', value: { v: 'v' } },
      ],
    }
    const ast = {
      op: 'seq',
      helpers: { h: helper('caller') },
      steps: [
        { op: 'varSet', key: 'sub', value: sub },
        { op: 'agentRun', agentId: 'sub', input: {}, result: 'out' },
        { op: 'return', value: { out: 'out' } },
      ],
    }
    const r = await new AgentVM().run(ast as any, {})
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ out: { v: 'sub' } })
  })
})
