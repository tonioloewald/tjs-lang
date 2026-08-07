/**
 * The behaviour gate: convert OUR OWN test suites and check they still pass.
 *
 * `dogfood-convert.test.ts` converts every non-test source file and checks it compiles.
 * That is a BUILD gate — it discards `.code` without executing it, and 10 of 10
 * semantics-breaking mutations to converted TJS (`!==` → `===`, dropped `?.`, `&&` → `||`)
 * pass it. Its own corpus filter says so out loud: *"Every **non-test**, non-declaration
 * TypeScript file we ship."* So the 131 files that contain assertions — the only ones that
 * could prove conversion preserves MEANING — were excluded by a one-line filter.
 *
 * This closes that. Convert each test suite, run it, and compare against the original.
 *
 * **Compare assertion COUNTS, not just pass/fail**, because that is what catches a
 * silently-dropped test — and dropping tests silently is not hypothetical here. The worst
 * bug of the 0.13.0 cycle was `isInsideComment` reading `const OPEN = '/*'` as the start of
 * a comment, so every `test { }` block after it vanished: no error, no warning, zero tests
 * reported. A pass/fail comparison stays green through that. An expect()-count comparison
 * does not.
 *
 * Why this is tractable and worth gating on: TJS's entire pitch is that it is a better
 * TypeScript. If it cannot convert 3,000 of our own assertions and have them still hold,
 * the pitch is untested where it matters most. Self-hosting the test suite is a 1.0 target.
 *
 * SLOW by nature — a TypeScript compiler pass per file plus two full suite runs — so it
 * lives in the benchmark lane with its sibling. `test:fast` skips it; the full `bun test`
 * (the enforced pre-tag gate) runs it.
 */
import { describe, it, expect } from 'bun:test'
import {
  readFileSync,
  readdirSync,
  statSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'

const REPO = resolve(import.meta.dir, '../..')
const SRC = join(REPO, 'src')

/**
 * Suites excluded from conversion, each with the reason.
 *
 * Only two things earn a place here: a suite whose result depends on the ENVIRONMENT
 * (a live model, a network, a browser), and a suite that asserts on the repository's own
 * layout in a way relocation breaks even after the `import.meta` rewrite below.
 *
 * "It fails after conversion" is NOT a reason — that is the finding this gate exists to
 * produce, and burying it here would make the gate decorative.
 */
const SKIP: Record<string, string> = {
  'batteries/models.integration.test.ts':
    'needs a live LM Studio with models loaded',
  'use-cases/ajs-grokkability.test.ts':
    'measures a live model; advisory and non-deterministic',
  'dependency-audit.test.ts':
    'shells out to `bun audit`; needs network and the real cwd',
  'bundle-size.test.ts':
    'measures dist/ artifacts by path; nothing to learn from converting it',
  'package-exports.test.ts':
    'reads package.json and the shipped file tree from the repo root',
  'docs-index.test.ts':
    'shells out to `npm pack` against the real project directory',
  'index-tsfree.test.ts':
    'spawns a subprocess with a doctored module resolution',
  'cli/commands/convert.test.ts': 'spawns the CLI with cwd-relative paths',
  'cli/commands/test.test.ts': 'spawns the CLI with cwd-relative paths',
  'lang/dogfood-convert.test.ts':
    'converts the corpus itself — converting it is circular',
  'lang/dogfood-tests.test.ts': 'this file',
}

/**
 * Suites that do not convert TODAY, with the cause. **Must reach empty before 1.0.**
 *
 * A ratchet, not an exemption list: the gate fails if a NEW suite joins, and fails if a
 * listed one starts converting (so a fix cannot rot here). Recording the cause is the
 * point — a bare "known failure" is how a ratchet turns into a graveyard.
 *
 * The first run of this gate produced all nine, and the diagnosis splits three ways.
 * Two are the literal-blindness class again (E1 in ASSUMPTIONS.md), arriving where it is
 * most predictable: a LANGUAGE's own test suite is mostly source code held in strings.
 */
const KNOWN_CONVERSION_FAILURES = new Map<string, string>([
  [
    'lang/wasm.test.ts',
    'LITERAL BLINDNESS: the `wasm function` scanner reads a fixture inside a template literal (`const source = `wasm function dangerous(! …)`) and rejects it as real code.',
  ],
  [
    'lang/codegen.test.ts',
    "LITERAL BLINDNESS: the `const!` handler reads inside a string — `tjs('const! x = 42')` — and reports mutating an immutable binding that only exists in test data.",
  ],
  [
    'lang/runtime.test.ts',
    'SCOPE: two `function add` declarations in DIFFERENT `it()` blocks are merged as ambiguous polymorphic overloads. Same-named functions in disjoint scopes are not overloads.',
  ],
  [
    'types/Type.test.ts',
    'Unexpected token at Type.test.ts:189:36 — undiagnosed.',
  ],
  [
    'lang/parser.test.ts',
    'Unexpected token at parser.test.ts:173:106 — undiagnosed.',
  ],
  [
    'lang/typescript-syntax.test.ts',
    'Unexpected token at typescript-syntax.test.ts:540:35 — undiagnosed.',
  ],
  [
    'lang/function-predicate.test.ts',
    'Unexpected token at function-predicate.test.ts:133:64 — undiagnosed.',
  ],
  [
    'lang/from-ts.test.ts',
    'Unexpected token at from-ts.test.ts:151:70 — undiagnosed.',
  ],
  [
    'use-cases/bootstrap.test.ts',
    'Unexpected token at bootstrap.test.ts:494:64 — undiagnosed.',
  ],
])

/**
 * How far conversion currently is from self-hosting. **The 1.0 target is all zeroes.**
 *
 * Measured 2026-08-07 over 112 convertible suites:
 *
 *     original :  2013 pass,   0 fail,  4805 assertions
 *     converted:  1909 pass, 104 fail,  4518 assertions
 *
 * So conversion preserves **94% of assertions** and 95% of passing tests. The remaining
 * gap is 287 assertions and 104 tests, plus 9 suites that will not convert at all.
 *
 * The first version of this file recorded 1161 and 130 — inflated fourfold, because the
 * converted suites were written to os.tmpdir() and 26 of them then failed with "Cannot
 * find package" as module resolution walked up from /tmp and never reached our
 * node_modules. The harness was failing and being scored as the language failing. It is
 * the exact trap this repo already has written down: an apparatus that fails closed
 * looks precisely like a strong negative result. Re-measured with the files written
 * inside the repo.
 *
 * Asserting parity today would leave the gate permanently red, and a permanently red
 * gate is one nobody reads. So this is a floor that may only improve.
 */
const BASELINE = { assertionsLost: 287, testsBroken: 104 }

/**
 * Improve by this much and the test asks you to lower `BASELINE`.
 *
 * Without it a ratchet silently loosens: someone fixes 400 assertions, the baseline
 * stays at the old number, and the slack is available for a future regression to eat.
 */
const RATCHET_SLACK = 25

/** Every `*.test.ts` we ship, as a repo-relative path under src/. */
function testSuites(): string[] {
  const out: string[] = []
  ;(function walk(d: string) {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.test.ts')) out.push(relative(SRC, p))
    }
  })(SRC)
  return out.filter((p) => !SKIP[p])
}

/**
 * Make a converted suite runnable from somewhere else.
 *
 * Relative imports and `import.meta` are both resolved against the FILE'S LOCATION, so a
 * converted copy in a temp directory would resolve neither. Rewriting them to absolute
 * paths against the original location keeps 23 path-sensitive suites in the gate that
 * would otherwise have to be skipped — and those are ordinary suites, not special cases.
 */
function relocate(code: string, originalPath: string): string {
  const dir = dirname(originalPath)
  return code
    .replace(
      /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.[^'"]*)\2/g,
      (_m, lead, q, rel) => `${lead}${q}${resolve(dir, rel)}${q}`
    )
    .replace(/import\.meta\.dir/g, JSON.stringify(dir))
    .replace(/import\.meta\.path/g, JSON.stringify(originalPath))
}

/** Run `bun test` over some paths and read the summary counts. */
function runSuite(paths: string[], cwd: string) {
  const proc = Bun.spawnSync(['bun', 'test', ...paths], {
    cwd,
    env: {
      ...process.env,
      SKIP_LLM_TESTS: '1',
      SKIP_BENCHMARKS: '1',
      SKIP_AUDIT: '1',
    },
  })
  const out =
    new TextDecoder().decode(proc.stdout) +
    new TextDecoder().decode(proc.stderr)
  const num = (re: RegExp) => Number(out.match(re)?.[1] ?? -1)
  return {
    pass: num(/^\s*(\d+) pass$/m),
    fail: num(/^\s*(\d+) fail$/m),
    asserts: num(/^\s*(\d+) expect\(\) calls$/m),
    out,
  }
}

describe('dogfood: our own test suites survive conversion', () => {
  if (process.env.SKIP_BENCHMARKS) {
    it.skip('skipped (SKIP_BENCHMARKS)', () => {})
    return
  }

  const suites = testSuites()
  // INSIDE the repo, not os.tmpdir(). A converted suite still imports bare packages
  // (`acorn`, `tosijs-schema`), and module resolution walks UP from the file — so from
  // /tmp it never reaches our node_modules and 26 suites failed with "Cannot find
  // package". That is the harness failing, scored as the language failing: it inflated
  // the measured gap by about a quarter before anyone looked at what the errors said.
  const tmp = mkdtempSync(join(REPO, '.dogfood-'))

  it('has a corpus worth measuring', () => {
    // A skip list that swallowed the corpus would make everything below vacuous.
    expect(suites.length).toBeGreaterThan(100)
  })

  it('converts, runs, and preserves every assertion', async () => {
    const { fromTS } = await import('./emitters/from-ts')
    const { tjs } = await import('./index')

    const converted: string[] = []
    const failures: string[] = []

    for (const rel of suites) {
      const original = join(SRC, rel)
      try {
        const tjsSrc = fromTS(readFileSync(original, 'utf8'), { emitTJS: true })
        const js = tjs(tjsSrc.code, {
          filename: original,
          runTests: false,
        }).code
        const dest = join(tmp, rel.replace(/[/\\]/g, '__'))
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, relocate(js, original))
        converted.push(dest)
      } catch (e: any) {
        failures.push(`${rel}: ${String(e.message).split('\n')[0]}`)
      }
    }

    try {
      // A RATCHET, not a skip list. These nine fail conversion today; the list must
      // only ever shrink, and it must be EMPTY before 1.0 — self-hosting the test
      // suite is the release target this gate exists to measure.
      //
      // The difference from a skip list is the two assertions below: a NEW failure
      // fails the gate, and a listed suite that starts converting also fails it, so a
      // fixed entry cannot rot here unnoticed. Each carries its diagnosis, because
      // "known failure" with no cause is how a ratchet becomes a graveyard.
      const failed = new Set(failures.map((f) => f.split(':')[0]))
      const missing = [...KNOWN_CONVERSION_FAILURES.keys()].filter(
        (k) => !failed.has(k)
      )
      const unexpected = [...failed].filter(
        (k) => !KNOWN_CONVERSION_FAILURES.has(k)
      )

      expect({ unexpected, fixedButStillListed: missing }).toEqual({
        unexpected: [],
        fixedButStillListed: [],
      })

      // Compare only the suites that converted — the ratchet above already accounts
      // for the rest, and including them would make the counts differ for a reason we
      // have already recorded.
      const comparable = suites.filter((s) => !KNOWN_CONVERSION_FAILURES.has(s))
      const before = runSuite(
        comparable.map((s) => join(SRC, s)),
        REPO
      )
      const after = runSuite(converted, REPO)

      console.log(
        `\n  converted ${converted.length} suites` +
          `\n  original : ${before.pass} pass, ${before.fail} fail, ${before.asserts} assertions` +
          `\n  converted: ${after.pass} pass, ${after.fail} fail, ${after.asserts} assertions`
      )

      // A BASELINE THAT MUST IMPROVE. Parity is the 1.0 target — `after` equal to
      // `before` on all three — and today conversion loses about a quarter of the
      // assertions outright. Asserting parity now would just leave a red gate, and a
      // gate that is always red is a gate nobody reads.
      //
      // So: never worse than the recorded baseline, and a `console.log` of the real gap
      // on every run so the distance to the target is never out of sight. Improve the
      // numbers and this test tells you to move the baseline down.
      //
      // Assertions are the primary signal, not pass count: conversion that silently
      // DROPS a test still shows it as "passing" — which is exactly how the
      // `isInsideComment` bug hid, reporting zero tests with no error.
      const gap = {
        assertionsLost: before.asserts - after.asserts,
        testsBroken: after.fail,
      }
      console.log(
        `  GAP TO SELF-HOSTING: ${gap.assertionsLost} assertions lost, ` +
          `${gap.testsBroken} tests broken, ${KNOWN_CONVERSION_FAILURES.size} suites ` +
          `that will not convert. All three must reach 0 for 1.0.`
      )

      expect(gap.assertionsLost).toBeLessThanOrEqual(BASELINE.assertionsLost)
      expect(gap.testsBroken).toBeLessThanOrEqual(BASELINE.testsBroken)
      // Ratchet down when it improves, so a fix is locked in rather than reclaimable.
      const slack =
        BASELINE.assertionsLost - gap.assertionsLost >= RATCHET_SLACK ||
        BASELINE.testsBroken - gap.testsBroken >= RATCHET_SLACK
      expect(
        slack
          ? 'improved past the slack — lower BASELINE in this file to lock it in'
          : 'ok'
      ).toBe('ok')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 900_000)
})
