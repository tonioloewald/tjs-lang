<!--{"parent": "ajs.md", "order": 6, "book": ["default"]}-->
<!-- TODO review -->

# AJS Native VM (Rust → wasm): the planned 1.0 VM

This is a design note, not a guide: it records the plan for a second AJS VM, written in Rust and
compiled to WebAssembly, that is meant to replace the JavaScript VM on the untrusted path for 1.0.
Nothing described here ships today.

"The untrusted path" means every place the VM runs code its host did not write: `vm.run` on a
guest AST (`tjs-lang/vm` and `tjs-lang/vm-ast`), `Eval` and `SafeFunction` (`tjs-lang/eval`, the
safe replacements for `eval` and `new Function`), on the client and on the server.

## What this means for you today

If you embed the VM, four things follow from this plan:

- **Stored ASTs stay runnable.** Every AST carries a format version at its root, `$ajs` (see
  [constraint 2](#2-version-the-ast)). The native VM is planned to read both formats in use, v2
  (what the transpiler writes) and v1 (what the builder writes, and every AST with no `$ajs`
  field), so persisting ASTs is safe.
- **Custom atoms return plain data.** An atom must return JSON data plus `Date`, never a host
  object or function. Since 0.14 the membrane (the copy-and-check step every value goes through
  between host and guest) already refuses anything else, so an atom's return values will not
  break on the native VM. How a host registers and calls atoms there is not settled yet; see
  [Open questions](#open-questions).
- **Prefer `tjs-lang/vm-ast`.** It takes an AST and contains no parser, so no source text, and no
  parser defect, ever reaches the sandbox. The native VM implements that same contract; see
  [the next section](#relationship-to-tjs-langvm-ast).
- **Plan for CSP.** If you run under a strict Content Security Policy, `script-src` will need
  `'wasm-unsafe-eval'` once the native VM lands; see [Known regression: CSP](#known-regression-csp).

## Relationship to `tjs-lang/vm-ast`

`tjs-lang/vm-ast`, shipped in 0.14.0, is the first step of this plan, taken for independent
reasons. It is the AST-only VM: no parser and no acorn, 137 KB raw against 324 KB for
`tjs-lang/vm` (`dist/tjs-vm-ast.js` vs `dist/tjs-vm.js`, unminified, measured 2026-11-06). It
already makes **"the VM accepts an AST, not source"** a supported contract with real consumers.
The Rust VM would implement that contract rather than a new one, which removes the riskiest part
of a swap: persuading callers to change how they invoke the VM.

## Status

**Decided: critical path for 1.0, after 0.14 ships and Pattern lands** (Pattern is the planned
replacement for regex in AJS, a grammar built as data; see [Pattern](/pattern/)). The JS VM
finishes 0.14; the Rust/wasm VM is the next VM workstream, with the JS VM as its conformance
reference until it replaces it on the untrusted path.

**Why now:** in a VM written in JavaScript and running inside JavaScript, every host builtin a
guest can reach does work the VM did not do itself: type coercion, `structuredClone`,
`JSON.stringify`, the host regex engine. Each one has to be found, given a size limit and charged
fuel, one at a time; and guest values that are host objects bring prototypes, getters and live
references in both directions. Reviews kept finding one more such place, and each fix exposed a
variant of itself (most blockers in the thirty-one 0.14.0-rc.2 review rounds were
this one class). That is the second of the [triggers](#triggers-for-making-this-critical-path)
below, and it has fired. In wasm the VM owns its allocator and its value representation, so
"charged before it allocates" and "nothing live crosses" hold for the whole VM at once, and the VM
is isolated from ordinary JavaScript.

Expected side benefit: throughput, because metering stops being a check at every one of those
places. To be measured in the phase-1 spike against the JS VM, not assumed: capability crossings
and string conversion at the boundary cost something the JS VM does not pay.

**Why not go native for TJS too?** That would mean forking V8 or JavaScriptCore, and it is
decided against. TJS works within the JavaScript ecosystem and influences it; it does not replace
it. AJS is different: it is the untrusted-code path, and that is where a second implementation
earns its keep.

## Thesis

Executing the AST natively, with no JavaScript invoked at all, removes whole classes of sandbox
risk rather than mitigating them. A Rust VM compiled to wasm can run in the browser, Bun, Node,
wasmtime and Postgres, and can serve as the client-side engine for `Eval`/`SafeFunction`. So the
end state is **one VM**, not two, unless a JS fallback is kept for strict CSP
([see below](#known-regression-csp)).

## What changes categorically

- **No JS object model in the guest.** Guest values live in an arena the host never shares: no
  prototype chain, no getters, no `__proto__`/`constructor`/`prototype` blocklist. Today the
  membrane inspects each property descriptor of a host value to build its copy; in the native VM
  a value crosses as an encoded byte buffer the VM decodes into its own arena, so nothing else can
  cross. The encoding is not chosen yet (see [Open questions](#open-questions)).
- **Parser leaves the trust path.** The VM accepts only ASTs. The 0.13.7 class of bug cannot
  recur: transpiling untrusted source ran part of it, because a `test` block in the source was
  executed with `new Function` while the AST was being built (see CHANGELOG.md, 0.13.7). With no
  parser in the VM, the attack surface is the AST validator plus the interpreter.
- **ReDoS stays gone as a category.** Since 0.14 the JS VM runs guest regexes on its own
  linear-time engine (`src/vm/regex.ts`); the native VM keeps that property with a linear Rust
  engine (`regex`/`regex-lite`) instead of a port.
- **JS-engine JIT bugs no longer apply to guest execution.** Today guest programs drive the host
  engine's JIT-compiled code, so a bug in V8's or JavaScriptCore's JIT is reachable from a guest,
  and nothing in the JS VM defends against it. Under the native VM, guest execution is wasm.

## What merely moves

- Capabilities still cross into a JS host; the boundary shrinks to a byte buffer but remains.
- Timing side channels: still shared-process. Only process isolation addresses these.
- **Memory safety is the trade to watch.** JS gave it for free. The VM must be Rust with `unsafe`
  forbidden, compiled to wasm so the wasm sandbox catches what the Rust misses. C/C++ would swap
  JIT bugs for buffer overflows, which is worse.

## Known regression: CSP

`WebAssembly.instantiate` is blocked under a strict `script-src` unless `'wasm-unsafe-eval'` (or
`'unsafe-eval'`) is granted. `Eval` exists so that you never have to grant `'unsafe-eval'`; the
native VM needs the narrower `'wasm-unsafe-eval'` instead. Whether to document that requirement
or keep the JS VM as a fallback for locked-down contexts is an [open question](#open-questions).

## Architecture sketch

- **Input:** versioned JSON AST only, v1 and v2. No source. Validation before execution.
- **Execution:** resumable step machine. On a capability call the VM returns
  `{ suspended, atom, args }`; the host awaits the capability and calls `resume`. This avoids
  JSPI and asyncify (the wasm mechanisms that let wasm code wait on a JavaScript promise), so
  behaviour is identical on every host. A suspended VM is also serializable: it can be
  checkpointed, migrated and replayed, which suits the [flight recorder](/error-history/) (the
  runtime's record of what went wrong, kept for after the fact).
- **Fuel, quotas, heap ceiling, depth caps (call depth, membrane nesting, schema nesting),
  trace:** ported as they are; semantics must match the JS VM exactly (see
  [the two-VM hazard](#the-two-vm-hazard)).
- **Atoms:** pure core atoms (`seq`, `varSet`, arithmetic and the rest) are implemented inside the
  Rust VM. IO atoms, the core ones (`httpFetch`, the store and LLM atoms) and every custom atom,
  are host capabilities behind schemas: the VM suspends, the host runs them, and only data
  crosses. Nothing may assume a shared heap.
- **tosijs-schema:** atom I/O validation moves into Rust. A schema can carry a `$predicate`, AJS
  code that decides whether a value is valid (see the
  [type-system north star](/type-system-north-star/)), so validating a value can mean running
  AJS: the VM hosts the validator, which hosts the VM. Natural in Rust, but it means a Rust
  implementation of tosijs-schema's core comes along. Scope this before starting; it is the
  largest hidden chunk.
- **String semantics:** a single VM gets to define them, so UTF-16 `.length` quirks need not
  survive. They can change only once the JS VM is retired from the untrusted path, or under a new
  AST version; until then the two VMs must agree (see the open question on strings).

## Estimates

| Component                                                  | Rust lines          |
| ---------------------------------------------------------- | ------------------- |
| AST deserializer + validator                               | 1–2k                |
| Value model, arena, per-key heap accounting                | 2–3k                |
| Interpreter core, expressions, operator semantics          | 2–4k                |
| Fuel, quotas, depth caps, tracing, suspend/resume          | 1–2k                |
| Builtins (Array/Object/String/Number/Math/JSON/Set/Schema) | 3–5k                |
| Date subset                                                | 1–2k                |
| tosijs-schema core                                         | 3–6k                |
| Host boundary, membrane, atom registry                     | 1–2k                |
| **Total**                                                  | **~15–30k + tests** |

Reference: QuickJS is ~55k lines of C for full ES2020. AJS forbids most of what makes engines
large.

**Binary:** 150–300 KB gzipped is realistic, roughly 3–7× today's `tjs-vm-ast.js`. Today,
measured 2026-11-06 with `gzip -9` on `dist/`: 43 KB for `tjs-vm-ast.js`, 63 KB for
`tjs-eval.js`, 98 KB for `tjs-vm.js`. The floor is ~120 KB with `opt-level = "z"`,
`panic = "abort"`, LTO, `wasm-opt`, `regex-lite`, a hand-rolled Date subset and an ASCII fast path
for Unicode. Careless choices (full `regex`, `chrono`, ICU-style tables) land at 500+ KB. Whether
the growth is acceptable is for the phase-1 spike to measure; what it buys is the removal of the
risk classes above.

**Effort:** the interpreter core is weeks. Builtins, the schema validator and conformance are the
long tail: months, and mostly specification work.

## The two-VM hazard

While both VMs exist, semantic divergence is a **security bug**, not a compatibility bug. For
example: a schema that limits a string's length is checked on the client by one VM and enforced on
the server by the other. If the two count length differently (UTF-16 units against code points),
a value can pass one check and fail the other, so what the client validated is not what the
server enforces. Fuel costs, error shapes, monadic error values, heap accounting and membrane
behaviour must agree exactly. Once the Rust VM reaches parity it becomes the reference; the JS VM
is either held to the conformance suite or retired from the untrusted path.

## Constraints on 1.0 (cheap now, expensive later)

These are the only things the initial release must do to keep this option open. Status is as of
0.14.0.

| #   | Constraint                                       | Status           |
| --- | ------------------------------------------------ | ---------------- |
| 1   | Do not document JS builtin behaviour as AJS's    | Partly satisfied |
| 2   | Version the AST                                  | Done (0.14.0)    |
| 3   | Keep custom atoms opaque to the guest            | Satisfied        |
| 4   | Accumulate golden fixtures                       | Started (0.14.0) |
| 5   | Do not promise that a variable may change type   | Open             |
| 6   | Refuse JS constructs that cost the VM complexity | Open             |
| 7   | No ambient time or randomness                    | Done (0.14.0)    |

### 1. Do not document JS builtin behaviour as AJS behaviour

[The language guide](/DOCS-AJS/) promises little about builtins, but it now documents the regex
flavour (the VM's linear engine: no backreferences or lookaround, a fixed flag set). That is a
conformance obligation the native VM must meet, and a linear Rust engine can. Keep the rest
unpromised: anything said about string `.length`, Date formatting or number-to-string becomes an
obligation too.

### 2. Version the AST

The root carries `$ajs`, for example `{"$ajs":2,"op":"seq",…}`. `src/vm/ast-version.ts` is the
single source, and the VM refuses a version it cannot read. The timeline: before 0.14.0 no AST had
the field; 0.14.0 introduced it, with "absent means 1" as the rule for older ASTs, and in the same
release shipped v2 (bare strings always literal, explicit references, `varAssign`, block-scoped
`while`). The transpiler writes `$ajs: 2`; the builder writes an explicit `$ajs: 1`; the VM reads
both by version. Tests check that every producer stamps the field and every boundary refuses an
unknown version.

The rule this leaves: **never change the AST format without bumping the version.** "Absent means
1" is unambiguous only because the field arrived before the format first changed; a format change
without a version bump would make an AST's meaning unknowable.

### 3. Keep custom atoms opaque to the guest

Satisfied structurally. Every `effects: 'io'` return crosses a membrane that builds its own copy
of JSON data plus `Date` and refuses functions, accessors and every other kind, so nothing can
leak a reference that assumes a shared heap. This is a property of the membrane, not a convention,
so it cannot rot.

### 4. Accumulate golden fixtures

`src/vm/ast-fixtures/v2.json` (source → exact emitted AST → result) and `v1.json` (hand-written v1
ASTs → the results they must keep producing), checked by `src/vm/ast-fixtures.test.ts`. They
caught, by mutation, an `m[i]` regression the rest of the suite missed. Every fix to AST semantics
should add one.

### 5. Do not promise that a variable may change type

A direction, not yet a rule. If a variable's type is fixed at its initializer (`let n = 0` is a
number for its life; a Set of strings holds strings), every method resolves at transpile time and
a native VM can store values in slots of known type instead of tagging every value with its type.
External data (arguments, capability returns) would need an escape type, `json` (any JSON value),
narrowed by schema validation before use. Cheap to keep open now: nothing documents re-typing a
variable, and the guest value domain is already closed data. Expensive later: once programs that
re-type variables are persisted, the rule can only arrive as a new AST version. (Card #2788.)

### 6. Refuse JS constructs that cost the VM complexity or surface

A direction. These are constructs JavaScript linters already ban as bad practice, and every one a
VM must implement is conformance surface for the native one: `for…in`/`in` (prototype walks),
`var`/hoisting/`arguments`, accessors and `__proto__` in literals, sparse arrays, `delete`, the
comma operator, labels, `switch` fallthrough. The transpiler, which can see the construct, would
refuse each with an error naming what to write instead. (Card #2789.)

### 7. No ambient time or randomness

The guest reads the clock and the random source only through capabilities the host grants:
`capabilities.clock` (`now()`) and `capabilities.random` (`next()`), behind `Date.now()`,
`Date()` with no argument, `Math.random()`, `random` and `uuid` (#4091, 0.14.0). The first
native host, a 3D engine (native tosi-3d), needs to inject its own simulation clock, and a VM
that read the host's clock directly would make that impossible. Deciding this before the native
VM exists keeps the two VMs one contract: neither has ambient time, and a run with a recorded
clock and a seeded source replays exactly on either.

## Phases

0. **Now (no cost):** the constraints above. A short AST specification is to be written as the
   format stabilises; it does not exist yet.
1. **Spike:** Rust interpreter for the core atoms and expressions, no builtins, driven by the
   golden fixtures. Measure wasm size and suspend/resume ergonomics. Kill or continue.
2. **Parity:** builtins, Date subset, regex, tosijs-schema core. Full conformance against the JS
   VM. Resolve string semantics.
3. **Swap:** the Rust VM becomes the `Eval`/`SafeFunction` engine on the client and the VM on the
   server. The JS VM is retired from the untrusted path, or kept strictly as a CSP fallback held to
   the conformance suite.
4. **Hosts:** a wasmtime binary; Postgres via pgrx (the Rust framework for writing Postgres
   extensions), so logic travels to the data, literally; anything else that appears.

## Triggers for making this critical path

The second one fired in 0.14.0-rc.2 (see [Status](#status)). Kept for the record.

- [Universal endpoints](/universal-endpoint/) want predicates executed inside Postgres.
- A sandbox issue that is structural to JS-in-JS rather than a bug.
- A consumer needing AJS without a JS host (embedded, edge runtime without JS, agent-local
  execution).

## Open questions

- CSP: document `'wasm-unsafe-eval'` as a requirement, or keep a JS fallback (two VMs, with the
  hazard above)?
- Host API for atoms: does `defineAtom` stay as it is, and is the suspend/resume loop hidden
  behind the same `vm.run` promise? The intent is that embedders do not change how they call the
  VM, but this is not designed yet.
- Boundary encoding: what byte format values cross in (JSON text, or a binary encoding).
- Regex engine: `regex-lite` (small, linear) or full `regex` (Unicode classes, larger)?
- Date: which subset is actually promised?
- String semantics: code points, UTF-8 bytes, or JS-compatible UTF-16 units?
- How much of tosijs-schema must be in Rust for atom I/O: all of it, or a core subset with the
  rest host-side?
- Errors as values instead of `try`: see the proposal below.

### Proposal: errors as values instead of `try` (AST v3, undecided)

Today AJS has `try`/`catch`, as [the language guide](/DOCS-AJS/) teaches, and nothing here changes
that until a decision is made and a new AST version ships.

Inside, the VM is already monadic: once an error is set on the run, the remaining steps are
skipped, and `try` is the one node that clears it. That is exception semantics built without
`throw`. The alternative is two clean classes:

- a recoverable failure becomes an error VALUE bound to the call's result, and the guest checks
  it with a guest builtin (name to be decided; not TJS's deprecated `isError`);
- a fatal one (capability-boundary refusal, fuel, heap, timeout) HALTS the run, which 0.14.0
  already does for refusals.

It removes a control construct from the AST and the step machine (no unwinding, no catch scope),
makes errors data, and matches TJS's `MonadicError`. What it needs:

- a propagation rule for an error value used as an atom input, operand, member or method receiver
  (propagate, as TJS does, or refuse);
- a new kind in the closed guest value domain (`guest-values.test.ts`);
- a format version, since v1 and v2 ASTs contain `try`;
- a decision on `try`/`catch` in AJS source: lower it in the transpiler to result checks, or
  refuse it with an instructive error. Models write `try`/`catch` reflexively, so the deciding
  measure is the grokkability lane's repair rate (how often a small model's AJS needs fixing
  before it runs; #2809).

## Decision log

The 1.0 critical-path decision, the decision against a native TJS runtime and the errors-as-values
proposal are Tonio's, 2026-10-04; constraints 5 and 6 are his, 2026-10-02.
