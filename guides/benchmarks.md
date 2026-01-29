# TJS Benchmarks

Generated: 2026-01-19
Runtime: Bun 1.3.6
Platform: darwin arm64
Iterations: 100,000 per test

## Summary

| Benchmark                         | Baseline | Safe (wrapped) | Unsafe (!)   |
| --------------------------------- | -------- | -------------- | ------------ |
| Simple arithmetic (100K calls)    | 0.5ms    | 13ms (26x)     | 0.7ms (1.3x) |
| 3-function chain (100K calls)     | 0.7ms    | 19ms (28x)     | 0.8ms (1.2x) |
| Loop with helper (100 elem × 10K) | 1.7ms    | 20ms (12x)     | 1.5ms (0.9x) |

## Key Findings

### Runtime Validation Overhead

Safe TJS functions use `wrap()` for monadic type validation:

- **~17-28x overhead** for simple operations
- **~0.02µs per validation** (absolute time is small)
- Overhead becomes negligible when actual work dominates

### Safe vs Unsafe Functions

```javascript
// Safe (default) - validates types at runtime
function add(a: 0, b: 0) -> 0 { return a + b }

// Unsafe - no validation, plain JS performance
function fastAdd(! a: 0, b: 0) -> 0 { return a + b }
```

| Mode       | Overhead | Use Case                        |
| ---------- | -------- | ------------------------------- |
| Safe       | ~17-28x  | API boundaries, untrusted input |
| Unsafe (!) | ~1.2x    | Hot paths, internal functions   |

### ⚠️ Safe Helpers in Loops

**Critical insight**: Wrapping the outer function in `unsafe {}` does NOT help if the inner helper is safe:

```javascript
function process(arr: [0]) -> 0 {
  unsafe {
    let sum = 0
    for (const x of arr) {
      sum += double(x)  // If double() is safe, still pays 12x per call!
    }
    return sum
  }
}
```

**Fix**: Mark the helper as unsafe:

```javascript
function double(! x: 0) -> 0 { return x * 2 }  // No validation overhead
```

### `unsafe {}` Block

The `unsafe {}` block wraps code in try-catch for error handling:

- Converts exceptions to monadic errors
- Does NOT affect validation of called functions
- Minimal overhead (~1.3x)

## Recommendations

1. **Safe by default** - Use for API boundaries and untrusted input
2. **Unsafe (!) for helpers** - Mark hot inner functions that are called in loops
3. **Validate once at the edge** - Check types at entry, use unsafe internally
4. **Don't micro-optimize** - 0.02µs matters only in tight loops

## Future: Type Flow Optimization

Planned compile-time optimization will automatically skip redundant checks:

- Output type matches next input → skip validation
- Array element type known → skip per-iteration checks
- Target: ~1.2x overhead automatically (no manual `!` needed)

## Running Benchmarks

```bash
bun test src/lang/perf.test.ts
```
