<!--{"parent": "the-tjs-language.md", "order": 5, "book": ["default"]}-->
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

The result keeps the caller's keys in the caller's order and appends the filled-in
defaults after them, which is why `{ y: 7 }` comes back as `{"y":7,"x":0}`. Order carries
no meaning. The last call shows a failed check: `x: 0` declares an integer, so `'five'` is
refused, and the call returns an error object instead of running the body. (The `…` stands
for the file and line, which the real message starts with.)

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
   member's type. `x: 0` means "an integer, defaulting to 0"; write `ratio: 1.0` for a
   member that takes any number. The default is read the way any
   [parameter example](/TJS-SYNTAX/#parameters) is.
3. **Keeps keys the default does not mention.**
4. **Rejects `__proto__`, `constructor` and `prototype`** as keys.
5. **The merge never writes into the caller's object.** A complete argument is passed to
   the function as is; a partial one produces a new object. Your function body can still
   change a complete argument, as in JavaScript (see
   [A complete argument is passed as is](#a-complete-argument-is-passed-as-is)).

A failed check is not thrown. The function body does not run, and the call returns a
`MonadicError` whose message names the member (`place.args.x`). Test for one with
`isMonadicError(result)`, which every `.tjs` file can call without an import; see
[Errors](/TJS-SYNTAX/#errors). The rest of this chapter covers each rule and its edge
cases.

It works on any function form: declarations, arrow functions and class methods.

## When a default is used

| The caller passes                  | The member gets                                  |
| ---------------------------------- | ------------------------------------------------ |
| nothing, or `undefined`, for the whole argument | a fresh copy of the whole default   |
| an object without the key          | the member's default                             |
| the key with the value `undefined` | the member's default                             |
| the key with the value `null`      | an error, unless the member's default is `null` or `undefined` |
| the key with any other value       | that value, checked against the default's type   |
| `null`, or any non-object (a number, a string, an array), for the whole argument | an error at the parameter: `null` is a value, not an absence |

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
console.log(open(null).message)
// Expected object for '…open.opts', got null
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

console.log(move({ pos: { x: 'five' } }).message)
// Expected integer for '…move.args.pos.x', got string
console.log(move({ pos: null }).message)
// Expected object for '…move.args.pos', got null

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

An empty array default (`tags: []`) has no element to check against, so it accepts an
array of anything. Give it an example element, as `['']` above, to check the elements.

Because arrays are not merged, an object inside an array is not filled in either. With a
default of `{ points: [{ x: 0, y: 0 }] }`, every point a caller passes must have both `x`
and `y`. The error for a point that lacks one names only the array, and currently reads
`Expected array of object for '…points', got array of object`.

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
// dict-default-excess-key 'widht' is not a member of sized's dictionary parameter — check
// the spelling (it is passed through, so it will have no effect)
```

A payload built elsewhere and passed in a variable, or one containing a spread, is not
checked. `tjs check` runs the rule (a warning, an error under `TjsStrict`); from code, call
`lint` from `tjs-lang/lang`.

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
> Two more reasons. **Nothing else in TJS removes or rejects an excess key**: shape checks
> on `:` parameters and `Type` checks both accept them (see [Type identity](/type-identity/)).
> And **TypeScript cannot express a closed type**: its excess-property check applies only
> to a fresh object literal, and there is no `Exact<T>`, so a stricter runtime rule would
> be one TypeScript users could not reason about. (TJS 0.12 did strip excess keys; the
> [CHANGELOG](/CHANGELOG/) entry for 0.13.0 records the reversal.)
>
> A dictionary default is therefore not a sanitiser. If you need exactly the declared
> keys, strip them yourself: `const clean = ({ x, y }) => ({ x, y })`. Untrusted data
> belongs in an [AJS](/DOCS-AJS/) sandbox, not behind a parameter default.

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

Every member of the default must be a literal: a number literal (a negative one such as
`-1` is fine), a quoted string, `true`, `false`, `null`, `undefined`, or an array or object
literal made of those. A function call, a variable, `new`, a template literal or a getter
is a compile error. So are `NaN` and `Infinity`, which are variables in JavaScript, not
literals:

```text
function stamp(opts = { at: Date.now(), by: '' }) { … }

Dictionary default for '…stamp.opts.at' must be a pure literal — member 'at' is not a
clonable literal value. Compute impure values inside the function body, or use a
colon-form (required) parameter. For JavaScript's atomic default, wrap it in
LegacyDefault(…).
```

(The colon form is described below, under "`=`, `:` and a typed default".)

The reason is how the merge is built. The transpiler writes the merge code for each
signature when it compiles the file, with the default's values copied into that code as
literals. There is nowhere in that code for a value that has to be computed on each call,
so the compiler refuses one rather than computing it at the wrong time.

Two cases are not caught yet, and give a wrong default instead of an error: a computed key
(`{ [k]: 1 }` uses the name `k` as the key) and a call inside an array member
(`{ at: [tick()] }` fills `[null]`). Do not write either.

To compute a value on each call, give the member the default `undefined`, which accepts
any value, and fill it in the body:

```tjs:inline
let counter = 0

function nextId(opts = { id: undefined, prefix: 'id' }) {
  const id = opts.id ?? ++counter    // computed in the body, on each call
  return `${opts.prefix}-${id}`
}

console.log(nextId(), nextId(), nextId({ id: 0 }))   // id-1 id-2 id-0
```

## A complete argument is passed as is

When the caller's object already has every declared member, and every member checks, the
function receives **that object**: no copy is made, so supplying everything costs nothing
beyond the check. Extra keys do not change this. The same goes for a nested object: in
`move({ pos: { x: 1, y: 2 } })` the result's `pos` is the caller's `pos` object, even
though the outer object is new. When members are missing, the function receives a new object, and the
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

Three signatures put an object in a parameter, and only the first is a dictionary. The
third gives a parameter both a type and a default (`name: Type = value`); here `Point` is
declared as `Type Point { example: { x: 0, y: 0 } }`.

| Declaration                   | The argument  | Its members                                       |
| ----------------------------- | ------------- | ------------------------------------------------- |
| `opts = { retries: 3 }`       | optional      | each optional, filled from the default, checked   |
| `opts: { retries: 3 }`        | required      | each required and checked                         |
| `p: Point = { x: 1, y: 2 }`   | optional      | if passed, must be a whole `Point`; not merged    |

"Each required and checked" means the object must have every listed member, each of the
listed type.

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

Nor is a destructured parameter. `function d({ a, b } = { a: 1, b: 2 })` keeps
JavaScript's all-or-nothing default, so `d({ a: 5 })` sees `b` as `undefined`. For
per-member defaults, declare `opts = { a: 1, b: 2 }` and destructure in the body.

## Opting out: `LegacyDefault` and `!`

To keep JavaScript's all-or-nothing default for one parameter, wrap the literal in
`LegacyDefault`. A `!` at the start of the parameter list turns validation off for the
whole function (see [Safety markers](/TJS-SYNTAX/#safety-markers)); such a function also
keeps JavaScript's default, along with skipping every other check:

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

`LegacyDefault` is one of TJS's [named escapes](/TJS-SYNTAX/#named-escapes): each brings
back one JavaScript behaviour at one site, under a long name that is easy to find in
review.

## Which files get dictionary defaults

Dictionary defaults are a rule of native TJS. They are on in every `.tjs` file, and off
wherever the same source must keep its JavaScript meaning:

| Source                                         | Object-literal default        |
| ---------------------------------------------- | ----------------------------- |
| a `.tjs` file                                  | dictionary                    |
| a `.js` file, or `tjs(src, { dialect: 'js' })` | JavaScript's atomic default   |
| a `.tjs` file whose first line is the `TjsCompat` directive | JavaScript's atomic default |
| TypeScript converted with `fromTS` (or `tjs convert`) | JavaScript's atomic default, written as `LegacyDefault({ … })` |
| converted TypeScript marked with the comment `/* @tjs TjsStrict */` | dictionary  |

`TjsCompat` and `TjsStrict` are described under [TJS syntax](/TJS-SYNTAX/). Where the rule
is off, the literal-only restriction is off too: `args = { at: Date.now() }` is legal
JavaScript and stays legal. Converting TypeScript writes `LegacyDefault` explicitly,
so a converted file keeps its behaviour when it later becomes native `.tjs`.

The same characters mean something different in JavaScript and in TJS here, as they do for
`==` (which in TJS does not coerce types). That is allowed because choosing a `.tjs` file
is the opt-in; see [Principles](/PRINCIPLES/).

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
corrupted. Three invariants hold, and
[`src/lang/dict-defaults.test.ts`](https://github.com/tonioloewald/tjs-lang/blob/main/src/lang/dict-defaults.test.ts)
tests them: the merge never writes into the caller's object; no result shares a mutable
part with another call's result; a complete argument is returned by identity, with no
allocation. Measured when it shipped, a complete argument took about 91 ns and a partial
one about 73 ns, against about 276 ns for a careful hand-written merge that does no
type checking.

The design history (the spikes, the benchmarks against hand-written merges, the staged
rollout and the resolved open questions) is in the
[previous version of this page](https://github.com/tonioloewald/tjs-lang/blob/47303274/docs/dictionary-defaults.md).
