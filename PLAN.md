# Agent-99 Improvement Plan

Based on comprehensive code review. Items organized by priority.

---

## P0 - Security (DONE)

- [x] SSRF protection for default fetch - block private IPs, localhost, metadata endpoints
- [x] ReDoS detection - reject dangerous regex patterns before execution
- [x] Tests for security fixes

---

## P1 - High Priority

### 1.1 Fix Confusing Value Resolution

**Problem:** `resolveValue('myVar', ctx)` silently returns the literal string `"myVar"` if variable doesn't exist. This is a footgun.

**Solution:** Require explicit syntax for different value types:

- `{ $state: 'varName' }` for state variables
- `{ $args: 'argName' }` for arguments
- `{ $literal: 'string' }` for literal strings
- OR: Throw an error when a string looks like a variable reference but doesn't resolve

**Files:** `src/runtime.ts` (resolveValue function ~line 213)

**Status:** TODO

---

### 1.2 Add Null Coalescing Operator (`??`)

**Problem:** Not implemented in expression evaluation.

**Solution:** Add `nullish` binary operator handling in `evaluateExpr()`.

**Files:**

- `src/runtime.ts` (evaluateExpr, ~line 900)
- `src/transpiler/transformer.ts` (if used in transpiler)

**Status:** TODO

---

### 1.3 Transpiler/Parser Test Coverage

**Problem:** No unit tests for `transpiler/parser.ts` or `transpiler/transformer.ts`.

**Solution:** Add dedicated test files with edge cases.

**Files to create:**

- `src/transpiler/parser.test.ts`
- `src/transpiler/transformer.test.ts`

**Status:** TODO

---

### 1.4 Edge Case Test Coverage

Add tests for:

- [ ] Division by zero behavior
- [ ] Complex optional chaining (`obj?.a?.b?.c`)
- [ ] Nested try/catch blocks
- [ ] Error in catch block
- [ ] AgentError cause chains
- [ ] Zero fuel edge case
- [ ] Unicode/special characters in state keys
- [ ] Circular references in state (should error gracefully)

**Files:** `src/runtime.test.ts` or new `src/edge-cases.test.ts`

**Status:** TODO

---

### 1.5 Improve Weak Error Messages

Audit and improve:

- [ ] `"Root AST must be 'seq'"` → explain what user should do
- [ ] `"Execution timeout: fuel budget exceeded"` → suggest increasing fuel or optimizing
- [ ] Add error codes for programmatic handling
- [ ] Unsupported syntax errors should reference documentation

**Files:** `src/vm.ts`, `src/runtime.ts`, `src/transpiler/*.ts`

**Status:** TODO

---

### 1.6 Remove Redundant Test Script

**Problem:** `npm test` script is redundant with bun.toml configuration.

**Solution:** Remove `"test"` from package.json scripts, document that `bun test` uses bun.toml config (which specifies `--max-concurrency 1`).

**Files:** `package.json`

**Status:** TODO

---

## P2 - Medium Priority

### 2.1 Create test-utils.ts

Extract common test patterns:

- `createMockStore()`
- `createMockLLM()`
- `createMockVector()`
- `createTestServer()` for Bun.serve setup

**Files to create:** `src/test-utils.ts`

**Status:** TODO

---

### 2.2 Document Default Store as Non-Production

**Problem:** Default in-memory store persists across runs in same VM instance. Users might not realize this.

**Clarification needed:** Is default store a battery or core functionality?

**Solution:**

- Add prominent warning in README/docs
- Add JSDoc comment on default store creation in vm.ts
- Consider adding `console.warn` on first use in non-test environments

**Files:** `src/vm.ts`, `README.md`

**Status:** TODO - need to clarify if battery or default

---

### 2.3 Clarify Builder API vs AsyncJS Emphasis

**Problem:** Two APIs (fluent builder, AsyncJS transpiler) creates confusion about which to use.

**Solution:**

- Make clear in README that AsyncJS is the primary/recommended API
- Builder is for "deep hacking" / advanced use cases
- Ensure all README examples use `ajs` syntax
- Move builder docs to separate file (already done?)

**Files:** `README.md`, `CONTEXT.md`

**Status:** TODO

---

### 2.4 Improve Syntax Highlighting for Unsupported Patterns

**Problem:** Unsupported JS patterns (switch, for, class, etc.) should be visually distinct.

**Solution:**

- Audit editor grammars to ensure unsupported keywords are highlighted as errors
- Ensure error messages reference what IS supported

**Files:** `editors/vscode/syntaxes/*.json`, `editors/monaco/ajs-monarch.ts`, `editors/codemirror/ajs-language.ts`

**Status:** TODO

---

### 2.4b Unify Editor Grammar Implementations

**Problem:** There are 4+ separate grammar implementations that must stay in sync manually:

- `editors/vscode/syntaxes/ajs.tmLanguage.json` (TextMate)
- `editors/vscode/syntaxes/ajs-injection.tmLanguage.json` (TextMate injection for template literals)
- `editors/monaco/ajs-monarch.ts` (Monaco Monarch)
- `editors/codemirror/ajs-language.ts` (CodeMirror)
- `editors/ace/ajs-mode.ts` (Ace)

Any change to syntax (new keywords, new atoms, new unsupported patterns) requires updating all files.

**Solution Options:**

1. **Single source of truth:** Create a `grammar-definition.json` with keyword lists, patterns, etc. Generate editor-specific grammars from it.

2. **Shared constants file:** At minimum, export shared keyword lists that each grammar imports:

   ```typescript
   // editors/shared/keywords.ts
   export const ATOMS = ['search', 'llmPredict', 'storeGet', ...]
   export const UNSUPPORTED = ['switch', 'class', 'throw', ...]
   export const BUILTINS = ['Math', 'JSON', 'Array', ...]
   ```

3. **Test for consistency:** Add a test that validates all grammars highlight the same keywords.

**Files:** `editors/shared/*.ts` (new), all grammar files

**Status:** TODO (P3 - significant effort)

---

### 2.5 Fix Builder Footguns

**Problem:** `.if()` requires manual `vars` parameter mapping - easy to forget.

**Suggested improvement:** Auto-detect variables from condition string where possible, or provide better error when vars are missing.

```typescript
// Current (error-prone):
.if('x > 5', { x: 'x' }, ...)

// Option A: Auto-detect (if feasible)
.if('x > 5', ...)  // x auto-extracted from state

// Option B: Better error
.if('x > 5', {}, ...)  // Error: "Condition references 'x' but vars mapping is empty"
```

**Files:** `src/builder.ts`

**Status:** TODO

---

### 2.6 Replace Problematic `any` Types

Per earlier discussion, fix external API exposure:

- [ ] `Capabilities` interface - remove `[key: string]: any` escape hatch
- [ ] Battery atom schemas - type `tools`, `responseFormat`, `doc`, `filter`
- [ ] Builder control flow methods - use `unknown` instead of `any` for `items`

**Files:** `src/runtime.ts`, `src/atoms/batteries.ts`, `src/builder.ts`

**Status:** TODO

---

### 2.7 Leverage Playground Inline Docs

**Problem:** Files have `/*# */` inline doc comments for playground but not fully utilized.

**Solution:** Document the format, ensure consistent usage across atoms.

**Status:** TODO (lower priority - playground feature)

---

## P3 - Low Priority / Future

### 3.1 Missing Agent Patterns (Document for Now)

These are functionality gaps to document, not necessarily implement:

- **Parallel execution** - not supported; document workaround or future plans
- **Retry/backoff** - show manual implementation pattern
- **Rate limiting** - document as capability responsibility
- **Break/continue** - not supported; use while with condition
- **Switch statements** - not supported; use chained if/else

**Files:** `README.md` or new `PATTERNS.md`

**Status:** TODO - document limitations

---

### 3.2 Half-Implemented Features (Document or Fix)

- [ ] Template literals in expressions return `'__template__'` placeholder
- [ ] Computed member access (`obj[variable]`) not supported
- [ ] Atom calls in expressions not supported

**Decision needed:** Fix or document as limitation?

**Status:** TODO

---

### 3.3 Batteries Tests

**Problem:** `batteries/audit.ts`, `batteries/llm.ts` have no dedicated tests.

**Reality:** These are tested implicitly via integration tests. Hard to test in isolation since they depend on external services.

**Solution:** Document that these are integration-tested, consider adding mock-based unit tests if feasible.

**Status:** LOW PRIORITY

---

### 3.4 Builtin Object Test Coverage

Missing tests for:

- [ ] Date methods (`.add()`, `.diff()`, `.format()`, `.isBefore()`, `.isAfter()`)
- [ ] Set methods (`.union()`, `.intersection()`, `.diff()`, `.map()`, `.filter()`)
- [ ] Schema object methods

**Files:** `src/builtins.test.ts`

**Status:** LOW PRIORITY

---

### 3.5 Documentation Improvements

- [ ] Generate API reference from JSDoc
- [ ] Add "Common Patterns" section with recipes
- [ ] Document expression syntax completely (what works, what doesn't)
- [ ] Add troubleshooting guide

**Status:** LOW PRIORITY

---

## Questions to Resolve

1. **Default store:** Is it a battery or default functionality? Need to clarify for documentation.

2. **Value resolution fix:** Which approach?

   - Explicit syntax (`$state`, `$args`, `$literal`)
   - Error on unresolved variable-like strings
   - Keep current but add warnings

3. **Builder footguns:** Auto-detect vars or better errors?

4. **Half-implemented features:** Fix or document as unsupported?

---

## Not Doing

- **LLM prompt injection protection** - Out of scope. We execute user-provided code in a sandbox; users are responsible for their LLM prompts. The capability model means LLM access is explicitly granted.

- **Test execution order dependencies** - Confirmed tests should be independent. Repeated setup code is acceptable.

---

## Completed

- [x] SSRF protection (isBlockedUrl)
- [x] ReDoS protection (isSuspiciousRegex)
- [x] Security tests
- [x] Verified file:// protocol is blocked
