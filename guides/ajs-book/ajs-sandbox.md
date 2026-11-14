<!--{"parent": "embedding-the-vm.md", "order": 10}-->
<!-- TODO review -->

# The Sandbox

You are about to run code you did not write, often code a model wrote a second ago, inside your
own process. This chapter is for deciding whether that is acceptable. It lists what the AJS VM
guarantees, how each guarantee is enforced today and how it is tested, and, as plainly, what it
does not protect you from.

Each section separates two things:

- **The guarantee** is a property of running an AST. It does not depend on how the VM is built.
  The planned Rust to wasm VM ([Where this is going](#where-this-is-going)) must meet every one.
- **How it holds today** describes the JavaScript VM that ships now: the mechanism, and the
  tests that pin it. Each section ends with a **Pinned by** line naming those tests, so you can
  read the evidence or skip it.

This is the one place the guarantees are listed. Setting up a host is in
[Embedding the AJS VM](/ajs-host/), writing capabilities and atoms is in
[Capabilities and Custom Atoms](/ajs-capabilities/), and the two-line `Eval` and `SafeFunction`
entry points are in [Safe Eval](/safe-eval/).

## Reading the examples

The `ajs` examples run live in this page. The host that runs them is a small one: it passes no
capabilities, gives each run 10,000 fuel, and sets a fetch allowlist of three public API
domains (`api.github.com`, `itunes.apple.com` and `api.open-meteo.com`). In print, read them as
running in that host.

The `javascript` examples are host code. They share these imports:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'
```

`vm.run` resolves to `{ result, error, fuelUsed }` (plus `trace` and `warnings`;
[What `vm.run` returns](/ajs-host/#what-vmrun-returns) has the full shape). On success `error`
is `undefined` and `result` is what the agent returned. On failure `error` is an `AgentError`
with a `message` and an `op`. Each example below says which of the two you get, as
**Result:** or **Error:**.

## The threat model

Assume the guest is hostile. The **guest** is the AJS program and every value it holds; the
**host** is your process, the code that calls `vm.run` and the capabilities it passes in. The
assets are the host's: its process (which must keep running), its memory, its data, its
network position and its credentials. A hostile guest will try to run forever, allocate
without limit, reach a host object or function, read something it was not given, send a
request somewhere it should not, or turn a refusal into a loop it can run for free.

Four words carry the rest of the chapter:

- An **atom** is an operation the VM performs for the guest: `httpFetch`, `storeGet`, `map`.
  A guest does nothing except through atoms and expressions.
- A **capability** is an object the host passes for one run (`capabilities: { fetch, store }`).
  It is the only way an atom reaches the world.
- The **membrane** is the copy-and-check every value goes through when it crosses between
  guest and host.
- A **door** is any place guest data can cause an allocation or cross the boundary. Most of the
  work of a sandbox written in JavaScript is finding every door and guarding it.

The arrangement, in one picture:

```text
  guest (AJS program)                         host (your process)
  ───────────────────                         ───────────────────
  expressions, loops ──── fuel, heap ceiling, timeout ──── halt the run when spent
  httpFetch(...)  ──► membrane: copy, check ──► capabilities.fetch  (yours)
  storeGet(...)   ──► membrane: copy, check ──► capabilities.store  (yours)
  anything else   ──► no atom, no capability ──► refused
```

The VM's job is to be **correct and safe**: run the AST exactly as written, or refuse it.
Nothing about safety depends on its error messages. Some of them explain the fix, as you will
see below, but that is a courtesy, not a contract; the part whose job is to be helpful is the
transpiler, which refuses bad programs before they become ASTs and says what to write instead.
Nothing in this chapter depends on the transpiler: an AST built by hand, by another compiler,
or by an attacker gets the same guarantees.

## Parsing happens outside the VM

**The guarantee.** The VM runs ASTs. It does not parse source on the untrusted path.

Parsing is the one step whose cost the author of the source controls, and it runs before any
budget exists: fuel, the timeout and the heap ceiling all start with `vm.run`. A run is
metered, a parse is not. So parse somewhere you can afford to lose, and hand the VM the result.

**How it holds today.** `tjs-lang/vm-ast` is the same `AgentVM` with no parser in its bundle.
Given source, it throws before doing anything:

```javascript
const vm = new AgentVM()
await vm.run('function f() { return { a: 1 } }', {})
// throws: This VM accepts an AST, not source: no transpiler is wired in. That is the
// point of the 'tjs-lang/vm-ast' build — it contains no parser, so no parser defect
// is reachable through it. …
```

Transpile on the caller's machine, in a worker or in a separate process, or, if you must
transpile untrusted source in-process, behind `transpile(source, { maxSourceBytes })`, which
throws before parsing anything over the cap. `vm.run(source)` on `tjs-lang/vm` still works and
is deprecated. [Transpile where parsing is safe](/ajs-host/#transpile-where-parsing-is-safe) has
the setup.

ASTs are versioned: the transpiler writes `"$ajs": 2` at the root. A VM refuses an AST newer
than it understands rather than guess what an unknown op means, and keeps running older ones,
because stored ASTs must keep working. The refusal is thrown by `vm.run`, before the run starts:

```javascript
const { ast } = transpile('function f() { return { a: 1 } }')
await new AgentVM().run({ ...ast, $ajs: 99 }, {})
// throws: AgentVM.run: This AST declares format version 99, but this build of
// tjs-lang understands at most 2. Refusing to run it rather than guess …
```

## No ambient authority, and where it stops

**The guarantee.** A guest has no power merely by running. Every effect on the world goes
through an atom, and every atom that touches the world reaches only the capabilities the host
passed for this run. A VM with no capabilities does no IO.

The guarantee has one gap, described below: a host `fetch` with no allowlist lets the agent
choose the destination. Time and randomness are not a gap: they are capabilities like any other
([below](#time-and-randomness-are-capabilities)).

**How it holds today.** Every atom carries an `effects` tag, `'pure'` or `'io'`. An `io` atom's
inputs and return go through the membrane ([next section](#values-cross-as-checked-copies)).
`defineAtom` defaults to `'io'`, so an atom a host forgets to tag gets the boundary rather than
skipping it; `'pure'` is something you opt into. The tagging is tested in both directions: one
test checks the list of tags, and another reads what atom bodies actually do, so an atom that
touches `ctx.capabilities` while tagged `pure` fails. (The second test exists because
`xmlParse` was once mis-tagged, and its return reached the guest as a live host `Document`;
that was fixed in 0.13.0.)

The network is the obvious test. With no `fetch` capability, `httpFetch` uses a built-in client
that fetches nothing unless the host sets an allowlist, passed as `context.allowedFetchDomains`
in the run options, and that never reaches a loopback or private address, allowlisted or not,
unless the host also sets `allowPrivateNetwork`. Here an agent tries the cloud metadata address:

```ajs
function reach({ url = 'http://169.254.169.254/latest/meta-data/' }) {
  try {
    let page = httpFetch({ url })
    return { page }
  } catch (err) {
    return { blocked: err }
  }
}
```

**Result:** `{ blocked: 'Fetch blocked: domain not in allowlist. Allowed: api.github.com,
itunes.apple.com, api.open-meteo.com' }` in this page's host. In a host with no allowlist it is
`{ blocked: 'Blocked URL: private/internal addresses not allowed in default fetch' }`.

`err` is a string. In AJS a caught error reaches the guest as its message, capped in length,
never as a host `Error` object, so there is no `err.message` to read.
[Catching](/ajs-errors/#catching) in When Things Fail has the details.

**Pinned by:** `src/vm/atom-effects.test.ts`, `src/vm/atom-effects-scan.test.ts`,
`src/vm/atom-effects-default.test.ts`.

### The gap: your own fetch with no allowlist

When you pass your own `fetch` capability, the VM still checks the scheme, the method and the
headers, but it checks the **destination only if `allowedFetchDomains` is set**. Without an
allowlist, the agent can ask your function for any URL, and only your function stands in the
way. Here `reachSource` is the `reach` agent above, as a string:

```javascript
const { ast: reachAst } = transpile(reachSource)
const vm = new AgentVM()
const fetchCap = async (url, init) => ({ ok: true, reached: url }) // stand-in for fetch

let run = await vm.run(reachAst, {}, { capabilities: { fetch: fetchCap } })
// Result: { page: { ok: true, reached: 'http://169.254.169.254/latest/meta-data/' } }

run = await vm.run(reachAst, {}, {
  capabilities: { fetch: fetchCap },
  context: { allowedFetchDomains: ['api.example.com'] },
})
// Result: { blocked: 'Fetch blocked: domain not in allowlist. Allowed: api.example.com' }
```

With an allowlist set, a private address is refused on your fetch too, even if you list it,
unless `allowPrivateNetwork` is set. Set an allowlist whenever you pass a fetch, or make your
fetch refuse what it should not reach. [Fetch policy](/ajs-host/#fetch-policy) has the options.

### Time and randomness are capabilities

A guest has no clock and no random number generator of its own. `Date()` with no argument,
`Date.now()`, `Math.random()`, and the `random` and `uuid` atoms read two capabilities the host
grants: `capabilities.clock`, an object whose `now()` returns milliseconds since the epoch, and
`capabilities.random`, an object whose `next()` returns a number from 0 up to 1. Both answer
synchronously, and what they return is checked. Without them, those calls are refused, as
`httpFetch` is refused without a fetch:

```javascript
import { AgentVM, systemClock, systemRandom } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
await vm.run(ast, args, {
  fuel: 1000,
  // the real ones; leave either out and the agent cannot read it
  capabilities: { clock: systemClock, random: systemRandom },
})
```

That is deliberate, for three reasons:

- **A timer is a channel.** A guest that can read a clock can time things, which is what a
  timing side channel needs (see
  [What the VM does not protect against](#what-the-vm-does-not-protect-against)). Withhold the
  clock and the guest has no timer.
- **Runs can be replayed.** Inject a recorded clock and a seeded random source, and the same AST
  with the same arguments produces the same result.
- **A simulation host controls time.** A game engine running a fixed-timestep or lockstep
  simulation injects its own clock, so every participant sees the same time and the same random
  sequence.

`Date(x)` with an argument, and date arithmetic, read no clock and need neither. The convenience
entry points (`Eval`, `SafeFunction`, the batteries) grant the real clock and a crypto-backed
random source by default; pass `clock: undefined` or `random: undefined` to withhold one.

When a `cache` entry expires is the host's bookkeeping, not a value the guest reads: it uses the
granted clock when there is one, so a replayed run sees the same hits and misses, and the host's
own clock otherwise. Stored-procedure tokens ([below](#host-state-you-must-keep-trusted)) always
expire on the host's clock.

## Values cross as checked copies

**The guarantee.** A guest never holds a host object, and the host never receives a live guest
value. What crosses the boundary is data, copied.

**How it holds today.** Every crossing goes through the membrane: an IO atom's input going out
to a capability, its return coming back in, and the run's arguments. The membrane builds a
fresh copy from exactly what it read, in one pass, reading own data properties only. It never
runs a getter, because a getter is host code, and a check that ran it would be executing the
thing it exists to keep out.

Only JSON data plus `Date` crosses: plain objects and arrays, strings, numbers, booleans, `null`
and `undefined`, and `Date` by its time value. Shared references and cycles are preserved.
Everything else is refused, not converted: functions, accessors, `Map`, `Set`, typed arrays,
`ArrayBuffer`, `RegExp`, `Error`, class instances (a `Response` included), and objects from
another realm (another global environment, such as an iframe or a Node `vm` context).

A class instance returned by a capability is refused. The `storeGet` atom calls your
`capabilities.store.get(key)`, and here that returns an `Account`:

```javascript
class Account {
  constructor(balance) {
    this.balance = balance
  }
}
const { ast } = transpile(`
function load() {
  try {
    let account = storeGet({ key: 'acct' })
    return { account }
  } catch (err) {
    return { caught: err }
  }
}`)
const run = await new AgentVM().run(ast, {}, {
  capabilities: {
    store: { get: async (key) => new Account(10), set: async (key, value) => {} },
  },
})
// Error: Capability boundary rejected the return of 'storeGet': capability return
//   contains an instance of Account; only plain data (and Date) crosses, …
```

The agent's `catch` does not run. A capability that returns something JSON cannot express is a
bug in the host, and it ends the run ([Refusals that end the run](#refusals-that-end-the-run)
explains why). Return `{ balance: 10 }` and the agent gets `{ account: { balance: 10 } }`.

Run arguments are held to the same rule. An argument with a getter does not make `vm.run`
throw; it comes back as `run.error`, with `op` `'vm.run'`, before any step runs:

```javascript
const run = await new AgentVM().run(ast, { x: 1, get y() { return 2 } })
// Error: Capability boundary rejected the run arguments: run argument has an
//   accessor property 'y'; the boundary takes plain data only, because reading an
//   accessor would execute host code
```

Every copy is built inside a budget fixed in advance: `membraneMaxBytes` (4MB by default), and
outbound also what the remaining fuel can pay; arguments are capped by `argsMaxBytes`. An
oversized value is refused before it is copied, so a capability cannot exhaust memory by
returning a huge payload.

The boundary is a closed set of crossings: the copy has a fixed list of callers, and a test
fails if anything else calls it. What a capability may return, with the common mistakes, is in
[What a capability may return](/ajs-capabilities/#what-a-capability-may-return).

(The membrane does not use `structuredClone`. It once did, and `structuredClone` copied internal
state the check never looked at: a disguised `SharedArrayBuffer` crossed live, and a small view
over a 50MB buffer was charged as 43 bytes. The copy is now built from what the check read.)

**Pinned by:** `src/vm/membrane-doors.test.ts` (the closed list of callers),
`src/vm/egress-doors.test.ts` (every core and battery IO atom, call site by call site),
`src/vm/membrane-invariant.test.ts` (the boundary never reads a host value directly),
`src/vm/args-membrane.test.ts`.

## Refusals that end the run

Most failures in an agent are ordinary: the agent can catch them and carry on. A few end the
run on the spot, even inside a `try`. Which is which:

| Failure                                                                      | What happens | Example                                    |
| ---------------------------------------------------------------------------- | ------------ | ------------------------------------------ |
| Evaluating guest code: a refused operator, a forbidden key, a refused schema | catchable    | `'items: ' + items` on an array            |
| The world fails: a fetch error, a store that throws, an atom's own timeout   | catchable    | a server that is down                      |
| A capability returns a value too large or too deeply nested                  | catchable    | a 5MB response                             |
| A quota is spent                                                             | catchable    | a third `storeGet` under `{ storeGet: 2 }` |
| The live-heap ceiling                                                        | catchable    | `'x'.repeat(5e8)`                          |
| An atom input that does not match its declared schema                        | ends the run | `httpFetch({ url: 8080 })`                 |
| A value going out that cannot be copied (too big, too deep, not plain data)  | ends the run | a 5MB string sent to `storeSet`            |
| A capability returns something JSON cannot express                           | ends the run | a `Map`, a class instance                  |
| Out of fuel, the run's timeout, the host's abort signal                      | ends the run | `while (true) {}`                          |

**The guarantee.** A refusal **at the capability boundary** that is a bug cannot be caught and
retried by the guest, and neither can a spent budget.

The test for "a bug" is: could a correct host, answering with plain JSON, have produced this?
A server can send back four megabytes, so an oversized return is the world's and stays
catchable. A server cannot send back a `Map`, so a `Map` is a bug in the host's capability. And
the agent built everything it sends out, so every outbound refusal is the agent's bug.

The reason for ending the run is about cost. If a guest could catch a boundary refusal, it
would have a loop it controls: send an oversized value, catch the refusal, send it again. That
loop is safe only if every refusal is billed exactly for the work the membrane did inspecting
the value, and getting that billing exactly right turned out to be hard. Ending the run removes
the loop, so at most one attempt is possible per run. Refusals are still billed, as a second
line of defence.

The heap ceiling is the one budget that stays catchable. It refuses before anything is
allocated, and the measurement behind each refusal is charged as fuel, so a loop that catches it
and tries again pays on every pass.

**How it holds today.** A run-ending refusal is recorded on the run itself, not on the error
value, and every step checks it before it runs. So no `catch` block, no later step, and no step
in a parent agent runs after it. (It is recorded on the run because an error is rewrapped as it
passes from a sub-agent, an agent run started by another agent through `agentRun`, to its
parent, and a flag on the error would not survive that.)

There is one exception. When the host serves `agentRun` through its own `agent` capability and
starts a separate `vm.run`, the sub-agent is a different run, with its own budget and its own
quota counters. A refusal ends only that run, and the parent receives an ordinary failure it can
catch. Only a sub-agent given as an AST or a stored-procedure token runs inside the current run
and halts both. See
[The one exception](/ajs-errors/#the-one-exception-a-sub-agent-the-host-runs) and
[The `agent` capability](/ajs-capabilities/#agent).

Out of fuel is the simplest case. This agent wraps an endless loop in `try`:

```ajs
function stubborn() {
  try {
    let i = 0
    while (true) {
      i = i + 1
    }
  } catch (err) {
    return { caught: err }
  }
  return { finished: true }
}
```

**Error:** `Out of Fuel`. Neither `return` runs.

The agent author's side of this, with the full list, is in
[When Things Fail](/ajs-errors/#refusals-that-end-the-run-a-bugs).

**Pinned by:** `src/vm/membrane-halt.test.ts`, in both directions (run-ending refusals end the
run, ordinary failures stay catchable).

## Budgets

**The guarantee.** A run uses only the work, time, memory and calls the host allowed, and when
it reaches a limit it fails as a value instead of taking the host down.

**How it holds today.** Each budget is a run option ([Run options](/ajs-host/#run-options)):

- **Fuel** bounds work: every step, expression node and allocated byte is charged. An
  expression node costs 0.01, a variable write 0.1, most atoms 1, and the default budget is
  1,000 (this page's host gives 10,000). Fuel is counted in work units, not time.
- **The timeout** (`timeoutMs`) bounds wall-clock time, including time spent waiting on a
  capability, which costs no fuel. A compute-only loop never waits on anything, so a timer alone
  could never interrupt it; the VM reads the clock every few steps and yields to the host's
  event loop periodically, so the host's other work keeps running and the deadline holds even in
  a tight loop. (That clock read is the VM's own and never reaches the guest.) Every way a run
  ends aborts its outbound work, so a timed-out run leaves no request in flight.
- **The live-heap ceiling** (`maxHeapBytes`, 64MB by default) bounds what the guest holds at
  once, which fuel cannot: fuel bounds how much a program allocates over its life, not its peak.
- **Quotas** (`quotas: { llmPredict: 3 }`) cap calls per atom, for work outside the VM that fuel
  does not price.
- **Size caps**: `membraneMaxBytes` per crossing, `argsMaxBytes` for arguments, and
  `maxSourceBytes` on the transpile step.

Three invariants make these budgets true rather than approximate:

1. **Nothing allocates before it is charged.** An operation whose size depends on data computes
   a bound from its inputs, charges it, and passes the heap check before it allocates.
   `'x'.repeat(5e8)` is refused before the string exists. A membrane copy is the one case where
   the exact size is known only at the end: it is capped up front by its budget, so it can never
   exceed it, and it is charged its exact size once complete.
2. **Bytes that outlive a step are charged where they become reachable**: at a bind, an
   in-place insertion such as `push`, a `memoize` store, or an atom adding to a container it
   holds.
3. **Every holder of guest values is a heap root.** A **root** is a place guest values are kept
   between steps: scope variables, memo caches, run arguments, and the containers loop atoms
   keep while their bodies run. Before the heap ceiling refuses, the VM measures by walking
   every root once, so memory that is no longer reachable stops counting. A holder the
   measurement cannot see is memory the ceiling cannot see.

Every allocation door and how each is gated is in [VM budgets](/vm-budgets/). Advice on sizing
budgets for an agent, and what each looks like from inside it, is in [Limits](/ajs-limits/).

**Pinned by:** `src/vm/cost-invariant.test.ts` (every step charges fuel in proportion to its
work), `src/vm/heap-roots.test.ts` (no scope state outside the root registry),
`src/vm/timeout-compute.test.ts` (the deadline holds in loops that never yield).

## Only methods with a declared bound

**The guarantee.** A guest can call only operations whose cost the VM can bound before the call.

**How it holds today.** A guest may call a method only if the VM's method table has an entry for
it, and every entry declares how much the call may allocate from its inputs and the exact type
of every argument. There is no "every method on the string prototype" allowlist; an earlier
version had one, and it admitted amplifiers, iterators and `Function.prototype.toString`, which
returns host source. A probe calls every entry on every receiver kind, with arguments chosen to
amplify (large counts, long separators, deep nesting), and fails if a result exceeds its
declared bound. Its first run found nine under-bounds and that source leak.

Implicit coercion is refused, not charged. JavaScript turns an array into a string whenever an
operator asks, and that conversion is an allocation no table entry can see, so the VM refuses
it and asks for the conversion by name:

```ajs
function glue({ items = [1, 2, 3] }) {
  try {
    return { text: 'items: ' + items }
  } catch (err) {
    return { refused: err }
  }
}
```

**Result:** `{ refused: "'+' needs a string, number, boolean or null, not an array — convert it
explicitly (e.g. arr.join(','), JSON.stringify(obj))" }`. This is an error from evaluating guest
code, so it is catchable. With `items.join(', ')` the result is `{ text: 'items: 1, 2, 3' }`.

Guest values are a closed data domain: no host function, builtin namespace or method can become
a guest value, by any route. Reading a method as a value (`let f = text.trim`) is refused at run
time.

**Pinned by:** `src/vm/vm-budgets.test.ts` (the method-table probe), `src/vm/guest-values.test.ts`
(every known route to a host value: identifiers, member reads, enumeration of namespaces,
`toJSON`, method shadowing, atom inputs, the result), `src/vm/guest-fuzz.test.ts` (seeded random
programs: `vm.run` never throws, no function reaches a result or a capability, and wall time
tracks fuel).

## Regex runs on the VM's own engine

**The guarantee.** No pattern and no input can make a match take unbounded time, and a guest
pattern never reaches the host's regex engine.

**How it holds today.** Guest regexes run on the VM's own engine, a Pike VM that advances every
possible match in lockstep, so a match takes time proportional to input times pattern whatever
the pattern. Regex denial of service is gone as a class, not screened for. Every step, capture
copy and compiled instruction is charged as fuel. The pattern below is the textbook catastrophic
case: a backtracking engine's time roughly doubles with each extra `a`, and forty of them is far
beyond what it can finish:

```ajs
function evil({ n = 40 }) {
  let input = 'a'.repeat(n) + 'b'
  let found = input.search(/^(a+)+$/)
  return { found }
}
```

**Result:** `{ found: -1 }`, for about 2 fuel.

A JSON-Schema `pattern` would be compiled by the host's engine when the schema validates, so a
guest schema may not carry one:

```ajs
function shaped({ code = 'AB-12' }) {
  try {
    let ok = Schema.isValid(code, { type: 'string', pattern: '^[A-Z]' })
    return { ok }
  } catch (err) {
    return { refused: err }
  }
}
```

**Result:** `{ refused: "This schema is not available in AsyncJS (.pattern: a 'pattern' is
compiled by the host's regex engine). …" }`, a catchable error. An IO atom's input schema may
not use `pattern` either (see [Custom atoms](#custom-atoms-are-the-hosts-responsibility)).

Regex is deprecated in AJS in favour of [Pattern](/pattern/), a grammar built as data.

**Pinned by:** `src/vm/regex-doors.test.ts` (nothing in the VM constructs a host `RegExp`),
`src/vm/regex-doors-behaviour.test.ts` (with the host `RegExp` and string methods instrumented,
a generated corpus supplies patterns through every door, and no guest-chosen string may reach
the host engine).

## Forbidden keys and missing constructs

**The guarantee.** A guest cannot reach or replace a prototype.

**How it holds today.** `__proto__`, `constructor` and `prototype` are refused in member reads,
in scope writes (a variable named `__proto__`) and in every computed-key write inside the VM:

```ajs
function poke({ key = '__proto__' }) {
  let target = { name: 'guest' }
  try {
    let found = target[key]
    return { found }
  } catch (err) {
    return { refused: err }
  }
}
```

**Result:** `{ refused: "Security Error: Access to '__proto__' is forbidden" }`, a catchable
error.

The constructs that would give a guest code or a prototype do not exist in AJS: no `eval`, no
`Function`, no `import`, no `this`, no `class`, no `new`. The transpiler refuses them, and the VM
has no operation that implements them, so a hand-built AST cannot ask for them either.

**Pinned by:** `src/vm/guest-key-writes.test.ts` (every computed-key write in the VM goes
through the guarded setter).

## Custom atoms are the host's responsibility

**The guarantee stops at your code.** The VM guarantees what it does with an atom's inputs and
outputs. What an atom's body does with the capabilities you give it is yours.

**How it holds today.** The VM holds custom atoms to the boundary:

- **An IO atom must declare an input schema**, and it may not use `pattern` or
  `patternProperties`. `defineAtom` refuses it at definition (`Atom 'peek' is an IO atom and
  declares no input schema …`). Each call is validated against a frozen copy of that schema, and
  the atom receives a checked copy of its inputs.
- **A `pure` atom's return is checked.** A pure atom that returns a `Map` ends the run
  (`'leaky' is tagged pure but returned something that is not guest data …`).

Writing atoms and capabilities is in [Capabilities and Custom Atoms](/ajs-capabilities/).

## Host state you must keep trusted

Two pieces of state outlive a single run. Neither is about custom atoms, and both are hazards
for any host.

- **The procedure store is process-wide.** The `storeProcedure` atom stores an AST and returns a
  token (`proc_…`) that a later `agentRun` can call. That token works in any run in the process
  that holds it, until it expires (an hour by default). If agents in one process must not share
  procedures, pass `quotas: { storeProcedure: 0 }`.
- **`quotaUsed` is trusted host state.** A quota counts calls within one run. To hold it across
  nested runs, pass the same `quotaUsed` object to each, but never build it from anything a
  guest or a remote party can write: a nested run believes it.
  [Quotas across nested runs](/ajs-host/#quotas-across-nested-runs) has the setup.

## What the VM does not protect against

- **Timing side channels.** Guest and host share a process and a CPU. Withholding the clock
  takes away the guest's timer, but a guest that can call out (a fetch, a store) can still
  measure time against something outside the VM.
- **JavaScript engine and JIT bugs.** A guest program drives the host engine's compiled code, so
  a bug in V8's or JavaScriptCore's JIT is reachable from a guest, and nothing in a
  JavaScript-in-JavaScript VM defends against it.
- **Memory-level attacks** on the process. If these, the JIT or timing are in your threat model,
  put process isolation under the VM: see [Where to run it](/ajs-host/#where-to-run-it).
- **Agents fanning out through other agents.** Fuel bounds this run, not the services it calls.
  Every `httpFetch` carries an `X-Agent-Depth` header and the VM refuses to fetch at depth 10,
  but that only works if each endpoint passes the header on. It is cooperative: it stops
  accidental loops, not a hostile endpoint. Rate-limit open endpoints.
- **A host fetch with no allowlist**, as [above](#the-gap-your-own-fetch-with-no-allowlist).
- **Credentials you hand the agent.** An agent has no secrets of its own, but one you put in its
  arguments, or that a capability returns, is the agent's to send wherever the fetch policy
  allows. The domain allowlist is what stops it leaving.
- **Untrusted `$predicate` source.** A JSON Schema may carry a `$predicate`, a small function
  that checks a value. It compiles to native JavaScript, which no syntactic check makes safe
  against hostile code. Only source the host registered with `trustPredicate` runs; untrusted
  predicates fail closed.

**Tested, not proven.** The guarantees above are enforced by design and covered by adversarial
suites, the probes and parsers named in each section, and a seeded random-program fuzzer (300
programs in the fast lane, 3,000 in the full suite). That is evidence, not proof. A Lean
specification of the VM, with the shipping VM tested against it, is
[proposed](/ajs-lean-spec/) and does not exist yet.

## Where this is going

The planned 1.0 VM is written in Rust and compiled to WebAssembly
([AJS Native VM](/ajs-native-vm/)). Hosts that are not JavaScript at all, such as a native game
engine, need it, and it is the reason the guarantees here are written as properties of running
an AST.

The reason is the shape of the work above. In a VM written in JavaScript, every host builtin a
guest can reach does work the VM did not do itself, and each one has to be found, bounded and
charged, door by door. In wasm the VM owns its allocator and its values, so several classes of
risk go away rather than being mitigated:

- **No JavaScript object model in the guest**: no prototypes, no getters, no forbidden-key list
  to maintain. Values cross as encoded bytes the VM decodes into its own memory.
- **No host builtins to meter**: the method table becomes the VM's own code.
- **No parser in the trust path**: the native VM accepts ASTs only, the contract
  `tjs-lang/vm-ast` already established.
- **JavaScript-engine JIT bugs no longer reach guest execution**: guest values stop steering the
  JS JIT's speculative optimisation. The engine's wasm compiler remains, a smaller and simpler
  surface.

What moves rather than disappears: **memory safety** becomes the VM's own problem. The plan is
Rust with `unsafe` forbidden, compiled to wasm so the wasm sandbox catches what the Rust misses.
**The capability boundary** remains, shrunk to a byte buffer: values still cross it, and it
still has to check them. Timing side channels remain, since it is still one process. And there
is a known regression: under a strict Content Security Policy, `script-src` will need
`'wasm-unsafe-eval'`.

The guarantees in this chapter are the contract that VM must meet. That is why each one is
stated as a property of running an AST, and the JavaScript mechanism is described separately:
when the native VM lands, the mechanisms change, and the guarantees, including an injected clock
if that proposal is adopted, should not.
