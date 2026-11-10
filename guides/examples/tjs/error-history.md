<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 8, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Flight Recorder

An aircraft's flight recorder writes down everything that happens, so that after a crash
someone can read back what went wrong. The TJS runtime keeps one too, an error history:
it records every error, and the near-misses that are not errors yet (a WebAssembly block
that quietly fell back to slower JavaScript, say).

## Why errors need recording

TJS returns errors instead of throwing them. A call with a bad argument hands back an error
value (a `MonadicError`) in place of its result, and the program carries on. That keeps one
bad value from crashing a page, but the error vanishes if nobody checks the return value:

```tjs:inline
function createUser(name: 'Ada') {
  return { name }
}

const result = createUser(42) // a number, not a string
console.log('carried on; got an error?', isMonadicError(result)) // → true
console.log(result.message)
// → Expected string for '…:1:createUser.name', got number
```

The colon value is an example, not a TypeScript type: `name: 'Ada'` means `name` must be a
string, so `createUser(42)` is a type error. (See [parameters](/TJS-SYNTAX/#parameters).)
Here the code did check, with `isMonadicError`. Most code doesn't.

So the runtime keeps a record of what it noticed. It is a fixed-size buffer, a ring: it
holds the most recent 64 entries and overwrites the oldest. It is on by default and costs
nothing on calls that succeed.

You read it through the `__tjs` object. Inside a TJS file, `__tjs` is that file's own
runtime and sees the calls made to that file's functions. `globalThis.__tjs` is the shared
one that every file (and the AJS VM) reports to; more on that [below](#one-file-or-the-whole-page).
Both exist whenever a TJS runtime is installed: under `tjs run`, the bun plugin, this site,
or after `installRuntime()` from `tjs-lang/runtime`.

## errors(): type errors only

```tjs:inline
function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

function double(x: 0): 0 {
  return x * 2
}

__tjs.clearErrors()

greet('Alice')
double(5)
console.log('After correct calls:', __tjs.errors().length) // → 0

// Wrong types, and nobody checks the return values
greet(42)
double('oops')

console.log('After bad calls:', __tjs.errors().length) // → 2
for (const err of __tjs.errors()) {
  console.log('  -', err.message)
}

// The testing pattern: clear, run, expect nothing
__tjs.clearErrors()
greet('Bob')
console.log('Test:', __tjs.errors().length === 0 ? 'PASS' : 'FAIL') // → PASS
```

`greet(42)` and `double('oops')` returned errors nobody looked at, and the program carried
on. The runtime wrote both down, and `__tjs.errors()` hands them back. Each message names
the place, function and parameter, then what was expected and what arrived:

```text
Expected string for '<source>:1:greet.name', got number
Expected integer for '<source>:5:double.x', got string
```

The place is the file name and line (`<source>` when the code has no file name, as here).

`errors()` returns type errors and nothing else, never warnings or notices. That is what
makes "clear, run, expect none" a reliable test.

## records(): everything

```tjs:inline
function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

__tjs.clearRecords() // empties the whole ring, type errors included

// Your own code can report too
__tjs.record({
  source: 'app',
  severity: 'notice',
  message: 'cache miss on user lookup',
  data: { userId: 42 },
})

greet(99) // a type error is also a record

// Everything recorded, oldest first
for (const r of __tjs.records()) {
  console.log(`[${r.source}/${r.severity}]`, r.message)
}
// → [app/notice] cache miss on user lookup
// → [type/error] Expected string for '…:1:greet.name', got number

console.log('Notices:    ', __tjs.records({ severity: 'notice' }).length) // → 1
console.log('Type errors:', __tjs.records({ source: 'type' }).length) // → 1
console.log('errors():   ', __tjs.errors().length) // → 1: the notice is not in it
```

Type errors, your own `__tjs.record(...)` entries and the runtime's near-misses all land in
the same ring. Pass `{ source }`, `{ severity }` or both to filter it.

There is one ring per runtime, so the two clears differ only in what they return.
`clearErrors()` empties everything, records included, and returns the type errors it
removed; `clearRecords()` returns every entry.

## Loss is visible

```tjs:inline
function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

__tjs.clearRecords()
for (let i = 0; i < 100; i++) {
  greet(i) // a type error on every call
}
console.log('Type errors:   ', __tjs.getErrorCount()) // → 100
console.log('Total recorded:', __tjs.getRecordCount()) // → 100
console.log('Still buffered:', __tjs.records().length) // → 64
console.log('Lost to wrap:  ', __tjs.getDroppedCount()) // → 36
```

The ring keeps the last 64 entries. `getErrorCount()` and `getRecordCount()` keep counting
past that (until the next clear, which resets them), and `getDroppedCount()` says how many
fell off the end. A recorder that silently dropped evidence would be lying about what
happened.

Recording never changes what your program does: it does not throw, does not log unless you
ask it to, and does not alter control flow.

## What a record looks like

Every entry in `records()` is a plain object:

| Field      | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| `source`   | Who reported it: `'type'`, `'wasm'`, `'vm'`, `'app'`, or your own |
| `severity` | `'error'`, `'warning'` or `'notice'`                             |
| `message`  | A human-readable description                                     |
| `data`     | Optional details; VM failures put the failing atom here as `op`  |
| `error`    | The `MonadicError` itself, on type errors                        |
| `stack`    | The call stack, when `configure({ callStacks: true })` is on     |

`configure` comes from `tjs-lang/lang`; see [the gotchas](#gotchas) for when it takes effect.

What the runtime reports today:

- **`'type'`**: every type error, on every call. These are the entries `errors()` returns.
- **`'wasm'`**: TJS lets you write inline WebAssembly (see [WASM basics](/wasm-basics/)).
  It records a `wasm {}` block that fell back to JavaScript or failed to load, and a typed
  array that is copied in and out on every call because it was not allocated with
  `wasmBuffer()`.
- **`'vm'`**: every failure of an AJS run (fuel exhausted, an atom timing out, a
  capability refused, an atom throwing), plus a deprecation notice and a warning about a
  string that looks like a variable path but is not one.

The `wasm` entries are the reason the recorder takes non-errors. A block that quietly fell
back to JavaScript is correct, just slow: nothing throws and every test stays green. That
kind of problem takes a week to find without evidence. A false alarm costs one slot in the
ring; a missing entry costs a debugging session with nothing to go on. So the runtime
records liberally.

Type errors are recorded on every call, as the loop above shows. The near-miss notices are
recorded once per site, not once per call, so a hot loop full of slow WebAssembly calls
does not fill the ring.

## AJS runs land here too

AJS is TJS's sandboxed agent language (see the [AJS guide](/DOCS-AJS/)). An agent runs on a
VM with a fuel budget, and stops when the fuel runs out. A failed run does not throw either:
`vm.run` returns its error in the result. The VM also writes each failure into the shared
recorder, `globalThis.__tjs`, under `source: 'vm'`, so a run that ran out of fuel or was
refused leaves evidence even if the caller ignores the result. That matters for code like
[The Universal Endpoint](/the-universal-endpoint/), which runs agents other people wrote.

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
const recorder = globalThis.__tjs // the shared recorder the VM writes to

recorder.clearRecords()

// Enough fuel: a clean run records nothing
const ok = await vm.run(agent.ast, { n: 10 }, { fuel: 1000 })
console.log('total:', ok.result.total) // → 45

// Too little fuel: the run stops, and the recorder keeps the failure
const starved = await vm.run(agent.ast, { n: 1000000 }, { fuel: 5 })
console.log('starved run error:', starved.error?.message) // → Out of Fuel

for (const r of recorder.records({ source: 'vm' })) {
  console.log(`[${r.source}/${r.severity}]`, r.message, '(op:', r.data?.op + ')')
}
// → [vm/error] Out of Fuel (op: varAssign)
console.log('errors():', recorder.errors().length) // → 0: not a type error
```

`transpile` turns the agent's source into an AST, the data the VM runs. The failed run
shows up once, with the atom that was running when the fuel ran out in `data.op`. It does
not appear in `errors()`, which stays reserved for type errors.

The example reads `globalThis.__tjs`, not `__tjs`. A file that declares a typed function
gets its own `__tjs`, and the VM does not write to that one.

## Using it: audit a unit of work

The recorder works outside tests too. Note the error count, run a job, then look: anything
the job produced and dropped is still there.

```tjs:inline
function parsePort(text: '8080'): 8080 {
  return Number(text)
}

// Run a job, then report the type errors it produced, even ones it ignored.
// label is required (example 'job'); job has a default.
function audited(label: 'job', job = () => 0) {
  const recorder = globalThis.__tjs // the shared recorder: every module reports here
  const before = recorder.getErrorCount()
  const result = job()
  const added = recorder.getErrorCount() - before
  const errors = added > 0 ? recorder.errors().slice(-added) : []
  console.log(`${label}: ${added ? added + ' type error(s)' : 'clean'}`)
  for (const e of errors) console.log('   ', e.message)
  return result
}

audited('good config', () => parsePort('3000')) // → good config: clean

// This job throws its first result away; the error is not lost
audited('sloppy config', () => {
  parsePort(3000)
  return parsePort('80')
}) // → sloppy config: 1 type error(s)
```

The second job returned a good port and would pass any test that only looked at its
result. The recorder shows it also made a bad call on the way.

Two choices make this a real audit. It reads the shared recorder, so it sees errors from
typed functions imported from other files, not only this one. And it compares counts
instead of clearing, so it does not wipe evidence other code on the page may want. (If a
job adds more than 64 errors, the oldest are gone; `added` still says how many there were.)

## One file or the whole page

Each TJS file has its own runtime, with its own ring. Its `__tjs.errors()` and `__tjs.clear*()`
see only the calls made to that file's functions. Every entry is also copied to the shared
recorder, `globalThis.__tjs`, which is the one place that sees the whole page, VM runs
included.

Copying goes one way. Clearing a file's ring leaves the shared recorder alone, and clearing
the shared recorder leaves every file's ring alone.

Use `__tjs` to test one file's functions. Use `globalThis.__tjs` to ask what happened on the
page.

## Gotchas

- **It is a ring, not a log.** 64 entries is enough to see what just went wrong, not to
  audit a long run. Every source shares those 64 slots, so a chatty `record()` caller can
  push type errors out of `errors()`. If you need a history, copy `records()` somewhere
  durable yourself; the entries are plain objects.
- **A clear is wider than its name.** `clearErrors()` empties the records too, and both
  reset the counts. Clearing the shared recorder throws away evidence from every other file
  on the page, which is why the audit above compares counts instead.
- **Turning it off.** `configure({ trackErrors: false })` from `tjs-lang/lang` turns off the
  shared recorder and the files loaded after it; files already loaded keep the settings
  they started with. To turn off one file's ring, call `__tjs.configure({ trackErrors: false })`
  inside it. Once off, `errors()` and `records()` return empty arrays. You rarely want this:
  calls that succeed never touch the recorder.
