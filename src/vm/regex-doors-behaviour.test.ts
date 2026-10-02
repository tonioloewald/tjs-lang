/**
 * BEHAVIOURAL half of the regex-doors guardrail (rc.2 twelfth re-review M2).
 *
 * The static scan (`regex-doors.test.ts`) can only see calls in our own source. A pattern can
 * also reach the host's backtracking engine through a LIBRARY (tosijs-schema compiles a schema's
 * `pattern` with `new RegExp`), or through native string methods given a string (which JavaScript
 * compiles as a regex). So this runs a GENERATED corpus of guest attacks — every combination of
 * how a pattern is supplied (string, array, nested array, regex object), where a schema hides
 * it, and which door it reaches, plus the AST's own schemas and the string methods — with the
 * host's entry points instrumented, and fails if any guest-chosen string is compiled by the host.
 * It is as complete as its lists; widen them when a new way appears:
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

/**
 * The corpus is GENERATED, so it covers combinations rather than the spellings someone thought
 * of (thirteenth re-review M2: every row was a string pattern, and an ARRAY `pattern` walked
 * through). Each row's pattern carries a NONCE, so tosijs-schema's pattern cache cannot serve a
 * compile the instrumentation would otherwise see.
 */
let nonce = 0
const evil = () => `${EVIL}|zq${++nonce}`

/** How guest code can supply a pattern value (AJS expression text, given the string `p`). */
const SUPPLIERS: Array<[string, (p: string) => string]> = [
  ['a string', () => 'p'],
  ['an array', () => '[p]'],
  ['a nested array', () => '[[p]]'],
  ['a regex object', (p) => `/${p}/`],
]
/** Where a schema can hide a pattern, and the data that reaches it. */
const POSITIONS: Array<[string, (s: string) => string, string]> = [
  ['at the top', (x) => x, 's'],
  ['under anyOf', (x) => `{ anyOf: [${x}] }`, 's'],
  ['under items', (x) => `{ type: 'array', items: ${x} }`, '[s]'],
  [
    'under additionalProperties',
    (x) => `{ type: 'object', additionalProperties: ${x} }`,
    '{ k: s }',
  ],
]
/** The guest-code doors a schema reaches validation through. */
const DOORS: Array<[string, (schema: string, data: string) => string]> = [
  ['Schema.isValid', (schema, data) => `Schema.isValid(${data}, ${schema})`],
  [
    'filter',
    (schema, data) =>
      `filter({ x: ${data} }, { type: 'object', properties: { x: ${schema} } })`,
  ],
]

const SOURCES: Array<[string, string, Record<string, string>]> = []
for (const [door, call] of DOORS)
  for (const [where, wrap, data] of POSITIONS)
    for (const [how, supply] of SUPPLIERS) {
      const p = evil()
      const schema = wrap(`{ type: 'string', pattern: ${supply(p)} }`)
      SOURCES.push([
        `${door}: ${how} pattern ${where}`,
        `function f(p: '', s: '') { return { v: ${call(schema, data)} } }`,
        { p, s: INPUT },
      ])
    }
// string patterns handed to the VM's own string methods, and a regex literal
for (const [name, body] of [
  ['match', 's.match(p)'],
  ['search', 's.search(p)'],
  ['split', 's.split(p)'],
  ['replace', "s.replace(p, 'x')"],
] as const)
  SOURCES.push([
    `a string pattern to ${name}`,
    `function f(p: '', s: '') { return { m: ${body} } }`,
    { p: evil(), s: INPUT },
  ])
SOURCES.push([
  'a regex literal to search',
  `function f(s: '') { return { m: s.search(/(a+)+$/) } }`,
  { s: INPUT },
])

/** Guest ASTs whose own schemas carry a pattern, supplied every JSON way. */
const astPatterns = () =>
  [
    ['a string', evil()],
    ['an array', [evil()]],
    ['a nested array', [[evil()]]],
  ] as const
const ASTS: Array<[string, any, any]> = []
for (const [how, pattern] of astPatterns())
  ASTS.push([
    `inputSchema with ${how} pattern`,
    {
      op: 'seq',
      steps: [],
      inputSchema: {
        type: 'object',
        properties: { s: { type: 'string', pattern } },
      },
    },
    { s: INPUT },
  ])
for (const [how, pattern] of astPatterns())
  ASTS.push([
    `a return step schema with ${how} pattern`,
    {
      op: 'seq',
      steps: [
        { op: 'varSet', key: 's', value: INPUT },
        {
          op: 'return',
          schema: {
            type: 'object',
            properties: { s: { anyOf: [{ type: 'string', pattern }] } },
          },
        },
      ],
    },
    {},
  ])
ASTS.push([
  'the regexMatch atom',
  { op: 'seq', steps: [{ op: 'regexMatch', pattern: evil(), value: INPUT }] },
  {},
])

describe('no guest-chosen pattern reaches the host regex engine', () => {
  it('apparatus: the instrumentation sees a direct host compile', async () => {
    const seen = await observe(async () => {
      'aaa'.match(evil())
      new RegExp(evil())
    })
    expect(seen.length).toBe(2)
  })

  it('apparatus: it sees a compile INSIDE the library (and the nonce defeats its cache)', async () => {
    const { validate } = await import('tosijs-schema')
    const seen = await observe(async () => {
      validate('aaa', { type: 'string', pattern: evil() })
      validate('aaa', { type: 'string', pattern: [evil()] } as any)
    })
    expect(seen.length).toBe(2)
  })

  for (const [name, src, args] of SOURCES) {
    const ast = transpile(src).ast
    for (const [vmName, VM] of [
      ['vm', AgentVM],
      ['vm-ast', AstVM],
    ] as const)
      it(`${vmName}: ${name}`, async () => {
        const t = performance.now()
        const seen = await observe(() =>
          new VM().run(ast, args, { fuel: 1000, timeoutMs: 1000 })
        )
        expect(seen).toEqual([])
        expect(performance.now() - t).toBeLessThan(250) // a backstop the cache cannot fool
      })
  }

  for (const [name, ast, args] of ASTS)
    for (const [vmName, VM] of [
      ['vm', AgentVM],
      ['vm-ast', AstVM],
    ] as const)
      it(`${vmName}: ${name}`, async () => {
        const t = performance.now()
        const seen = await observe(() =>
          new VM().run(ast, args, { fuel: 1000, timeoutMs: 1000 })
        )
        expect(seen).toEqual([])
        expect(performance.now() - t).toBeLessThan(250)
      })
})
