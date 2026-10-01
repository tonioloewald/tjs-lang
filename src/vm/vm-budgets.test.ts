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
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
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
  }
  return bytes
}

const nested = (d: number): unknown =>
  d === 0 ? [1, 'x'] : [nested(d - 1), nested(d - 1)]

const RECEIVERS: Array<[string, () => unknown]> = [
  ['empty string', () => ''],
  ['short string', () => 'Hello, World ß ΐ'],
  ['long string', () => 'ab-cd,'.repeat(300)],
  ['empty array', () => []],
  ['short array', () => [3, 1, 'two', { a: 1 }]],
  ['long array', () => Array.from({ length: 1000 }, (_, i) => 'item' + i)],
  ['nested array', () => nested(8)],
  ['object', () => ({ alpha: 1, beta: 'two', gamma: [3] })],
  [
    'wide object',
    () =>
      Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['k' + i, i])),
  ],
  ['number', () => 3.14159],
  ['big number', () => 1.7976931348623157e308],
  ['set', () => builtins.Set(['a', 'b', 'c'])],
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
