/**
 * The five blockers from docs/reviews/0.14.0-rc.2-pre-release-review.md, each pinned by the
 * shape that reproduced it. All five came from AST v2, `varAssign` (#59) and VM-resolved atom
 * inputs — changes that moved what a string, a scope and an atom input MEAN.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { defineAtom } from './runtime'
import { AST_VERSION_KEY } from './ast-version'

const code = { transpile: (src: string) => transpile(src).ast }

describe('B1: atoms whose input IS a variable name read the variable, in v2', () => {
  it('varGet and varsExport (array and alias forms)', async () => {
    const { ast } = transpile(`function f() {
      const x = 42
      let a = varGet({ key: 'x' })
      let b = varsExport({ keys: ['x'] })
      let c = varsExport({ keys: { y: 'x' } })
      return { a, b, c }
    }`)
    const r = await new AgentVM().run(ast, {})
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ a: 42, b: { x: 42 }, c: { y: 42 } })
  })
})

describe("B2: runCode cannot assign to the caller's variables", () => {
  const run = (guest: string) =>
    new AgentVM().run(
      transpile(`function f({ src }) {
        let target = 'https://safe.example'
        const fixed = 1
        let r = runCode({ code: src })
        return { target, fixed, r }
      }`).ast,
      { src: guest },
      { fuel: 10_000, capabilities: { code } }
    )

  it('an assignment in runCode source does not reach the caller', async () => {
    const r = await run(
      `function g() { target = 'https://evil.example'; return { seen: target } }`
    )
    expect(r.error).toBeUndefined()
    expect(r.result.target).toBe('https://safe.example')
    // ...it declares locally instead, and the guest sees its own write
    expect(r.result.r).toEqual({ seen: 'https://evil.example' })
  })

  it('assigning a name that is const OUTSIDE the root declares locally, it does not throw', async () => {
    const r = await run(`function g() { fixed = 2; return { fixed } }`)
    expect(r.error).toBeUndefined()
    expect(r.result.fixed).toBe(1)
    expect(r.result.r).toEqual({ fixed: 2 })
  })
})

describe('B3: memoize holds across iterations of a v2 while', () => {
  it('the memoized body runs once in a 3-iteration loop', async () => {
    let calls = 0
    const tick = defineAtom(
      'tick',
      undefined,
      s.any,
      async () => {
        calls++
        return calls
      },
      { effects: 'pure' }
    )
    const ast = {
      [AST_VERSION_KEY]: 2,
      op: 'seq',
      steps: [
        { op: 'varSet', key: 'i', value: 0 },
        {
          op: 'while',
          condition: {
            $expr: 'binary',
            op: '<',
            left: { $expr: 'ident', name: 'i' },
            right: { $expr: 'literal', value: 3 },
          },
          body: [
            { op: 'memoize', key: 'k', steps: [{ op: 'tick', result: 'v' }] },
            {
              op: 'varAssign',
              key: 'i',
              value: {
                $expr: 'binary',
                op: '+',
                left: { $expr: 'ident', name: 'i' },
                right: { $expr: 'literal', value: 1 },
              },
            },
          ],
        },
        { op: 'return', value: {} },
      ],
    }
    const r = await new AgentVM({ tick }).run(ast as any, {})
    expect(r.error).toBeUndefined()
    expect(calls).toBe(1)
  })
})

describe('B4: __proto__ cannot be used as an object key to hide memory', () => {
  it('the transpiler refuses a literal __proto__ key', () => {
    expect(() =>
      transpile(`function f() { return { __proto__: { a: 1 } } }`)
    ).toThrow(/__proto__/)
  })

  it('the VM refuses it in a guest-built object node', async () => {
    const ast = {
      [AST_VERSION_KEY]: 2,
      op: 'seq',
      steps: [
        {
          op: 'return',
          value: {
            o: {
              $expr: 'object',
              properties: [
                {
                  key: '__proto__',
                  value: { $expr: 'literal', value: { big: 1 } },
                },
              ],
            },
          },
        },
      ],
    }
    const r = await new AgentVM().run(ast as any, {})
    expect(r.error?.message ?? '').toMatch(/__proto__/)
  })

  it('the guest Object.assign does not invoke the __proto__ setter', async () => {
    const { ast } = transpile(`function f() {
      let src = JSON.parse('{"__proto__": {"hidden": 1}}')
      let out = Object.assign({}, src)
      return { out }
    }`)
    const r = await new AgentVM().run(ast, {})
    expect(r.error?.message ?? '').toMatch(/__proto__/)
  })
})

describe('B5: data shaped like code stays data, even in an atom that resolves its own inputs', () => {
  it('a self-resolving atom does not evaluate {$expr}-shaped data a second time', async () => {
    const { resolveValue } = await import('./runtime')
    const echo = defineAtom(
      'echo',
      s.object({ v: s.any }),
      s.any,
      async ({ v }: any, ctx: any) => ({ got: resolveValue(v, ctx) }), // the old, necessary way
      { effects: 'pure' }
    )
    const { ast } = transpile(`function f() {
      let secret = 'TOPSECRET'
      let data = JSON.parse('{"$expr": "ident", "name": "secret"}')
      let r = echo({ v: data })
      return { r }
    }`)
    const r = await new AgentVM({ echo }).run(ast, {})
    expect(r.error).toBeUndefined()
    expect(r.result.r).toEqual({ got: { $expr: 'ident', name: 'secret' } })
  })

  it('a cost function sees the same resolved input as the atom body', async () => {
    const seen: unknown[] = []
    const count = defineAtom(
      'count',
      s.object({ items: s.array(s.any) }),
      s.any,
      async ({ items }: any) => items.length,
      {
        effects: 'pure',
        cost: (input: any) => {
          seen.push(input.items)
          return 1
        },
      }
    )
    const { ast } = transpile(`function f() {
      let xs = [1, 2, 3]
      let n = count({ items: xs })
      return { n }
    }`)
    const r = await new AgentVM({ count }).run(ast, {})
    expect(r.result).toEqual({ n: 3 })
    expect(seen).toEqual([[1, 2, 3]])
  })
})
