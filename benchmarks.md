# TJS Benchmarks

Generated: 2026-03-31
Runtime: Bun 1.3.11
Platform: darwin arm64
Iterations: 100,000 per test

## Summary

| Benchmark                             | Baseline | Safe (default) | Unsafe (!)    |
| ------------------------------------- | -------- | -------------- | ------------- |
| CLI: Bun + TypeScript                 | 148.8ms  | -              | -             |
| CLI: tjsx (execute TJS)               | 153.6ms  | -              | -             |
| CLI: tjs emit                         | 151.8ms  | -              | -             |
| CLI: tjs check                        | 152.0ms  | -              | -             |
| Simple arithmetic (100K iterations)   | 0.6ms    | 1.1ms (1.9x)   | 0.5ms (0.8x)  |
| Object manipulation (100K iterations) | 1.1ms    | 1.5ms (1.4x)   | 1.1ms (~1.0x) |
| 3-function chain (100K iterations)    | 0.6ms    | 2.0ms (3.2x)   | 0.5ms (0.8x)  |

## Key Findings

### CLI Cold Start

- **Bun + TypeScript**: ~149ms (native, baseline)
- **tjsx**: ~154ms (includes TJS transpiler load)
- **Overhead**: 5ms for transpiler initialization

The ~5ms overhead is from loading the acorn parser and TJS transpiler.
A compiled binary (via `bun build --compile`) reduces this to ~20ms.

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

- Simple arithmetic: Safe 1.9x vs Unsafe 0.8x
- Object manipulation: Safe 1.4x vs Unsafe ~1.0x
- 3-function chain: Safe 3.2x vs Unsafe 0.8x

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
