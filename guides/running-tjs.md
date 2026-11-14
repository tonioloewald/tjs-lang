<!--{"parent": "tjs-patterns.md", "order": 1}-->
<!-- TODO review -->

# Running TJS: Files, the CLI and Bundlers

The examples in this book run in the page. A real program lives in files, and this chapter
is about where those files run: on the command line with the `tjs` CLI, directly under Bun,
as plain `.js` after a build step, in a browser, and from your own code.

This chapter is for readers who already build JavaScript projects: it assumes a terminal, a
package manager, ES modules and a bundler. If you are learning to program with
[Learn to Program](/learn-to-program/), you can skip it; everything there runs in the page.

The short version: TJS compiles to ordinary JavaScript. Every route below ends with a `.js`
module that any JavaScript engine can load; the routes differ only in when and where that
compilation happens.

## The file extension decides the language

TJS has no mode switches at the top of a file. The extension says which language a file is
written in:

| Extension               | Treated as  | What changes                                                  |
| ----------------------- | ----------- | ------------------------------------------------------------- |
| `.tjs`                  | native TJS  | every TJS rule applies (see below)                            |
| `.js`, `.mjs`, `.cjs`   | JavaScript  | nothing: JavaScript semantics are preserved exactly           |
| `.ts`, `.mts`, `.cts`   | TypeScript  | converted to TJS first with `fromTS` (see `tjs convert` below) |

So the same line can mean two things. This file, saved once as `plain.js` and once as
`plain.tjs`:

```javascript
console.log('5' == 5, typeof null)
```

prints `true object` from `tjs run plain.js` and `false null` from `tjs run plain.tjs`. In a
`.tjs` file `==` never converts types, so a string is never equal to a number, and
`typeof null` is `'null'` rather than JavaScript's historical `'object'`.
[JS Footgun Fixes](/js-footgun-fixes/) lists the rest, and
[TJS for JavaScript Programmers](/tjs-for-js/) covers the other rules: a parameter's colon
value is an example that sets its type, and a function's return example is a test.

That is what lets you drop existing JavaScript into a TJS project and change it one file at
a time: renaming a file to `.tjs` is the opt-in.

## Installing

```bash
bun add -d tjs-lang
bunx tjs --version
```

The package carries the CLI (`tjs`), the transpiler, the runtime and the Bun plugins. The CLI
is a Bun program, so you need [Bun](https://bun.sh) installed to run it, even in a project
whose output runs on Node.

A dev install does not put `tjs` on your PATH. Run it as `bunx tjs …`, or from a
`package.json` script; the commands below write just `tjs`.

## The example project

The rest of the chapter uses one small project: a module of arithmetic and a program that
uses it.

```text
my-project/
  package.json
  bunfig.toml
  src/
    mymath.tjs
    main.tjs
```

`src/mymath.tjs` has no imports, so it runs on this page too:

```tjs
export function add(a: 0, b: 0): 0 {
  return a + b
}

export function multiply(a: 0, b: 0): 0 {
  return a * b
}

test 'add and multiply' {
  expect(add(2, 3)).toBe(5)
  expect(multiply(2, 3)).toBe(6)
}
```

`a: 0` says `a` is an integer, because the example `0` is one (`0.0` would allow any number).
The return example `: 0` is tested: TJS calls `add(0, 0)` and checks the answer is `0`.

`src/main.tjs` imports it, so it can only run beside it. A TJS function that refuses an
argument does not throw: it returns an error value, a `MonadicError`, which has a `.message`
(see [Error Handling](/error-handling/)). The last line prints one:

```tjs:static
import { add, multiply } from './mymath.tjs'

function calculate(x: 0, y: 0): 0 {
  return multiply(add(x, y), 2)
}

console.log('calculate(3, 4) =', calculate(3, 4))
console.log(add(1.5, 2).message)
```

`package.json` sets `"type": "module"`. The emitted files are ES modules, and without it Node
still runs them but first warns and reparses each one. Bun does not need it:

```json
{ "name": "my-project", "type": "module" }
```

`bunfig.toml` tells Bun how to load `.tjs` files:

```toml
preload = ["tjs-lang/bun-plugin"]

[test]
preload = ["tjs-lang/bun-plugin"]
```

The first `preload` covers `bun` and `tjs run`; `tjs run` needs it only when a file imports
other `.tjs` files. The `[test]` one covers `bun test`, which reads only its own section.

## The `tjs` CLI

Six commands. Each takes a file; `check`, `emit`, `test` and `convert` also take a directory.

```bash
tjs check src/            # compile, run examples and tests, report problems
tjs run src/main.tjs      # compile and execute
tjs test src/mymath.tjs   # run a file's test blocks and signature examples
tjs emit src/ -o dist/    # write .js (and docs, and .d.ts with --dts)
tjs types src/mymath.tjs  # print the signatures as JSON
tjs convert src/ -o tjs/ --emit-tjs   # TypeScript to TJS
```

### `tjs check`: run it before you commit or ship

`tjs check` is the command that tells you whether the code is right: it exits with status 1
when anything is wrong, so it belongs in CI and before a commit. It compiles each file, runs
its signature examples and `test` blocks, and on success prints the signatures it found:

```text
$ tjs check src/mymath.tjs
✓ src/mymath.tjs
  add(a: integer, b: integer) -> integer
  multiply(a: integer, b: integer) -> integer
```

Over a directory it checks every `.tjs`, `.js`, `.mjs` and `.cjs` file (not `.ts`), prints one
line per file, and stays quiet about signatures unless you add `--verbose`.

A signature example is a test. TJS calls each function with its parameter examples and checks
that the result equals the return example. Here `add(2, 3)` is 5, not 0:

```tjs:static
// broken.tjs
function add(a: 2, b: 3): 0 {
  return a + b
}

console.log(add(2, 3))
```

```text
$ tjs check broken.tjs
5
✗ broken.tjs
  Transpile-time test failures:
  Function signature example is inconsistent:
    Expected 0 at 'add', got 5
```

and it exits with status 1. The `5` at the top is the file's own `console.log`: running the
tests means running the module, so top-level code executes during a check.

Exit status is 0 when every file compiles and nothing fails, and 1 when a file does not
compile, an example or test fails, or the warnings exceed `--max-warnings`.

Warnings are advice that does not fail a check by itself. For example, a `switch` in a `.tjs`
file gets a warning suggesting `given`, TJS's replacement for `switch` (see
[the switch case study](/case-study-switch/)). `--max-warnings N` makes more than N warnings
fatal for the whole run, the same shape as ESLint's flag, so a project can start at its
current count and ratchet down:

```bash
tjs check src/ --max-warnings 0
```

A missing or non-numeric value (`--max-warnings` alone) is a usage error: it exits with
status 2, so a typo cannot pass for a lint failure.

### `tjs run`: executes, does not test

`tjs run` compiles a file and runs it as an ES module, with the full runtime installed.

```text
$ tjs run broken.tjs
5
```

and it exits 0. **`run` does not run signature examples or `test` blocks**, so it says nothing
about whether a file is correct: the broken `add` above runs happily. Check first, then run:

```bash
tjs check broken.tjs && tjs run broken.tjs
```

### `tjs test`: test blocks in one file

Given a `.tjs` file, `tjs test` runs that file's `test` blocks and signature examples and
lists each result, where `check` prints only failures. The number after each name is its
line:

```text
$ tjs test src/mymath.tjs
  ✓ 'add and multiply':9
  ✓ Signature: add signature example:1
  ✓ Signature: multiply signature example:5

/…/my-project/src/mymath.tjs: 3 passed, 0 failed
```

### Inconclusive tests

Tests run each file on its own, without its imports. So `main.tjs`'s `calculate` example
cannot run: `calculate` calls `add` and `multiply`, which come from `mymath.tjs`. A test that
cannot run at all is **inconclusive**, and the three commands treat it differently:

| Command    | An inconclusive test                                      |
| ---------- | --------------------------------------------------------- |
| `tjs test` | shown with `?`; does not fail                             |
| `tjs check`| does not fail, and is not shown; the file gets a plain `✓` |
| `tjs emit` | counted as a failure: the file is not written (see below) |

So a `✓` from `check` means "nothing failed", not "every test ran". This is why the tests
belong in the module being imported; [Local Module Imports](/local-module-imports/) explains
the pattern.

### `tjs test`: `*.test.tjs` files under `bun test`

Given a directory, or no argument at all, `tjs test` does something else: it finds every
`*.test.tjs` file and runs them with `bun test`. These are ordinary Bun test files written in
TJS, using `test(name, fn)` and `expect` from `bun:test`. Use them for tests that need imports,
which a `test` block cannot have:

```tjs:static
// math.test.tjs
import { test, expect } from 'bun:test'
import { add } from './mymath.tjs'

test('add from another file', () => {
  expect(add(2, 2)).toBe(4)
})
```

`-t pattern` filters by test name, as in `bun test`.

A `test '…' { }` block inside a `.test.tjs` file is silently skipped on this route: only
`test(name, fn)` calls run.

### `tjs emit`: compile to files

`tjs emit` writes JavaScript. With one file and no `-o`, it prints the JavaScript to standard
output; with `-o` it writes files:

```bash
tjs emit src/mymath.tjs > mymath.js
tjs emit src/ -o dist/          # every .tjs under src/ into dist/
tjs emit src/ -o dist/ --dts    # plus a .d.ts per file
```

For each `foo.tjs` it writes `foo.js` and `foo.md` (documentation generated from the
signatures; `--no-docs` turns it off and `--docs-dir <dir>` puts it elsewhere). `--debug` adds
source locations to the metadata. A relative `import './foo.tjs'` is rewritten to
`./foo.js`, so the output tree runs without TJS.

`emit` runs each file's tests first and **refuses to write a file whose tests fail**, exiting
with status 1. `--jfdi` ("just do it") writes the file even when its tests fail.

One current wrinkle: `emit` also refuses a file whose tests were only inconclusive, which
`check` and `test` accept. Any file that imports another module and has a signature example
hits this, `main.tjs` included. So for now let `check` decide and `emit` write:

```bash
tjs check src/ && tjs emit src/ -o dist/ --jfdi
```

`--jfdi` is safe here only because of the `&&`: `emit` runs only after `check` has passed.

### `tjs types`: the signatures as data

`tjs types` prints what TJS knows about each function as JSON: parameters, their types and
examples, and the return type.

```text
$ tjs types src/mymath.tjs
{
  "file": "src/mymath.tjs",
  "add": {
    "name": "add",
    "params": {
      "a": {
        "name": "a",
        "type": { "kind": "integer" },
        "required": true,
        "default": null,
        "example": 0,
        …
```

`"default": null` means the parameter has no default.

### `tjs convert`: from TypeScript

`tjs convert` reads TypeScript. With `--emit-tjs` it writes `.tjs` source you can keep and
edit; without it, it writes `.js`:

```bash
tjs convert src/ -o tjs/ --emit-tjs   # greet.ts -> greet.tjs
tjs convert src/ -o dist/             # greet.ts -> greet.js
```

Converted code keeps TypeScript's (that is, JavaScript's) behaviour, so by default it checks
nothing at runtime. Given this `greet.ts`:

```typescript
function greet(name: string): string {
  return `Hello, ${name}!`
}
```

the converted `greet(42)` returns `'Hello, 42!'`. A `/* @tjs TjsStrict */` comment at the top
of the `.ts` file opts it into full TJS, including input validation. Converting a codebase is
a book of its own; see [Converting a Project](/ts-converting-a-project/).

## The example project, run three ways

**1. Directly under Bun.** With the preload, Bun imports `.tjs` like any other module:

```bash
bun src/main.tjs
```

**2. With the CLI.**

```bash
tjs run src/main.tjs
```

**3. As plain JavaScript, anywhere.** Compile, then run the output with Node (or serve it to
a browser, or hand it to any bundler). `--jfdi` is there because `main.tjs`'s example is
inconclusive (see [`tjs emit`](#tjs-emit-compile-to-files)):

```bash
tjs check src/ && tjs emit src/ -o dist/ --jfdi
node dist/main.js
```

All three print:

```text
calculate(3, 4) = 14
Expected integer for 'mymath.tjs:1:add.a', got number
```

The second line is `add` refusing `1.5`. "Got number" means it got a number that is not an
integer. The check lives in `mymath.tjs`, so it travels with the function into every file
that calls it, and the error names where the function was declared: parameter `a` of `add`,
line 1 of `mymath.tjs`.

Three things go wrong often:

- **Write the extension.** `from './mymath.tjs'` works; `from './mymath'` does not. Bun
  resolves the import and does not guess `.tjs`.
- **No preload, no `.tjs` imports.** Without `bunfig.toml`, Bun cannot load
  `./mymath.tjs`, and both `bun` and `tjs run` stop with
  `Export named 'add' not found in module '…/mymath.tjs'`. A single file with no `.tjs`
  imports runs under `tjs run` either way.
- **Point `check` at your sources.** `tjs check .` also checks `dist/` and anything else
  ending in `.js`. Give it `src/`.

## Under Bun: the runtime plugin

The `bunfig.toml` above is all Bun needs. The preload registers a loader that compiles each
`.tjs` file as it is imported, and installs the shared TJS runtime (see
[The shared runtime](#the-shared-runtime)) before any module runs.

It does not run signature examples or `test` blocks, for the same reason `tjs run` does not:
importing a module should not run its tests. To make a wrong worked example fail at import
time, under `bun` or `bun test`, set `TJS_RUN_TESTS=1`:

```text
$ TJS_RUN_TESTS=1 bun broken.tjs
5
…
error: Transpile-time test failures:
  Function signature example is inconsistent:
    Expected 0 at 'add', got 5
…
```

It exits with status 1. As with `check`, the module's own `console.log` runs while the tests
do, and Bun adds a source frame and a stack trace (shown here as `…`).

It costs a test run per file loaded, so it suits CI better than everyday runs.

## Bundling with `Bun.build`

The preload is a runtime registration, and `Bun.build` ignores it. To bundle a `.tjs` graph,
pass the build plugin:

```typescript
// build.ts — run with: bun build.ts
import { tjsPlugin } from 'tjs-lang/bun-build-plugin'

const result = await Bun.build({
  entrypoints: ['./src/main.tjs'],
  outdir: './bundle',
  plugins: [tjsPlugin({ runTests: true })],
})
if (!result.success) {
  console.error(result.logs)
  process.exit(1)
}
```

`bundle/main.js` then runs with `node bundle/main.js` and prints the same two lines.

The plugin takes two options, both off by default:

- `runTests: true` runs each file's examples and tests as it is bundled, so a wrong example
  fails the build. Inconclusive tests, like `main.tjs`'s `calculate` example, do not.
- `sharedPrelude: true` concerns the **prelude**, the small inline runtime each emitted file
  carries (see the next section). With it, every module imports one shared copy instead of
  inlining its own. The shared copy has every feature in it, so it pays off only when a bundle
  has many modules: for the two-file project above it makes the bundle larger (about 32 KB
  against 11 KB). Leave it off unless you have measured a saving. Use it only for a bundle
  built in one go; a module compiled against a different prelude (in practice, a different
  tjs-lang version) refuses to load.

Other bundlers (Vite, webpack, esbuild, Rollup) have no TJS plugin. Run `tjs emit` first and
give them the `.js` output.

## What emitted JavaScript looks like

Compiling `mymath.tjs` gives a file in four parts.

**An inline runtime** at the top: `const __tjs_rt = (() => { … })()`, a few hundred bytes to a
few KB holding `MonadicError`, `typeError` and the other helpers the file actually uses. It is
what makes every emitted file standalone: it runs with no setup and no tjs-lang installed.

**A `__tjs` binding**, one line after it:

```javascript
const __tjs = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? { typeError: __tjs_rt.typeError, … }
```

When the module loads, it uses the installed shared runtime if there is one, and the inline
helpers otherwise. Your code calls `__tjs.…` either way, so the file never needs a global.
A module loaded before the runtime is installed still records its type errors there and obeys
`logTypeErrors`/`throwTypeErrors`, but not `callStacks`. Install first to get everything (see
[The shared runtime](#the-shared-runtime)).

**Your code, with its checks.** Each typed function starts by checking its arguments and
returning an error if one is wrong:

```javascript
export function add(a,b) {
  __tjs.pushStack('mymath.tjs:1:add');
  const __cv_a = __tjs_rt.__tv(a);
  if ((typeof __cv_a !== 'number' || !Number.isInteger(__cv_a))) { return __tjs.typeError('mymath.tjs:1:add.a', 'integer', __cv_a); }
  …
  return a + b
}
```

(`__tv` unwraps a wrapped value, such as a reactive proxy, before the check.)

**Metadata.** After each function, its signature as data, which is a shorter form of what
`tjs types` prints and what [Schema Validation](/schema-validation/) reads at runtime:

```javascript
add.__tjs = {
  "params": {
    "a": { "type": { "kind": "integer" }, "required": true, "default": null },
    …
  },
  "returns": { "type": { "kind": "integer" } },
  "source": "mymath.tjs:1"
}
```

The `test` blocks are stripped from the output. They run only when a tool asks for them:
`check`, `test`, `emit`, `TJS_RUN_TESTS`, `runTests`, or `tjs()` from code.

With `--dts`, `tjs emit` also writes a TypeScript declaration file, so TypeScript code can
import the output:

```typescript
// dist/mymath.d.ts
export declare function add(a: number, b: number): number;
export declare function multiply(a: number, b: number): number;
```

TypeScript has no integer type, so `integer` becomes `number`. The declarations describe a
successful call; they do not say that `add` returns an error value when it refuses an
argument.

## From your own code

`tjs(source, options)` from `tjs-lang/lang` is the transpiler every route above calls. It
returns an **object**, not a string. `.code` is the complete JavaScript, inline runtime
included; `.body` is only what your source became, without the runtime in front of it; and
`.types` is the signature as data:

```javascript
import { tjs } from 'tjs-lang/lang'

const source = `
function double(n: 0): 0 {
  return n * 2
}
`

const result = tjs(source, { filename: 'double.tjs' })
typeof result // 'object'
typeof result.code // 'string'
result.types.double.params.n.type.kind // 'integer'

// The dialect option is what a file extension decides for you
const eq = `const same = '5' == 5`
tjs(eq).body // "const same = __tjs_rt.Eq('5', 5)"  (TJS equality)
tjs(eq, { dialect: 'js' }).body // "const same = '5' == 5"  (JavaScript, unchanged)
```

The options you will reach for:

- `filename`: used in error paths (`double.tjs:2:double.n`) and in each function's `source`.
- `dialect: 'js' | 'tjs'`: which language the source is. A bare string is TJS.
- `runTests`: by default `tjs()` runs the signature examples and `test` blocks and **throws**
  if one fails. `'report'` puts the results in `result.testResults` instead of throwing;
  `false` skips them.
- `prelude: 'import'`: the programmatic form of `sharedPrelude`. The output starts with
  an `import` of `createPrelude` from `tjs-lang/prelude` instead of an inline runtime.

To run source with no `import` or `export`, evaluate `.code` and pick out what it defines:

```javascript
import { tjs } from 'tjs-lang/lang'
import { isMonadicError } from 'tjs-lang/runtime'

const { code } = tjs('function double(n: 0): 0 { return n * 2 }')
const double = new Function(code + '\nreturn double')()

double(21) // 42
isMonadicError(double(1.5)) // true
```

(In a `.tjs` file, TJS warns about `new Function`, because it evaluates source with full
access to everything; that is why this example is plain JavaScript.)

That works only for a script. Source with `export` or `import`, like `mymath.tjs`, compiles
to an ES module, and `new Function` throws `Unexpected keyword 'export'`. Write the code to a
`.mjs` file and `import()` it instead.

### A tool that accepts `.tjs`, `.js` and `.ts`

Every tool in this chapter maps extensions the same way, and `tjs-lang/lang` exports the
mapping so yours can too. `sourceKindForFilename(name)` returns `'tjs'`, `'js'` or `'ts'`.
`dialectForFilename(name)` returns `'js'` for `.js`, `.mjs` and `.cjs`, and `'tjs'` for
everything else, `.ts` included. So ask `sourceKindForFilename` first: TypeScript goes through
`fromTS`, which lives in its own entry point because it needs the TypeScript compiler, and
everything else goes straight to `tjs()`:

```typescript
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { tjs, dialectForFilename, sourceKindForFilename } from 'tjs-lang/lang'
import { fromTS } from 'tjs-lang/lang/from-ts'

export function compileFile(path: string): string {
  const source = readFileSync(path, 'utf-8')
  const filename = basename(path)
  if (sourceKindForFilename(path) === 'ts') {
    const converted = fromTS(source, { emitTJS: true, filename })
    return tjs(converted.code, { filename }).code
  }
  return tjs(source, { filename, dialect: dialectForFilename(path) }).code
}
```

There is deliberately no single call that does all three: it would put the TypeScript
compiler in the bundle of every program that uses `tjs-lang/lang`. The converted TJS carries
a marker that tells `tjs()` it came from TypeScript, so the second call needs no `dialect`.

## In the browser

`tjs-lang/browser` is a self-contained ES module (the transpiler with its parser built in),
so a page can load it from any CDN with no bundler and no import map:

```javascript
const { tjs } = await import(
  'https://cdn.jsdelivr.net/npm/tjs-lang/dist/tjs-browser.js'
)

const { code } = tjs(
  "function greet(name: 'World'): 'Hello, World!' { return 'Hello, ' + name + '!' }"
)
const greet = new Function(code + '\nreturn greet')()
greet('Ada') // 'Hello, Ada!'
greet(42).message // "Expected string for '<source>:1:greet.name', got number"
```

A URL with no version loads whatever release is tagged `latest`; pin one
(`…/npm/tjs-lang@<version>/dist/tjs-browser.js`) in anything you ship.

For production, compile ahead of time with `tjs emit` and serve the `.js`; the page then
needs nothing from tjs-lang, unless your own source imports it (for example
`tjs-lang/runtime`). Compiling in the page is for editors, playgrounds and
pages like this one. For TypeScript in the browser (`tjs-lang/browser/from-ts`), see
[Build, CI and Editors](/ts-build-and-tooling/).

## The shared runtime

Every emitted file works alone, using its inline runtime. **Installing the shared runtime**
puts one full runtime on `globalThis.__tjs`, which every TJS module on the page or process
then reports to:

```javascript
import { installRuntime } from 'tjs-lang/runtime'
installRuntime()

const { add } = await import('./dist/mymath.js')
add(1.5, 2)
__tjs.errors().length // 1
```

What it adds is the [Flight Recorder](/error-history/): `__tjs.errors()`, the record of every
type error any module returned, including the ones your code ignored. Without an installed
runtime there is no `__tjs` global and no history. The same goes for `configure()` from
`tjs-lang/runtime` (log or throw type errors while debugging, see
[Error Handling](/error-handling/)): emitted code reads those settings from the installed
runtime, so without one `configure({ throwTypeErrors: true })` changes nothing.

Install it before the TJS modules load. Each module picks its runtime once, as it is
evaluated (the `__tjs` binding above), and a static `import` is evaluated before any of your
code runs, even code written above it. So load TJS modules with `await import()` after
`installRuntime()`, as above, or call `installRuntime()` in a separate module that you import
first. `tjs run`, the Bun preload and this book's pages install it for you.

What it is **not** needed for is `isMonadicError`. That function recognises an error from any
TJS module, compiled by any copy of tjs-lang, with or without a shared runtime, so checking a
result from another file always works:

```javascript
import { isMonadicError } from 'tjs-lang/runtime'
import { add } from './dist/mymath.js'

isMonadicError(add(1.5, 2)) // true, no installRuntime() needed
```

## Summary

| You want to…                           | Use                                                             |
| -------------------------------------- | --------------------------------------------------------------- |
| know whether the code is right         | `tjs check src/` (exit 1 on failure)                            |
| run a file                             | `tjs run file.tjs`, or `bun file.tjs` with the preload          |
| see every test result                  | `tjs test file.tjs`                                             |
| import `.tjs` under Bun and `bun test` | `preload` and `[test] preload` in `bunfig.toml`                 |
| fail on a wrong example at import time | `TJS_RUN_TESTS=1 bun …`                                         |
| ship plain JavaScript                  | `tjs emit src/ -o dist/` (plus `--dts` for TypeScript)          |
| read signatures as data                | `tjs types file.tjs`                                            |
| convert TypeScript                     | `tjs convert src/ -o tjs/ --emit-tjs`                           |
| bundle with Bun                        | `Bun.build` with `tjsPlugin()` from `tjs-lang/bun-build-plugin` |
| compile in a page                      | `tjs-lang/browser` from a CDN                                   |
| compile from code                      | `tjs(source).code` from `tjs-lang/lang`                         |
| keep a history of refused calls        | `installRuntime()` before loading modules                       |
