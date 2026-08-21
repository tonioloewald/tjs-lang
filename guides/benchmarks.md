# TJS Performance Guide

**Numbers live in [`benchmarks.md`](../benchmarks.md), which is generated. This page carries
the guidance that outlives any particular measurement.**

## Why this page has no table

It used to have one, hand-maintained, and it drifted an order of magnitude:

| Claim                           | This page (2026-01-19) | Measured (2026-08-18) |
| ------------------------------- | ---------------------- | --------------------- |
| Safe function vs baseline       | 17–28×                 | 1.6–2.0×              |
| Safe helper in a loop, per call | 12×                    | 1.9× (vs unsafe)      |

The old figures were real when written — validation went through a `wrap()` call that the
emitter no longer produces. Nothing was wrong except that a second, hand-copied set of
numbers existed at all: it could not be regenerated, so it could not be noticed going stale,
and for seven months this guide told readers that safe TJS cost them 17–28× when it cost
under 2×. That is a discouraging lie about the language's central feature.

`benchmarks.md` is written by `bun run bench` and carries its own date, runtime and platform.
It is the only place timings belong. When you want a number, run the benchmark.

## Safe by default, unsafe where it is measured to matter

```javascript
// Safe (default) — validates arguments and return at run time
function add(a: 0, b: 0): 0 { return a + b }

// Unsafe — no validation, plain-JS cost
function fastAdd(! a: 0, b: 0): 0 { return a + b }
```

Validation cost is per CALL and proportional to the shape being checked, so it is invisible
whenever the function does real work and visible when the function is trivial and hot.

## Validation cost lives at the callee

This is the one thing worth internalising, and it is not obvious: marking the OUTER function
unsafe does nothing for the helper it calls in a loop.

```javascript
function process(! arr: [0]): 0 {
  let sum = 0
  for (const x of arr) {
    sum += double(x)   // if `double` is safe, this loop pays for it, every iteration
  }
  return sum
}
```

The fix is to mark the callee:

```javascript
function double(! x: 0): 0 { return x * 2 }
```

A 100-element loop run 10,000 times — one million helper calls (2026-08-19, Bun 1.3.14,
darwin arm64):

| Helper                | Best of 7 | vs plain JS |
| --------------------- | --------- | ----------- |
| plain JS              | 0.62ms    | 1.0×        |
| TJS, `!` unsafe       | 1.48ms    | 2.4×        |
| TJS, safe (validated) | 2.75ms    | 4.5×        |

So the safe helper is the more expensive choice by ~1.9× against the unsafe one — and still
under 3ms for a million calls, which is why "safe by default, unsafe where you have measured
a problem" is the right order to work in.

**These four numbers are hand-measured and no committed harness reproduces them.** That is
the exact sin this page opens by describing, so they carry their date and this warning
rather than an invitation to "re-derive with `bun run bench`", which measures something
else. Treat them as an illustration of the SHAPE — cost lives at the callee, and it is
small — not as figures to quote. `bun run bench` is the authority for anything you plan to
repeat. Adding the loop-with-helper case to `bin/benchmarks.ts` would retire this table;
that is tracked in `TODO.md`.

## There is no `unsafe {}` block

This section used to describe one, with semantics ("wraps code in try-catch") and a measured
overhead for a form that does not parse. `unsafe` is an expression PREFIX
(`unsafe new Date(0)`) or a function marker (`function f(! x: 0)`) — never a block.

## Recommendations

1. **Safe by default.** Use it at API boundaries and for anything touching untrusted input.
2. **Unsafe for hot callees.** Mark the inner function, not the outer one.
3. **Validate once at the edge.** Check at entry, then use unsafe internally.
4. **Measure before optimising.** Run `bun run bench`; do not copy a number out of a guide.

## Future: type-flow optimisation

Planned compile-time work will skip checks it can prove redundant — an output type that
matches the next input, a known array element type — so hot paths stop needing the manual
`!`.

## Running benchmarks

```bash
bun run bench                    # regenerates benchmarks.md
bun test src/lang/perf.test.ts   # the transpiler's own performance tests
```
