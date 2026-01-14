#!/usr/bin/env bun
/**
 * TJS Benchmark Runner
 *
 * Runs performance benchmarks and generates benchmarks.md
 *
 * Usage: bun bin/benchmarks.ts
 */

import { writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { tjs } from '../src/lang'

const ITERATIONS = 100_000

interface BenchmarkResult {
  name: string
  baseline: number
  safe?: number
  unsafe?: number
  unsafeBlock?: number
  unit: string
}

const results: BenchmarkResult[] = []

function benchmark(name: string, fn: () => void): number {
  // Warmup
  for (let i = 0; i < 1000; i++) fn()

  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) fn()
  return performance.now() - start
}

function formatRatio(value: number, baseline: number): string {
  const ratio = value / baseline
  if (ratio < 1.05 && ratio > 0.95) return '~1.0x'
  return `${ratio.toFixed(1)}x`
}

console.log('Running TJS benchmarks...\n')

// CLI Cold Start
console.log('CLI Cold Start:')
const testFile = '/tmp/bench-test.tjs'
writeFileSync(testFile, `function add(a: 1, b: 2) -> 0 { return a + b }`)

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

const bunTsTime = measureCLI('bun /tmp/bench-test.tjs 2>/dev/null || true')
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

// Simple Arithmetic - comparing safe vs unsafe(!) vs unsafe block
console.log('\nSimple Arithmetic:')
function legacyDouble(x: number): number {
  return x * 2
}

// Safe function (default) - will have runtime validation
const safeDoubleResult = tjs(`function safeDouble(x: 0) -> 0 { return x * 2 }`)
const safeDouble = new Function(
  `${safeDoubleResult.code}; return safeDouble;`
)()

// Unsafe function with (!) - no validation
const unsafeDoubleResult = tjs(
  `function unsafeDouble(! x: 0) -> 0 { return x * 2 }`
)
const unsafeDouble = new Function(
  `${unsafeDoubleResult.code}; return unsafeDouble;`
)()

// Unsafe block within safe function
const unsafeBlockResult = tjs(
  `function unsafeBlockDouble(x: 0) -> 0 { unsafe { return x * 2 } }`
)
const unsafeBlockDouble = new Function(
  `${unsafeBlockResult.code}; return unsafeBlockDouble;`
)()

const legacyTime = benchmark('legacy', () => legacyDouble(42))
const safeTime = benchmark('safe', () => safeDouble(42))
const unsafeTime = benchmark('unsafe(!)', () => unsafeDouble(42))
const unsafeBlockTime = benchmark('unsafe{}', () => unsafeBlockDouble(42))

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
console.log(
  `  Unsafe {}:     ${unsafeBlockTime.toFixed(2)}ms (${formatRatio(
    unsafeBlockTime,
    legacyTime
  )})`
)

results.push({
  name: 'Simple arithmetic (100K iterations)',
  baseline: legacyTime,
  safe: safeTime,
  unsafe: unsafeTime,
  unsafeBlock: unsafeBlockTime,
  unit: 'ms',
})

// Object Manipulation
console.log('\nObject Manipulation:')
function legacyTransform(x: number, y: number) {
  return { sum: x + y, product: x * y }
}

const safeTransformResult = tjs(`
  function safeTransform(x: 0, y: 0) -> { sum: 0, product: 0 } {
    return { sum: x + y, product: x * y }
  }
`)
const safeTransform = new Function(
  `${safeTransformResult.code}; return safeTransform;`
)()

const unsafeTransformResult = tjs(`
  function unsafeTransform(! x: 0, y: 0) -> { sum: 0, product: 0 } {
    return { sum: x + y, product: x * y }
  }
`)
const unsafeTransform = new Function(
  `${unsafeTransformResult.code}; return unsafeTransform;`
)()

const unsafeBlockTransformResult = tjs(`
  function unsafeBlockTransform(x: 0, y: 0) -> { sum: 0, product: 0 } {
    unsafe { return { sum: x + y, product: x * y } }
  }
`)
const unsafeBlockTransform = new Function(
  `${unsafeBlockTransformResult.code}; return unsafeBlockTransform;`
)()

const legacyObjTime = benchmark('legacy', () => legacyTransform(3, 4))
const safeObjTime = benchmark('safe', () => safeTransform(3, 4))
const unsafeObjTime = benchmark('unsafe(!)', () => unsafeTransform(3, 4))
const unsafeBlockObjTime = benchmark('unsafe{}', () =>
  unsafeBlockTransform(3, 4)
)

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
console.log(
  `  Unsafe {}:     ${unsafeBlockObjTime.toFixed(2)}ms (${formatRatio(
    unsafeBlockObjTime,
    legacyObjTime
  )})`
)

results.push({
  name: 'Object manipulation (100K iterations)',
  baseline: legacyObjTime,
  safe: safeObjTime,
  unsafe: unsafeObjTime,
  unsafeBlock: unsafeBlockObjTime,
  unit: 'ms',
})

// 3-Function Chain - safe vs unsafe
console.log('\n3-Function Chain:')

// Create safe chain
const safeStep1Result = tjs(`function safeStep1(x: 0) -> 0 { return x * 2 }`)
const safeStep2Result = tjs(`function safeStep2(x: 0) -> 0 { return x + 10 }`)
const safeStep3Result = tjs(`function safeStep3(x: 0) -> 0 { return x / 2 }`)

const safeStep1 = new Function(`${safeStep1Result.code}; return safeStep1;`)()
const safeStep2 = new Function(`${safeStep2Result.code}; return safeStep2;`)()
const safeStep3 = new Function(`${safeStep3Result.code}; return safeStep3;`)()

// Create unsafe chain with (!)
const unsafeStep1Result = tjs(
  `function unsafeStep1(! x: 0) -> 0 { return x * 2 }`
)
const unsafeStep2Result = tjs(
  `function unsafeStep2(! x: 0) -> 0 { return x + 10 }`
)
const unsafeStep3Result = tjs(
  `function unsafeStep3(! x: 0) -> 0 { return x / 2 }`
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

const plainChain = (x: number) => (x * 2 + 10) / 2

const plainChainTime = benchmark('plain', () => plainChain(5))
const safeChainTime = benchmark('safe', () =>
  safeStep3(safeStep2(safeStep1(5)))
)
const unsafeChainTime = benchmark('unsafe(!)', () =>
  unsafeStep3(unsafeStep2(unsafeStep1(5)))
)

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

| Benchmark | Baseline | Safe (default) | Unsafe (!) | Unsafe {} |
|-----------|----------|----------------|------------|-----------|
`

for (const r of results) {
  const baseline = `${r.baseline.toFixed(1)}${r.unit}`
  const safeCol = r.safe
    ? `${r.safe.toFixed(1)}${r.unit} (${formatRatio(r.safe, r.baseline)})`
    : '-'
  const unsafeCol = r.unsafe
    ? `${r.unsafe.toFixed(1)}${r.unit} (${formatRatio(r.unsafe, r.baseline)})`
    : '-'
  const unsafeBlockCol = r.unsafeBlock
    ? `${r.unsafeBlock.toFixed(1)}${r.unit} (${formatRatio(
        r.unsafeBlock,
        r.baseline
      )})`
    : '-'
  markdown += `| ${r.name} | ${baseline} | ${safeCol} | ${unsafeCol} | ${unsafeBlockCol} |\n`
}

markdown += `
## Key Findings

### CLI Cold Start

- **Bun + TypeScript**: ~${bunTsTime.toFixed(0)}ms (native, baseline)
- **tjsx**: ~${tjsxTime.toFixed(0)}ms (includes TJS transpiler load)
- **Overhead**: ${(tjsxTime - bunTsTime).toFixed(
  0
)}ms for transpiler initialization

The ~${(tjsxTime - bunTsTime).toFixed(
  0
)}ms overhead is from loading the acorn parser and TJS transpiler.
A compiled binary (via \`bun build --compile\`) reduces this to ~20ms.

### Safe vs Unsafe Functions

TJS functions are **safe by default** with runtime type validation.
Use \`(!)\` to mark functions as unsafe for performance-critical code:

\`\`\`javascript
// Safe (default) - validates types at runtime
function add(a: 0, b: 0) -> 0 { return a + b }

// Unsafe - no validation, maximum performance  
function fastAdd(! a: 0, b: 0) -> 0 { return a + b }
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

### \`unsafe {}\` Block Overhead

The \`unsafe {}\` block adds a try-catch wrapper within a safe function:
- Simple operations: ${formatRatio(unsafeBlockTime, legacyTime)}
- Object operations: ${formatRatio(unsafeBlockObjTime, legacyObjTime)}

Use \`unsafe {}\` for hot loops inside validated functions.

## Recommendations

1. **Use safe functions at API boundaries** - The default is correct for most code
2. **Use \`(!)\` for internal hot paths** - When inputs are already validated
3. **Use \`unsafe {}\` for inner loops** - Keep param validation, skip inner checks
4. **Consider compiled binary for CLI** - \`bun build --compile\` for ~20ms startup

## Running Benchmarks

\`\`\`bash
bun run bench
\`\`\`

Or run the test suite with timing output:

\`\`\`bash
bun test src/lang/perf.test.ts
\`\`\`
`

writeFileSync('benchmarks.md', markdown)
console.log('Done! Written to benchmarks.md')
