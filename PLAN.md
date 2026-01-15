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

## 3. Debug Mode (--debug)

When transpiled with `--debug`:
- Functions know what they were called and where they came from
- Stack traces point to original source locations
- Runtime can insert stack traces on error

```typescript
// With --debug, errors show:
// Error: Invalid ZipCode at ship() (orders.tjs:47:3)
//   called from processOrder() (checkout.tjs:123:5)
//   called from handleSubmit() (form.tjs:89:12)
```

## 4. test {} Blocks

Inline tests that hoist to bottom of file for execution.

```typescript
const ZipCode = Type('5-digit US zip code', (s) => /^\d{5}$/.test(s))

test {
  assert(ZipCode.check('12345'))
  assert(!ZipCode.check('1234'))
  assert(!ZipCode.check('123456'))
  assert(!ZipCode.check('abcde'))
}

function ship(to: ZipCode, quantity: PositiveInt) {
  // ...
}

test {
  ship('12345', 1)  // ok
  assertThrows(() => ship('bad', 1))
}
```

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

## Implementation Order

1. **Type()** - foundation for everything else
2. **target()** - conditional compilation
3. **test {}** - inline tests with hoisting
4. **--debug** - source mapping and stack traces
5. Native type pragmatism - trust constructors
6. Additional targets as needed

## Non-Goals

- TypeScript compatibility (we're inspired by, not constrained by)
- Full JS semantics (we're a subset that's portable)
- Complex generics (Type() is the escape hatch)
