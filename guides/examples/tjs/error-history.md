<!--{"section":"tjs","type":"example","group":"patterns","order":8}-->

# Flight Recorder

The runtime records what it noticed — errors, and the near-misses that aren't errors yet

```tjs
/*#
## The Problem with Monadic Errors

Monadic errors don't throw — they return error values. Your program
doesn't crash, but that means an error can silently vanish if nobody
checks a return value:

    const result = createUser(42)  // returns MonadicError
    // oops, nobody checked result — the error is gone

## The Solution: a Flight Recorder

TJS keeps a bounded ring of everything the runtime noticed. It is the
antidote to the language's own central design choice: errors that are
*returned* are trivially easy to ignore, so the runtime remembers them
for you. On by default, zero cost on the happy path.

Two ways to read it:

- `__tjs.errors()` — **type errors only.** This is the one you assert on:
  clear, run, expect none.
- `__tjs.records()` — **everything**, including things that are not errors
  *yet*.

### Why record non-errors?

Because the expensive failures aren't the loud ones. A `wasm{}` block that
quietly fell back to JavaScript is *fine* — right up until the day your
page claims "⚡ SIMD" and is running plain JS. A typed array passed
without `wasmBuffer()` is *fine* — except it's copied in and out on every
call, and may be slower than the JS it replaced.

Nothing is wrong. Nothing throws. Every test is green. That is exactly
the class of failure that costs you a week, and it is what a flight
recorder is for.

The trade is deliberately asymmetric: **a false alarm costs one slot in a
ring buffer; a missing entry costs a debugging session with no evidence.**
So the runtime records liberally, and recording never changes behavior.
*/

// --- errors(): the assertion surface -----------------------------------

function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

function double(x: 0): 0 {
  return x * 2
}

__tjs.clearErrors()

greet('Alice')
double(5)
console.log('After correct calls:', __tjs.errors().length, 'errors')

// Silent failures — wrong types, and nobody checks the return value
greet(42)
double('oops')

const recent = __tjs.errors()
console.log('After bad calls:', recent.length, 'errors')
for (const err of recent) {
  console.log('  -', err.message)
}

// The testing pattern: clear → run → expect nothing
__tjs.clearErrors()
greet('Bob')
console.log('\nTest result:', __tjs.errors().length === 0 ? 'PASS' : 'FAIL')

// --- records(): the whole flight ---------------------------------------

__tjs.clearRecords()

// Anything can report. Your own code can too — record what you'd want to
// know after an incident, not just what you're sure is broken.
__tjs.record({
  source: 'app',
  severity: 'notice',
  message: 'cache miss on user lookup',
  data: { userId: 42 },
})

greet(99)  // a type error — also a record

// Everything the runtime noticed, newest last
for (const r of __tjs.records()) {
  console.log(`[${r.source}/${r.severity}]`, r.message)
}

// Filter it: just the near-misses, or just one subsystem
console.log('\nNotices only:', __tjs.records({ severity: 'notice' }).length)
console.log('Type errors:  ', __tjs.records({ source: 'type' }).length)

// errors() stays narrow on purpose — the notice above is NOT an error,
// and must never break a "no unexpected errors" assertion.
console.log('errors():     ', __tjs.errors().length, '(the notice is not an error)')

// --- the recorder does not lie about what it lost ----------------------

__tjs.clearRecords()
for (let i = 0; i < 100; i++) {
  greet(i)  // 100 type errors, ring holds 64
}
console.log('\nTotal recorded:', __tjs.getRecordCount())
console.log('Still buffered: ', __tjs.records().length)
console.log('Lost to wrap:   ', __tjs.getDroppedCount(), '(a black box that silently drops evidence is lying)')
```
