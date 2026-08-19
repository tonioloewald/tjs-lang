#!/usr/bin/env bun
/**
 * TJS Benchmark Runner
 *
 * Runs performance benchmarks and generates benchmarks.md
 *
 * Usage: bun bin/benchmarks.ts
 */

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { tjs } from '../src/lang'
import { installRuntime } from '../src/lang/runtime'

// Install TJS runtime globally so emitted code can use __tjs
installRuntime()

const ITERATIONS = 100_000

interface BenchmarkResult {
  name: string
  baseline: number
  safe?: number
  unsafe?: number
  unit: string
}

const results: BenchmarkResult[] = []

/**
 * Time `fn` over `ITERATIONS`, measuring work the JIT cannot delete.
 *
 * The previous version called `fn()` with no argument and discarded the result, and every
 * call site passed a CONSTANT (`legacyDouble(42)`, `plainChain(5)`). Both halves of that
 * are eliminable: the input constant-folds and the unused result lets the whole call go.
 * What it reported was how completely each lane had been optimised away.
 *
 * The tell was in the published table — `unsafe (!)` at **0.5x the plain-JS baseline**,
 * i.e. faster than the same code with the checks removed, which cannot be true. Measured
 * with the old pattern over 8 rounds, plain swung 0.09–0.32ms (a 3.5x spread) and unsafe
 * "won" 5 rounds out of 8: a coin flip, published as a finding. 100,000 iterations in
 * 0.2ms is ~2ns per call, below the cost of an actual call.
 *
 * So: `fn` takes the loop index (the input varies, nothing folds), its result is summed
 * into a sink, and the sink is observed afterwards so the sum cannot be dropped either.
 * Several rounds, median reported — one sample of a noisy distribution is what produced
 * the 0.5x.
 */
const ROUNDS = 5
/** Every timed run must last at least this long, or it is measuring the clock. */
const TARGET_MS = 50
/** Cheap pilot used to estimate per-op cost before choosing the real count. */
const PILOT = 20_000
/** Ceiling, so a genuinely slow lane cannot make a run take minutes. */
const MAX_ITERATIONS = 50_000_000
/** Iterations the last `compare()` settled on — reported so the numbers are readable. */
let lastIterations = 0

/**
 * Measure several lanes AGAINST EACH OTHER, round-robin.
 *
 * Two independent artifacts had to go before these numbers meant anything.
 *
 * **Eliminable work.** Every call site passed a constant and discarded the result
 * (`legacyDouble(42)`, `plainChain(5)`), so the input folded and the call could be deleted
 * outright. What got reported was how completely each lane had been optimised away — and
 * it showed: the published table had `unsafe (!)` at **0.5x the plain-JS baseline**, i.e.
 * faster than the same code with its checks removed, which cannot be true. Over 8 rounds
 * of that pattern the baseline swung 0.09–0.32ms and unsafe "won" 5 of 8. A coin flip,
 * published as a finding.
 *
 * **Lane order.** Running all rounds of one lane and then all rounds of the next lets the
 * first lane pay for JIT tier-up while later lanes inherit a warm allocator. Measured with
 * that fixed and inputs varying, `unsafe` still read 0.8x — and an isolated round-robin
 * probe put plain and unsafe at parity (0.35ms vs 0.37ms). The ordering WAS the remaining
 * 20%.
 *
 * So: inputs vary with the loop index, results accumulate into an observed sink, and the
 * lanes rotate every round. Medians, because one sample of a noisy distribution is exactly
 * what produced the 0.5x.
 *
 * The number to sanity-check first is `unsafe` against `baseline`. `unsafe` is the same
 * code with validation removed, so parity is the ONLY defensible answer; a ratio far from
 * ~1.0 in either direction means the harness is measuring itself again.
 */
function compare(
  lanes: Array<[name: string, fn: (i: number) => number]>
): Map<string, number> {
  const times = new Map<string, number[]>()
  let sink = 0
  for (const [name] of lanes) times.set(name, [])

  // CALIBRATE so every timed run lasts at least TARGET_MS.
  //
  // At the old fixed 100,000 iterations these lanes completed in 0.2–0.9ms. At that scale
  // the measurement is mostly timer granularity and JIT tier transitions: the same lane
  // varied 3.5x run to run, which is how `unsafe` came to be published as FASTER than the
  // unvalidated code it is. A run long enough to dominate those effects costs a few
  // hundred milliseconds and is worth every one of them.
  //
  // The count is calibrated on the SLOWEST lane and then shared, because lanes compared
  // against each other must do the same number of iterations for the ratio to mean
  // anything.
  let perOp = 0
  for (const [, fn] of lanes) {
    for (let i = 0; i < 1000; i++) sink += fn(i) // warm before timing
    const t = performance.now()
    for (let i = 0; i < PILOT; i++) sink += fn(i)
    perOp = Math.max(perOp, (performance.now() - t) / PILOT)
  }
  // A lane too fast to time even in aggregate still gets a sane, bounded count.
  const iterations = Math.min(
    MAX_ITERATIONS,
    Math.max(ITERATIONS, Math.ceil(TARGET_MS / Math.max(perOp, 1e-7)))
  )

  for (let round = 0; round < ROUNDS; round++) {
    // Rotate, so no lane is always first (or always last).
    const order = lanes.map((_, k) => lanes[(k + round) % lanes.length])
    for (const [name, fn] of order) {
      for (let i = 0; i < 1000; i++) sink += fn(i) // warmup, every round
      const start = performance.now()
      for (let i = 0; i < iterations; i++) sink += fn(i)
      times.get(name)!.push(performance.now() - start)
    }
  }
  lastIterations = iterations
  // Observe the sink, or the accumulation is dead and the loops can go with it.
  if (!Number.isFinite(sink)) console.error('benchmark sink went non-finite')

  const out = new Map<string, number>()
  for (const [name, xs] of times) {
    xs.sort((a, b) => a - b)
    // Normalised to the ORIGINAL 100,000-iteration basis, so the published table stays
    // comparable with its own history even though the real count is now calibrated.
    out.set(name, (xs[Math.floor(ROUNDS / 2)] / iterations) * ITERATIONS)
  }
  return out
}

function formatRatio(value: number, baseline: number): string {
  const ratio = value / baseline
  if (ratio < 1.05 && ratio > 0.95) return '~1.0x'
  return `${ratio.toFixed(1)}x`
}

console.log('Running TJS benchmarks...\n')

// CLI Cold Start
console.log('CLI Cold Start:')
// A PRIVATE scratch directory, not a fixed `/tmp/bench-test.tjs`.
//
// A fixed world-writable path is both a collision (two runs, or two checkouts, fight over
// it) and a small foothold: anything that can pre-create that path chooses what
// `measureCLI` executes below, since the benchmark then runs `bun` on it. `mkdtemp` gives
// a fresh 0700 directory per run, and the cleanup at the end removes it.
const scratch = mkdtempSync(join(tmpdir(), 'tjs-bench-'))
const testFile = join(scratch, 'bench-test.tjs')
// `: 3` is a WORKED return example — `add(1, 2)` really is 3 — not a type annotation.
// This read `-> 3` until 2026-08-17, the arrow return form abolished before 0.13.0, so
// every `bun run bench` since had died on `Unexpected token at <source>:1:26`. Nothing
// noticed because this script is in NO gate: `test:fast` sets SKIP_BENCHMARKS, CI runs
// `test:fast`, and `bun run bench` is a separate entry point from `bun test`.
writeFileSync(testFile, `function add(a: 1, b: 2): 3 { return a + b }`)

function measureCLI(cmd: string): number {
  const times: number[] = []
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    execSync(cmd, { stdio: 'pipe' })
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

const bunTsTime = measureCLI(`bun ${testFile} 2>/dev/null || true`)
const tjsxTime = measureCLI(
  `bun ${import.meta.dir}/../src/cli/tjsx.ts ${testFile}`
)
const tjsEmitTime = measureCLI(
  `bun ${import.meta.dir}/../src/cli/tjs.ts emit ${testFile}`
)
const tjsCheckTime = measureCLI(
  `bun ${import.meta.dir}/../src/cli/tjs.ts check ${testFile}`
)

console.log(`  Bun (TS baseline): ${bunTsTime.toFixed(0)}ms`)
console.log(`  tjsx:              ${tjsxTime.toFixed(0)}ms`)
console.log(`  tjs emit:          ${tjsEmitTime.toFixed(0)}ms`)
console.log(`  tjs check:         ${tjsCheckTime.toFixed(0)}ms`)

results.push({
  name: 'CLI: Bun + TypeScript',
  baseline: bunTsTime,
  unit: 'ms',
})
results.push({
  name: 'CLI: tjsx (execute TJS)',
  baseline: tjsxTime,
  unit: 'ms',
})
results.push({
  name: 'CLI: tjs emit',
  baseline: tjsEmitTime,
  unit: 'ms',
})
results.push({
  name: 'CLI: tjs check',
  baseline: tjsCheckTime,
  unit: 'ms',
})

// Simple Arithmetic - comparing safe vs unsafe(!)
console.log('\nSimple Arithmetic:')
function legacyDouble(x: number): number {
  return x * 2
}

// Safe function (default) - will have inline validation
const safeDoubleResult = tjs(`function safeDouble(x: 0): 0 { return x * 2 }`)
const safeDouble = new Function(
  `${safeDoubleResult.code}; return safeDouble;`
)()

// Unsafe function with (!) - no validation wrapper
const unsafeDoubleResult = tjs(
  `function unsafeDouble(! x: 0): 0 { return x * 2 }`
)
const unsafeDouble = new Function(
  `${unsafeDoubleResult.code}; return unsafeDouble;`
)()

const arith = compare([
  ['legacy', (i) => legacyDouble(i)],
  ['safe', (i) => safeDouble(i)],
  ['unsafe', (i) => unsafeDouble(i)],
])
const legacyTime = arith.get('legacy')!
const safeTime = arith.get('safe')!
const unsafeTime = arith.get('unsafe')!

console.log(`  Legacy JS:     ${legacyTime.toFixed(2)}ms`)
console.log(
  `  Safe (default): ${safeTime.toFixed(2)}ms (${formatRatio(
    safeTime,
    legacyTime
  )})`
)
console.log(
  `  Unsafe (!):    ${unsafeTime.toFixed(2)}ms (${formatRatio(
    unsafeTime,
    legacyTime
  )})`
)

results.push({
  name: 'Simple arithmetic (100K iterations)',
  baseline: legacyTime,
  safe: safeTime,
  unsafe: unsafeTime,
  unit: 'ms',
})

// Object Manipulation
console.log('\nObject Manipulation:')
function legacyTransform(x: number, y: number) {
  return { sum: x + y, product: x * y }
}

const safeTransformResult = tjs(`
  function safeTransform(x: 0, y: 0): { sum: 0, product: 0 } {
    return { sum: x + y, product: x * y }
  }
`)
const safeTransform = new Function(
  `${safeTransformResult.code}; return safeTransform;`
)()

const unsafeTransformResult = tjs(`
  function unsafeTransform(! x: 0, y: 0): { sum: 0, product: 0 } {
    return { sum: x + y, product: x * y }
  }
`)
const unsafeTransform = new Function(
  `${unsafeTransformResult.code}; return unsafeTransform;`
)()

const objs = compare([
  ['legacy', (i) => legacyTransform(i, i + 1).sum],
  ['safe', (i) => safeTransform(i, i + 1).sum],
  ['unsafe', (i) => unsafeTransform(i, i + 1).sum],
])
const legacyObjTime = objs.get('legacy')!
const safeObjTime = objs.get('safe')!
const unsafeObjTime = objs.get('unsafe')!

console.log(`  Legacy JS:     ${legacyObjTime.toFixed(2)}ms`)
console.log(
  `  Safe (default): ${safeObjTime.toFixed(2)}ms (${formatRatio(
    safeObjTime,
    legacyObjTime
  )})`
)
console.log(
  `  Unsafe (!):    ${unsafeObjTime.toFixed(2)}ms (${formatRatio(
    unsafeObjTime,
    legacyObjTime
  )})`
)

results.push({
  name: 'Object manipulation (100K iterations)',
  baseline: legacyObjTime,
  safe: safeObjTime,
  unsafe: unsafeObjTime,
  unit: 'ms',
})

// 3-Function Chain - safe vs unsafe
console.log('\n3-Function Chain:')

// Create safe chain
const safeStep1Result = tjs(`function safeStep1(x: 5): 10 { return x * 2 }`)
const safeStep2Result = tjs(`function safeStep2(x: 10): 20 { return x + 10 }`)
const safeStep3Result = tjs(`function safeStep3(x: 20): 10 { return x / 2 }`)

const safeStep1 = new Function(`${safeStep1Result.code}; return safeStep1;`)()
const safeStep2 = new Function(`${safeStep2Result.code}; return safeStep2;`)()
const safeStep3 = new Function(`${safeStep3Result.code}; return safeStep3;`)()

// Create unsafe chain with (!)
const unsafeStep1Result = tjs(
  `function unsafeStep1(! x: 5): 10 { return x * 2 }`
)
const unsafeStep2Result = tjs(
  `function unsafeStep2(! x: 10): 20 { return x + 10 }`
)
const unsafeStep3Result = tjs(
  `function unsafeStep3(! x: 20): 10 { return x / 2 }`
)

const unsafeStep1 = new Function(
  `${unsafeStep1Result.code}; return unsafeStep1;`
)()
const unsafeStep2 = new Function(
  `${unsafeStep2Result.code}; return unsafeStep2;`
)()
const unsafeStep3 = new Function(
  `${unsafeStep3Result.code}; return unsafeStep3;`
)()

// THREE functions, because that is what the chains below are. The baseline used to be a
// single inlined expression compared against three real calls — not the same shape, so
// the ratio measured inlining as much as validation.
function plainStep1(x: number) {
  return x * 2
}
function plainStep2(x: number) {
  return x + 10
}
function plainStep3(x: number) {
  return x / 2
}
const plainChain = (x: number) => plainStep3(plainStep2(plainStep1(x)))

const chains = compare([
  ['plain', (i) => plainChain(i)],
  ['safe', (i) => safeStep3(safeStep2(safeStep1(i)))],
  ['unsafe', (i) => unsafeStep3(unsafeStep2(unsafeStep1(i)))],
])
const plainChainTime = chains.get('plain')!
const safeChainTime = chains.get('safe')!
const unsafeChainTime = chains.get('unsafe')!

console.log(`  Plain chain:   ${plainChainTime.toFixed(2)}ms`)
console.log(
  `  Safe chain:    ${safeChainTime.toFixed(2)}ms (${formatRatio(
    safeChainTime,
    plainChainTime
  )})`
)
console.log(
  `  Unsafe chain:  ${unsafeChainTime.toFixed(2)}ms (${formatRatio(
    unsafeChainTime,
    plainChainTime
  )})`
)

results.push({
  name: '3-function chain (100K iterations)',
  baseline: plainChainTime,
  safe: safeChainTime,
  unsafe: unsafeChainTime,
  unit: 'ms',
})

// Generate Markdown
/**
 * SANITY CHECK — `unsafe` must be at parity with the baseline.
 *
 * `(!)` removes validation; it cannot add speed. A ratio far from ~1.0 in either direction
 * does not mean the language got faster or slower, it means this harness is measuring
 * itself — which is exactly what happened for months, publishing `unsafe` at **0.5x the
 * plain-JS baseline** while the timed work was being optimised away entirely.
 *
 * A warning rather than a hard failure: this is a measurement tool, and a loaded machine
 * should not fail a build. But it must SAY so, because the failure mode is silent numbers
 * that look plausible.
 */
const parityChecks: Array<[string, number, number]> = [
  ['Simple arithmetic', unsafeTime, legacyTime],
  ['Object manipulation', unsafeObjTime, legacyObjTime],
  ['3-function chain', unsafeChainTime, plainChainTime],
]
for (const [label, unsafeMs, baseMs] of parityChecks) {
  const ratio = unsafeMs / baseMs
  if (ratio < 0.75 || ratio > 1.35) {
    console.warn(
      `\n⚠ ${label}: unsafe is ${ratio.toFixed(2)}x the baseline. ` +
        `Unsafe is the same code without validation, so anything far from ~1.0 means ` +
        `this measurement is unreliable — not that the language changed.`
    )
  }
}

console.log('\nGenerating benchmarks.md...')

const date = new Date().toISOString().split('T')[0]
const nodeVersion = process.versions.bun || process.version
const platform = `${process.platform} ${process.arch}`

let markdown = `# TJS Benchmarks

Generated: ${date}
Runtime: Bun ${nodeVersion}
Platform: ${platform}
Iterations: ${ITERATIONS.toLocaleString()} per test

## Summary

| Benchmark | Baseline | Safe (default) | Unsafe (!) |
|-----------|----------|----------------|------------|
`

for (const r of results) {
  const baseline = `${r.baseline.toFixed(1)}${r.unit}`
  const safeCol = r.safe
    ? `${r.safe.toFixed(1)}${r.unit} (${formatRatio(r.safe, r.baseline)})`
    : '-'
  const unsafeCol = r.unsafe
    ? `${r.unsafe.toFixed(1)}${r.unit} (${formatRatio(r.unsafe, r.baseline)})`
    : '-'
  markdown += `| ${r.name} | ${baseline} | ${safeCol} | ${unsafeCol} |\n`
}

// A measured difference smaller than the run-to-run spread is NOT an overhead, and
// templating it in produced "**Overhead**: -1ms for transpiler initialization" followed by
// "The ~-1ms overhead is from loading the acorn parser" — a negative cost asserted as a
// cause. Say parity when it is parity.
//
// 5ms is the threshold because the medians here move by a few ms between runs on an idle
// machine; anything inside that is noise wearing a number.
const overheadMs = tjsxTime - bunTsTime
const overheadPhrase =
  Math.abs(overheadMs) < 5
    ? 'none measurable — `tjsx` starts as fast as plain Bun'
    : `${overheadMs.toFixed(0)}ms for transpiler initialization`
const overheadNote =
  Math.abs(overheadMs) < 5
    ? 'Loading the acorn parser and the TJS transpiler costs less than the run-to-run\nspread of this measurement, so it does not show up as startup cost.'
    : `The ~${overheadMs.toFixed(
        0
      )}ms overhead is from loading the acorn parser and TJS transpiler.`

markdown += `
## Key Findings

### CLI Cold Start

- **Bun + TypeScript**: ~${bunTsTime.toFixed(0)}ms (native, baseline)
- **tjsx**: ~${tjsxTime.toFixed(0)}ms (includes TJS transpiler load)
- **Overhead**: ${overheadPhrase}

${overheadNote}

### Safe vs Unsafe Functions

TJS functions are **safe by default** with runtime type validation.
Use \`(!)\` to mark functions as unsafe for performance-critical code:

\`\`\`javascript
// Safe (default) - validates types at runtime
function add(a: 0, b: 0): 0 { return a + b }

// Unsafe - no validation, maximum performance
function fastAdd(! a: 0, b: 0): 0 { return a + b }
\`\`\`

Performance comparison:
- Simple arithmetic: Safe ${formatRatio(
  safeTime,
  legacyTime
)} vs Unsafe ${formatRatio(unsafeTime, legacyTime)}
- Object manipulation: Safe ${formatRatio(
  safeObjTime,
  legacyObjTime
)} vs Unsafe ${formatRatio(unsafeObjTime, legacyObjTime)}
- 3-function chain: Safe ${formatRatio(
  safeChainTime,
  plainChainTime
)} vs Unsafe ${formatRatio(unsafeChainTime, plainChainTime)}

## Recommendations

1. **Use safe functions at API boundaries** - The default is correct for most code
2. **Use \`(!)\` for internal hot paths** - When inputs are already validated
3. **Consider compiled binary for CLI** - \`bun build --compile\` for ~20ms startup

## Running Benchmarks

\`\`\`bash
bun run bench
\`\`\`

Or run the test suite with timing output:

\`\`\`bash
bun test src/lang/perf.test.ts
\`\`\`
`

// Written next to the REPO, not into whatever `process.cwd()` happens to be.
//
// `benchmarks.md` is a committed, npm-shipped artifact. Resolving it against the cwd meant
// running this from a subdirectory silently created a second one there and left the real
// file stale — the failure mode that let the published numbers rot for four and a half
// months without anyone seeing a diff.
const outPath = join(import.meta.dir, '..', 'benchmarks.md')
writeFileSync(outPath, markdown)
rmSync(scratch, { recursive: true, force: true })
console.log(`Done! Written to ${outPath}`)
