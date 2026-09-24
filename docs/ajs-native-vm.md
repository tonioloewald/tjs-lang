# AJS Native VM (Rust → wasm) — post-1.0 direction

**Status:** design note, not critical path. Nothing here blocks the 1.0 language release.
**Purpose:** a long-term answer to VM robustness and safety. Revisit when a trigger (below) fires.
**Decided against:** a native TJS runtime (forking V8/JSC). TJS works within the JS ecosystem and
influences it; it does not replace it. AJS is different — it is the untrusted-code path, and that
is where a second implementation earns its keep.

## Thesis

Executing the AST natively, with no JavaScript invoked at all, removes whole classes of sandbox
risk rather than mitigating them. A Rust VM compiled to wasm can run in the browser, Bun, Node,
wasmtime and Postgres, and can serve as the client-side `Eval`/`SafeFunction` engine — so the end
state is **one VM**, not two.

## What changes categorically

- **No JS object model in the guest.** Guest values live in an arena the host never shares: no
  prototype chain, no getters, no `__proto__`/`constructor`/`prototype` blocklist. The membrane
  becomes byte-copying by construction instead of descriptor-walking.
- **Parser leaves the trust path.** The VM accepts only ASTs. The 0.13.4 class of bug
  (transpile-time execution of untrusted source) cannot recur; attack surface = AST validator +
  interpreter.
- **ReDoS is gone as a category** with a linear-time regex engine (Rust `regex`/`regex-lite`),
  replacing pattern-rejection heuristics.
- **JS-engine JIT bugs** (currently declared out of scope) no longer apply to guest execution.

## What merely moves

- Capabilities still cross into a JS host; the boundary shrinks to a byte buffer but remains.
- Timing side channels: still shared-process. Only process isolation addresses these.
- **Memory safety is the trade to watch.** JS gave it for free. The VM must be Rust with `unsafe`
  forbidden, compiled to wasm so the wasm sandbox catches what the Rust misses. C/C++ would swap
  JIT bugs for buffer overflows — worse.

## Known regression: CSP

`WebAssembly.instantiate` is blocked under strict `script-src` unless `'wasm-unsafe-eval'` (or
`'unsafe-eval'`) is granted. This is a milder version of the problem `Eval` exists to avoid.
Decide deliberately: either document the requirement, or keep the JS VM as a fallback for
locked-down contexts (which is two VMs again, with everything that implies below).

## Architecture sketch

- **Input:** versioned JSON AST only. No source. Validation before execution.
- **Execution:** resumable step machine. On a capability call the VM returns
  `{ suspended, atom, args }`; the host awaits and calls `resume`. No JSPI/asyncify dependence,
  identical behaviour on every host, and a suspended VM is serializable — checkpoint, migrate,
  replay. Fits the flight-recorder design.
- **Fuel / quotas / heap ceiling / depth cap / trace:** ported as-is; semantics must match the JS
  VM exactly (see conformance).
- **Atoms:** core atoms remain host capabilities behind schemas. Custom atoms are opaque to the
  guest — nothing may assume a shared heap.
- **tosijs-schema:** atom I/O validation moves into Rust. Schemas embed AJS predicates, so the VM
  hosts the validator which hosts the VM. Natural in Rust, but it means a Rust implementation of
  tosijs-schema's core comes along. Scope this before starting; it is the largest hidden chunk.
- **String semantics:** with one VM we define them. UTF-16 `.length` quirks need not survive.

## Estimates

| Component                                                | Rust lines           |
| -------------------------------------------------------- | -------------------- |
| AST deserializer + validator                             | 1–2k                 |
| Value model, arena, per-key heap accounting              | 2–3k                 |
| Interpreter core, expressions, operator semantics        | 2–4k                 |
| Fuel, quotas, depth cap, tracing, suspend/resume         | 1–2k                 |
| Builtins (Array/Object/String/Number/Math/JSON/Set/Schema) | 3–5k               |
| Date subset                                              | 1–2k                 |
| tosijs-schema core                                       | 3–6k                 |
| Host boundary, membrane, atom registry                   | 1–2k                 |
| **Total**                                                | **~15–30k + tests**  |

Reference: QuickJS is ~55k lines of C for full ES2020. AJS forbids most of what makes engines
large.

**Binary:** 150–300 KB gzipped realistic (today: 32 KB eval, 66 KB VM). Floor ~120 KB with
`opt-level = "z"`, `panic = "abort"`, LTO, `wasm-opt`, `regex-lite`, hand-rolled Date subset,
ASCII-fast-path Unicode. Careless choices (full `regex`, `chrono`, ICU-style tables) land at 500+.

**Effort:** interpreter core is weeks. Builtins, schema validator and conformance are the long
tail — months, and mostly specification work.

## The two-VM hazard

While both VMs exist, semantic divergence is a **security bug**, not a compatibility bug: a
predicate accepted by one and enforced by the other is a hole. Fuel costs, error shapes, monadic
error values, heap accounting and membrane behaviour must agree exactly. Once the Rust VM reaches
parity it becomes the reference; the JS VM is either held to the conformance suite or retired
from the untrusted path.

## Constraints on 1.0 (cheap now, expensive later)

These are the only things the initial release must do to keep this option open.

**Audited 2026-09-19 against the current tree** — two are already satisfied, two are not, and the
ordering of that matters more than the list:

| # | constraint | status |
| - | ---------- | ------ |
| 1 | Do not document JS builtin behaviour as AJS behaviour | **largely satisfied.** `DOCS-AJS.md` promises almost nothing about builtins — the only `.length` is inside an example, and regex is described by intent ("suspicious patterns are rejected") rather than by flavour. Keep it that way; anything promised about `.length`, Date formatting, regex flavour or number-to-string becomes a conformance obligation. |
| 2 | **Version the AST** | ✅ **done 0.14.0.** Root is `{"$ajs":1,"op":"seq",…}`; `src/vm/ast-version.ts` is the single source and the VM refuses a version it cannot read. Enforced at both ends: **every producer stamps** (`ast-version-producers.test.ts` — the builder was found unstamped, which would have kept the unversioned population growing) and **every boundary refuses** (`ast-version-boundaries.test.ts`). See the correction below on when this would have become expensive. |
| 3 | Keep custom atoms opaque to the guest | **satisfied structurally.** Every `effects: 'io'` return crosses `structuredClone` and the pre-walk rejects functions and accessors, so nothing can leak a reference that assumes a shared heap. This is a membrane property, not a convention, so it cannot rot. |
| 4 | Accumulate golden fixtures | ❌ **not started.** `test-data/` holds only vision-test JPEGs. Every #52-class fix should get an AST-in / expected-out fixture there rather than a JS-only test; that **is** the conformance suite, built for free. |

**When #2 actually becomes expensive — corrected 2026-09-19.** This note first argued that a
retrofit "can only say absent means 1, which is exactly the ambiguity a version field exists to
prevent". That was wrong, and the correction matters because it relocates the deadline.

**"Absent means 1" is a total, unambiguous rule.** It maps every AST to exactly one version and
is no worse than an explicit field. Adding the field late is perfectly sound — *provided the
format has not changed in the meantime.*

The real hazard is narrow: ship a v2 format **without** having introduced the field, and ASTs
written under v2 also lack it. Only then is absent genuinely ambiguous — v1 or v2, unknowable —
and only then is it permanent.

So the window is **before the format first changes**, not before the first AST is stored, and
`$ajs: 1` landed comfortably inside it (0.14.0). Cheap insurance bought early, not a catastrophe
narrowly averted. The obligation this leaves is simply: *never change the AST format without
bumping the version.*

## Phases

0. **Now (no cost):** constraints above; a short AST spec note as the format stabilises.
1. **Spike:** Rust interpreter for the core atoms + expressions, no builtins, driven by the golden
   fixtures. Measure wasm size and suspend/resume ergonomics. Kill or continue.
2. **Parity:** builtins, Date subset, regex, tosijs-schema core. Full conformance against the JS
   VM. Resolve string semantics.
3. **Swap:** Rust VM becomes the `Eval`/`SafeFunction` engine on the client and the VM on the
   server. JS VM retired from the untrusted path (or kept strictly as CSP fallback under
   conformance).
4. **Hosts:** wasmtime binary; Postgres via pgrx (logic travels to data, literally); anything else
   that appears.

## Triggers for making this critical path

- Universal endpoints want predicates executed inside Postgres.
- A sandbox issue that is structural to JS-in-JS rather than a bug.
- A consumer needing AJS without a JS host (embedded, edge runtime without JS, agent-local
  execution).

## Open questions

- CSP: document `'wasm-unsafe-eval'` as a requirement, or keep a JS fallback?
- Regex engine: `regex-lite` (small, linear) vs full `regex` (Unicode classes, larger)?
- Date: which subset is actually promised?
- String semantics: code points, UTF-8 bytes, or JS-compatible UTF-16 units?
- How much of tosijs-schema must be in Rust for atom I/O — all of it, or a core subset with the
  rest host-side?

## Relationship to `tjs-lang/vm-ast`

Shipped in 0.14.0 and worth noting here, because it is the first step of this plan taken for
independent reasons: the AST-only VM (no parser, no acorn, 56 KB against 221 KB) already
establishes **"the VM accepts an AST, not source"** as a supported contract with real consumers.
The Rust VM would implement that same contract rather than a new one, which removes the
riskiest part of a swap — persuading callers to change how they invoke it.
