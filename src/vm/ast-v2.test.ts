/**
 * AJS AST format v2 (board #1860, decided 2026-10-01).
 *
 * v1 stored a literal string and a variable reference the same way — a bare string — and the
 * VM read it as a reference when a variable by that name was in scope. So `const s = 'x'`
 * read the VARIABLE `x` if there was one, `['x', 'z']` became `[5, 'z']`, and input that chose
 * variable names could redirect a literal. v2: a bare string is ALWAYS a literal, and a
 * reference is always an explicit node. The transpiler writes v2; the builder still writes
 * v1 (its strings mean references); a v1 AST keeps v1 meaning, read by the same VM.
 *
 * These are behaviour tests; `ast-fixtures.test.ts` freezes the format itself.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { Eval } from '../lang/eval'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { defineAtom } from './runtime'
import { Agent } from '../builder'
import { AST_VERSION_KEY, astVersionOf } from './ast-version'

const run = async (code: string) => {
  const r = await Eval({ code, fuel: 100_000 })
  return r.error ? { error: r.error.message } : r.result
}

describe('v2: a bare string is a literal', () => {
  const table: Array<[string, unknown]> = [
    [`let x = 5; const s = 'x'; return s`, 'x'],
    [`let x = 5; return ['x', 'z']`, ['x', 'z']],
    [`let x = 5; return { k: 'x' }`, { k: 'x' }],
    [`let name = 'Ada'; return 'name'`, 'name'],
    // a literal that LOOKS like a path is still a literal
    [`let user = { name: 'Ada' }; return 'user.name'`, 'user.name'],
    // references still work, explicitly
    [`let x = 5; return x`, 5],
    [`let user = { name: 'Ada' }; return user.name`, 'Ada'],
  ]
  for (const [code, expected] of table)
    it(code, async () => {
      expect(await run(code)).toEqual(expected)
    })

  it('an object literal shaped like a VM node stays DATA', async () => {
    expect(
      await run(`let x = 5; return { $expr: 'ident', name: 'x' }`)
    ).toEqual({ $expr: 'ident', name: 'x' })
    expect(await run(`let x = 5; return { $kind: 'arg', path: 'x' }`)).toEqual({
      $kind: 'arg',
      path: 'x',
    })
  })
})

describe('v2: indexing in every value position (a regression the suite could not see)', () => {
  // The first v2 emitter compiled `m[i]` to `m["undefined"]` wherever the member reached
  // `expressionToValue` — return values, declarations, array and object elements — and no
  // test exercised it. Every position, by name.
  const table: Array<[string, unknown]> = [
    [`let m = [2, 4, 6]; let i = 1; return m[i]`, 4],
    [`let m = [2, 4, 6]; let i = 1; const v = m[i]; return v`, 4],
    [`let m = [2, 4, 6]; let i = 1; return [m[i], m[0]]`, [4, 2]],
    [`let m = [2, 4, 6]; let i = 2; return { v: m[i] }`, { v: 6 }],
    [`let o = { a: { b: 5 } }; let k = 'a'; return o[k].b`, 5],
    [`let m = [2, 4, 6]; return m[2]`, 6],
    [`let o = { a: 1 }; return o['a']`, 1],
  ]
  for (const [code, expected] of table)
    it(code, async () => {
      expect(await run(code)).toEqual(expected)
    })
})

describe('v2: a while body is a block (board #2343)', () => {
  const table: Array<[string, unknown]> = [
    [
      `let i = 0; let t = 0; while (i < 3) { const d = i * 2; t = t + d; i++ } return t`,
      6,
    ],
    [
      `let i = 0; while (i < 5) { i++; if (i == 3) { return i * 10 } } return -1`,
      30,
    ],
    [
      `let out = []; let i = 0; while (i < 2) { const m = [7, 8]; out.push(m[i]); i++ } return out`,
      [7, 8],
    ],
    // a body declaration does not leak, and does not clobber an outer name
    [`let x = 1; let i = 0; while (i < 1) { let x = 9; i++ } return x`, 1],
  ]
  for (const [code, expected] of table)
    it(code, async () => {
      expect(await run(code)).toEqual(expected)
    })
})

describe('custom atoms receive VALUES', () => {
  // `defineAtom` atoms written like the documented example (`async ({ url }) => …`) received
  // the variable's NAME in every release before 0.14.0 — `echo({ v: local })` got "local" —
  // and in v2 would have received a reference node. The VM now resolves their inputs.
  const echo = defineAtom(
    'echo',
    s.object({ v: s.any }),
    s.any,
    async ({ v }) => ({ got: v }),
    { effects: 'pure' }
  )
  const vm = new AgentVM({ echo })

  it('from transpiled (v2) code: a variable, an argument, and a literal', async () => {
    const { ast } = transpile(`function f({ x }) {
      let local = 'hello'
      let a = echo({ v: local })
      let b = echo({ v: x })
      let c = echo({ v: 'local' })
      return { a, b, c }
    }`)
    const r = await vm.run(ast, { x: 42 })
    expect(r.result).toEqual({
      a: { got: 'hello' },
      b: { got: 42 },
      c: { got: 'local' },
    })
  })

  it('from a builder (v1) AST: its strings still mean references', async () => {
    const ast = Agent.take(s.object({}))
      .varSet({ key: 'local', value: 7 })
      .step({ op: 'echo', v: 'local', result: 'r' })
      .return(s.object({ r: s.any }))
      .toJSON()
    expect(astVersionOf(ast)).toBe(1)
    const r = await vm.run(ast, {})
    expect(r.result).toEqual({ r: { got: 7 } })
  })

  it('an atom that resolves its own inputs can opt out (no double resolution)', async () => {
    const seen: unknown[] = []
    const raw = defineAtom(
      'raw',
      s.object({ v: s.any }),
      undefined,
      async (input: any) => {
        seen.push(input.v)
      },
      { effects: 'pure', resolveInputs: false }
    )
    const { ast } = transpile(
      `function f() { let local = 1; raw({ v: local }) }`
    )
    await new AgentVM({ raw }).run(ast, {})
    expect(seen).toEqual([{ $expr: 'ident', name: 'local' }])
  })
})

describe('v1 ASTs keep v1 meaning', () => {
  it('a v1 AST still reads a bare string as a reference when the name is in scope', async () => {
    const v1 = {
      [AST_VERSION_KEY]: 1,
      op: 'seq',
      steps: [
        { op: 'varSet', key: 'x', value: 5 },
        { op: 'varSet', key: 's', value: 'x' },
        { op: 'return', value: { s: 's' } },
      ],
    }
    expect((await new AgentVM().run(v1 as any, {})).result).toEqual({ s: 5 })
  })

  it('an UNVERSIONED AST is v1', async () => {
    const legacy = {
      op: 'seq',
      steps: [
        { op: 'varSet', key: 'x', value: 5 },
        { op: 'return', value: { y: 'x' } },
      ],
    }
    expect((await new AgentVM().run(legacy as any, {})).result).toEqual({
      y: 5,
    })
  })

  it('the same steps stamped v2 read the string as a literal', async () => {
    const v2 = {
      [AST_VERSION_KEY]: 2,
      op: 'seq',
      steps: [
        { op: 'varSet', key: 'x', value: 5 },
        { op: 'return', value: { y: 'x', z: { $expr: 'ident', name: 'x' } } },
      ],
    }
    expect((await new AgentVM().run(v2 as any, {})).result).toEqual({
      y: 'x',
      z: 5,
    })
  })

  it('the transpiler stamps 2', () => {
    expect(astVersionOf(transpile(`function f() { return 1 }`).ast)).toBe(2)
  })
})
