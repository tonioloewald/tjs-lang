# Native Engine Integration: TJS in V8 or JavaScriptCore

_Forward-looking exploration of what native JS engine support for TJS could unlock._

---

## Why Native?

TJS currently transpiles to standard JavaScript. This works, but it means:

- Type checks are opaque user code the JIT can't reason about
- `try`/`finally` for stack tracking inhibits some JIT optimizations
- Structural equality is a recursive JS function call
- Inline tests run via `new Function()` at transpile time
- The engine parses the source twice (TJS parse → emit JS → JS parse)

Native engine support would turn TJS's type annotations into **first-class information the JIT can exploit** — the same way it already uses hidden classes and speculative type profiling, but with declared types instead of observed ones.

---

## The Big Wins

### 1. Function Boundary Validation (~1.5x → ~1.0x)

**Today:** TJS emits `typeof` checks, `Number.isInteger()` calls, and object shape validation as inline JS. The JIT treats these as generic user code.

```javascript
// Current transpiler output — the JIT sees opaque code
function add(a, b) {
  __tjs.pushStack('file:1:add');
  if (typeof a !== 'number' || !Number.isInteger(a))
    return __tjs.typeError('file:1:add.a', 'integer', a);
  if (typeof b !== 'number' || !Number.isInteger(b))
    return __tjs.typeError('file:1:add.b', 'integer', b);
  try {
    return a + b;
  } finally {
    __tjs.popStack();
  }
}
```

**Native:** Type checks become bytecode-level guards — the same mechanism the JIT already uses for speculative optimization:

- The engine knows `a` is an integer from the declaration, not from observing 1000 calls. **No warmup period** — first-tier JIT compilation can use the declared types immediately.
- Integer checks use the engine's internal Smi (small integer) representation directly, not `typeof` + `Number.isInteger()`.
- The `try`/`finally` for stack tracking disappears — the engine has its own call stack.
- The monadic error return path could be a deopt trap rather than a function call, or the engine could emit the monadic return directly without the `typeError()` indirection.

### 2. Cross-Function Type Propagation (impossible today)

**Today:** Each function independently validates its inputs. Even with `!` (unsafe), you're making a manual decision about which checks to skip.

**Native:** The engine can **propagate types across call boundaries**. If `calc(a: 0, b: 0)` calls `add(x: 0, y: 0)`, and both functions declare integer params, the engine can prove that `add`'s guards are satisfied by `calc`'s guards and **skip them entirely**.

This is the one optimization that cannot be achieved at the source level. It turns TJS's per-function overhead into per-call-chain overhead — the outermost typed function pays the cost, and everything it calls runs at full speed.

| Scenario | Current (transpiled) | Native engine |
|---|---|---|
| First call | Interpreted, runs typeof checks | JIT with declared types, no warmup |
| Warmup (100-1000 calls) | JIT profiles, still runs typeof checks | Already optimized |
| Hot (10000+ calls) | JIT may inline typeof but can't eliminate | Guards are internal, may be elided |
| Cross-function calls | Each function re-validates independently | Types propagate — redundant guards skipped |

### 3. Structural Equality as Engine Primitive

**Today:** `Is()` is a JS function that recursively walks two objects comparing values. Even with short-circuit optimizations, every `==` comparison pays function call overhead plus recursive property enumeration.

**Native:** The engine has internal knowledge that source-level code doesn't:

- **Hidden class comparison:** If two objects have the same hidden class (same properties in same order, all primitives), the engine can compare their backing stores directly — effectively a `memcmp` on the value slots. This turns O(n) deep comparison into O(1) for the common case.
- **Reference equality fast path:** Already done in the JS implementation, but without the function call overhead.
- **Immutable value interning:** For small objects and arrays that are structurally identical, the engine could intern them (like it does for small integers and short strings), making `==` a pointer comparison.
- **`[tjsEquals]` as engine trap:** The custom equality symbol could be recognized like `Symbol.toPrimitive` — dispatched at the engine level without going through the generic property lookup path.

### 4. Inline Tests as Compilation Assertions

**Today:** TJS runs inline tests at transpile time by executing the compiled code via `new Function()`. Test results are separate from the compilation pipeline.

**Native:** Tests become part of the compilation contract:

- **Fail-fast before bytecode:** If a function's inline test fails, the engine can refuse to compile it — catching bugs before any user code runs. No separate test runner needed.
- **Test results as type evidence:** If an inline test proves `add(1, 2) === 3`, the JIT has concrete evidence that the return type is `number`. This is strictly more information than the `-> 0` return annotation alone (which says "integer" but doesn't prove the function actually returns one).
- **Cached test results:** The engine can key test results to source hashes and skip re-running tests for unchanged functions across page loads / process restarts.
- **Assertion-based narrowing:** Tests that assert properties of return values (`expect(result.name).toBe('string')`) give the JIT shape information about the return object, enabling speculative optimization of callers.

### 5. WASM Blocks

**Today:** WASM blocks are compiled at transpile time and embedded as base64 in the JS output. The runtime instantiates them with `WebAssembly.instantiate()`.

**Native:** The engine could compile WASM blocks as part of the same compilation pipeline — no base64 encoding/decoding, no async instantiation. The WASM code would be available synchronously, and the engine could inline across the JS/WASM boundary for small functions.

---

## Which Engine?

### JavaScriptCore (WebKit/Bun) — More Practical

- **Parser is simpler** (~20K lines C++ vs V8's ~50K)
- **Bun already uses a JSC fork** — Bun's team maintains patches and knows the codebase
- **JSC's B3/Air backend** is cleaner than TurboFan for adding new type guard primitives
- **Slower release cadence** than V8 — easier to maintain a fork
- TJS syntax changes could be implemented as **desugaring in the parser** (emit standard AST nodes), minimizing changes to the rest of the engine

### V8 (Chrome/Node/Deno) — More Impact

- **Most deployed engine** (Chrome, Node, Deno, Electron)
- Parser is heavily optimized with lazy parsing, preparsing, and parallel compilation — changes are higher risk
- V8 moves fast (~4 week release cycle) — maintaining a fork is more work
- TurboFan's sea-of-nodes IR is powerful but complex to modify

**Recommendation:** Start with JSC via Bun. The integration path is natural (Bun is already the TJS runtime), the parser is more approachable, and Bun's team has institutional knowledge of JSC internals.

---

## Scope of JSC Changes

TJS's syntax extensions are modest. The engine changes would be:

### Lexer
- Recognize `:` in parameter context (already a valid token, just needs context-sensitive handling)
- `:` for return types uses context-sensitive handling (already a valid token)
- `Type`, `Generic`, `Union`, `Enum` as contextual keywords
- `extend` as contextual keyword
- `wasm` as contextual keyword
- `safety`, `TjsStrict`, `TjsEquals`, etc. as directives

### Parser
- Desugar `:` params to `=` defaults (same as transpiler does today)
- Desugar `:` return annotations to metadata
- Desugar `Type`/`Generic`/`Union`/`Enum` declarations to `const` + function calls
- Desugar `extend` blocks to `.call()` rewriting
- Desugar `wasm {}` blocks (or hand off to WASM compiler)
- Desugar polymorphic function declarations to dispatcher + variants

### Bytecode Compiler
- Emit type guard bytecodes at function entry instead of `typeof` check sequences
- Attach type metadata to function objects (replacing `.__tjs` property assignment)
- Emit structural equality bytecodes for `==`/`!=` when `TjsEquals` is active

### JIT (DFG/FTL in JSC)
- Use declared types as initial type assumptions (skip profiling warmup)
- Propagate types across call boundaries
- Optimize structural equality using hidden class information

### What Stays Untouched
- Garbage collector
- Object model / hidden classes
- Module loader (TJS preserves ES module semantics)
- Most built-in functions
- Debugger protocol

---

## The Bootstrapping Path

A pragmatic rollout:

1. **Phase 1: Parser only.** Extend JSC's parser to understand TJS syntax, desugaring to the same JS that the transpiler produces today. Zero runtime changes. Benefit: single parse, better error messages, source maps unnecessary.

2. **Phase 2: Type guards.** Replace the emitted `typeof` checks with bytecode-level guards. The JIT can now reason about TJS types. Benefit: warmup-free optimization, cross-function type propagation.

3. **Phase 3: Structural equality.** Implement `Is()`/`IsNot()` as engine primitives using hidden class information. Benefit: O(1) common-case equality for same-shape objects.

4. **Phase 4: Inline tests.** Integrate test execution into the compilation pipeline. Benefit: compile-time verification, test results as type evidence for JIT.

Each phase is independently useful and shippable.
