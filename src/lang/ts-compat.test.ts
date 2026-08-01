/**
 * TypeScript conformance: how much ordinary TypeScript does a native `.tjs` file accept?
 *
 * The goal is **TypeScript++, not JavaScript++** — paste a `.ts` file in, change the
 * extension, and it works, with TJS's extras available when you want them. This file turns
 * that goal into a number so it stops being an impression.
 *
 * Two kinds of gap, and only one of them can hurt a consumer:
 *
 * 1. **Acceptance gaps** (`SUPPORTED: false` below) — TJS rejects syntax TypeScript allows.
 *    Closing one is purely ADDITIVE: nothing that worked stops working, so it can land in
 *    any release without asking anyone to edit code.
 * 2. **Semantic drift** (`DRIFT` below) — a spelling that is legal TS *and* legal JS, which
 *    TJS accepts but interprets differently. Closing one CHANGES BEHAVIOR of code people
 *    already wrote. These are the churn, and the release rule follows from that: a semantic
 *    realignment ships **with or before** the release that claims TypeScript++, never
 *    dribbled out afterwards. Every one shipped late is a forced consumer migration.
 *
 * The test fails if a supported case regresses, and also fails if an UNSUPPORTED case starts
 * passing — that means someone fixed it and the score below is now understating us. Same
 * shape as the dated audit exemptions: the ledger is not allowed to quietly drift.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime, isMonadicError } from './runtime'

const compile = (src: string) => tjs(src, { runTests: false })

/** Ordinary TypeScript, as it appears in real files. */
const CASES: Array<{ name: string; src: string; supported: boolean }> = [
  // --- supported today ---
  {
    name: 'primitive params',
    src: `function f(s: string, n: number, b: boolean) { return s }`,
    supported: true,
  },
  {
    name: 'optional param',
    src: `function f(n?: number) { return n }`,
    supported: true,
  },
  {
    name: 'object literal type',
    src: `function f(o: { id: number, name: string }) { return o }`,
    supported: true,
  },
  {
    name: 'union of primitives',
    src: `function f(x: string | number) { return x }`,
    supported: true,
  },
  {
    name: 'literal union',
    src: `function f(x: 'a' | 'b') { return x }`,
    supported: true,
  },
  {
    name: 'return annotation',
    src: `function f(s: string): string { return s }`,
    supported: true,
  },
  {
    name: 'void return',
    src: `function f(s: string): void { }`,
    supported: true,
  },
  {
    name: 'nullable union',
    src: `function f(x: string | null) { return x }`,
    supported: true,
  },
  {
    name: 'arrow with types',
    src: `const f = (s: string): string => s`,
    supported: true,
  },
  {
    name: 'rest param typed',
    src: `function f(...xs: number[]) { return xs }`,
    supported: true,
  },
  {
    name: 'tuple type',
    src: `function f(p: [number, string]) { return p }`,
    supported: true,
  },
  {
    name: 'export function',
    src: `export function f(s: string) { return s }`,
    supported: true,
  },

  // --- acceptance gaps: additive to fix, no consumer churn ---
  // Grouped by root cause, because they are far fewer than 13 separate jobs.
  // (a) `T[]` suffix
  {
    name: 'array T[]',
    src: `function f(a: string[]) { return a }`,
    supported: false,
  },
  // (b) angle-bracket type arguments — one root cause behind four failures
  {
    name: 'Array<T>',
    src: `function f(a: Array<string>) { return a }`,
    supported: false,
  },
  {
    name: 'Promise<T> return',
    src: `async function f(): Promise<string> { return 'x' }`,
    supported: false,
  },
  {
    name: 'Record<K,V>',
    src: `function f(m: Record<string, number>) { return m }`,
    supported: false,
  },
  {
    name: 'generic function',
    src: `function f<T>(x: T): T { return x }`,
    supported: false,
  },
  // (c) type-level declaration forms
  {
    name: 'interface',
    src: `interface User { id: number }\nfunction f(u: User) { return u }`,
    supported: false,
  },
  {
    name: 'type alias',
    src: `type ID = string\nfunction f(x: ID) { return x }`,
    supported: false,
  },
  { name: 'enum', src: `enum E { A, B }`, supported: false },
  {
    name: 'import type',
    src: `import type { Foo } from './x'\nfunction f(x: number) { return x }`,
    supported: false,
  },
  // (d) class member annotations + modifiers
  {
    name: 'class field types',
    src: `class A { x: number = 1; m(s: string): string { return s } }`,
    supported: false,
  },
  {
    name: 'access modifiers',
    src: `class A { private readonly x: number = 1 }`,
    supported: false,
  },
  // (e) casts
  {
    name: 'as cast',
    src: `function f(x: unknown) { return x as string }`,
    supported: false,
  },
  // (f) annotated param with a default — also the most common paste-in-TS shape
  {
    name: 'param with default',
    src: `function f(n: number = 5) { return n }`,
    supported: false,
  },
]

describe('TypeScript conformance (are we TypeScript++ yet?)', () => {
  for (const c of CASES.filter((c) => c.supported)) {
    it(`accepts: ${c.name}`, () => {
      expect(() => compile(c.src)).not.toThrow()
    })
  }

  for (const c of CASES.filter((c) => !c.supported)) {
    it(`KNOWN GAP: ${c.name}`, () => {
      // Fails loudly if this starts working: promote it to `supported: true` and update
      // the score. An understated ledger is as misleading as an overstated one.
      expect(
        () => compile(c.src),
        `\`${c.name}\` now compiles — promote it to supported: true in this file.`
      ).toThrow()
    })
  }

  it('reports the conformance score', () => {
    const ok = CASES.filter((c) => c.supported).length
    // Not a threshold to game — a number to move, printed so it is visible in CI output.
    console.log(
      `  TypeScript conformance: ${ok}/${CASES.length} ` +
        `(${Math.round((ok / CASES.length) * 100)}%)`
    )
    expect(ok).toBeGreaterThan(0)
  })
})

describe('semantic drift: legal TS/JS that TJS reads differently', () => {
  // These are the ONLY changes that can force a consumer to edit working code, so they are
  // enumerated separately and deliberately. Each must ship with or before the release that
  // claims TypeScript++.
  const saved = (globalThis as any).__tjs

  it('DRIFT: `n = 5` means integer here, `number` in TypeScript', () => {
    ;(globalThis as any).__tjs = createRuntime()
    try {
      const f = new Function(
        compile(`function f(n = 5) { return n }`).code + '\nreturn f'
      )()
      // TypeScript infers `number` from the initializer, so 3.5 is valid there.
      // We currently infer an integer example and reject it.
      const rejectsFloat = isMonadicError(f(3.5))
      expect(
        rejectsFloat,
        'if this is false the drift is FIXED — remove this test and note the ' +
          'behavior change in CHANGELOG as a breaking change'
      ).toBe(true)
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  })

  it('no drift: `n: number` and `s = ""` already agree with TypeScript', () => {
    ;(globalThis as any).__tjs = createRuntime()
    try {
      const n = new Function(
        compile(`function f(n: number) { return n }`).code + '\nreturn f'
      )()
      expect(isMonadicError(n(3.5))).toBe(false)
      const s = new Function(
        compile(`function f(s = 'a') { return s }`).code + '\nreturn f'
      )()
      expect(isMonadicError(s('zz'))).toBe(false)
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  })
})
