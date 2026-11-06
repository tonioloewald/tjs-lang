<!--{"parent": "the-tjs-language.md", "order": 9}-->
<!-- TODO review -->

# FunctionPredicate: Design Notes

_How TJS describes the type of a function: what was proposed, what shipped, and what did
not._

This began as a proposal. Most of it has since shipped in a smaller form than proposed, and
the parts that did not ship are listed at the end. For how to use `FunctionPredicate` day to
day, see [Declarations](/declarations/) and
[Higher-order functions](/higher-order-functions/); this note records why it works the way
it does.

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

A `FunctionPredicate` stores one of these names in its `returnContract` property. That
property is **metadata**: a `FunctionPredicate` never calls a function, so nothing is tested,
thrown or wrapped because of it. The proposal ranked the contracts by strictness
(`checkedReturns` satisfies any requirement, `assertReturns` only itself) and would have
refused a callback whose contract was too weak. That comparison is not implemented.

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
console.log(Object.keys(Formatter.params).join(', '), Formatter.returns === '') // input, locale true
console.log(Formatter.returnContract)        // assertReturns
```

**The runtime check is callability only.** `Formatter(x)` is `true` for any function and
`false` for anything else. Whether a function honours a signature is something you learn by
calling it, and a type check must not call the value it checks.

The block accepts four members: `params`, `returns`, `returnContract` (one of the three
names above; the default is `'assertReturns'`) and `description` (the default is the
declaration's name). The proposal also had `checkedReturns: …` and `assertReturns: …` as
alternatives to `returns: …`; those keys are not recognised. Write
`returnContract: 'checkedReturns'` instead.

### Generic function types

A `FunctionPredicate` can take type parameters, as `Generic` does. Calling it with a type
argument gives a concrete function type:

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
function's metadata. In emitted code it takes only the description; the parameters, return
example and contract are not copied:

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
parameter is checked twice when a value is passed: it must be a function, and if the value
carries TJS metadata, its declared parameter kinds and return kind must match the example's.

```tjs
function shout(s: 'hi'): 'HI!' { return s.toUpperCase() + '!' }
function next(n: 1): 2 { return n + 1 }

// `format`'s example is a function, so its shape is the expected shape
function greet(format: (s: '') => '') { return format('hello') }

console.log(greet(shout))                  // HELLO!
console.log(greet((s) => s + '?'))         // hello?  (untyped: not compared)
console.log(isMonadicError(greet(next)))   // true: next declares an integer parameter
console.log(isMonadicError(greet(42)))     // true: not a function
```

Three decisions from the proposal are visible here:

- **Untyped functions pass.** A plain arrow such as `(s) => s + '?'` has no metadata to
  compare, so only callability is checked. The proposal weighed rejecting untyped functions
  and chose leniency, because rejecting them would make every plain JavaScript callback an
  error.
- **The check happens once, when the function is passed**, not on each call. A callback with
  the wrong shape is one error at the boundary, not one error per invocation.
- **Kinds must match exactly** where both sides declare one: an `integer` parameter does not
  match a `number` (`0.0`) one. A side declared `any` matches anything. A callback may
  declare fewer parameters than the example.

A `!` at the start of the parameter list (`function greet(! format: …)`) turns off every
check in that function, this one included, which is the escape hatch the proposal asked for.

The same check applies when the parameter's default is a previously declared TJS function
(`function greet(format = shout)`): the default's signature becomes the expected shape.
Naming such a function as the example (`function greet(format: shout)`) also performs the
check, but `tjs check` warns that `shout` "could not be resolved to a runtime type", so the
arrow example or the default is the form to use.

### Conversion from TypeScript

`fromTS` now converts function types instead of dropping them:

| TypeScript                                       | Converted TJS                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `type Formatter = (input: string) => string`     | a `FunctionPredicate Formatter { params: { input: '' } returns: '' }` block |
| a member `onChange: (v: number) => void`         | `onChange: FunctionPredicate('function', { params: { v: 0.0 } })` in the `Type` example |
| a parameter `fn: (x: number) => string`          | `fn: FunctionPredicate('function', { params: { x: 0.0 }, returns: '' })` |

A member converted this way is checked for callability when the enclosing `Type` is checked.
A parameter converted this way is not checked (the inline `FunctionPredicate(…)` call is not
read as a runtime type, so the parameter is treated as `any`); converted code also defaults to
`safety none`, which checks no parameters at all.

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
- **Shape matching inside `FunctionPredicate`.** The proposed check compared arity, parameter
  types, return type and return contract against the candidate's `__tjs` metadata. Emitted
  code checks callability only. (The standalone runtime in `src/types/Type.ts` does compare
  arity and parameter kinds, but emitted code always uses its own inline copy, so that
  comparison never runs in a `.tjs` program; see [Type identity](/type-identity/).)
- **Return-contract strictness.** `returnContract` is recorded and never compared.
- **Copying metadata in the function form**, as shown above.
- **JSON Schema.** The inline `FunctionPredicate` has no `toJSONSchema()`. A function cannot be
  represented in JSON Schema in any case.
