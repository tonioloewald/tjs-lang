# TJS VM Implementation Issues

Notes from integrating `tjs-lang` VM into a production Firebase application (snowfox-app). These are friction points and pain encountered getting real-world agentic loops working, with current workarounds. Goal: inform tjs-lang improvements.

---

## 1. Single-function-per-agent rule breaks TOOL_LIBRARY pattern

**Issue:** The ajs compiler enforces exactly one `function` declaration per agent. Any attempt to prepend helper function declarations (for convenience, e.g. a "tool library") before the agent function throws `"Only a single function per agent is allowed"`.

**Impact:** The universal endpoint in snowfox prepends a `TOOL_LIBRARY` string of helper `async function` declarations before compiling user-submitted source. This makes the `source` path fundamentally broken for any agent that defines its own function. The TOOL_LIBRARY approach was designed but has never actually worked.

**Workaround:** Send pre-compiled `ast` (not `source`) to bypass TOOL_LIBRARY. Pre-compile the agent at build time and ship the JSON AST.

**Desired fix:** Either:
- Allow multiple function declarations with a defined entry point (one named `agent`, or the last one)
- Or support `const` arrow-function helpers alongside a single `function` declaration

---

## 2. `llmPredictBattery` default timeout is 1000ms — far too short for LLM calls

**Issue:** `defineAtom` defaults `timeoutMs` to 1000ms. LLM calls via Vertex AI (Claude) typically take 3–30 seconds. The battery atom times out before the model responds.

**Workaround:** Added `timeoutMs: 120000` to `llmPredictBattery` in our PR branch. This should be the default — no real-world LLM call completes in 1 second.

**Fix:** Set `timeoutMs: 120000` (or higher) as the default for `llmPredictBattery` and `llmVision`.

---

## 3. `ajs` not exported from `tjs-lang/vm`

**Issue:** `tjs-lang/vm` exports `AgentVM` and battery atoms but not `ajs()`. Code that imports from `tjs-lang/vm` to run agents also needs to compile source to AST, requiring a separate import from `tjs-lang` or `tjs-lang/lang`.

**Impact:** `import { AgentVM, ajs } from 'tjs-lang/vm'` silently gives `undefined` for `ajs`. No TypeScript error because `tjs-lang/vm` types don't expose it — the failure only surfaces at runtime.

**Workaround:** Separate imports: `AgentVM` from `tjs-lang/vm`, `ajs` via `require('tjs-lang/lang')`.

**Desired fix:** Export `ajs` from `tjs-lang/vm` so the VM package is self-contained for the common case of compile-then-run.

---

## 4. `batteryAtoms` not in TypeScript types for `tjs-lang/vm`

**Issue:** `batteryAtoms` is exported from `dist/tjs-vm.js` at runtime but not reflected in the TypeScript declaration files. `import { batteryAtoms } from 'tjs-lang/vm'` gives a TypeScript error.

**Workaround:** `require('tjs-lang/vm')` with manual type cast.

**Desired fix:** Add `batteryAtoms` to the `tjs-lang/vm` TypeScript declarations.

---

## 5. Subpath exports (`tjs-lang/lang`, `tjs-lang/vm`) not resolvable with `moduleResolution: node`

**Issue:** TypeScript's legacy `node` module resolution doesn't understand `package.json` `exports` subpath fields. Projects using `"module": "commonjs"` + implicit `moduleResolution: node` (Firebase Functions default tsconfig) can't statically import `tjs-lang/lang` or use subpath exports.

**Impact:** TypeScript reports `"Cannot find module 'tjs-lang/lang'"` even though Node.js resolves it fine at runtime.

**Workaround:** Use `require()` with type casts instead of `import` for subpath packages.

**Desired fix:** Provide a `tjs-lang.d.ts` or top-level re-export that CommonJS consumers can use without subpath resolution — or document that `moduleResolution: bundler` or `node16` is required.

---

## 6. `tjs-lang` main entry loads TypeScript at runtime — crashes Cloud Run

**Issue:** `import { ajs } from 'tjs-lang'` (main entry) pulls in `typescript` as a runtime dependency. Cloud Run containers don't have `typescript` installed, so the function crashes on startup with `Cannot find package 'typescript'`.

**Impact:** Any v2 Firebase Function that imports from the main `tjs-lang` entry will fail to start.

**Workaround:** Use `tjs-lang/lang` (which has `ajs` without the TS compiler).

**Desired fix:** Make `typescript` a truly optional peer dependency — lazy-load it only when the TS transpiler path is actually invoked, not at import time.

---

## 7. `const` inside `while` loop body fails on second iteration

**Issue:** `constSet` throws `"Cannot reassign const variable"` when a `const` variable is declared inside a `while` loop body and the loop iterates more than once. The `const` declaration in a loop body re-runs on each iteration, but `constSet` doesn't allow re-binding.

**Impact:** Agent loops that use `const response = llmPredictBattery(...)` inside a `while (!done)` loop silently fail on the second iteration, setting `ctx.error`. The while loop (before our fix) didn't check `ctx.error`, so it continued consuming fuel until exhaustion. Extremely hard to debug.

**Workaround:** Use `let` instead of `const` inside loop bodies.

**Desired fix:** `constSet` in a loop body should be an error at compile time, or scoped per-iteration like JavaScript `let`/`const` in blocks.

---

## 8. `while` loop doesn't propagate `ctx.error` — infinite fuel burn

**Issue:** The `while` atom did not check `ctx.error` after executing the body `seq`. If a monadic error occurred inside the loop (e.g. the `constSet` re-declaration above), the error was set but the loop continued evaluating the condition and running the body indefinitely until fuel exhaustion.

**Fix applied in PR:** Added `if (ctx.error) return` after `seq.exec(...)` in the while atom.

---

## 9. Computed member access with variable index (`arr[i]`) not supported

**Issue:** `expressionToExprNode` threw `TranspileError: "Computed member access with variables not yet supported"` for `arr[i]`. Additionally, `expressionToValue` silently produced the string `"arr[i]"` instead of an expression node, causing the runtime to return the literal string as the value.

**Impact:** Cannot iterate arrays with an index variable — core pattern for any agent that processes a list of tool calls.

**Fix applied in PR:** Both `expressionToExprNode` and `expressionToValue` now emit a computed `$expr: 'member'` node with the index as an expression. The runtime evaluates it dynamically.

---

## 10. `AgentVM` must be instantiated with battery atoms explicitly

**Issue:** `new AgentVM()` creates a VM with only core atoms. `llmPredictBattery` and other battery atoms must be passed explicitly: `new AgentVM(batteryAtoms)`. No error is thrown if battery atoms are missing — the runtime just fails with `"Unknown Atom: llmPredictBattery"` at execution time.

**Workaround:** Always `new AgentVM(batteryAtoms)` when using LLM/vector capabilities.

**Desired fix:** Either make `batteryAtoms` the default, or throw a helpful error at compile time when an unknown atom is referenced in source.

---

## 11. No `esSearch` atom in core or batteries

**Issue:** The timeline agent uses `esSearch` for Elasticsearch queries. This atom is registered by the application (snowfox universal endpoint) via a custom capability. It's not in `coreAtoms` or `batteryAtoms`. Fine as a pattern, but worth documenting — user-defined atoms are the extension point, and the error message `"Unknown Atom: esSearch"` gives no hint about this.

---

## Summary: Recommended tjs-lang fixes (priority order)

1. `llmPredictBattery` timeout → 120s (blocking for any real LLM usage)
2. Export `ajs` from `tjs-lang/vm` (DX / ease of use)
3. Export `batteryAtoms` in TypeScript types for `tjs-lang/vm`
4. `const` in loop body → compile-time error or per-iteration scope
5. Multiple function declarations → allow helpers alongside one `agent` entry point
6. `typescript` lazy-load in main entry (Cloud Run compatibility)

---

## 12. `s.string.optional` rejects `null` — only accepts `undefined`

**Issue:** The `llmPredictBattery` output schema uses `s.string.optional` for `content`. When the LLM responds with tool calls and no text, our battery capability returned `content: null`. The schema validation rejected this because `s.string.optional` accepts `undefined` (absent) but not `null`.

**Workaround:** Return `content: undefined` instead of `content: null` from the battery capability.

**Desired fix:** Document clearly that `.optional` means "may be absent/undefined" not "may be null". Consider whether `s.string.nullable` or similar should be added, or whether the output schema for `llmPredictBattery` should explicitly allow null content (since the Anthropic API returns null content when only returning tool calls).

---

## 13. `defineAtom` `timeoutMs` — unclear if per-atom timeout is actually enforced

**Issue:** `defineAtom` accepts `timeoutMs` (default 1000ms) and applies a `Promise.race` per atom call. We added `timeoutMs: 120000` to `llmPredictBattery` to support real LLM calls. However:
- The original 1000ms default should cause all slow LLM calls to fail, yet the tjs-lang LLM integration tests (which use a slow local LM Studio) apparently pass
- The prod deployment still shows "Atom 'llmPredictBattery' timed out" errors very quickly (< 5s)
- Whether this timeout mechanism is correctly enforced in practice is unclear

**Questions for tjs-lang:**
1. Is `timeoutMs` in `defineAtom` actually enforced as a per-atom wall-clock timeout?
2. If so, how do the slow LM Studio integration tests pass with the 1000ms default?
3. Is there a way to pass a per-atom timeout override at `vm.run()` time (e.g. via `costOverrides`)?
4. Should the batteries have `timeoutMs: 0` (disabled) since their timeout is application-specific?

**Current workaround:** None working yet. The LLM call goes client → server (universal endpoint) → Vertex AI, and times out before Vertex AI responds.

---

## Summary: Recommended tjs-lang fixes (priority order)

1. Clarify and fix `defineAtom` `timeoutMs` behavior — critical blocker for LLM battery use
2. `llmPredictBattery` timeout → 120s (or 0 = disabled, let the app control it)
3. Export `ajs` from `tjs-lang/vm` (DX / ease of use)
4. Export `batteryAtoms` in TypeScript types for `tjs-lang/vm`
5. `const` in loop body → compile-time error or per-iteration scope
6. Multiple function declarations → allow helpers alongside one `agent` entry point
7. `typescript` lazy-load in main entry (Cloud Run compatibility)
