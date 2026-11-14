<!--{"parent": "the-tjs-language.md", "order": 9, "book": ["default"]}-->
<!-- TODO review -->

# FunctionPredicate: Design Notes

_How TJS describes the type of a function: what was proposed, what shipped, and what did
not._

> **In brief**
>
> - To type a callback parameter, give it a function example:
>   `function greet(format: (s: '') => '')`. A typed function passed in is checked against
>   that shape.
> - `FunctionPredicate` declares a named function type. Its runtime check is only "can this
>   value be called?"; its parameters and return example are metadata for docs, `.d.ts`
>   output and introspection.
> - `function run(fn: Formatter)`, with `Formatter` a `FunctionPredicate`, checks **nothing**,
>   not even callability. See [What did not ship](#what-did-not-ship).

This began as a proposal; most of it shipped in a smaller form. For day-to-day use, see
[Declarations](/declarations/) and [Higher-order functions](/higher-order-functions/); this
note records why it works the way it does.

A few terms used below. In TJS a parameter's annotation is an **example value**, not a type:
`0` means integer, `0.0` any number, `''` a string (see [TJS syntax](/TJS-SYNTAX/)). The
**kind** of an example is the type inferred from it: `integer`, `number`, `string`, and so on.
`Type` is a named runtime type built from an example, and `Generic` is a `Type` with type
parameters. A `MonadicError` is an error value a function returns instead of throwing; test
for one with `isMonadicError`. `fromTS` is the TypeScript-to-TJS converter, and `__tjs` is the
metadata TJS attaches to every function it transpiles.

---

## The problem

A callback parameter needs a type. Before `FunctionPredicate`, TJS had no way to say "this
parameter is a function taking a string and returning a string", and `fromTS` dropped
TypeScript function types such as `() => void` entirely. Callbacks, event handlers and
higher-order functions lost their type at exactly the boundary where a type helps most.

## Design principles

1. **A function is a value, so it can be an example.** `0` means "integer" and `''` means
   "string"; a function with typed parameters should mean "a function shaped like this".
2. **A function type works like `Type` and `Generic`.** It is a value you call to check a
   candidate, and it carries metadata that tools can read.
3. **The return contract is part of the signature.** The three return markers (`:`, `:?`,
   `:!`) say how much the author promises about the result, so a function type records which
   one it expects.

## The three return contracts

The markers on a function's return annotation (see
[Return annotations](/TJS-SYNTAX/#return-annotations)):

| Marker | Contract name    | What happens                                                                      |
| ------ | ---------------- | --------------------------------------------------------------------------------- |
| `:`    | `returns`        | A worked example: the function is called with its parameter examples when the file is transpiled, and the result must equal the annotation. |
| `:?`   | `checkedReturns` | The same worked example, plus a check of every result at runtime. A wrong result is returned as a `MonadicError`, not thrown. |
| `:!`   | `assertReturns`  | The return type only. Nothing runs and the result is never checked.                |

`assertReturns` is named the way a TypeScript `as` assertion is: the author asserts the
return type and nothing verifies it.

A `FunctionPredicate` stores one of these names in its `returnContract` property. That
property is **metadata**: a `FunctionPredicate` never calls a function, so nothing is tested,
thrown or wrapped because of it, and the contract is never compared with a callback's.

## What shipped

### The `FunctionPredicate` declaration

A block declares a function type by its parameters and its return example:

```tjs
FunctionPredicate Formatter {
  description: 'formats a string for a locale'
  params: { input: '', locale: 'en' }
  returns: ''
}

console.log(Formatter((s) => s.trim()))      // true
console.log(Formatter('not a function'))     // false
console.log(Formatter((a, b, c, d) => a))    // true: arity is not compared
console.log(Formatter.description)           // formats a string for a locale
console.log(Object.keys(Formatter.params).join(', '))  // input, locale
console.log(Formatter.returns === '')        // true
console.log(Formatter.returnContract)        // assertReturns
```

**The runtime check is callability only.** `Formatter(x)` is `true` for any function and
`false` for anything else. Whether a function honours a signature is something you learn by
calling it, and a type check must not call the value it checks.

The parameters and return example are used elsewhere: the generated `.d.ts` (see
[Declaration files](#declaration-files)), documentation, and introspection through
`.params`, `.returns` and `.returnContract`. Where a callback's shape is actually checked is
a parameter whose example is a function; see
[A function as a parameter example](#a-function-as-a-parameter-example).

The block accepts four members:

- `params`: the parameter examples.
- `returns`: the return example. This key holds only the example value; it does not select
  the `returns` contract.
- `returnContract`: one of the three contract names above. The default is
  `'assertReturns'`, whatever `returns` holds.
- `description`: the default is the declaration's name.

Any other key is silently ignored. Writing `checkedReturns: ''` in place of `returns: ''`
gives a type with no return example and the default contract; write
`returnContract: 'checkedReturns'` instead.

### Generic function types

A `FunctionPredicate` can take type parameters, as `Generic` does. `T = 0` declares a type
parameter whose default example is an integer. Calling the declaration with an example value
substitutes it for `T`, so `Mapper('')` is a mapper from strings to strings.
`typeParamNames` lists the declared parameters. The concrete type still checks callability
only:

```tjs
FunctionPredicate Mapper<T = 0> {
  params: { value: T }
  returns: T
}

const StringMapper = Mapper('')
console.log(Mapper.typeParamNames.join(', '))    // T
console.log(StringMapper.returns === '')          // true
console.log(StringMapper((s) => s), StringMapper(3)) // true false
```

### The function form

`FunctionPredicate Name(fn, 'description')` was meant to take a type from an existing
function's metadata. It takes only the description; the parameters, return example and
contract are not copied, in any TJS program. Use the block form instead.

```tjs
function next(n: 1): 2 { return n + 1 }

FunctionPredicate Step(next, 'one step forward')

console.log(Step.description)                 // one step forward
console.log(Object.keys(Step.params).length)  // 0: the parameters were not copied
console.log(Step(next), Step(null))           // true false
```

### A function as a parameter example

The idea from the first principle did ship, through parameter examples rather than through
`FunctionPredicate`. When a parameter's example is a function with typed parameters, the
check on a passed value has two parts: it must be a function, and if it carries TJS
metadata, its declared parameter kinds and return kind must match the example's.

```tjs
function shout(s: 'hi'): 'HI!' { return s.toUpperCase() + '!' }
function next(n: 1): 2 { return n + 1 }
function zero(s: ''): 0 { return 0 }

// `format`'s example is a function, so its shape is the expected shape
function greet(format: (s: '') => '') { return format('hello') }

console.log(greet(shout))                  // HELLO!
console.log(greet((s) => s + '?'))         // hello?  (untyped: not compared)
console.log(isMonadicError(greet(next)))   // true: next declares an integer parameter
console.log(isMonadicError(greet(zero)))   // true: zero returns an integer
console.log(isMonadicError(greet(42)))     // true: not a function
```

Three decisions are visible here:

- **Untyped functions pass.** A plain arrow such as `(s) => s + '?'` has no metadata to
  compare, so only callability is checked. Rejecting untyped functions was considered and
  turned down, because it would make every plain JavaScript callback an error.
- **The check runs at the call that passes the function**, not on each invocation of it. A
  callback with the wrong shape is one error at the boundary, not one error per invocation.
- **Kinds must match exactly** where both sides declare one: an `integer` parameter does not
  match a `number` (`0.0`) one. A side whose kind is `any` matches anything. Parameter count
  is not compared: a callback may declare fewer or more parameters than the example, and
  only the positions both declare are checked.

A `!` at the start of the parameter list turns off every check on that function's
parameters, this one included. `function greet(! format: (s: '') => '') { … }` accepts
`42` for `format` without complaint. See [Safety markers](/TJS-SYNTAX/#safety-markers).

The same check applies when the parameter's default is a previously declared TJS function
(`function greet(format = shout)`): the default's signature becomes the expected shape.
Naming such a function as the example (`function greet(format: shout)`) also performs the
check, but `tjs check` warns that `shout` "could not be resolved to a runtime type" and is
unchecked. The warning is wrong here: the parameter is checked. Until that is fixed, use the
arrow example or the default.

### Conversion from TypeScript

`fromTS` now converts function types instead of dropping them:

| TypeScript                                       | Converted TJS                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `type Formatter = (input: string) => string`     | a `FunctionPredicate Formatter { params: { input: '' } returns: '' }` block |
| a member `onChange: (v: number) => void`         | `onChange: FunctionPredicate('function', { params: { v: 0.0 } })` in the `Type` example |
| a parameter `fn: (x: number) => string`          | `fn: FunctionPredicate('function', { params: { x: 0.0 }, returns: '' })` |

The last two rows use a call form: `FunctionPredicate(name, { params, returns })` builds an
unnamed function type inline, with `'function'` as its name. A `void` return becomes no
`returns` key, so the result is unconstrained.

A member converted this way is checked for callability when the enclosing `Type` is checked.
A parameter converted this way is not checked. Converted code defaults to `safety none`,
which turns off parameter checks for the whole file; and even with checks turned on, the
inline `FunctionPredicate(…)` call is not read as a runtime type, so the parameter is treated
as `any`. For a parameter, the conversion keeps the information for docs and `.d.ts` output
only.

### Declaration files

A `FunctionPredicate` block becomes a TypeScript function type in the generated `.d.ts`:

```text
FunctionPredicate Formatter {        →   export type Formatter = (input: string, locale: string) => string;
  params: { input: '', locale: 'en' }
  returns: ''
}
```

## What did not ship

- **A `FunctionPredicate` name as a parameter annotation.** `function run(fn: Formatter)`
  transpiles, but `tjs check` warns that `Formatter` "could not be resolved to a runtime
  type", and the parameter is not checked at all, not even for callability. Use a function
  example for the parameter, and call `Formatter(fn)` yourself where you want the named check.
- **Shape matching inside `FunctionPredicate`.** The proposal had it compare arity, parameter
  types, return type and return contract against the candidate's `__tjs` metadata. TJS
  programs check callability only. (A separate runtime implementation compares arity and
  parameter kinds, but TJS programs never use it; see [Type identity](/type-identity/).)
- **Return-contract strictness.** The proposal ranked the contracts (`checkedReturns`
  satisfies any requirement, `assertReturns` only itself) and would have refused a callback
  whose contract was too weak. `returnContract` is recorded and never compared.
- **Copying metadata in the function form**, as shown above.

A `FunctionPredicate` in a TJS program has no `toJSONSchema()`. That is not a gap: JSON
Schema cannot describe a function.
