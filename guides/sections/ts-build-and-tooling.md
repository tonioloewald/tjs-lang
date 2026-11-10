<!--{"parent": "TJS-FOR-TS.md", "order": 6}-->
<!-- TODO review -->

# Build, CI and Editors

This chapter is about the plumbing: how `.tjs` files sit next to `.ts` files in one
project, how they get built and tested, what to run in CI, which editors understand them,
and how to debug a refused call. The examples assume Bun, because that is where TJS
integrates most directly; the last part of the build section covers everything else.

Three facts shape everything below:

- **TJS is compiled ahead of time or on import, never by `tsc`.** TypeScript cannot read a
  `.tjs` file. Bun loads it through a plugin; every other toolchain gets plain `.js` from
  `tjs emit`.
- **TJS checks run when the code runs.** A refused call returns an error value; it does
  not throw (see [What a refused call returns](#what-a-refused-call-returns)). So your test
  suite and your CI decide whether a refused call goes unnoticed.
- **The `tjs` CLI runs on Bun.** Its executable starts with `#!/usr/bin/env bun`, so CI
  needs Bun installed even if the project ships for Node.

Three runtime terms come up below, and they fit together like this. Every emitted
module carries a small **inline runtime**: the type checks and error values it needs, so
it runs with no setup. The **full runtime** (`tjs-lang/runtime`), installed as
`globalThis.__tjs` by the Bun plugin or by `installRuntime()`, adds the flight recorder
and `configure`, and every module reports its errors to it. **`sharedPrelude`** is a
bundling option that replaces each module's inline copy with one shared import.

## A mixed `.ts` / `.tjs` tree

Nothing about TJS requires a separate directory. A file's extension decides how it is
compiled:

```text
src/
  main.ts           TypeScript, compiled by Bun as usual
  users.ts          TypeScript: export function greet(name: string) { return `Hello, ${name}` }
  orders.tjs        TJS: transpiled by the plugin on import
  orders.tjs.d.ts   declarations so tsc can type the import (generated, see below)
  orders.test.ts    a bun:test file that imports orders.tjs
```

`orders.tjs` is ordinary TJS. A colon value in TJS is an example, not a type: `1` is an
integer example, so `qty` must be an integer, and `2.5` is a float example, so `price` can
be any number. The return annotation is a worked example (`orderTotal(1, 2.5)` is `2.5`),
which `tjs check` runs:

```tjs:static
export function orderTotal(qty: 1, price: 2.5): 2.5 {
  return qty * price
}
```

A TypeScript file imports it with the extension:

```typescript
import { orderTotal } from './orders.tjs'
import { greet } from './users'

console.log(greet('Ada'), orderTotal(3, 2.5)) // Hello, Ada 7.5
```

### What a refused call returns

When a check refuses an argument, the function does not run. It returns a `MonadicError`,
which is an `Error` subclass with the message, a `path` naming the parameter, and
`expected`/`actual` types. `isMonadicError` from `tjs-lang/runtime` tells it apart from a
real result, and narrows the type for TypeScript:

```typescript
import { isMonadicError } from 'tjs-lang/runtime'
import { orderTotal } from './orders.tjs'

const total = orderTotal(JSON.parse('"3"'), 2.5)
if (isMonadicError(total)) {
  console.log(total.message) // Expected integer for 'orders.tjs:1:orderTotal.qty', got string
} else {
  console.log(total.toFixed(2))
}
```

`isMonadicError` checks the shape, not the class, so it works on errors from any module,
whichever copy of the runtime made them. For code that never checks, there is the flight
recorder, under Debugging refused calls below.

### Bun: the runtime plugin

Add the plugin to the project's `bunfig.toml`, in **both** places:

```toml
preload = ["tjs-lang/bun-plugin"]

[test]
preload = ["tjs-lang/bun-plugin"]
```

The top-level `preload` covers `bun run`; `[test] preload` covers `bun test`. Each is
ignored by the other command, so with only one of them you get this when a `.tjs` file is
imported:

```text
SyntaxError: Export named 'orderTotal' not found in module '…/src/orders.tjs'.
```

The message says nothing about plugins: Bun simply did not know how to load the file.

The plugin does two things. It installs the full TJS runtime as `globalThis.__tjs`
before any module runs, and it transpiles each `.tjs` file the first time it is imported.
It loads the transpiler lazily, so a run that imports no `.tjs` file does not pay for it.

### Running signature examples on import: `TJS_RUN_TESTS`

By default the plugin only transpiles. A wrong return example is not noticed until
something runs `tjs check`: say `orderTotal` were declared `: 3.0`, when
`orderTotal(1, 2.5)` is `2.5`. Set `TJS_RUN_TESTS=1` to make the plugin run each file's
signature examples and `test` blocks as it loads the file:

```bash
TJS_RUN_TESTS=1 bun test
```

A failing example then fails the import, and so the test file that imported it:

```text
error: Transpile-time test failures:
  Function signature example is inconsistent:
    Expected 3 at 'orderTotal', got 2.5
```

It is an environment variable because a preload takes no options. It costs one test run
per loaded file, which is why it is off by default; turning it on in CI and leaving it off
locally is a reasonable split.

### Bun.build: `tjsPlugin`

`Bun.build` ignores runtime preloads, so a bundle needs the plugin passed explicitly:

```typescript
// build.ts
import { tjsPlugin } from 'tjs-lang/bun-build-plugin'

const result = await Bun.build({
  entrypoints: ['src/main.ts'],
  outdir: 'dist',
  target: 'browser',
  plugins: [tjsPlugin({ runTests: true })],
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
```

`tjsPlugin` takes two options, both off by default:

- `runTests`: the same as `TJS_RUN_TESTS=1`. A failing signature example or `test` block
  fails the build.
- `sharedPrelude`: every module imports one copy of the inline runtime from
  `tjs-lang/prelude` instead of carrying its own. The shared copy is the whole runtime, so
  it makes a one-module bundle larger; it pays off when many `.tjs` modules end up in one
  bundle.

The bundle needs no TJS setup to run: each module carries its inline runtime. It uses
`globalThis.__tjs` only when one is installed, so a bundled app that wants the flight
recorder calls `installRuntime()` from `tjs-lang/runtime` before the `.tjs` modules load.

### Telling `tsc` about `.tjs` imports

`tsc` reports `Cannot find module './orders.tjs'` until it has declarations. With
`"moduleResolution": "bundler"` (what `bun init` writes), TypeScript looks for
`orders.tjs.d.ts` next to the file, with no other setting. Under `node16` or `nodenext` it
does not; there the file must be named `orders.d.tjs.ts`, and tsconfig needs
`"allowArbitraryExtensions": true`.

`tjs emit --dts` (below) writes declarations too, but beside the `.js` it emits, as
`orders.d.ts`. In a Bun tree there is no `.js`: the `.tjs` file is imported directly, so
its declarations have to sit beside it. The CLI has no mode for that, so a short script
writes one per `.tjs` file. `generateDTS` (from `tjs-lang/lang`) builds it from the
transpiler's metadata plus the source, which it reads to see which names are exported:

```typescript
// tjs-dts.ts: write a foo.tjs.d.ts beside every foo.tjs
import { Glob } from 'bun'
import { tjs, generateDTS } from 'tjs-lang/lang'

for await (const path of new Glob('src/**/*.tjs').scan('.')) {
  const source = await Bun.file(path).text()
  const result = tjs(source, { filename: path, runTests: false }) // tjs check runs them
  await Bun.write(`${path}.d.ts`, generateDTS(result, source))
  console.log(`${path}.d.ts`)
}
```

For the file above it writes:

```typescript
export declare function orderTotal(qty: number, price: number): number;
```

Three things to know about these declarations. TypeScript has no integer type, so `qty`
widens to `number`, and `tsc` accepts `orderTotal(1.5, 2.5)`, a call TJS refuses. They
describe the successful call: when a check refuses an argument, `orderTotal` returns a
`MonadicError` instead of a number, and the declaration does not say so. And they are
generated, so regenerate them when a signature changes (or in CI, before `tsc`).

### Other toolchains: precompile with `tjs emit`

Node, Vite, webpack and esbuild have no TJS plugin. Compile the `.tjs` files to `.js`
first, and let the rest of the toolchain see only JavaScript. The CLI itself still runs on
Bun, so Bun has to be installed where this runs, even though the output does not need it:

```bash
tjs emit src/ -o dist/ --dts
```

For each `foo.tjs` this writes `foo.js`, `foo.d.ts` (because of `--dts`) and `foo.md`, a
page of generated documentation listing each function's signature. It is on by default
because in TJS the signature is the documentation; `--no-docs` turns it off. An
`import './orders.tjs'` inside a `.tjs` file is rewritten to `./orders.js` in the output,
so the emitted tree runs as is:

```bash
node dist/main.js
```

The output is ES modules. Node 22 detects that on its own; for older Node, or to silence
Node 22's `MODULE_TYPELESS_PACKAGE_JSON` warning when a `package.json` has no `type`, set
`"type": "module"`.

`tjs emit` refuses to write a file whose signature examples or `test` blocks fail, and
exits with status 1. `--jfdi` ("just do it") writes it anyway, which is for getting a
build out while you fix the test, not for CI. `--dts` and the generated docs are only
written with `-o`; without it, `tjs emit file.tjs` prints the JavaScript to standard output
and nothing else. There is no watch mode: in a Vite or webpack dev loop, rerun `tjs emit`
from your own file watcher.

## The CLI in CI

Four commands matter for a TypeScript team. In a project that installed `tjs-lang` the CLI
is `tjs`, run as `bunx tjs` or `./node_modules/.bin/tjs`.

| Command                               | What it does                                                                  | Fails (exit 1) when                                                |
| ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `tjs check <file or dir>`             | Parses and compiles every `.tjs`/`.js`/`.mjs`/`.cjs` file, runs its examples and `test` blocks | a file does not compile, an example or test fails, or warnings exceed `--max-warnings` |
| `tjs convert <src> -o <out>`          | TypeScript to JavaScript with TJS metadata, one `.js` per `.ts`               | a file cannot be converted. **Not** when its embedded tests fail   |
| `tjs convert --emit-tjs <src> -o <out>` | TypeScript to `.tjs` source                                                 | a file cannot be converted, or the result is not valid TJS         |
| `tjs emit <src> -o <out> [--dts]`     | TJS to JavaScript, plus `.d.ts` and docs                                      | a file does not compile, or its examples or tests fail             |

There is also `tjs test`, which runs `.test.tjs` files, or the `test` blocks of a `.tjs`
file passed to it directly, with `-t <pattern>` to pick tests by name. `tjs check` already
runs the same blocks, so CI does not need both; `tjs test` is the quicker loop while you
work on one file.

### `tjs check` and `--max-warnings`

`tjs check` is the command to gate on. Over a directory it checks every `.tjs` and plain
JavaScript file it finds (not `.ts`: convert those first), prints one line per file, and
exits 1 if any file fails. `.js` files are checked with JavaScript semantics, `.tjs` files
as native TJS.

It also reports **warnings**: places where a type could not be turned into a runtime check,
so the parameter is unchecked. The usual cause is a type name TJS cannot resolve:

```text
⚠ src/render.tjs: 'w: Widget' could not be resolved to a runtime type, so it is unchecked
  (best effort). For real runtime safety give an example (w: 3), a sound type (w: number),
  or a predicate:
    Type Widget { predicate(v) { return typeof v === 'object' && v !== null } }
✓ src/render.tjs
```

The `✓` after the warning means the file passed anyway. ("A sound type" in the message
means a type name TJS knows how to check: `number`, `string` and the like.) A warning
alone does not fail the check. `--max-warnings <n>` fails the run when the total across
all files exceeds `n`, the same shape as ESLint's flag:

```bash
tjs check src/ --max-warnings 0
```

Zero is the goal, not the place to start. Set `n` to today's count and lower it over time,
so a team can adopt the gate without fixing everything first.

### `tjs convert` does not fail on failed tests

`tjs convert` (to JavaScript) runs each file's embedded tests (the `/*test '…' { }*/`
comments described in [Embedded Tests](/ts-embedded-tests/)) and prints any failure, but
**exits 0**, because the conversion itself succeeded. Take a `src/price.ts` whose embedded
test is wrong, next to an ordinary `price.test.ts`:

```typescript
// src/price.ts
export function withTax(amount: number): number {
  return Math.round(amount * 1.2)
}

/*test 'tax is added' {
  expect(withTax(10.4)).toBe(12.5)
}*/
```

```typescript
// src/price.test.ts
import { test, expect } from 'bun:test'
import { withTax } from './price'

test('tax is rounded', () => {
  expect(withTax(10)).toBe(12)
})
```

`tjs convert src/ -o build/js` prints this and exits 0 (the test file is skipped, not
converted):

```text
src/price.ts: 0 passed, 1 failed
  ✗ 'tax is added':8: Expected 12.5 but got 12
✓ src/price.ts -> build/js/price.js

Directory src/: 1 converted, 0 failed, 1 skipped
```

A CI step that runs only `tjs convert` is therefore green with a failing test. Gate on
`tjs check` over the `--emit-tjs` output instead, which fails on the same test.

`tjs convert` also prints a warning for every TypeScript type it had to drop to `any`:
unconstrained generics, `ReturnType<T>` and similar, and also names it cannot resolve,
which includes a class or interface from the same file used as a type
(`function makeCart(): Cart` gives `Unknown type 'Cart' converted to 'any'`). These appear
only at conversion time, not later in `tjs check`; in the `.tjs` output they are marked with
`/* TODO: TS types degraded … */` comments you can search for.

### A CI recipe

The two jobs below are independent. The first is for a project that already has `.tjs`
files; the second is for a TypeScript codebase being migrated, and checks the converted
tree without replacing the TypeScript.

**A mixed tree on Bun:**

```bash
bun install
bun tjs-dts.ts                          # declarations for .tjs imports
bunx tsc --noEmit                       # TypeScript, as before
bunx tjs check src/ --max-warnings 20   # today's warning count; lower it over time
TJS_RUN_TESTS=1 bun test                # your tests, with .tjs examples run on import
```

**A TypeScript project, converted and tested.** This converts the same `src/` twice, for
two different checks: to TJS so `tjs check` can compile it and run its embedded tests, and
to JavaScript so your own test suite can run against the converted code.

```bash
mkdir -p build                                  # see the gotcha about -o below
bunx tjs convert --emit-tjs src/ -o build/tjs   # 1. TS -> TJS
bun graduate.ts build/tjs                       # 2. drop the conversion marker
bunx tjs check build/tjs                        # 3. it compiles; embedded tests pass

bunx tjs convert src/ -o build/js               # 4. TS -> JS, the same conversion
# copy only the *.test.ts files (and the folders they sit in) into the converted tree
rsync -a --include='*/' --include='*.test.ts' --exclude='*' src/ build/js/
bun test ./build/js                             # 5. your own tests, on converted code
```

Step 2 is needed because of how conversion marks its output. Each converted file starts
with a `/* tjs <- price.ts */` comment, the conversion marker, which means "this file has
JavaScript semantics". `tjs check` does not read the marker yet: it treats every `.tjs`
file as native TJS, where classes are called without `new`, so on a file that calls `new`
on a class it declares it fails with `` `new X` is not allowed in TJS ``. Graduating a file
removes the marker and makes the code native TJS, rewriting what has to change (dropping
those `new`s, for one). There is no CLI command for it yet; `graduate.ts` is the short
script in [Converting a TypeScript Project](/ts-converting-a-project/), which also covers
what graduation changes. With the example `price.ts`, step 3 fails on the wrong embedded
test, which is the point: step 4 printed the same failure and exited 0.

Step 5 is the one that proves the conversion kept your program's behaviour. `tjs convert`
skips `*.test.ts` and `*.d.ts` files, so the `rsync` copies the test files into the
converted tree, where `import { withTax } from './price'` now finds `price.js`. (Test files
that import `./price.ts` with the extension need that changed first.) The JavaScript tree
is not graduated, so it keeps JavaScript semantics, and this run tests the same program
`tsc` would have built, not a stricter one.

As a GitHub Actions job, the mixed-tree recipe is:

```yaml
jobs:
  tjs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun tjs-dts.ts
      - run: bunx tsc --noEmit
      - run: bunx tjs check src/ --max-warnings 20
      - run: TJS_RUN_TESTS=1 bun test
```

## Editors

What exists today is syntax highlighting. There is no TJS language server, so an editor
does not show type errors in a `.tjs` file as you type: `tjs check` is where they appear.

**VS Code and Cursor.** `tjs-lang` ships a grammar extension for `.tjs` and `.ajs` files.
AsyncJS (AJS) is the package's other language: a JavaScript subset for agent code that runs
in a sandboxed VM (see [AJS](/ajs/)). The extension also highlights AJS inside
`` ajs`…` `` template literals in TypeScript and JavaScript files, and marks syntax AJS
forbids. The installers are named `ajs-install-*`, but they install the one extension,
which covers `.tjs` too. Run one from a project that has `tjs-lang` installed (it is a
shell script, so it does not need Bun):

```bash
npx ajs-install-vscode    # or: npx ajs-install-cursor
```

then restart the editor. `--uninstall` removes it.

**Web editors.** Three adapters, for a playground or an in-app code editor:

| Package path                    | Exports                                               | Covers         |
| ------------------------------- | ----------------------------------------------------- | -------------- |
| `tjs-lang/editors/codemirror`   | `tjsEditorExtension()`, `ajsEditorExtension()`        | CodeMirror 6: JavaScript highlighting, plus marks on syntax TJS or AJS forbids, and autocomplete |
| `tjs-lang/editors/monaco`       | `registerAjsLanguage(monaco)` (language id `ajs`)     | AJS highlighting |
| `tjs-lang/editors/ace`          | `registerAjsMode(ace)` (mode `ace/mode/ajs`)          | AJS highlighting |

The CodeMirror adapter uses CodeMirror's own JavaScript grammar, so a colon example such as
`'World'` is coloured as ordinary code, not as a value. Monaco and Ace have no TJS mode
yet, only AJS.

```typescript
import { EditorView, basicSetup } from 'codemirror'
import { tjsEditorExtension } from 'tjs-lang/editors/codemirror'

new EditorView({
  doc: "function greet(name: 'World') { return `Hello, ${name}!` }",
  extensions: [basicSetup, tjsEditorExtension()],
  parent: document.body,
})
```

The CodeMirror adapter needs the `@codemirror/*` packages it imports. They are optional
peer dependencies of `tjs-lang`, so install them yourself (`basicSetup` above comes from
the separate `codemirror` package). For static highlighting in a documentation site,
`tjs-lang/editors/prism/tjs` and `tjs-lang/editors/prism/ajs` are Prism language
definitions.

## In the browser

Two prebuilt ES modules transpile in the page, with no bundler and no import map:

```javascript
// TJS (and AJS): self-contained, loads from any CDN
const { tjs } = await import(
  'https://cdn.jsdelivr.net/npm/tjs-lang/dist/tjs-browser.js'
)
const { code } = tjs(
  "function greet(name: 'World'): 'Hello, World' { return 'Hello, ' + name }"
)
const greet = new Function(code + '\nreturn greet')()
greet('Ada') // 'Hello, Ada'
greet(42) // an error value: name must be a string
```

```javascript
// TypeScript -> TJS: loads the TypeScript compiler on the first call
const { fromTS } = await import(
  'https://cdn.jsdelivr.net/npm/tjs-lang/dist/tjs-browser-from-ts.js'
)
const { code } = await fromTS('function add(a: number, b: number) { return a + b }', {
  emitTJS: true,
})
```

From npm the same modules are `tjs-lang/browser` and `tjs-lang/browser/from-ts`.

The first bundle has no dependencies to fetch, which is why it loads from any CDN. The
`new Function` call above is only there to run the result in a demo; in an app you would
load the emitted code as a module. The second bundle does not include the TypeScript
compiler (about 10 MB); its `fromTS` is `async` because the first call imports
the compiler from `https://esm.sh/typescript@5`. esm.sh is the default because, when this
was tested in a browser, it was the only CDN that served the compiler reliably. To use your
own copy, pass `fromTS(source, { typescriptUrl })`, or set `globalThis.__TJS_TS__` to an
already-loaded compiler before the first call.

## Debugging refused calls

A TJS check that refuses an argument returns an error value. That keeps the program
running, and it also means a refused call nobody looks at is silent. Two tools make it
visible.

### The flight recorder: `__tjs.errors()`

The full runtime keeps a ring of the most recent type errors, whether or not anything
looked at them: 64 by default, and `configure({ maxErrors })` changes that.
`__tjs.clearErrors()` empties it and `__tjs.errors()` returns it, newest last. Both exist
only when the full runtime is installed: under the Bun plugin, `tjs run`, on this site, or
after `installRuntime()`. A module's inline runtime alone has no recorder. Here a value
from JSON reaches `orderTotal` as a string, and the result is thrown away. The `test`
block at the end is a TJS inline test, run when the file is checked (see the
[syntax reference](/TJS-SYNTAX/)):

```tjs:inline
function orderTotal(qty: 1, price: 2.5): 2.5 {
  return qty * price
}

__tjs.clearErrors()

const fromJson = JSON.parse('{"qty": "3", "price": 2.5}')
const total = orderTotal(fromJson.qty, fromJson.price) // never looked at

const refused = __tjs.errors()
console.log(`${refused.length} refused call: ${refused[0].message}`)

test 'the ignored error was recorded' {
  expect(refused.length).toBe(1)
  expect(refused[0].message).toContain('orderTotal.qty')
}
```

In a Bun test suite (with the plugin preloaded, `__tjs` is installed), the same two calls
turn "no call was refused" into an assertion. Errors from every `.tjs` module reach the
global recorder:

```typescript
import { test, expect, beforeEach } from 'bun:test'
import { orderTotal } from './orders.tjs'

const tjsRuntime = (globalThis as any).__tjs

beforeEach(() => tjsRuntime.clearErrors())

test('checkout refuses no calls', () => {
  orderTotal(2, 2.5)
  expect(tjsRuntime.errors().map((e: any) => e.message)).toEqual([])
})
```

If a test calls `orderTotal(1.5, 2.5)`, the assertion fails and prints the message
(`Expected integer for 'orders.tjs:1:orderTotal.qty', got number`): a refused call the code
under test returned and nobody checked. `__tjs.errors()` holds type errors only; other
events the runtime records (WebAssembly fallbacks, VM failures) are in `__tjs.records()`.

### `configure`: log or throw instead of return

While debugging, it can be easier to have a refused call shout. `configure` from
`tjs-lang/runtime` sets two switches:

- `logTypeErrors: true` prints each type error to the console as it happens
  (`[TJS TypeError] Expected integer for …`), and still returns it.
- `throwTypeErrors: true` throws it instead of returning it, so the stack trace points at
  the call. What is thrown is the same `MonadicError`, so a `catch` can test it with
  `isMonadicError`.

**Configure before any `.tjs` module is imported.** Each module takes a snapshot of the
configuration when it loads, and a later `configure` does not reach it (the runtime prints
a warning saying so). Because ES imports run before the importing module's own code,
calling `configure` at the top of `main.ts` is already too late. Put it in its own preload
file, after the plugin:

```typescript
// tjs-debug.ts
import { configure } from 'tjs-lang/runtime'

if (process.env.TJS_DEBUG === '1') {
  configure({ logTypeErrors: true, throwTypeErrors: true })
}
```

```toml
preload = ["tjs-lang/bun-plugin", "./tjs-debug.ts"]

[test]
preload = ["tjs-lang/bun-plugin", "./tjs-debug.ts"]
```

`TJS_DEBUG=1 bun test` then runs the suite with every refused call thrown at its call
site, and a plain `bun test` behaves as normal.

## The gotchas

- **`preload` and `[test] preload` are separate.** Configure both, or `bun run` and
  `bun test` disagree about whether `.tjs` files exist.
- **`tjs convert` exits 0 when embedded tests fail.** Gate on `tjs check`, not on convert.
- **`-o` creates one missing directory, not a path of them.** `tjs convert src -o
  build/converted` fails with `ENOENT … lstat 'build'` for every file if `build/` does not
  exist yet. Run `mkdir -p` on the parent first. `tjs emit` behaves the same way.
- **`tjs check` over a directory includes `.js` files.** Point it at source directories,
  not at a tree that also contains build output.
- **Generated `.d.ts` files describe success.** They do not mention the `MonadicError` a
  refused call returns, so TypeScript callers will not be reminded to check for it with
  `isMonadicError` (see [What a refused call returns](#what-a-refused-call-returns)). The
  flight recorder in tests is how you catch the calls that do not.
- **`configure` after import does nothing** to modules already loaded. Use a preload.
