/**
 * The METHOD TABLE's bounds hold against real results (docs/vm-budgets.md, I1).
 *
 * Every guest-callable method declares an upper bound on what a call allocates, computed from
 * its inputs before the call. A table can only prove it agrees with itself, so this calls every
 * entry — on every receiver kind that has it, across an argument pool that includes the
 * AMPLIFYING dimensions (large counts, long separators and replacements, `$'` patterns,
 * array-likes with a large `length`, nesting) — and fails on any result larger than its bound.
 *
 * "Larger" counts only what the call CREATED: objects already reachable from the receiver or
 * arguments are excluded (`valueOf`, `at` return existing values), as are strings equal to an
 * input string.
 */
import { describe, it, expect } from 'bun:test'
import { join } from 'path'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { AgentVM as AstVM } from './ast'
import { builtins, methodBudgets } from './runtime'

const SLOT = 8

/** Only what a bound's measuring walk reads: an unlimited fuel and heap budget. */
const PROBE_CTX = {
  fuel: { current: Number.MAX_SAFE_INTEGER },
  maxHeapBytes: Number.MAX_SAFE_INTEGER,
} as any

/** What was reachable from the inputs BEFORE the call (a `pop` returns an existing element). */
function snapshot(inputs: unknown[]) {
  const known = new WeakSet<object>()
  const knownStrings = new Set<string>()
  const mark = (x: unknown, depth = 0) => {
    if (typeof x === 'string') return void knownStrings.add(x)
    if (!x || typeof x !== 'object' || known.has(x) || depth > 50) return
    known.add(x)
    // own DATA properties (and symbol-keyed contents) — never a getter, as in the VM's walk
    for (const d of Object.values(Object.getOwnPropertyDescriptors(x)))
      if ('value' in d) mark(d.value, depth + 1)
    for (const sym of Object.getOwnPropertySymbols(x)) {
      const d = Object.getOwnPropertyDescriptor(x, sym)
      if (d && 'value' in d) mark(d.value, depth + 1)
    }
  }
  inputs.forEach((x) => mark(x))
  return { known, knownStrings }
}

/** Bytes a result holds that were not reachable from the inputs before the call. */
function createdBytes(
  result: unknown,
  { known, knownStrings }: ReturnType<typeof snapshot>
): number {
  let bytes = 0
  const stack = [result]
  while (stack.length) {
    const v = stack.pop()
    if (typeof v === 'string') {
      if (!knownStrings.has(v)) bytes += v.length * 2
      continue
    }
    if (!v || typeof v !== 'object' || known.has(v)) continue
    known.add(v)
    bytes += 16
    if (Array.isArray(v)) {
      bytes += v.length * SLOT
      for (const e of v) stack.push(e)
    } else
      for (const [k, d] of Object.entries(
        Object.getOwnPropertyDescriptors(v)
      )) {
        bytes += k.length * 2 + SLOT
        if ('value' in d) stack.push(d.value)
      }
    // a Set wrapper's items live behind a symbol (HEAP_CONTENTS): follow it, or a Set result
    // reads as a handful of methods
    for (const sym of Object.getOwnPropertySymbols(v)) {
      const d = Object.getOwnPropertyDescriptor(v, sym)
      if (d && 'value' in d) stack.push(d.value)
    }
  }
  return bytes
}

const nested = (d: number): unknown =>
  d === 0 ? [1, 'x'] : [nested(d - 1), nested(d - 1)]
/** Shared references: `levels` deep, each level `width` references to ONE child — tiny in
 * memory, width^levels when printed or flattened (rc.2 sixth re-review B1). */
const dag = (levels: number, width: number): unknown => {
  let node: unknown = ['leaf']
  for (let i = 0; i < levels; i++)
    node = Array.from({ length: width }, () => node)
  return node
}

const RECEIVERS: Array<[string, () => unknown]> = [
  ['empty string', () => ''],
  ['short string', () => 'Hello, World ß ΐ'],
  ['long string', () => 'ab-cd,'.repeat(300)],
  ['empty array', () => []],
  ['short array', () => [3, 1, 'two', { a: 1 }]],
  ['long array', () => Array.from({ length: 1000 }, (_, i) => 'item' + i)],
  ['nested array', () => nested(8)],
  ['shared-reference DAG', () => dag(5, 6)],
  ['object', () => ({ alpha: 1, beta: 'two', gamma: [3] })],
  [
    'wide object',
    () =>
      Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['k' + i, i])),
  ],
  ['number', () => 3.14159],
  ['big number', () => 1.7976931348623157e308],
  ['set', () => builtins.Set(['a', 'b', 'c'])],
  // larger than WRAPPER_BYTES, so a constant bound cannot hide a copy of it
  [
    'huge set',
    () => builtins.Set(Array.from({ length: 5000 }, (_, i) => 'w' + i)),
  ],
  [
    'big set',
    () => builtins.Set(Array.from({ length: 500 }, (_, i) => 'v' + i)),
  ],
  ['date wrapper', () => builtins.Date('2020-01-02T03:04:05Z')],
  ['native date', () => new Date(0)],
  ...(
    [
      'Math',
      'JSON',
      'Array',
      'Object',
      'String',
      'Number',
      'Schema',
      'console',
    ] as const
  ).map((n) => [n, () => (builtins as any)[n]] as [string, () => unknown]),
  ['Date factory', () => builtins.Date],
]

const ARGS: unknown[] = [
  0,
  1,
  3,
  1000,
  -1,
  '',
  ',',
  'a',
  'x'.repeat(200),
  "$'",
  '$&$`',
  [1, 2],
  Array.from({ length: 300 }, (_, i) => i),
  { length: 5000 },
  { a: 1, b: [1, 2] },
  [
    ['k', 'v'],
    ['k2', 'v2'],
  ],
  null,
  undefined,
  dag(4, 6),
  /b+/g,
  /(a)(b)?/,
]

/** Calls of arity 0, 1 and 2 over the pool. */
const CALLS: unknown[][] = [
  [],
  ...ARGS.map((a) => [a]),
  ...ARGS.flatMap((a) => ARGS.map((b) => [a, b])),
  ['x'.repeat(100), 'y'.repeat(200)],
  [{ a: [1, 2, 3] }, null, 4],
  [nested(6), null, 10],
]

describe('the method table bounds what every guest-callable method allocates', () => {
  const names = methodBudgets.names()

  it('the table is the allowlist, and it is not empty (apparatus)', () => {
    expect(names.length).toBeGreaterThan(100)
    expect(names).toContain('repeat')
    expect(names).not.toContain('big')
    expect(names).not.toContain('matchAll')
  })

  const failures: string[] = []
  const failed = new Set<string>()
  let calls = 0
  for (const [rname, make] of RECEIVERS) {
    const sample = make() as any
    for (const name of names) {
      let has = false
      try {
        has = sample != null && typeof sample[name] === 'function'
      } catch {
        // a builtin namespace proxy throws on a member it does not have
      }
      if (!has) continue
      for (const args of CALLS) {
        const receiver = make() as any
        let bound: number
        try {
          bound = methodBudgets.bound(name, receiver, args, PROBE_CTX)
        } catch {
          continue // the gate REFUSES this call (e.g. array iterators): nothing is allocated
        }
        const before = snapshot([receiver, ...args])
        let result: unknown
        try {
          result = receiver[name](...args)
        } catch {
          continue
        }
        calls++
        const created = createdBytes(result, before)
        if (
          created > bound &&
          !failed.has(`${rname}.${name}`) &&
          failed.add(`${rname}.${name}`)
        )
          failures.push(
            `${rname}.${name}(${args
              .map((a) => JSON.stringify(a)?.slice(0, 20))
              .join(', ')}): ` + `created ${created} > bound ${bound}`
          )
      }
    }
  }

  it('every probe stays within its bound', () => {
    expect(calls).toBeGreaterThan(5000) // apparatus: the probe actually ran
    expect(failures).toEqual([])
  })

  it('global functions stay within their bounds', () => {
    const out: string[] = []
    for (const name of methodBudgets.globals()) {
      const fn = (builtins as any)[name]
      for (const args of CALLS) {
        let bound: number
        try {
          bound = methodBudgets.globalBound(name, args, PROBE_CTX)
        } catch {
          continue
        }
        const before = snapshot(args)
        let result: unknown
        try {
          result = fn(...args)
        } catch {
          continue
        }
        const created = createdBytes(result, before)
        if (created > bound && !out.some((o) => o.startsWith(name + ':')))
          out.push(
            `${name}: created ${created} > bound ${bound} for ${JSON.stringify(
              args
            )?.slice(0, 40)}`
          )
      }
    }
    expect(out).toEqual([])
  })
})

describe('I1: nothing allocates before it is charged (through transpile())', () => {
  const tiny = (src: string, opts: Record<string, unknown>) =>
    new AgentVM().run(transpile(src).ast, {}, opts)
  const FAIL_FAST = { fuel: 10, maxHeapBytes: 1_000_000 }

  const rows: Array<[string, string]> = [
    [
      'Array.from({ length })',
      `function f() { let a = Array.from({ length: 300000000 }); return { n: a.length } }`,
    ],
    [
      'repeat',
      `function f() { let s = 'x'.repeat(500000000); return { n: s.length } }`,
    ],
    [
      'padStart',
      `function f() { let s = 'x'.padStart(500000000); return { n: s.length } }`,
    ],
    [
      'join with a long separator',
      `function f() { let a = Array.from({ length: 1000 }); let s = a.join('y'.repeat(100000)); return { n: s.length } }`,
    ],
    [
      "replaceAll with $'",
      `function f() { let s = 'a'.repeat(20000).replaceAll('a', "$'"); return { n: s.length } }`,
    ],
  ]
  for (const [name, src] of rows)
    it(`${name} is refused before it allocates`, async () => {
      const before = process.memoryUsage().rss
      const r = await tiny(src, FAIL_FAST)
      expect(r.error?.message ?? 'completed').toMatch(
        /Out of Fuel|Heap limit exceeded/
      )
      // refused before the allocation: no 100MB+ jump in the host
      expect(process.memoryUsage().rss - before).toBeLessThan(100 * 1024 * 1024)
    })

  it('concatenation is refused AT the concatenation, before the string exists', async () => {
    // V8 builds concatenations as ropes, so the host's memory cannot show this; attribution can.
    // Gated, the refusal names `expr.concat`; ungated, it surfaced later, at the bind.
    const r = await new AgentVM().run(
      transpile(
        `function f({ s }) { let t = s + s + s + s; return { n: t.length } }`
      ).ast,
      { s: 'x'.repeat(300_000) },
      { fuel: 1_000_000, maxHeapBytes: 1_500_000 }
    )
    expect(r.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
    expect(r.error?.op).toBe('expr.concat')
  })

  it('an ordinary program is not refused', async () => {
    const r = await tiny(
      `function f() { let a = Array.from({ length: 100 }); let s = 'ab'.repeat(50).padStart(120, '-'); return { n: a.length, s } }`,
      { fuel: 1000, maxHeapBytes: 1_000_000 }
    )
    expect(r.error).toBeUndefined()
  })
})

describe('every atom has an allocation story (a RATCHET: a new atom must add one)', () => {
  // How each core atom satisfies I1 (nothing allocates before it is charged). "gated" means
  // through `allocate()`/`guestCall()` with a bound from its inputs; "binds"/"inserts" are I2
  // (charged where the value lands); "membrane" is a capability return, bounded by
  // `membraneMaxBytes` before it is copied and charged at its bind.
  const STORIES: Record<string, string> = {
    seq: 'control: allocates nothing itself',
    evaluate: 'evaluates one expression; its nodes are the gated doors',
    if: 'control: allocates nothing itself',
    while: 'control: allocates nothing itself',
    return: 'binds the output; its value was charged where it was built',
    try: 'control: binds a message string (bounded by the error)',
    Error: 'a message string from an evaluated (gated) expression',
    varSet: 'binds (I2)',
    varAssign: 'binds (I2)',
    constSet: 'binds (I2)',
    varGet: 'reads a binding',
    varsImport:
      'binds arguments the run was charged for on entry (argsMaxBytes)',
    varsLet: 'binds (I2)',
    varsExport: 'an object of AST-named keys over existing values',
    scope: 'control: allocates nothing itself',
    callLocal: 'binds parameters (I2)',
    map: 'results: rooted (holdRoot); each result was bound (I2) in its callback',
    filter: 'results: rooted; items alias the (rooted or bound) source',
    reduce: 'accumulator: rooted; rebinds charged (I2)',
    find: 'returns an existing item',
    push: 'inserts (I2, accountMutation)',
    len: 'a number',
    split: 'gated: guestCall split',
    join: 'gated: guestCall join',
    template: 'gated: every placeholder occurrence bounded before building',
    regexMatch: 'a boolean',
    pick: 'gated: bounded by the key list',
    omit: 'gated: bounded by the source object',
    merge: 'gated: bounded by both operands',
    keys: 'gated: guestCall Object.keys',
    jsonParse: 'gated: guestCall JSON.parse',
    jsonStringify: 'gated: guestCall JSON.stringify',
    httpFetch: 'membrane',
    storeGet: 'membrane',
    storeSet: 'sends to a capability; allocates nothing in the guest',
    storeQuery: 'membrane',
    storeQueryWhere: 'membrane',
    storeVectorSearch: 'membrane',
    llmPredict: 'membrane',
    xmlParse: 'membrane',
    agentRun:
      'a sub-program: its own steps are gated; its output is charged at the bind',
    runCode:
      'a sub-program, as agentRun; its source is capped (maxSourceBytes)',
    transpileCode: 'an AST from a capped source (maxSourceBytes)',
    memoize: 'stores a result (I2, charged as an insertion)',
    cache: 'membrane (a store capability); its body is a sub-program',
    random: 'a number',
    uuid: 'a fixed-length string',
    hash: 'a fixed-length digest',
    consoleLog: 'host output; nothing retained',
    consoleWarn: 'host output; nothing retained',
    consoleError: 'host output; nothing retained',
    storeProcedure: 'a token for an AST the host already holds',
    releaseProcedure: 'allocates nothing',
    clearExpiredProcedures: 'allocates nothing',
  }

  it('an atom whose story says "gated" reaches the gate in its body', async () => {
    // The probe proves `guestCall`'s bounds; this proves the gated atoms USE it, which their
    // results alone cannot show (an ungated atom is still refused at the bind — after the host
    // has paid for the allocation).
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const src = readFileSync(join(import.meta.dir, 'runtime.ts'), 'utf8')
    const starts = [
      ...src.matchAll(/export const \w+ = defineAtom\(\s*'(\w+)'/g),
    ]
    const bodies = new Map(
      starts.map((m, i) => [
        m[1],
        src.slice(m.index!, starts[i + 1]?.index ?? src.length),
      ])
    )
    const ungated = Object.entries(STORIES)
      .filter(([, story]) => story.startsWith('gated'))
      .filter(([op]) => !/\b(guestCall|allocate)\(/.test(bodies.get(op) ?? ''))
      .map(([op]) => op)
    expect(ungated).toEqual([])
  })

  it('every battery atom returns through the membrane (bounded by membraneMaxBytes)', async () => {
    // Battery atoms allocate host-side (model output, vectors, search results); what reaches the
    // guest is what crosses the membrane, which is size-checked before it is copied, then
    // charged at its bind. That holds only for `io` atoms — a battery atom that is not `io`
    // would hand its allocation in unmeasured.
    const { batteryAtoms } = await import('./atoms')
    const ops = Object.keys(batteryAtoms)
    expect(ops.length).toBeGreaterThan(3) // apparatus
    expect(
      Object.entries(batteryAtoms)
        .filter(([, atom]: [string, any]) => atom.effects !== 'io')
        .map(([op]) => op)
    ).toEqual([])
  })

  it('the list is exactly the core atoms', async () => {
    const { coreAtoms } = await import('./runtime')
    const ops = Object.keys(coreAtoms)
    expect(ops.filter((op) => !(op in STORIES))).toEqual([])
    expect(Object.keys(STORIES).filter((op) => !ops.includes(op))).toEqual([])
  })
})

describe('I1 through the v1 data atoms (thin wrappers over the same gate)', () => {
  const lit = (value: unknown) => ({ $expr: 'literal', value })
  const v1 = (steps: any[]) => ({ op: 'seq', steps })
  const run = (ast: any, args: any = {}) =>
    new AgentVM().run(ast, args, { fuel: 1_000_000, maxHeapBytes: 1_000_000 })
  const TRIPPED = /Out of Fuel|Heap limit exceeded/

  it("split('') of a long string", async () => {
    const r = await run(
      v1([
        { op: 'split', str: { $kind: 'arg', path: 's' }, sep: '', result: 'p' },
      ]),
      { s: 'x'.repeat(200_000) }
    )
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })

  it('join with a long separator', async () => {
    const r = await run(
      v1([
        { op: 'varSet', key: 'sep', value: lit('y'.repeat(10_000)) },
        {
          op: 'join',
          list: { $kind: 'arg', path: 'xs' },
          sep: 'sep',
          result: 'out',
        },
      ]),
      { xs: Array.from({ length: 1000 }, () => 1) }
    )
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })

  it('template: a repeated placeholder is counted once per occurrence, before building', async () => {
    // ~300MB (one-byte characters) from a 1MB-character argument. Counting only the first occurrence let the string be BUILT
    // (and refused only at the bind, after the host had paid for it) — so this measures the host.
    const before = process.memoryUsage().rss
    const r = await new AgentVM().run(
      v1([
        {
          op: 'template',
          tmpl: '{{a}}'.repeat(300),
          vars: { a: { $kind: 'arg', path: 'big' } },
          result: 'out',
        },
      ]) as any,
      { big: 'z'.repeat(1_000_000) },
      { fuel: 10_000_000 }
    )
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
    // V8 stores these one byte per character: building it would add ~300MB
    expect(process.memoryUsage().rss - before).toBeLessThan(100 * 1024 * 1024)
  })

  it("template: placeholders read the template's OWN vars", async () => {
    const r = await new AgentVM().run(
      v1([
        {
          op: 'template',
          tmpl: '[{{constructor}}][{{__proto__}}][{{a}}]',
          vars: { a: 'ok' },
          result: 'out',
        },
        { op: 'return', value: { out: 'out' } },
      ]) as any,
      {}
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ out: '[][][ok]' })
  })
})

describe('I3: what a loop holds while guest steps run is measured (through transpile())', () => {
  const CAP = { maxHeapBytes: 1_000_000, fuel: 50_000_000 }
  const run = (src: string) => new AgentVM().run(transpile(src).ast, {}, CAP)
  const TRIPPED = /Heap limit exceeded|Out of Fuel/

  it('a recursive map over fresh arrays: every level is held at once', async () => {
    const r = await run(`function h(n: 0) {
      if (n > 0) {
        let r = ['x'.repeat(100000) + n].map(x => { let d = h(n - 1); return 0 })
      }
      return 0
    }
    function f() { let d = h(40); return { ok: true } }`)
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })

  it('a callback that rebinds the name its source came from', async () => {
    // The loop becomes the source's only holder; unrooted, the measurement forgot ~600KB.
    const r = await run(`function f() {
      let big = []
      let i = 0
      while (i < 800) { big.push('s'.repeat(500) + i); i = i + 1 }
      // results alone (~480KB) fit; results plus the now-unnamed ~800KB source do not
      let out = big.map(x => { big = []; let y = 'y'.repeat(300) + 'k'; return y })
      return { n: out.length }
    }`)
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })

  it("a loop's results are charged as they grow", async () => {
    // 100k slots of source (~800KB) and 100k slots of results: a number result binds nothing
    // the bind accounting can see, so only the per-insertion charge counts the results array.
    // DISCARDED: a bound result is counted at its bind, so only a discarded (or in-progress)
    // results array shows whether its growth is charged.
    const r = await run(`function f() {
      let src = Array.from({ length: 100000 })
      src.map(x => 0)
      return { ok: true }
    }`)
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })

  it('a discarded filter over an expression-produced array', async () => {
    const r = await run(`function f() {
      let n = 'x'.repeat(10000000).split('').filter(c => true)
      return { ok: true }
    }`)
    expect(r.error?.message ?? 'completed').toMatch(TRIPPED)
  })

  it('a value allocated and bound in one step counts once (not refused at half the cap)', async () => {
    const r = await run(`function f() {
      let src = Array.from({ length: 100000 })
      return { n: src.length }
    }`)
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ n: 100000 })
  })

  it('a long filter whose condition allocates is NOT refused (per-item garbage is released)', async () => {
    const r = await run(`function f() {
      let xs = []
      let i = 0
      while (i < 5000) { xs.push(i); i = i + 1 }
      let kept = xs.filter(x => (x + 'suffix'.repeat(20)).length > 0)
      return { n: kept.length }
    }`)
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ n: 5000 })
  })
})

describe('round 2 (docs/reviews/0.14.0-rc.2-rereview-6.md), through transpile()', () => {
  const run = (src: string, opts: Record<string, unknown> = {}, args = {}) =>
    new AgentVM().run(transpile(src).ast, args, {
      fuel: 5_000_000,
      maxHeapBytes: 1_000_000,
      ...opts,
    })

  describe('implicit coercion of an object/array is refused, not performed (B2)', () => {
    // refused as an operand, or as an argument of the wrong type (the typed table)
    const NEEDS =
      /needs a string, number, boolean or null|must be (a string|a number)/
    const rows: Array<[string, string]> = [
      ['relational operator', `let a = [1, 2]; let r = a < 5`],
      ['arithmetic operator', `let a = [1, 2]; let r = a * 2`],
      ['unary minus', `let a = [1, 2]; let r = -a`],
      ['concatenation', `let a = [1, 2]; let r = 'x' + a`],
      ['a template literal', 'let a = [1, 2]; let r = `${a}`'],
      ['a computed key', `let o = { a: 1 }; let k = ['a']; let r = o[k]`],
      [
        'a primitive-taking method',
        `let a = [1, 2]; let r = 'abc'.includes(a)`,
      ],
      ['Math', `let a = [1, 2]; let r = Math.max(a)`],
      ['a global', `let a = [1, 2]; let r = parseInt(a)`],
      ["sort's default comparator", `let a = [[2], [1]]; let r = a.sort()`],
    ]
    for (const [name, body] of rows)
      it(name, async () => {
        const r = await run(`function f() { ${body}; return { ok: true } }`)
        expect(r.error?.message ?? 'completed').toMatch(NEEDS)
      })

    it('values are still values where a method uses them as values', async () => {
      const r = await run(`function f() {
        let o = { a: 1 }
        let xs = [o]
        let s = Set([1, 2])
        return { i: xs.indexOf(o), has: xs.includes(o), n: Object.keys(o).length, j: JSON.stringify(xs), u: s.union([3]).size }
      }`)
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ i: 0, has: true, n: 1, j: '[{"a":1}]', u: 3 })
    })
  })

  describe('printers are bounded by the TREE they print (B1)', () => {
    // 8 levels, each 10 references to ONE shared child: a few KB of memory, 10^8 printed nodes
    const dag = `let node = [1]
      let d = 0
      while (d < 8) { let next = []; let i = 0; while (i < 10) { next.push(node); i = i + 1 }; node = next; d = d + 1 }`
    for (const [name, use] of [
      ['join', `node.join(',')`],
      ['JSON.stringify', `JSON.stringify(node)`],
      ['flat', `node.flat(10)`],
      ['toString', `node.toString()`],
    ] as const)
      it(name, async () => {
        const r = await run(
          `function f() { ${dag}; let out = ${use}; return { ok: true } }`
        )
        expect(r.error?.message ?? 'completed').toMatch(
          /Heap limit exceeded|Out of Fuel/
        )
      })
  })

  describe("guest regexes run on the VM's own engine: linear, whatever the pattern (B4/B8)", () => {
    // These ran for seconds to hours on the host's backtracking engine (exponential and
    // polynomial shapes). On the VM's Pike VM they are linear in input × pattern, and charged.
    for (const [name, body] of [
      [
        'match(string), exponential',
        `let r = ('a'.repeat(2000) + '!').match('^(a+)+$')`,
      ],
      [
        'search(string), exponential',
        `let r = ('a'.repeat(2000) + '!').search('^(a+)+$')`,
      ],
      [
        'a regex literal, exponential',
        `let r = ('a'.repeat(2000) + '!').replace(/^(a+)+$/, '')`,
      ],
      ['polynomial', `let r = 'a'.repeat(3000).replace(/a*a*c/, 'x')`],
      [
        'polynomial, digits',
        `let r = '1'.repeat(1000).search('\\d+\\d+\\d+x')`,
      ],
    ] as const)
      it(name, async () => {
        const t = performance.now()
        const r = await run(`function f() { ${body}; return { ok: true } }`, {
          maxHeapBytes: 64_000_000,
        })
        expect(r.error).toBeUndefined()
        expect(performance.now() - t).toBeLessThan(1500)
      })

    it('a long input is charged, not capped (200k characters)', async () => {
      const r = await run(
        `function f() { let r = 'a'.repeat(200000).replace(/a/g, 'b'); return { n: r.length } }`,
        { maxHeapBytes: 64_000_000 }
      )
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ n: 200000 })
    })

    it('regex work is fuel: a tiny budget stops a long match', async () => {
      const r = await run(
        `function f() { let r = 'a'.repeat(200000).search(/(a|a)*b/); return { r } }`,
        { fuel: 5, maxHeapBytes: 64_000_000 }
      )
      expect(r.error?.message ?? 'completed').toMatch(/Out of Fuel/)
    })

    it('a regex literal is DATA in the AST, and works', async () => {
      const { ast } = transpile(
        `function f({ s }) { return { t: s.replace(/b+/g, '-') } }`
      )
      expect(JSON.stringify(ast)).toContain('"$expr":"regex"')
      const r = await new AgentVM().run(JSON.parse(JSON.stringify(ast)), {
        s: 'abbcbd',
      })
      expect(r.result).toEqual({ t: 'a-c-d' })
    })
  })

  it('extra arguments to a helper are dropped, not held unbound (B3)', async () => {
    // Hand-built: the helper declares ONE parameter; each recursive call passes two, the second
    // a fresh 300K-character string. Held for the call (unbound AND uncharged), 40 levels kept
    // ~12MB alive under a 1MB cap; dropped, they are garbage. Measured at the deepest level,
    // after a forced collection, in its OWN process (`helper-args-heap.probe.ts`): process-wide
    // heapUsed is disturbed by other test files sharing the process.
    const proc = Bun.spawnSync([
      'bun',
      join(import.meta.dir, 'helper-args-heap.probe.ts'),
    ])
    const out = JSON.parse(proc.stdout.toString().trim().split('\n').pop()!)
    expect(out.error).toBeNull()
    expect(out.held).toBeGreaterThan(-Infinity) // apparatus: the deepest level was reached
    expect(out.held).toBeLessThan(6 * 1024 * 1024)
  })

  it("a Set's intersection is O(n + m), not O(n × m) (M2)", async () => {
    const t = performance.now()
    const r = await run(
      `function f() {
        let a = []; let i = 0
        while (i < 60000) { a.push(i); i = i + 1 }
        let s = Set(a)
        let x = s.intersection(a)
        return { n: x.size }
      }`,
      { maxHeapBytes: 64_000_000 }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ n: 60000 })
    // O(n × m) membership took seconds at this size; O(n + m) takes milliseconds
    expect(performance.now() - t).toBeLessThan(1000)
  })

  describe('bounds follow the arguments, not just the receiver (M3: no false rejection)', () => {
    // 300k characters for the slices (a slice is charged its RANGE); `split` creates pieces
    // totalling the subject, so its row uses the review's 100k (200KB + 200KB fits in 1MB)
    const big = { s: 'x'.repeat(300_000) + ','.repeat(3) }
    const small = { s: 'x'.repeat(100_000) + ','.repeat(3) }
    for (const [name, body, want] of [
      [
        'slice of a long string',
        `return { r: s.slice(0, 10) }`,
        { r: 'xxxxxxxxxx' },
      ],
      ['substring', `return { r: s.substring(5, 8) }`, { r: 'xxx' }],
      [
        'split with few separators',
        `let p = s.split(','); return { n: p.length }`,
        { n: 4 },
      ],
    ] as const)
      it(name, async () => {
        const r = await new AgentVM().run(
          transpile(`function f({ s }) { ${body} }`).ast,
          name.startsWith('split') ? small : big,
          { fuel: 5_000_000, maxHeapBytes: 1_000_000 }
        )
        expect(r.error).toBeUndefined()
        expect(r.result).toEqual(want)
      })
  })

  it("a sum's operands stop counting once the sum exists (M4: no false rejection)", async () => {
    // `'y'.repeat(n)` is in flight, then consumed into the sum, whose bound covers it. Kept in
    // flight, the NEXT allocation in the same step saw both and was refused.
    const r = await run(
      `function f() { let a = ['y'.repeat(200000) + 'a', 'z'.repeat(200000)]; return { n: a.length } }`
    )
    expect(r.error).toBeUndefined()
  })

  it('a template fits or not regardless of WHERE the big value sits (M4)', async () => {
    const cap = { fuel: 5_000_000, maxHeapBytes: 1_000_000 }
    const args = { big: 'b'.repeat(150_000) }
    const first = await new AgentVM().run(
      transpile(
        'function f({ big }) { let t = `${big}a${1}b${2}c`; return { n: t.length } }'
      ).ast,
      args,
      cap
    )
    const last = await new AgentVM().run(
      transpile(
        'function f({ big }) { let t = `a${1}b${2}c${big}`; return { n: t.length } }'
      ).ast,
      args,
      cap
    )
    expect(first.error).toBeUndefined()
    expect(last.error).toBeUndefined()
  })
})

describe('round 3 (docs/reviews/0.14.0-rc.2-rereview-7.md): one view of every operand', () => {
  const run = (src: string, opts: Record<string, unknown> = {}, args = {}) =>
    new AgentVM().run(transpile(src).ast, args, {
      fuel: 5_000_000,
      maxHeapBytes: 1_000_000,
      ...opts,
    })
  const dag = `let node = [1]
    let d = 0
    while (d < 8) { let next = []; let i = 0; while (i < 10) { next.push(node); i = i + 1 }; node = next; d = d + 1 }`
  const TYPED = /must be|not available|takes at most|is not a function/

  describe('an argument of the wrong type is refused, not read another way (B2, B3)', () => {
    const rows: Array<[string, string]> = [
      ['a quoted count', `let s = 'x'.repeat('1e8')`],
      ['a quoted pad length', `let s = 'x'.padStart('5e7')`],
      ['a quoted length', `let a = Array.from({ length: '1e7' })`],
      ['an array length', `let a = Array.from({ length: [1e7] })`],
      ['indexOf position 2', `${dag}; let i = [1].indexOf(1, node)`],
      ['fill position 2', `${dag}; let a = [1].fill(0, node)`],
      ['with position 1', `${dag}; let a = [1].with(node, 2)`],
      ['splice position 1', `${dag}; let a = [1].splice(node)`],
      ['Object.hasOwn key', `${dag}; let h = Object.hasOwn({}, node)`],
      ['fromEntries key', `${dag}; let o = Object.fromEntries([[node, 1]])`],
      ["a Date's isBefore", `let r = Date(0).isBefore([2020])`],
      ["a Date's add amount", `let r = Date(0).add({ years: 'x' })`],
      ['an extra argument', `let i = 'abc'.indexOf('b', 0, 'extra')`],
      ['a method another kind has', `let n = 5; let r = n.includes(1)`],
      ['a name the table inherits', `let n = 5; let r = n.hasOwnProperty('x')`],
    ]
    for (const [name, body] of rows)
      it(name, async () => {
        const r = await run(`function f() { ${body}; return { ok: true } }`)
        expect(r.error?.message ?? 'completed').toMatch(TYPED)
      })
  })

  it('flat of a shared-reference DAG is refused BEFORE it is built (a stopped walk is not a bound — B1)', async () => {
    // 10^8 slots (~800MB) if built; the refusal must come from the gate, not the bind after it
    const before = process.memoryUsage().rss
    const r = await run(
      `function f() { ${dag}; let a = node.flat(10); return { n: a.length } }`
    )
    expect(r.error?.message ?? 'completed').toMatch(
      /Heap limit exceeded|Out of Fuel/
    )
    expect(process.memoryUsage().rss - before).toBeLessThan(100 * 1024 * 1024)
  })

  it("JSON's escapes are counted: a control character is six (M3)", async () => {
    const r = await run(
      `function f({ s }) { let j = JSON.stringify([s, s, s, s]); return { n: j.length } }`,
      { maxHeapBytes: 4_000_000 },
      { s: '\x01'.repeat(150_000) }
    )
    expect(r.error?.message ?? 'completed').toMatch(/Heap limit exceeded/)
    // refused by the GATE, from the escaped size — not by the bind, after building it
    expect(r.error?.op).toBe('expr.stringify')
  })

  it('a printer charges its walk AS it walks (M2)', async () => {
    // a doubling DAG, 25 levels: 33M paths. Metered, the walk stops a few thousand nodes in.
    const t = performance.now()
    const r = await run(
      `function f() { let n = [1]; let d = 0; while (d < 25) { n = [n, n]; d = d + 1 }; let s = JSON.stringify(n); return { ok: true } }`,
      // a huge cap: walking to the headroom would be seconds of host work before any charge
      // building the DAG costs ~13.3 fuel; the walk gets ~5 more
      { fuel: 18, maxHeapBytes: 2_000_000_000 }
    )
    expect(r.error?.message ?? 'completed').toMatch(/Out of Fuel/)
    expect(performance.now() - t).toBeLessThan(200)
  })

  it("a Set's remove(NaN) removes NaN, not the last element (B5)", async () => {
    const r = await run(`function f() {
      let s = Set([1, NaN, 2])
      s.remove(NaN)
      return { a: s.toArray() }
    }`)
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ a: [1, 2] })
  })

  describe('atoms that stringify a guest value charge it first (B4)', () => {
    for (const [name, body] of [
      ['hash', `let h = hash({ value: node })`],
    ] as const)
      it(name, async () => {
        const r = await run(
          `function f() { ${dag}; ${body}; return { ok: true } }`
        )
        expect(r.error?.message ?? 'completed').toMatch(
          /Heap limit exceeded|Out of Fuel/
        )
      })
  })

  it('the v1 consoleWarn atom charges a guest value before stringifying it (B4)', async () => {
    // in v2, `console.warn(x)` is the host console (it formats with a depth limit and allocates
    // nothing in the guest); the v1 ATOM stringified its input into the run's warnings
    const { ast } = transpile(`function f() { ${dag}; return { ok: true } }`)
    const steps = (ast as any).steps.slice(0, -1)
    const r = await new AgentVM().run(
      {
        op: 'seq',
        $ajs: 2,
        steps: [
          ...steps,
          { op: 'consoleWarn', message: { $expr: 'ident', name: 'node' } },
        ],
      } as any,
      {},
      { fuel: 5_000_000, maxHeapBytes: 1_000_000 }
    )
    expect(r.error?.message ?? 'completed').toMatch(
      /Heap limit exceeded|Out of Fuel/
    )
  })

  describe("a schema 'pattern' would run on the host's engine: refused (B7)", () => {
    // Since round 10 (Schema as data) there is no builder chaining: `Schema.pattern` and `.meta`
    // are not callable at all, and a `pattern` keyword is refused by the closed dialect.
    for (const [name, body, why] of [
      ['Schema.pattern', `let p = Schema.pattern('^(a+)+$')`, /not callable/],
      [
        'a pattern in isValid',
        `let v = Schema.isValid('aaa', { type: 'string', pattern: '^(a+)+$' })`,
        /'pattern' is compiled by the host/,
      ],
      [
        'a pattern via meta',
        `let v = Schema.object({}).meta({ pattern: '^(a+)+$' }).validate({})`,
        /not available|not callable/,
      ],
    ] as const)
      it(name, async () => {
        // refused at transpile time (no such method) or at run time
        let message: string
        try {
          const r = await run(`function f() { ${body}; return { ok: true } }`)
          message = r.error?.message ?? 'completed'
        } catch (e: any) {
          message = e.message
        }
        expect(message).toMatch(why)
      })

    it("the library's own patterns still work (emoji)", async () => {
      const r = await run(
        `function f() { return { v: Schema.isValid('😀', Schema.emoji) } }`
      )
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ v: true })
    })
  })
})

describe('round 4: the regex engine and the methods over it are metered by construction', () => {
  // docs/reviews/0.14.0-rc.2-rereview-8.md. Each row is a measured attack: a few fuel bought
  // seconds of work. The exchange rate the VM promises is its default timeout, 10ms per fuel;
  // every row must stay within it (with slack for a busy machine), whether it completes or not.
  const rows: Array<[string, string]> = [
    [
      'M4: a huge replacement template',
      `let s = 'a'.repeat(5000).replaceAll('a', '$&'.repeat(500000))`,
    ],
    [
      'M4: a long template of empty references',
      `let s = 'a'.repeat(5000).replace(/(x?)/g, '$1'.repeat(200000))`,
    ],
    [
      'M3: split with a large program, once per position',
      `let s = 'a'.repeat(100000).split(/z${'q'.repeat(19000)}/)`,
    ],
    [
      'B1: zero-width closures',
      `let s = 'a'.repeat(3000).search(/(?:a?){0,2000}b/)`,
    ],
    ['B2: an empty body repeated', `let s = 'a'.search(/(?:){10000}/)`],
    [
      'B3: a wide class',
      `let s = 'b'.repeat(50000).search(/[${'a'.repeat(400000)}]/)`,
    ],
  ]
  for (const [name, body] of rows)
    it(name, async () => {
      for (const fuel of [20, 200]) {
        const t = performance.now()
        const r = await new AgentVM().run(
          transpile(`function f() { ${body}; return { ok: true } }`).ast,
          {},
          { fuel, timeoutMs: 600_000 }
        )
        const ms = performance.now() - t
        expect({
          name,
          fuel,
          withinRate: ms <= fuel * 10 + 100,
          ms: Math.round(ms),
          outcome: r.error?.message.slice(0, 40) ?? 'completed',
        }).toMatchObject({ withinRate: true })
      }
    })
})

describe('round 5: every resource a regex uses is charged (rc.2 ninth re-review)', () => {
  // Every cost of a regex is a function of its program size (charged once, where it is created,
  // and counted wherever it is held) and of the input it runs on (charged per match).
  const nested = '(?:'.repeat(15) + 'a' + ')?'.repeat(15)
  const hold = (re: string) =>
    new AgentVM().run(
      transpile(
        `function f() { let rs = []\n let i = 0\n while (i < 1000) { rs.push(${re})\n i = i + 1 }\n return { n: rs.length } }`
      ).ast,
      {},
      { fuel: 100_000, maxHeapBytes: 8 * 1024 * 1024, timeoutMs: 600_000 }
    )

  it('B1: a held regex does not retain its matching state (it was ~690MB for 1000)', async () => {
    const before = process.memoryUsage().rss
    const r = await hold(`/${nested}/`)
    const grew = process.memoryUsage().rss - before
    expect(r.error).toBeUndefined() // nothing large is retained, so nothing to refuse
    expect(grew).toBeLessThan(150 * 1024 * 1024)
  })

  it('B1: a held regex is charged for its program, so many large ones are refused', async () => {
    const r = await hold('/a{10000}/')
    expect(r.error?.message ?? 'completed').toMatch(/Heap limit/)
  })

  it('B1/I1: a regex is charged for its program where it is created, even if never held', async () => {
    // ~1.1MB of program, created and dropped without running: no match charges it and the heap
    // walk never sees it, so only the charge at creation can refuse it under a 256KB ceiling
    const r = await new AgentVM().run(
      transpile(`function f() { return { n: [/a{10000}/].length } }`).ast,
      {},
      { fuel: 100_000, maxHeapBytes: 256 * 1024 }
    )
    expect(r.error?.message ?? 'completed').toMatch(/Heap limit/)
  })

  it('M2: a source of many costly regex literals is refused at transpile, promptly', () => {
    const lits = Array.from(
      { length: 100 },
      () => '/(?:(?:){10000}){99}/'
    ).join(', ')
    const t = performance.now()
    expect(() =>
      transpile(`function f() { let a = [${lits}]\n return { n: a.length } }`)
    ).toThrow(/too large to compile/)
    expect(performance.now() - t).toBeLessThan(500)
  })

  it('M2 (tenth re-review M1): helper functions share the source budget', () => {
    // one costly literal per helper: each helper used to get a fresh budget of its own
    const source = (lit: (i: number) => string) =>
      Array.from(
        { length: 80 },
        (_, i) => `function h${i}() { return { r: ${lit(i)} } }`
      ).join('\n') +
      '\nfunction f() {\n' +
      Array.from({ length: 80 }, (_, i) => `let a${i} = h${i}()`).join('\n') +
      '\nreturn { n: 1 } }'
    // apparatus: the same shape with an ordinary literal transpiles
    expect(() => transpile(source(() => '/a/'))).not.toThrow()
    const t = performance.now()
    expect(() =>
      transpile(source((i) => `/(?:(?:){10000}){${50 + i}}/`))
    ).toThrow(/too large to compile/)
    expect(performance.now() - t).toBeLessThan(500)
  })

  it('M2: a repeated literal is compiled once per source', () => {
    // 400 × ~3000 steps is over this source's budget unless each distinct literal compiles once
    const lits = Array.from({ length: 400 }, () => '/a{3000}b/').join(', ')
    expect(() =>
      transpile(`function f() { let a = [${lits}]\n return { n: a.length } }`)
    ).not.toThrow()
  })
})

describe('round 7: a guest string pattern of class escapes (rc.2 eleventh re-review M1)', () => {
  it('stays inside the default heap ceiling (it grew RSS by ~600MB)', async () => {
    const before = process.memoryUsage().rss
    const r = await new AgentVM().run(
      transpile(`function f(p: '') { return { m: 'x'.match(p) } }`).ast,
      { p: '[' + '\\S'.repeat(450_000) + ']' },
      { fuel: 1_000_000, argsMaxBytes: 4 * 1024 * 1024, timeoutMs: 600_000 }
    )
    const grew = process.memoryUsage().rss - before
    void r // charged and admitted, or refused: either way, bounded
    expect(grew).toBeLessThan(200 * 1024 * 1024)
  })
})

describe("round 8: a guest AST's schemas are admitted before tosijs-schema sees them (rc.2 twelfth re-review B1)", () => {
  const evil = 'a'.repeat(26) + '!'
  const shapes: Array<[string, any]> = [
    ['pattern', { type: 'string', pattern: '^(a+)+$' }],
    [
      'patternProperties',
      { type: 'object', patternProperties: { '^(a+)+$': {} } },
    ],
    [
      '$predicate',
      { type: 'string', $predicate: 'function p(s) { return true }' },
    ],
  ]
  for (const entry of ['vm', 'vm-ast'] as const)
    for (const [name, schema] of shapes) {
      it(`${entry}: inputSchema with ${name} is refused before validation`, async () => {
        const VM = entry === 'vm' ? AgentVM : AstVM
        const t = performance.now()
        const r = await new VM().run(
          {
            op: 'seq',
            steps: [],
            inputSchema: { type: 'object', properties: { x: schema } },
          } as any,
          { x: evil },
          { fuel: 10, timeoutMs: 50 }
        )
        expect(r.error?.message ?? 'admitted').toMatch(
          /not available in AsyncJS/
        )
        expect(performance.now() - t).toBeLessThan(50)
      })

      it(`${entry}: a return step's schema with ${name} is refused`, async () => {
        const VM = entry === 'vm' ? AgentVM : AstVM
        const t = performance.now()
        const r = await new VM().run(
          {
            op: 'seq',
            steps: [
              { op: 'varSet', key: 'x', value: evil },
              {
                op: 'return',
                schema: { type: 'object', properties: { x: schema } },
              },
            ],
          } as any,
          {},
          { fuel: 10, timeoutMs: 50 }
        )
        expect(r.error?.message ?? 'admitted').toMatch(
          /not available in AsyncJS/
        )
        expect(performance.now() - t).toBeLessThan(50)
      })
    }
})
