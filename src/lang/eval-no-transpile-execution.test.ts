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
 * by sharing `parse()` — where every other TJS-only transform is gated on `!options.vmTarget`
 * and this one was not. An agent language whose premise is that code travels as DATA and runs
 * with no ambient authority was calling `new Function(body)()` on the submitted string.
 *
 * So the fix is a gate, not a policy change: AJS rejects `test` blocks as the syntax error they
 * are. Flipping the global `runTests` default would have changed documented TJS behaviour to
 * fix a bug that only ever existed on the other path.
 *
 * ## What this file is for
 *
 * The same job as `membrane-invariant.test.ts`: assert the boundary holds, by trying to cross
 * it. Add a row whenever a new construct can run at transpile time — the question to ask of
 * any such feature is "can a `vmTarget` caller reach it", and the answer must be no.
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { Eval, SafeFunction } from './eval'
import { transpile } from './core'
import { tjs } from './index'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { maskLiterals } from '../strip-comments'

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
  // Several TJS-only constructs are still ACCEPTED by a vmTarget transpile — they are inert,
  // but accepting syntax the language does not have is how `test` blocks got there in the
  // first place. Recorded as a table so the answer is visible rather than assumed, and so a
  // new construct that starts EXECUTING fails here instead of on a public endpoint.
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

  it('test extraction is the only dynamic-execution site in the parse path', () => {
    // The structural claim behind all of the above, asserted against the SOURCE rather than
    // inferred from behaviour — the same technique as `atom-effects-scan.test.ts`, and for
    // the same reason: a behavioural probe only covers the constructs somebody thought to
    // probe. If a second `new Function` appears in a transform, this fails and whoever added
    // it has to say why a vmTarget caller cannot reach it.
    const files = [
      'parser.ts',
      'parser-transforms.ts',
      'parser-params.ts',
      'core.ts',
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
    expect(sites).toEqual([
      'parser-transforms.ts: const testFn = new Function(body)',
    ])
  })
})

/**
 * The AJS surface, as a RATCHET.
 *
 * `parse()` applies ~30 transforms and exactly TWO consult `options.vmTarget`. Everything else
 * runs for AJS whether or not AJS has the construct — which is not a policy, it is the absence
 * of one. `test` blocks were in this list until an hour ago, and they were the one that
 * happened to call `new Function`.
 *
 * The structural fix is inversion: an AJS core that does only AJS things, with TJS as a wrapper
 * that adds its own transforms. A gate fails OPEN — seventeen transforms, one missing guard,
 * months unnoticed. Layering fails CLOSED: a new TJS transform cannot leak into AJS because it
 * does not live there. Filed in TODO.md; too large to do under release pressure, which is how
 * the last one of these got introduced.
 *
 * Until then this bounds the damage. The list below is what leaks TODAY. An eighth entry fails
 * this test, and whoever adds it has to decide deliberately rather than inherit it.
 */
describe('TJS constructs the AJS path still accepts (ratchet)', () => {
  // Accepted today. Inert — every one is exercised for transpile-time execution above — but
  // accepted syntax the language does not have is exactly how the last vulnerability arrived.
  const KNOWN_LEAKS = [
    'bang access',
    'Is operator',
    'inline wasm fn',
    'Type block',
    'Generic block',
    'extend',
    'FunctionPredicate',
  ]

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
