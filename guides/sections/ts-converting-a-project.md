<!--{"parent": "TJS-FOR-TS.md", "order": 2}-->

# Converting a TypeScript Project

<!-- TODO review -->

Moving a codebase from TypeScript to TJS happens in two steps, and keeping them apart is
the point:

1. **Convert.** `tjs convert` turns each `.ts` file into TJS that behaves exactly as the
   TypeScript compiler's output would. Nothing about what the program does changes.
2. **Graduate.** Remove the conversion marker, and the file becomes native TJS: honest
   `==`, `typeof null` is `'null'`, classes are called without `new`, parameters are
   checked. Graduation is written so that this step does not change behaviour either.

Behaviour changes happen afterwards, one site at a time, when you decide to make them. You
never have to trust a tool to have changed a thousand files correctly at once.

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

(Inside this repository the CLI is `bun src/cli/tjs.ts`. From code, it is
`fromTS(source, { emitTJS: true })` from `tjs-lang/lang/from-ts`.)

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

This is what `tjs convert --emit-tjs` writes for it:

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

Three things to read in it:

- **The first line, `/* tjs <- label.ts */`, is not decoration.** Its presence means
  _this file has JavaScript semantics_. While it is there, `==` coerces, `typeof null` is
  `'object'`, `new` is required and parameters are not checked, exactly as under `tsc`.
- **The types became runtime-shaped.** `kind: string` is a type TJS checks (once the file
  is native); `value: any` became an unannotated parameter, because `any` checks nothing;
  the return type became `:! string`, a type-only return that documents without running a
  test.
- **Every JavaScript reliance now has a name.** `value == 0` became
  `DangerousLegacyEquals(value, 0)`, `typeof value` became `LegacyTypeOf(value)`, and the
  object default became `LegacyDefault({ x: 0, y: 0 })`. Each of these means, in every
  dialect, exactly what the original meant in JavaScript.

That last point is what makes graduation safe, and it is why conversion writes them even
though, under the marker, the plain spelling would have meant the same thing.

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

`''` is "nothing" because `'' == 0` in JavaScript, and `null` is "a record" because
`typeof null` is `'object'`.

<!-- TODO review -->

## The named escapes

Conversion writes these wherever the TypeScript relied on JavaScript behaviour that native
TJS fixes. Each is a function you can also write by hand in native TJS, at the one place you
need the old behaviour.

| Conversion writes             | for                    | which in native TJS would mean                                  |
| ----------------------------- | ---------------------- | --------------------------------------------------------------- |
| `DangerousLegacyEquals(a, b)` | `a == b`               | `==` without coercion: `'' == 0` is `false`                     |
| `LegacyTypeOf(x)`             | `typeof x`             | `typeof null` is `'null'`                                       |
| `LegacyDate(x)`               | `new Date(x)`          | `new Date` is not allowed; `Timestamp` replaces it              |
| `LegacyDefault({ … })`        | an object default      | a dictionary: members defaulted one by one, merged on a partial |

The names are long on purpose. They are meant to be noticed in review, and to be easy to
find: after graduation, `grep -n Legacy` over your source is the list of places where your
code depends on a JavaScript behaviour that TJS considers a mistake. Some of those
dependencies are deliberate. Most are bugs nobody had found yet.

<!-- TODO review -->

## Step 2: graduate

Graduation turns a converted file into a native TJS file. It is the `graduate` function in
`tjs-lang/lang`; there is no CLI command for it yet, so a short script does a directory:

```typescript
// graduate.ts: graduate every converted .tjs file in a directory, in place
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { graduate } from 'tjs-lang/lang'

const dir = process.argv[2]
for (const name of readdirSync(dir).filter((f) => f.endsWith('.tjs'))) {
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

Graduation does three things, in this order:

1. **Removes the `/* tjs <- … */` marker.** From here on, every TJS rule applies.
2. **Drops `new` on classes declared in the file.** A native TJS class is called, and
   `new` on one is a compile error.
3. **Turns a `switch` into `given` where that provably means the same thing**, that is,
   where no arm falls through into the next. Where an arm does fall through, the `switch`
   is left alone and `notes` says why.

Then it compiles the result as native TJS. If that fails, because the file uses something
no spelling can preserve (`eval`, `new Function`), it refuses: `refused` names the problem
and `code` is your input, unchanged. A converted file that runs is better than a graduated
one that does not.

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

The same four lines as the TypeScript. That is the property graduation exists to keep.

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

Every changed line is a change you chose:

- `describe('label', '')` is no longer "nothing". An empty string is not zero.
- `describe('label', null)` is no longer "a record". `null` is not an object.
- `place({ x: 5 })` now returns `{ x: 5, y: 0 }`: an object default is a dictionary, so a
  caller who passes part of it gets the rest filled in.

If the old answer was the right one for some caller, put the escape back at that one
site. That is the difference between this and a mode switch: a file-wide "JavaScript
semantics" setting would also have hidden the next accidental `==`, while a named escape
covers exactly one expression.

<!-- TODO review -->

## `TjsStrict`: converting and graduating at once

A `.ts` file can say `/* @tjs TjsStrict */`. The converter then writes a native TJS file
directly: no marker, no named escapes, `private` fields as real `#private` fields, and
every parameter checked. That is the quickest way to get runtime validation for one file,
and it is what most of the examples in this book use.

It is not the same as graduation. `TjsStrict` gives every operator its TJS meaning
immediately, so a `==` that relied on coercion silently changes behaviour, and nothing marks
where. On code you know well, or new code, that is fine. On a codebase you are migrating,
convert and graduate instead, so that every behaviour change is one you can see.

<!-- TODO review -->

## The gotchas

- **Keep the TypeScript as the source of truth until the converted tree passes.** Convert
  into a separate directory (`-o tjs/`), and switch over once it checks and your tests
  pass against it.
- **Converted files fail `tjs check` until graduated** if they use `new` on their own
  classes. The CLI treats any `.tjs` file as native TJS, while the conversion marker says
  JavaScript semantics. Graduate first, then check.
- **`any` checks nothing, and unconstrained generics become `any`.** Search the converted
  output for `TODO: TS types degraded` comments: each one marks a parameter the converter
  could not turn into a runtime check. Give it an example (`x: 0`), a type name
  (`x: number`) or a `Type` with a predicate.
- **A TypeScript `enum` becomes an `Enum`, whose members are under `.members`.** In TJS,
  `Color.members.Red` is `'red'` and `Color.check('red')` is `true`. Code that reads
  `Color.Red` gets `undefined` after conversion, so review every enum member access.
- **Run your tests on the converted tree.** Conversion is meant to preserve behaviour, and
  the project's own compatibility lane holds it to that by converting real TypeScript
  libraries and running their own test suites against the result. Your test suite is the
  same check for your code.
