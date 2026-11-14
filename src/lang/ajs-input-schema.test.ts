/**
 * An AJS agent's declared inputs are ENFORCED (#3835). `typeToJsonSchema` covered string,
 * number, boolean, array, object and union, and every other kind fell to `return {}`, which
 * admits anything: `function f(n: 10)` (an integer example) accepted 'x', `+0` accepted -1,
 * `'a' | 'b'` accepted 'z'. A declared input contract that checks nothing, on the path that
 * runs untrusted code. Kinds JSON input cannot carry (bigint, functions) and regex patterns
 * (guest schemas may not hold host patterns) are refused at transpile time, with the remedy.
 *
 * Rows run transpile() output on the AST VM, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './core'
import { AgentVM } from '../vm/ast'

const vm = new AgentVM()
const run = async (src: string, args: Record<string, unknown>) => {
  const { ast } = transpile(src)
  return vm.run(ast, args, { fuel: 1000 })
}
const refused = (r: { error?: unknown }) => r.error !== undefined

describe('declared AJS inputs are enforced', () => {
  const rows: [string, string, unknown, unknown][] = [
    // [what, source, a value that must pass, a value that must be refused]
    ['an integer example', 'function f(n: 10) { return { n } }', 7, 'x'],
    [
      'an integer example refuses a fraction',
      'function f(n: 10) { return { n } }',
      7,
      1.5,
    ],
    ['a float example', 'function f(n: 1.5) { return { n } }', 2.5, 'x'],
    ['a non-negative example', 'function f(n: +0) { return { n } }', 3, -1],
    ['a literal union', "function f(m: 'a' | 'b') { return { m } }", 'b', 'z'],
    [
      'a destructured integer default',
      'function f({ n = 10 }) { return { n } }',
      4,
      'x',
    ],
    // Found with #3834: object members were never required, so `p: { x: 0 }` accepted `{}`
    // (TJS refuses it), and unions were `oneOf` (exactly one), so `'' | undefined` refused
    // every string so did any union whose members overlap.
    [
      'an object example requires its members',
      'function f(p: { x: 0 }) { return { p } }',
      { x: 1 },
      {},
    ],
    [
      'a member that may be absent',
      "function f(p: { x: 0, y: '' | undefined }) { return { p } }",
      { x: 1, y: 'hi' },
      { y: 'hi' },
    ],
    [
      'a union admits a value matching more than one member',
      "function f(s: '' | undefined) { return { s } }",
      'hi',
      5,
    ],
    // `'' | undefined` admitted 5 (undefined mapped to `{}`); `'' | null` refused null.
    [
      'a nullable example admits null',
      "function f(s: '' | null) { return { s } }",
      null,
      5,
    ],
  ]
  for (const [what, src, good, bad] of rows)
    it(what, async () => {
      const key = src.match(/\(\{?\s*(\w+)/)![1]!
      expect(refused(await run(src, { [key]: good }))).toBe(false)
      expect(refused(await run(src, { [key]: bad }))).toBe(true)
    })

  it('the schema says so', () => {
    const props = (src: string) => transpile(src).ast.inputSchema.properties
    expect(props('function f(n: 10) { return { n } }').n).toEqual({
      type: 'integer',
    })
    expect(props('function f(n: +0) { return { n } }').n).toEqual({
      type: 'integer',
      minimum: 0,
    })
    // a literal union carries its type, or undefined passes the enum (#4100)
    expect(props("function f(m: 'a' | 'b') { return { m } }").m).toEqual({
      type: 'string',
      enum: ['a', 'b'],
    })
  })
})

describe('inputs JSON cannot carry are refused at transpile time, with a remedy', () => {
  it('a bigint example', () => {
    expect(() => transpile('function f(n: 10n) { return { n } }')).toThrow(
      /JSON|string/
    )
  })
  it('a regex-pattern example', () => {
    expect(() =>
      transpile('function f(zip: /^\\d{5}$/) { return { zip } }')
    ).toThrow(/regexMatch|pattern/)
  })
})
