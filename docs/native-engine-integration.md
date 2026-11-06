<!--{"parent": "the-tjs-language.md", "order": 13}-->
<!-- TODO review -->

# Native Engine Integration: TJS in V8 or JavaScriptCore

_Status: speculative design exploration (no engine work exists). Nothing on this page
describes shipped behaviour except the "Today" paragraphs, which describe what the
transpiler does now._

---

## Why Native?

TJS transpiles to standard JavaScript. This works, but it means:

- Type checks are ordinary user code the JIT can't reason about
- Every validated function pushes and pops a name on a call-stack ring buffer (`__tjs.pushStack` / `__tjs.popStack`)
- Structural comparison (`Is()`) is a recursive JS function call
- Inline `test` blocks run via `new Function()` at transpile time
- The source is parsed twice (TJS parse → emit JS → engine's JS parse)

Native engine support would turn TJS's type examples into **information the JIT can use
directly**, the same way it already uses hidden classes and speculative type profiling,
but with declared types instead of observed ones.

---

## The Big Wins

### 1. Function Boundary Validation

**Today:** TJS emits `typeof` checks, `Number.isInteger()` calls and object shape
validation as inline JS. The JIT treats these as generic user code.

For this source:

```javascript
function add(a: 0, b: 0): 0 {
  return a + b
}
```

`tjs emit` produces this function (captured 2026-11-06; the full output also carries a
per-file inline runtime above it and an `add.__tjs` metadata object below it):

```javascript
function add(a,b) {
  __tjs.pushStack('add.tjs:1:add');
  const __cv_a = __tjs_rt.__tv(a);
  if ((typeof __cv_a !== 'number' || !Number.isInteger(__cv_a))) { return __tjs.typeError('add.tjs:1:add.a', 'integer', __cv_a); }
  const __cv_b = __tjs_rt.__tv(b);
  if ((typeof __cv_b !== 'number' || !Number.isInteger(__cv_b))) { return __tjs.typeError('add.tjs:1:add.b', 'integer', __cv_b); }

  return a + b

  __tjs.popStack();
}
```

`__tjs_rt.__tv` unwraps a wrapped value (an object carrying a `Symbol.for('xin-value')`
property) before the check. Note that the trailing `popStack()` sits after the `return`,
so it is never reached in this function.

The cost of these checks is measured in [benchmarks.md](../benchmarks.md) (generated
2026-08-19): on the simple-arithmetic benchmark the validated ("safe") version ran at
1.5x the unvalidated baseline, and the `!` (unsafe) version at about 1.0x. A
three-function chain ran at 2.0x, because each function re-validates.

**Native:** Type checks become bytecode-level guards, the mechanism the JIT already uses
for speculative optimization:

- The engine knows `a` is an integer from the declaration, not from observing 1000 calls. **No warmup period**: first-tier JIT compilation can use the declared types immediately.
- Integer checks use the engine's internal small-integer (Smi) representation directly, not `typeof` plus `Number.isInteger()`.
- Stack tracking disappears: the engine has its own call stack.
- The monadic error return path could be a deopt trap rather than a function call, or the engine could build the `MonadicError` directly without the `typeError()` indirection.

### 2. Cross-Function Type Propagation

**Today:** Each function validates its own inputs. Marking a parameter `!` (unsafe) skips
its check, but that is a manual decision about which checks are redundant.

**Native:** The engine can **propagate types across call boundaries**. If
`calc(a: 0, b: 0)` calls `add(x: 0, y: 0)` with its own parameters, and both declare
integer params, the engine can prove that `add`'s guards are already satisfied and
**skip them**.

A source-level transpiler cannot do this in general, because any caller (including plain
JS) may call `add`. It turns per-function overhead into per-call-chain overhead: the
outermost typed function pays the cost, and everything it calls runs unchecked.

| Scenario | Current (transpiled) | Native engine |
|---|---|---|
| First call | Interpreted, runs typeof checks | JIT with declared types, no warmup |
| Warmup (100-1000 calls) | JIT profiles, still runs typeof checks | Already optimized |
| Hot (10000+ calls) | JIT may inline typeof but can't eliminate | Guards are internal, may be elided |
| Cross-function calls | Each function re-validates independently | Types propagate, redundant guards skipped |

### 3. Structural Equality as Engine Primitive

**Today:** `==` in native TJS is not structural: it is `===` with boxed primitives
unwrapped and `null == undefined`. Deep comparison is the `Is()` / `IsNot()` function,
which recursively walks both values. Every call pays function call overhead plus property
enumeration.

**Native:** The engine has internal knowledge that source-level code doesn't:

- **Hidden class comparison:** If two objects have the same hidden class (same properties in the same order, all primitive values), the engine can compare their backing stores directly, close to a `memcmp` on the value slots. The comparison stays O(n) in the number of slots, but loses the per-property lookup and call overhead.
- **Reference equality fast path:** `Is()` already returns early on identical references; natively this happens without the function call.
- **Immutable value interning:** For small objects and arrays that are structurally identical, the engine could intern them (as it does for short strings), making the comparison a pointer check.
- **`[tjsEquals]` as engine trap:** `Is()` consults the `Symbol.for('tjs.equals')` method before comparing structurally. The engine could recognize it the way it recognizes `Symbol.toPrimitive`, without the generic property lookup.

### 4. Inline Tests as Compilation Assertions

**Today:** TJS runs `test` blocks and signature examples at transpile time, executing the
compiled code via `new Function()`. The results are reported separately from the emitted
code.

**Native:** Tests become part of the compilation contract:

- **Fail before bytecode:** If a function's test fails, the engine can refuse to compile it, catching the bug before any user code runs.
- **Test results as type evidence:** A return example is already a worked example that is tested: `function add(a: 2, b: 3): 5` runs `add(2, 3)` and expects `5`. A passing test gives the JIT concrete evidence about the return type and shape, which it could use to speculate in callers.
- **Cached test results:** The engine can key results to source hashes and skip re-running tests for unchanged functions across page loads and process restarts.
- **Assertion-based narrowing:** Tests that assert properties of return values (`expect(typeof result.name).toBe('string')`) give the JIT shape information about the returned object.

### 5. WASM Blocks

**Today:** `wasm {}` blocks are compiled at transpile time into one module per file,
embedded as base64 in the JS output. At load the output decodes it and instantiates it
synchronously (`new WebAssembly.Module`), falling back to async
`WebAssembly.instantiate` where synchronous compilation is refused (a browser main
thread with a module over 4KB). Each block keeps its JS fallback if WebAssembly is
unavailable.

**Native:** The engine could compile WASM blocks in the same pipeline as the JS: no
base64 encoding and decoding, and no async path. It could also inline across the JS/WASM
boundary for small functions.

---

## Which Engine?

### JavaScriptCore (WebKit/Bun): more practical

- **Bun is built on JavaScriptCore**, and Bun's team maintains patches against it
- **JSC's B3/Air backend** is reported to be easier than V8's optimizing compiler to extend with new type guard primitives
- **Slower release cadence** than V8, so a fork is easier to maintain
- TJS syntax could be implemented as **desugaring in the parser** (emitting standard AST nodes), keeping changes out of the rest of the engine

### V8 (Chrome/Node/Deno): more impact

- **Most deployed engine** (Chrome, Node, Deno, Electron)
- Its parser is heavily optimized (lazy parsing, preparsing, parallel compilation), so changes are higher risk
- V8 releases about every four weeks, so maintaining a fork is more work

**Suggested starting point:** JSC via Bun. tjs-lang is developed on Bun and already ships
a Bun plugin for importing `.tjs` files, so it is the natural first host.

---

## Scope of JSC Changes

These lists cover the main constructs, not every one; [TJS-SYNTAX.md](../TJS-SYNTAX.md)
is the full reference.

### Lexer / contextual keywords
- `:` in parameter and return position (already a valid token; needs context-sensitive handling), plus the `:!` / `:?` return markers and `!` / `?` parameter markers
- `Type`, `Generic`, `FunctionPredicate`, `Union`, `Enum` as contextual keywords
- `extend`, `given`, `test`, `wasm` as contextual keywords
- `const!`
- `TjsStrict` / `TjsCompat` dialect directives

### Parser
- Desugar `:` params to validated parameters (as the transpiler does today)
- Record `:` return examples as metadata and signature tests
- Desugar `Type`/`Generic`/`Union`/`Enum` declarations to `const` plus runtime calls
- Desugar `extend` blocks to `.call()` rewriting
- Desugar `given` to `switch` with explicit breaks
- Desugar `wasm {}` blocks (or hand them to a WASM compiler)
- Desugar polymorphic function declarations to a dispatcher plus variants

### Bytecode Compiler
- Emit type guard bytecodes at function entry instead of `typeof` check sequences
- Attach type metadata to function objects (replacing the `.__tjs` property assignment)
- Emit TJS equality bytecodes for `==` / `!=` (unconditional in `.tjs`)

### JIT (DFG/FTL in JSC)
- Use declared types as initial type assumptions (skip profiling warmup)
- Propagate types across call boundaries
- Speed up `Is()` using hidden class information

### What Stays Untouched
- Garbage collector
- Object model / hidden classes
- Module loader (TJS keeps ES module semantics)
- Most built-in functions
- Debugger protocol

---

## A Possible Rollout

Each phase would be useful on its own:

1. **Parser only.** Extend JSC's parser to understand TJS syntax, desugaring to the same JS the transpiler produces today. No runtime changes. Benefit: one parse, better error messages, no source maps needed.
2. **Type guards.** Replace the emitted `typeof` checks with bytecode-level guards. Benefit: warmup-free optimization and cross-function type propagation.
3. **Structural equality.** Implement `Is()` / `IsNot()` as engine primitives using hidden class information.
4. **Inline tests.** Run tests inside the compilation pipeline. Benefit: compile-time verification, and test results as type evidence for the JIT.
