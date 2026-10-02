/**
 * The guest-program invariant FUZZER (rc.2 seventeenth re-review, round 13).
 *
 * Seventeen review rounds found holes one route at a time: a function reached guest state by
 * an ident, then a member read, then a dot-path, then an atom result, then an argument, then
 * `pick`. Each fix pinned the route the review named. This states the invariants instead and
 * throws random programs at them, so a NEW route fails here without anyone having to think of it:
 *
 *   1. `vm.run` never throws — every failure is a returned AgentError.
 *   2. No function reaches the result, or the input of a capability.
 *   3. The result is DATA: `structuredClone` keeps it unchanged (no wrapper, no host object).
 *   4. Wall time is bounded by the fuel paid (the VM's declared rate, `fuel × 10ms`).
 *
 * Programs are generated from a seeded PRNG over the guest surface — Set, Date, regex, the
 * builtins, every method name in `GUEST_METHODS`, member names that have bitten before — and
 * most are refused somewhere; a refusal is a pass, as long as it is RETURNED. On failure the
 * seed and the source are printed: `FUZZ_SEED=<n> FUZZ_N=1 bun test src/vm/guest-fuzz.test.ts`
 * replays one program.
 *
 * Small in `test:fast`; large in the benchmark lane (plain `bun test`), or set `FUZZ_N`.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { defineAtom } from './runtime'
import { GUEST_METHODS } from './guest-methods'

const N = Number(
  process.env.FUZZ_N ?? (process.env.SKIP_BENCHMARKS ? 300 : 3000)
)
const SEED0 = Number(process.env.FUZZ_SEED ?? 1)

/** mulberry32: small, seedable, good enough to spread programs over the surface. */
function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]
  return { next, int, pick }
}

const METHODS = [...GUEST_METHODS]
const MEMBERS = [
  'length',
  'size',
  'value',
  'year',
  'timestamp',
  'source',
  'flags',
  'a',
  'b',
  '0',
  'constructor',
  '__proto__',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'add',
  'push',
  'format',
]
const VALUE_IDENTS = [
  'Math',
  'JSON',
  'Object',
  'Array',
  'Set',
  'Date',
  'Schema',
  'console',
  'parseInt',
  'filter',
  'undefined',
  'NaN',
]
const STRINGS = ["'a'", "'abc'", "'x,y,z'", "''", "'2024-01-15'", '\'{"a":1}\'']

function generate(seed: number): string {
  const r = rng(seed)
  const vars: string[] = []
  let depth = 0

  const literal = (): string =>
    r.pick([
      () => String(r.int(10)),
      () => String(r.int(1000) / 7),
      () => r.pick(STRINGS),
      () => r.pick(['true', 'false', 'null']),
    ])()

  const expr = (): string => {
    if (++depth > 4) {
      depth--
      return vars.length && r.next() < 0.5 ? r.pick(vars) : literal()
    }
    const e = r.pick([
      literal,
      literal,
      () => (vars.length ? r.pick(vars) : literal()),
      () => (vars.length ? r.pick(vars) : literal()),
      () => `[${Array.from({ length: r.int(4) }, expr).join(', ')}]`,
      () => `{ a: ${expr()}, b: ${expr()} }`,
      () => `Set([${Array.from({ length: r.int(4) }, expr).join(', ')}])`,
      () => `Date(${r.pick(["'2024-01-15'", "'2020-02-29T12:00:00Z'", ''])})`,
      () => r.pick(['/a+b/g', '/[0-9]+/', '/(x)(y)?/i', '/,/']),
      () => r.pick(VALUE_IDENTS),
      () => `${expr()}.${r.pick(MEMBERS)}`,
      () => `${expr()}[${expr()}]`,
      () =>
        `${expr()}.${r.pick(METHODS)}(${Array.from(
          { length: r.int(3) },
          expr
        ).join(', ')})`,
      () =>
        `${r.pick([
          'Math',
          'JSON',
          'Object',
          'Array',
          'Date',
          'Schema',
        ])}.${r.pick(METHODS)}(${Array.from({ length: r.int(3) }, expr).join(
          ', '
        )})`,
      () => `JSON.stringify(${expr()})`,
      () => `JSON.parse(${r.pick(STRINGS)})`,
      () =>
        `Object.${r.pick(['keys', 'values', 'entries', 'assign'])}(${expr()}${
          r.next() < 0.5 ? ', ' + expr() : ''
        })`,
      () =>
        `Schema.isValid(${expr()}, { type: '${r.pick([
          'number',
          'string',
          'array',
          'object',
        ])}' })`,
      () =>
        `(${expr()} ${r.pick([
          '+',
          '-',
          '*',
          '<',
          '==',
          '===',
          '&&',
          '||',
          '??',
        ])} ${expr()})`,
      () => `(${expr()} ? ${expr()} : ${expr()})`,
      () => `\`t\${${expr()}}\``,
    ])()
    depth--
    return e
  }

  const stmt = (): string =>
    r.pick([
      () => {
        const v = `v${vars.length}`
        const line = `const ${v} = ${expr()}`
        vars.push(v)
        return line
      },
      () => {
        const v = `v${vars.length}`
        const line = `let ${v} = ${expr()}`
        vars.push(v)
        return line
      },
      // guarded: most expressions are refused somewhere, and a program that stops at its first
      // refusal never reaches the surface behind it — so most bindings survive one
      () => {
        const v = `v${vars.length}`
        const line = `let ${v} = null\n  try { ${v} = ${expr()} } catch (e) { sink({ v: e }) }`
        vars.push(v)
        return line
      },
      () => {
        const v = `v${vars.length}`
        const line = `let ${v} = null\n  try { ${v} = ${expr()} } catch (e) { sink({ v: e }) }`
        vars.push(v)
        return line
      },
      () =>
        vars.length
          ? `try { ${r.pick(
              vars
            )}.push(${expr()}) } catch (e) { sink({ v: e }) }`
          : `sink({ v: ${expr()} })`,
      () => `sink({ v: ${expr()} })`,
      () => `if (${expr()}) { sink({ v: ${expr()} }) }`,
      () =>
        vars.length
          ? `for (const it of ${r.pick(vars)}) { sink({ v: it }) }`
          : `sink({ v: ${expr()} })`,
      () =>
        `try { const t = ${expr()}\n sink({ v: t }) } catch (e) { sink({ v: e }) }`,
    ])()

  const body = Array.from({ length: 2 + r.int(8) }, stmt)
  // the result is built from bindings, so a clean run returns what the program made
  const ret = `return { r: ${
    vars.length ? r.pick(vars) : literal()
  }, all: [${vars.join(', ')}] }`
  return `function f() {\n  ${[...body, ret].join('\n  ')}\n}`
}

/** No function anywhere in a value — own keys of every kind, accessors counted as code. */
function hasFunction(v: unknown, seen = new Set<unknown>()): boolean {
  if (typeof v === 'function') return true
  if (!v || typeof v !== 'object' || seen.has(v)) return false
  seen.add(v)
  return Reflect.ownKeys(v).some((k) => {
    const d = Object.getOwnPropertyDescriptor(v, k)!
    return 'value' in d ? hasFunction(d.value, seen) : true
  })
}

describe('guest-program invariants hold over random programs', () => {
  it(`apparatus: the generator reaches the surface (and some programs run cleanly)`, () => {
    // a generator that only produces transpile failures would pass every invariant vacuously
    let transpiled = 0
    for (let i = 0; i < 200; i++)
      try {
        transpile(generate(SEED0 + i))
        transpiled++
      } catch {
        // refused at transpile time: also a valid outcome
      }
    expect(transpiled).toBeGreaterThan(100)
  })

  it(`${N} programs: never throws, no function escapes, the result is data, time tracks fuel`, async () => {
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
    const vm = new AgentVM({ sink } as any)
    let ran = 0
    let clean = 0
    const why = new Map<string, number>()
    for (let i = 0; i < N; i++) {
      const seed = SEED0 + i
      const src = generate(seed)
      let ast
      try {
        ast = transpile(src).ast
      } catch {
        continue
      }
      ran++
      received.length = 0
      const where = `FUZZ_SEED=${seed} FUZZ_N=1\n${src}`
      const t = performance.now()
      let r: any
      try {
        r = await vm.run(ast, {}, { fuel: 300 })
      } catch (e: any) {
        throw new Error(`vm.run THREW (${e?.message}) — ${where}`, { cause: e })
      }
      const ms = performance.now() - t
      if (!r.error) clean++
      else {
        const k = String(r.error.message)
          .replace(/'[^']*'/g, "'_'")
          .slice(0, 70)
        why.set(k, (why.get(k) ?? 0) + 1)
      }
      if (hasFunction(r.result))
        throw new Error(`a function reached the RESULT — ${where}`)
      if (received.some((v) => hasFunction(v)))
        throw new Error(`a function reached a CAPABILITY — ${where}`)
      // a clean run's result is guest DATA (an errored run's result is the host's AgentError)
      if (!r.error) {
        let cloned: unknown
        try {
          cloned = structuredClone(r.result)
        } catch (e: any) {
          throw new Error(`the result is not data (${e?.message}) — ${where}`, {
            cause: e,
          })
        }
        if (!Bun.deepEquals(cloned, r.result, true))
          throw new Error(`the result changed under structuredClone — ${where}`)
      }
      // the VM's declared rate is fuel × 10ms; a generous floor absorbs JIT warm-up and GC
      if (ms > 250 + r.fuelUsed * 10)
        throw new Error(`${ms.toFixed(0)}ms for ${r.fuelUsed} fuel — ${where}`)
    }
    if (process.env.FUZZ_STATS)
      console.log(
        JSON.stringify(
          {
            ran,
            clean,
            top: [...why].sort((a, b) => b[1] - a[1]).slice(0, 25),
          },
          null,
          1
        )
      )
    expect(ran).toBeGreaterThan(N / 2)
    // some programs must survive to the end, or the invariants were only ever checked on errors
    expect(clean).toBeGreaterThan(0)
  }, 600_000)
})
