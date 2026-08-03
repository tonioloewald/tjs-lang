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
import { fromTS } from './emitters/from-ts'

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

describe('semantic drift is a CONVERSION job, not a breaking change', () => {
  // `function f(n = 5)` is legal TS and legal JS. TypeScript infers `number`; TJS reads the
  // initializer as an example and narrows to an integer. That looked like a forced breaking
  // change — until you notice the converter can just rewrite it.
  //
  //     n = 5   (TS: number)   →   n = 5.0   + a comment naming the finer grain
  //
  // `5.0` accepts floats AND still defaults to 5, so meaning is preserved exactly, and the
  // comment teaches the upgrade available at that exact site (`= 5` narrows to an integer,
  // `= +5` to unsigned). Nobody has to edit working code, and the on-ramp does the teaching
  // where it is relevant rather than in a migration guide nobody reads.
  //
  // This is the general converter rule: **preserve meaning, and comment the upgrade.**
  const saved = (globalThis as any).__tjs
  const run = (src: string, v: unknown) => {
    ;(globalThis as any).__tjs = createRuntime()
    try {
      const f = new Function(compile(src).code + '\nreturn f')()
      return isMonadicError(f(v))
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  }

  it('`n = 5` narrows to an integer — TJS meaning, deliberately kept', () => {
    expect(run(`function f(n = 5) { return n }`, 3.5)).toBe(true)
  })

  it('`n = 5.0` is the rewrite: TS semantics preserved, default intact', () => {
    // The whole reason no break is needed. If this ever stops holding, the conversion
    // strategy loses its escape hatch and the breaking-change question comes back.
    expect(
      run(`function f(n = 5.0) { return n }`, 3.5),
      '3.5 must be accepted'
    ).toBe(false)
    ;(globalThis as any).__tjs = createRuntime()
    try {
      const f = new Function(
        compile(`function f(n = 5.0) { return n }`).code + '\nreturn f'
      )()
      expect(f(undefined), 'the default must still be 5').toBe(5)
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  })

  it('the finer grain the comment should teach is real', () => {
    expect(
      run(`function f(n = 5) { return n }`, 3.5),
      '= 5 rejects a float'
    ).toBe(true)
    expect(
      run(`function f(n = +5) { return n }`, -1),
      '= +5 rejects a negative'
    ).toBe(true)
  })

  it('no drift: `n: number` and `s = ""` already agree with TypeScript', () => {
    expect(run(`function f(n: number) { return n }`, 3.5)).toBe(false)
    expect(run(`function f(s = 'a') { return s }`, 'zz')).toBe(false)
  })
})

describe('the rename seam: acceptance is necessary but NOT sufficient', () => {
  // TJS deliberately fixes footguns TypeScript keeps, and a `.tjs` extension turns those
  // modes ON. So "paste your .ts and rename it" is not the paved path — it is a semantic
  // change disguised as a file operation. The real flow is **transpile TS → TJS, then
  // change the extension**, and the transpile step has to carry the footgun rewrites.
  //
  // Today it doesn't, and the two ways through both fail:
  //
  //   keep the `/* tjs <- … */` marker  → modes stay OFF. Safe, but the file never
  //                                       becomes real TJS; you get none of the fixes.
  //   drop the marker (tidy the header) → modes turn ON. `var` errors loudly (fine),
  //                                       and `==` silently changes meaning (not fine).
  //
  // These tests pin the seam so the conversion work has a target and so neither behavior
  // changes by accident. See TODO "Paving the TS → TJS path".
  const FOOTGUNS = [
    `function check(a: string, b: number) {`,
    `  if (a == b) return true`,
    `  return false`,
    `}`,
  ].join('\n')

  it('converted output keeps JS `==` semantics while the marker is present', () => {
    const converted = fromTS(FOOTGUNS, { emitTJS: true }).code
    expect(converted).toContain('/* tjs <-')
    const js = compile(converted).code
    expect(
      js.includes('Eq('),
      'with the fromTS marker, modes are OFF and `==` must keep JS semantics'
    ).toBe(false)
  })

  it('dropping the marker flips `==` to TJS equality — a SILENT semantic change', () => {
    const converted = fromTS(FOOTGUNS, { emitTJS: true }).code
    const stripped = converted.replace(/\/\* tjs <- [^*]*\*\/\n?/, '')
    const js = compile(stripped).code
    expect(
      js.includes('Eq('),
      'without the marker `==` compiles to Eq — same source, different meaning. This is ' +
        'the seam: the conversion must rewrite comparisons rather than leave them to ' +
        'change meaning based on a header comment.'
    ).toBe(true)
  })

  it('GAP: conversion emits no warning about semantics that will change', () => {
    // The conversion knows it is handing you code whose `==` will mean something else the
    // moment the file is really TJS, and says nothing. Flip this expectation when the
    // converter learns to warn (or to rewrite).
    const r = fromTS(FOOTGUNS, { emitTJS: true })
    expect(
      (r.warnings ?? []).length,
      'if this is non-zero the converter now warns — update this test and the TODO'
    ).toBe(0)
  })
})

describe('the migration ladder is now PER-CONSTRUCT, not per-mode', () => {
  // It used to be per-mode: `TjsCompat`, then turn rules back on one at a time. The mode
  // abolitions removed that — the file extension is the gate, so there is no per-file dial.
  //
  // The ladder did not disappear; it got FINER. Instead of "turn on honest equality for
  // this file", you convert the file and mark the individual sites that need the old
  // behavior — `unsafe new Date(x)`, `DangerousLegacyEquals(a, b)`, `LegacyDefault({…})`.
  // That is strictly better for the thing a ladder is for: the accidental use is still
  // caught, where a mode-off file silenced it.
  const src = (d: string) =>
    `${d}\nfunction f(a: 0, b: 0) { if (a == b) return 1\n return 0 }`
  const usesTjsEquality = (d: string) => compile(src(d)).code.includes('Eq(')

  it('native TJS has the rules on, with no directive needed', () => {
    expect(usesTjsEquality('')).toBe(true)
  })

  it('TjsCompat still means JS-compatible — that one is DIALECT, not a mode', () => {
    // It survives because it answers a different question: which language is this?
    // Plain JS and TS-originated source must keep JS semantics or TJS stops being a
    // superset. What is gone is dialing individual rules.
    expect(usesTjsEquality('TjsCompat')).toBe(false)
  })

  it('you can no longer opt a single rule back in — the directive is gone', () => {
    expect(() => compile(src('TjsCompat\nTjsEquals'))).toThrow(
      /`TjsEquals` is no longer a mode/
    )
  })

  it('the per-site escape is what replaced it', () => {
    // Same intent — "I want JavaScript's behavior here" — but scoped to one expression
    // rather than a whole file.
    expect(() =>
      compile(`function f(a: 0, b: '') { return DangerousLegacyEquals(a, b) }`)
    ).not.toThrow()
  })
})

/**
 * `bigint` — a real kind, not an alias for `number`.
 *
 * `TS_TYPE_NAMES` mapped `bigint` to `{ kind: 'number' }`, emitting `typeof n !== 'number'`.
 * That is inverted in BOTH directions: every valid bigint was rejected, and every plain
 * number was accepted. In 0.12.0 the annotation degraded to `any` and simply worked, so
 * this was a working → 100%-broken regression, and it was the one entry in the CHANGELOG's
 * "now check at runtime, agreeing exactly with the equivalent example type" table with no
 * runtime test — which is exactly why nobody noticed.
 *
 * These EXECUTE the compiled function. A test that only inspected the descriptor would have
 * passed against the broken mapping.
 */
describe('bigint is checked as bigint', () => {
  const compile = (src: string, name: string) => {
    const out = tjs(src, { runTests: false })
    const prev = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      return new Function(out.code + `\nreturn ${name}`)()
    } finally {
      globalThis.__tjs = prev
    }
  }

  // Both spellings of the same type must agree — they disagreed before: the named form
  // rejected everything while the example form `0n` did not even parse.
  const spellings: Array<[string, string]> = [
    ['named type', `function g(n: bigint) { return n }`],
    ['example value', `function g(n: 0n) { return n }`],
    ['named, with return type', `function g(n: bigint): bigint { return n }`],
    ['example, with return type', `function g(n: 0n): 0n { return n }`],
  ]

  for (const [label, src] of spellings) {
    it(`accepts a bigint and rejects a number (${label})`, () => {
      const g = compile(src, 'g')
      expect(g(10n)).toBe(10n)
      expect(isMonadicError(g(10))).toBe(true)
      expect(isMonadicError(g('10'))).toBe(true)
    })
  }

  it('a bigint example round-trips through fromTS back into tjs()', () => {
    // fromTS emits `x: 0n` for a TS `bigint`, so the converter was producing TJS that its
    // own parser rejected — the conversion contract's "equivalent" obligation, broken.
    const converted = fromTS(
      `export function g(x: bigint): bigint { return x }`,
      { emitTJS: true }
    ).code
    expect(converted).toContain('0n')
    expect(() => tjs(converted, { runTests: false })).not.toThrow()
  })

  it('`tjs types` can serialise a bigint example', () => {
    // JSON.stringify THROWS on BigInt rather than skipping it, so one `0n` anywhere in a
    // file took down the whole transpile with a message naming no file and no line.
    expect(() => tjs(`function g(x: 0n): 0n { return x }`)).not.toThrow()
  })
})

/**
 * `n?: number` — the single most common shape a TypeScript author pastes.
 *
 * The colon shorthand rewrites an optional param to `n = <annotation>`, which is right for
 * an example (`n?: 0` → `n = 0`) and a DANGLING IDENTIFIER for a type name (`n?: number` →
 * `n = number`). Calling the function threw `number is not defined` — emitted JavaScript
 * that fails on the happy path.
 *
 * Long-standing, but this release made it far more likely: bare TS names now produce real
 * runtime checks, so the annotation LOOKS like it works, and `int`/`unsigned`/`float` are
 * newly encouraged.
 */
describe('optional params annotated with a type name', () => {
  const compile = (src: string, name: string) => {
    const out = tjs(src, { runTests: false })
    const prev = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      return {
        fn: new Function(out.code + `\nreturn ${name}`)(),
        code: out.code,
      }
    } finally {
      globalThis.__tjs = prev
    }
  }

  for (const type of [
    'number',
    'int',
    'unsigned',
    'float',
    'string',
    'boolean',
  ]) {
    it(`g(n?: ${type}) is callable with no argument`, () => {
      const { fn, code } = compile(`function g(n?: ${type}) { return n }`, 'g')
      // The dangling default must be gone from the emitted signature…
      expect(code).not.toMatch(new RegExp(`function g\\\\(n = ${type}\\\\)`))
      // …and calling it must not throw.
      expect(() => fn()).not.toThrow()
      expect(fn()).toBeUndefined()
    })
  }

  it('still CHECKS the type when an argument is supplied', () => {
    // Deleting the default must not delete the type — that would trade a crash for a
    // silent `any`, which is the worse of the two.
    const { fn } = compile(`function g(n?: number) { return n }`, 'g')
    expect(fn(5)).toBe(5)
    expect(isMonadicError(fn('nope'))).toBe(true)
  })

  it('keeps an EXAMPLE default, which is a real value', () => {
    const { fn, code } = compile(`function g(n?: 0) { return n }`, 'g')
    expect(code).toMatch(/function g\(n = 0\)/)
    expect(fn()).toBe(0)
  })

  it('an unresolved user type degrades to any, and says so', () => {
    const result = tjs(`function g(n?: MyThing) { return n }`, {
      runTests: false,
    })
    expect(result.warnings?.join('\n')).toMatch(/could not be resolved/)
    const prev = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      const fn = new Function(result.code + '\nreturn g')()
      expect(() => fn()).not.toThrow()
    } finally {
      globalThis.__tjs = prev
    }
  })
})
