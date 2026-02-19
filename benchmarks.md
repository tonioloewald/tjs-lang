# TJS Benchmarks

Generated: 2026-02-17
Runtime: Bun 1.3.8
Platform: darwin arm64
Iterations: 100,000 per test

## Summary

| Benchmark                             | Baseline | Safe (default) | Unsafe (!)    |
| ------------------------------------- | -------- | -------------- | ------------- |
| CLI: Bun + TypeScript                 | 157.6ms  | -              | -             |
| CLI: tjsx (execute TJS)               | 159.2ms  | -              | -             |
| CLI: tjs emit                         | 160.6ms  | -              | -             |
| CLI: tjs check                        | 159.8ms  | -              | -             |
| Simple arithmetic (100K iterations)   | 0.5ms    | 1.0ms (1.9x)   | 0.5ms (1.1x)  |
| Object manipulation (100K iterations) | 1.0ms    | 1.7ms (1.7x)   | 1.1ms (1.1x)  |
| 3-function chain (100K iterations)    | 0.6ms    | 2.0ms (3.1x)   | 0.6ms (~1.0x) |

## Key Findings

### CLI Cold Start

- **Bun + TypeScript**: ~158ms (native, baseline)
- **tjsx**: ~159ms (includes TJS transpiler load)
- **Overhead**: 2ms for transpiler initialization

The ~2ms overhead is from loading the acorn parser and TJS transpiler.
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

- Simple arithmetic: Safe 1.9x vs Unsafe 1.1x
- Object manipulation: Safe 1.7x vs Unsafe 1.1x
- 3-function chain: Safe 3.1x vs Unsafe ~1.0x

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
