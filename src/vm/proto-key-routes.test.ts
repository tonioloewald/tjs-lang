/**
 * No guest object holds an own `__proto__` key, on any route (#4099, a 0.14.0 blocker).
 *
 * `setGuestKey` refuses the key, so `obj[k] = v`, `{ ...a }` and `Object.assign` inside the
 * guest could never make one. Four routes went around it, and each put an own `__proto__` key
 * into the host's result: `Object.fromEntries` and `JSON.parse` (host natives that create keys
 * themselves), a capability's return, and the run arguments (membrane copies). A host that
 * merged the result naively (`Object.assign({}, result.o)`) had its target's prototype replaced.
 * The VM's own prototypes were never touched. Now every route refuses the key.
 *
 * Inbound, the key is valid JSON, so a capability return carrying one is the WORLD's doing
 * ('limit'): refused and catchable. Outbound, a value that reaches a capability with one cannot
 * exist, since the guest cannot build it.
 *
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'
import { defineAtom } from './runtime'
import { s as schema } from 'tosijs-schema'

const hostile = () => JSON.parse('{"__proto__":{"polluted":true}}')

const run = (src: string, opts: { capabilities?: any; args?: any } = {}) =>
  new AgentVM().run(transpile(src).ast, opts.args ?? {}, {
    fuel: 1000,
    capabilities: opts.capabilities ?? {},
  })

/** What a host that merges the result naively would see. */
const pollutes = (result: any) =>
  Object.values(result ?? {}).some(
    (v: any) =>
      v &&
      typeof v === 'object' &&
      (Object.getPrototypeOf(Object.assign({}, v)) as any)?.polluted === true
  )

describe('every route refuses an own __proto__ key', () => {
  const rows: [string, string, { capabilities?: any; args?: any }, RegExp][] = [
    [
      'Object.fromEntries in the guest',
      `function f({ key = '__proto__' }) { let o = Object.fromEntries([[key, { polluted: true }]]) \n return { o } }`,
      {},
      /'__proto__' is not allowed as an object key/,
    ],
    [
      'JSON.parse in the guest',
      `function f({}) { let o = JSON.parse('{"__proto__":{"polluted":true}}') \n return { o } }`,
      {},
      /'__proto__' is not allowed as an object key/,
    ],
    [
      'JSON.parse, nested',
      `function f({}) { let o = JSON.parse('{"a":[{"__proto__":{"polluted":true}}]}') \n return { o } }`,
      {},
      /'__proto__' is not allowed as an object key/,
    ],
    [
      "a capability's return",
      `function f({}) { let o = httpFetch({ url: 'https://x.test/' }) \n return { o } }`,
      { capabilities: { fetch: async () => hostile() } },
      /own '__proto__' key/,
    ],
    [
      'the run arguments',
      `function f({ o = {} }) { return { o } }`,
      { args: { o: hostile() } },
      /own '__proto__' key/,
    ],
  ]
  for (const [what, src, opts, why] of rows)
    it(what, async () => {
      const r = await run(src, opts)
      expect(r.error?.message).toMatch(why)
      expect(pollutes(r.result)).toBe(false)
    })
})

describe('the inbound refusal is the world’s doing, so it is catchable', () => {
  it('a try around the fetch catches it and the run goes on', async () => {
    const r = await run(
      `function f({}) {
  let caught = ''
  try { let o = httpFetch({ url: 'https://x.test/' }) } catch (e) { caught = e }
  return { caught }
}`,
      { capabilities: { fetch: async () => hostile() } }
    )
    expect(r.error).toBeUndefined()
    expect(r.result.caught).toMatch(/__proto__/)
  })
})

describe('ordinary data still crosses (the other direction)', () => {
  it('keys named proto, constructor-like text and nested objects are fine', async () => {
    const r = await run(
      `function f({ o = {} }) { let p = JSON.parse('{"proto":1,"__proto":2,"a":{"b":[1]}}') \n let q = Object.fromEntries([['x', 1]]) \n return { o, p, q } }`,
      { args: { o: { proto: { a: 1 }, list: [1, 2] } } }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({
      o: { proto: { a: 1 }, list: [1, 2] },
      p: { proto: 1, __proto: 2, a: { b: [1] } },
      q: { x: 1 },
    })
  })
})

/**
 * Two more routes, found by the 0.14.0 final review (B1): a custom atom tagged `pure` skips the
 * membrane, and its return was checked for non-data but not for this key, so a host `JSON.parse`
 * of guest text reached the host's result; and a regex named group `(?<__proto__>…)` gave
 * `match().groups` an own `__proto__` key. Both now refuse it where the value enters guest data.
 */
describe('routes through host code and the regex engine', () => {
  const parseJson = defineAtom(
    'parseJson',
    schema.object({ text: schema.string }),
    undefined,
    async ({ text }: { text: string }) => JSON.parse(text),
    { effects: 'pure' }
  )
  const atoms = { parseJson }
  const runWith = (src: string) =>
    new AgentVM(atoms).run(transpile(src, { atoms }).ast, {}, { fuel: 1000 })

  it("a custom pure atom's return", async () => {
    const r = await runWith(
      `function f({}) { let o = parseJson({ text: '{"__proto__":{"polluted":true}}' }) \n return { o } }`
    )
    expect(r.error?.message).toMatch(/own '__proto__' key/)
    expect(pollutes(r.result)).toBe(false)
  })
  it("a custom pure atom's ordinary return still crosses (the other direction)", async () => {
    const r = await runWith(
      `function f({}) { let o = parseJson({ text: '{"proto":{"a":1}}' }) \n return { o } }`
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ o: { proto: { a: 1 } } })
  })
  it('a regex named group, as a literal (refused at transpile time)', () => {
    expect(() =>
      transpile(
        `function f({ s = 'a' }) { let m = s.match(/(?<__proto__>a)/) \n return { m } }`
      )
    ).toThrow(/'__proto__' is not allowed as a group name/)
  })
  it('a regex named group, from a string at run time', async () => {
    const r = await run(
      `function f({ p = '(?<__proto__>a)' }) { let m = 'a'.match(p) \n return { m } }`
    )
    expect(r.error?.message).toMatch(
      /'__proto__' is not allowed as a group name/
    )
  })
})
