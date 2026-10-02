/**
 * BEHAVIOURAL half of the regex-doors guardrail (rc.2 twelfth re-review M2).
 *
 * The static scan (`regex-doors.test.ts`) can only see calls in our own source. A pattern can
 * also reach the host's backtracking engine through a LIBRARY (tosijs-schema compiles a schema's
 * `pattern` with `new RegExp`), or through native string methods given a string (which JavaScript
 * compiles as a regex). So this runs a corpus of guest attacks — every way a guest can name a
 * pattern — with the host's entry points instrumented, and fails if any guest-chosen string is
 * compiled by the host:
 *
 * - `globalThis.RegExp` is replaced by a counting Proxy (a library's `new RegExp(str)` resolves
 *   the global at call time);
 * - `String.prototype.match` / `search` / `matchAll` are wrapped to record a non-RegExp argument.
 *
 * Every program is transpiled BEFORE instrumenting, so only the run is observed.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { AgentVM as AstVM } from './ast'

const EVIL = '(a+)+$'
const INPUT = 'a'.repeat(24) + '!'

/** Run `f` with the host's regex entry points instrumented; return what reached them. */
async function observe(f: () => Promise<unknown>): Promise<string[]> {
  const seen: string[] = []
  const RealRegExp = globalThis.RegExp
  const proto = String.prototype as any
  const real = {
    match: proto.match,
    search: proto.search,
    matchAll: proto.matchAll,
  }
  ;(globalThis as any).RegExp = new Proxy(RealRegExp, {
    construct(target, args) {
      if (String(args[0]).includes('(a+)+')) seen.push(`new RegExp(${args[0]})`)
      return Reflect.construct(target, args)
    },
    apply(target, self, args) {
      if (String(args[0]).includes('(a+)+')) seen.push(`RegExp(${args[0]})`)
      return Reflect.apply(target, self, args)
    },
  })
  for (const name of ['match', 'search', 'matchAll'] as const)
    proto[name] = function (this: string, p: unknown, ...rest: unknown[]) {
      if (
        !(p instanceof RealRegExp) &&
        p !== undefined &&
        String(p).includes('(a+)+')
      )
        seen.push(`String.prototype.${name}(${String(p)})`)
      return real[name].call(this, p, ...rest)
    }
  try {
    await f()
  } finally {
    ;(globalThis as any).RegExp = RealRegExp
    Object.assign(proto, real)
  }
  return seen
}

/** AJS sources: every way guest code can name a pattern. */
const SOURCES: Array<[string, string]> = [
  [
    'a string pattern to match',
    `function f(p: '', s: '') { return { m: s.match(p) } }`,
  ],
  [
    'a string pattern to search',
    `function f(p: '', s: '') { return { m: s.search(p) } }`,
  ],
  [
    'a string pattern to split',
    `function f(p: '', s: '') { return { m: s.split(p) } }`,
  ],
  [
    'a string pattern to replace',
    `function f(p: '', s: '') { return { m: s.replace(p, 'x') } }`,
  ],
  ['a regex literal', `function f(s: '') { return { m: s.search(/(a+)+$/) } }`],
  [
    'Schema.isValid with a pattern',
    `function f(p: '', s: '') { return { v: Schema.isValid(s, { type: 'string', pattern: p }) } }`,
  ],
  [
    'filter with a pattern',
    `function f(p: '', s: '') { return { v: filter({ x: s }, { type: 'object', properties: { x: { type: 'string', pattern: p } } }) } }`,
  ],
]

/** Guest ASTs whose own schemas carry a pattern. */
const ASTS: Array<[string, any, any]> = [
  [
    'inputSchema',
    {
      op: 'seq',
      steps: [],
      inputSchema: {
        type: 'object',
        properties: { s: { type: 'string', pattern: EVIL } },
      },
    },
    { s: INPUT },
  ],
  [
    'a return step schema',
    {
      op: 'seq',
      steps: [
        { op: 'varSet', key: 's', value: INPUT },
        {
          op: 'return',
          schema: {
            type: 'object',
            properties: { s: { type: 'string', pattern: EVIL } },
          },
        },
      ],
    },
    {},
  ],
  [
    'the regexMatch atom',
    { op: 'seq', steps: [{ op: 'regexMatch', pattern: EVIL, value: INPUT }] },
    {},
  ],
]

describe('no guest-chosen pattern reaches the host regex engine', () => {
  it('apparatus: the instrumentation sees a host compile', async () => {
    const seen = await observe(async () => {
      'aaa'.match(EVIL)
      new RegExp(EVIL)
    })
    expect(seen.length).toBe(2)
  })

  for (const [name, src] of SOURCES) {
    const ast = transpile(src).ast
    for (const [vmName, VM] of [
      ['vm', AgentVM],
      ['vm-ast', AstVM],
    ] as const)
      it(`${vmName}: ${name}`, async () => {
        const seen = await observe(() =>
          new VM().run(
            ast,
            { p: EVIL, s: INPUT },
            { fuel: 1000, timeoutMs: 1000 }
          )
        )
        expect(seen).toEqual([])
      })
  }

  for (const [name, ast, args] of ASTS)
    for (const [vmName, VM] of [
      ['vm', AgentVM],
      ['vm-ast', AstVM],
    ] as const)
      it(`${vmName}: ${name}`, async () => {
        const seen = await observe(() =>
          new VM().run(ast, args, { fuel: 1000, timeoutMs: 1000 })
        )
        expect(seen).toEqual([])
      })
})
