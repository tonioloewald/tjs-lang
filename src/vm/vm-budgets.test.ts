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
          bound = methodBudgets.bound(name, receiver, args)
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
          bound = methodBudgets.globalBound(name, args)
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
    [
      'concatenation',
      `function f() { let s = 'x'.repeat(400000); let t = s + s + s; return { n: t.length } }`,
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

  it('an ordinary program is not refused', async () => {
    const r = await tiny(
      `function f() { let a = Array.from({ length: 100 }); let s = 'ab'.repeat(50).padStart(120, '-'); return { n: a.length, s } }`,
      { fuel: 1000, maxHeapBytes: 1_000_000 }
    )
    expect(r.error).toBeUndefined()
  })
})
