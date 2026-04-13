# FunctionPredicate: Design Notes

_First-class function types in TJS, using the same pattern as Type/Generic._

---

## The Problem

TJS has no way to express "this parameter must be a function with this
signature." Currently:

- `() => void` in TypeScript becomes `undefined` in fromTS output
- There's no TJS syntax for function-typed parameters
- Callbacks, event handlers, and higher-order functions lose their
  type information at the boundary

## Design Principles

1. **Functions are values** — a function should be usable as a type example,
   just like `0` means "integer" and `''` means "string"
2. **FunctionPredicate should work like Type/Generic** — same pattern of
   predicate-based checking, introspection via metadata
3. **The return contract is part of the type** — `:`, `:?`, and `:!` are
   meaningful distinctions in the function's contract

## The Three Return Contracts

| Marker | Name | Meaning |
|--------|------|---------|
| `:` | `returns` | Verified at transpile time (signature test) |
| `:?` | `checkedReturns` | Verified at transpile time AND runtime |
| `:!` | `assertReturns` | Declared but not verified (metadata only) |

These are not just build options — they describe the **trust level** of
the function's return type. A function with `:?` makes a stronger promise
than one with `:!`.

## Syntax: Function as Type Example

The most TJS-idiomatic approach — a function IS its own type:

```tjs
// This function's signature IS a type
function formatter(input: '', options: { locale: 'en' }):? '' {
  return input
}

// fn must match formatter's contract
function process(fn: formatter) {
  const result = fn('hello', { locale: 'fr' })
}
```

The runtime check for `fn: formatter`:
1. `typeof fn === 'function'`
2. `fn.__tjs` exists (it's a TJS-typed function)
3. `fn.__tjs.params` shape-matches `formatter.__tjs.params`
4. `fn.__tjs.returns` matches `formatter.__tjs.returns`

Untyped functions (no `__tjs`) would fail the check — they don't have
the metadata to verify against. Use `!` (unsafe) to skip the check for
interop with plain JS callbacks.

## Syntax: Explicit FunctionPredicate

For cases where you want to declare a function type without writing an
example function:

```tjs
FunctionPredicate Formatter {
  description: 'formats a string with locale options'
  params: { input: '', options: { locale: 'en' } }
  returns: ''
}

// Or with checked returns:
FunctionPredicate Validator {
  params: { value: null }
  checkedReturns: false
}

// Or declared-only returns:
FunctionPredicate Callback {
  params: { event: { type: '', target: null } }
  assertReturns: undefined
}
```

## Syntax: FunctionPredicate from Function

Create a type from an existing function's metadata:

```tjs
function myFormatter(input: '', options: { locale: 'en' }):? '' {
  return input
}

// Extract the type from the function
FunctionPredicate Formatter(myFormatter, 'string formatter with locale')
```

This is analogous to `Type Name 'example'` — the function itself is the
example value, and its `__tjs` metadata defines the type.

## Runtime Representation

A FunctionPredicate at runtime would be an object with:

```javascript
{
  check(fn) { ... },      // returns boolean
  params: { ... },         // param descriptors
  returns: { ... },        // return type descriptor
  returnContract: 'checked' | 'returns' | 'assert',
  description: '...',
  default: exampleFn,      // the example function, if provided
}
```

This matches the shape of `Type()` — `check`, `default`, `description`.

## Validation Levels

When checking `fn: SomeType` where SomeType is a FunctionPredicate:

| Check | What it verifies |
|-------|------------------|
| `typeof fn === 'function'` | It's callable |
| `fn.__tjs` exists | It's a TJS-typed function |
| Param count matches | Same arity (or compatible) |
| Param types match | Each param's type descriptor matches |
| Return type matches | Return type descriptor matches |
| Return contract | At least as strict as required |

Return contract strictness: `checkedReturns` (-?) > `returns` (->) > `assertReturns` (-!).
A `checkedReturns` function satisfies any requirement.
A `returns` function satisfies `returns` or `assertReturns`.
An `assertReturns` function only satisfies `assertReturns`.

## Compatibility with Untyped Functions

Plain JS functions have no `__tjs` metadata. Options:

1. **Strict**: Reject untyped functions (safe but hostile to JS interop)
2. **Lenient**: Accept any function, only validate if `__tjs` exists
3. **Unsafe marker**: Use `!` to skip the check for known-untyped callbacks

Option 3 is most consistent with TJS's existing patterns:

```tjs
// Strict — fn must have matching __tjs metadata
function process(fn: formatter) { ... }

// Lenient — fn just needs to be callable
function process(! fn: formatter) { ... }
```

## Relationship to Existing Features

- **Type**: FunctionPredicate IS a Type — just one that checks function
  signatures specifically. Could be implemented as a special case of Type
  with a built-in predicate that introspects `__tjs`.
- **Generic**: FunctionPredicate could be generic too —
  `FunctionPredicate Mapper<T, U> { params: { value: T }, returns: U }`
- **declaration block**: FunctionPredicates would benefit from declaration
  blocks for `.d.ts` emission, same as Generic.

## Implementation Path

1. **Runtime**: Add `FunctionPredicate()` to the TJS runtime alongside
   `Type()` and `Generic()`. Returns a type guard that checks `__tjs`
   metadata on functions.
2. **Parser**: Recognize `FunctionPredicate` as a declaration keyword
   (same as `Type`, `Generic`). Parse the block or function-argument form.
3. **Metadata**: The `__tjs` metadata for the return type already includes
   `type` — add a `contract` field for the marker.
4. **fromTS**: When converting `(x: number) => string` types, emit a
   FunctionPredicate instead of `undefined`.
5. **Inference**: When a function is used as a `:` param type, check if
   it has `__tjs` metadata and validate the caller's function against it.
