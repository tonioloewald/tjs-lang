# TJS: The Host Language

**Build Universal Endpoints. Delete the build server.**

Most languages compile to binaries. TJS compiles to **Universal Endpoints**—services that accept and execute arbitrary logic safely, with zero deployment per agent.

---

## The Architecture: Browser Model for the Cloud

We separate **Host** (infrastructure you deploy once) from **Guest** (logic that ships continuously).

| | **TJS (Host)** | **AJS (Guest)** |
|---|---|---|
| **Role** | Defines the physics—capabilities, resources, safety | The portable logic payload |
| **You write** | Your service layer, frontend, capabilities | Agents, workflows, LLM-generated code |
| **Deploys** | Once, then evolves | Continuously, as data |
| **Trust level** | Trusted code you control | Untrusted code from anywhere |

**Together:** Deploy TJS once to create a secure, high-performance Universal Endpoint. Ship AJS continuously to execute logic where the data lives.

**See also:** [AJS Documentation](./ABOUT-AJS.md) for the Guest language.

---

## Why TJS is the Ultimate Host Language

TJS isn't just "TypeScript with runtime types." It's specifically designed to **survive the Guest**.

### 1. Monadic Errors: The Host Never Crashes

A Universal Endpoint can't crash when a guest misbehaves. TJS enforces robustness:

```typescript
// Type failure returns error object, not exception
const result = createUser({ name: 123 })
// { $error: true, message: 'Invalid input', path: 'createUser.input' }

if (result.$error) {
  // Handle gracefully—log, retry, or return to caller
  return { status: 'invalid', details: result }
}
```

No `try/catch` gambling. No unhandled exceptions. The host survives anything the guest throws at it.

### 2. Introspection: Autocomplete from Reality

TJS provides **runtime introspection**, not static type files:

```typescript
// The runtime knows what this function accepts
console.log(createUser.__tjs)
// {
//   params: { input: { type: { kind: 'object', shape: { name: 'string', age: 'number' } } } },
//   returns: { kind: 'object', shape: { id: 'number' } }
// }
```

- **Autocomplete by introspection:** Editor queries live objects, not stale `.d.ts` files
- **No API drift:** Backend adds a field, frontend sees it immediately
- **Self-documenting capabilities:** Agents can inspect what the host offers

### 3. Inline WASM: Raw Power Without Breaking Abstraction

When agents need compute, you don't leave TJS. You drop into `wasm {}`:

```typescript
function vectorDot(a: [0], b: [0]) -> 0 {
  let sum = 0
  wasm {
    for (let i = 0; i < a.length; i++) {
      sum = sum + a[i] * b[i]
    }
  }
  return sum
}
```

- Variables captured automatically
- Falls back to JS if WASM unavailable
- The Universal Endpoint stays fast without breaking the abstraction

### 4. Structural Equality: Is/IsNot

JavaScript's `==` is broken (type coercion). TJS provides `Is` and `IsNot` operators:

```typescript
// Structural comparison - no coercion
[1, 2] Is [1, 2]       // true
5 Is "5"               // false (different types)
{ a: 1 } Is { a: 1 }   // true

// Custom equality via .Equals hook
class Point {
  constructor(x: 0, y: 0) { this.x = x; this.y = y }
  Equals(other) { return this.x === other.x && this.y === other.y }
}
Point(1, 2) Is Point(1, 2)  // true (via .Equals)
```

`Is` and `IsNot` are stepping stones—the goal is for `==` and `!=` to eventually work correctly in native TJS.

### 5. Classes Without Ceremony

TJS classes are callable without `new`—less ceremony, same semantics:

```typescript
class Timestamp {
  #value
  
  constructor(initial: '' | 0 | null) {
    this.#value = initial === null ? new Date() : new Date(initial)
  }
  
  set value(v: '' | 0 | null) {
    this.#value = v === null ? new Date() : new Date(v)
  }
  
  get value() {
    return this.#value
  }
}

// Both work identically:
const ts1 = Timestamp('2024-01-15')   // TJS way—clean
const ts2 = new Timestamp('2024-01-15') // Also works (lint warning)

// Asymmetric types captured automatically:
ts1.value = 0        // SET accepts: string | number | null
ts1.value            // GET returns: Date
```

TypeScript-to-TJS conversion handles the transformation:
- `private foo` → `#foo` (native private fields)
- Class wrapped with Proxy for callable-without-new
- Getter/setter types captured in metadata

### 6. Literate Programming: Documentation That Can't Rot

If the endpoint lives forever while agents change constantly, docs must live in the code:

```typescript
/**
 * Create a new user in the system.
 * 
 * @capability Requires `store` capability with write access.
 * @rateLimit 100 requests per minute per API key.
 * 
 * @example
 * createUser({ name: 'Alice', email: 'alice@example.com', age: 30 })
 * // => { id: 12345, created: '2025-01-19T...' }
 * 
 * @test
 * const result = createUser({ name: 'Test', email: 'test@test.com', age: 25 })
 * expect(result.id).toBeNumber()
 */
function createUser(input: { name: 'Alice', email: 'a@b.com', age: 30 }) -> { id: 0 } {
  return store.insert('users', input)
}
```

Tests and docs are extracted automatically. The API *is* its own manual.

---

## The Zero-Build Frontend

TJS transpiles **in the browser**. No webpack. No Vite. No `npm install`.

### The Unbroken Chain

1. **Write:** TJS in your editor (or browser)
2. **Transpile:** In the browser, no build server
3. **Run:** Immediately, with full type safety
4. **Autocomplete:** From live introspection, not static files

### Unbundled Imports

```typescript
// Fetched, transpiled, and linked on demand
import { Button } from 'https://cdn.example.com/ui-kit.tjs'
import { validate } from './utils/validation.tjs'
```

- **Zero-install dev:** New developer opens file, browser fetches imports, running in seconds
- **True separate compilation:** Update one file, client downloads only that file
- **Cache-friendly:** Each module cached independently

### The Stack You Delete

| Before | After |
|--------|-------|
| TypeScript | TJS |
| Webpack/Vite | Browser |
| Babel | Browser |
| `node_modules` | Import URLs |
| Source maps | Direct execution |
| Build server | Nothing |

---

## For Different Audiences

### For the CEO

**Ship faster. Break nothing.**

- **Zero deployment friction:** Change logic without redeploying infrastructure
- **Runtime safety:** Type errors caught in production, not just development
- **AI-ready:** LLMs can generate, inspect, and fix code programmatically

### For the CTO

**The security model that survives AI agents.**

- **Monadic errors:** No unhandled exceptions, ever
- **Capability-based:** Host controls exactly what guests can access
- **Introspectable:** Full audit trail of what code does what
- **Performance:** 1.5x overhead for validation, 0x for compute (WASM)

### For the Engineer

**The Smalltalk/Lisp experience, with syntax you know.**

- **Live coding:** Edit, save, see—no rebuild cycle
- **Real autocomplete:** From runtime objects, not type guesses
- **Inline everything:** Tests, docs, WASM, all in one file
- **Errors as data:** Handle failures, don't catch exceptions

### For the Frontend Dev

**Delete your build tools.**

- **No webpack config:** Browser is the compiler
- **No `node_modules`:** Imports are URLs
- **No source maps:** You're running TJS directly
- **No "works on my machine":** Browser is the single source of truth

---

## Performance

| Mode | Overhead | Use Case |
|------|----------|----------|
| `safety none` | **1.0x** | Metadata only, no validation |
| `safety inputs` | **~1.5x** | Production with validation (single-arg objects) |
| `safety inputs` | ~11x | Multi-arg functions (schema fallback) |
| `safety all` | ~14x | Debug mode |
| `(!) unsafe` | **1.0x** | Hot paths |
| `wasm {}` | **<1.0x** | Compute-heavy code |

### Why 1.5x, Not 25x

Most validators interpret schemas at runtime (~25x). TJS generates inline checks at transpile time:

```typescript
// Generated (JIT-friendly)
if (typeof input !== 'object' || input === null ||
    typeof input.name !== 'string' ||
    typeof input.age !== 'number') {
  return { $error: true, message: 'Invalid input', path: 'createUser.input' }
}
```

No schema interpretation. No object iteration. The JIT inlines these completely.

---

## The Pitch

> **You aren't just building a better language. You're building a better browser development model.**

TJS merges Editor, Compiler, and Runtime into one fluid loop. It's the Smalltalk dream realized with syntax people actually know.

- **Write TJS** → Browser compiles it
- **Type `user.`** → Autocomplete from live data
- **Throw an error** → Caught as a value, not a crash
- **Deploy once** → Ship agents forever

**The result:** A frontend dev gets Type Safety + Autocomplete + No Build Step. They never go back to `npm install webpack` again.

---

## Quick Links

- [AJS: The Guest Language](./ABOUT-AJS.md)
- [Technical Documentation](./CONTEXT.md)
- [Playground](./demo/)
- [GitHub](https://github.com/tonioloewald/tosijs-agent)
