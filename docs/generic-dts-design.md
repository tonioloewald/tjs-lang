<!--{"parent": "typescript-good-bad-ugly.md", "order": 2}-->
<!-- TODO review -->

# Generic .d.ts Emission: Design Notes

_How TJS Generic declarations emit TypeScript declarations for TS consumers._

A TJS `Generic` is not TypeScript's `<T>`. It is a runtime type constructor: you
call it with an example value for T (`Box(0)` means "a Box of integers") and get
back a checker with `.check(value)`. Its `predicate(x, T)` is the runtime test,
and inside it T is a checker function built from that example, not a static
type. See [Generics](../TJS-FOR-TS.md#generics) in TJS for TypeScript
Programmers, and [TJS Syntax](../TJS-SYNTAX.md) for why a value such as `0`
stands for a type.

> **Status (checked 2026-11-06).** Today: add a `declaration { … }` block to a
> Generic to get a real TypeScript interface in the `.d.ts`, or start the block
> with `// TS:` to emit any type alias verbatim, conditional and mapped types
> included. The `wraps<T>` proposal (Option 2) is not implemented. The emitted
> interface has no value declaration for the runtime factory; see the
> [limitation](#limitation-a-type-or-a-factory-not-both) below. For how to
> generate `.d.ts` files, see "`.d.ts` generation" in
> [TJS for TypeScript Programmers](../TJS-FOR-TS.md).
>
> History: this is a design record written 2026-03-19. The `declaration` block
> shipped the same day (commit `7a07fd85`), the `// TS:` form on 2026-03-29
> (`0c7d5912`), and complex `// TS:` types were hardened on 2026-08-07
> (`64145501`); a build from before August may emit different output.

---

## The Problem

Here is a Generic with no declaration block:

```tjs
export Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
}
```

At run time `Box` is a function: it takes an example and returns a checker.
Before declaration blocks, TJS's `.d.ts` emitter typed every Generic as exactly
that, a factory stub, and it still does for a Generic with no `declaration`
block:

```typescript
export declare function Box(...args: any[]): { check(value: any): boolean; (value: any): boolean; };
```

The stub types the factory, but T disappears into `any`. A TypeScript consumer
of a TJS library learns nothing about what is inside a `Box<T>`, and gets no
autocomplete for it.

The motivating case is tosijs, a reactive-state library written alongside TJS.
`tosi(obj)` returns a Proxy over `obj`. In the boxed-only design discussed here
(planned for tosijs 2.0), every property access on that proxy returns a "box":
an object with wrapper members such as `.value` (the current value), `.path`
(where it lives, such as `'app.count'`) and `.observe()`. So
`tosi({ app: { count: 0 } }).app.count` is a box, and `.app.count.value` is the
number.

`tosi` is a separate function. A `BoxedProxy` Generic only describes and checks
what `tosi` returns.

The proxy is a **transparent wrapper**: it exposes every member of the wrapped
object, recursively, plus its own wrapper members. TypeScript has to see the
same property names as the wrapped object (so `.app.count` autocompletes) with a
box at each step (so `.value` and `.path` autocomplete too).

## Why This Matters

TJS consumers don't need any of this: TJS tooling reads a Generic's runtime
values and `__tjs` metadata directly (the playground's autocomplete introspects
live values). But most of the JS ecosystem is TypeScript-first, so TJS
libraries need `.d.ts` files that TS consumers can work with. This is a
compatibility tax, not a language need.

## The Critical Constraint

For tosijs specifically, the `.d.ts` for `tosi()` has to express the
transparent wrapper, or autocomplete breaks:

```typescript
declare function tosi<T>(value: T): BoxedProxy<T>;
// where BoxedProxy<T> = { [K in keyof T]: BoxedProxy<T[K]> } & { value: T; path: string; ... }
```

This recursive mapped type is what lets TypeScript autocomplete `.app.count` on
the result. Any option for emitting Generics is judged by whether it can
produce this type.

## The Design Space

### Option 1: `declaration` Block on Generic (shipped)

Embed the TS-visible shape directly in the Generic declaration. This is valid
TJS today: `tjs check` passes it, and the two `console.log` lines print `true`
and `false`.

```tjs
export Generic BoxedProxy<T> {
  description: 'typed state proxy'
  // T is a checker built from the example you pass:
  // BoxedProxy(0) means "T is an integer"
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && 'path' in x && T(x.value)
  }
  declaration {
    value: T
    path: string
    observe(cb: (path: string) => void): void
    touch(): void
  }
}

const IntProxy = BoxedProxy(0)
console.log(IntProxy.check({ value: 1, path: 'app.count' }))     // true
console.log(IntProxy.check({ value: 'one', path: 'app.count' })) // false
```

The `declaration` block is metadata for `.d.ts` emission. It is removed from
the emitted JavaScript and does not affect runtime behavior. Its lines are
TypeScript, not TJS: `path: string` here is a TS type, not an example.
`tjs emit --dts` outputs:

```typescript
export interface BoxedProxy<T> {
  value: T
  path: string
  observe(cb: (path: string) => void): void
  touch(): void
}
```

#### Limitation: a type or a factory, not both

> Only the interface is emitted. The runtime factory (`BoxedProxy(0)`) gets no
> value declaration, so TypeScript code that calls it fails with TS2693
> ("'BoxedProxy' only refers to a type, but is being used as a value here"). A
> Generic without a block gets the factory stub and no type. Nothing emits both
> yet, and there is no supported workaround: the only way round it is to append
> an `export declare const BoxedProxy: …` to the generated `.d.ts` by hand (an
> interface and a const may share a name), which the next emit overwrites. If
> TS consumers need only the type, the factory can stay TJS-only.

#### The `// TS:` form

When the block's first content is a `// TS:` comment, everything after `TS:`
up to the end of the block is emitted verbatim as a type alias. A
comment carrying syntax is a deliberate escape hatch: it lets any TypeScript
type through without TJS having to parse it. This is how conditional and
mapped types get through, and it is what `fromTS` writes for them:

```tjs
export Generic Unboxed<T> {
  predicate(x, T) { return T(x) }
  declaration {
    // TS: T extends { value: infer U } ? U : T
  }
}
```

```typescript
// emitted .d.ts
export type Unboxed<T> = T extends { value: infer U } ? U : T;
```

A longer type can continue on the following lines, but only the first line
carries `// TS:`. A continuation line that also starts with `//` is copied
with its `//` intact and breaks the emitted type.

The `// TS:` form can express the transparent wrapper from
[The Critical Constraint](#the-critical-constraint), by writing the mapped
type out:

```tjs
export Generic BoxedProxy<T> {
  description: 'typed state proxy'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && 'path' in x && T(x.value)
  }
  declaration {
    // TS: { [K in keyof T]: BoxedProxy<T[K]> } & { value: T; path: string; observe(cb: (path: string) => void): void; touch(): void }
  }
}
```

emits

```typescript
export type BoxedProxy<T> = { [K in keyof T]: BoxedProxy<T[K]> } & { value: T; path: string; observe(cb: (path: string) => void): void; touch(): void };
```

This is what a TS consumer then sees. With `tosi` declared against it,
`tsc --strict` accepts all of this:

```typescript
import { BoxedProxy } from './state' // the emitted .d.ts above
declare function tosi<T>(v: T): BoxedProxy<T>

const state = tosi({ app: { count: 0, label: 'x' } })
const n: number = state.app.count.value // .app.count autocompletes; it is a box
const p: string = state.app.count.path
state.app.label.observe((path) => console.log(path))
```

So the goal is met in the boxed-only sense: `.app.count` has the same name and
nesting as in the wrapped object, and is a box whose `.value` is the `number`.
It works, but it is TypeScript written by hand inside TJS, which is the cost
`wraps<T>` would remove.

**Pros:** Explicit, no magic, single source of truth.
**Cons:** TypeScript syntax embedded in TJS. The structured form cannot express
the transparent wrapper, because its lines become interface members; only the
`// TS:` form can.

### Option 2: `wraps<T>`, a First-Class Transparent Wrapper (not implemented)

A language-level concept for "this generic transparently exposes T's members".
This is proposed syntax; the parser does not accept it:

```text
Generic BoxedProxy wraps<T> {
  path: ''
  observe: (path: '') => {}
  touch: () => {}
  predicate(x, T) { ... }
}
```

The members use TJS example values, as everywhere else in TJS: `path: ''`
means "a string", and `observe: (path: '') => {}` means "a function taking a
string".

`wraps<T>` would mean:

- T's properties are accessible through this object
- The `.d.ts` emitter generates `{ [K in keyof T]: BoxedProxy<T[K]> } & { path: string; ... }`
- Runtime validation checks that T's shape is present (whether shallowly or
  recursively was not decided)

**Pros:** Formalizes the Proxy pattern at the language level. The `.d.ts`
emission is automatic, with no embedded TypeScript. The runtime behavior is
described once, so both the runtime check and the mapped type derive from it.

**Cons:** New language concept. Only needed for the transparent wrapper pattern.

### Option 3: Hand-Maintained `.d.ts`

Ship a curated `.d.ts` file alongside the TJS output. For a boxed-only proxy
(tosijs 2.0), this was estimated at about 40 lines, against the 288-line
`xin-types.ts` of the time (March 2026): the hand-written types shipped with
tosijs 1.x, named for its predecessor, xinjs.

**Pros:** Works today, no TJS changes needed.
**Cons:** Two sources of truth. Manual maintenance. Defeats the purpose of
TJS generating everything from one source.

## Recommendation

Start with **Option 1** (`declaration` block) as it's the simplest useful
step. It covers the common case (Generic with known extra properties) without
new language concepts. This is what was built.

If the transparent wrapper pattern turns out to be common enough (Proxies,
ORMs, reactive state, etc.), graduate to **Option 2** (`wraps<T>`). This
would be a genuinely novel language feature: expressing at the type level
what JavaScript Proxies do at runtime.

## Implementation Path

1. **Done:** The `.d.ts` emitter emits Generics as `any`-based factory stubs.
   Still the output for a Generic with no `declaration` block.
2. **Done (2026-03-19):** `declaration { … }` blocks on Generic declarations.
   The emitter reads them from the source; the runtime transform drops them.
3. **Done (2026-03-19):** Structured block content is emitted as
   `export interface Name<T> { … }`. Since 2026-03-29, a block starting with
   `// TS:` is emitted as `export type Name<T> = …`. `fromTS` writes
   declaration blocks when it converts generic interfaces and conditional or
   mapped types. Conditional and mapped types round-trip exactly.
4. **Open:** A Generic with a declaration block gets a type but no value
   declaration for its runtime factory, so TS code that calls the factory does
   not compile.
5. **Open:** A generic interface converted by `fromTS` does not round-trip. The
   converter writes the block with TJS example values and the emitter copies
   them verbatim, so `export interface Box<T> { value: T; label: string }`
   comes back as `value: any` and `label: ''`, a literal type no ordinary
   string satisfies.
6. **Later:** Consider `wraps<T>` if the pattern is common enough.

---

## For contributors

- `src/lang/emitters/dts.ts`: the emitter that consumes declaration blocks
  (`detectGenerics`, and the Generic loop in `generateDTS`)
- `src/lang/parser-transforms.ts`: `transformGenericDeclarations()` builds the
  runtime Generic; the declaration block does not reach the emitted JavaScript
- `src/lang/emitters/from-ts.ts`: writes declaration blocks when converting
  TypeScript. Constrained generics (`<T extends Shape>`) use the constraint as
  the example value (shipped in the same commit)
