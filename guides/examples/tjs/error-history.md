<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 8, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Flight Recorder

The runtime records what it noticed: errors, and the near-misses that are not errors yet.

TJS returns errors instead of throwing them. A call with a bad argument hands back a
`MonadicError` and the program carries on. That keeps one bad value from crashing a page,
but it also means an error vanishes if nobody checks the return value:

```javascript
const result = createUser(42) // returns a MonadicError
// nobody looked at result, so the error is gone
```

So the runtime keeps a flight recorder: a bounded ring of everything it noticed, on by
default, with no cost on calls that succeed. You read it through the global `__tjs` object,
which every TJS program has.

```tjs:inline
/#
Two ways to read the recorder: `errors()` returns type errors only,
`records()` returns everything.
#/

function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

function double(x: 0): 0 {
  return x * 2
}

// --- errors(): the assertion surface -----------------------------------

__tjs.clearErrors()

greet('Alice')
double(5)
console.log('After correct calls:', __tjs.errors().length, 'errors')

// Wrong types, and nobody checks the return value
greet(42)
double('oops')

const recent = __tjs.errors()
console.log('After bad calls:', recent.length, 'errors')
for (const err of recent) {
  console.log('  -', err.message)
}

// The testing pattern: clear, run, expect nothing
__tjs.clearErrors()
greet('Bob')
console.log('\nTest result:', __tjs.errors().length === 0 ? 'PASS' : 'FAIL')

// --- records(): the whole flight ---------------------------------------

__tjs.clearRecords()

// Your own code can report too
__tjs.record({
  source: 'app',
  severity: 'notice',
  message: 'cache miss on user lookup',
  data: { userId: 42 },
})

greet(99) // a type error is also a record

// Everything the runtime noticed, oldest first
for (const r of __tjs.records()) {
  console.log(`[${r.source}/${r.severity}]`, r.message)
}

// Filter by severity or by source
console.log('\nNotices only:', __tjs.records({ severity: 'notice' }).length)
console.log('Type errors: ', __tjs.records({ source: 'type' }).length)
console.log('errors():    ', __tjs.errors().length, '(the notice is not an error)')

// --- loss is visible ---------------------------------------------------

__tjs.clearRecords()
for (let i = 0; i < 100; i++) {
  greet(i) // 100 type errors; the ring holds 64
}
console.log('\nTotal recorded:', __tjs.getRecordCount())
console.log('Still buffered:', __tjs.records().length)
console.log('Lost to wrap:  ', __tjs.getDroppedCount())
```

## What to notice

The calls `greet(42)` and `double('oops')` returned errors nobody looked at, and the
program carried on. The runtime wrote both down, and `__tjs.errors()` hands them back. Each
message names the location, function and parameter (`<source>:6:greet.name`), what was
expected and what arrived.

The three sections of the example show the recorder's three promises.

1. **`errors()` is narrow.** It returns type errors and nothing else, so "clear, run,
   expect none" is a reliable assertion. The `app` notice in the middle section does not
   appear in it.
2. **`records()` is broad.** Type errors, your own `__tjs.record(...)` entries and the
   runtime's near-misses all land in one ring. Pass `{ source }`, `{ severity }` or both
   to filter it.
3. **Loss is visible.** The ring holds the most recent 64 records. When it wraps,
   `getRecordCount()` keeps counting and `getDroppedCount()` says how many fell off the
   end. A recorder that silently dropped evidence would be lying about what happened.

Recording never changes what your program does: it does not throw, does not log unless you
ask it to, and does not alter control flow.

## What a record looks like

Every entry in `records()` is a plain object:

| Field      | Meaning                                                           |
| ---------- | ----------------------------------------------------------------- |
| `source`   | Who reported it: `'type'`, `'wasm'`, `'vm'`, `'app'`, or your own |
| `severity` | `'error'`, `'warning'` or `'notice'`                              |
| `message`  | A human-readable description                                      |
| `data`     | Optional details, whatever the source thinks a reader will want  |
| `error`    | The `MonadicError` itself, on type errors                         |
| `stack`    | The call stack, when `configure({ callStacks: true })` is on      |

What the runtime reports today:

- **`'type'`**: every type error, the same entries `errors()` returns.
- **`'wasm'`**: a `wasm {}` block that fell back to JavaScript or failed to instantiate,
  and a typed array copied in and out on every call because it was not allocated with
  `wasmBuffer()`.
- **`'vm'`**: every failure of an AJS run (fuel exhausted, an atom timing out, a
  capability refused, an atom throwing), plus a few notices about deprecated VM usage.

The `wasm` entries are the reason the recorder takes non-errors. A block that quietly fell
back to JavaScript is correct, just slow, and nothing throws and every test stays green.
That is the kind of problem that takes a week to find without evidence. A false alarm costs
one slot in the ring; a missing entry costs a debugging session with nothing to go on. So
the runtime records liberally, and each kind of near-miss is recorded once per site, not
once per call, so a hot loop does not fill the ring.

## AJS runs land here too

An AJS agent that fails does not throw either: `vm.run` returns its error in the result.
The VM also writes each failure into the same recorder, under `source: 'vm'`, so a starved
or refused run leaves evidence even if the caller ignores the result. This matters for
code like the Universal Endpoint chapter, which runs agents other
people wrote.

```tjs:inline
import { AgentVM, transpile } from 'tjs-lang'

const agent = transpile(`
  function countUp({ n: 10 }) {
    let total = 0
    let i = 0
    while (i < n) {
      total = total + i
      i = i + 1
    }
    return { total }
  }
`)

const vm = new AgentVM()

__tjs.clearRecords()

// Enough fuel: a clean run records nothing
const ok = await vm.run(agent.ast, { n: 10 }, { fuel: 1000 })
console.log('total:', ok.result.total)

// Too little fuel: the run stops, and the recorder keeps the failure
const starved = await vm.run(agent.ast, { n: 1000000 }, { fuel: 5 })
console.log('starved run error:', starved.error?.message)

for (const r of __tjs.records({ source: 'vm' })) {
  console.log(`[${r.source}/${r.severity}]`, r.message, '(op:', r.data?.op + ')')
}
console.log('errors():', __tjs.errors().length, '(a VM failure is not a type error)')
```

The failed run shows up once, with the atom that was running when the fuel ran out. It
does not appear in `errors()`, which stays reserved for type errors.

## Using it: audit a unit of work

The clear-run-check pattern works outside tests too. Clear the errors, run a job, then
look: anything the job produced and dropped is still there.

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

The second job returned a good port and would pass any test that only looked at its
result. The recorder shows it also made a bad call on the way.

## Gotchas

- **It is a ring, not a log.** 64 entries is enough to see what just went wrong, not to
  audit a long run. If you need a history, copy `records()` somewhere durable yourself; the
  entries are plain objects.
- **Clearing is global, and both clears clear everything.** There is one ring, so
  `clearErrors()` empties the records too, not only the type errors. (It returns just the
  type errors it removed; `clearRecords()` returns every entry.) Each emitted module has its
  own runtime instance, but instances mirror their records into the global one, so a page
  with several TJS modules still has one place to look, and one clear empties it.
- **`getErrorCount()` and `getRecordCount()` keep counting past 64.** Compare them with
  `errors().length` and `records().length` to see whether anything wrapped.
- **Turning it off** is `configure({ trackErrors: false })` from `tjs-lang/lang`. After
  that, `errors()` and `records()` return empty arrays. You rarely want this: calls that
  succeed never touch the recorder.
