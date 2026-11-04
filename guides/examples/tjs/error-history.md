<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 8, "parent": "tjs-patterns.md"}-->

# Flight Recorder

The runtime records what it noticed — errors, and the near-misses that aren't errors yet

```tjs:inline
/#
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
#/

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

<!-- TODO review -->
## What to notice

The two calls `greet(42)` and `double('oops')` returned errors that nobody looked at, and
the program carried on. In most languages that would be the end of the story. Here the
runtime wrote both down, and `__tjs.errors()` hands them back with their full messages: the
file, line, function and parameter, what was expected and what arrived.

The three sections of the example show the recorder's three promises:

1. **`errors()` is narrow.** It returns type errors and nothing else, so "clear, run, expect
   none" is a reliable assertion. The `app` notice recorded in the middle section does not
   show up in it.
2. **`records()` is broad.** Type errors, your own `__tjs.record(...)` entries, and the
   runtime's near-misses (a `wasm {}` block that fell back to JavaScript, a typed array
   copied on every call because it was not allocated with `wasmBuffer()`, an AJS run that
   ran out of fuel) all land in one ring, filterable by `source` and `severity`.
3. **Loss is visible.** The ring holds the most recent 64 records. When it wraps, the
   counts keep going and `getDroppedCount()` says how much evidence fell off the end.

Recording never changes what your program does: it does not throw, does not log unless you
ask, and costs nothing on calls that succeed.

<!-- TODO review -->
## Using it: audit a unit of work

The pattern generalises beyond tests. Clear the errors, run a job, then look: anything the
job produced and dropped is still there.

```tjs:inline
function parsePort(text: '8080'): 8080 {
  return Number(text)
}

// Run a job, then report any type errors it produced, even ones it ignored
function audited(label: 'job', job = () => 0) {
  __tjs.clearErrors()
  const result = job()
  const errors = __tjs.errors()
  console.log(`${label}: ${errors.length ? errors.length + ' type error(s)' : 'clean'}`)
  for (const e of errors) console.log('   ', e.message)
  return result
}

audited('good config', () => parsePort('3000'))

// This job throws its first result away; the error is not lost
audited('sloppy config', () => {
  parsePort(3000)
  return parsePort('80')
})
```

The second job returned a perfectly good port, and would pass any test that only looked at
its result. The recorder is how you find out it also made a bad call on the way.

<!-- TODO review -->
## Gotchas

- **It is a ring, not a log.** 64 entries is enough to see what just went wrong, not to
  audit a long run. Ship what matters somewhere durable yourself (`records()` returns plain
  entries you can serialise).
- **Clearing is global.** `clearErrors()` and `clearRecords()` clear the shared ring. Each
  emitted module has its own runtime instance, but instances mirror their records into the
  global one, so a page with several TJS modules still has one place to look.
- **Turning it off** is `configure({ trackErrors: false })` from `tjs-lang/lang`. You rarely
  want to: the happy path does not pay for it.
