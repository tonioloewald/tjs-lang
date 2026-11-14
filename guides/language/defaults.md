<!--{"parent": "the-tjs-language.md", "order": 40}-->
<!-- TODO review -->

# Dictionary Defaults

If you write JavaScript, you have written a function that takes an options object, given it
a default, and then watched a caller lose most of that default by passing one key. This
chapter shows what TJS does with the same signature, and the rules that govern it.

## The problem, and the fix

A JavaScript parameter default is all or nothing:

```javascript
function connect(opts = { host: 'localhost', port: 80 }) { return opts }

connect()                // { host: 'localhost', port: 80 }
connect({ port: 8080 })  // { port: 8080 }: host is gone
```

Passing any object replaces the whole default, so real code merges by hand, in the body,
where the signature can no longer tell a reader which options exist.

Put exactly the same function in a `.tjs` file and the partial argument is completed from
the default:

```tjs
function connect(opts = { host: 'localhost', port: 80 }) {
  return opts
}

console.log(JSON.stringify(connect()))
// {"host":"localhost","port":80}
console.log(JSON.stringify(connect({ port: 8080 })))
// {"port":8080,"host":"localhost"}
```

The result keeps the caller's keys first, in the caller's order, and appends the filled-in
members after them. Key order carries no meaning.

An object literal used as a parameter default is a **dictionary**: each member is its own
default. Browser options objects already behave this way (`addEventListener(type, fn,
{ once: true })` keeps the defaults for `capture` and `passive`); TJS gives your own
functions the same behaviour, with no new syntax.

### Which functions get it

Function declarations, function expressions, arrow functions, and class constructors and
methods (static ones included) all get dictionary defaults, and a function can have more
than one dictionary parameter:

```tjs
const viaArrow = (opts = { a: 1, b: 2 }) => opts

class Box {
  constructor(opts = { w: 1, h: 1 }) {
    this.size = opts
  }
}

function both(x = { a: 1, b: 2 }, y = { c: 3, d: 4 }) {
  return [x, y]
}

console.log(JSON.stringify(viaArrow({ a: 5 })))       // {"a":5,"b":2}
console.log(JSON.stringify(Box({ w: 3 }).size))       // {"w":3,"h":1}
console.log(JSON.stringify(both({ a: 9 }, { d: 9 })))
// [{"a":9,"b":2},{"d":9,"c":3}]
```

(A TJS class is called without `new`; see [Classes and Dispatch](/classes-and-dispatch/).)

One form is missing: a method written inside an object literal (`{ m(opts = { … }) { … } }`,
or a property holding a function) currently keeps JavaScript's all-or-nothing default.
Declare the function separately, or use a class, until that is fixed.

### What about destructuring?

The idiom JavaScript developers already reach for is destructuring with per-name defaults.
It works in TJS too, and the names are checked against their defaults:

```tjs
function point({ x = 0, y = 0 } = {}) {
  return JSON.stringify({ x, y })
}

console.log(point({ x: 5 }))                   // {"x":5,"y":0}
console.log(point())                           // {"x":0,"y":0}
console.log(isMonadicError(point({ x: 'a' }))) // true: x takes an integer
```

The difference is what your function gets. Destructuring gives you separate variables and
drops the object, so extra keys cannot be forwarded and nested objects are not completed
unless you destructure them too. The defaults also live in the destructuring pattern rather
than in an object you can read as a whole. A dictionary default keeps one object, merged at
every depth.

Destructuring with an object default, `({ a, b } = { a: 1, b: 2 })`, is neither. It keeps
JavaScript's all-or-nothing default, and its names are not checked at all:

```tjs
function d({ a, b } = { a: 1, b: 2 }) {
  return JSON.stringify({ a, b })
}

console.log(d())            // {"a":1,"b":2}
console.log(d({ a: 5 }))    // {"a":5}: b is undefined, not 2
console.log(d({ a: 'x' }))  // {"a":"x"}: not refused
```

For per-member defaults, write `opts = { a: 1, b: 2 }` and destructure in the body.

## The rules

### Absent members take their default

A member the caller leaves out, or passes as `undefined`, gets its default. Calling with no
argument at all, or with `undefined`, gives you the whole default:

```tjs
function place(args = { x: 0, y: 0 }) {
  return args
}

console.log(JSON.stringify(place({ x: 5 })))          // {"x":5,"y":0}
console.log(JSON.stringify(place({ x: undefined })))  // {"x":0,"y":0}
console.log(JSON.stringify(place()))                  // {"x":0,"y":0}
console.log(JSON.stringify(place(undefined)))         // {"x":0,"y":0}
```

Falsy values are values: `0`, `''` and `false` each replace the default, as long as they
match its type. Only `undefined` means "not given".

### Nested objects merge too

An object inside the default is a dictionary in its own right, so a caller who passes part
of it, or an empty one, gets the rest filled in:

```tjs
function render(opts = { inner: { b: '' }, margin: { top: 0, left: 0 } }) {
  return opts
}

console.log(JSON.stringify(render({ inner: {} })))
// {"inner":{"b":""},"margin":{"top":0,"left":0}}
console.log(JSON.stringify(render({ margin: { top: 3 } })))
// {"margin":{"top":3,"left":0},"inner":{"b":""}}
```

With a one-level spread (`{ ...defaults, ...opts }`), the second call would lose `left`.

### Members are checked against their defaults

Each default is also an **example** of its member's type, read by the same rules as every
other example in TJS (see [Types by Example](/types-by-example/)). `x: 0` means "an
integer, defaulting to 0", so a string is refused, and so is `1.5`. Write `x: 0.0` for a
member that takes any number.

A refused call does not throw, and it does not run the body: it returns an error value.
`isMonadicError(x)` tells you whether you got one; in a `.tjs` file it is available
everywhere without an import.

```tjs
function place(args = { x: 0, y: 0 }) {
  return args
}

const bad = place({ x: 's' })
console.log(isMonadicError(bad))  // true
console.log(bad.message)
// Expected integer for '…place.args.x', got string
console.log(isMonadicError(place({ x: 1.5 })))  // true: 0 is an integer example
```

The message names the exact member, starting with the file and line (shown here as `…`).
[Errors as Values](/errors-as-values/) covers what to do with an error value.

### Defaults must be literals

The merge code is written when the file is compiled, with the default's values copied into
it, so every member of a dictionary default must be a literal. That means a number
(negative ones included), a quoted string, `true` or `false`, `null`, or an object or array
literal built from those. Anything else is a compile error: a function call
(`{ at: Date.now() }`), a named constant (`{ timeout: DEFAULT_TIMEOUT }`), and even a
backtick string with no substitutions.

To compute a value on each call, give the member the default `undefined` and fill it in the
body:

```tjs
function roll(opts = { seed: undefined, sides: 6 }) {
  const seed = opts.seed ?? Math.random()
  return typeof seed
}

console.log(roll())                  // number: a fresh value on each call
console.log(roll({ seed: 'abc' }))   // string: an undefined default checks nothing
```

As the second call shows, a member whose default is `undefined` has no example to check
against, so it accepts anything (see [A `null` default accepts anything](#a-null-default-accepts-anything)).
Check it yourself in the body if it matters.

### Extra keys pass through

A key the default does not mention is kept, unchecked, in the object your function
receives:

```tjs
function sized(opts = { w: 100, h: 100 }) {
  return opts
}

console.log(JSON.stringify(sized({ w: 5, color: 'red' })))
// {"w":5,"color":"red","h":100}
```

This is so a caller can forward its own options, or hand one object to two functions,
without losing data. A dictionary default is therefore not a sanitiser: if you need exactly
the declared keys, pick them out yourself.

The cost is that a misspelled option is accepted silently. `sized({ widht: 5 })` keeps
`w: 100`, carries `widht` along, and nothing fails at runtime. The next section shows how to
catch that before it runs.

### A complete argument is not copied

If the caller's object already has every declared member, and every member checks, your
function receives **that object**. Extra keys do not change this. If any member is missing,
at any depth, the function receives a new, merged object and the caller's object is left
alone:

```tjs
function sized(opts = { w: 100, h: 100 }) {
  return opts
}

const full = { w: 1, h: 2, color: 'red' }
console.log(sized(full) === full)    // true: the same object, no copy

const part = { w: 1 }
console.log(sized(part) === part)    // false: a new object
console.log(JSON.stringify(part))    // {"w":1}: the caller's object is unchanged
```

Supplying everything therefore costs nothing beyond the check. The consequence to keep in
mind: if your function modifies `opts`, it modifies the caller's object when the caller
passed a complete one (as in plain JavaScript), and does not when the caller passed a
partial one. Copy `opts` first if you need to change it.

## Catching misspelled options

A lint rule, `dict-default-excess-key`, flags a key that is not a member of the dictionary,
written in an object literal at the call. It has two limits. It sees only calls to a
function declared in the same source, and only literal payloads: an object built elsewhere
and passed in a variable, or one containing a spread (`{ ...base, retryz: 9 }`), is not
checked.

`tjs check` does not run lint rules, and the live examples on this site do not show lint
warnings, so run it with the `lint` function from `tjs-lang/lang`:

```javascript
import { lint } from 'tjs-lang/lang'

const source = `function connect(opts = { retries: 3 }) {
  return opts.retries
}
connect({ retryz: 9 })`

for (const d of lint(source).diagnostics) {
  console.log(`${d.line}:${d.column} ${d.rule}: ${d.message}`)
}
// prints one line (wrapped here):
// 4:10 dict-default-excess-key: 'retryz' is not a member of connect's dictionary
// parameter — check the spelling (it is passed through, so it will have no effect)
```

`line` counts from 1 and `column` from 0, so `4:10` is the `r` of `retryz` on the fourth
line.

## Required or defaulted

Three signatures put an object in a parameter, and only `=` with a plain object literal is a
dictionary. The difference shows as soon as a caller passes part of an object:

| Declaration                 | The argument | Its members                                     |
| --------------------------- | ------------ | ----------------------------------------------- |
| `opts = { a: 0, b: '' }`    | optional     | each optional, filled from the default, checked |
| `opts: { a: 0, b: '' }`     | required     | each required and checked; nothing is merged    |
| `p: Point = { x: 1, y: 2 }` | optional     | if passed, must be a whole `Point`              |

A colon makes the object a **shape**, the same as any other colon example: the members it
shows are examples of what must be there. Extra keys are kept, as with a dictionary, but
nothing is filled in at any depth, so a nested object must be complete too.

A typed default (`name: Type = value`) is an optional parameter of that type, and the
default is used only when the argument is absent. `Type` gives a shape a name; it is taught
in [Types by Example](/types-by-example/#naming-a-shape).

```tjs
// `=` with an object literal: a dictionary
function merged(opts = { a: 0, b: '' }) {
  return JSON.stringify(opts)
}

// `:` with an object literal: a required shape
function shaped(opts: { a: 0, b: '' }) {
  return JSON.stringify(opts)
}

// A type plus a default: optional, but all or nothing
Type Point {
  example: { x: 0, y: 0 }
}
function at(p: Point = { x: 1, y: 2 }) {
  return JSON.stringify(p)
}

console.log(merged({ a: 1 }))               // {"a":1,"b":""}
console.log(shaped({ a: 1, b: 'hi' }))      // {"a":1,"b":"hi"}
console.log(shaped({ a: 1, b: 'x', c: 2 })) // {"a":1,"b":"x","c":2}: extras kept
console.log(shaped({ a: 1 }).message)
// Expected string for '…shaped.opts.b', got undefined
console.log(at())                           // {"x":1,"y":2}
console.log(at({ x: 5 }).message)
// Expected Point for '…at.p', got object
```

There is no marker for "a required member inside a dictionary": if the caller must supply
it, it is not a default. Put the required values in their own parameters, ahead of the
options, the way `addEventListener(type, listener, options)` does:

```tjs
function fetchUser(id: 0, opts = { verbose: false, retries: 3 }) {
  return `user ${id}, verbose=${opts.verbose}, retries=${opts.retries}`
}

console.log(fetchUser(7))                     // user 7, verbose=false, retries=3
console.log(fetchUser(7, { verbose: true }))  // user 7, verbose=true, retries=3
console.log(isMonadicError(fetchUser()))      // true: id is required
```

## Opting out

Sometimes an object really is one value, a point or a range, and a partial one should
replace the default rather than be completed from it. Wrap that one default in
`LegacyDefault` (available in every `.tjs` file without an import) to get JavaScript's
all-or-nothing behaviour back.

`LegacyDefault` turns off the merge and the member checks together. What remains is a check
that the argument, if passed, is an object. A `!` at the start of the parameter list also
keeps the atomic default, but it turns off every check in the function, for every parameter
(see [Safety and Validation](/safety-markers/)):

```tjs
function legacy(range = LegacyDefault({ from: 0, to: 10 })) {
  return JSON.stringify(range)
}

function unchecked(! range = { from: 0, to: 10 }) {
  return JSON.stringify(range)
}

console.log(legacy())                      // {"from":0,"to":10}
console.log(legacy({ to: 5 }))             // {"to":5}: replaced, not merged
console.log(legacy({ to: 'five' }))        // {"to":"five"}: members are not checked
console.log(isMonadicError(legacy('ten'))) // true: it must still be an object
console.log(unchecked({ to: 'five' }))     // {"to":"five"}
console.log(unchecked('ten'))              // "ten": nothing is checked
```

If you want the members checked as well, use a typed default instead
(`range: Range = { from: 0, to: 10 }`, from the table above): still all or nothing, but a
passed object must be a whole `Range`.

### Where object defaults stay atomic

Dictionary defaults are a rule of `.tjs` files. Wherever source must keep its JavaScript
meaning, an object default stays all or nothing:

- **A `.js` file**, or source compiled with `tjs(source, { dialect: 'js' })`, which tells
  the compiler to treat it as plain JavaScript.
- **A `.tjs` file marked `TjsCompat`**, the marker a converted file carries to keep
  JavaScript semantics while you migrate it.
- **TypeScript converted with `fromTS`**, the TypeScript converter. It writes
  `LegacyDefault({ … })` for you, so the file keeps its behaviour when it later becomes
  native TJS (see [Converting a project](/ts-converting-a-project/)).
- **AJS, the agent language**, which does not merge either. It treats an object default
  like a required shape once the argument is passed: absent means the default, and a passed
  object must have every member.

The `.tjs` extension is what opts you in to a small set of rules that change what familiar
JavaScript means. This is one; TJS's `==` (see [Equality](/equality/)) is another, and the
literal-only rule above refuses some JavaScript defaults outright. Code without the
extension keeps its JavaScript meaning. The invariant and its exceptions are in
[Design Principles & Invariants](/PRINCIPLES/).

## Gotchas

### A `null` default accepts anything

A member whose default is `null` (or `undefined`) has no example to check against, so it
accepts any value. That is how you declare an option with no natural default:

```tjs
function open(opts = { parent: null, retries: 3 }) {
  return opts
}

console.log(JSON.stringify(open()))                  // {"parent":null,"retries":3}
console.log(JSON.stringify(open({ parent: 'root' })))
// {"parent":"root","retries":3}
console.log(JSON.stringify(open({ parent: 42 })))    // {"parent":42,"retries":3}
```

The reverse does not hold. Passing `null` for a member whose default is not `null`, or for
the whole argument, is an error: `null` is a value, not an absence, and quietly replacing it
with a default would hide a caller's bug.

### Prototype keys are refused

A merge is exactly where prototype pollution happens, so `__proto__`, `constructor` and
`prototype` are refused as keys of the incoming object and of every nested object the merge
walks into. `JSON.parse` creates `__proto__` as an ordinary own key, which is what an
attacker sends:

```tjs
function place(args = { x: 0, y: 0 }) {
  return args
}

const hostile = JSON.parse('{"x":1,"__proto__":{"polluted":true}}')
const result = place(hostile)
console.log(isMonadicError(result))  // true
console.log(result.message)
// Expected safe key for '…place.args.__proto__', got string
console.log({}.polluted)             // undefined: nothing was polluted
console.log(isMonadicError(place({ x: 1, constructor: 2 })))  // true
```

The message reads "got string" because what failed the check is the key itself, a string,
not the value under it.

The merge walks only into members the default declares as objects. The value of a
`null`-default member, and anything under an extra key, is passed through unread, so a
`constructor` key there is not refused (and an option of that name is only possible there).
Treat such values as untrusted, the same as in plain JavaScript.

### Arrays are replaced, not merged

An array in a default is a single value. A caller's array replaces it whole, never index
by index, and an empty array is a perfectly good value:

```tjs
function tag(opts = { tags: ['draft', 'new'], n: 0 }) {
  return opts
}

console.log(JSON.stringify(tag({ n: 1 })))         // {"n":1,"tags":["draft","new"]}
console.log(JSON.stringify(tag({ tags: ['x'] })))  // {"tags":["x"],"n":0}
console.log(JSON.stringify(tag({ tags: [] })))     // {"tags":[],"n":0}
console.log(isMonadicError(tag({ tags: [42] })))   // true: the items are strings
```

The elements are checked as with any array example: each element must match one of the
types in the default. A mixed default such as `['', 0]` accepts strings and integers in any
order, and an empty default, `tags: []`, gives no element type, so it accepts an array of
anything.

## Why it works this way

The alternatives TJS considered, why merge-on-partial won, and where TJS departs from
WebIDL dictionaries (WebIDL strips extra keys; TJS does not) are in the design record,
[Dictionary Defaults: the design record](/dictionary-defaults/). The complete syntax is in
the [TJS Syntax Reference](/TJS-SYNTAX/#object-shapes-and-dictionary-defaults).
