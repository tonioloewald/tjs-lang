# Generic .d.ts Emission: Design Notes

_How TJS Generic declarations should emit TypeScript declarations for TS consumers._

---

## The Problem

TJS's `.d.ts` emitter (`src/lang/emitters/dts.ts`) currently emits Generics as:

```typescript
export declare function Box(...args: any[]): { check(value: any): boolean; ... };
```

This is technically correct but useless for TS autocomplete. A TypeScript consumer
of a TJS library gets no type information about what's inside a `Box<T>`.

The motivating case is tosijs's `BoxedProxy<T>` — a reactive Proxy wrapper where
`tosi({ app: { count: 0 } })` should return something that TypeScript sees as
having `.app.count` (with autocomplete), plus wrapper properties like `.path`,
`.value`, `.observe()`.

## Why This Matters

TJS consumers don't need any of this — they get autocomplete from the actual
runtime shape. But most of the JS ecosystem is TypeScript-first, so TJS
libraries need `.d.ts` files that TS consumers can work with. This is a
compatibility tax, not a language need.

## The Design Space

### Option 1: `declaration` Block on Generic

Embed the TS-visible shape directly in the Generic declaration:

```
Generic BoxedProxy<T> {
  description: 'typed state proxy'
  predicate(x, T) {
    return typeof x === 'object' && 'value' in x && 'path' in x && T(x.value)
  }
  declaration {
    value: T
    path: string
    observe(cb: (path: string) => void): void
    touch(): void
  }
}
```

The `declaration` block is metadata for `.d.ts` emission — it doesn't affect
runtime behavior. The emitter would output:

```typescript
export interface BoxedProxy<T> {
  value: T;
  path: string;
  observe(cb: (path: string) => void): void;
  touch(): void;
}
```

**Pros:** Explicit, no magic, single source of truth.
**Cons:** TypeScript syntax embedded in TJS. Doesn't handle the transparent
wrapper case (`tosi(foo)` looks like `foo`).

### Option 2: `wraps<T>` — First-Class Transparent Wrapper

A language-level concept for "this generic transparently exposes T's members":

```
Generic BoxedProxy wraps<T> {
  path: ''
  observe: (path: '') => {}
  touch: () => {}
  predicate(x, T) { ... }
}
```

`wraps<T>` means:
- T's properties are accessible through this object
- The `.d.ts` emitter generates `{ [K in keyof T]: BoxedProxy<T[K]> } & { path: string; ... }`
- Runtime validation checks that T's shape is present

**Pros:** Formalizes the Proxy pattern at the language level. The `.d.ts` emission
is automatic — no embedded TypeScript. More expressive than TypeScript's mapped
types because it describes a real runtime behavior.

**Cons:** New language concept. Only needed for the transparent wrapper pattern.

### Option 3: Hand-Maintained `.d.ts`

Ship a curated `.d.ts` file alongside the TJS output. For boxed-only proxy
(tosijs 2.0), this is maybe 40 lines instead of the current 288-line
`xin-types.ts`.

**Pros:** Works today, no TJS changes needed.
**Cons:** Two sources of truth. Manual maintenance. Defeats the purpose of
TJS generating everything from one source.

## Recommendation

Start with **Option 1** (`declaration` block) as it's the simplest useful
step. It covers the common case (Generic with known extra properties) without
new language concepts.

If the transparent wrapper pattern turns out to be common enough (Proxies,
ORMs, reactive state, etc.), graduate to **Option 2** (`wraps<T>`). This
would be a genuinely novel language feature — expressing at the type level
what JavaScript Proxies do at runtime.

## The Critical Constraint

For tosijs specifically: `tosi(foo)` must appear to have the same shape as
`foo` in TypeScript, or autocomplete breaks. This means the `.d.ts` for
`tosi()` needs to express:

```typescript
declare function tosi<T>(value: T): BoxedProxy<T>;
// where BoxedProxy<T> = { [K in keyof T]: BoxedProxy<T[K]> } & { value: T; path: string; ... }
```

This recursive mapped type is what gives TS the ability to autocomplete
`app.count` on the result. Option 1 can express this if the `declaration`
block supports `[K in keyof T]` syntax. Option 2 handles it automatically
via `wraps<T>`.

## Implementation Path

1. **Now:** The `.d.ts` emitter emits Generics as `any`-based stubs (done)
2. **Next:** Add `declaration` block parsing to Generic declarations
3. **Then:** Emit the declaration block content into `.d.ts` output
4. **Later:** Consider `wraps<T>` if the pattern is common enough

## Relationship to Other Work

- `src/lang/emitters/dts.ts` — the emitter that would consume this
- `src/lang/parser-transforms.ts` — `transformGenericDeclarations()` would
  need to preserve the declaration block as metadata
- `src/lang/emitters/from-ts.ts` — constrained generics (`<T extends Shape>`)
  could use the constraint as a fallback example value (separate improvement)
- `docs/native-engine-integration.md` — native engine support would make
  this even more powerful (type propagation across calls)
