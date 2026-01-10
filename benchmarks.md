# TJS Benchmarks

Generated: 2026-01-10
Runtime: Bun 1.3.5
Platform: darwin arm64
Iterations: 100,000 per test

## Summary

| Benchmark                             | Baseline | TJS          | Unsafe        | Wrapped         |
| ------------------------------------- | -------- | ------------ | ------------- | --------------- |
| CLI: Bun + TypeScript                 | 13.0ms   | -            | -             | -               |
| CLI: tjsx (execute TJS)               | 127.8ms  | -            | -             | -               |
| CLI: tjs emit                         | 128.6ms  | -            | -             | -               |
| CLI: tjs check                        | 132.9ms  | -            | -             | -               |
| Simple arithmetic (100K iterations)   | 0.4ms    | 0.4ms (0.9x) | 0.6ms (1.4x)  | -               |
| Object manipulation (100K iterations) | 0.9ms    | 0.8ms (0.8x) | 0.9ms (~1.0x) | -               |
| wrap() validation (100K iterations)   | 0.4ms    | -            | -             | 21.4ms (49.2x)  |
| 3-function chain (100K iterations)    | 0.4ms    | -            | -             | 46.5ms (104.1x) |

## Key Findings

### CLI Cold Start

- **Bun + TypeScript**: ~13ms (native, baseline)
- **tjsx**: ~128ms (includes TJS transpiler load)
- **Overhead**: 115ms for transpiler initialization

The ~115ms overhead is from loading the acorn parser and TJS transpiler.
A compiled binary (via `bun build --compile`) reduces this to ~20ms.

### Transpiled Code Overhead

TJS transpiled code has **negligible overhead** compared to plain JavaScript:

- Simple arithmetic: 0.9x
- Object manipulation: 0.8x

The transpiler just converts syntax; the output is standard JS.

### `unsafe` Block Overhead

The `unsafe` block adds a try-catch wrapper:

- Simple operations: 1.4x
- Object operations: ~1.0x

The try-catch overhead is amortized when the loop is inside the unsafe block.

### `wrap()` Validation Overhead

Runtime type validation via `wrap()` adds significant overhead:

- Single function: 49.2x
- 3-function chain: 104.1x
- Per-call cost: ~0.2µs

**Recommendation**: Use `wrap()` at API boundaries, not in hot loops.

### Error Short-Circuit Benefit

When an error propagates through wrapped functions, subsequent functions
are **not executed**. This is the monadic "fail fast" behavior:

```javascript
const result = step3(step2(step1(errorValue)))
// If step1 returns an error, step2 and step3 are skipped
```

## Recommendations

1. **Don't wrap hot loops** - Use `wrap()` at API boundaries only
2. **Use `unsafe` for performance-critical internals** - After validation at the boundary
3. **Leverage error short-circuit** - Chain wrapped functions for automatic error propagation
4. **Consider compiled binary for CLI tools** - `bun build --compile` for ~20ms startup

## Running Benchmarks

```bash
bun bin/benchmarks.ts
```

Or run the test suite with timing output:

```bash
SKIP_LLM_TESTS=1 bun test src/lang/perf.test.ts
```
