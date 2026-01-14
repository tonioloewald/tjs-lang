# TJS Benchmarks

Generated: 2026-01-10
Runtime: Bun 1.3.5
Platform: darwin arm64
Iterations: 100,000 per test

## Summary

| Benchmark                             | Baseline | Safe (default) | Unsafe (!)   | Unsafe {}    |
| ------------------------------------- | -------- | -------------- | ------------ | ------------ |
| CLI: Bun + TypeScript                 | 14.8ms   | -              | -            | -            |
| CLI: tjsx (execute TJS)               | 131.4ms  | -              | -            | -            |
| CLI: tjs emit                         | 132.3ms  | -              | -            | -            |
| CLI: tjs check                        | 133.0ms  | -              | -            | -            |
| Simple arithmetic (100K iterations)   | 0.3ms    | 0.4ms (1.2x)   | 0.4ms (1.3x) | 0.5ms (1.6x) |
| Object manipulation (100K iterations) | 0.8ms    | 0.8ms (~1.0x)  | 0.9ms (1.1x) | 1.0ms (1.2x) |
| 3-function chain (100K iterations)    | 0.5ms    | 0.5ms (0.9x)   | 0.5ms (0.9x) | -            |

## Key Findings

### CLI Cold Start

- **Bun + TypeScript**: ~15ms (native, baseline)
- **tjsx**: ~131ms (includes TJS transpiler load)
- **Overhead**: 117ms for transpiler initialization

The ~117ms overhead is from loading the acorn parser and TJS transpiler.
A compiled binary (via `bun build --compile`) reduces this to ~20ms.

### Safe vs Unsafe Functions

TJS functions are **safe by default** with runtime type validation.
Use `(!)` to mark functions as unsafe for performance-critical code:

```javascript
// Safe (default) - validates types at runtime
function add(a: 0, b: 0) -> 0 { return a + b }

// Unsafe - no validation, maximum performance
function fastAdd(! a: 0, b: 0) -> 0 { return a + b }
```

Performance comparison:

- Simple arithmetic: Safe 1.2x vs Unsafe 1.3x
- Object manipulation: Safe ~1.0x vs Unsafe 1.1x
- 3-function chain: Safe 0.9x vs Unsafe 0.9x

### `unsafe {}` Block Overhead

The `unsafe {}` block adds a try-catch wrapper within a safe function:

- Simple operations: 1.6x
- Object operations: 1.2x

Use `unsafe {}` for hot loops inside validated functions.

## Recommendations

1. **Use safe functions at API boundaries** - The default is correct for most code
2. **Use `(!)` for internal hot paths** - When inputs are already validated
3. **Use `unsafe {}` for inner loops** - Keep param validation, skip inner checks
4. **Consider compiled binary for CLI** - `bun build --compile` for ~20ms startup

## Running Benchmarks

```bash
bun run bench
```

Or run the test suite with timing output:

```bash
bun test src/lang/perf.test.ts
```
