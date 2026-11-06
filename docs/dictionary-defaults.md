<!--{"parent": "the-tjs-language.md", "order": 5}-->
<!-- TODO review -->

# Dictionary Defaults

In a `.tjs` file, an object literal used as a parameter default is a **dictionary**: each
member is its own default, and a caller who passes part of the object gets the rest filled
in.

```tjs:inline
function place(args = { x: 0, y: 0 }) {
  return args
}

console.log(JSON.stringify(place()))             // {"x":0,"y":0}
console.log(JSON.stringify(place({ x: 5 })))     // {"x":5,"y":0}
console.log(JSON.stringify(place({ y: 7 })))     // {"y":7,"x":0}
console.log(place({ x: 'five' }).message)
// Expected integer for '…place.args.x', got string
```

In JavaScript the same signature is all or nothing: `place({ x: 5 })` returns `{ x: 5 }`
and `y` is `undefined`. This chapter is the reference for the TJS rule. For a guided tour
with tests, see the [Dictionary Defaults example](/dictionary-defaults-example/).

## Why

Options objects are everywhere in JavaScript, and nobody who passes `{ x: 5 }` means "and
throw away every other default". So every options function merges by hand, and the
hand-written merges are where the bugs are:

- `Object.assign(defaults, payload)` writes into the shared defaults object, so one call
  changes the defaults for every later call.
- `{ ...defaults, ...payload }` merges one level. A nested default disappears as soon as
  the caller passes part of the nested object.
- Destructuring with defaults works, but moves the shape, the types and the defaults out of
  the signature and into the body.

The web platform already does it the other way. `addEventListener(type, fn, { once: true })`
keeps the defaults for `capture` and `passive`; `fetch(url, { method: 'POST' })` keeps every
other option. Those options objects are WebIDL _dictionaries_, and their members default
individually. TJS gives your own functions the same behaviour, with no new syntax: the
declaration `args = { x: 0, y: 0 }` already says which members exist, what type each has,
and what each defaults to.

## The rule

A parameter declared `name = { … }` with an object literal:

1. **Fills absent members** from the default, recursively through nested objects.
2. **Checks present members** against the default, which is also an example of the
   member's type (`x: 0` means "an integer, defaulting to 0").
3. **Keeps keys the default does not mention.**
4. **Rejects `__proto__`, `constructor` and `prototype`** as keys.
5. **Never writes into the caller's object.** A complete argument is returned as is; a
   partial one produces a new object.

A failed check returns a `MonadicError` naming the member (`place.args.x`); it is not
thrown. The rest of this chapter covers each rule and its edge cases.

It works on any function form: declarations, arrow functions and class methods.

## When a default is used

| The caller passes                  | The member gets                                  |
| ---------------------------------- | ------------------------------------------------ |
| nothing, or `undefined`, for the whole argument | a fresh copy of the whole default   |
| an object without the key          | the member's default                             |
| the key with the value `undefined` | the member's default                             |
| the key with any other value       | that value, checked against the default's type   |
| `null` for the whole argument      | an error: `null` is a value, not an absence      |

Falsy values count as values: `0`, `''` and `false` win over the default. `null` is never
quietly replaced by a default, because doing so would hide a caller's bug.

A member whose default is `null` or `undefined` accepts **any** value. That is how you
declare an option with no natural default:

```tjs:inline
function open(opts = { parent: null, storage: undefined, retries: 3 }) {
  return opts
}

console.log(JSON.stringify(open()))                    // {"parent":null,"retries":3}
console.log(JSON.stringify(open({ parent: 'root' })))  // {"parent":"root","retries":3}
console.log(open({ storage: new Map() }).storage.size) // 0: any value is accepted
console.log(JSON.stringify(open({ retries: 0 })))      // {"retries":0,"parent":null}
console.log(open(null).message)                        // the argument itself is null
```

(`storage` is missing from the `JSON.stringify` output only because `JSON.stringify` omits
`undefined` members.)

## Nested objects merge too

A nested object literal in the default is a dictionary in its own right. A caller who
passes part of it gets the rest of it filled in, and its members are checked:

```tjs:inline
function move(args = { pos: { x: 0, y: 0 }, label: '' }) {
  return args
}

console.log(JSON.stringify(move({ pos: { x: 5 } })))
// {"pos":{"x":5,"y":0},"label":""}

console.log(move({ pos: { x: 'five' } }).message)   // names args.pos.x
console.log(move({ pos: null }).message)            // pos must be an object

// Filled-in defaults are fresh on every call: changing one cannot change the next.
const first = move({ label: 'a' })
first.pos.x = 999
console.log(move({ label: 'b' }).pos.x)             // 0
```

## Arrays are values

An array in the default is replaced wholesale, never merged index by index. Its elements
are checked against the default's first element, the same way an [array example](/TJS-SYNTAX/)
is checked anywhere else:

```tjs:inline
function tag(args = { tags: [''], n: 0 }) {
  return args
}

console.log(JSON.stringify(tag({ n: 1 })))                // {"n":1,"tags":[""]}
console.log(JSON.stringify(tag({ tags: ['a', 'b'] })))    // {"tags":["a","b"],"n":0}
console.log(isMonadicError(tag({ tags: ['ok', 42] })))    // true: 42 is not a string
```

Because arrays are not merged, an object inside an array is not filled in either. With a
default of `{ points: [{ x: 0, y: 0 }] }`, every point a caller passes must have both `x`
and `y`.

## Excess keys pass through

A key the default does not declare is kept, unchecked, in the result:

```tjs:inline
function sized(opts = { w: 100, h: 100 }) {
  return opts
}

console.log(JSON.stringify(sized({ w: 5, color: 'red' })))
// {"w":5,"color":"red","h":100}
```

That has one cost: a misspelled option is accepted silently. `sized({ widht: 5 })` keeps
`w: 100` and carries `widht` along, and nothing fails at runtime. The linter's
`dict-default-excess-key` rule catches it when the misspelled key is in an object literal
written at a call to a function declared in the same file:

```javascript
import { lint } from 'tjs-lang/lang'

const source = `
function sized(opts = { w: 100, h: 100 }) { return opts }
sized({ widht: 5 })
`
for (const d of lint(source).diagnostics) console.log(d.rule, d.message)
// dict-default-excess-key 'widht' is not a member of sized's dictionary parameter — …
```

A payload built elsewhere and passed in a variable, or one containing a spread, is not
checked. `tjs check` does not run lint rules, so call `lint` yourself or through your
editor integration.

> **Where TJS diverges from WebIDL**
>
> | | WebIDL dictionary | TJS dictionary default |
> | --- | --- | --- |
> | Excess keys in the payload | **stripped** | **passed through** |
> | Missing members | filled from the default | filled from the default |
> | Wrong member type | rejected | rejected |
> | `__proto__` / `constructor` / `prototype` | n/a | rejected |
>
> **Why WebIDL strips, and TJS does not.** A WebIDL dictionary is a wire format: its job is
> to turn an untrusted bag into exactly the declared shape before it crosses into browser
> internals, so anything undeclared is noise. A TJS `= { … }` parameter is an options
> object inside one program, and those routinely carry more than the callee declares: a
> caller forwards its own options, one object goes to two functions, a component spreads
> its props. Deleting the caller's data there is not normalisation, it is loss.
>
> TJS stripped excess keys in 0.12.0 and changed in 0.13.0, for three reasons:
>
> 1. **The loss was silent.** It was reported once per call site in the flight recorder,
>    not at the call, so the second call that lost data said nothing.
> 2. **Nothing else in TJS removes or rejects an excess key.** Shape checks on `:`
>    parameters and `Type` checks both accept them (see [Type identity](/type-identity/)).
> 3. **TypeScript cannot express the closed type it was enforcing.** TypeScript's
>    excess-property check applies only to a fresh object literal (pass the same object
>    through a variable and it is accepted), and there is no `Exact<T>`. A runtime rule
>    stricter than anything the matching type system can state is one users cannot
>    reason about.
>
> A dictionary default is therefore not a sanitiser. If you need exactly the declared
> keys, strip them yourself: `const clean = ({ x, y }) => ({ x, y })`. The security
> boundary for untrusted data is the VM's capability membrane, not a parameter default.

## Prototype keys are rejected

`__proto__`, `constructor` and `prototype` are refused as keys at every level, because a
merge is exactly where prototype pollution happens. The payload below is what an attacker
gets from `JSON.parse`, which creates `__proto__` as an ordinary own key:

```tjs:inline
function place(args = { x: 0, y: 0 }) {
  return args
}

const hostile = JSON.parse('{"x":1,"__proto__":{"polluted":true}}')
console.log(isMonadicError(place(hostile)))   // true
console.log({}.polluted)                      // undefined
```

## Defaults must be literals

Every member of the default must be a literal: a number, a quoted string, `true`, `false`,
`null`, `undefined`, or an array or object literal made of those. A function call, a
variable, `new`, a template literal, a getter or a computed key is a compile error:

```text
function stamp(opts = { at: Date.now(), by: '' }) { … }

Dictionary default for 'stamp.opts.at' must be a pure literal — member 'at' is not a
clonable literal value. Compute impure values inside the function body, or use a
colon-form (required) parameter.
```

The reason is that JavaScript evaluates a default once per call, while TJS builds the merge
from the declaration. For a literal the two are indistinguishable; for `Date.now()` they
would not be. Compute such values in the body:

```tjs:inline
let counter = 0

function nextId(opts = { id: 0 }) {
  return opts.id || ++counter    // computed in the body, on each call
}

console.log(nextId(), nextId(), nextId({ id: 42 }))   // 1 2 42
```

## A complete argument is returned as is

When the caller's object already has every declared member, and every member checks, the
function receives **that object**: no copy is made, so supplying everything costs nothing
beyond the check. When members are missing, the function receives a new object, and the
caller's object is left alone:

```tjs:inline
function sized(opts = { w: 100, h: 100 }) {
  return opts
}

const full = { w: 1, h: 2 }
console.log(sized(full) === full)    // true: the same object

const part = Object.freeze({ w: 1 })
const merged = sized(part)
console.log(merged === part)         // false: a new object
console.log(JSON.stringify(part))    // {"w":1}: the caller's object is unchanged
```

The frozen object shows the merge never writes into what it was given. One consequence of
the identity rule: if your function changes `opts`, it changes the caller's object when the
caller passed a complete one, as in plain JavaScript. Copy first if you need to modify it.

## `=`, `:` and a typed default

Three signatures put an object in a parameter, and only the first is a dictionary:

| Declaration                   | The argument  | Its members                                       |
| ----------------------------- | ------------- | ------------------------------------------------- |
| `opts = { retries: 3 }`       | optional      | each optional, filled from the default, checked   |
| `opts: { retries: 3 }`        | required      | each required and checked (a shape)               |
| `p: Point = { x: 1, y: 2 }`   | optional      | if passed, must be a whole `Point`; not merged    |

The [example chapter](/dictionary-defaults-example/) runs all three side by side.

There is no marker for "a required member inside a dictionary": if the caller must supply
it, it is not a default. Put required values in their own parameters, before the options,
the way `addEventListener(type, listener, options)` does:

```tjs:inline
function connect(url: 'https://example.com', opts = { retries: 3, timeout: 1000.0 }) {
  return `${url} retries=${opts.retries} timeout=${opts.timeout}`
}

console.log(connect('https://a.dev', { timeout: 250.5 }))
// https://a.dev retries=3 timeout=250.5
console.log(isMonadicError(connect()))   // true: url is required
```

## Only object-literal defaults

The rule applies only when the default is an object literal written in the signature.
Every other default keeps JavaScript's meaning:

```tjs:inline
function f(x = 0, list = []) {
  return JSON.stringify({ x, list })
}

console.log(f())          // {"x":0,"list":[]}
console.log(f(5, [1]))    // {"x":5,"list":[1]}
```

A default that names a variable (`opts = shared`) is not an object literal either, so it is
not a dictionary: a caller's object replaces it whole.

## Opting out: `LegacyDefault` and `!`

To keep JavaScript's all-or-nothing default for one parameter, wrap the literal in
`LegacyDefault`. A function marked `!` (validation off) also keeps JavaScript's default,
along with turning off every other check in that function:

```tjs:inline
function legacy(opts = LegacyDefault({ x: 0, y: 0 })) {
  return JSON.stringify(opts)
}

function fast(! opts = { x: 0, y: 0 }) {
  return JSON.stringify(opts)
}

console.log(legacy({ x: 5 }))     // {"x":5}: replaced, not merged
console.log(fast({ x: 5 }))       // {"x":5}
console.log(fast({ x: 'five' }))  // {"x":"five"}: nothing is checked
```

`LegacyDefault` is a named escape, like `LegacyDate` and `DangerousLegacyEquals` (see
[TJS syntax](/TJS-SYNTAX/)): it marks one site, and it is easy to find in review.

## Which files get dictionary defaults

Dictionary defaults are a rule of native TJS. They are on in every `.tjs` file, and off
wherever the same source must keep its JavaScript meaning:

| Source                                         | Object-literal default        |
| ---------------------------------------------- | ----------------------------- |
| a `.tjs` file                                  | dictionary                    |
| a `.js` file, or `tjs(src, { dialect: 'js' })` | JavaScript's atomic default   |
| a file starting with `TjsCompat`               | JavaScript's atomic default   |
| TypeScript converted with `fromTS`             | JavaScript's atomic default, written as `LegacyDefault({ … })` |
| converted TypeScript marked `/* @tjs TjsStrict */` | dictionary                |

Where the rule is off, the purity restriction is off too: `args = { at: Date.now() }` is
legal JavaScript and stays legal. Converting TypeScript writes `LegacyDefault` explicitly,
so a converted file keeps its behaviour when it later becomes native `.tjs`.

This is the one place where the same characters mean something different in JavaScript and
in TJS. That is allowed because choosing a `.tjs` file is the opt-in, as it is for `==`;
see [Principles](/PRINCIPLES/).

## What TypeScript callers see

The generated `.d.ts` describes what a caller may pass, so a dictionary-default parameter
is **deep-partial**: the parameter and every member are optional, recursively. Arrays are
not made partial, since they are replaced whole.

```tjs:static
export function place(args = { pos: { x: 0, y: 0 }, label: '' }, tags = { list: [''] }) {
  return args
}
```

generates:

```ts
export declare function place(
  args?: { pos?: { x?: number; y?: number }; label?: string },
  tags?: { list?: string[] }
): any
```

Inside the function every member is present, because the merge has filled them.

## Implementation notes

The transpiler emits merge-and-check code specialised to each signature, with the
default's members inlined as fresh literals, so no shared template object exists to be
corrupted. Three invariants hold, and `src/lang/dict-defaults.test.ts` tests them: the merge
never writes into the caller's object; no result shares a mutable part with another call's
result; a complete argument is returned by identity, with no allocation. Measured when it
shipped, this was faster than a careful hand-written merge that checks nothing.

The design history (the spikes, the benchmarks against hand-written merges, the staged
rollout and the resolved open questions) is in this file's git history up to commit
`47303274`.
