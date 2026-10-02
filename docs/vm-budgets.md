<!--{"parent": "ajs.md", "order": 7}-->

# VM budgets: how fuel and `maxHeapBytes` stay true

AJS runs untrusted code inside the host's JavaScript process, so its budgets are security
promises. **Fuel** bounds work; **`maxHeapBytes`** bounds memory. Both broke the same way, five
review rounds in a row during 0.14.0-rc.2: each round found one more place where guest code
could allocate or hold memory that no budget saw. Each patch closed that place and the next
review found another. That is the signature of a missing invariant, not of a missing patch. This
document states the invariants, names every door they guard, and says how each is checked.
The checks are tests that probe behaviour, not lists someone has to remember to update.

## The invariants

**I1. Nothing allocates before it is charged.** Every operation whose allocation depends on
runtime data computes an upper bound on the bytes it will allocate *from its inputs*, before
allocating. It then charges fuel in proportion and passes the heap gate. `'x'.repeat(5e8)` used
to allocate 1GB and only then charge fuel. `Array.from({ length: 3e8 })` charged nothing at all.
The heap ceiling cannot help with either, because a budget checked after the allocation has
already lost.

**I2. Every byte that outlives the step that allocated it is charged where it becomes
reachable.** That covers a bind, an in-place insertion (`push`, `fill`, a Set's `add`), a
`memoize` store, and a holder's push (`map`'s results).

**I3. Everything that holds guest values across nested guest execution is a heap root.** That
covers scope states, memo caches, run arguments, and the containers loop atoms keep in JS locals.

## How the heap is measured

- **Estimate (bound values).** The estimate only grows. Binds, insertions and stores add to it,
  and nothing refunds it, so it is never below what is bound.
- **Transient (in-flight values).** Each executing step has an allocation frame. Every gated
  allocation in the step adds its bound to the frame, and the frame is released when the step
  ends. This counts intermediates, the values an expression or atom holds while it computes,
  that no root can see. Frames nest: an atom running nested steps keeps its frame for its whole
  duration, so a loop's source array, allocated in the loop's own step, counts for the whole
  loop.
- **Reconcile.** When estimate + transient crosses the cap, the VM walks every registered root
  once (objects deduplicated, every slot a pointer). The estimate becomes that measurement, and
  the run fails only if the measurement plus the transient total exceeds the cap. The error
  reports the measured figure.

**A bind ends a step's in-flight bytes.** When a step binds its value, everything else it
allocated is garbage and the value is now charged as bound, so the step's frame is cleared at the
bind. Otherwise `let a = Array.from({ length: 1e5 })` would count twice and be refused at half
the cap.

**What this deliberately over-counts (fails closed):**
- A long string held under several names is counted once per name. Equal strings cannot be told
  apart from shared ones, and counting by value would let distinct equal strings count once.
- A concatenation counts its result in full, although V8 builds a rope that shares its operands:
  V8 may flatten the rope later, copying its whole length while the operands are still held, and
  that copy happens outside any gate. So the honest peak of `s = s.slice(1) + 'a'` is about
  twice the string, not once.

**What it deliberately does not count:** garbage. A value no root reaches and no active step
holds is the JS collector's to reclaim. Peak *reachable* memory is the promise.

## Refused, not charged: implicit coercion

JavaScript converts an object to a string or number wherever it needs a primitive: `arr < 5`,
`arr * 2`, `obj[arr]`, `'abc'.includes(arr)`, `Math.max(arr)`, `parseInt(arr)`, a sort's default
comparator. For an array that is its whole string form, recursively, so every one of those was
an allocation door the sixth rc.2 review found outside the gate. AJS **refuses** them (Tonio,
2026-10-02) instead of estimating them, because no agent program means them and refusing keeps
the doors enumerable:

- **Operators** (`+ - * / % ** < > <= >=`, unary `+`/`-`) take strings, numbers, booleans and
  null. Equality (`==`, `===`) never converts in AJS, so it may compare objects, by identity.
- **Computed keys** are strings or numbers.
- **Methods take primitives**, except the ones that use an argument as a VALUE (store it, compare
  it by identity, copy it), declared per receiver kind in `STRUCTURAL_ARGS`. The one object a
  string method accepts is a `RegExp`, as a search pattern.

Say what you mean instead: `arr.join(',')`, `JSON.stringify(obj)`, `String(n)` on a number.

## Exact operand types

Refusing coercion closed one door class; the seventh rc.2 review found the general one: **a bound
computed from a different VIEW of an operand than the native method then reads.** `int('1e8')` is
0 to a bound and 100,000,000 to `repeat`; a method exempt from argument checks still converts its
second argument; a model of `replace`'s output counted one `$'` per match where the template had
fifty. So the method table is TYPED: for each receiver kind, each method declares the exact type of
every argument position (`num`, `str`, `pattern`, `any` = used as a value, …), and its bound reads
those same, validated operands. A count must be a number — `'x'.repeat('1e8')` is refused, not
modelled. Arguments past the signature are refused. A method another kind has is not callable on
this one.

## The VM's own regex engine

Guest regexes never run on the host's backtracking engine. `src/vm/regex.ts` is a Pike VM: threads
advance in lockstep and are deduplicated per position, so a match is O(input × pattern) whatever
the pattern, and every step is charged as fuel. Exponential (`(a+)+$`) and polynomial (`a*a*c`)
shapes are ordinary work. It supports classes, `.`, anchors, `\b`, groups (capturing, non-capturing,
named), alternation and every quantifier, greedy and lazy, with flags `gimsuy`; it refuses
backreferences, lookaround, `\p{…}` and the `d`/`v` flags. It is held to native `RegExp` by a
differential test (a corpus plus a grammar fuzz — 152,400 comparisons, zero mismatches when it
landed). `replace`, `replaceAll`, `match`, `search` and `split` are implemented by the VM over it
(`string-methods.ts`) and charge exactly what they build. A schema's `pattern` would run on the
host's engine when it validates, so a guest-supplied one is refused (the library's own are
allowed).

**Linear is not bounded unless the work is charged** (eighth rc.2 review). The first version
charged one step per thread per input position and did the rest for free: following zero-width
instructions, copying a thread's capture array at every `save`, testing a character against a
400k-entry class, expanding `(?:){1e12}` during compilation, allocating per call. Each ran for
seconds on a few fuel. The engine is now metered by construction:

- every instruction a thread visits, every capture copy (in proportion to its width), every
  class probe (classes are merged range tables, binary-searched) and every compiled instruction
  and quantifier iteration goes through the caller's `charge`;
- every quantity that grows with the PATTERN is capped — counts (`{10000}`), nesting depth,
  program size, compile work, capture slots, closure states. One regex's compile is capped at
  1M steps (~20ms). Where no run has a fuel budget yet — the transpiler validating literals, the
  predicate verifier — a SOURCE gets one compile budget proportional to its length
  (`RegexCompiler`), and each distinct literal is compiled once (ninth review M2);
- **allocation is work, and is charged where it is made**: the regex parser and compiler charge
  each allocation through `alloc` as they make it (no per-character estimate: a flat one missed
  class escapes by ~10×, eleventh review M1), and every byte allocated also counts as compile
  work, so a pre-run `RegexCompiler`'s single work budget bounds memory too;
- **the guest value domain is closed**: a guest value is data or a VM wrapper, never a host
  function or builtin namespace — enforced where values are PRODUCED (`evaluateExpr` →
  `guestValue`; dot-path reads), with method calls dispatched to the receiver kind's intrinsic and
  wrapper methods sealed (fifteenth review B1). `guest-values.test.ts` tries every route;
- **guest `Schema` is data, and a method is never a value**: guest code holds only plain JSON
  schemas (`Schema.*` constants and VM-implemented constructors), never a library builder whose
  methods are host closures, and a member read never returns a host function (fourteenth review
  B1: a stolen builder `validate` validated against a smuggled pattern). Validation is charged as
  schema nodes × data nodes before it runs, at every door;
- **guest schemas are a closed dialect**: `admitGuestSchema` is an ALLOWLIST — a plain JSON tree
  using only admitted keywords, each with exactly its value type (derived from what tosijs-schema
  enforces), capped in size because it can run before fuel exists. It runs at every door a guest
  schema reaches validation (Schema.* and `filter` arguments after example conversion, the AST's
  `inputSchema`, a `return` step's schema, an LLM `responseFormat`). A denylist of value shapes
  failed in front of a library that coerces: an array `pattern` reached `new RegExp` (thirteenth
  review B1);
- **only trusted predicate source runs**: a predicate compiles to native JavaScript, which no
  syntactic screen makes safe against hostile code, so the `$predicate` paths run only sources
  the host registered (`trustPredicate`) — twelfth review, Tonio 2026-10-02;
- **predicates cannot hand a string to the host's regex engine**: a pattern argument to
  `match`/`search`/`matchAll` must be a regex literal, a string literal (compiled by the metered
  engine, as JavaScript would compile it), or a `const` bound to a regex literal (eleventh
  review B1);
- **retained memory is charged where it is created**: a compiled regex holds its program
  (`regexBytes`), charged through `allocate` when the regex is built and counted by the heap walk
  wherever it is held. The matching state table belongs to one operation, never to the regex
  (keeping it on the regex retained ~690MB for 1000 held regexes under an 8MB ceiling — ninth
  review B1);
- worst-case thread memory (`threadBytes`) is charged once per operation, through `allocate`;
- `replace` charges each substitution at its exact length, from the template's shape, before
  building it.

Correctness rides on the same structure: thread deduplication is keyed on the pc **and** on which
enclosing optional quantifiers began at the current position, because JavaScript's empty-iteration
check makes those part of a thread's future (pc alone diverged on nested quantifiers over
empty-matchable bodies). Case folding uses equivalence classes derived from the host engine
(`regex-folds.ts`, generated and freshness-tested). Predicates compiled by `compilePredicate` use
the same engine, through a RegExp-protocol adapter (`src/lang/predicate-regex.ts`).

## The doors

| Door | What allocates | Gate |
|---|---|---|
| Expression evaluator: `methodCall`, `call`, `+` | builtin methods and statics, global builtins, concatenation | the **typed** method table (`methodGate`): argument types, then `allocate()` with a bound from those operands |
| Regular expressions | guest patterns and their work | the VM's own linear engine (`regex.ts`), fuel per step; `replace`/`split`/… charged exactly |
| Implicit coercion (operators, computed keys, primitive-taking methods) | the string form of an object | **refused** (above) |
| Atoms | data atoms (v1 ops only; see below), VM services | data atoms delegate to the same gated primitives; every atom is listed in a ratchet table with its allocation story |
| Capability returns | io atoms | the membrane (`membraneMaxBytes`), then I2 at the bind |
| Binds and insertions | `setStateVar`, `accountMutation`, memo stores, holder pushes | I2 |
| Literals (`[...]`, `{...}`) | O(AST size), bounded by admission | none needed: the AST is already budgeted |

### The method table

Every method guest code may call, on every receiver kind (string, array, object, number, the
guest Set and Date wrappers, and the builtin namespaces `Array`, `Object`, `JSON`, `String`,
`Math`, `Number`), declares an **allocation class**:

- `none`: allocates nothing proportional to data (`includes`, `indexOf`, `Math.max`, in-place
  mutators, whose growth is I2's).
- `const`: the result is bounded by a constant (`toFixed`, `toString(2)` on a number).
- `shallow`: the result is at most *c* × the shallow size of the receiver and arguments (`slice`,
  `concat`, `trim`, `toUpperCase`, `split`, `Object.keys`).
- `tree`: printers and flatteners (`join`, `JSON.stringify`, `flat`, array `toString`,
  Schema-from-example) are bounded by the value's size **as a tree**: every path to a node is
  counted, because printing visits every path. Memory size counts a shared object once; a
  ten-wide, eight-deep DAG of shared arrays is a few KB in memory and 400M characters when
  joined. Cycles are not followed, and the walk stops past the cap.
- Bounds dispatch on the **receiver kind** (string, array, Set, Date wrapper, namespace) wherever
  a name means different things (`union`, `diff`, `add`), and use the **arguments** where they
  select a range (`slice(0, 10)` of a long string is charged ten characters).
- `bound(fn)`: an explicit bound for amplifiers and products (`repeat`, `padStart`, `padEnd`,
  `join`, `replace`, `replaceAll`, `Array.from`, `Array.of`, `String.fromCharCode`).

**A method with no entry is not guest-callable.** The allowlist used to be "every method on
these prototypes", which admitted amplifiers by default. Now admission requires a declared bound.

**Checked by probing.** `vm-budgets.test.ts` calls every table entry on receivers and arguments at
several scales, including the amplifying dimensions: large counts, long separators, long
replacements and nested arrays. It fails if any result exceeds its declared bound. A table that
is only consistent with itself proves nothing, which is how `push is the only mutator` stayed
true in a comment and false in the code.

## Atoms: fewer, thinner

Data atoms (`split`, `join`, `push`, `keys`, `pick`, `omit`, `merge`, `template`, `len`, …)
duplicated what the evaluator does through `methodCall`. The transpiler emitted one or the
other depending on syntax: `arr.push(x)` as a statement was an atom, inside an expression it was
a method call. Two implementations meant two budget gates to get right. The statement form
escaped `maxHeapBytes`; the atom returned the array where JavaScript returns the length.

- **v2 ASTs** (the transpiler) emit `methodCall` for method calls. There is one implementation,
  one gate, and JavaScript semantics.
- **v1 ASTs** (the fluent builder, persisted procedures) keep their `op: 'split'` steps. Those ops
  remain, as thin wrappers over the same gated primitives.
- **Atoms remain for what only an atom can do:** control flow, scopes, IO and capabilities, and
  VM services (`memoize`, `runCode`, `agentRun`, `cache`).

Consequence: `costOverrides` and `quotas` keyed on a data op such as `split` apply to v1 ASTs only.
For v2 code a method call is an expression and costs what the evaluator charges.

## Why not just ask the runtime?

`process.memoryUsage()` and its browser cousins cannot do this job, and the reason is not
asynchrony:

- **It is after the fact.** `'x'.repeat(5e8)` is one synchronous native call. No moment exists
  between asking for 1GB and having it where a reading could intervene, and no timeout can
  interrupt it either. By the time the number moves, the host may already be gone. Only a bound
  computed from the inputs, before the call, can refuse it (I1).
- **It is the whole process, not this run.** A server running many agents, or a page hosting the
  VM, has one heap. A per-run budget cannot be read off it.
- **It counts garbage.** Dead objects stay in the figure until the collector runs, and forcing a
  collection stops the world.
- **It is not portable.** AJS runs in Node, Bun, Deno, workers and browsers. Browsers expose
  almost nothing (`performance.memory` is non-standard; `measureUserAgentSpecificMemory` is async,
  slow, and needs cross-origin isolation).

**The runtime's real role is the floor under these budgets.** A host running untrusted code at
scale should also give each run an isolation boundary with a hard limit, such as a Node `Worker`
with `resourceLimits: { maxOldGenerationSizeMb }`. That limit is enforced by the engine, so it
holds even where an estimate is wrong. What it cannot do is fail gracefully: the worker dies.
`maxHeapBytes` is the budget that fails the RUN, with an error naming the operation, and leaves
the host and the rest of the program intact. Use both. The native VM direction
(`docs/ajs-native-vm.md`) eventually merges them, because a wasm instance's linear memory is a
hard, synchronous, per-run cap.

## Checked by

- `src/vm/vm-budgets.test.ts`: the method-table probe; every guest-callable method has an entry;
  the I1 rows (each must fail before it allocates, under a tiny fuel or heap budget).
- `src/vm/rc2-rereview-4.test.ts`: the atom ratchet. Every atom that runs nested steps is listed
  with what it holds.
- `src/vm/heap-reconcile.test.ts`, `src/vm/heap-roots.test.ts`, `src/vm/heap-mutation.test.ts`:
  I2, I3, and the mutator list, through `transpile()` output.
- `src/vm/cost-invariant.test.ts`: every step charges fuel ≥ c × work.

## History

The rc.2 review series is in `docs/reviews/0.14.0-rc.2-*.md`. Read it before changing anything
here. Every invariant above exists because its absence shipped.
