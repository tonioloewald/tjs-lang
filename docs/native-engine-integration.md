<!--{"parent": "the-tjs-language.md", "order": 13, "book": ["default"]}-->
<!-- TODO review -->

# Native Engine Integration: TJS in V8 or JavaScriptCore

_Status: speculative design exploration (no engine work exists). Nothing on this page
describes shipped behaviour except the "Today" paragraphs, which describe what the
transpiler does now. It is written for readers curious about JavaScript engine internals;
you do not need any of it to use TJS._

---

## Why Native?

TJS transpiles to standard JavaScript. This works, but it means:

- Type checks are ordinary user code the JIT can't reason about
- Every validated function calls into a call-stack ring buffer (`__tjs.pushStack`, and `__tjs.popStack`)
- Structural comparison (`Is()`) is a recursive JS function call
- Inline `test` blocks run via `new Function()` at transpile time
- The source is parsed twice (TJS parse → emit JS → engine's JS parse)

Native engine support would turn TJS's type examples into **information the JIT can use
directly**, the same way it already uses hidden classes (the engine's internal record of
an object's property layout) and speculative type profiling, but with declared types
instead of observed ones.

---

## The Big Wins

### 1. Function Boundary Validation

**Today:** TJS emits `typeof` checks, `Number.isInteger()` calls and object shape
validation as inline JS. The JIT treats these as generic user code.

For this source, where `a: 0` is an example value (not a TypeScript literal type): it makes
`a` a required integer. The return `: 0` is an example result too, and it is tested (see
section 4):

```tjs
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

`__tjs` and `__tjs_rt` are the TJS runtime (shared and per-file); `__tjs_rt.__tv` unwraps a
tosijs reactive proxy to its value before the check. The trailing `popStack()` sits after
the `return`, so it is never reached: with the per-file inline runtime each call leaves
its name in the 64-slot ring, and a later error's call stack lists frames that already
returned. (The shared runtime records only with `configure({ callStacks: true })`.) That
is an emitter defect, not intended behaviour; native stack tracking would not have it.

The cost of these checks is measured in [benchmarks.md](../benchmarks.md) (generated
2026-08-19): on the simple-arithmetic benchmark the validated ("safe") version took about
1.5x as long as the unvalidated baseline, and the unsafe version (`function add(! a: 0,
b: 0)`, where the leading `!` turns the function's checks off) about 1.0x. A
three-function chain took 2.0x, because each function re-validates.

**Native:** Type checks become bytecode-level guards, the mechanism the JIT already uses
for speculative optimization:

- The guard still runs, because plain JS callers can pass anything. But everything after it can be compiled for integers from the first call, from the declaration rather than from observing 1000 calls. **No warmup period.**
- Integer checks use the engine's internal small-integer (Smi) representation directly, not `typeof` plus `Number.isInteger()`.
- Stack tracking disappears: the engine has its own call stack.
- The monadic error return path could be a deopt trap (a bail-out from optimized code to a slower path) rather than a function call, or the engine could build the `MonadicError` directly without the `typeError()` indirection.

### 2. Cross-Function Type Propagation

**Today:** Each function validates its own inputs. A leading `!` turns off all of a
function's checks, but that is a manual decision about which checks are redundant.

**Native:** The engine can **propagate types across call boundaries**:

```tjs
function add(a: 0, b: 0): 0 {
  return a + b
}

function calc(a: 0, b: 0): 0 {
  return add(a, b) // a and b already passed calc's integer guards
}
```

`calc` passes its own already-checked parameters straight to `add`, so the engine can prove
that `add`'s guards are satisfied on this call and **skip them**.

A source-level transpiler cannot do this in general, because any caller (including plain
JS) may call `add`. The engine can keep two entry points: a guarded one for unknown callers
and an unguarded one it calls directly when it has proved the arguments' types. That turns
per-function overhead into per-call-chain overhead: the outermost typed function pays, and
calls whose argument types are proven skip their guards.

The call counts in this table are illustrative, not measured. The transpiled checks cannot
be eliminated by today's JIT because a failed check returns a value, which is observable
control flow:

| Scenario | Current (transpiled) | Native engine |
|---|---|---|
| First call | Interpreted, runs typeof checks | JIT with declared types, no warmup |
| Warmup (100-1000 calls) | JIT profiles, still runs typeof checks | Already optimized |
| Hot (10000+ calls) | JIT may inline typeof but can't eliminate | Guards are internal, may be elided |
| Cross-function calls | Each function re-validates independently | Types propagate, redundant guards skipped |

### 3. Structural Equality as Engine Primitive

**Today:** Deep comparison is the `Is()` / `IsNot()` function, which recursively walks both
values. (`==` in native TJS is not structural: it is `===` with boxed primitives such as
`new Boolean(false)` unwrapped, and `null == undefined`.) Every `Is()` call pays function
call overhead plus property enumeration.

**Native:** The engine has internal knowledge that source-level code doesn't:

- **Hidden class comparison:** If two objects have the same hidden class (same properties in the same order, all primitive values), the engine can compare the stored values directly, close to a byte comparison (`memcmp`) of the value slots. The comparison stays O(n) in the number of slots, but loses the per-property lookup and call overhead.
- **Reference equality fast path:** `Is()` returns early on identical references, but only after probing both sides for a custom-equality hook and unwrapping boxed primitives. Natively the identity check could come first and skip the call.
- **Immutable value interning:** For small objects and arrays that are structurally identical and that the engine can prove are never mutated (frozen, for example), it could intern them (as it does for short strings), making the comparison a pointer check.
- **The custom-equality hook as engine trap:** an object can define its own equality with a `[Symbol.for('tjs.equals')](other) { … }` method, which `Is()` consults before comparing structurally. The engine could recognize it the way it recognizes `Symbol.toPrimitive`, without the generic property lookup.

### 4. Inline Tests as Compilation Assertions

**Today:** TJS runs `test` blocks and signature examples at transpile time, executing the
compiled code via `new Function()`. The results are reported separately from the emitted
code.

**Native:** Tests become part of the compilation contract:

- **Fail before bytecode:** If a function's test fails, the engine can refuse to compile it, catching the bug before any user code runs. Running tests on every load would work against the performance case, so this belongs in development or at build/install time, with production loading cached results (next bullet).
- **Cached test results:** The engine can key results to source hashes and skip re-running tests for unchanged functions across page loads and process restarts.
- **Test results as type hints:** A return example is both the declared result type and a test: `function add(a: 2, b: 3): 5` runs `add(2, 3)` and expects exactly `5`. One passing example proves nothing about other inputs, but it is a hint the JIT could speculate on in callers.
- **Assertion-based narrowing:** Tests that assert properties of return values (`expect(typeof result.name).toBe('string')`) give the JIT shape information about the returned object.

### 5. WASM Blocks

**Today:** a TJS function can contain an inline WebAssembly body, a `wasm {}` block, with
its ordinary JS body as the fallback ([DOCS-WASM.md](../DOCS-WASM.md)). The blocks are
compiled at transpile time into one module per file,
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
- **JSC's B3/Air backend** (its lowest optimizing tiers) looks, in our judgment, easier than V8's optimizing compiler to extend with new type guard primitives
- **Slower release cadence** than V8, so a fork is easier to maintain

In either engine, TJS syntax could be implemented as **desugaring in the parser**
(rewriting it into equivalent standard AST nodes), keeping changes out of the rest of the
engine.

### V8 (Chrome/Node/Deno): more impact

- **Most deployed engine** (Chrome, Node, Deno, Electron)
- Its parser is heavily optimized (lazy parsing, preparsing, parallel compilation), so changes are higher risk
- V8 releases about every four weeks, so maintaining a fork is more work

**Suggested starting point:** JSC via Bun. tjs-lang is developed on Bun and already ships
a Bun plugin for importing `.tjs` files (the plugin runs the transpiler; it is not engine
work), so Bun is the natural first host.

A native engine would be an accelerator, not a replacement. Browsers, Node and any
unpatched Bun would still run transpiled output, so the transpiler stays the portable path,
and native behaviour would have to match it exactly (checked by differential tests against
transpiled output).

---

## Scope of JSC Changes

These lists cover the main constructs, not every one; [TJS-SYNTAX.md](../TJS-SYNTAX.md)
is the full reference.

### Lexer / contextual keywords
TJS syntax would be enabled only for `.tjs` modules; plain `.js` parses exactly as today,
so `test`, `given` and the rest stay ordinary identifiers there.

- `:` in parameter and return position (already a valid token; needs context-sensitive handling), plus the `:!` / `:?` return markers and `!` / `?` parameter markers
- `Type`, `Generic`, `FunctionPredicate`, `Union`, `Enum` as contextual keywords
- `extend`, `given`, `test`, `wasm` as contextual keywords
- `const!` (compile-time immutability)
- `TjsStrict` / `TjsCompat` dialect directives (which language a file is)

### Parser
- Desugar `:` params to validated parameters (as the transpiler does today)
- Record `:` return examples as metadata and signature tests
- Desugar `Type`/`Generic`/`Union`/`Enum` declarations to `const` plus runtime calls
- Desugar `extend` blocks (local methods on existing classes, no prototype changes) to `.call()` rewriting
- Desugar `given` to `switch` with explicit breaks
- Desugar `wasm {}` blocks (or hand them to a WASM compiler)
- Desugar polymorphic functions (several same-name declarations) to a dispatcher plus variants

### Bytecode Compiler
- Emit type guard bytecodes at function entry instead of `typeof` check sequences
- Attach type metadata to function objects (replacing the `.__tjs` property assignment)
- Emit TJS equality bytecodes for `==` / `!=` (every `.tjs` file uses TJS equality)

### JIT (DFG/FTL, JSC's optimizing tiers)
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

1. **Parser only.** Extend JSC's parser to understand TJS syntax, desugaring to the same JS the transpiler produces today. No runtime changes. Benefit: one parse, and errors that point at the `.tjs` source directly, where transpiled output needs source maps to do that.
2. **Type guards.** Replace the emitted `typeof` checks with bytecode-level guards. Benefit: warmup-free optimization and cross-function type propagation.
3. **Structural equality.** Implement `Is()` / `IsNot()` as engine primitives using hidden class information.
4. **Inline tests.** Run tests inside the compilation pipeline. Benefit: compile-time verification, and test results as type hints for the JIT.

WASM blocks are left out: they already compile at transpile time, so folding them into the
engine pipeline only saves the base64 step and can wait until the phases above exist.

Nothing here is scheduled.
