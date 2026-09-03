/**
 * Transpiling untrusted source must not EXECUTE it.
 *
 * `Eval` and `SafeFunction` exist so a caller can run submitted code under fuel, a timeout,
 * explicit capabilities and the VM membrane. All four are properties of `vm.run`. Anything
 * that executes during `parse()` happens BEFORE them, so it is not sandboxed by anything at
 * all — the guarantees are downstream of the breach.
 *
 * That is what `test '…' { … }` blocks did on the AJS path:
 *
 *     Eval({ code: "test 'x' { globalThis.__PWNED__ = true } return 1",
 *            fuel: 10, timeoutMs: 1 })
 *     -> { result: 1, fuelUsed: 0.2 }   and __PWNED__ === true
 *
 * Full ambient authority, 0.2 fuel charged, `timeoutMs: 1` irrelevant. `functions/src/index.tjs`
 * passes user-supplied code to `Eval` from two public endpoints.
 *
 * ## Why it was a category error before it was a vulnerability
 *
 * AJS has never had test blocks. They are a TJS feature, and the AJS path inherited them only
 * by sharing `parse()` — where every other TJS-only transform was gated on `!options.vmTarget`
 * and this one was not. An agent language whose premise is that code travels as DATA and runs
 * with no ambient authority was calling `new Function(body)()` on the submitted string.
 *
 * The immediate fix (0.13.7) was a third gate. The real one (2026-09-03) is that AJS no longer
 * shares `parse()` at all: it has its own parser, `parseAgentSource()` in `parser-agent.ts`,
 * containing only the four transforms AJS actually has. `vmTarget` is gone. A gate fails OPEN
 * — it has to be remembered, once per transform, forever. Layering fails CLOSED.
 *
 * ## What this file is for
 *
 * The same job as `membrane-invariant.test.ts`: assert the boundary holds, by trying to cross
 * it. Two kinds of assertion live here, and they cover different failures:
 *
 * - **Behavioural** — transpile a construct, check nothing ran and nothing was accepted. Only
 *   ever covers constructs somebody thought to list.
 *   Add a row whenever a new construct can run at transpile time.
 * - **Structural** — read the source and pin what the AJS pipeline imports, and where dynamic
 *   execution is allowed to exist at all. Catches the ones nobody thought of, which is the
 *   category the original vulnerability was in.
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { Eval, SafeFunction } from './eval'
import { transpile } from './core'
import { tjs } from './index'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { maskLiterals } from '../strip-comments'
// Error-tolerant, because the file under inspection is TypeScript and acorn proper dies on
// the first `interface`. The imports are plain ES either way, and this is the same dependency
// the editor scope-extraction uses for half-typed buffers.
import * as acornLoose from 'acorn-loose'

const SENTINELS = ['__TJS_PWNED__', '__TJS_PWNED_2__', '__TJS_PWNED_3__']
afterEach(() => {
  for (const s of SENTINELS) delete (globalThis as any)[s]
})

describe('a VM-target transpile executes nothing', () => {
  it('Eval does not run a test block, and does not charge it as work', async () => {
    const result: any = await Eval({
      code: `test 'x' { globalThis.${SENTINELS[0]} = true } return 1`,
      fuel: 10,
      timeoutMs: 1,
    })
    expect((globalThis as any)[SENTINELS[0]]).toBeUndefined()
    // It must FAIL, not silently succeed with the block stripped — AJS has no `test`
    // syntax, so this source is invalid and saying so is the honest outcome.
    expect(result.error).toBeDefined()
    expect(result.result).toBeUndefined()
  })

  it('SafeFunction does not run a test block', () => {
    // Takes an options object with `body`, not a bare string — the first version of this
    // test passed the source positionally, got back a non-function, and reported a pass for
    // the wrong reason. A security guardrail that cannot fail is worse than none.
    expect(() =>
      SafeFunction({
        body: `test 'x' { globalThis.${SENTINELS[1]} = true } return 1`,
      })
    ).toThrow()
    expect((globalThis as any)[SENTINELS[1]]).toBeUndefined()
  })

  it('the raw VM transpile does not run a test block', () => {
    // The layer underneath both, so a future caller that reaches `transpile` directly is
    // covered without needing its own row.
    expect(() =>
      transpile(
        `function __eval() { test 'x' { globalThis.${SENTINELS[2]} = true } return 1 }`
      )
    ).toThrow()
    expect((globalThis as any)[SENTINELS[2]]).toBeUndefined()
  })

  it('ordinary Eval still works', () => {
    // The gate must not be so broad it breaks the feature it protects. Without this, a
    // transpile that rejected everything would pass every assertion above.
    return Eval({ code: 'return 1 + 2', fuel: 100 }).then((r: any) => {
      expect(r.result).toBe(3)
      expect(r.error).toBeUndefined()
    })
  })
})

describe('TJS keeps its inline tests', () => {
  it('a .tjs transpile still runs and reports test blocks', () => {
    // The other direction. Inline tests are a headline TJS feature — "the signature IS the
    // documentation, the test IS in the source" — and fixing the AJS path must not touch it.
    const r = tjs(
      `function add(a: 0, b: 0): 0 { return a + b }\n` +
        `test 'adds' { expect(add(1, 2)).toBe(3) }`
    )
    expect((r.testResults ?? []).length).toBeGreaterThan(0)
    expect(r.testResults?.every((t: any) => t.passed)).toBe(true)
  })
})

describe('the AJS path runs AJS and nothing else', () => {
  // "Does the VM only run AJS?" asked structurally rather than one construct at a time.
  //
  // These are all REJECTED now that AJS parses through its own core (`parser-agent.ts`), but
  // the rows stay: rejection is the mechanism today, and this table asserts the weaker,
  // longer-lived property underneath it — that nothing RUNS during a VM-target transpile, even
  // if some future change makes one of these parse again. A construct that is merely inert is
  // not safe; all seven leaks were inert right up until one of them wasn't.
  const constructs: Array<[string, string, string]> = [
    [
      'test block',
      `function f() { test 'x' { globalThis.SENT = 1 } return 1 }`,
      '__TJS_X1__',
    ],
    [
      'wasm function',
      `wasm function w(a: 0): 0 { globalThis.SENT = 1\n return a }\nfunction f() { return 1 }`,
      '__TJS_X2__',
    ],
    [
      'Type block predicate',
      `Type T { description: 't'\n predicate(x) { globalThis.SENT = 1\n return true } }\nfunction f() { return 1 }`,
      '__TJS_X3__',
    ],
    [
      'extend block',
      `extend Array { last() { globalThis.SENT = 1\n return this[0] } }\nfunction f() { return 1 }`,
      '__TJS_X4__',
    ],
  ]

  for (const [label, template, sentinel] of constructs) {
    it(`${label}: nothing executes during a vmTarget transpile`, () => {
      const src = template.replace(/SENT/g, sentinel)
      delete (globalThis as any)[sentinel]
      try {
        transpile(src)
      } catch {
        // Rejected is a fine outcome — the property under test is that nothing RAN.
      }
      expect((globalThis as any)[sentinel]).toBeUndefined()
      delete (globalThis as any)[sentinel]
    })
  }

  it('every dynamic-execution site in the transpile path is accounted for', () => {
    // The structural claim behind all of the above, asserted against the SOURCE rather than
    // inferred from behaviour — the same technique as `atom-effects-scan.test.ts`, and for
    // the same reason: a behavioural probe only covers the constructs somebody thought to
    // probe. If a second `new Function` appears in a transform, this fails and whoever added
    // it has to say why a vmTarget caller cannot reach it.
    // The EMITTERS too. This list was parser-only while the test's name claimed "the entire
    // parse path" — a claim broader than what it checked, which is the exact failure this
    // file exists to prevent, committed in this file. Eight
    // `new Function(\`return ${…}\`)` sites sat in the emitters evaluating TJS example
    // values, so `tjs check` on an untrusted `.tjs` executed it; the 0.13.8 re-review found
    // them and `literal-value.ts` replaced them with parsing.
    const files = [
      'parser.ts',
      'parser-agent.ts',
      'parser-transforms.ts',
      'parser-params.ts',
      'core.ts',
      'predicate.ts',
      'literal-value.ts',
      'emitters/js.ts',
      'emitters/js-tests.ts',
    ]
    const sites: string[] = []
    for (const f of files) {
      const src = readFileSync(join(import.meta.dir, f), 'utf8')
      // Executable occurrences only — the file is full of diagnostic STRINGS naming these.
      for (const line of maskLiterals(src).split('\n')) {
        if (/(^|[^.\w])(new Function\s*\(|eval\s*\()/.test(line))
          sites.push(`${f}: ${line.trim().slice(0, 60)}`)
      }
    }
    // Three sites, each deliberate and each named. The two in the test path — extraction and
    // the runner — are TJS inline tests, a headline feature, and both sit downstream of the
    // `vmTarget` gate, so a VM-target transpile reaches neither. `predicate.ts` compiles only
    // VERIFIED-SAFE predicates with effectful globals shadowed and fuel injected — a
    // hardened path, not an oversight. A third entry needs the same justification in
    // writing before this list grows.
    expect(sites.sort()).toEqual(
      [
        'parser-transforms.ts: const testFn = new Function(body)',
        'predicate.ts: const factory = new Function(',
        'emitters/js-tests.ts: const fn = new Function(',
      ].sort()
    )
  })

  it('a removed `vmTarget` is REFUSED, never silently ignored', async () => {
    // The 0.13.10 review's M-1, pinned. Removing the flag without refusing it was a fail-open
    // of exactly the kind the split exists to end: before the split
    // `parse(src, { vmTarget: true })` SUPPRESSED test extraction, and afterwards the same
    // call silently ran `new Function(body)()` on the caller's source. TypeScript objects only
    // to an inline object literal, so a JS consumer or an `as any` got no signal at all.
    //
    // Asserted through BOTH entries and with `colonShorthand: false`, because `parse` skips
    // `preprocess` in that configuration and a guard in one place would miss it.
    const { parse, preprocess } = await import('./parser')
    const sentinel = '__TJS_VMTARGET__'
    // Same shape as the payloads above — a `test` block INSIDE a function. Written this way
    // rather than as a top-level block plus a second declaration because the latter form made
    // this file stop converting in the dogfood ratchet, an interaction bug filed in TODO.md.
    const payload = `function main(n) { test 'x' { globalThis.${sentinel} = true } return n }`
    delete (globalThis as any)[sentinel]

    for (const call of [
      () => parse(payload, { vmTarget: true } as any),
      () => parse(payload, { vmTarget: true, colonShorthand: false } as any),
      () => preprocess(payload, { vmTarget: true } as any),
      () => parse(payload, { ...{ vmTarget: false } } as any), // present-but-false still refuses
    ]) {
      expect(call).toThrow(/vmTarget/)
    }
    // The property that actually matters: nothing ran on the way to the refusal.
    expect((globalThis as any)[sentinel]).toBeUndefined()
    delete (globalThis as any)[sentinel]
  })

  it('the AJS parse pipeline is exactly the steps AJS has', () => {
    // The behavioural ratchet below can only cover constructs somebody thought to list. This
    // is the structural claim underneath it, asserted against the SOURCE — the same technique
    // as `atom-effects-scan.test.ts`, and for the same reason.
    //
    // A source transform reaches AJS only by being imported into `parser-agent.ts`. Pinning
    // that import set means a new step cannot arrive quietly: adding one turns this red, and
    // whoever added it has to answer the only question that matters — does AJS *have* this
    // construct? Inertness is not an answer; all seven historical leaks were inert.
    // PARSED with acorn, not matched with a regex.
    //
    // The first version of this guard was a line-anchored regex matching `import` followed by
    // a BRACED name list and a quoted specifier. It therefore saw only brace-form named
    // imports: a namespace import (`import * as T from …`) and a default import both yielded
    // zero matches — so the evasion was one keystroke wide, and a namespace import could have
    // brought the entire TJS transform module in with the guard still green.
    //
    // (That pattern is described rather than quoted here on purpose: written out as a literal
    // it contains a regex delimiter and nested quotes, which our own converter mis-scans —
    // the literal-blindness class, see src/lang/literal-blindness.test.ts. Filed in TODO.md;
    // a comment should not be the thing that breaks the dogfood ratchet.)
    //
    // It was not hypothetical. `import * as acorn from 'acorn'` is the FIRST import in
    // parser-agent.ts and the pin could not see it, so the expected list below never contained
    // it and the comment introducing it had slid onto the next entry. The one import the author
    // narrated was the one the guard was blind to — a guard whose own subject matter is that a
    // comment is not a control.
    //
    // Parsing makes the shape irrelevant: every import form lands in `ImportDeclaration`, so
    // named, namespace, default and side-effect-only all get pinned. Type-only imports are
    // excluded properly here (`importKind`), where the old dead `/^import\s+type/` test could
    // never fire because the outer regex already excluded those lines.
    const src = readFileSync(join(import.meta.dir, 'parser-agent.ts'), 'utf8')
    const ast = acornLoose.parse(src.replace(/^import type[^\n]*\n/gm, ''), {
      ecmaVersion: 2022,
      sourceType: 'module',
    }) as any
    const imported = new Set<string>()
    for (const node of ast.body) {
      if (node.type !== 'ImportDeclaration') continue
      const from = node.source.value
      if (!node.specifiers.length) imported.add(`${from}:<side-effect>`)
      for (const s of node.specifiers) {
        if (s.type === 'ImportNamespaceSpecifier')
          imported.add(`${from}:* as ${s.local.name}`)
        else if (s.type === 'ImportDefaultSpecifier')
          imported.add(`${from}:default`)
        else imported.add(`${from}:${s.imported.name}`)
      }
    }
    expect([...imported].sort()).toEqual(
      [
        // acorn — the parse itself. AJS is a JavaScript subset, so acorn IS its grammar.
        // Now actually pinned, and on its own entry rather than commenting the one below it.
        'acorn:* as acorn',
        './types:SyntaxError',
        // A hashbang is ES2023, therefore inside the subset. Blanked, not sliced, so
        // diagnostic offsets survive.
        '../strip-comments:hashbangOf',
        // Comments are comments in every language here.
        '../strip-comments:stripLineComments',
        // Colon shorthand — the one thing AJS has that JavaScript does not, and load-bearing:
        // the entry function's parameter examples are the agent's input contract.
        // NOTE: `parser-params.ts` is SHARED with TJS's parser. It is the one shared source
        // surface, and m-1 of the 0.13.10 review found TJS safety markers leaking across it —
        // so "absent by construction" is true of the transform LIST, not of every byte of
        // behaviour reachable through it. Tightening that is tracked in TODO.md.
        './parser-params:transformParenExpressions',
        './parser-params:extractParamMarkers',
      ].sort()
    )
  })
})

/**
 * The AJS surface, as a RATCHET. **The list is empty, and that is the assertion.**
 *
 * History, because the empty list is only meaningful next to it: `parse()` applied ~30 source
 * transforms and exactly TWO consulted `options.vmTarget`, so the other ~28 ran for AJS whether
 * or not AJS had the construct. Seven TJS-only constructs were accepted that way, and an eighth
 * — `test` blocks — was the one that happened to call `new Function(body)()` on submitted
 * source. A gate fails OPEN: seventeen transforms, one missing guard, months unnoticed.
 *
 * The structural fix landed (`parser-agent.ts`): AJS parses through `parseAgentSource()`, a
 * four-step pipeline containing only transforms AJS has. `vmTarget` is gone — there is no flag
 * left to forget. Layering fails CLOSED, so all seven leaks closed at once, without any of them
 * being fixed individually.
 *
 * This still ratchets in BOTH directions, and the empty list is what makes the first direction
 * sharp: any construct below that starts being accepted means a TJS transform has found its way
 * onto the AJS path again, and it fails here by name.
 */
describe('TJS constructs the AJS path does not accept (ratchet)', () => {
  // Empty since the AJS core was split out (`parser-agent.ts`). Kept as a named constant
  // rather than inlined, so a re-leak reads as a list gaining an entry — the same shape the
  // seven-entry version had, which is what makes the two states comparable at a glance.
  const KNOWN_LEAKS: string[] = []

  const CONSTRUCTS: Array<[string, string]> = [
    ['const!', 'function f() { const! x = 1\n return x }'],
    ['bang access', 'function f(o) { return o!.a }'],
    ['Is operator', 'function f(a, b) { return a Is b }'],
    ['try without catch', 'function f() { try { return 1 } return 2 }'],
    [
      'inline wasm fn',
      'wasm function w(a: 0): 0 { return a }\nfunction f() { return 1 }',
    ],
    ['Type block', 'Type T { example: { a: 0 } }\nfunction f() { return 1 }'],
    [
      'Generic block',
      "Generic G<A> { description: 'g'\n predicate(x, A) { return true } }\nfunction f() { return 1 }",
    ],
    ['Union', 'Union U { a: 0 }\nfunction f() { return 1 }'],
    ['Enum', 'Enum E { A, B }\nfunction f() { return 1 }'],
    [
      'extend',
      'extend Array { last() { return this[0] } }\nfunction f() { return 1 }',
    ],
    [
      'FunctionPredicate',
      "FunctionPredicate P { description: 'p'\n predicate(x) { return true } }\nfunction f() { return 1 }",
    ],
    ['test block', "function f() { test 'x' { return 1 } return 1 }"],
    ['given', "function f(x) { given x { 'a' { return 1 } } return 0 }"],
    ['class', 'class C { m() { return 1 } }\nfunction f() { return 1 }'],
  ]

  it('accepts exactly the known leaks, and nothing more', () => {
    const accepted: string[] = []
    for (const [label, src] of CONSTRUCTS) {
      try {
        transpile(src)
        accepted.push(label)
      } catch {
        /* rejected — the correct outcome for a construct AJS does not have */
      }
    }
    // Both directions. A NEW leak is a regression; a leak that closes must be delisted, so a
    // fix cannot rot here unnoticed — the same rule as the compat and dogfood ratchets.
    expect(accepted.sort()).toEqual([...KNOWN_LEAKS].sort())
  })

  it('AJS itself still transpiles', () => {
    // The floor. A change that made `transpile` reject everything would satisfy every
    // assertion above.
    expect(() => transpile('function f(n: 0) { return n * 2 }')).not.toThrow()
  })
})

describe('a TJS example value is parsed, never executed', () => {
  // The SECOND transpile-time escape, and it is not on the VM path — this is the ordinary
  // `tjs()` path, so `tjs check`, `tjs emit`, the bun `.tjs` plugin, the module loader and
  // the playground all ran it. The `vmTarget` gate does not touch it.
  //
  // Eight emitter sites did `new Function(`return ${text}`)()` to turn a TJS example into a
  // value. An example is DATA; anything that can compute is not an example. They now parse.
  const payloads: Array<[string, string]> = [
    [
      'return-type default',
      'function f(a: 0): { x = (globalThis.SENT = 42) } { return { x: a } }',
    ],
    [
      'nested in an object example',
      'function f(a: 0): { o = { k: (globalThis.SENT = 42) } } { return { o: {} } }',
    ],
    [
      'array example',
      'function f(a: 0): { xs = [(globalThis.SENT = 42)] } { return { xs: [] } }',
    ],
  ]
  for (const [label, template] of payloads) {
    it(`${label}: does not execute`, () => {
      const sentinel = '__TJS_ANN__'
      const src = template.replace(/SENT/g, sentinel)
      delete (globalThis as any)[sentinel]
      try {
        tjs(src, { runTests: false })
      } catch {
        /* refusing the file is a fine outcome; executing it is not */
      }
      expect((globalThis as any)[sentinel]).toBeUndefined()
      delete (globalThis as any)[sentinel]
    })
  }

  it('ordinary return defaults still work', () => {
    // The floor. Refusing every example would satisfy all of the above.
    const r = tjs(
      "function g(a: 0): { value: 0, error = '' } { return { value: a } }",
      {
        runTests: false,
      }
    )
    expect(r.code).toContain('error')
  })
})
