# TJS Branch Overview

**108 commits** implementing TJS (Typed JavaScript) - a complete language layer on top of the tosijs VM.

## Executive Summary

This branch transforms tosijs from a VM with a builder API into a **full language ecosystem** with:

- A new language (TJS) that transpiles to JavaScript with runtime type safety
- TypeScript-to-TJS conversion for gradual migration
- Interactive playground with autocomplete
- Comprehensive tooling (CLI, Bun plugin, linter)

## Major Features

### 1. TJS Language (`src/lang/`)

A TypeScript-like language where **types are examples**:

```typescript
// TJS - types via example values
function greet(name: 'World', times: 3) -> '' {
  return `Hello, ${name}!`.repeat(times)
}

// Transpiles to JS with runtime validation + __tjs metadata
```

**Key syntax:**

- `name: 'example'` - required param with type inferred from example
- `name = 'default'` - optional param with default
- `-> returnType` - return type annotation
- `(!)` - unsafe marker (skip validation for hot paths)
- `a Is b` / `a IsNot b` - structural equality operators

### 2. Type System (`src/lang/runtime.ts`)

Runtime type validation with minimal overhead:

- **Type()** - define types with predicates: `Type('positive', n => n > 0)`
- **Generic()** - runtime-checkable generics
- **Union()** - discriminated unions
- **Enum()** - string/numeric enums
- **Is()/IsNot()** - structural equality with `.Equals` hook

**Safety levels:**

- `safety none` - metadata only, no validation
- `safety inputs` - validate function inputs (~1.5x overhead)
- `safety all` - validate inputs and outputs

### 3. TypeScript → TJS Converter (`src/lang/emitters/from-ts.ts`)

Converts TypeScript to TJS syntax:

```typescript
// TypeScript
function greet(name: string, age?: number): string { ... }

// Converts to TJS
function greet(name: '', age = 0) -> '' { ... }
```

Handles: interfaces → Type, type aliases, enums → Enum, literal unions → Union, classes with private fields, generics, utility types.

### 4. Class Support

Classes work without `new` keyword:

```typescript
class User {
  #name // private fields via #
  constructor(name: '') {
    this.#name = name
  }
}

const u = User('Alice') // No 'new' needed
```

- `wrapClass()` makes classes callable
- Private fields: `private foo` → `#foo`
- Full getter/setter support
- Inheritance preserved

### 5. Inline Tests

Tests live next to code:

```typescript
function double(x: 0) -> 0 { return x * 2 }

test('doubles numbers') {
  expect(double(5)).toBe(10)
}
```

- Tests extracted at compile time
- Can run during transpilation
- Stripped in production builds

### 6. Interactive Playground (`demo/`)

Browser-based IDE with:

- CodeMirror editor with TJS syntax highlighting
- **Autocomplete** via runtime introspection
- Tabbed output: JS, Preview, Docs, Tests, Console
- Module store (IndexedDB) with validation
- Import resolution (local modules + esm.sh CDN)
- Service worker caching

### 7. CLI Tools (`src/cli/`)

```bash
bun src/cli/tjs.ts check file.tjs   # Parse and type check
bun src/cli/tjs.ts run file.tjs     # Transpile and execute
bun src/cli/tjs.ts emit file.tjs    # Output transpiled JS
bun src/cli/tjs.ts types file.tjs   # Output type metadata
bun src/cli/tjs.ts convert file.ts  # Convert TS to TJS
```

### 8. Bun Plugin (`src/bun-plugin/`)

Native `.tjs` file support:

```bash
bun file.tjs  # Just works
```

### 9. Linter (`src/lang/linter.ts`)

Static analysis:

- Unused variables
- Unreachable code
- `no-explicit-new` (warns on unnecessary `new`)

### 10. Documentation Generation (`src/lang/docs.ts`)

Auto-generates docs from function signatures and inline tests.

### 11. Debug Mode

Full call stacks in errors:

```typescript
{
  $error: true,
  message: 'Invalid input',
  path: 'createUser.input',
  stack: ['main', 'processUser', 'createUser']
}
```

### 12. Autocomplete System

Two-tier approach:

1. **Curated completions** for common APIs (console, Math, JSON)
2. **Runtime introspection** for everything else (browser APIs, user code)

Conditionally includes browser globals (crypto, navigator, document, etc.)

## Architecture Changes

```
src/
├── lang/                    # NEW: TJS language implementation
│   ├── parser.ts           # TJS parser with preprocessing
│   ├── runtime.ts          # Type(), Generic(), Is(), wrap(), etc.
│   ├── inference.ts        # Type inference from examples
│   ├── linter.ts           # Static analysis
│   ├── tests.ts            # Inline test extraction
│   ├── docs.ts             # Documentation generation
│   └── emitters/
│       ├── js.ts           # TJS → JavaScript
│       ├── ast.ts          # TJS → Agent99 AST
│       └── from-ts.ts      # TypeScript → TJS
├── cli/                     # NEW: CLI tools
├── bun-plugin/              # NEW: Bun plugin for .tjs
└── vm/                      # Existing VM (unchanged)

demo/
├── src/
│   ├── playground.ts       # AJS playground
│   ├── tjs-playground.ts   # TJS playground
│   ├── module-store.ts     # IndexedDB module storage
│   ├── imports.ts          # Import resolution
│   └── autocomplete.ts     # Autocomplete logic

editors/
└── codemirror/
    └── ajs-language.ts     # Syntax highlighting + autocomplete
```

## Test Coverage

- **966 tests passing** (29 skipped LLM tests)
- `src/lang/lang.test.ts` - 46KB comprehensive language tests
- `src/lang/codegen.test.ts` - Code generation quality tests
- `src/lang/docs.test.ts` - Documentation generation tests
- `src/lang/typescript-syntax.test.ts` - TS→TJS conversion tests

## Performance

| Mode            | Overhead | Use Case                        |
| --------------- | -------- | ------------------------------- |
| `safety none`   | 1.0x     | Metadata only                   |
| `safety inputs` | ~1.5x    | Production (single-arg objects) |
| `(!) unsafe`    | 1.0x     | Hot paths                       |
| WASM blocks     | <1.0x    | Compute-heavy                   |

## What's Complete (from PLAN.md)

- ✅ Type() builtin
- ✅ Monadic errors with debug stacks
- ✅ test() blocks
- ✅ Safety levels (none/inputs/all)
- ✅ Module system (IndexedDB + CDN)
- ✅ Autocomplete
- ✅ Eval()/SafeFunction
- ✅ Function introspection (\_\_tjs)
- ✅ Generic()
- ✅ Asymmetric get/set
- ✅ Is/IsNot (structural equality)
- ✅ WASM blocks (POC)
- ✅ Death to `new`
- ✅ Linter
- ✅ TS→TJS converter
- ✅ Docs generation
- ✅ Class support

## What's Post-MVP

- ❌ target() - conditional compilation for build flags
- ❌ Multi-target emission (LLVM, SwiftUI, Android)

## Breaking Changes

None - this is additive. The existing VM and builder API are unchanged.

## Migration

No migration needed. New code can use TJS, existing code continues to work.
