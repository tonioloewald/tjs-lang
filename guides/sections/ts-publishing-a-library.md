<!--{"parent": "TJS-FOR-TS.md", "order": 4}-->
<!-- TODO review -->

# Publishing a TJS Library to TypeScript

The other chapters in this book go one way: TypeScript in, TJS out. This one goes the
other way. You have a module in TJS, and the people who will import it write TypeScript.
What do they see, and what do they have to do differently?

Two things, mostly:

1. They see a `.d.ts` file the toolchain generated from your source, so their editor
   autocompletes your functions and `tsc` checks their calls as usual.
2. A call can fail at runtime in a way the `.d.ts` does not mention. A **checked
   function** is any TJS function whose parameters are given as examples (`x: 0`,
   `name: ''`), unless it is marked unsafe with `!`; it checks every argument when it is
   called. Given a bad argument, it does not throw. It returns a `MonadicError`, a
   subclass of `Error`, as its result. Consumer code should check for one where data comes
   from outside: see [Handling a rejected call](#handling-a-rejected-call-from-typescript).

Which parts of this chapter apply depends on where your source lives:

- **Written in `.tjs`.** All of it.
- **Converted from `.ts` with `tjs convert`, and now maintained and published as `.tjs`.**
  All of it, plus [`@tjs` annotations](#types-with-no-runtime-meaning-tjs-annotations),
  which steer that conversion. [Converting a TypeScript
  Project](/ts-converting-a-project/) covers the conversion itself.
- **Still `.ts`, published as `.ts`.** None of it. `tsc --declaration` already gives
  TypeScript consumers your real types.

## Building: `tjs emit --dts`

```bash
tjs emit --dts src/ -o dist/
```

For each `.tjs` file under `src/` this writes three files to `dist/`, keeping the
directory layout:

- `name.js`: the JavaScript, with the runtime checks and a small inline runtime. It is
  an ES module and runs in Node, Bun or a browser with nothing else installed.
- `name.d.ts`: the TypeScript declarations.
- `name.md`: documentation generated from the source. `--no-docs` turns it off;
  `--docs-dir docs/` writes it somewhere else.

Things to know about it:

- `--dts` only works with `-o`. Emitting to stdout (`tjs emit --dts file.tjs > file.js`)
  silently writes just the JavaScript and exits 0.
- Relative imports of `./x.tjs` become `./x.js` in both the `.js` and the `.d.ts`, so the
  output loads with no `.tjs` loader.
- The tests run first: every `test` block, and every **signature example**, which is a
  function's parameter examples run against its return example (`add(a: 2, b: 3): 5` is a
  test that `add(2, 3)` returns `5`). If one fails, that file is not written and the
  command exits 1. `--jfdi` ("just do it") writes the file anyway. Do not use it for a
  build you publish: the failure is telling you the code and its examples disagree.
- A return example that calls a function **imported from another module** cannot run
  during `emit`, so the file fails with `✗ Signature: one is not defined`, although
  `tjs check` passes the same file. Until that is fixed, give such a function a type-only
  return (`:!`, below).
- The `tjs` command is a Bun script, so the machine that builds needs Bun. The output does
  not.

From a build script, the same declarations come from `generateDTS` in `tjs-lang/lang`:

```typescript
import { readFileSync } from 'node:fs'
import { tjs, generateDTS } from 'tjs-lang/lang'

const source = readFileSync('src/geometry.tjs', 'utf8')
const result = tjs(source, { filename: 'geometry.tjs' })
const js = result.code
const dts = generateDTS(result, source)
```

<!-- TODO review -->

## A module and its declarations

Here is a small TJS module with one of each common declaration. The comments say what
each one is; [TJS Syntax](../../TJS-SYNTAX.md) introduces `Type`, `Enum`, `Generic` and
`FunctionPredicate` properly.

```tjs
// A Type: a named runtime check, here built from an example value.
export Type Point {
  description: 'a point on the plane'
  example: { x: 0.0, y: 0.0 }
}

// An Enum: the string after the name is its description.
export Enum Direction 'compass direction' {
  North = 'N'
  South = 'S'
}

// A FunctionPredicate: a function signature, written as examples.
export FunctionPredicate Format {
  params: { value: 0.0, digits: 0 }
  returns: ''
}

// A Generic: T arrives in the predicate as a check function, so T(x.value)
// asks "is x.value a T?". The declaration block is what TypeScript sees.
export Generic Tagged<T> {
  description: 'a value with a label'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
  declaration {
    value: T
    label: string
  }
}

// :! declares the return type without a tested value.
export function distance(a: Point, b: Point):! 0.0 {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// A plain : return example is a test: scale({ x: 3, y: 4 }) must give { x: 6, y: 8 }.
export function scale(p: { x: 3.0, y: 4.0 }, by = 2.0): { x: 6.0, y: 8.0 } {
  return { x: p.x * by, y: p.y * by }
}

// A dictionary default: pass any subset of opts; missing members are filled in.
export function label(p: { x: 1.0, y: 2.0 }, opts = { digits: 1, unit: 'px' }): '1.0px, 2.0px' {
  return `${p.x.toFixed(opts.digits)}${opts.unit}, ${p.y.toFixed(opts.digits)}${opts.unit}`
}

export class Counter {
  #n = 0
  constructor(start: 0) {
    this.#n = start
  }
  increment(): 1 {
    this.#n += 1
    return this.#n
  }
}
```

And here is the `geometry.d.ts` that `tjs emit --dts` writes for it, unedited:

```typescript
export declare function distance(a: Point, b: Point): number;
export declare function scale(p: { x: number; y: number }, by?: number): { x: number; y: number };
export declare function label(p: { x: number; y: number }, opts?: { digits?: number; unit?: string }): string;
export declare function Counter(start: number): any;
export declare class Counter {
  constructor(start: number);
  increment(): number;
}
export type Point = { x: number; y: number };
export declare const Point: { check(value: any): boolean; default: { x: number; y: number }; (value: any): boolean; };
export type Direction = "N" | "S";
export declare const Direction: { check(value: any): boolean; values: Direction[]; members: Record<string, Direction>; names: Record<string, string>; keys: string[]; };
export interface Tagged<T> {
  value: T
  label: string
}
export type Format = (value: number, digits: number) => string;
```

This file compiles under `tsc --strict` (checked with TypeScript 5.8), together with a
consumer that calls `new Counter(3)`, `distance` and `label`. The `function Counter` and
`class Counter` pair is legal: TypeScript merges a function declaration with an ambient
class of the same name.

Two details in the source matter for the output. `distance` uses `:!`, a type-only return
example. Its parameters are declared Types, so the signature has no literal arguments to
call it with: a plain `: 0.0` would be skipped as untestable, and `:!` says so outright.
`scale` uses a plain `:`, so `scale({ x: 3, y: 4 })` must return `{ x: 6, y: 8 }` or the
build fails. Both become `number` in the declaration either way: the `.d.ts` keeps the
type of an example, never its value.

The descriptions (`'a point on the plane'`, `'compass direction'`) are kept at runtime, as
`Point.description` and `Direction.description`, but they do not reach the `.d.ts` as
JSDoc, nor the generated `.md`. That is a gap, listed at the end.

<!-- TODO review -->

## What each construct becomes

| TJS                                  | In the `.d.ts`                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `function f(a: 0, b: '')`            | `declare function f(a: number, b: string)`. A parameter with a default is optional (`by?: number`). With no return example, the declared return type is `any`; `:! 0` gives `number` without a tested value. |
| Object example `{ x: 0.0 }`          | An object type, `{ x: number }`.                                                                                                       |
| Dictionary default `opts = { digits: 1 }` | The parameter and every member are optional (`opts?: { digits?: number }`), at every depth, because a caller may pass any subset.  |
| Literal union in a parameter         | The same union: `m: 'on' \| 'off'` stays `"on" \| "off"`.                                                                              |
| `Type Point`                         | A type alias **and** a value of the same name, so `Point` works as a type and `Point.check(x)` compiles.                               |
| `Enum Direction`                     | The union of its member values (`"N" \| "S"`), plus a value with `check`, `values`, `members`, `names` and `keys`.                     |
| `Generic X<T>` with `declaration {}` | `interface X<T> { … }` with the block's contents, or `type X<T> = …` for the `// TS:` form (next section).                             |
| `Generic X<T>` without one           | `declare function X(...args: any[]): { check(value: any): boolean; (value: any): boolean; }`: a checker factory, with nothing about `T`. |
| `FunctionPredicate F`                | A function type, `type F = (value: number, digits: number) => string`. Used as a parameter type, it becomes `any` (a gap).             |
| `Union U 'u' 'a' \| 'b'`             | Nothing: `U` is missing, so a function that takes a `U` fails to compile (a gap).                                                      |
| `Union U 'u' { 'a' \| 'b' }`         | `type U = string`, not the literal union (a gap).                                                                                      |
| `class C`                            | Two declarations: a callable `C(...)` that returns `any`, and a `declare class C` with the constructor and methods.                   |
| `./other.tjs` import or re-export    | The same statement naming `./other.js`.                                                                                                |

A single literal in an example position widens to its type: `m: 'on'` means "a string,
for example `'on'`". A union of literals does not widen. `'on' | 'off'` reads as an
enumeration of the allowed values, so it is checked and declared exactly.

If a file has no `export` at all, every top-level declaration is exported in the `.d.ts`.

The class row needs a word. TJS drops JavaScript's requirement that a class be
constructed with `new`: `Counter(3)` builds the same instance as `new Counter(3)`. The
callable declaration records that, but returns `any`, which is a known gap. From
TypeScript, write `new Counter(3)`: that form is fully typed.

## Generics: the `declaration` block

A `Generic`'s predicate is code, and the emitter cannot turn code into a TypeScript type.
Without help, `Generic Box<T>` is declared as the checker factory in the table above, and
a TypeScript consumer learns nothing about what is inside a `Box<T>`.

A `declaration` block supplies the TypeScript-visible shape. It has no effect at runtime;
its contents are TypeScript, copied into the `.d.ts`. The `Tagged<T>` example above uses
the interface form: each line is a member, and the output is `interface Tagged<T> { … }`.

For a type an interface cannot express, start the block with `// TS:` and the rest is
emitted as a type alias. This is the reactive-proxy case, where every property of a wrapped
value is itself wrapped:

```tjs
export Generic Watched<T> {
  description: 'a watched value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'path' in x
  }
  declaration {
    // TS: { [K in keyof T]: Watched<T[K]> } & { path: string; observe(cb: (path: string) => void): void }
  }
}
```

which becomes

```typescript
export type Watched<T> = { [K in keyof T]: Watched<T[K]> } & { path: string; observe(cb: (path: string) => void): void };
```

The predicate here never calls `T`. It checks only the outer shape, that the value is a
watched proxy, and leaves the wrapped value unchecked on purpose: checking it would mean
walking the whole proxied object on every call. The declaration still carries `T`, so a
consumer gets the full type:

```typescript
declare const app: Watched<{ user: { name: string } }>
app.user.name.path // autocompletes, and is a string
```

What you cannot yet do is declare a TJS **function** generic over `T`. A function returning
a `Watched<T>` for whatever it was given, `watch<T>(value: T): Watched<T>` in TypeScript,
has no TJS spelling. The closest is an empty object example, `watch(value: {}): {}`, and an
empty object example is declared as `Record<string, any>`, so the declaration comes out as
`(value: Record<string, any>) => Record<string, any>`.

For such a function, write its declaration by hand and put it over the generated one after
the build. `tjs emit` overwrites `dist/watch.d.ts` every time, so keep the hand-written
file outside `dist/`, for example `types/watch.d.ts`, and copy it in as the last build step:

```json
{
  "scripts": {
    "build": "tjs emit --dts src/ -o dist/ && cp types/watch.d.ts dist/watch.d.ts"
  }
}
```

Put the generic function in a module of its own, so that file replaces nothing else.

<!-- TODO review -->

## The declarations are wider than the contract

TypeScript has one `number`. TJS tells integers from floats, and non-negative integers
from both, because the example says which one you meant: `3` is an integer, `3.0` is a
float, and `+3` is a non-negative integer. The `.d.ts` can only say `number`, so a call
that `tsc` accepts can still be refused when it runs:

```tjs:inline
function repeat(text: 'ab', times: +3): 'ababab' {
  return text.repeat(times)
}

console.log(repeat('xy', 2))          // xyxy
console.log(repeat('xy', 2.5).message) // Expected non-negative-integer for '…repeat.times', got number
console.log(repeat('xy', -1).message)  // the same message
```

The declaration for `repeat` is `(text: string, times: number): string`. `2.5` and `-1`
both type-check, and both come back as errors, because `+3` asks for a non-negative
integer.

The same holds for a `Type` with a `predicate`, for an `Enum` given a string that is not a
member, and for any value whose shape is wrong at runtime because it came from
`JSON.parse` or a cast, where `tsc` believed the static type. The `.d.ts` is what
TypeScript can check. The runtime check is the contract, with one exception: a parameter
typed as a `FunctionPredicate` is not checked at runtime at all (`tjs check` warns about
it), and its declaration is `any`. See [Current gaps](#current-gaps).

## Handling a rejected call from TypeScript

A checked TJS function does not throw on a bad argument. It returns a `MonadicError`, a
subclass of `Error` carrying where the check failed (`path`), what it wanted
(`expected`), and what it got (`actual`). `path` starts with the file and line of the
function, then the function and parameter: `geometry.tjs:33:distance.b`.

The declared return type does not include the error. `distance` is declared as returning
`number`, and on bad input it returns a `MonadicError`. Declaring `number | MonadicError`
would be honest, but it would make the compiler demand a check after every call, including
the calls inside a chain of TJS functions where an error is passed along without harm
(below). The emitter has no option to declare the union today.

A TypeScript consumer checks with `isMonadicError` from `tjs-lang/runtime`, which is a
type guard:

```typescript
import { isMonadicError } from 'tjs-lang/runtime'
import { distance, type Point } from 'geometry'

export function report(from: Point, to: Point): string {
  const d = distance(from, to)
  if (isMonadicError(d)) {
    // e.g. "rejected geometry.tjs:33:distance.b: expected Point, got object"
    return `rejected ${d.path}: expected ${d.expected}, got ${d.actual}`
  }
  return d.toFixed(1) // d is a number here
}
```

Use `isMonadicError` rather than `instanceof`. It checks the error's shape
(`e instanceof Error && e.name === 'MonadicError' && 'path' in e`), so it recognizes an
error from any TJS module. `instanceof MonadicError` also works across TJS modules in one
program, because they share one class through a global (see Packaging), but not across a
realm boundary such as an iframe or a worker, which has its own globals. If you would
rather not depend on `tjs-lang` for one function, write the shape test out as above.

You do not need a check after every TJS call. An error passed into another checked TJS
function comes straight back out unchanged, so a chain of TJS calls can be checked once,
at the end. That holds only between TJS functions. Your own TypeScript code in between
sees the error typed as the success type: `distance(a, b) * 2` compiles, and gives `NaN`
when `distance` returned an error. Check before TypeScript code uses the value, and check
where data enters your program: a parsed response, a form, a message from a worker.

Here is the whole exchange in one file you can run. To run both sides in one box, this
example writes the library half in TypeScript and converts it with the `TjsStrict`
annotation, which makes converted TypeScript check its parameters the way a TJS module
does. In a real project the library half is a `.tjs` file, and the consumer needs no
annotation. On this page `isMonadicError` is supplied for you; in your project it is the
import above.

```ts:inline
/* @tjs TjsStrict */

// Library side: a function whose parameters are checked at runtime.
export function area(width: number, height: number): number {
  return width * height
}

// Consumer side: the cast tells the compiler what it wants to hear.
const rows = JSON.parse('[[2, 3], [2, "three"]]') as [number, number][]

for (const [width, height] of rows) {
  const result = area(width, height)
  if (isMonadicError(result)) {
    console.log(`rejected ${result.path}: expected ${result.expected}, got ${result.actual}`)
  } else {
    console.log(`area ${result}`)
  }
}
```

It prints:

```text
area 6
rejected <source>:4:area.height: expected number, got string
```

The cast compiled because the compiler cannot see JSON.

<!-- TODO review -->

## Types with no runtime meaning: `@tjs` annotations

This section is for a library that started as TypeScript and was converted with
`tjs convert`. The converter carries the TypeScript types across, and some of them have no
runtime check in TJS today: conditional types and mapped types, which compute a type from
another type, and intersections (`A & B`), which TJS does not check yet. The converter
keeps those as a `Generic` (or, for a non-generic type such as an intersection, a `Type`)
whose body holds the original TypeScript in a `// TS:` comment, so they reach the `.d.ts`
unchanged.

Where the default is not what you want, a `/* @tjs … */` comment in the `.ts` file steers
the conversion of the declaration right after it. The TypeScript compiler ignores it. The
grammar is `@tjs` followed by a keyword and that keyword's argument: a value after
`example:`, a block after `declaration` or `predicate(x, T)`. `@tjs-skip` is the one
exception, a single word with nothing after it.

```typescript
/* @tjs-skip */
type Unboxed<T> = T extends { value: infer U } ? U : T

/* @tjs example: { name: 'Alice', age: 30 } */
export interface User {
  name: string
  age: number
}

/* @tjs declaration { value: T; path: string } */
export interface Boxed<T> {
  value: T
}

/* @tjs predicate(x, T) { return typeof x === 'object' && T(x.value) } */
export interface Box<T> {
  value: T
}
```

- `@tjs-skip` drops the next declaration from the conversion entirely. It is then absent
  from the TJS **and** from the `.d.ts`. A conditional type like `Unboxed<T>` converts and
  round-trips without it; skip one when it is a compile-time helper used only inside the
  file and you want no runtime value for it. Nothing outside the file can name it
  afterwards.
- `@tjs example:` replaces the example the converter would infer. Here it also tightens the
  runtime check: `age: 30` is an integer, so `User.check({ name: 'a', age: 30.5 })` is
  false, though TypeScript's `age: number` would allow it. The declared type stays
  `{ name: string; age: number }`.
- `@tjs declaration { … }` replaces the generated interface body. Use it when the runtime
  value has members the TypeScript interface does not list. If the library's `box()`
  attaches a `path` to every box it returns, the annotation above declares `Boxed<T>` with
  `value: T; path: string`, so consumers can read `b.path`.
- `@tjs predicate(x, T) { … }` supplies the runtime check for a generic interface: here,
  that a `Box<T>` is an object whose `value` is a `T`.

The full list of `@tjs` annotations is in [TJS for TypeScript
Programmers](../../TJS-FOR-TS.md).

<!-- TODO review -->

## Packaging

A TJS library ships the emitted `dist/`, not the `.tjs` source, and points `exports` at it
with the `types` condition first. The package entry is `src/index.tjs`, a module that
re-exports the others (`export * from './geometry.tjs'`), so it is emitted as
`dist/index.js` and `dist/index.d.ts`:

```json
{
  "name": "geometry",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tjs emit --dts src/ -o dist/"
  },
  "devDependencies": {
    "tjs-lang": "…"
  }
}
```

The `build` script runs `tjs`, which needs Bun on the build machine, as noted above. In
`devDependencies`, pin the `tjs-lang` version you built and tested with.

`tjs-lang` is a **dev** dependency. Each emitted file carries the part of the runtime it
uses, so your consumers install nothing extra to run your code. They add `tjs-lang`
themselves only if they want `isMonadicError` from `tjs-lang/runtime`.

Several TJS modules in one program still agree with each other: they share one
`MonadicError` class through a global, so `instanceof` works across module boundaries and
across copies of your package within one realm. (The design is in [Runtime
Fusion](../../docs/runtime-fusion.md).)

Before you publish:

- The output is ES modules only. There is no CommonJS build; a CommonJS consumer loads
  the package with `import()`.
- No source maps are written. A stack trace points into `dist/*.js`.
- Run `tsc --noEmit --strict` over `dist/*.d.ts` with a small consumer file that imports
  your entry point. The emitter does not check that its output compiles, and the gaps
  below include cases where it does not.

## One runtime per bundle

This section is for applications, not for a published library. Do not use it for
`dist/` files you put on npm; the reason is at the end.

Each emitted file carries its own copy of the inline runtime, the **prelude**: the small
set of helpers the checks call. An application that bundles many TJS modules therefore
parses that code once per module. When you build the bundle yourself with Bun,
`tjsPlugin({ sharedPrelude: true })` makes every module import a single copy from
`tjs-lang/prelude` instead:

```typescript
import { tjsPlugin } from 'tjs-lang/bun-build-plugin'

await Bun.build({
  entrypoints: ['src/index.tjs'],
  outdir: 'dist',
  plugins: [tjsPlugin({ sharedPrelude: true })],
})
```

The programmatic spelling is `tjs(source, { prelude: 'import' })`. The shared copy is the
full runtime, so it pays off only with many modules; for a handful, the default output is
smaller.

Why not for a library: a module emitted this way imports `tjs-lang/prelude` and refuses to
load against any prelude whose code differs from the one it was compiled against. The
check is a content hash of the prelude, and the prelude can change in any `tjs-lang`
release, a patch included. A package that published such files would break for any
consumer whose installed `tjs-lang` shipped a different prelude. Publish the default,
self-contained output. See the [module system notes](../../DOCS-TJS.md#module-system) for
more.

<!-- TODO review -->

## Current gaps

The emitter is newer than the rest of the toolchain, and these are known not to work yet.
Each is a defect, not a design decision.

- **An inline `Union` is not declared.** `export Union Unit 'unit' 'px' | 'em'` produces no
  `Unit` in the `.d.ts`, so a function that takes a `Unit` makes the declaration file fail
  to compile. The block form, `Union Size 'size' { 'sm' | 'lg' }`, is declared, but as
  `string` rather than `"sm" | "lg"`. Until this is fixed, use an `Enum`, or write the
  literal union in the parameter (`unit: 'px' | 'em'`), which is declared exactly.
- **Enum members are not declared as properties.** `Direction.North` works at runtime, but
  the `.d.ts` declares only `members`, `values` and friends, so TypeScript rejects it.
  Write `'N'`, or `Direction.members.North`.
- **A `Generic` with a `declaration` block is declared only as a type.** The runtime
  factory (`Tagged(isNumber)`) is not declared as a value, so calling it from TypeScript
  does not compile.
- **A class called without `new` is declared as returning `any`.** Use `new` from
  TypeScript.
- **A `FunctionPredicate` used as a parameter type is declared `any`.** It is also not
  checked at runtime; `tjs check` warns about this.
- **Descriptions do not reach the `.d.ts`.** A `Type`'s or `Enum`'s description is
  available at runtime but is not emitted as JSDoc, so editor hovers do not show it.
- **A return example that calls an import fails `tjs emit`**, though `tjs check` passes it.
  Use `:!` on such a function.
