# TJS Benchmarks

Generated: 2026-08-19
Runtime: Bun 1.3.14
Platform: darwin arm64
Iterations: 100,000 per test

## Summary

| Benchmark                             | Baseline | Safe (default) | Unsafe (!)    |
| ------------------------------------- | -------- | -------------- | ------------- |
| CLI: Bun + TypeScript                 | 45.5ms   | -              | -             |
| CLI: tjsx (execute TJS)               | 41.3ms   | -              | -             |
| CLI: tjs emit                         | 42.8ms   | -              | -             |
| CLI: tjs check                        | 43.1ms   | -              | -             |
| Simple arithmetic (100K iterations)   | 0.4ms    | 0.6ms (1.5x)   | 0.4ms (~1.0x) |
| Object manipulation (100K iterations) | 0.4ms    | 0.7ms (1.7x)   | 0.5ms (1.1x)  |
| 3-function chain (100K iterations)    | 0.4ms    | 0.8ms (2.0x)   | 0.4ms (0.9x)  |

## Key Findings

### CLI Cold Start

- **Bun + TypeScript**: ~46ms (native, baseline)
- **tjsx**: ~41ms (includes TJS transpiler load)
- **Overhead**: none measurable — `tjsx` starts as fast as plain Bun

Loading the acorn parser and the TJS transpiler costs less than the run-to-run
spread of this measurement, so it does not show up as startup cost.

### Safe vs Unsafe Functions

TJS functions are **safe by default** with runtime type validation.
Use `(!)` to mark functions as unsafe for performance-critical code:

```javascript
// Safe (default) - validates types at runtime
function add(a: 0, b: 0): 0 { return a + b }

// Unsafe - no validation, maximum performance
function fastAdd(! a: 0, b: 0): 0 { return a + b }
```

Performance comparison:

- Simple arithmetic: Safe 1.5x vs Unsafe ~1.0x
- Object manipulation: Safe 1.7x vs Unsafe 1.1x
- 3-function chain: Safe 2.0x vs Unsafe 0.9x

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
