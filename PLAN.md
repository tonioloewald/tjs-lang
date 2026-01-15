# TJS Roadmap

## Philosophy

TJS is a practical language that targets multiple runtimes. The type system is *descriptive* rather than *prescriptive* - types explain what they are, validate at runtime, and degrade gracefully. No TypeScript gymnastics.

The runtime is JavaScript today, but it's *our* JavaScript - the sandboxed expression evaluator, the fuel-metered VM. When we target LLVM or SwiftUI, we compile our AST, not arbitrary JS.

## 1. Type() Builtin

A new builtin for defining types with descriptions and runtime validation.

### Forms

```typescript
// Full form: description + predicate
const ZipCode = Type('5-digit US zip code', (s) => /^\d{5}$/.test(s))
const PositiveInt = Type('positive integer', (n) => Number.isInteger(n) && n > 0)
const MatchingPasswords = Type(
  'passwords must match',
  (o) => o.password === o.confirmPassword
)

// Schema shorthand (common case)
const Email = Type('valid email', s.string.email)
const Age = Type(s.number.min(0).max(150))

// Description optional when schema is self-explanatory
const UserId = Type(s.string.uuid)
```

### Why

- **Self-documenting**: description IS the type for humans and LLMs
- **Runtime-checkable**: predicate runs when needed
- **Composable**: union/intersection combine predicates
- **Replaces regex-as-type**: more expressive, leaves regexes for actual patterns
- **Escapes TypeScript corner cases**: no `Pick<Omit<Partial<Required<...>>>>`

### Predicates

Predicates are sync JS functions that run in our runtime:
- Pure expression evaluation (same `$expr` nodes we have)
- No async, no IO - type checks are in the hot path
- Sandboxed: no prototype access, no globals
- Portable: can be translated to any target

### Simple Syntax Sugar Remains

```typescript
// These still work - Type() is the escape hatch, not the default
function greet(name: string, times: number = 1) { ... }
function delay(ms = 1000) { ... }
function fetch(url: string, timeout = +5000) { ... }
```

## 2. Conditional Compilation with target()

Explicit target blocks for platform-specific code.

```typescript
target(browser) {
  document.body.appendChild(el)
}

target(node) {
  process.stdout.write(str)
}

target(browser & debug) {
  console.log('Debug mode in browser')
}

target(browser | node) {
  // Runs in either
}
```

### Targets

**Current:**
- `browser`
- `node`
- `bun`
- `debug`
- `production`

**Future:**
- `swiftui`
- `android`
- `ios`
- `win64`
- `llvm`

### Composition

- `&` - both must match
- `|` - either matches
- `target(production)` strips `test {}` blocks and debug code

## 3. Monadic Errors and Debug Mode

### try {} Without catch

Bare `try` blocks convert to monadic error returns:

```typescript
try {
  let data = riskyOperation()
  process(data)
}
// No catch - transforms to:
// if error, return { $error: true, message, op, cause }
```

Errors become values, not exceptions. Subsequent code is skipped (monadic flow).

### AgentError Introspection

Errors carry full context:

```typescript
{
  $error: true,
  message: 'Connection refused',
  op: 'httpFetch',              // which atom failed
  cause: <original exception>,  // for debugging
  // With --debug:
  source: 'orders.tjs:47:3',    // exact location
  callStack: [                  // how we got here
    'ship() at orders.tjs:47:3',
    'processOrder() at checkout.tjs:123:5',
    'handleSubmit() at form.tjs:89:12'
  ]
}
```

### --debug Flag

When transpiled with `--debug`:
- Functions know what they were called and where they came from
- Errors include source locations and call stacks
- Runtime can reconstruct the full path to failure

```typescript
// With --debug, errors show:
// Error: Invalid ZipCode at ship() (orders.tjs:47:3)
//   called from processOrder() (checkout.tjs:123:5)
//   called from handleSubmit() (form.tjs:89:12)
```

### Current State

- ✅ Monadic errors (AgentError class)
- ✅ try {} without catch transforms
- ⏳ Error introspection (op and message, not full stack)
- ❌ --debug source mapping
- ❌ Call stack in errors

## 4. test('description') {} Blocks

Inline tests that hoist to bottom of file for execution.

```typescript
const ZipCode = Type('5-digit US zip code', (s) => /^\d{5}$/.test(s))

test('ZipCode validates correctly') {
  assert(ZipCode.check('12345'))
  assert(!ZipCode.check('1234'))
  assert(!ZipCode.check('123456'))
  assert(!ZipCode.check('abcde'), 'letters should fail')
}

function ship(to: ZipCode, quantity: PositiveInt) {
  // ...
}

test('ship requires valid zip and quantity') {
  ship('12345', 1)  // ok
  assertThrows(() => ship('bad', 1))
}
```

### Failure Output

```
FAIL: ZipCode validates correctly
  assert(!ZipCode.check('1234'))  ← auto-generated from source

FAIL: ship requires valid zip and quantity
  letters should fail  ← custom message when provided
  assert(!ZipCode.check('abcde'), 'letters should fail')
```

### Rules

- `test('description')` - description required, explains what's being tested
- `assert(expr)` - auto-describes from source code on failure
- `assert(expr, 'reason')` - custom message overrides auto-description
- Tests live next to the code they test
- Hoisted to bottom for execution order
- Stripped in `target(production)`
- Like Rust's `#[test]` but inline

## 5. Pragmatic Native Types

Trust constructor names for platform types:

```typescript
// Instead of shipping 50KB of DOM type definitions:
// - el instanceof HTMLElement checks constructor.name
// - If someone lies about their constructor, that's on them
```

This applies to:
- DOM types (HTMLElement, Event, etc.)
- Node types (Buffer, Stream, etc.)
- Platform types (SwiftUI views, Android widgets)

## 6. Future: Multi-Target Emission

The same TJS source compiles to:
- JavaScript (current)
- LLVM IR (native binaries)
- Swift (iOS/macOS)
- Kotlin (Android)

Platform builtins vary by target:
- `browser`: `document`, `window`, `fetch`
- `swiftui`: `VStack`, `HStack`, `Text`, `Button`
- `android`: `View`, `TextView`, `LinearLayout`

The AST is the source of truth. Targets are just emission strategies.

---

## Implementation Status

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Type() | ❌ | Foundation for everything |
| 2 | target() | ❌ | Conditional compilation |
| 3 | Monadic Errors | ⏳ | Have AgentError, need --debug/call stacks |
| 4 | test() blocks | ❌ | Hoisting, stripping |
| 5 | Pragmatic natives | ⏳ | Some constructor checks exist |
| 6 | Multi-target | ❌ | Future - JS only for now |
| 7 | Safety flags | ❌ | --allow-unsafe, --yolo |
| 8 | Single-pass | ⏳ | CLI exists, not unified |
| 9 | Module system | ❌ | Versioned imports |
| 10 | Autocomplete | ⏳ | Playground has some |
| 11 | Eval() | ⏳ | Expression eval exists, not exposed |

## Implementation Priority

| Priority | Feature | Why |
|----------|---------|-----|
| 1 | **Type()** | Foundation for type system |
| 2 | **Autocomplete** | Do or die - dev experience |
| 3 | **test() blocks** | TDD, in-file productivity |
| 4 | **--debug / call stacks** | Error experience |
| 5 | **Eval()** | Expose existing work |
| 6 | **target()** | Conditional compilation |
| 7 | **Safety flags** | Polish |
| 8 | **Single-pass** | Polish |
| 9 | **Modules** | Can wait |

## 7. Safety Levels and Flags

### Defaults: Safe and Correct

By default, TJS is strict:
- All type contracts enforced
- Lint errors block compilation
- Unknown types are errors

### Escape Hatches

```bash
tjs build app.tjs                    # strict, safe defaults
tjs build app.tjs --allow-unsafe     # let nasty TS libs pass through
tjs build app.tjs --yolo             # bypass all safeguards (--just-fucking-doit)
```

- `--allow-unsafe`: Complex/unknown types become best-effort runtime checks, warnings not errors
- `--yolo`: Skip all validation, emit anyway (for when you know what you're doing)

### Lint Integration

Lint errors block safe builds. Not warnings - errors. If you want to ship broken code, use `--yolo`.

## 8. Single-Pass Pipeline

One command does everything:

```bash
tjs build app.tjs
```

In a single pass:
1. **Lint** - catch errors early
2. **Transpile** - emit target code
3. **Test** - run inline tests (unless `--no-test`)
4. **Docs** - extract documentation from types and descriptions

No separate `tjs lint && tjs build && tjs test && tjs docs`. One pass, all the information is right there.

## 9. Module System

### Versioned Imports (Native Approach)

```typescript
import { Thing } from 'https://pkg.example.com/thing@1.2.3/mod.tjs'
import { Other } from './local.tjs'
```

- URLs with versions are the native import mechanism
- No node_modules, no package.json resolution dance
- Imports are cached by URL+version
- Works like Deno, but we got here independently

### Bundler Compatibility

TJS also works inside conventional bundlers:
- Emits standard ES modules
- Can be a webpack/vite/esbuild plugin
- Or replace bundling entirely with versioned imports

Your choice. We don't force either approach.

## 10. Autocomplete by Introspection

IDE support via runtime introspection, not static `.d.ts` files.

### Heuristic Levels (Progressive Fallback)

**Level 0: Local symbols** (instant, always)
- Scan current file for identifiers
- Function names, variable names, parameter names
- Known atoms
- Like BBEdit - fast, useful, no dependencies

**Level 1: Type-aware** (fast, from syntax)
- Parameter `name: 'Sarah'` → string, offer string methods
- Variable `x: 17` → number
- No runtime needed, just syntax analysis

**Level 2: Runtime introspection** (when idle)
- Actually run code with mocks up to cursor
- Get real shapes from execution
- Nice to have, not blocking

### Strategy

- Start fast (Level 0+1), upgrade async in background
- Typing rapidly? Stay at Level 0
- Paused 200ms? Try Level 1
- Paused 500ms? Try Level 2
- Cache aggressively - same signature = same completions

### Versioned Imports Make This Insane

```typescript
import { ship } from 'https://pkg.example.com/shipping@2.0.0/mod.tjs'
```

- Module already transpiled (cached by URL+version)
- Already introspected (we know its exports)
- Immutable (version pinned, never changes)
- Autocomplete for `ship.` is instant forever

No node_modules crawling. No LSP server eating 4GB RAM. One file, one unit, instant knowledge.

### Non-Goals

- External LSP dependencies
- TypeScript language server
- Crawling dependency graphs

## 11. Eval() - Safe Expression Evaluation

A builtin for evaluating expressions with fuel limits:

```typescript
// Low default fuel - won't run away
Eval('2 + 2')  // ~100 fuel default

// Explicitly allow more for complex work
Eval('fibonacci(20)', { fuel: 1000 })

// Restrict for untrusted input
Eval(userInput, { fuel: 10 })
```

### Why

- Same sandboxed evaluator we already have, exposed as builtin
- Safe by default - low fuel limit prevents runaway computation
- No `eval()` - this is AST evaluation, not string execution
- Fuel exhaustion returns error, doesn't throw

### Options

```typescript
Eval(expression, {
  fuel: 100,        // max fuel (default: 100)
  context: {},      // variables available to expression
  timeout: 1000,    // ms timeout (default: fuel * 10)
})
```

## Non-Goals

- TypeScript compatibility (we're inspired by, not constrained by)
- Full JS semantics (we're a subset that's portable)
- Complex generics (Type() is the escape hatch)
