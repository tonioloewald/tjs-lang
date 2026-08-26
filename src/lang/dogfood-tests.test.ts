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
    'lang/runtime.test.ts',
    'SCOPE: two `function add` declarations in DIFFERENT `it()` blocks are merged as ambiguous polymorphic overloads. Same-named functions in disjoint scopes are not overloads.',
  ],
])

/**
 * ELEVEN down to TWO, on 2026-08-16. The nine that graduated, and what closed them:
 *
 *   - `codegen.test.ts` — the `const!` rewrite was a raw `source.replace(/\bconst!\s+/g, …)`
 *     that edited the contents of strings, so `tjs('const! x = 42')` in test DATA was read
 *     as a declaration. Fixed by splicing positionally over the masked view.
 *   - `Type` / `parser` / `typescript-syntax` / `function-predicate` / `from-ts` /
 *     `bootstrap` — six files carrying "Unexpected token … undiagnosed" for weeks. All five
 *     declaration scanners (`Type`, `FunctionPredicate`, `Generic`, `Union`, `Enum`) were
 *     detecting on RAW source, so a declaration quoted in a test fixture was transformed as
 *     real code — and the single-quoted form injected unescaped quotes, which is exactly
 *     what an "Unexpected token" at an odd column looks like. Fixed by detecting on the
 *     masked view via `matchDeclHeader`.
 *   - `abandoned-syntax.test.ts` / `type-identity.test.ts` — the pair diagnosed as "a
 *     scanner span opening in one function and closing in another". That is precisely what
 *     an unmasked declaration scanner does when a fixture's brace run is unbalanced against
 *     real code, which is why the error location was misattributed and why either function
 *     converted alone.
 *
 * All nine were ONE defect wearing nine faces, and the diagnosis note on the first
 * ("LITERAL BLINDNESS") had named it since the file was written. The six marked
 * "undiagnosed" were the same bug; nobody had connected them, because a ratchet that is
 * never run cannot invite the connection — both dogfood ratchets skip under
 * `SKIP_BENCHMARKS`, which `test:fast` sets and CI inherits.
 *
 * The two that remain are genuinely different: one is the `wasm function` scanner (a
 * separate scanner, same class), the other is scope handling, not literals at all.
 */

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
const BASELINE = {
  /** Fraction of assertions that survive conversion. 1.0 is the 1.0 gate. */
  assertionRate: 0.897,
  /** Fraction of passing tests that still pass after conversion. */
  testRate: 0.911,
}

/**
 * Raised 2026-08-26 by the promote-check, as a side effect of fixing #37.
 *
 * `dropRedundantNew` used to run inside `fromTS`, so converted modules lost the `new` that
 * plain-JS classes require and threw on import. Moving it to the graduation step — where it
 * belongs, since that is what makes a file native TJS — also stopped it corrupting converted
 * TEST suites, and the preserved rates went up: 0.88 -> 0.898 assertions, 0.89 -> 0.912
 * tests. Locked in so the improvement cannot silently rot back.
 */

/**
 * Why the baseline moved DOWN on 2026-08-16, and why that is not a loosening.
 *
 * These rates are measured over `comparable` — the suites NOT in
 * `KNOWN_CONVERSION_FAILURES`. That list went from eleven to two the same day, so nine
 * files entered the denominator at once, and they are the nine hardest: `parser.test.ts`,
 * `codegen.test.ts`, `type-identity.test.ts` and friends, files that exist to hold TJS
 * source as DATA. Conversion loses more of their assertions than of an average suite, so
 * the rate fell from 0.93 to 0.884 on the same day the underlying situation improved:
 *
 *     before   141 suites comparable,  11 that will not convert
 *     after    150 suites comparable,   2 that will not convert
 *
 * **A rate is only comparable over a fixed corpus, and this corpus is defined by exactly
 * the thing the gate is trying to improve.** `practices/testing.md` says a ratchet must
 * measure a rate rather than a count, and that is right for a corpus that grows with new
 * tests — but here graduating a file MOVES it from outside the measurement to inside it,
 * so success and regression push the number the same way. The absolute counts are what
 * distinguish them, which is why they are logged on every run and why this note exists.
 *
 * Do not read the drop from 0.93 as evidence of anything having got worse; the two numbers
 * are not measurements of the same thing. If the corpus changes again, re-baseline again
 * and record the before/after suite counts here, as above.
 *
 * (The old rate could not simply be re-measured for comparison: with the nine listed as
 * failures but converting successfully, they land in `after` and not in `before`, and the
 * harness reports a meaningless 111%. The promote-check normally fires first, so that
 * inconsistency is unreachable in a real run.)
 */

/**
 * Improve by this much and the test asks you to lower `BASELINE`.
 *
 * Without it a ratchet silently loosens: someone fixes 400 assertions, the baseline
 * stays at the old number, and the slack is available for a future regression to eat.
 */
const RATCHET_SLACK = 0.02

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

      // RATES, not counts. An absolute floor is not a ratchet over a growing corpus:
      // adding five test files this session pushed `assertionsLost` from 287 to 336 while
      // the language got strictly better, and a count-based floor would have read that as
      // a regression and been "fixed" by raising the number — which is how a ratchet turns
      // into a rubber stamp. A preservation RATE is stable as the corpus grows and still
      // catches a real slide.
      const rate = {
        assertions: after.asserts / before.asserts,
        tests: after.pass / before.pass,
      }
      console.log(
        `  PRESERVED: ${(rate.assertions * 100).toFixed(1)}% of assertions, ` +
          `${(rate.tests * 100).toFixed(1)}% of passing tests. 100% for 1.0.`
      )
      expect(rate.assertions).toBeGreaterThanOrEqual(BASELINE.assertionRate)
      expect(rate.tests).toBeGreaterThanOrEqual(BASELINE.testRate)
      // Ratchet down when it improves, so a fix is locked in rather than reclaimable.
      const slack =
        rate.assertions - BASELINE.assertionRate >= RATCHET_SLACK ||
        rate.tests - BASELINE.testRate >= RATCHET_SLACK
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
