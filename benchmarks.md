# TJS Benchmarks

Generated: 2026-01-19
Runtime: Bun 1.3.6
Platform: darwin arm64
Iterations: 100,000 per test

## Summary

| Benchmark                             | Baseline | Safe (default) | Unsafe (!)    |
| ------------------------------------- | -------- | -------------- | ------------- |
| CLI: Bun + TypeScript                 | 14.1ms   | -              | -             |
| CLI: tjsx (execute TJS)               | 143.0ms  | -              | -             |
| CLI: tjs emit                         | 143.2ms  | -              | -             |
| CLI: tjs check                        | 143.1ms  | -              | -             |
| Simple arithmetic (100K iterations)   | 0.5ms    | 0.8ms (1.5x)   | 0.5ms (1.1x)  |
| Object manipulation (100K iterations) | 1.2ms    | 1.3ms (1.1x)   | 1.1ms (~1.0x) |
| 3-function chain (100K iterations)    | 0.6ms    | 1.4ms (2.2x)   | 0.6ms (~1.0x) |

## Key Findings

### CLI Cold Start

- **Bun + TypeScript**: ~14ms (native, baseline)
- **tjsx**: ~143ms (includes TJS transpiler load)
- **Overhead**: 129ms for transpiler initialization

The ~129ms overhead is from loading the acorn parser and TJS transpiler.
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

- Simple arithmetic: Safe 1.5x vs Unsafe 1.1x
- Object manipulation: Safe 1.1x vs Unsafe ~1.0x
- 3-function chain: Safe 2.2x vs Unsafe ~1.0x

## Recommendations

1. **Use safe functions at API boundaries** - The default is correct for most code
2. **Use `(!)` for internal hot paths** - When inputs are already validated
3. **Consider compiled binary for CLI** - `bun build --compile` for ~20ms startup

## Running Benchmarks

```bash
bun run bench
```

Or run the test suite with timing output:

```bash
bun test src/lang/perf.test.ts
```
