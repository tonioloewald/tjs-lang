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
import * as acorn from 'acorn'

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
/*
 * Rebaselined 2026-09-02, DOWNWARD, and that needs justifying because lowering a ratchet is
 * normally how a regression gets hidden.
 *
 * The corpus grew: fixing the scope-blind polymorphic merge made `lang/runtime.test.ts`
 * convertible, so it left KNOWN_CONVERSION_FAILURES and joined the measured set — 183 suites
 * to 184. It preserves fewer than 89.4% of its own assertions, so it pulled the RATIO down
 * while the absolute count of preserved assertions went UP. Nothing got worse; the
 * denominator got bigger.
 *
 * Worth recording as a property of the metric, not just this incident: a RATIO floor can fall
 * when you fix a conversion bug, because the reward for converting a hard file is that its
 * unconverted assertions start counting against you. Absolute numbers are logged beside the
 * rate for exactly this reason — 7866 of 9058 preserved across 184 suites today. Check those
 * before believing a rate movement means what it looks like.
 */
const BASELINE = {
  /** Fraction of assertions that survive conversion. 1.0 is the 1.0 gate. */
  assertionRate: 0.966,
  /** Fraction of passing tests that still pass after conversion. */
  testRate: 0.977,
}

/*
 * Ratcheted on 2026-09-05, from 0.881/0.904, after the emitted preamble stopped declaring
 * its helpers at module scope (#39; `src/lang/rt-namespace.ts`).
 *
 * The size of this movement is the point. Ten suites had been failing to LOAD — a
 * duplicate-declaration `SyntaxError` before any of their code ran — so their assertions
 * were counted as lost in full while the gate reported only six "broken tests", because
 * tests that never run are not tests that fail. 313 assertions lost, down from 1076; 30
 * broken tests, down from 38.
 *
 * The lesson generalises past this fix: a failure that happens at LOAD time is
 * under-reported by any metric denominated in tests, and it is under-reported by roughly
 * the size of the file. Read the assertion count, not the test count, when deciding where
 * the remaining gap actually is.
 */

/*
 * Ratcheted down on 2026-09-04, from 0.868/0.885, after ONE fix took the gate from 108
 * broken tests to 59.
 *
 * `extractAndRunTests` scanned RAW source, so a `test '…' { … }` quoted as DATA was taken
 * for a real test block: executed at transpile time and deleted from the output. Three of
 * the four worst-affected suites here are language tests whose fixtures are TJS source held
 * in strings, so the gate had been reporting their deleted fixtures as "conversion loses
 * assertions" — 52 of 99 failures were this one defect, and nothing about conversion.
 *
 * The promote-check did NOT fire (the gain is 1.1 and 1.6 points, under the 2-point slack),
 * and the baseline is being lowered anyway. That is deliberate: slack you leave on the table
 * is slack a regression can occupy without turning the gate red, which is the failure mode
 * RATCHET_SLACK exists to prevent — it is a trigger for "you MUST lower this", not a licence
 * to skip lowering it when the gain is smaller.
 *
 * Read the caution above before believing the next movement: a rate can fall when you fix a
 * conversion bug, because a newly-convertible file brings its unconverted assertions with it.
 *
 * Ratcheted again the same day, 0.876/0.898 -> 0.881/0.904, after `relocate()` stopped
 * rewriting import paths inside template literals. 59 broken tests -> 38. That one was the
 * HARNESS failing and being scored as the language failing, which makes it the second
 * instance of the trap recorded above for `os.tmpdir()` — and it arrived through the same
 * literal-blindness class as the fix before it. Two of the three biggest movements in this
 * gate's history have been defects in the gate, not in conversion. Read a bad number here as
 * a question, not a verdict.
 */

/**
 * NOT raised on 2026-08-28, and the reason is worth keeping.
 *
 * Mid-way through the `number` -> `number` conversion change this gate read 94.2% / 95.5%,
 * against 89.5% / 91.0% before — apparently a five-point jump from one change, and it was
 * briefly written up as one. It was an artefact. The corpus was in flux: several test files
 * had been reverted or were carrying half-applied edits, so the suite being converted was
 * smaller and easier. With the corpus repaired the number is 89.5% / 91.0% again — exactly
 * where it started.
 *
 * The change is neutral for self-hosting. It was argued on legibility and that is the only
 * ground it stands on.
 *
 * The general trap: this ratchet measures a RATIO over a corpus, so anything that changes
 * the corpus moves it for reasons that have nothing to do with the converter. Never read it
 * while the suite is mid-edit — which is precisely when a large change makes you want to.
 */

/**
 * Why the baseline moved DOWN again on 2026-08-26 (0.898 -> 0.895, 0.912 -> 0.910), hours
 * after the entry below raised it — and why this is the 2026-08-16 case again, not a
 * loosening.
 *
 * **The language did not regress. Measured directly**, because a rate that moves for two
 * reasons at once is a rate nobody can read: with the #33 source fix applied and the test
 * file left alone, the rates were 0.898 / 0.912 — unchanged. The drop is entirely the eight
 * regression tests #33 added to `as-compared.test.ts`, and that file preserves **zero**
 * assertions, so anything added to it is lost by construction.
 *
 * The cause is worth recording, because it is not literal blindness and it is not
 * as-compared-specific — it is a general defect this file happened to expose (#39):
 *
 *     import { Eq, Is, IsNot, toBool } from './runtime'   // the file under test
 *     ...
 *     function Eq(a,b){…}   // the emitted preamble, top level, SAME NAMES
 *     -> SyntaxError: "Eq" has already been declared -> the module never loads
 *
 * Every other inline helper is `__`-prefixed (`__ub`, `__proj`, `__goIs`, `__oneOf`); these
 * five are the exception, so any file importing or declaring one of those names converts to
 * text that cannot load. Fixing it is a rename across five deliberate comparator copies plus
 * their generated call sites — not a patch-release change, and pinned by three guardrail
 * tests, so it is filed rather than done here.
 *
 * The file is deliberately NOT moved to `KNOWN_CONVERSION_FAILURES`: it converts fine. It is
 * the emitted OUTPUT that will not load, which is a different fault and would be mis-filed
 * there — and a ratchet whose diagnoses are approximate is the graveyard that list warns
 * about.
 */

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

  // PARSED, not pattern-matched, and that distinction was worth ~10 failures.
  //
  // This was a regex over raw text, so it rewrote any `from './x'` it could see — including
  // the ones inside TEMPLATE LITERALS that a test writes out as a fixture module at runtime.
  // `multi-module.test.ts` builds `import { numA } from './libA.mjs'` as a string, writes it
  // to its own temp directory beside a real `libA.mjs`, and spawns node on it. Relocation
  // rewrote that string to an absolute path under `src/lang/`, where no such file exists, so
  // the fixture failed to resolve and the suite was scored as CONVERSION losing tests.
  //
  // The harness failing and being counted as the language failing is the exact trap this
  // file already records for the `os.tmpdir()` incident. It recurred in a second form,
  // through the defect class this repo names as its dominant one — a scanner reading a
  // string that merely LOOKS like the syntax it wants.
  //
  // Masking cannot fix it, because an import specifier IS a string literal: blank the
  // literals and you blank the very text to rewrite. The distinction is syntactic, not
  // lexical, so ask the parser which string literals are import sources.
  const edits: Array<[number, number, string]> = []
  try {
    const ast = acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    }) as any
    const sources: any[] = []
    const visit = (n: any): void => {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) return n.forEach(visit)
      if (
        (n.type === 'ImportDeclaration' ||
          n.type === 'ExportNamedDeclaration' ||
          n.type === 'ExportAllDeclaration' ||
          n.type === 'ImportExpression') &&
        n.source?.type === 'Literal' &&
        typeof n.source.value === 'string'
      ) {
        sources.push(n.source)
      }
      for (const k of Object.keys(n)) if (k !== 'type') visit(n[k])
    }
    visit(ast)
    for (const lit of sources) {
      if (!String(lit.value).startsWith('.')) continue
      edits.push([lit.start, lit.end, JSON.stringify(resolve(dir, lit.value))])
    }
  } catch {
    // Unparseable converted output is the OTHER ratchet's finding, not this one's. Leaving
    // the code untouched keeps the two measurements from contaminating each other.
    return code
  }

  let out = code
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, start) + text + out.slice(end)
  }
  // `import.meta` is a MetaProperty, not a string, so a fixture that MENTIONS it in a
  // template literal is still rewritten here. Left as-is deliberately: no suite in the
  // corpus does that today, and inventing a guard for it would be untested code.
  return out
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

      // THE BASELINE MUST BE GREEN, and it must say what failed when it is not.
      //
      // For an unknown length of time this printed `1 fail` on the ORIGINAL corpus and
      // stopped there — a number with no name attached, in the middle of a wall of
      // conversion statistics, so nobody read it as a defect. It was one: `isOurServer`
      // matched `cli/playground` inside `src/cli/playground.test.ts`, and this harness
      // spawns `bun test <every suite path>`, which is the only invocation that builds
      // that argv. The suite passes standalone and in `test:fast`; only here did it fail,
      // and only here was the evidence discarded.
      //
      // Two things were wrong and both are fixed here: the failure was not NAMED, and it
      // was not FAILED ON. A gate that measures conversion damage against a baseline it
      // does not require to be clean is also mis-measuring — `testsBroken` below counts
      // every pre-existing failure as damage conversion did.
      if (before.fail > 0) {
        const named = before.out
          .split('\n')
          .filter((l) => l.startsWith('(fail)'))
          .join('\n    ')
        console.log(
          `\n  BASELINE IS NOT GREEN — before conversion:\n    ${named}`
        )
      }
      expect({ baselineFailures: before.fail }).toEqual({ baselineFailures: 0 })

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
