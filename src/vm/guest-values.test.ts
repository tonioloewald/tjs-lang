/**
 * The guest value domain is CLOSED: data (a Set, Date or regex is data too since round 13), never
 * a host function or a builtin namespace (rc.2 fifteenth re-review B1, round 11).
 *
 * The rule used to be enforced at the one read site where an instance was observed (`member`),
 * and the review found eight other routes. This is the ratchet: every route, and for each, that
 * no function reaches guest state, a capability, or the host's result. Add a row when a new route
 * is found; a row that starts passing without the fix it pins is a broken apparatus.
 */
import { describe, it, expect } from 'bun:test'
import { join } from 'node:path'
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

/** No function anywhere in a value — enumerable or not (an `Object.values` walk could not see a
 * non-enumerable one: sixteenth re-review). */
function hasFunction(v: unknown, seen = new Set<unknown>()): boolean {
  if (typeof v === 'function') return true
  if (!v || typeof v !== 'object' || seen.has(v)) return false
  seen.add(v)
  return Reflect.ownKeys(v).some((k) => {
    const d = Object.getOwnPropertyDescriptor(v, k)!
    return 'value' in d ? hasFunction(d.value, seen) : true // an accessor is host code
  })
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
      'a Set method read as a value',
      'const s = Set([1])\n const f = s.add\n return { f }',
    ],
  ]
  for (const [name, body] of ROUTES)
    it(`refused: ${name}`, async () => {
      const r = await attempt(`function f() { ${body} }`)
      expect('refused' in r ? r.refused : 'admitted').toMatch(REFUSED)
    })

  it('a Set or Date yields no function by enumeration or copy', async () => {
    const r = await attempt(`function f() {
      const s = Set([1, 2])
      const d = Date('2024-01-15')
      return { a: Object.values(s), b: Object.assign({}, s), c: { ...d }, k: Object.keys(s) }
    }`)
    // refused, or a result with no function in it
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

  it("a Set's methods cannot be replaced", async () => {
    // AsyncJS has no member assignment, and Object.assign into a Set is refused
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

describe('round 12: the domain is checked where values ENTER guest state (sixteenth re-review)', () => {
  it('apparatus: hasFunction sees a non-enumerable function', () => {
    const o = {}
    Object.defineProperty(o, 'f', { value: () => 1, enumerable: false })
    expect(hasFunction(o)).toBe(true)
  })

  const sinkVM = () => {
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
    return { vm: new AgentVM({ sink } as any), received }
  }

  for (const key of [
    'constructor',
    'toString',
    'valueOf',
    '__defineGetter__',
    '__proto__',
    'hasOwnProperty',
  ])
    it(`an inherited argument '${key}' never reaches a capability or the result`, async () => {
      const { vm, received } = sinkVM()
      for (const ast of [
        // v2: an argument node
        {
          $ajs: 2,
          op: 'seq',
          steps: [
            { op: 'sink', v: { $kind: 'arg', path: key } },
            { op: 'return', value: { v: { $kind: 'arg', path: key } } },
          ],
        },
        // v1: a bare 'args.' reference, and varsImport
        { op: 'seq', steps: [{ op: 'sink', v: `args.${key}` }] },
        {
          op: 'seq',
          steps: [
            { op: 'varsImport', keys: { g: key } },
            { op: 'sink', v: 'g' },
          ],
        },
      ]) {
        const r = await vm.run(ast as any, {}, { fuel: 1000 })
        expect(hasFunction(r.result)).toBe(false)
      }
      expect(
        received.some((v) => hasFunction(v) || v === Object.prototype)
      ).toBe(false)
    })

  it('a parameter named like an inherited member defaults as written', async () => {
    const r = await attempt(
      'function f(toString = 1) { return { v: toString } }'
    )
    expect((r as any).result).toEqual({ v: 1 })
  })

  it("an atom RESULT is checked where it is bound: pick of a Set's methods", async () => {
    const { vm, received } = sinkVM()
    const r = await vm.run(
      {
        op: 'seq',
        steps: [
          {
            op: 'varSet',
            key: 'set',
            value: {
              $expr: 'call',
              callee: 'Set',
              arguments: [{ $expr: 'literal', value: [1] }],
            },
          },
          {
            op: 'pick',
            obj: { $expr: 'ident', name: 'set' },
            keys: ['add', 'has'],
            result: 'p',
          },
          { op: 'sink', v: { $expr: 'ident', name: 'p' } },
          { op: 'return', value: { p: { $expr: 'ident', name: 'p' } } },
        ],
      } as any,
      {},
      { fuel: 1000 }
    )
    expect(hasFunction(r.result)).toBe(false)
    expect(received.some((v) => hasFunction(v))).toBe(false)
  })

  it('a pure atom returning a function is refused where the result is bound', async () => {
    // Observed through a v1 bare-string reference ('f'), which reads state WITHOUT an
    // expression: only the bind walk stands between the atom result and the capability.
    const received: unknown[] = []
    const leak = defineAtom('leak', undefined, undefined, async () => () => 1, {
      effects: 'pure',
    })
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
    const r = await new AgentVM({ leak, sink } as any).run(
      {
        op: 'seq',
        steps: [
          { op: 'leak', result: 'f' },
          { op: 'sink', v: 'f' },
        ],
      } as any,
      {},
      { fuel: 1000 }
    )
    expect(r.error?.message ?? 'admitted').toMatch(/not a value/)
    expect(received.length).toBe(0)
  })

  it('a refused bind is rolled back: a catch cannot reach the value', async () => {
    const received: unknown[] = []
    const leak = defineAtom('leak', undefined, undefined, async () => () => 1, {
      effects: 'pure',
    })
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
    await new AgentVM({ leak, sink } as any).run(
      {
        op: 'seq',
        steps: [
          { op: 'try', try: [{ op: 'leak', result: 'f' }], catch: [] },
          { op: 'sink', v: 'f' },
        ],
      } as any,
      {},
      { fuel: 1000 }
    )
    expect(received.some((v) => hasFunction(v))).toBe(false)
  })

  it('a Set or Date leaving the VM is data, so a structuredClone keeps it (M1)', async () => {
    const r = await attempt(
      `function f() { return { s: Set([1, 2, 3]), d: Date('2024-01-15') } }`
    )
    const result = (r as any).result
    expect(hasFunction(result)).toBe(false)
    const cloned = structuredClone(result)
    expect(cloned.s).toEqual([1, 2, 3])
    expect(cloned).toEqual(result)
  })

  it('cyclic arguments cannot hang inputSchema validation, even with infinite fuel (B3)', async () => {
    const a: any = { a: 0 }
    a.self = a
    const t = performance.now()
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [],
        inputSchema: { type: 'object', properties: { x: { type: 'object' } } },
      } as any,
      { x: a },
      { fuel: Infinity }
    )
    expect(r.error?.message ?? 'admitted').toMatch(/too large to validate/)
    expect(performance.now() - t).toBeLessThan(2000)
  })
})

describe('round 13: agentRun hands the child exactly what the caller passed (seventeenth re-review M2)', () => {
  for (const [name, child] of [
    ['a v1 child', { op: 'seq', steps: [{ op: 'sink', v: 'args.v' }] }],
    [
      'a v2 child',
      {
        $ajs: 2,
        op: 'seq',
        steps: [{ op: 'sink', v: { $kind: 'arg', path: 'v' } }],
      },
    ],
  ] as const)
    it(`${name}: the input is resolved once, and the inline AST is not evaluated in the caller`, async () => {
      const got: unknown[] = []
      const sink = defineAtom(
        'sink',
        s.object({ v: s.any }),
        s.any,
        async ({ v }) => {
          got.push(v)
          return null
        },
        { effects: 'io' }
      )
      await new AgentVM({ sink } as any).run(
        {
          op: 'seq',
          steps: [
            { op: 'varSet', key: 'secret', value: 'S' },
            // DATA that happens to name a caller variable: a second resolve read it as one
            {
              op: 'varSet',
              key: 'name',
              value: { $expr: 'literal', value: 'secret' },
            },
            { op: 'agentRun', agentId: child, input: { v: 'name' } },
          ],
        } as any,
        {},
        { fuel: 1000 }
      )
      expect(got).toEqual(['secret'])
    })
})

describe('round 13: inputSchema validation is bounded on schema × arguments (seventeenth re-review m2)', () => {
  it('a large schema against large arguments is refused before validating, even with infinite fuel', async () => {
    const anyOf = Array.from({ length: 2000 }, (_, i) => ({
      type: 'object',
      properties: { [`k${i}`]: { type: 'number' } },
      required: [`k${i}`],
    }))
    // every item matches only the LAST branch: validation tries all of them
    const leaf = () => Array.from({ length: 100 }, (_, i) => ({ k1999: i }))
    const args = { x: Array.from({ length: 100 }, () => leaf()) }
    const t = performance.now()
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [],
        inputSchema: {
          type: 'object',
          properties: {
            x: { type: 'array', items: { type: 'array', items: { anyOf } } },
          },
        },
      } as any,
      args,
      { fuel: Infinity }
    )
    expect(r.error?.message ?? 'admitted').toMatch(/too large to validate/)
    expect(performance.now() - t).toBeLessThan(2000)
  })
})

describe('round 13: a Set, Date and regex are data (seventeenth re-review)', () => {
  it("a Set's membership index is measured: one more slot per item than its array", async () => {
    // grown in place with `add`, so the true measurement (reconcile) decides — not the factory's
    // allocation bound, which already covers a Set built in one call
    const opts = { fuel: 1e7, maxHeapBytes: 3_000_000, argsMaxBytes: 1e8 }
    const run = (n: number) =>
      new AgentVM().run(
        transpile(
          'function f(a: [0]) { const s = Set([])\n for (const x of a) { s.add(x) }\n return { n: s.length } }'
        ).ast,
        { a: Array.from({ length: n }, (_, i) => i) },
        opts
      )
    expect((await run(100_000)).error).toBeUndefined()
    // ~1.2MB of arguments + 1.2MB of items + 1.2MB of index: over 3MB only if the index counts
    expect((await run(150_000)).error?.message ?? 'admitted').toMatch(
      /Heap limit/
    )
  })

  it('push (v1) and Object.assign cannot write into a Set', async () => {
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          {
            op: 'varSet',
            key: 's',
            value: {
              $expr: 'call',
              callee: 'Set',
              arguments: [{ $expr: 'literal', value: [1] }],
            },
          },
          { op: 'push', list: 's', item: 2 },
        ],
      } as any,
      {},
      { fuel: 1000 }
    )
    expect(r.error?.message ?? 'admitted').toMatch(
      /push cannot write into a Set/
    )
    const b = await attempt(
      'function f() { const s = Set([1])\n Object.assign(s, [5, 6])\n return { s } }'
    )
    expect('refused' in b ? b.refused : 'admitted').toMatch(
      /cannot write into a Set/
    )
  })

  it('a Date has ONE form: guest JSON, a capability input and the run result agree', async () => {
    const r = await attempt(`function f() {
      const d = Date('2024-01-15T10:00:00Z')
      return { d, y: d.year, m: d.month, j: JSON.stringify(d), n: d.add({ days: 1 }).value }
    }`)
    const res = (r as any).result
    expect(res.y).toBe(2024)
    expect(res.m).toBe(1)
    expect(res.n).toBe('2024-01-16T10:00:00.000Z')
    // no special serializer anywhere: the guest's JSON is the host's JSON of the same value
    expect(res.j).toBe(JSON.stringify(res.d))
    expect(res.d.value).toBe('2024-01-15T10:00:00.000Z')
  })

  it('a program produces the same bytes in every host time zone (eighteenth re-review B1)', () => {
    // its own process per TZ: the zone is read when the process starts
    const run = (TZ: string) => {
      const p = Bun.spawnSync(
        [process.execPath, join(import.meta.dir, 'date-tz.probe.ts')],
        { env: { ...process.env, TZ } }
      )
      expect(p.exitCode).toBe(0)
      return JSON.parse(p.stdout.toString().trim().split('\n').pop()!)
    }
    const utc = run('UTC')
    // apparatus: the zones really differ for this instant (midnight UTC is the previous day in LA)
    expect(
      new Date('2020-01-01T00:00:00Z').toLocaleDateString('en-US', {
        timeZone: 'America/Los_Angeles',
      })
    ).toBe('12/31/2019')
    expect(utc.error).toBeUndefined()
    expect(utc.result.d.year).toBe(2020)
    expect(utc.result.f).toBe('2020-01-01')
    expect(utc.result.dst.value).toBe('2020-03-08T12:00:00.000Z')
    // a capability input is the same form as the guest's own JSON
    expect(JSON.stringify(utc.got[0])).toBe(utc.result.j)
    for (const tz of [
      'America/Los_Angeles',
      'Asia/Kolkata',
      'Pacific/Kiritimati',
    ])
      expect(run(tz)).toEqual(utc)
  })
})

describe('round 14: one reading of every member and call shape (eighteenth re-review)', () => {
  it('v2: an inline sub-agent AST is an expression evaluated in the caller (transpiled)', async () => {
    const r = await attempt(`function f() {
      const k = 7
      const r = agentRun({ agentId: { op: 'seq', steps: [{ op: 'return', value: { x: k } }] }, input: {} })
      return { r }
    }`)
    expect((r as any).result).toEqual({ r: { x: 7 } })
  })

  it('a positional atom call is refused with the named shape, never run with undefined inputs', async () => {
    const r = await attempt(
      "function f() { const r = agentRun('tok', { a: 1 })\n return { r } }"
    )
    // refused at TRANSPILE time (the whole table is in call-shape.test.ts)
    expect('refused' in r ? r.refused : 'admitted').toMatch(
      /'agentRun' takes named arguments: write agentRun\(\{ name: value, … \}\)/
    )
  })

  it("a Set's size reads the same by member, v1 dot-path and pick", async () => {
    const member = await attempt(
      'function f() { const s = Set([1, 2, 3])\n return { n: s.size } }'
    )
    expect((member as any).result).toEqual({ n: 3 })
    const v1 = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          {
            op: 'varSet',
            key: 's',
            value: {
              $expr: 'call',
              callee: 'Set',
              arguments: [{ $expr: 'literal', value: [1, 2, 3] }],
            },
          },
          { op: 'varGet', key: 's.size', result: 'n' },
          { op: 'pick', obj: 's', keys: ['size'], result: 'p' },
          { op: 'return', value: { n: 'n', p: 'p' } },
        ],
      } as any,
      {},
      { fuel: 1000 }
    )
    expect(v1.error).toBeUndefined()
    expect(v1.result).toEqual({ n: 3, p: { size: 3 } })
  })
})

describe('round 15: one definition per rule, and the empty case (nineteenth re-review)', () => {
  it('a zero-argument call to an atom with all-optional named inputs runs (random())', async () => {
    const r = await attempt(
      'function f() { const r = random()\n return { ok: typeof r == "number" } }'
    )
    expect((r as any).result).toEqual({ ok: true })
  })

  // The empty-call cells (emitter output and persisted shapes, positional and named atoms) live in
  // call-shape.test.ts, which pins the whole table in one place (twentieth re-review).

  it('Date() accepts every form a date takes: a guest Date, its JSON copy, its value, its timestamp', async () => {
    const r = await attempt(`function f() {
      const d = Date('2024-01-15T10:00:00Z')
      const copy = JSON.parse(JSON.stringify(d))
      return {
        a: Date(d).value,
        b: Date(copy).value,
        c: Date(d.value).value,
        e: Date(d.timestamp).value,
        later: Date(copy).add({ days: 1 }).isAfter(copy),
      }
    }`)
    const iso = '2024-01-15T10:00:00.000Z'
    expect((r as any).result).toEqual({
      a: iso,
      b: iso,
      c: iso,
      e: iso,
      later: true,
    })
  })

  it("format's keywords are case-insensitive (the prompt taught 'iso')", async () => {
    const r = await attempt(
      "function f() { const d = Date('2024-01-15T10:00:00Z')\n return { a: d.format('iso'), b: d.format('ISO'), c: d.format('Date') } }"
    )
    expect((r as any).result).toEqual({
      a: '2024-01-15T10:00:00.000Z',
      b: '2024-01-15T10:00:00.000Z',
      c: '2024-01-15',
    })
  })

  it('Date.parse is the same door as Date(), and a date out of range is not one', async () => {
    const ok = await attempt(
      "function f() { return { v: Date.parse('2024-01-15T10:00:00Z').value } }"
    )
    expect((ok as any).result).toEqual({ v: '2024-01-15T10:00:00.000Z' })
    const bad = await attempt(
      "function f() { return { v: Date.parse('garbage') } }"
    )
    expect('refused' in bad ? bad.refused : 'admitted').toMatch(
      /Invalid date: 'garbage' does not parse/
    )
    for (const v of ['1e20', '{ timestamp: 1e300 }'])
      expect(
        ((await attempt(`function f() { return { v: Date(${v}) } }`)) as any)
          .refused ?? 'admitted'
      ).toMatch(/a Date, a number or a string/)
  })

  it('a date that is not one is refused by name, before the factory', async () => {
    const r = await attempt('function f() { return { d: Date({ a: 1 }) } }')
    expect('refused' in r ? r.refused : 'admitted').toMatch(
      /a Date, a number or a string/
    )
  })
})
