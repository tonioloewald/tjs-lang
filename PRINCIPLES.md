# Design Principles & Invariants

Foundational, non-negotiable invariants for the tjs-lang language stack. Every
feature and tool must preserve these. A violation is a **bug**, not a feature
gap — fix the tool, don't ask the user to work around it.

## Language subset relationships

```
JavaScript          ⊆   TJS (no modes on)   ⊆   TJS (modes on)
AJS                 ⊆   TJS
```

Two hard invariants:

1. **TJS ⊇ JavaScript.** With no modes toggled on, every legal JavaScript
   program is legal TJS _with the same meaning_. TJS _adds_ capability
   (types-as-examples, runtime contracts, monadic errors) but never removes the
   ability to transpile valid JS, and never silently changes its semantics.
   TJS's footgun-removal modes (`TjsStandard`, `TjsEquals`, honest truthiness,
   …) _do_ change behaviour — so they are gated on the **dialect** (below), not
   applied to plain JS.

   `.tjs` is a **better language, not just JS** — choosing it (the `.tjs`
   extension, `dialect: 'tjs'`, or a bare string, which defaults to native TJS)
   is the opt-in to those modes. Plain JS reaches semantics-preserving transpile
   via `dialect: 'js'` (or the `TjsCompat` directive).

2. **TJS ⊇ AJS.** Every legal AJS source is legal TJS source. `ajs(src)` and
   `tjs(src)` may do _different and more_ with the same string — TJS may enforce
   `:` contracts, run signature tests, treat `:` like `->`, etc. — but TJS must
   never **reject** source that AJS accepts.

(TypeScript → TJS is a _conversion_, not a subset relation, and is explicitly
out of scope for these invariants.)

## The operative rule: "more, never illegal"

A subset relationship lets the superset do **more** with the same code, but
never makes subset-legal code **illegal** (a hard parse/transpile error).

So when a richer TJS feature evaluates subset code:

- A check that **runs and fails** (e.g. a function's example output ≠ its
  declared example) → a hard error is fine. The code is genuinely wrong.
- A check that **cannot run** (references TJS can't resolve at build time, a
  test harness that can't execute the module, etc.) → **inconclusive +
  warning**, never a hard error. Inconclusive ≠ failed.

### Worked example: signature tests

TJS runs a function's signature example as a build-time test (call with the
parameter examples, assert the result matches the return example). This is a
Very Good Thing™ — but it must obey the rule above:

- Self-contained, executable, self-consistent function → test runs; mismatch is
  a hard error. ✅
- Function references names TJS can't resolve at build time — e.g. AJS atoms
  (`httpFetch`, `llm`, `store`) — or the harness can't execute the module (e.g.
  multiple top-level functions) → the test is **inconclusive**, surfaced as a
  warning (including in the playground), **never** a transpile error.

Without this, AJS agents (which call atoms and may declare return types) and
multi-function helper sources would be illegal TJS — breaking invariant 2.

## Dialect resolution (how invariant 1 is operationalized)

The unit of opt-in is the **dialect**, and `tjs()` takes it explicitly:

| input                          | modes        | meaning                          |
| ------------------------------ | ------------ | -------------------------------- |
| `tjs(src, { dialect: 'js' })`  | OFF          | plain JS — semantics preserved   |
| `tjs(src, { dialect: 'tjs' })` | ON           | native TJS                       |
| `tjs(src)` (bare string)       | ON (default) | native TJS (back-compat default) |
| `fromTS(src)` then `tjs(...)`  | OFF          | TypeScript → TJS → JS            |

For **file-based tooling** (CLIs, bundler plugins, module loaders, doc systems),
the dialect is the file extension. There is one canonical mapping — exported as
`dialectForFilename` / `sourceKindForFilename` from `tjs-lang/lang` — that all
tools must share so `.js` is never silently "improved" into different semantics:

- `.js` / `.mjs` / `.cjs` → `dialect: 'js'` (preserve; TJS still reserves the
  right to add _better diagnostics_, never to change behaviour)
- `.tjs` → native TJS (the better language)
- `.ts` / `.mts` / `.cts` → `fromTS` (TS → TJS → JS)

A bare string defaults to native TJS only because it has no extension to consult;
any tool that knows the source's origin should pass `dialect` (or use the helper).

## Why this matters

- **AJS portability.** AJS agents ("code travels to data": sandboxed,
  atom-calling) must carry into the full TJS toolchain — editor support,
  `.d.ts`, docs — with zero rewrites.
- **JS adoption.** A developer must be able to drop existing `.js` into TJS and
  have it transpile, then add contracts incrementally.
- **Guardable.** These are testable properties: keep a fixture of representative
  AJS/JS snippets asserted to `tjs()` (and the JS to options-off TJS) **without
  throwing**, so a regression is caught immediately.
