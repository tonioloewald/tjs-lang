/**
 * Atoms take NAMED arguments (Tonio, 2026-10-03), checked at both ends without reading a schema.
 *
 * Rounds 14 to 17 of the 0.14.0-rc.2 reviews tried to decide positional versus named per atom by
 * reading its input schema. Each round fixed one shape (`random()`, a positional embedder atom, a
 * named `args` record, an optional array) and the next review found another (`args: s.any`). The
 * rule is now syntactic. A call to an atom is a single object literal, or nothing. The transpiler
 * refuses anything else with an instructive error, checked on the SYNTAX: the AST encodes
 * `foo(a, b)` as an input named `args`, indistinguishable from `foo({ args: [a, b] })`, so the VM
 * cannot and does not police it. Local functions and `Error('message')` are positional by design.
 *
 * Rows use `transpile()` output; the one hand-built row is a persisted rc.1 shape, and says so.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { AgentVM as AstVM } from './ast'
import { defineAtom } from './runtime'
import { AgentVM as FullVM } from './index'
import { createAgent } from '../lang/core'
import * as langIndex from '../lang/index'

const greet = defineAtom(
  'greet',
  s.object({ name: s.string.optional }),
  s.string,
  async ({ name }: { name?: string }) => `hi ${name ?? 'you'}`,
  { effects: 'pure' }
)
// the shape the old rules kept guessing about: an untyped input called `args`
const loose = defineAtom(
  'loose',
  s.object({ args: s.any }),
  s.any,
  async ({ args }: { args?: unknown }) => args ?? 'none',
  { effects: 'pure' }
)
// a named input that happens to be called `args`, optional (as runCode's is)
const withArgs = defineAtom(
  'withArgs',
  s.object({ code: s.string.optional, args: s.record(s.any).optional }),
  s.any,
  async ({ args }: { args?: Record<string, unknown> }) => args ?? 'none',
  { effects: 'pure' }
)
const atoms = { greet, loose, withArgs } as any

const RUNS: Array<[string, string, unknown]> = [
  ['named call', "greet({ name: 'ann' })", 'hi ann'],
  ['empty call', 'greet()', 'hi you'],
  ['core atom, empty call', 'random() >= 0 ? 1 : 1', 1],
  ['named call to an input called args', 'loose({ args: [1, 2] })', [1, 2]],
  ['empty call to an atom with a named `args` input', 'withArgs()', 'none'],
]

const NAMED_SHAPE = /takes named arguments: write \w+\(\{ name: value, … \}\)/
const REFUSED_AT_TRANSPILE: Array<[string, string, RegExp]> = [
  [
    'a spread in an atom call',
    'greet({ ...opts })',
    /spread is not supported in an atom call: name each input, e\.g\. foo\(\{ a: opts\.a/,
  ],
  ['positional values to a named atom', "greet('ann')", NAMED_SHAPE],
  ['positional values to an untyped args atom', 'loose(1, 2, 3)', NAMED_SHAPE],
  ['positional values to a core atom', "storeSet('k', 1)", NAMED_SHAPE],
  ['a single non-literal argument', 'greet(opts)', NAMED_SHAPE],
]

for (const [label, VM] of [
  ['vm', AgentVM],
  ['vm-ast', AstVM],
] as const)
  describe(`${label}: atoms take named arguments`, () => {
    const run = (ast: unknown) =>
      new (VM as any)(atoms).run(ast, {}, { fuel: 1000 })

    for (const [cell, call, want] of RUNS)
      it(`runs: ${cell}`, async () => {
        // an atom call is a statement: bind it, then use it
        const src = call.includes('?')
          ? `function f() { const r = random()\n return { v: r >= 0 ? 1 : 1 } }`
          : `function f() { const v = ${call}\n return { v } }`
        const r = await run(transpile(src, { atoms }).ast)
        expect(r.error).toBeUndefined()
        expect(r.result).toEqual({ v: want })
      })

    it('runs: positional calls that are functions (a local helper, Error)', async () => {
      const r = await run(
        transpile(`function twice(a, b) { return a * 2 + b }
        function f() {
          let got = ''
          try { Error('boom') } catch (e) { got = e }
          const t = twice(3, 1)
          return { t, got }
        }`).ast
      )
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ t: 7, got: 'boom' })
    })

    // hand-built: in the AST every input is named, and `args` is just a name (it is how the
    // emitter encodes Error('x') and a local call). The VM does not police call syntax.
    it('runs: a persisted `args: []` from an empty call (hand-built, rc.1 emitter)', async () => {
      const r = await run({
        op: 'seq',
        steps: [
          { op: 'greet', args: [], result: 'v' },
          { op: 'return', value: { v: 'v' } },
        ],
      })
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ v: 'hi you' })
    })
  })

describe('the transpiler refuses a positional atom call, naming the shape that works', () => {
  for (const [cell, call, message] of REFUSED_AT_TRANSPILE)
    it(cell, () => {
      expect(() =>
        transpile(`function f(opts) { const v = ${call}\n return { v } }`, {
          atoms,
        })
      ).toThrow(message)
    })
})

describe("the transpiler checks an atom call against the atom's declared inputs", () => {
  const compile =
    (call: string, opts: any = {}) =>
    () =>
      transpile(`function f() { const v = ${call}\n return { v } }`, opts)

  it('core atom: an input it does not have', () => {
    expect(compile("storeSet({ key: 'k', val: 1 })")).toThrow(
      /'storeSet' has no input 'val'\. It takes storeSet\(\{ key, value \}\)/
    )
  })
  it('core atom: a required input missing', () => {
    expect(compile('storeSet({ value: 1 })')).toThrow(
      /'storeSet' needs 'key'\. It takes storeSet\(\{ key, value \}\)/
    )
  })
  it("the playground's old httpFetch({ url, cache }) — an input that never existed", () => {
    expect(compile("httpFetch({ url: 'u', cache: 60 })")).toThrow(
      /'httpFetch' has no input 'cache'/
    )
  })
  it('host atom: checked against its own schema when the host passes { atoms }', () => {
    expect(compile("greet({ nam: 'x' })", { atoms })).toThrow(
      /'greet' has no input 'nam'\. It takes greet\(\{ name \}\)/
    )
    // without the registry the transpiler cannot know the atom, and does not guess
    expect(compile("greet({ nam: 'x' })")).not.toThrow()
  })
  it('a host atom overrides a core atom of the same name', () => {
    const storeSet = defineAtom(
      'storeSet',
      s.object({ k: s.string }),
      s.any,
      async () => null
    )
    expect(
      compile("storeSet({ k: 'x' })", { atoms: { storeSet } })
    ).not.toThrow()
  })

  // The VM runs an AST as written (Tonio, 2026-10-03: correctness and safety are the VM's job;
  // preventing bad parameters is the transpiler's). Hand-built: the transpiler cannot write it.
  for (const [label, VM] of [
    ['vm', AgentVM],
    ['vm-ast', AstVM],
  ] as const)
    it(`${label}: a hand-built step with an undeclared input runs as written`, async () => {
      const r = await new (VM as any)(atoms).run(
        {
          op: 'seq',
          steps: [
            { op: 'greet', nam: 'x', result: 'v' },
            { op: 'return', value: { v: 'v' } },
          ],
        },
        {},
        { fuel: 100 }
      )
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ v: 'hi you' })
    })
})

describe('every entry point that holds a VM checks against THAT VM’s atoms (twenty-third re-review)', () => {
  // a host atom that OVERRIDES a core name with a wider contract
  const httpFetch = defineAtom(
    'httpFetch',
    s.object({ url: s.string, cache: s.number.optional }),
    s.any,
    async ({ url, cache }: { url: string; cache?: number }) =>
      `${url}:${cache}`,
    { effects: 'pure' }
  )
  // an OPEN raw schema with a required input
  const rawj = defineAtom(
    'rawj',
    {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    } as any,
    s.any,
    async () => 'ok',
    { effects: 'pure' }
  )
  const vm = new FullVM({ greet, httpFetch, rawj } as any)

  it('vm.run(source): a host override with a wider schema is accepted', async () => {
    const r = await vm.run(
      "function f() { const v = httpFetch({ url: 'x', cache: 5 })\n return { v } }",
      {},
      { fuel: 100 }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: 'x:5' })
  })

  it('vm.run(source): a misspelled host input is refused before running', async () => {
    await expect(
      vm.run(
        "function f() { const v = greet({ nam: 'x' })\n return { v } }",
        {},
        { fuel: 100 }
      )
    ).rejects.toThrow(
      /'greet' has no input 'nam'\. It takes greet\(\{ name \}\)/
    )
  })

  it('createAgent: a misspelled host input is refused', () => {
    expect(() =>
      createAgent(
        "function f() { const v = greet({ nam: 'x' })\n return { v } }",
        vm
      )
    ).toThrow(/'greet' has no input 'nam'/)
  })

  it('there is ONE createAgent: the main entry re-exports the core one', () => {
    expect(langIndex.createAgent).toBe(createAgent)
  })

  it('a partial atoms map: the hint says the name was checked as the core atom', () => {
    expect(() =>
      transpile(
        "function f() { const v = httpFetch({ url: 'x', cache: 5 })\n return { v } }",
        {
          atoms: { greet } as any,
        }
      )
    ).toThrow(/Your atoms do not include 'httpFetch'/)
  })

  it('an OPEN schema still requires what it requires', () => {
    expect(() =>
      transpile('function f() { const v = rawj({})\n return { v } }', {
        atoms: { rawj } as any,
      })
    ).toThrow(/'rawj' needs 'url'/)
    // open: an undeclared input is not an error
    expect(() =>
      transpile(
        "function f() { const v = rawj({ url: 'u', extra: 1 })\n return { v } }",
        {
          atoms: { rawj } as any,
        }
      )
    ).not.toThrow()
  })

  it('without the registry, a core-name refusal says how to check against your own atom', () => {
    expect(() =>
      transpile(
        "function f() { const v = httpFetch({ url: 'x', cache: 5 })\n return { v } }"
      )
    ).toThrow(/pass its atoms: transpile\(src, \{ atoms: vm\.atoms \}\)/)
  })
})

describe('a step control field cannot be an atom input (pre-tag review)', () => {
  for (const key of ['op', 'result', 'resultConst', 'resultAssign'])
    for (const [who, atomsOpt] of [
      ['an uncontracted name', {}],
      ['an open-schema host atom', { atoms: { loose } }],
    ] as const)
      it(`'${key}' refused for ${who}`, () => {
        const callee = who === 'an uncontracted name' ? 'mystery' : 'loose'
        expect(() =>
          transpile(
            `function f() { const v = ${callee}({ ${key}: 'x' })\n return { v } }`,
            atomsOpt as any
          )
        ).toThrow(
          new RegExp(
            `'${key}' cannot be an atom input: it is reserved for the step`
          )
        )
      })
})
