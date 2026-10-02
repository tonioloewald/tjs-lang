/**
 * Guest schemas, round 10 (docs/reviews/0.14.0-rc.2-rereview-14.md, decision: Schema as data).
 *
 * - The closed dialect is held to what tosijs-schema actually enforces (a drift test).
 * - Guest `Schema` is DATA: no builder object, and so no host closure, ever enters guest state.
 * - A member read never hands guest code a host function.
 * - Validation is charged as schema nodes × data nodes, before it runs, at every door.
 * - Every LLM door admits its response format and tool schemas, with the shape allowlisted.
 */
import { describe, it, expect } from 'bun:test'
import { ENFORCED_KEYWORDS, ENFORCED_FORMATS } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { GUEST_FORMATS, GUEST_SCHEMA_KEYWORD_NAMES } from './runtime'

const run = (src: string, args: any = {}, opts: any = {}) =>
  new AgentVM().run(transpile(src).ast, args, { fuel: 1000, ...opts })

describe('the closed dialect does not drift from the library', () => {
  it('every admitted keyword is one tosijs-schema enforces (or a pure annotation)', () => {
    const annotations = new Set(['title', 'description', 'default', 'examples'])
    expect(
      GUEST_SCHEMA_KEYWORD_NAMES.filter(
        (k) => !ENFORCED_KEYWORDS.has(k) && !annotations.has(k)
      )
    ).toEqual([])
  })
  it('every admitted format is still enforced upstream', () => {
    expect([...GUEST_FORMATS].filter((f) => !ENFORCED_FORMATS.has(f))).toEqual(
      []
    )
  })
})

describe('guest Schema is data (Tonio, 2026-10-02)', () => {
  it('Schema constants and constructors return plain JSON', async () => {
    const r = await run(`function f() {
      return {
        str: Schema.string,
        obj: Schema.object({ a: Schema.string, n: Schema.number }),
        resp: Schema.response('r', { name: '' }),
        ok: Schema.isValid({ a: 'x', n: 1 }, Schema.object({ a: Schema.string, n: Schema.number })),
        bad: Schema.isValid({ a: 1 }, Schema.object({ a: Schema.string })),
      }
    }`)
    expect(r.error).toBeUndefined()
    expect(r.result.str).toEqual({ type: 'string' })
    expect(r.result.obj).toEqual({
      type: 'object',
      properties: { a: { type: 'string' }, n: { type: 'number' } },
      required: ['a', 'n'],
      additionalProperties: false,
    })
    expect(r.result.resp.json_schema.schema.type).toBe('object')
    expect(r.result.ok).toBe(true)
    expect(r.result.bad).toBe(false)
  })

  it('the DOCS-AJS Schema example runs as documented (a nullable field is optional)', async () => {
    const src = `function f(input: any) {
      let schema = Schema.response('user', Schema.object({
        email: Schema.email,
        age: { type: 'integer', minimum: 0, maximum: 150 },
        nickname: { type: ['string', 'null'] },
        role: Schema.enum(['admin', 'user', 'guest']),
      }))
      return { ok: Schema.isValid(input, schema.json_schema.schema), required: schema.json_schema.schema.required }
    }`
    const good = await run(src, {
      input: { email: 'a@b.co', age: 30, role: 'user' },
    })
    const bad = await run(src, { input: { email: 'x', age: 300, role: 'god' } })
    expect(good.result).toEqual({
      ok: true,
      required: ['email', 'age', 'role'],
    })
    expect(bad.result.ok).toBe(false)
  })

  it('a constraint is a keyword now, not a chained builder call', async () => {
    const r = await run(`function f() {
      const short = { ...Schema.string, maxLength: 3 }
      return { a: Schema.isValid('abc', short), b: Schema.isValid('abcd', short) }
    }`)
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ a: true, b: false })
  })

  it("the library's own pattern still works (Schema.emoji)", async () => {
    const r = await run(
      `function f() { return { v: Schema.isValid('😀', Schema.emoji) } }`
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: true })
  })

  for (const [name, body] of [
    [
      'builder chaining (the B1 route)',
      `const b = Schema.email.meta({ pattern: ['^(a+)+$'] })`,
    ],
    ['a string method as a value', `const f = 'a'.toUpperCase`],
  ] as const)
    it(`refused: ${name}`, async () => {
      // refused at transpile time or at run time — either way, never run
      let message: string
      try {
        const r = await run(`function f() { ${body}\n return { ok: true } }`)
        message = r.error?.message ?? 'admitted'
      } catch (e: any) {
        message = e.message
      }
      expect(message).toMatch(
        /not available|not callable|is a method|not a value/
      )
    })

  it('a Schema method read as a value is nothing to steal (Schema holds data only)', async () => {
    const r = await run(`function f() {
      const o = { schema: {}, validate: Schema.isValid }
      return { v: Schema.object, o }
    }`)
    expect(r.error).toBeUndefined()
    expect(r.result.v ?? null).toBeNull()
    expect(r.result.o.validate ?? null).toBeNull()
  })
})

describe('validation is charged as schema × data, before it runs (fourteenth re-review M3)', () => {
  // ~3,300 branches against a 97×97 array: 630ms of host time for 63 fuel when charged as a sum
  const anyOf = Array.from({ length: 3300 }, (_, i) => ({ const: i }))
  const sch = { type: 'array', items: { type: 'array', items: { anyOf } } }
  const d = Array.from({ length: 97 }, () =>
    Array.from({ length: 97 }, () => 1)
  )
  for (const [door, body] of [
    ['Schema.isValid', 'Schema.isValid(d, sch)'],
    ['filter', "filter({ d }, { type: 'object', properties: { d: sch } })"],
  ] as const)
    it(door, async () => {
      const t = performance.now()
      const r = await run(
        `function f(d: any, sch: any) { return { v: ${body} } }`,
        { d, sch },
        { fuel: 63, timeoutMs: 10_000 }
      )
      expect(r.error?.message ?? 'completed').toMatch(/Out of Fuel/)
      expect(performance.now() - t).toBeLessThan(300)
    })

  it('the charge is the PRODUCT: a run that can afford it pays it (isValid and inputSchema)', async () => {
    // ~6,600 schema nodes × ~9,500 data nodes × 0.00005 ≈ 3,150 fuel; a sum would be ~1
    const product = 3000
    const a = await run(
      'function f(d: any, sch: any) { return { v: Schema.isValid(d, sch) } }',
      { d, sch },
      { fuel: 1e6, timeoutMs: 60_000 }
    )
    expect(a.error).toBeUndefined()
    expect(a.fuelUsed).toBeGreaterThan(product)
    const b = await new AgentVM().run(
      {
        op: 'seq',
        steps: [],
        inputSchema: { type: 'object', properties: { d: sch } },
      } as any,
      { d },
      { fuel: 1e6 }
    )
    expect(b.error).toBeUndefined()
    expect(b.fuelUsed).toBeGreaterThan(product)
  })

  it('inputSchema: DAG-shaped arguments are counted per path, as validation walks them (M3)', async () => {
    // one array referenced 97 times at each of 4 levels: ~88M paths, almost no distinct objects
    let v: any = 1
    for (let i = 0; i < 4; i++) v = Array(97).fill(v)
    const nested = (n: number): any =>
      n === 0 ? { type: 'number' } : { type: 'array', items: nested(n - 1) }
    const t = performance.now()
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [],
        inputSchema: { type: 'object', properties: { d: nested(4) } },
      } as any,
      { d: v },
      { fuel: 1000 }
    )
    expect(r.error?.message ?? 'admitted').toMatch(/Out of Fuel/)
    expect(performance.now() - t).toBeLessThan(300)
  })

  it('inputSchema: validation paid at admission, refused if it cannot be afforded', async () => {
    const t = performance.now()
    const anyOf = Array.from({ length: 3300 }, (_, i) => ({ const: i }))
    const r = await new AgentVM().run(
      {
        op: 'seq',
        steps: [],
        inputSchema: {
          type: 'object',
          properties: {
            d: { type: 'array', items: { type: 'array', items: { anyOf } } },
          },
        },
      } as any,
      {
        d: Array.from({ length: 97 }, () =>
          Array.from({ length: 97 }, () => 1)
        ),
      },
      { fuel: 63 }
    )
    // refused AT ADMISSION, before validating: not by the first step after validation ran
    expect({
      message: r.error?.message,
      op: (r.error as any)?.op,
      fuelUsed: r.fuelUsed,
    }).toEqual({
      message: 'Out of Fuel',
      op: 'vm.run',
      fuelUsed: 0,
    })

    expect(performance.now() - t).toBeLessThan(200)
  })
})

describe('validation cost is calibrated (fifteenth/sixteenth re-reviews)', () => {
  it('Schema.isValid on ~3MB of plain data completes under default limits (M1)', async () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => ({
      id: i,
      name: 'row' + i,
      ok: true,
    }))
    const r = await run(
      `function f(rows: any) { return { v: Schema.isValid(rows, { type: 'array', items: { type: 'object', properties: { id: { type: 'number' }, name: { type: 'string' }, ok: { type: 'boolean' } } } }) } }`,
      { rows },
      { fuel: 1_000_000, timeoutMs: 60_000 }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: true })
  })

  it('validation costs about what a loop costs per fuel (within 10×)', async () => {
    const anyOf = Array.from({ length: 300 }, (_, i) => ({ const: i }))
    const data = Array.from({ length: 2000 }, () => 299)
    const time = async (src: string, args: any) => {
      const t = performance.now()
      const r = await run(src, args, { fuel: 1e9, timeoutMs: 600_000 })
      return { ms: performance.now() - t, fuel: r.fuelUsed }
    }
    const v = await time(
      'function f(d: any, s: any) { return { v: Schema.isValid(d, s) } }',
      { d: data, s: { type: 'array', items: { anyOf } } }
    )
    const loop = await time(
      'function f() { let i = 0\n while (i < 200000) { i = i + 1 }\n return { i } }',
      {}
    )
    const ratio = v.ms / v.fuel / (loop.ms / loop.fuel)
    // validation may cost LESS host time per fuel than a loop (fail closed), never far more
    expect(ratio).toBeLessThan(10)
  })
})

describe('every LLM door admits its schemas (fourteenth re-review M1, M2)', () => {
  const llmRun = async (options: string) => {
    const calls: any[] = []
    const r = await new AgentVM().run(
      transpile(
        `function f() { const out = llmPredict({ prompt: 'p', options: ${options} })\n return { out } }`
      ).ast,
      {},
      {
        fuel: 1000,
        capabilities: {
          llm: {
            predict: async (prompt: string, opts: any) => {
              calls.push(opts)
              return 'ok'
            },
          },
        },
      }
    )
    return { r, calls }
  }

  for (const [name, options] of [
    [
      'a json_schema format with a pattern',
      `{ responseFormat: { type: 'json_schema', json_schema: { name: 'r', schema: { type: 'string', pattern: ['^(a+)+$'] } } } }`,
    ],
    [
      'a json_object format carrying a schema (an unanticipated shape)',
      `{ responseFormat: { type: 'json_object', schema: { type: 'string', pattern: '^(a+)+$' } } }`,
    ],
    [
      'a tool whose parameters carry a pattern',
      `{ tools: [{ type: 'function', function: { name: 't', parameters: { type: 'string', pattern: '^(a+)+$' } } }] }`,
    ],
  ] as const)
    it(`core llmPredict refuses ${name}; the model is never called`, async () => {
      const { r, calls } = await llmRun(options)
      expect(r.error?.message ?? 'admitted').toMatch(/not available in AsyncJS/)
      expect(calls.length).toBe(0)
    })

  for (const [name, options] of [
    [
      'a response_format key',
      `{ response_format: { type: 'json_object', schema: { pattern: '^(a+)+$' } } }`,
    ],
    [
      'a functions key',
      `{ functions: [{ name: 'f', parameters: { type: 'string', pattern: '^(a+)+$' } }] }`,
    ],
    [
      'a tool with input_schema',
      `{ tools: [{ name: 't', input_schema: { type: 'string', pattern: '^(a+)+$' } }] }`,
    ],
    [
      'a flattened tool',
      `{ tools: [{ type: 'function', name: 't', parameters: { type: 'string', pattern: '^(a+)+$' } }] }`,
    ],
  ] as const)
    it(`core llmPredict refuses ${name} (fifteenth re-review M2)`, async () => {
      const { r, calls } = await llmRun(options)
      expect(r.error?.message ?? 'admitted').toMatch(/not available in AsyncJS/)
      expect(calls.length).toBe(0)
    })

  it('ordinary options still reach the model', async () => {
    const { r, calls } = await llmRun(
      `{ model: 'm', temperature: 0.5, maxTokens: 10 }`
    )
    expect(r.error).toBeUndefined()
    expect(calls[0]).toEqual({ model: 'm', temperature: 0.5, maxTokens: 10 })
  })

  it('an admitted format reaches the model', async () => {
    const { r, calls } = await llmRun(
      `{ responseFormat: Schema.response('r', { name: '' }) }`
    )
    expect(r.error).toBeUndefined()
    expect(calls[0].responseFormat.json_schema.schema.type).toBe('object')
  })
})
