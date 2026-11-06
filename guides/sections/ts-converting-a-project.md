<!--{"parent": "TJS-FOR-TS.md", "order": 2}-->
<!-- TODO review -->

# Converting a TypeScript Project

Moving a codebase from TypeScript to TJS takes two mechanical steps and then a third you do
by hand, one site at a time. Keeping them apart is the point:

1. **Convert.** `tjs convert` turns each `.ts` file into TJS that behaves exactly as the
   TypeScript compiler's output would. Nothing about what the program does changes.
2. **Graduate.** Remove the conversion marker, and the file becomes native TJS. From then
   on, code you write in it gets TJS's rules: honest `==`, `typeof null` is `'null'`,
   classes are called without `new`. Code that was already there keeps its old meaning,
   because conversion wrote every JavaScript reliance as a named escape. Graduation changes
   behaviour in two places only: **parameters are now checked**, so a call with an argument
   of the wrong type returns an error instead of running, and boxed primitives
   (`new Boolean(false)`) become falsy (see the gotchas).
3. **Retire the escapes.** Replace each named escape with the plain spelling where the
   JavaScript behaviour was never intended. Each one is a separate decision.

You never have to trust a tool to have changed a thousand files correctly at once.

<!-- TODO review -->

## Install

```bash
bun add -d tjs-lang
bunx tjs convert --help
```

The `tjs` command is a Bun script, so it needs Bun even when the project runs on Node. From
code, conversion is `fromTS(source, { emitTJS: true })` from `tjs-lang/lang/from-ts`. The
commands below are written as plain `tjs`; prefix them with `bunx` (or add them to your
`package.json` scripts).

<!-- TODO review -->

## Step 1: convert

```bash
# One file, to TJS on stdout
tjs convert src/label.ts --emit-tjs

# A directory, to .tjs files
tjs convert --emit-tjs src/ -o tjs/

# A directory, straight to JavaScript (TypeScript -> TJS -> JS)
tjs convert src/ -o dist/
```

A directory is converted recursively, and the output keeps the source tree's layout. A file
the converter cannot turn into valid TJS is reported and not written, and `tjs convert`
then exits 1. Convert into a separate directory (`-o tjs/`) and keep the TypeScript as the
source of truth until the converted tree passes your tests.

Here is a small TypeScript file that leans on three JavaScript behaviours people rarely
notice they are using: `==` between unlike types, `typeof null`, and an object as a default
parameter.

```typescript
class Tally {
  count = 0
  add(n: number) {
    this.count += n
    return this
  }
}

export function describe(kind: string, value: any): string {
  if (value == 0) return 'nothing'
  if (typeof value === 'object') return 'a record'
  switch (kind) {
    case 'count':
      return 'count ' + new Tally().add(value).count
    default:
      return `${kind} ${value}`
  }
}

export function place(opts = { x: 0, y: 0 }) {
  return opts
}
```

Called with `describe('label', '')`, `describe('label', null)`, `describe('count', 3)` and
`JSON.stringify(place({ x: 5 }))`, it prints:

```text
nothing
a record
count 3
{"x":5}
```

This is what `tjs convert --emit-tjs` writes for it, byte for byte:

```tjs:static
/* tjs <- label.ts */

class Tally {
  count = 0;
  add(n: number) {
    this.count += n;
    return this;
}
}

/* line 9 */
export function describe(kind: string, value):! string {
    if (DangerousLegacyEquals(value, 0))
        return 'nothing';
    if (LegacyTypeOf(value) === 'object')
        return 'a record';
    switch (kind) {
        case 'count':
            return 'count ' + new Tally().add(value).count;
        default:
            return `${kind} ${value}`;
    }
}

/* line 20 */
export function place(opts = LegacyDefault({ x: 0, y: 0 })) {
    return opts;
}
```

The formatting is the converter's own: semicolons, re-indented function bodies, and a
`/* line N */` comment pointing each function back to its line in the `.ts` file. Class
bodies are not re-indented, which is why the method's closing brace lands in column 0. Run
your formatter over the output if you want your house style back. Four things to read in
it:

- **The first line, `/* tjs <- label.ts */`, is not decoration.** Its presence means
  _this file has JavaScript semantics_. While it is there, `==` coerces, `typeof null` is
  `'object'`, `new` is required and parameters are not checked, exactly as under `tsc`.
  `tjs(source)` and `graduate` honour the marker. **The `tjs` CLI does not yet:**
  `tjs check` and `tjs run` pick the dialect from the file extension and treat any `.tjs`
  file as native, so on this file `tjs check` fails with `` `new Tally` is not allowed
  in TJS ``. Graduate before you `tjs check` a converted tree.
- **The types became examples.** In TJS the value after a colon is an _example_, not a
  type: `x: 0` means "a number, such as 0", not the literal type `0`. A bare type name such
  as `string` is accepted too, so `kind: string` stays as it was, and TJS checks it once the
  file is native. `value: any` became an unannotated parameter, because `any` checks
  nothing. See [TJS for TypeScript Programmers](/TJS-FOR-TS/) for the idea in full.
- **The return type became `:! string`.** A plain return annotation in TJS is a worked
  example that is run as a test when the file is built: `function add(a: 2, b: 3): 5`
  calls `add(2, 3)` and fails the build unless it returns `5`. `:!` opts out of that, so the
  annotation only states the type. Conversion uses it for every TypeScript return type.
  (Return annotations are covered in the [syntax reference](/TJS-SYNTAX/).)
- **Every JavaScript reliance now has a name.** `value == 0` became
  `DangerousLegacyEquals(value, 0)`, `typeof value` became `LegacyTypeOf(value)`, and the
  object default became `LegacyDefault({ x: 0, y: 0 })`. Each of these means, in every
  dialect, exactly what the original meant in JavaScript.

That last point is what makes graduation safe, and it is why conversion writes them even
though, under the marker, the plain spelling would have meant the same thing.

One thing is lost: **comments in front of a declaration are dropped, JSDoc included.**
Conversion keeps comments inside function bodies and `/*test … */` blocks, but a `/** … */`
or `// …` comment above a function, class or constant does not reach the `.tjs` output.
Move the documentation you want to keep by hand before you retire the TypeScript. In a
`.tjs` file it can go in a `/# … #/` doc comment or a JSDoc block, both of which TJS reads
as docs.

You can run the original and watch it use all three behaviours. This is the TypeScript,
converted and run on this page:

```ts:inline
class Tally {
  count = 0
  add(n: number) {
    this.count += n
    return this
  }
}

function describe(kind: string, value: any): string {
  if (value == 0) return 'nothing'
  if (typeof value === 'object') return 'a record'
  switch (kind) {
    case 'count':
      return 'count ' + new Tally().add(value).count
    default:
      return `${kind} ${value}`
  }
}

function place(opts = { x: 0, y: 0 }) {
  return opts
}

console.log(describe('label', ''))
console.log(describe('label', null))
console.log(describe('count', 3))
console.log(JSON.stringify(place({ x: 5 })))
```

`''` is "nothing" because `'' == 0` in JavaScript, `null` is "a record" because
`typeof null` is `'object'`, and `place({ x: 5 })` returns just `{"x":5}` because a
JavaScript default is used only when the argument is missing.

<!-- TODO review -->

## The named escapes

Conversion writes these wherever the TypeScript relied on JavaScript behaviour that native
TJS fixes. Each is a function you can also write by hand in native TJS, at the one place you
need the old behaviour.

| Escape                        | Preserves JavaScript's | The plain spelling in native TJS means                          |
| ----------------------------- | ---------------------- | --------------------------------------------------------------- |
| `DangerousLegacyEquals(a, b)` | `a == b`               | `==` without coercion: `'' == 0` is `false`                     |
| `DangerousLegacyNot(a, b)`    | `a != b`               | `!=` without coercion: `'' != 0` is `true`                      |
| `LegacyTypeOf(x)`             | `typeof x`             | `typeof null` is `'null'`                                       |
| `LegacyDate(x)`               | `new Date(x)`          | `new Date` is not allowed                                       |
| `LegacyDefault({ … })`        | an object default      | a dictionary: members defaulted one by one, merged on a partial |

`DangerousLegacyNot` is the `!=` counterpart of `DangerousLegacyEquals`: it is `true`
exactly when `DangerousLegacyEquals` is `false`.

`===` and `!==` are left exactly as written, because they mean the same thing in native TJS
as in JavaScript. (`LegacyExactly(a, b)` and `LegacyNotExactly(a, b)` exist as hand-written
spellings of JavaScript's `===` and `!==`, but conversion never needs them.)

`LegacyDate` gives you a real, mutable `Date`. Where you want a date value that is not one,
TJS's replacement is `Timestamp`, which is not built into `.tjs` files the way the escapes
are: import it with `import { Timestamp } from 'tjs-lang'` (see the
[TJS language guide](/DOCS-TJS/)).

The names are long on purpose. They are meant to be noticed in review, and to be easy to
find: after graduation, `grep -n Legacy` over your source is the list of places where your
code depends on a JavaScript behaviour that TJS considers a mistake. Some of those
dependencies are deliberate; often they are bugs nobody had noticed, such as an empty string
counting as zero.

<!-- TODO review -->

## Step 2: graduate

Graduation turns a converted file into a native TJS file. It is the `graduate` function in
`tjs-lang/lang`:

```typescript
graduate(source: string): { code: string; notes: string[]; refused?: string }
```

`notes` has one string per `switch` it left alone, saying why; `refused` is set only when
the file could not graduate. There is no CLI command for it yet, so a short script does a
directory and everything under it:

```typescript
// graduate.ts: graduate every converted .tjs file under a directory, in place
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { graduate } from 'tjs-lang/lang'

const dir = process.argv[2]
const files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
for (const name of files.filter((f) => f.endsWith('.tjs'))) {
  const path = join(dir, name)
  const { code, refused, notes } = graduate(readFileSync(path, 'utf8'))
  if (refused) {
    console.log(`kept ${name}: ${refused}`)
    continue
  }
  writeFileSync(path, code)
  console.log(`graduated ${name}`, ...notes)
}
```

```bash
bun graduate.ts tjs/
tjs check tjs/
```

On a tree of four files, one of them with a `switch` whose first arm falls through into the
next and one that calls `eval`, it prints:

```text
graduated label.tjs
graduated fall.tjs line 5: an arm runs into the next one, which is a real cascade — `given` cannot express that, so this is left as `switch`. If the fallthrough was unintended, adding `break` makes it convertible.
kept sub/evil.tjs: `eval()` is not allowed in TJS. Use `Eval()` from the TJS runtime for sandboxed
graduated sub/math.tjs
```

`refused` carries only the first line of the compiler's message, which is why the `evil.tjs`
line stops mid-sentence; `tjs check` on that file shows the whole of it. `Eval()` is TJS's
replacement for `eval`: it runs code in a fuel-metered sandbox with only the values you pass
in (see [TJS for TypeScript Programmers](/TJS-FOR-TS/)). In the `fall.tjs` note,
"convertible" means "lets graduation turn it into `given`".

The script needs `readdirSync`'s `recursive` option (Node 20.1 or later, any current Bun).
Running it twice is harmless: a file that has already graduated has no marker, and
graduating it again leaves it unchanged. A file it kept still has its marker, so the
`tjs check` that follows reports it too.

Graduation does three things, in this order:

1. **Removes the `/* tjs <- … */` marker.** From here on, every TJS rule applies.
2. **Drops `new` on classes declared in the file.** A native TJS class is called like a
   function: `Tally()` builds exactly the object `new Tally()` would, so the keyword adds
   nothing, and `new` on a class declared in the same file is a compile error. The rule is
   that narrow. `new` on built-ins (`new Set()`, `new Map()`, `new Float32Array(4)`) and on
   classes imported from other modules is untouched; `new Date` is the one built-in that is
   refused (use `LegacyDate`). See [Classes](/TJS-SYNTAX/) in the syntax reference.
3. **Turns a `switch` into `given` where that provably means the same thing**, that is,
   where no arm falls through into the next. `given` is TJS's dispatch statement: arms
   never fall through, so there is no `break`, and each arm has its own scope (see
   [given](/given-dispatch/), and [the switch case study](/case-study-switch/) for why TJS
   prefers it). Where an arm does fall through, the `switch` is left alone and `notes` says
   why.

Then it compiles the result as native TJS. If that fails, because the file uses something
no spelling can preserve (`eval`, `new Function`, or a `Date` parameter; see the gotchas),
it refuses: `refused` names the problem and `code` is your input, unchanged. A converted
file that runs is better than a graduated one that does not.

The graduated example, run as native TJS:

```tjs:inline
class Tally {
  count = 0
  add(n: number) {
    this.count += n
    return this
  }
}

function describe(kind: string, value):! string {
  if (DangerousLegacyEquals(value, 0)) return 'nothing'
  if (LegacyTypeOf(value) === 'object') return 'a record'
  given kind {
    'count' {
      return 'count ' + Tally().add(value).count
    }
  } else {
    return `${kind} ${value}`
  }
}

function place(opts = LegacyDefault({ x: 0, y: 0 })) {
  return opts
}

console.log(describe('label', ''))
console.log(describe('label', null))
console.log(describe('count', 3))
console.log(JSON.stringify(place({ x: 5 })))
```

It prints the same four lines as the TypeScript (`nothing`, `a record`, `count 3`,
`{"x":5}`). That is the property graduation exists to keep.

### What graduation buys: checked parameters

Under the marker, `describe(5, 3)` runs and returns `'5 3'`, as it would in JavaScript. Once
the file is native, `kind: string` is checked on every call, and a wrong-typed argument
comes back as an error value instead of flowing on into the function:

```tjs:inline
function describe(kind: string, value):! string {
  return `${kind} ${value}`
}

console.log(describe('label', 3))
const wrong = describe(5, 3)
console.log(isMonadicError(wrong))
console.log(wrong.message)
```

This prints `label 3`, then `true`, then a message naming the parameter, of the form
`Expected string for '….describe.kind', got number`. The error is returned, not thrown, so
check for it with `isMonadicError`.

This is the one change graduation makes to how working code behaves. A call that
TypeScript's compiler accepted should still pass; the ones that fail are calls that reached
the function through `any`, a cast, or plain JavaScript, which are exactly the calls
TypeScript could not check.

<!-- TODO review -->

## Step 3: retire the escapes, one at a time

Now each escape is a decision. Replace it with the plain spelling where the JavaScript
behaviour was never intended, and keep it where it was. Here are all three replaced:

```tjs:inline
class Tally {
  count = 0
  add(n: number) {
    this.count += n
    return this
  }
}

function describe(kind: string, value):! string {
  if (value == 0) return 'nothing'
  if (typeof value === 'object') return 'a record'
  given kind {
    'count' {
      return 'count ' + Tally().add(value).count
    }
  } else {
    return `${kind} ${value}`
  }
}

function place(opts = { x: 0, y: 0 }) {
  return opts
}

console.log(describe('label', ''))
console.log(describe('label', null))
console.log(describe('count', 3))
console.log(JSON.stringify(place({ x: 5 })))
```

It prints:

```text
label
label null
count 3
{"x":5,"y":0}
```

Every changed line is a change you chose:

- `describe('label', '')` is no longer "nothing". An empty string is not zero.
- `describe('label', null)` is no longer "a record". `null` is not an object.
- `place({ x: 5 })` now returns `{ x: 5, y: 0 }`: an object default is a dictionary, so a
  caller who passes part of it gets the rest filled in.

If the old answer was the right one for some caller, put the escape back at that one
site. That is why TJS has named escapes rather than a file-wide "JavaScript semantics"
setting: a setting would also have hidden the next accidental `==`, while a named escape
covers exactly one expression. (`TjsCompat`, below, is such a setting; it exists for other
reasons and is not a migration strategy.)

<!-- TODO review -->

## `TjsStrict` and `TjsCompat`: the two directives

A `.ts` file can say `/* @tjs TjsStrict */`. The converter then writes a native TJS file
directly. Its output starts like this:

```text
TjsStrict

/* tjs <- strict.ts */

/* line 2 */
export function describe(kind: string, value):! string {
    if (value == 0)
```

The `TjsStrict` line overrides the conversion marker under it, so there are no named
escapes (`value == 0` stays as written and now means TJS's `==`), `private` fields become
real `#private` fields, and every parameter is checked. That is the quickest way to get
runtime validation for one file. The TypeScript examples in this book use it, because they
are small, new files with no existing behaviour to preserve.

It is not the same as graduation. `TjsStrict` gives every operator its TJS meaning
immediately, so a `==` that relied on coercion silently changes behaviour, and nothing marks
where. On code you know well, or new code, that is fine. On a codebase you are migrating,
convert and graduate instead, so that every behaviour change is one you can see.

One current limitation: a `TjsStrict` file that uses `new` on a class it declares fails to
convert. The converter prints ``converted, but the result is not valid TJS — `new P` is not
allowed in TJS``, calls it a converter bug, and does not write the `.tjs`. Drop the `new` in
the TypeScript, or convert without the directive and graduate.

`TjsCompat` is the opposite directive: it says "this file has JavaScript semantics". A `.ts`
file never needs it, because conversion already writes JavaScript semantics. Its one use in
a migration is a temporary workaround for the CLI, which ignores the conversion marker: with
`TjsCompat` on the first line of a converted `.tjs` file, `tjs check` and `tjs run` treat
the file as JavaScript, as it was converted. It must be a bare line, not a comment
(`/* TjsCompat */` and `/* @tjs TjsCompat */` do nothing):

```text
TjsCompat
/* tjs <- label.ts */
```

Remove it before graduating. `graduate` does not look for it: it drops `new` and rewrites
`switch` as if the file were native, and with `TjsCompat` still on top the result is either
refused with a confusing parse error (`Unexpected token`, at the `given` it has just
written) or, worse, "graduates" into code that throws
`Cannot call a class constructor … without |new|` when it runs.

<!-- TODO review -->

## Checking a conversion in CI

While the TypeScript is still the source of truth, a CI job can convert it and hold the
converted tree to the same tests:

```bash
tjs convert --emit-tjs src/ -o tjs/   # exits 1 if any file failed to convert
bun graduate.ts tjs/                  # the script above
tjs check tjs/                        # compile errors, signature examples, /*test*/ blocks
# then run your own test suite against the converted tree
```

`tjs check` is the step that fails the job on a broken test. It exits 1 on a compile error,
on a failing signature example (a return annotation run as a test, as described under
Step 1), or on a failing `/*test … */` block (see [Embedded Tests](/ts-embedded-tests/)).

`tjs convert` does not do that for you. With `--emit-tjs` it does not run the embedded tests
at all. When converting straight to JavaScript it runs them and prints the result, but **it
still writes the file and exits 0 when a test fails**. Its summary looks like this:

```text
src/m.ts: 0 passed, 1 failed
  ✗ 'doubles':8: Expected 5 but got 4
✓ src/m.ts -> dist/m.js
```

If your pipeline converts to JavaScript, gate on that line:

```bash
tjs convert src/ -o dist/ 2>&1 | tee convert.log
if grep -E ' [1-9][0-9]* failed' convert.log; then exit 1; fi
```

Then run your own test suite against the converted tree. The project's own compatibility
lane does the same thing at scale: it converts real TypeScript libraries and runs their own
test suites against the result. Under Bun, tests can import `.tjs` files directly once the
plugin is preloaded in `bunfig.toml`:

```toml
preload = ["tjs-lang/bun-plugin"]

[test]
preload = ["tjs-lang/bun-plugin"]
```

(Both entries are needed: one covers `bun run`, the other `bun test`. See
[Build, CI and Editors](/ts-build-and-tooling/).) Anywhere else, run the tests against the
JavaScript that `tjs convert src/ -o dist/` writes. Running `tjs check` over that
JavaScript proves nothing about the embedded tests: the emitted `.js` no longer contains
them.

<!-- TODO review -->

## The gotchas

- **The CLI ignores the conversion marker.** `tjs check` and `tjs run` treat a converted
  `.tjs` file as native TJS, so a file that uses `new` on its own classes fails with
  `` `new Tally` is not allowed in TJS ``. Graduate first, then check. `tjs(source)` from code
  does honour the marker.
- **Graduation changes boxed-primitive truthiness, and does not mark it.** In JavaScript
  `new Boolean(false)` is an object, so it is truthy; native TJS unwraps it first, so it is
  falsy. TJS offers no escape for this one, because it treats the JavaScript answer as having
  no legitimate use. If your code wraps primitives with `new Boolean`, `new Number` or
  `new String`, search for them before you graduate.
- **A `Date` parameter blocks graduation.** `d: Date` converts to the example
  `d: new Date()`. Conversion rewrites `new Date(x)` in code to `LegacyDate(x)`, but not in
  a parameter example, and `new Date` is not allowed in native TJS, so `graduate` refuses
  the whole file. Before graduating, give the parameter a `Type` that checks for a `Date`
  (below). Writing `d: LegacyDate(0)` also compiles, but it checks nothing: the parameter
  accepts any value.
- **`any` and `unknown` check nothing, and they leave no marker.** They become a bare,
  unannotated parameter. Other types the converter cannot check leave one of two marks:
  generics, utility types such as `Partial` and readonly arrays get a
  `/* TODO: TS types degraded — … */` comment above the function, while template-literal,
  intersection, conditional and mapped types become a declaration whose body is a
  `// TS: …` comment and which accepts any value. Search the output for both
  `TODO: TS types degraded` and `// TS:`, and diff against the `.ts` for `any`. The
  converter's warnings cover only some of these.
- **A TypeScript `enum` becomes an `Enum`, and it reads the way it did in TypeScript.**
  `Color.Red` is the member's value, and a numeric enum maps back from value to name
  (`Dir[1]` is `'Down'`). An `Enum` also has two things a TypeScript enum does not: a
  `.check(value)` predicate and a `.members` object.

A `Date` parameter with a real check looks like this:

```tjs:inline
Type AnyDate {
  description: 'a Date object'
  predicate(v) { return v instanceof Date }
}

function stamp(d: AnyDate) {
  return d.getTime()
}

console.log(stamp(LegacyDate(5)))
console.log(isMonadicError(stamp(5)))
```

It prints `5` and `true`: a `Date` passes, and a number comes back as an error.

This is what conversion writes for two enums, run as TJS:

```tjs:inline
Enum Color 'Color' {
  Red = 'red'
  Green = 'green'
}

Enum Dir 'Dir' {
  Up = 0
  Down = 1
}

console.log(Color.Red, Dir.Down, Dir[1])
console.log(Color.check('red'), Color.check('blue'))
console.log(JSON.stringify(Color.members))
```

It prints `red 1 Down`, then `true false`, then `{"Red":"red","Green":"green"}`. The quoted
`'Color'` after the name is the declaration's description; conversion uses the type's name.

<!-- TODO review -->

## Reference: what the converter does with each TypeScript construct

These are what `tjs convert --emit-tjs` writes today. The checks apply once the file has
graduated (or under `TjsStrict`). The declaration forms (`Type`, `Generic`, `Union`, `Enum`,
`FunctionPredicate`) are TJS types that exist at runtime; each is covered in
[Declarations](/declarations/) and in the [syntax reference](/TJS-SYNTAX/). The quoted string
after a declaration's name (`Union Mode 'Mode' …`) is its description.

What converts to a runtime check:

| TypeScript                                     | Converted TJS                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `string`, `number`, `boolean` parameters       | kept as type names (`n: number`)                                                      |
| a return type                                  | a type-only return, `:! number`; `Promise<T>` unwraps to `T`                          |
| `interface User { name: string; age: number }` | `Type User { example: { name: '', age: 0.0 } }`                                       |
| a generic interface (`Box<T>`)                 | a `Generic` with a predicate and a `declaration` block                                |
| `type Mode = 'a' \| 'b'`                       | `Union Mode 'Mode' 'a' \| 'b'`                                                        |
| `type Cb = (x: number) => void`                | a `FunctionPredicate` (checks that the value is a function)                           |
| `enum`                                         | an `Enum` (see the gotchas)                                                           |
| `T \| null`                                    | kept as `T \| null`: null is accepted, anything else checked                          |
| `b?: string`                                   | `b: string \| undefined`; callers may still omit it                                   |
| `...args: number[]`                            | `...args: [number]`, an array example: every item must be a number                    |
| `<T extends { id: number }>`                   | the constraint is the example: `items: [{ id: 0.0 }]`                                 |
| `Set`, `Map`                                   | the examples `new Set()`, `new Map()`                                                 |

`number` becomes `0.0`, a float, wherever it is written as an example, because TypeScript's
`number` admits non-integers (in TJS, `0` would mean an integer).

What converts with a loss:

| TypeScript                         | Converted TJS                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `Record<string, number>`, DOM types | `{}`: any object passes; the value types are not checked                           |
| `Date`                             | the example `new Date()`, which blocks graduation (see the gotchas)                 |
| `private x`                        | `x`: the field is public (it becomes `#x` under `TjsStrict`)                        |

What converts but checks nothing:

| TypeScript                                            | Converted TJS                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `any`, `unknown`                                      | a bare, unannotated parameter, with no marker                                    |
| an unconstrained `<T>`                                | unannotated, with a `TODO: TS types degraded` comment and a warning              |
| `Partial`, `Required`, `Pick`, `Omit`                 | unannotated, with a `TODO: TS types degraded` comment                            |
| `ReturnType`, `Parameters`                            | unannotated, with a `TODO: TS types degraded` comment                            |
| `readonly T[]`, `ReadonlyArray<T>`                    | unannotated, with a `TODO: TS types degraded` comment                            |
| an optional object-typed parameter (`r?: Record<…>`) | unannotated, with a warning suggesting a dictionary default                      |
| a nested generic argument (`Box<Box<number>>`)        | `x: Box`: the outer type is checked, its argument is not                         |
| template literal types (`` `${A}-x` ``)               | a `Type` whose body is a `// TS:` comment; it accepts any value                  |
| an intersection (`A & B`)                             | a `Type` whose body is a `// TS:` comment; it accepts any value                  |
| conditional and mapped types                          | a `Generic` whose predicate accepts anything, with a `// TS:` comment in its `declaration` block |
| `as const`                                            | dropped (use `const!` for compile-time immutability)                             |

The `// TS:` comments keep the original TypeScript for `.d.ts` output. `tjs emit --dts`
writes a declaration file next to the JavaScript, and for an exported declaration it copies
the kept TypeScript into it (`export type Both = { a: number } & { b: string }`), so a
library's TypeScript consumers still see the original types. At runtime, write a `Type` with
a predicate wherever one of these needs to be checked. `/* @tjs … */` annotations in the
`.ts` source (an `example:`, a `predicate`, a `declaration`) let you supply that before
conversion; [TJS for TypeScript Programmers](/TJS-FOR-TS/) lists them.
