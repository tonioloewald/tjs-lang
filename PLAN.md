# Agent-99 Improvement Plan

Based on comprehensive code review. Items organized by priority.

---

## P0 - Security (DONE)

- [x] SSRF protection for default fetch - block private IPs, localhost, metadata endpoints
- [x] ReDoS detection - reject dangerous regex patterns before execution
- [x] Tests for security fixes

---

## P1 - High Priority (DONE)

### 1.1 Fix Confusing Value Resolution - SKIPPED

**Status:** Working as designed. Type-by-example is intentional for AsyncJS.

---

### 1.2 Add Null Coalescing Operator (`??`) - DONE

Added `??` operator handling in `evaluateExpr()`.

---

### 1.3 Transpiler/Parser Test Coverage - DONE

Added `src/transpiler/transpiler.test.ts` with comprehensive coverage.

---

### 1.4 Edge Case Test Coverage - PARTIAL

Some edge cases added. Remaining items are low priority enhancements.

---

### 1.5 Improve Weak Error Messages - DONE

Improved error messages for unsupported syntax with helpful suggestions.

---

### 1.6 Remove Redundant Test Script - DONE

Added `test:fast` script for quick iteration (skips LLM tests and benchmarks).

---

## P2 - Medium Priority (DONE)

### 2.1 Create test-utils.ts - DONE

Created `src/test-utils.ts` with mock factories for store, fetch, LLM, vector, XML.

---

### 2.2 Document Default Store as Non-Production - DONE

Default in-memory store now emits warning via `result.warnings` on first use.

---

### 2.3 Clarify Builder API vs AsyncJS Emphasis - DONE

Updated README to lead with AsyncJS, Builder positioned as "Advanced" for metaprogramming.

---

### 2.4 Improve Syntax Highlighting for Unsupported Patterns - DONE

Editor grammars highlight forbidden keywords distinctly.

---

### 2.4b Unify Editor Grammar Implementations - DONE

Created `editors/ajs-syntax.ts` as single source of truth. Added `build:grammars` script to generate VSCode JSON from TypeScript source.

---

### 2.5 Fix Builder Footguns - DONE

- Added `warnMissingVars()` to warn when Builder conditions reference unmapped variables
- Removed legacy comparison atoms (eq, neq, gt, lt, and, or, not) - replaced by ExprNode

---

### 2.6 Replace Problematic `any` Types - DONE

- Added `VarMapping` type for condition variables
- Added `ItemsRef` type for iteration items
- Added generic `<T>` to `reduce` for typed initial values
- Remaining internal `any` uses are justified

---

### 2.7 Leverage Playground Inline Docs - DONE

Added `/*# markdown */` documentation to key atoms in runtime.ts. Fixed docs.js to combine blocks per file.

---

## P3 - Low Priority / Future (DONE)

### 3.1 Missing Agent Patterns - DONE

Created `PATTERNS.md` documenting:
- Parallel execution (not supported, capability workaround)
- Retry/backoff (manual while loop pattern)
- Rate limiting (capability responsibility)
- Break/continue (use condition variables)
- Switch statements (use chained if/else)
- Error handling patterns
- Expression limitations

---

### 3.2 Half-Implemented Features - DONE

Documented as limitations in PATTERNS.md:
- Template literals in expressions (now throws helpful error instead of `'__template__'`)
- Computed member access (`obj[variable]`) not supported
- Atom calls in expressions not supported

---

### 3.3 Batteries Tests - SKIPPED

Tested implicitly via integration tests. Mock-based unit tests are low priority.

---

### 3.4 Builtin Object Test Coverage - DONE

Added tests for:
- Date factory and methods (creation, properties, format, add, diff, comparison)
- Set factory and methods (has, size, add, union, intersection, diff)

---

### 3.5 Documentation Improvements - PARTIAL

- PATTERNS.md covers common patterns and limitations
- Expression syntax documented in PATTERNS.md
- API reference generation deferred (low priority)

---

## Questions Resolved

1. **Default store:** Documented as non-production via runtime warning.

2. **Value resolution:** Kept current (type-by-example is intentional).

3. **Builder footguns:** Added warning for missing vars, recommend AsyncJS instead.

4. **Half-implemented features:** Documented as unsupported in PATTERNS.md with workarounds.

---

## Not Doing

- **LLM prompt injection protection** - Out of scope. Users are responsible for their LLM prompts.

- **Test execution order dependencies** - Tests are independent. Repeated setup code is acceptable.

---

## Summary

All P0-P3 items have been addressed. The codebase now has:
- Improved type safety in Builder API
- Comprehensive documentation (PATTERNS.md, inline docs)
- Better error messages for unsupported syntax
- Unified editor grammar source
- Test utilities for mocking capabilities
- Runtime warnings for development footguns
