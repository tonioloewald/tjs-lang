/**
 * The guest value domain is CLOSED: data and the VM's own wrappers, never a host function or a
 * builtin namespace (rc.2 fifteenth re-review B1, round 11).
 *
 * The rule used to be enforced at the one read site where an instance was observed (`member`),
 * and the review found eight other routes. This is the ratchet: every route, and for each, that
 * no function reaches guest state, a capability, or the host's result. Add a row when a new route
 * is found; a row that starts passing without the fix it pins is a broken apparatus.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { defineAtom } from './runtime'
import { s } from 'tosijs-schema'

/** Run AJS source; return the refusal message, or the result. */
async function attempt(src: string, vm = new AgentVM(), opts: any = {}) {
  let ast
  try {
    ast = transpile(src).ast
  } catch (e: any) {
    return { refused: e.message as string }
  }
  const r = await vm.run(ast, {}, { fuel: 10_000, ...opts })
  return r.error ? { refused: r.error.message as string } : { result: r.result }
}

/** No function anywhere in a value (what the host would receive). */
function hasFunction(v: unknown, seen = new Set<unknown>()): boolean {
  if (typeof v === 'function') return true
  if (!v || typeof v !== 'object' || seen.has(v)) return false
  seen.add(v)
  return Object.values(v).some((x) => hasFunction(x, seen))
}

const REFUSED = /not a value|is a method|not available|not callable/

describe('no route makes a host function or namespace a guest value', () => {
  const ROUTES: Array<[string, string]> = [
    [
      'an ident of a builtin function',
      'const g = parseInt\n return { ok: true }',
    ],
    ['an ident of Set', 'const g = Set\n return { ok: true }'],
    ['an ident of Date', 'const g = Date\n return { ok: true }'],
    ['an ident of filter', 'const g = filter\n return { ok: true }'],
    ['a namespace bound as a value', 'const o = JSON\n return { ok: true }'],
    ['a namespace returned', 'return { m: Math }'],
    ['console returned', 'return { c: console }'],
    ['Object.values of a namespace', 'return { v: Object.values(Math) }'],
    ['Object.assign of a namespace', 'return { v: Object.assign({}, JSON) }'],
    [
      'toJSON with a builtin',
      'return { v: JSON.stringify({ k: { toJSON: encodeURIComponent } }) }',
    ],
    ['join printing a builtin', "return { v: [Set].join('') }"],
    [
      'a method read as a value',
      "const f = 'a'.toUpperCase\n return { ok: true }",
    ],
    [
      'a wrapper method read as a value',
      'const s = Set([1])\n const f = s.add\n return { ok: true }',
    ],
  ]
  for (const [name, body] of ROUTES)
    it(`refused: ${name}`, async () => {
      const r = await attempt(`function f() { ${body} }`)
      expect('refused' in r ? r.refused : 'admitted').toMatch(REFUSED)
    })

  it('a VM wrapper cannot be harvested by enumeration or copy', async () => {
    const r = await attempt(`function f() {
      const s = Set([1, 2])
      const d = Date('2024-01-15')
      return { a: Object.values(s), b: Object.assign({}, s), c: { ...d }, k: Object.keys(s) }
    }`)
    // refused (a wrapper is not an object argument), or a result with no function in it
    if ('result' in r) expect(hasFunction((r as any).result)).toBe(false)
    else expect(r.refused).toBeTruthy()
  })

  it('a dot-path read (v1 varGet) of a method is refused before it reaches state', async () => {
    // observed through a capability: a v1 string reference ('g') carries a state value to an atom
    // without passing through an expression, so the refusal must happen at the dot-path read
    const received: unknown[] = []
    const sink = defineAtom(
      'sink',
      s.object({ v: s.any }),
      s.any,
      async ({ v }) => {
        received.push(v)
        return null
      },
      { effects: 'io' }
    )
    const r = await new AgentVM({ sink } as any).run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'a', value: [1, 2] },
          { op: 'varGet', key: 'a.push', result: 'g' },
          { op: 'sink', v: 'g' },
        ],
      } as any,
      {},
      { fuel: 1000 }
    )
    expect(r.error?.message ?? 'admitted').toMatch(REFUSED)
    expect(received.length).toBe(0)
  })

  it('a method call runs the INTRINSIC, never a property the guest owns', async () => {
    const r = await attempt(`function f() {
      const o = { hasOwnProperty: 5, toString: 'x' }
      return { own: o.hasOwnProperty('toString'), other: o.hasOwnProperty('nope') }
    }`)
    // the guest's `hasOwnProperty: 5` is data; the call is Object.prototype.hasOwnProperty
    expect((r as any).result).toEqual({ own: true, other: false })
  })

  it('a VM wrapper method cannot be replaced', async () => {
    // AsyncJS has no member assignment, and a wrapper is not an object argument to
    // Object.assign; the sealed (non-writable) methods are defense in depth behind both
    for (const body of [
      'const s = Set([1])\n s.add = 5\n return { ok: true }',
      'const s = Set([1])\n Object.assign(s, { add: 5 })\n return { ok: true }',
    ]) {
      const r = await attempt(`function f() { ${body} }`)
      expect('refused' in r).toBe(true)
    }
  })

  it('a capability never receives a host function', async () => {
    const received: unknown[] = []
    const sink = defineAtom(
      'sink',
      s.object({ v: s.any }),
      s.any,
      async ({ v }) => {
        received.push(v)
        return null
      },
      { effects: 'io' }
    )
    for (const arg of [
      'parseInt',
      'Object.assign({}, JSON)',
      'Object.values(Math)',
    ]) {
      const r = await attempt(
        `function f() { sink({ v: ${arg} })\n return { ok: true } }`,
        new AgentVM({ sink } as any)
      )
      expect('refused' in r ? r.refused : 'admitted').toMatch(REFUSED)
    }
    expect(received.some((v) => hasFunction(v))).toBe(false)
  })

  it("the host's result never holds a function, and JSON.stringify of it never throws", async () => {
    for (const body of [
      'return { v: JSON }',
      'return { v: [Math] }',
      'const o = { m: console }\n return { o }',
    ]) {
      const r = await new AgentVM().run(
        transpile(`function f() { ${body} }`).ast,
        {},
        { fuel: 1000 }
      )
      expect(hasFunction(r.result)).toBe(false)
      expect(() => JSON.stringify(r)).not.toThrow()
    }
  })
})
