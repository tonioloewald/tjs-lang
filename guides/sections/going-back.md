<!--{"parent": "TJS-FOR-TS.md", "order": 7, "placement": {"language": {"parent": "for-programmers.md", "order": 40}}}-->
<!-- TODO review -->

# Going Back

Leaving TJS: `tjs emit` gives you standalone JavaScript and `.d.ts` files. This chapter
covers what you keep, what you lose, why the exit is cheap for most files, and what it costs
for idiomatic native TJS.

## The disposal tax

When a team evaluates a tool, it asks how hard the tool is to get in. That is the
**adoption cost**. The question almost nobody asks is how hard it is to get out: a hundred
files and three years later, when the team has changed, or the project was abandoned, or
the tool did not work out. That is the **disposal cost**, or **disposal tax**. (The term
comes from an essay in the
[tosijs coding practices](https://github.com/tonioloewald/tosijs-coding-practices); this
section paraphrases it.)

The disposal tax is not "can I `git checkout` the file I converted this morning". Reverting
a morning's work is free with any tool. The tax is what you pay when you leave after the
tool has shaped years of code, and that bill tends to arrive when nobody has budget for it.

TypeScript's disposal tax is close to zero, and that may be the main reason it beat
CoffeeScript, Flow and Dart. The usual way to say it is "strip the annotations and you have
JavaScript", but that is only true of the **erasable subset**. `enum`, parameter properties
(`constructor(private x: number)`), `namespace` and decorators (especially with
`emitDecoratorMetadata`) compile to runtime code rather than disappearing. TypeScript's
`--erasableSyntaxOnly` flag and Node's built-in type stripping exist to keep you inside the
subset you can leave from. What erasure costs you while you stay is covered in
[Types are erased](/typescript-good-bad-ugly/#types-are-erased), a section of the opening
chapter of the TypeScript book; this chapter is about what leaving costs.

The corollary is uncomfortable. **Value and lock-in are usually the same feature.**
Anything a tool gives you that the thing it replaces cannot express is, by definition,
something that cannot come back with you when you leave. A feature-free adoption costs
nothing to undo and is worth nothing. So judge a tool by its **value net of disposal
tax**, and TJS is no exception.

## What leaving costs depends on how far in you went

A TypeScript project can use TJS at several depths. The
[four states of a file](/typescript-good-bad-ugly/#four-states-of-a-file) are defined in
the TypeScript book; in short:

- **Calling TJS from TypeScript.** Your files stay `.ts`. You import tjs-lang as a library
  (`Eval`, `SafeFunction`, AJS agents, the builder), as in
  [Part 1](/TJS-FOR-TS/#part-1-using-tjs-from-typescript) of TJS for TypeScript Programmers.
- **`TjsStrict`.** A `.ts` file whose first line is `/* @tjs TjsStrict */`. To `tsc` that is
  an ordinary comment. To the converter (`tjs convert`, or `fromTS` from code, which turns
  TypeScript into TJS) it means "make this full TJS", so every parameter is checked in the
  converted output.
- **Converted.** The converter's output: a `.tjs` file that starts with a comment such as
  `/* tjs <- price.ts */`. That comment says the file keeps JavaScript's semantics, so its
  parameters are not checked and `==` still coerces.
- **Native (graduated).** A `.tjs` file without that comment, so TJS's own rules apply.
  Graduation is the step that removes the comment from a converted file; a file you wrote
  in TJS, or a `.js` file you renamed to `.tjs`, is native from the start.

A converted file can be in one of two workflows: you keep editing the `.ts` and run the
converter as a build step, or you committed the converted `.tjs` and edit that. The cost of
leaving looks like this:

| How far in you went | How you leave | What it costs |
| --- | --- | --- |
| Calling tjs-lang from TypeScript | Remove the dependency | The call sites |
| `TjsStrict` | Delete the comment, or stop running the converter. `tsc` already treats the comment as an ordinary comment | Only the runtime checks, and any code that came to rely on them |
| Converted, with the `.ts` as your source and conversion as a build step | Stop converting | Nothing |
| Converted, with the converted `.tjs` as your source | Compile it to JavaScript (see the callout below) | The type annotations, which compile away, plus the [named escapes](/ts-converting-a-project/#the-named-escapes), the only place TJS semantics remain |
| Native `.tjs` | `tjs emit` | The rest of this chapter |

The named escapes are calls such as `DangerousLegacyEquals(a, b)`, which the converter
writes where JavaScript's behaviour has to survive. TJS's own `==` does not coerce types
(`'5' == 5` is `false`) but keeps `null == undefined` as `true`; `DangerousLegacyEquals(a,
b)` is JavaScript's coercing `a == b`, spelled long so you can find it.

> **Compile converted files with the API, not `tjs emit`.** Today `tjs emit` ignores the
> `/* tjs <- … */` comment and compiles every `.tjs` file as native TJS, so a converted file
> comes out with parameter checks it never had and `==` rewritten to TJS's meaning. The API
> reads the comment: `tjs(source).code`, from `tjs-lang/lang`, keeps JavaScript's semantics,
> with no checks and `DangerousLegacyEquals(a, b)` still meaning `a == b`. Use it for
> converted files until the CLI is fixed.

If you came from JavaScript and kept your files as `.js` (or compiled them with
`dialect: 'js'`, the transpiler option that compiles a file with plain-JavaScript
semantics), and used no TJS features, there is nothing to leave: that code is JavaScript,
as [TJS for JavaScript Programmers](/TJS-FOR-JS/#what-stays-the-same) says.

The rest of the chapter is about native TJS, which is the case with a real bill.

## The exit in one command

Here is a small native project. `cart.tjs` has a declared `Type`, a function with an `==`
null check and a `//` comment, a function whose return annotation is a tested signature
example, and a `test` block:

```tjs:inline
/*#
Cart arithmetic: totals with tax.
*/

export Type Item {
  description: 'a line in a cart'
  example: { name: 'pen', price: 1.5 }
}

/** The sum of price × qty, plus tax. */
export function total(items: [Item], taxRate = 0.1):! 0.0 {
  let sum = 0
  for (const item of items) {
    // a missing quantity counts as one
    const qty = item.qty == null ? 1 : item.qty
    sum += item.price * qty
  }
  return sum * (1 + taxRate)
}

export function greet(name: 'Ada'): 'Hello, Ada' {
  return `Hello, ${name}`
}

test 'total adds tax' {
  expect(total([{ name: 'pen', price: 10, qty: 2 }], 0.5)).toBe(30)
  expect(total([{ name: 'cap', price: 4 }], 0)).toBe(4)
}
```

`Type Item { … }` declares a named type: `description` is documentation and `example` is
the shape to check against. `[Item]` means an array of `Item`. A type checks the fields its
example names and lets extra fields through, so `qty` is allowed, optional and unchecked.
(See [Types by Example](/types-by-example/) for the rules.)

`total`'s `:!` marks its return example as type-only (any float), so it is not run as a
test. `greet`'s plain `: 'Hello, Ada'` is a test: `greet('Ada')` must return exactly that.

`main.tjs` uses it. It imports a sibling file, so it does not run on this page:

```tjs:static
import { total, greet } from './cart.tjs'

console.log(greet('Grace'))
console.log(total([{ name: 'pen', price: 2, qty: 3 }, { name: 'cap', price: 1 }], 0))
console.log(total('nope').message)
```

A call with a bad argument returns a `MonadicError` value instead of throwing, so the last
line prints the reason. [Errors as Values](/errors-as-values/) explains why.

The `tjs` command comes with the `tjs-lang` package (`bun add -d tjs-lang`, then run it as
`bunx tjs`). It is a Bun script, so it needs [Bun](https://bun.sh) even when your project
runs on Node; [Converting a TypeScript Project](/ts-converting-a-project/#install) has the
details. Emit the whole tree:

```bash
tjs emit --dts src/ -o out/
```

```text
✓ src/main.tjs -> out/main.js
  out/main.d.ts
  📄 out/main.md
  ✓ 2 tests passed
✓ src/cart.tjs -> out/cart.js
  out/cart.d.ts
  📄 out/cart.md

src/: 2 emitted, 0 failed, 0 skipped
```

For each `.tjs` file this writes a `.js`, a `.d.ts` and a `.md`. The `.md` (marked `📄`) is
documentation generated from the signatures and doc comments. For a file with no
declarations, like `main.tjs`, the `.d.ts` and `.md` are empty.

The CLI prints a file's test results on the line before that file's own `->` line, so
`2 tests passed` belongs to `cart.tjs`: its `test` block and `greet`'s signature example ran
before anything was written.

Copy `out/` to a machine with Node and nothing else, and run it:

```bash
node out/main.js
```

```text
Hello, Grace
7
Expected array of Item for 'cart.tjs:11:total.items', got string
```

No `tjs-lang` package is installed. Each emitted file that needs runtime support carries
the part it uses, in a block named `__tjs_rt` at its top. Just after it, the file defines a
local `__tjs`: the shared runtime if one is installed (`globalThis.__tjs`), otherwise the
functions from that inline block. That is what the `__tjs.typeError(…)` and
`__tjs.toBool(…)` calls in the emitted code below refer to. Here `cart.js` is 8,477 bytes,
about 5.9 KB of which is that block. `main.js` carries none, because it has no functions,
conditions or types of its own. Bun is needed once, to run `tjs emit`; the output needs
nothing. Tests pin this, because it broke once: in August 2026 a change made declared types
reject every value when no full runtime was loaded, and it was fixed the same day.

The flags, the `.tjs` → `.js` import rewrite, the tests that run before anything is
written, and `--jfdi` are covered in
[Publishing a TJS Library](/ts-publishing-a-library/#building-tjs-emit---dts) and
[Build, CI and Editors](/ts-build-and-tooling/#other-toolchains-precompile-with-tjs-emit).

## What you keep

**The behaviour, exactly.** The emitted JavaScript is the program the `.tjs` file
described, not a weakened copy of it. Parameter checks still run, a bad call still returns a
`MonadicError` instead of throwing (the third line above), and `==` keeps its TJS meaning.
Reading only, trimmed:

<!-- tjs-doc: fragment -->

```javascript
export function total(items, taxRate = 0.1) {
  __tjs.pushStack('cart.tjs:11:total');
  const __cv_items = __tjs_rt.__tv(items);
  if ((!Array.isArray(__cv_items) || … )) { return __tjs.typeError(…) }
  …
    const qty = __tjs.toBool(__tjs_rt.Eq(item.qty, null))?(1):(item.qty)
```

Modules emitted separately still share one `MonadicError` class, so `instanceof` works
across them; [Runtime fusion](/runtime-fusion/) explains how.

**Your logic, as written, wrapped in checks.** Statements stay in order and keep your names;
the additions are the checks at the top of each function and the rewrites listed under
[Readability](#readability) below.

**Block and doc comments.** TJS has two doc-comment forms, and both survive: `/*# … */`
(markdown, TJS's own) and `/** … */` (JSDoc). Ordinary `/* … */` blocks survive too. Reading
only:

<!-- tjs-doc: fragment -->

```javascript
/*#
Cart arithmetic: totals with tax.
*/
…
/** The sum of price × qty, plus tax. */
export function total(items, taxRate = 0.1) {
```

**`fn.__tjs` metadata.** Every checked function still carries its signature as plain data.
Reading only:

<!-- tjs-doc: fragment -->

```javascript
total.__tjs = {
  "params": {
    "items": { "type": { "kind": "array", "items": { "kind": "declared", "typeName": "Item" } }, … },
    "taxRate": { "type": { "kind": "number" }, "required": false, "default": 0.1 }
  },
  …
  "source": "cart.tjs:11"
}
```

`functionMetaToJSONSchema(total.__tjs)` from tjs-lang turns it into JSON Schema, and your
own code can read it to generate documentation or forms. Nothing in the emitted code reads
it, so once nothing of yours does either, you can delete the `__tjs = { … }` assignments.

**Your types as JSON Schema**, if you export them before you go. `toJSONSchema()` lives in
the full runtime, not in the inline block an emitted file carries, so run it through
`tjs run` while TJS is still installed. `tjs run` does not resolve imports between `.tjs`
files yet, so append the call to a copy of the file:

```bash
cp src/cart.tjs /tmp/item-schema.tjs
echo 'console.log(JSON.stringify(Item.toJSONSchema(), null, 2))' >> /tmp/item-schema.tjs
tjs run /tmp/item-schema.tjs > item.schema.json
```

The schema says `"additionalProperties": false`, which is stricter than the check: it
rejects the `qty` field that `Item` accepts. Open it before you hand it to a strict
validator; see the gotchas in [Types by Example](/types-by-example/#gotchas) and
[Validating JSON at the Boundary](/ts-json-boundary/).

**TypeScript types for your consumers**, through the `.d.ts`. Reading only:

```typescript
export declare function total(items: Item[], taxRate?: number): number;
export declare function greet(name: string): string;
export type Item = { name: string; price: number };
export declare const Item: { check(value: any): boolean; default: { name: string; price: number }; (value: any): boolean; };
```

**The generated documentation**: `cart.md` lists each function's signature, examples
included, with the doc comments above it.

## What you lose

### Your `//` comments

Your line comments are removed, at top level and inside function bodies, and each becomes a
blank line. (The emitter adds a few `//` comments of its own, in polymorphic dispatchers, so
a search of the output can still find some.) Compare the loop above with its source.
Reading only:

<!-- tjs-doc: fragment -->

```javascript
  for (const item of items) {

    const qty = __tjs.toBool(__tjs_rt.Eq(item.qty, null))?(1):(item.qty)
```

`// a missing quantity counts as one` is gone. If a comment matters, make it a
`/* … */` block before you leave.

### Your tests

`test` blocks and signature examples run during `tjs emit` and are then removed. A
signature example survives only as its type in `__tjs` and as text in the generated `.md`:
`greet`'s `'Ada'` and `'Hello, Ada'` appear nowhere in `cart.js`. Leaving TJS means leaving
its test runner, so port the tests first (step 1 of the plan below).

### Readability

The program survives. The source you would want to keep editing does not. Four TJS
constructs feature here; a TypeScript reader has probably not met them:

- A **dictionary default**, `place(args = { x: 0, y: 0 })`, fills in each missing member
  and checks the ones given ([Dictionary Defaults](/defaults/)).
- A **polymorphic function** is several declarations with one name, dispatched by argument
  count and type ([Polymorphic functions](/classes-and-dispatch/#polymorphic-functions)).
- **`given`** is TJS's `switch`: several values per arm and no fallthrough
  ([`given`](/TJS-SYNTAX/#control-flow-given)).
- **`extend`** adds methods to a built-in type for one file, without touching its prototype
  ([`extend`](/TJS-SYNTAX/#extend-local-class-extensions)).

In the emitted files:

- Every file that has checks starts with several KB of runtime on a few very long lines.
  Collapsed, it reads `const __tjs_rt = (() => { … })();` followed by a few lines of
  aliases.
- Each checked function opens with a prologue of `__cv_*` locals and type tests.
- `if (x == null)` becomes `__tjs.toBool(__tjs_rt.Eq(x, null))`, and every condition is
  wrapped in `__tjs.toBool(…)`, even one that uses `===`.
- `a || b` and `a && b` become small arrow-function wrappers around `__tjs.toBool`:
  `return a || b` comes out as
  `return ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(b))(a)`.
- A dictionary default expands into a dozen lines of merging code.
- A polymorphic function becomes `area$1`, `area$2` and a dispatcher.
- `given` becomes a C `switch` over `__tjs.swKey(x)`.
- An `extend` method becomes `__ext_String.shout.call('hi')`.

`shapes.tjs` uses the four constructs:

```tjs:inline
export function area(radius: 3.14) { return Math.PI * radius * radius }
export function area(w: 0.0, h: 0.0) { return w * h }

export function describe(kind: 'cat') {
  given kind {
    'cat', 'dog' { return 'pet' }
  } else {
    return 'wild'
  }
}

export function place(args = { x: 0, y: 0 }) {
  return args
}

extend String {
  shout() { return this.toUpperCase() + '!' }
}

export const hi = 'hi'.shout()

test 'shapes' {
  expect(area(3, 4)).toBe(12)
  expect(describe('dog')).toBe('pet')
  expect(place({ x: 5 })).toEqual({ x: 5, y: 0 })
  expect(hi).toBe('HI!')
}
```

What `shapes.js` looks like, reading only, trimmed (574 bytes of source become 8,934):

<!-- tjs-doc: fragment -->

```javascript
function area$1(radius) { … }
function area$2(w,h) { … }

export function describe(kind) {
  …
  switch (__tjs.swKey(kind)) {
case 'cat': case 'dog': {  return 'pet'
break }
default: {
    return 'wild'
   }
}
  …
}

export function place(args = { x: 0, y: 0 }) {
  …
  for (const __dd0k in args) { if (Object.prototype.hasOwnProperty.call(args, __dd0k)) { … } }
  let __dd0f = 0;
  let __dd0c = false;
  let __dd1 = args.x;
  if (__dd1 === undefined) { __dd1 = 0; __dd0f++; __dd0c = true; }
  else if ((typeof __dd1 !== 'number' || !Number.isInteger(__dd1))) return __tjs.typeError(…);
  …
  if (__dd0f > 0 || __dd0c) {
    args = { ...args, x: __dd1, y: __dd2 };
  }
  return args
  …
}

const __ext_String = {
  shout: function() { return this.toUpperCase() + '!' }
}
…
export const hi = __ext_String.shout.call('hi')

export function area(...__args) {
  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(typeof __tjs_rt.__tv(__args[0]) === 'number'):__tjs__t)(__args.length === 1))) return area$1(__args[0])
  …
}
```

It all still runs: under Node, `area(3, 4)` is `12`, `describe('dog')` is `'pet'`,
`place({ x: 5 })` is `{ x: 5, y: 0 }` and `hi` is `'HI!'`.

### `wasm` blocks and predicates

A `wasm { }` block ([Inline WASM](/inline-wasm/)) is compiled when the file is transpiled.
The emitted file carries the WebAssembly as base64 bytes, a loader, and your `fallback { }`
code as the JavaScript path. The source inside `wasm { }` does not appear in the output at
all. A 10-line `double(arr, len)` emits as 10,449 bytes and still runs under Node, but after
you leave, the fallback is the only version of that loop you can read or edit. Keep the
`wasm { }` source in your history, or port it to the WASM toolchain you move to.

A **predicate** is a function that a `Type` runs on top of its example check:

```tjs:inline
export Type Even {
  example: 2
  predicate(x) { return x % 2 === 0 }
}

export function half(n: Even):! 0 {
  return n / 2
}

console.log(half(10))
console.log(half(3).message)
```

That prints `5`, then `Expected Even for 'even.tjs:6:half.n', got number` (on this page the
file name differs). The predicate body survives emission as ordinary JavaScript, wrapped in
a fuel counter and the `Type` machinery, so the rule itself comes out with you. What does not
come out is any TypeScript form of it: see the next section.

### Precision in the `.d.ts`

The declarations are wider than the contract the code enforces. For `shapes.tjs`, reading
only:

```typescript
export declare function describe(kind: string): any;
export declare function place(args?: { x?: number; y?: number }): any;
export declare function area(__args: any[]): any;
export declare const hi: string;
```

- **Error returns are not in the declared type.** `total` is declared to return `number`,
  but `total('nope')` returns a `MonadicError`. A TypeScript caller that does not check the
  result gets the error as if it were a number.
- **A function with no return example is declared `any`**, which is why `describe` and
  `place` return `any`. Give the function a return example (`:! ''`) and the declaration
  gets a type.
- **A `Type` that is not exported is not exported from the `.d.ts`** either, so consumers
  cannot name it. That is why `cart.tjs` writes `export Type Item`.
- **Integer and float both become `number`.** The example `0` means integer and `0.0` means
  float; `place` checks that `x` is an integer, and the declaration does not say so.
- **A predicate has no TypeScript form**: `Even` above is declared `type Even = number`.
- **A `Type`'s description does not become JSDoc**: `Item`'s `'a line in a cart'` is not in
  `cart.d.ts`.
- **A polymorphic function is declared `area(__args: any[])`**, though the JavaScript takes
  a rest parameter, `area(...__args)`. TypeScript callers cannot call it at all: `area(1)`
  fails with TS2345 (`Argument of type 'number' is not assignable to parameter of type
  'any[]'`) and `area(3, 4)` with TS2554.

[Publishing a TJS Library](/ts-publishing-a-library/#current-gaps) lists the other known
gaps.

### TypeScript does not come back

There is no TJS → TypeScript emitter. Going back to TypeScript means one of two things:

- Keep the JavaScript and its `.d.ts`, and consume them as they are, or check the
  JavaScript with `allowJs` and `checkJs`.
- Port the code to TypeScript by hand, using the `.d.ts` as a guide.

If the project was converted from TypeScript, the pre-conversion `.ts` files are in your git
history. They stop matching your code the moment you graduate, and every change after that
widens the gap.

## Two ways out

There are two ways to turn native `.tjs` into JavaScript, and they produce different
programs:

| | `tjs emit` (or `tjs(source).code`) | `tjs(source, { dialect: 'js' }).code` |
| --- | --- | --- |
| Meaning | TJS semantics, exactly | JavaScript semantics |
| Parameter checks | Kept, with their runtime | Dropped |
| `==`, `typeof null`, boxed truthiness | TJS's meaning | JavaScript's meaning |
| Bodies | Rewritten (prologues, `toBool`, `Eq`) | As written |
| TJS-only syntax (`given`, `extend`, polymorphic functions) | Compiled | Refused: `shapes.tjs` fails with `Unexpected token` |
| Tests | Run first, then removed | Not run; removed |
| How | One CLI command | The API (no CLI flag), from a script |

On `cart.tjs`, the `dialect: 'js'` route writes `total` exactly as written, minus the `//`
comment, plus its `__tjs` metadata. `Item` still compiles to a `Type`, which brings a
1.7 KB runtime block; a file with no `Type` comes out with no runtime block at all.

There is no CLI flag for it, so loop over the tree yourself. This script uses the public
`tjs-lang/lang` entry point:

```javascript
// exit.mjs: compile every .tjs under one directory to plain JavaScript in another.
// Run it with Bun: bun exit.mjs src/ plain/
import { tjs } from 'tjs-lang/lang'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'

const [from, to] = process.argv.slice(2)
for (const file of readdirSync(from, { recursive: true })) {
  if (!file.endsWith('.tjs')) continue
  const source = readFileSync(join(from, file), 'utf8')
  const { code } = tjs(source, { dialect: 'js', filename: basename(file) })
  const out = join(to, file.replace(/\.tjs$/, '.js'))
  mkdirSync(dirname(out), { recursive: true })
  // point relative imports at the emitted files: './cart.tjs' -> './cart.js'
  writeFileSync(out, code.replace(/(['"]\.\.?\/[^'"]*)\.tjs(['"])/g, '$1.js$2'))
}
```

Run over the cart project, `node plain/main.js` prints `Hello, Grace`, `7` and then
`undefined`: `total('nope')` is no longer checked, so it loops over the characters of
`'nope'`, returns `NaN`, and `NaN.message` is `undefined`. That is the trade: plainer
source, and the program now does what JavaScript would do.

Which to use depends on what you are leaving with:

- **To keep shipping the same program** (a build artifact, an archived release), use
  `tjs emit`. The output is long, but it behaves exactly as before.
- **To get source you will keep editing**, use `dialect: 'js'`, after the plan below has
  removed everything that depends on TJS semantics. This is the recommended route for
  leaving for good: committed `tjs emit` output is not code anyone wants to maintain.

## An exit plan: lower the tax before you pay it

You can pay most of the tax gradually, while TJS can still test each step. This is the
[migration ladder](/ts-converting-a-project/) run in reverse, and it uses the same tools.

1. **Port the `test` blocks** to the test runner you are moving to, and run them against
   the emitted `.js`. It is the [convert-then-test recipe](/ts-build-and-tooling/#a-ci-recipe)
   turned around: there, your own suite proves the converted code still behaves; here, it
   proves the emitted code does. Once it passes, the TJS tests are redundant.
2. **Replace the TJS-only constructs**, in the `.tjs` source, one at a time, with the checks
   still running:
   - a polymorphic function with one function that branches;
   - `extend` with an ordinary function;
   - a dictionary default with a parameter that has no default and an explicit merge in the
     body (`return { x: 0, y: 0, ...args }`), which also drops the member checks;
   - `given` with `switch`. TJS keeps `switch`'s JavaScript semantics and warns on every
     one, suggesting `given`; the warning is advice, not an error, and you can ignore it
     while you leave. One difference matters: `given` compares the way TJS `==` does
     (boxed values unwrapped, `null` equal to `undefined`), and `switch` uses `===`, so an
     arm that relied on the looser match stops matching. The tests from step 1 catch it.
3. **Drop the checks you do not want to keep.** Remove a parameter's example (`items`
   instead of `items: [Item]`), or mark the whole function unsafe with `!` as its first
   parameter token (`function total(! items: [Item], taxRate = 0.1)`), which skips its
   input validation ([Safety Markers](/safety-markers/)). Either way the prologue goes. The
   native output still wraps conditions and `||`/`&&` in `__tjs.toBool` and still carries a
   small runtime block for them, so this step shortens `tjs emit` output without making it
   plain; only the `dialect: 'js'` route does that.
4. **Decide about each semantic difference.** Native TJS changes four things JavaScript
   does, and the `dialect: 'js'` route changes them back
   ([Equality and the Footguns TJS Removes](/equality/) has the detail):
   - `==` and `!=` do not coerce (`'5' == 5` is `false`), unwrap boxed primitives, and
     treat `NaN == NaN` as `true`. Write `===`, or an explicit
     `x === null || x === undefined`, wherever the TJS meaning must survive.
   - `typeof null` is `'null'`, not `'object'`. Code that tests `typeof x === 'null'` needs
     an explicit `x === null`. (`LegacyTypeOf(x)` is JavaScript's `typeof`.)
   - A boxed `false` (`new Boolean(false)`) is falsy. In JavaScript it is truthy. Unwrap
     boxed values with `.valueOf()` where your code might receive them.

   In a converted project, `grep -n Legacy` lists the escapes, each a place that depends on
   the JavaScript behaviour.
5. **Compile one last time and commit the result as your new source**, by the route chosen
   in [Two ways out](#two-ways-out): the `exit.mjs` script for source you will keep
   editing, or `tjs emit` to keep the checks and their runtime. After steps 2 to 4, the
   `dialect: 'js'` route no longer changes what your code means beyond dropping the checks.

The point is the timing. Each step is small, runs under tests, and can be done in a quiet
week, rather than all at once on the day you have no budget for it.

## Why the tax stays low, and where it does not

Several design choices keep leaving TJS cheap:

- **Output is standalone.** Emitted JavaScript has no runtime dependency: each file carries
  the part of the runtime it uses. `tjs emit` deliberately does not offer a shared runtime
  to published libraries, which would tie them to an exact tjs-lang version; see
  [Shared runtime](/shared-runtime/).
- **TJS ⊇ JS.** The JavaScript in a `.tjs` file means what it meant in JavaScript, except
  where TJS deliberately changes the meaning (`==`, `typeof null`, truthiness of boxed
  values; step 4 above). See [Design Principles & Invariants](/PRINCIPLES/).
- **Types are JavaScript values.** An example or a predicate is ordinary code, not a second,
  type-level language, so there is no conditional or mapped type to translate on the way out.
- **Some language design is decided on disposal-tax grounds.** TJS used to have a separate
  `Generic` keyword for types with parameters, so a TypeScript `type` could become either of
  two TJS declarations. On 2026-08-06 `Generic` became an alias of `Type`, so the two
  correspond one to one and a hand port back is mechanical; the
  [assumptions ledger](/ASSUMPTIONS/) records the decision.
- **The escapes are greppable.** `DangerousLegacyEquals`, `LegacyDefault` and the rest are
  long names so you can find every one.
- **`.d.ts` emission exists**, so TypeScript consumers are not stranded when you leave.

Now the other side of it. The more idiomatic your TJS (`given`, polymorphic functions,
`extend`, dictionary defaults, predicates, `wasm` blocks), the higher your tax, because each
of those is something JavaScript and TypeScript cannot say. That is not a defect. It is the
rule that value and lock-in are the same feature, applied to TJS. The useful question is not
whether a construct locks you in, but whether it is worth more than leaving it would cost:
its value net of disposal tax.

## Checklist

- Know which state each file is in: calling TJS from TypeScript, `TjsStrict`, converted, or
  native.
- For converted `.tjs` files, compile with `tjs(source).code`, not `tjs emit`, until the CLI
  honours the conversion comment.
- Port `test` blocks to your target test runner and run them against the emitted `.js`.
- Turn every `//` comment you want to keep into a `/* … */` block.
- Export your types as JSON Schema with `tjs run` while TJS is still installed, if you want
  them.
- Keep the source of any `wasm { }` block; the output carries only bytes and the fallback.
- Replace polymorphic functions, `given`, `extend` and dictionary defaults with plain
  JavaScript while TJS can still check the change.
- Drop the parameter checks you do not want to keep, by removing examples or with `!`.
- Settle `==`, `typeof null` and boxed truthiness wherever the TJS meaning must survive.
- Choose the route: `tjs emit` to keep the program exactly, `dialect: 'js'` for source you
  will keep editing.
- Run your suite and your app on the output with no tjs-lang installed, then commit it.
