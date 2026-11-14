<!--{"parent": "ajs.md", "order": 5.5, "book": ["default"]}-->
<!-- TODO review -->

# VM budgets: fuel, memory and boundary limits

AJS runs untrusted code, often code a model wrote, inside your JavaScript process. Its budgets
are therefore security promises, not tuning knobs: a run may use only the work, memory and
boundary traffic you allowed it, and when it reaches a limit it fails as a value instead of
taking the host down.

Two words recur. The **guest** is the AJS program and every value it holds: its variables, its
arguments, what its atoms return to it. The **host** is your JavaScript process: the code that
calls `vm.run`, the capabilities it passes in, and the atoms it registers.

What to read:

- **Embedding the VM:** [The budgets](#the-budgets), [When a budget
  refuses](#when-a-budget-refuses) and [Why not ask the
  runtime](#why-not-ask-the-runtime-how-much-memory-is-in-use).
- **Writing agents:** [Refused, not charged](#refused-not-charged-implicit-coercion) and [Exact
  operand types](#exact-operand-types).
- **Writing custom atoms:** [What this means for your atoms](#what-this-means-for-your-atoms).
- **Changing the VM:** [The doors](#the-doors) and everything after it, which lists every place a
  guest program can allocate and how each is checked.

How to call `vm.run` and pass capabilities is covered in [Hosting the VM](/ajs-host/); this
chapter covers what the budget options mean.

## The budgets

Every option is set per run, in the third argument to `vm.run`.

| Option | Default | What it bounds |
|---|---|---|
| `fuel` | 1,000 | **Work.** Every step, expression node and allocated byte is charged (rates below). When fuel runs out the run ends with `Out of Fuel`. Fuel is the time budget for computation. |
| `timeoutMs` | 60s, or twice the slowest registered atom's timeout if that is longer | **Wall-clock time**, including time spent waiting on a capability, which costs no fuel. The default does not depend on `fuel`. Whichever of the two runs out first ends the run. |
| `timeoutOverrides` | each atom's own `timeoutMs` (1s unless the atom says otherwise) | **One call's wall-clock time**, per atom (`{ httpFetch: 30_000 }`; `0` disables). |
| `maxHeapBytes` | 64MB | **Peak live memory**: the bytes guest state holds at once. |
| `membraneMaxBytes` | 4MB | **One value crossing the capability boundary**, in either direction: what an IO atom returns into the VM, and what it hands out to a capability. |
| `argsMaxBytes` | 4MB | **The run's arguments**, copied in before the run starts. Fuel also bounds them: one unit of fuel pays for 8,000 bytes. |
| `quotas` | none | **Calls per atom** (`{ llmPredict: 3 }`), for work outside the VM that fuel cannot see. An atom not listed is unlimited. |
| `quotaUsed` | a fresh counter per run | **The counter `quotas` counts against.** A quota counts calls within one run, so an agent that can start a nested run gets a fresh allowance there. To hold a cap across nested runs, pass the same `quotaUsed` object to each. It is trusted host state: never build it from anything a guest can write. |
| `costOverrides` | each atom's own `cost` | **The fuel price of an atom** (`{ httpFetch: 5 }`). |

`maxSourceBytes` belongs to the parser, not the run. The deprecated `vm.run(source)`, `Eval` and
`SafeFunction` apply it at 8KB by default; `transpile` applies it only when you pass it
(`transpile(source, { maxSourceBytes })`), so set it wherever the source comes from someone else.
See [Safe Eval](/safe-eval/).

What fuel costs:

- an atom call: its `cost`, 1 for most atoms;
- an expression node (an operator, a name, a member read): 0.01;
- an allocation: 1 per 20,000 bytes;
- the run's arguments: 1 per 8,000 bytes. Copying them in visits every value, and that walk is
  charged per node at the rate binding the same data costs, which works out higher than a flat
  allocation.

For sizing: one pass of a small `while` loop that updates two variables costs about half a unit,
so the default 1,000 runs about 2,000 such iterations. Measure your own agents with `fuelUsed`
(below) and set the budget with headroom.

Fuel and the heap ceiling answer different questions. Fuel bounds how much a program does over
its lifetime; it says nothing about how much it holds at any moment. A run that builds a 4MB
string pays about 200 fuel for it, well inside a generous budget, and could still be more memory
than you want one agent to hold. So the two are separate limits:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const { ast } = transpile(`
  function big({ n = 1000 }) {
    const s = 'x'.repeat(n)
    return { len: s.length }
  }
`)
const vm = new AgentVM()

const run = await vm.run(ast, { n: 2_000_000 }, {
  fuel: 100_000,
  maxHeapBytes: 1024 * 1024, // 1MB
})
run.error.message
// 'Heap limit exceeded: guest state holds ~4MB, limit 1MB. Fuel bounds total work;
//  this bounds peak memory. Raise it with the maxHeapBytes run option if the workload
//  genuinely needs it.'
run.error.op // 'expr.repeat'
```

The refusal happens before the string exists. `repeat` computes the size of its result from its
arguments (two million UTF-16 characters, about 4MB) and is refused at **the gate**: the check,
made before anything is built, that charges fuel for that size and tests it against the heap
ceiling. The figure in the message is what guest state would hold if the allocation went ahead:
current holdings plus the request.

Nothing is thrown into your code. `vm.run` resolves to `{ result, error, fuelUsed, … }`. On
success `error` is undefined and `result` is what the agent returned. On failure both are the error
value, `{ $error: true, message, op }`, where `op` names the operation that was refused, and
`fuelUsed` is what the run spent.

Arguments are checked before the run begins. A five-million-character string argument, against the
default `argsMaxBytes`, returns `Capability boundary rejected the run arguments: the value exceeds
the 4194304-byte membrane budget`. The **membrane** is the copier every value crossing between host
and guest goes through, and the limit in this message is `argsMaxBytes`: raise that, not
`membraneMaxBytes`. A 100,000-character argument with `fuel: 10` returns `Out of Fuel`, because the
run cannot pay to copy it.

## When a budget refuses

Some refusals are a value the agent can catch with `try`/`catch`; others end the run, even inside a
`try`. In AJS a caught error is a string (its message, capped), not an `Error` object, which is why
the examples below assign `err` directly.

| Refusal | Outcome |
|---|---|
| `fuel` runs out | ends the run (`Out of Fuel`) |
| `timeoutMs` passes | ends the run |
| one atom call passes its own timeout | catchable (`Atom 'x' timed out`) |
| `maxHeapBytes` would be exceeded | catchable |
| a capability's return is over `membraneMaxBytes` or too deep | catchable: the outside world caused it, not a bug in the agent |
| a capability returns something JSON cannot express | ends the run |
| a value going out to a capability is refused (wrong shape, too large, not plain data) | ends the run: the agent built it, so it is the agent's bug |
| `argsMaxBytes`, or arguments the fuel cannot pay to copy | the run never starts |
| a `quotas` limit is reached | catchable (`Quota exceeded for 'x': 1 call allowed`) |

The first example above ends the run only because nothing caught the refusal. The language guide
explains the rule behind this split under ["Catchable, and run-ending"](/DOCS-AJS/).

## Three promises

The budgets rest on three invariants. Tests and source comments refer to them as I1, I2 and I3.

**I1. Nothing allocates before it is charged.** An operation whose allocation depends on runtime
data computes an upper bound from its inputs first, charges fuel for it, and passes the heap gate.
Only then does it allocate. A limit checked afterwards would be too late: `'x'.repeat(5e8)` is one
synchronous native call that asks for 1GB, and no timeout or memory reading can interrupt it once
it starts.

The one bounded exception is a value crossing the capability boundary. The membrane builds its
copy as it reads, so that what it checked is exactly what it forwards, which means the copy's size
is known only once it exists. Instead the copy is built inside a budget fixed in advance, and
charged when complete:

- **Inbound** (an IO atom's return coming into the VM): the budget is `membraneMaxBytes`.
- **Outbound** (an atom's input going out to a capability): `membraneMaxBytes`, or what the
  remaining fuel can pay, whichever is smaller.

So **a crossing can allocate up to `membraneMaxBytes` before it is charged, and no more.** Run
arguments are the same, capped by `argsMaxBytes` and the fuel.

**I2. Every byte that outlives its step is charged where it becomes reachable.** A step is one node
of the program the VM executes: a statement, an atom call. A byte becomes reachable at a bind
(`const x = …`), an in-place insertion (`push`, `fill`, adding to a Set), a `memoize` store, and
when an atom adds to a container it holds (the results array of the `map` atom, which runs a body
once per item).

**I3. Everything that holds guest values while guest code runs is a heap root.** To measure memory,
the VM starts from a known list of holders, the roots, and follows every reference from them;
anything held elsewhere is invisible to it. The roots are scope variables, memo caches, run
arguments, and the containers loop atoms keep while they run their bodies. A holder that is not a
root is memory the ceiling cannot see.

## Refused, not charged: implicit coercion

JavaScript converts an object to a string or a number wherever it wants a primitive: `arr < 5`,
`arr * 2`, `obj[arr]`, `'abc'.includes(arr)`, `Math.max(arr)`, a sort's default comparator. For an
array that conversion is its whole string form, built recursively, and each of those sites was an
allocation the budget did not see. AJS **refuses** them instead of estimating them. No agent
program means them, and refusing keeps the list of places that allocate short enough to check.

```ajs
function tagLine({ tags = ['red', 'green'] }) {
  let refused = ''
  try {
    const attempt = 'tags: ' + tags // refused: tags is an array
  } catch (err) {
    refused = err
  }
  return { refused, line: 'tags: ' + tags.join(', ') }
}
```

`refused` is `'+' needs a string, number, boolean or null, not an array — convert it explicitly
(e.g. arr.join(','), JSON.stringify(obj))`, and `line` is `'tags: red, green'`. This error is
catchable; uncaught, it ends the run with that message.

The rules:

- **Operators** (`+ - * / % ** < > <= >=`, unary `+` and `-`) take strings, numbers, booleans and
  null. Equality (`==`, `===`) never converts in AJS, so it may compare objects, by identity:
  `arr == arr` is true and `arr == [1, 2]` is false.
- **Computed keys** (`obj[k]`) are primitives.
- **Method arguments are primitives**, except where the method uses an argument as a value: it
  stores it, compares it by identity, or copies it. `arr.includes(obj)`, `arr.concat(other)` and
  `Object.keys(obj)` take objects; `'s'.includes(arr)` and `Math.max(arr)` do not. The one object
  a string method accepts is a regex, as a search pattern.
- **A sort with no comparator** compares string forms, so its elements must be primitives:
  `[3, 1, 2].sort()` works, `[[3], [1]].sort()` is refused.

Say what you mean instead: `arr.join(',')`, `JSON.stringify(obj)`, `n.toString()` or `` `${n}` ``
for a number. (`String(n)` as a function call is not available in AJS; the `String` namespace,
`String.fromCharCode`, is.)

## Exact operand types

`'x'.repeat('1e8')`: as a string, the count `'1e8'` is three characters long, and `repeat` reads it
as one hundred million. A budget computed from one reading of an operand, while the method reads
it another way, is no budget. So every method declares, for each **receiver kind** (the type of the
value before the dot: string, array, object, number, Set, Date), the exact type of each argument,
and its bound is computed from those same checked values.

```ajs
function stars({ count = 3 }) {
  const ok = '*'.repeat(count)
  let asText = ''
  let extra = ''
  try {
    const bad = '*'.repeat(count.toString())
  } catch (err) {
    asText = err
  }
  try {
    const bad = 'stars'.slice(0, 1, 2)
  } catch (err) {
    extra = err
  }
  return { ok, asText, extra }
}
```

Returns `{ ok: '***', asText: "repeat()'s argument 1 must be a number", extra: 'slice() takes at
most 2 argument(s)' }`.

- A count is a number. `'x'.repeat('3')` is refused, not converted.
- Arguments past the method's signature are refused.
- A method of one kind is not callable on another: `['x'].toUpperCase()` is `'toUpperCase' is
  not a function`.
- A method with no entry in the VM's table is not callable at all (see [The method
  table](#the-method-table) below).

## What the heap ceiling counts

The VM keeps a running estimate of live memory and checks it at every gated allocation.

- **Bound values.** Binds, insertions and memo stores add to the estimate. Nothing subtracts
  from it, so it is never below what is actually held.
- **In-flight values.** Each executing step has an allocation frame for the intermediates it
  builds, which no variable holds yet. The frame is released when the step ends, or cleared when
  the step binds its result. The result is then counted as bound, and counting it in flight as
  well would double it, refusing a value just over half the ceiling.
- **Reconcile.** When the estimate plus in-flight bytes crosses the ceiling, the VM walks every
  root once, counting shared objects once, and replaces the estimate with that measurement. The
  run fails only if the measurement, plus in-flight bytes and the request, is over the ceiling,
  and the error reports that total. The walk is charged as fuel, so a program that hovers near
  the ceiling and keeps reallocating fails by fuel rather than hanging.

**What it over-counts, on purpose (it fails closed):**

- A long string held under several names counts once per name. A shared string cannot be told
  apart from an equal copy, and counting by value would let distinct equal strings count once.
- A concatenation counts its result in full, although JavaScript engines such as V8 build a rope
  (a lazy concatenation that points at its parts instead of copying them). The engine may flatten
  the rope later, copying it while the parts are still held, and that copy happens outside any
  gate. So `s = s.slice(1) + 'a'` can peak at about twice the string in real memory, which is why
  the VM counts the full result.
- Printing counts a value as a **tree**: see [`tree` bounds](#the-method-table). A structure that
  shares sub-arrays is small in memory and enormous when joined, and the join's bound is the
  printed size.

**What it does not count:** garbage. A value no root reaches and no running step holds belongs to
the JavaScript collector. The promise is about peak *reachable* memory.

## What this means for your atoms

Atoms you define with `defineAtom` run host code, outside the guarantees above unless you keep
them. How to define and register atoms is in [Capabilities and Custom Atoms](/ajs-capabilities/);
these are the budget rules.

**An IO atom (the default, `effects: 'io'`) needs nothing beyond a declared input schema.** Its
input is copied out through the membrane and validated against that schema; its return is copied
in, capped by `membraneMaxBytes`, then charged at the bind like any other value. Return JSON data
plus `Date`, nothing else. `defineAtom` refuses an IO atom with no input schema (use `s.object({})`
for none), and refuses `pattern` or `patternProperties` in it, because those would run the host's
regex engine on guest strings.

An oversized return is caused by the outside world, not by a bug in the agent, so the agent can
catch it. (`s` is from `tosijs-schema`, which `tjs-lang/schema` re-exports. The `atoms` option lets
the transpiler check calls to your atoms: a misspelled input name fails at transpile time instead
of in the run.)

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM, defineAtom } from 'tjs-lang/vm-ast'
import { s } from 'tosijs-schema'

const fetchRows = defineAtom(
  'fetchRows',
  s.object({ count: s.number }),
  s.any,
  async ({ count }, ctx) => ctx.capabilities.rows.list(count)
)
const vm = new AgentVM({ fetchRows })
const rows = {
  list: async (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: `row ${i}` })),
}

const { ast } = transpile(
  `function getRows({ count = 10 }) {
    try {
      const rows = fetchRows({ count })
      return { n: rows.length }
    } catch (err) {
      return { refused: err }
    }
  }`,
  { atoms: vm.atoms }
)
const run = await vm.run(ast, { count: 100_000 }, {
  fuel: 100_000,
  capabilities: { rows },
  membraneMaxBytes: 1024 * 1024,
})
run.result.refused
// "Capability boundary rejected the return of 'fetchRows': the value exceeds the
//  1048576-byte membrane budget"
```

**A pure atom that builds a value from its inputs must charge first.** With `effects: 'pure'`
there is no membrane, so your atom's allocation is unguarded, like `repeat`'s, until it charges.
Compute an upper bound in bytes from the inputs (two bytes per string character) and pass it to
`allocate` before you build anything. `allocate` charges fuel, checks the heap ceiling, and
throws the run's error if either refuses:

```javascript
import { AgentVM, allocate, defineAtom } from 'tjs-lang/vm-ast'
import { s } from 'tosijs-schema'

const repeatText = defineAtom(
  'repeatText',
  s.object({ text: s.string, times: s.number }),
  s.string,
  async ({ text, times }, ctx) => {
    allocate(ctx, text.length * times * 2, 'repeatText') // before, not after
    return text.repeat(times)
  },
  { effects: 'pure' }
)
```

Called as `repeatText({ text: 'ab', times: 1e8 })` under `maxHeapBytes: 1024 * 1024`, the run
fails with `Heap limit exceeded: guest state holds ~381MB, limit 1MB. …` and the string is never
built. Allocate the full size of what you build. `allocate` pays for building the value (I1);
when the agent binds the result, the bind pays for keeping it (I2). Those are two different costs,
and every value pays both.

**An atom that runs guest steps must not hold guest values where the heap walk cannot see
them.** An atom that takes steps as input (a body to run, like `map`'s) runs them through
`createChildScope(ctx)` and `seq`. Anything it keeps in a JavaScript local while those steps run is
invisible to the measurement (I3). Keep it in a variable of the guest scope, or accumulate nothing
until the steps finish.

## Why not ask the runtime how much memory is in use?

`process.memoryUsage()` and its browser cousins cannot do this job:

- **It is after the fact.** `'x'.repeat(5e8)` is one synchronous native call. There is no moment
  between asking for 1GB and having it when a reading could intervene. Only a bound computed from
  the inputs, before the call, can refuse it (I1).
- **It is the whole process, not this run.** A server running many agents, or a page hosting the
  VM, has one heap. A per-run budget cannot be read from it.
- **It counts garbage.** Dead objects stay in the figure until the collector runs, and forcing a
  collection stops the world.
- **It is not portable.** AJS runs in Node, Bun, Deno, workers and browsers, and browsers expose
  almost nothing (`performance.memory` is non-standard; `measureUserAgentSpecificMemory` is
  asynchronous, slow, and needs cross-origin isolation).

**The engine's own limit is the backstop beneath these budgets.** A host running untrusted code
at scale should also give each run an isolation boundary with a hard limit, such as a Node
`Worker` with `resourceLimits: { maxOldGenerationSizeMb }`. The engine enforces that limit, so it
holds even where an estimate is wrong, but it cannot fail gracefully: the worker dies.
`maxHeapBytes` fails the *run*, with an error naming the operation, and leaves the host intact.
Use both. The planned [native VM](/ajs-native-vm/) merges the two, because a wasm instance's
linear memory is a hard, synchronous, per-run cap.

## The doors

Every place a guest program can allocate, and what guards it. A **v2** AST is what the
transpiler writes today; **v1** ASTs come from older code and the fluent builder (see [Atoms: fewer,
thinner](#atoms-fewer-thinner)).

| Door | What allocates | Gate |
|---|---|---|
| Expressions: method calls, builtin functions, `+` | builtin methods and statics, concatenation | the **typed** method table: argument types first, then `allocate()` with a bound computed from those operands |
| Regular expressions | guest patterns and the work of matching them | the VM's own linear engine (`src/vm/regex.ts`), fuel per step; `replace`, `split` and the rest charged exactly |
| Implicit coercion (operators, computed keys, primitive-taking methods) | the string form of an object | **refused** (above) |
| Atoms | data atoms (v1 ASTs only), VM services | data atoms delegate to the same gated primitives; every atom is listed in a test table saying how its allocation is bounded, and a new atom without an entry fails it |
| Capability returns | IO atoms | the membrane (`membraneMaxBytes`), then I2 at the bind |
| Capability inputs (outbound) | the copy of what an IO atom hands a capability | the membrane builds the copy as it reads the value (JSON plus `Date`), inside `membraneMaxBytes` and what the fuel can pay, then charges it through `allocate()`. A refused copy is billed the bytes read before the refusal. A refusal ends the run, so it costs at most one copy attempt per run |
| Run arguments | the copy of `vm.run`'s arguments | `argsMaxBytes` and the run's fuel, then I2 at the bind |
| Binds and insertions | variables, `push` and other mutators, memo stores, loop results | I2 |
| Literals (`[...]`, `{...}`) | proportional to the AST | none needed: the AST's size is bounded before the run is admitted |

### The method table

Every method guest code may call, on every receiver kind (string, array, object, number, the
guest Set and Date, and the namespaces `Array`, `Object`, `JSON`, `String`, `Math`, `Number`),
declares an **allocation class**:

- `none`: allocates nothing proportional to data (`includes`, `indexOf`, `Math.max`, and in-place
  mutators, whose growth I2 charges).
- `const`: the result is bounded by a constant (`toFixed`, a number's `toString(2)`).
- `shallow`: the result is at most a constant times the shallow size of the receiver and arguments
  (`slice`, `concat`, `trim`, `toUpperCase`, `split`, `Object.keys`). Where arguments select a
  range they are used: `slice(0, 10)` of a long string is charged ten characters.
- `tree`: printers and flatteners (`join`, `JSON.stringify`, `flat`, an array's `toString`,
  Schema-from-example) are bounded by the value's size **as a tree**. Every path to a node counts,
  because printing visits every path.
- `bound(fn)`: an explicit bound for amplifiers and products (`repeat`, `padStart`, `padEnd`,
  `join`, `replace`, `replaceAll`, `Array.from`, `Array.of`, `String.fromCharCode`).

`join` is in both of the last two because its result is the printed tree plus one separator per
element, and a long separator can be the larger part.

A guest Set is held as an array of its items (the VM keeps its membership index). To an agent it
behaves as a Set for `has`, `add` and `size`, and `Array.isArray(set)` is true and
`JSON.stringify(set)` prints the items as an array.

Bounds dispatch on the receiver kind wherever one name means different things on different kinds.

The `tree` class is why this program is refused, although its data is a few hundred bytes:

```ajs
function wide({ depth = 6 }) {
  let row = ['abcdefghij', 'abcdefghij', 'abcdefghij', 'abcdefghij']
  let i = 0
  while (i < depth) {
    row = [row, row, row, row, row, row, row, row, row, row]
    i = i + 1
  }
  try {
    return { depth, joined: row.join(',').length }
  } catch (err) {
    return { depth, refused: err }
  }
}
```

Each level holds ten references to the level below, so memory grows by ten pointers per level
while the printed form grows tenfold. At depth 6 `join` would print 44 million characters (10⁶
copies of the four-string row, 11 characters each with its comma; about 88MB), and the run returns
`refused: 'Heap limit exceeded: …'` under the default 64MB ceiling. At depth 2 it returns `joined:
4399`. Getting to the refusal costs about 3,000 fuel, which the doc site provides; under
`vm.run`'s default of 1,000 the run ends with `Out of Fuel` first, which is the other budget doing
its job.

**A method with no entry is not callable.** The list used to be "every method on these
prototypes", which admitted amplifiers by default. Now a method is callable only once its bound is
declared.

**Checked by probing.** `vm-budgets.test.ts` calls every entry on receivers and arguments at
several scales, including the amplifying ones (large counts, long separators, long replacements,
nested arrays), and fails if any result exceeds its declared bound. A table checked only against
itself proves nothing.

## The VM's own regex engine

Guest regexes run on the VM's own engine, never the host's. What that means for an agent:

- It supports classes, `.`, anchors, `\b`, groups (capturing, non-capturing, named), alternation
  and every quantifier, greedy and lazy, with flags `gimsuy`. It refuses backreferences,
  lookaround, `\p{…}` and the `d` and `v` flags.
- A match cannot hang. Shapes that hang a backtracking engine, exponential (`(a+)+$`) and
  polynomial (`a*a*c`), are ordinary work, charged as fuel.
- `replace`, `replaceAll`, `match`, `search` and `split` are implemented by the VM over it and
  charge exactly what they build.
- Regex is deprecated in AJS in favour of [Pattern](/pattern/).

The engine (`src/vm/regex.ts`) is a Pike VM: instead of trying one path and backtracking, it
advances every possible match in lockstep and merges duplicates at each position, so a match takes
time proportional to input × pattern whatever the pattern. A test runs it and native `RegExp` on
the same inputs and requires the same answers.

A schema's `pattern` keyword would run on the host's engine when the schema validates, so a
guest-supplied one is refused.

<details>
<summary>How the regex engine is metered (for VM maintainers)</summary>

Linear is not bounded unless the work is charged. The first version charged one step per thread
per input position and did everything else for free: following zero-width instructions, copying a
thread's captures at every `save`, testing a character against a 400k-entry class, expanding
`(?:){1e12}` during compilation. Each ran for seconds on a few fuel. The engine is now metered by
construction:

- every instruction a thread visits, every capture copy (in proportion to its width), every class
  probe (classes are merged range tables, binary-searched) and every compiled instruction and
  quantifier iteration goes through the caller's `charge`;
- every quantity that grows with the pattern is capped: counts (`{10000}`), nesting depth, program
  size, compile work, capture slots, closure states. One regex's compile is capped at 1M steps
  (about 20ms). Where no run has a fuel budget yet (the transpiler validating literals, the
  predicate verifier), a source gets one compile budget proportional to its length
  (`RegexCompiler`), and each distinct literal is compiled once;
- the parser and compiler charge each allocation as they make it, and every byte allocated also
  counts as compile work, so a pre-run compile budget bounds memory too;
- a compiled regex's program (`regexBytes`) is charged through `allocate` when the regex is built
  and counted by the heap walk wherever it is held. The matching state table belongs to one
  operation, never to the regex;
- worst-case thread memory (`threadBytes`) is charged once per operation;
- `replace` charges each substitution at its exact length, from the template's shape, before
  building it.

Correctness rides on the same structure. Thread deduplication is keyed on the program counter
**and** on which enclosing optional quantifiers began at the current position, because
JavaScript's empty-iteration check makes those part of a thread's future. Case folding uses
equivalence classes derived from the host engine (`regex-folds.ts`, generated and
freshness-tested). Predicates compiled by `compilePredicate` use the same engine, through a
RegExp-protocol adapter (`src/lang/predicate-regex.ts`).

</details>

## Other closed doors

- **Guest values are data.** A guest value is JSON-shaped: a Set is an array of its items (its
  membership index is held by the VM), a Date or regex a frozen plain object of its fields. No
  guest value is a host function or carries a method; method calls dispatch on the receiver's
  kind. This is checked where values enter guest state, inside the same walk that charges binds,
  and an insertion is checked before it happens, so a refused value is never left inside a
  structure.
- **A declared `inputSchema` is validated before the run, on a capped budget.** The transpiler
  derives an agent's `inputSchema` from its parameter examples. Validation runs
  before the run's timer exists, so it is capped at 1M argument paths and 1e8 (schema nodes ×
  paths) steps, about 0.6s, whatever the fuel. Past either, the run is refused with `Arguments too
  large to validate against the inputSchema …`: validate in the host, or pass smaller arguments.
- **Guest schemas are data in a closed dialect.** `Schema.*` returns plain JSON schemas, never a
  library builder whose methods are host closures, and a member read never returns a host
  function. A guest schema may use only admitted keywords, each with exactly its value type, and
  is size-capped. Validation is charged as schema nodes × data nodes before it runs.
- **Only trusted predicate source runs.** A `$predicate` is a JSON-Schema keyword whose value is
  predicate source, a check written as code. A predicate compiles to native JavaScript, which no
  syntactic check makes safe against hostile code, so the `$predicate` paths run only sources the
  host registered with `trustPredicate`.

## Atoms: fewer, thinner

Data atoms (`split`, `join`, `push`, `keys`, `pick`, `omit`, `merge`, `template`, `len`, …) used to
duplicate what the expression evaluator does with method calls, and the transpiler emitted one or
the other depending on syntax: `arr.push(x)` as a statement was an atom, inside an expression a
method call. Two implementations meant two gates to get right, and the atom form escaped
`maxHeapBytes`.

- **v2 ASTs** (what the transpiler writes) emit method calls. One implementation, one gate, and
  JavaScript's semantics.
- **v1 ASTs** (built with the fluent `Agent` builder, or saved by older versions and stored as
  procedures) keep their `op: 'split'` steps, as thin wrappers over the same gated primitives.
- **Atoms remain for what only an atom can do:** control flow, scopes, IO and capabilities, and
  VM services: `memoize` (keep a result in memory), `cache` (keep a result in the store, with a
  time limit), `agentRun` (run another agent) and `runCode` (run AJS source through the host's
  `code` capability).

So `costOverrides` and `quotas` keyed on a data op such as `split` apply to v1 ASTs only. In v2
code a method call is an expression and costs what the evaluator charges.

## Checked by

This section and the next are for VM contributors.

- `src/vm/vm-budgets.test.ts`: the method-table probe; every guest-callable method has an entry;
  the I1 rows (each must fail before it allocates, under a tiny fuel or heap budget).
- `src/vm/rc2-rereview-4.test.ts`: the atom ratchet. Every atom that runs nested steps is listed
  with what it holds.
- `src/vm/heap-reconcile.test.ts`, `src/vm/heap-roots.test.ts`, `src/vm/heap-mutation.test.ts`:
  I2, I3 and the list of mutating methods, through `transpile()` output.
- `src/vm/cost-invariant.test.ts`: every step charges fuel of at least a constant times its work.
- `src/vm/egress-doors.test.ts`, `src/vm/io-atom-schema.test.ts`, `src/vm/membrane-halt.test.ts`:
  every IO atom crosses the outbound membrane, its schema is admitted at definition, and an
  outbound refusal ends the run.
- `src/vm/guest-values.test.ts`, `src/vm/guest-fuzz.test.ts`: every known route by which a host
  function could become a guest value, and generated programs checked against the invariants
  (`vm.run` never throws, no function reaches a result or a capability, wall time tracks fuel).

<details>
<summary>How we got here</summary>

Fuel and `maxHeapBytes` broke the same way five review rounds in a row during 0.14.0-rc.2: each
round found one more place where guest code could allocate or hold memory that no budget saw. Each
patch closed that place and the next review found another. That is the signature of a missing
invariant, not a missing patch, and it is why this chapter states invariants and why the checks
are tests that probe behaviour rather than lists someone must remember to update.

- `'x'.repeat(5e8)` allocated 1GB and only then charged fuel; `Array.from({ length: 3e8 })`
  charged nothing (fifth re-review). This is I1.
- `map`'s results array, held in a JavaScript local, accumulated 94 to 196MB under a 1MB ceiling,
  because each reconcile lowered the estimate to what the registered roots held (fourth re-review).
  This is I3.
- The sixth review found implicit coercion outside the gate; refusing it was decided on
  2026-10-02. The seventh found the general case, a bound computed from a different view of an
  operand than the method reads, which led to the typed method table.
- The eighth review found the regex engine linear but not charged for most of its work. The ninth
  found a compiled regex retaining its matching state table (about 690MB for 1000 held regexes
  under an 8MB ceiling). The eleventh found the regex parser's per-character allocation estimate
  low by about ten times for class escapes; allocations are now charged where they are made.
- Rounds 13 and 14 closed the guest value domain: sealed method wrappers were replaced by plain
  data and per-kind method dispatch, and a stolen schema-builder `validate` that accepted a
  smuggled pattern led to guest schemas being plain JSON in an allowlisted dialect. The
  thirteenth had found an array-valued `pattern` reaching `new RegExp` past a denylist.
- The twelfth review led to `$predicate` running only host-registered source (2026-10-02).
- Rounds 39 to 42 settled the crossing exception to I1. Rounds 40 and 41 also bounded each
  crossing by the heap ceiling, but measured it in the membrane's byte scale rather than the
  heap's, so it refused values that fit, and it reconciled the whole heap on every crossing. That
  was removed in round 42 (cumulative review 16).

The review records are in `docs/reviews/0.14.0-rc.2-*.md`. Read them before changing anything
here: every invariant above exists because its absence shipped.

</details>
