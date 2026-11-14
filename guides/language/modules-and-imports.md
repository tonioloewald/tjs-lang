<!--{"parent": "the-tjs-language.md", "order": 80}-->
<!-- TODO review -->

# Modules and Imports

Two questions come up as soon as a TJS project has more than one file. Do my checks still
hold when another file calls my function, even a plain JavaScript file that knows nothing
about TJS? And can I convert a project one file at a time, leaving the rest as JavaScript?
The answer to both is yes, and this chapter shows why.

It covers what a `.tjs` file is to the module system, how the file extension picks the
language, what does and does not cross a module boundary, how to run a graph of modules, how
a page with no bundler can import npm packages, and how settings reach every module.

It stays at the level of concepts. The commands, their flags and the full Bun setup are in
[Running TJS](/running-tjs/); this chapter links there rather than repeating it.

## A `.tjs` file is an ES module

There is no TJS module system. A `.tjs` file is an ES module, and `import` and `export` mean
exactly what they mean in JavaScript. What TJS adds is that a function's checks belong to the
function, so they travel with it. An exported function validates its own arguments whichever
file calls it, and it carries its signature as data on its `__tjs` property.

This module runs by itself, so it runs here:

```tjs:inline
export function add(a: 0, b: 0): 0 {
  return a + b
}

console.log(add(2, 3))                      // 5
console.log(isMonadicError(add('2', 3)))    // true
console.log(add.__tjs.params.a.type.kind)   // integer
console.log(add.__tjs.returns.type.kind)    // integer
```

`a: 0` means "an integer, for example 0". The return annotation `: 0` is a **signature
example**: a worked example that is tested, so `add(0, 0)` must give `0`. `export` changes
none of that.

Not every tool runs signature examples, and this matters once you have many files:

| Tool                                           | Runs signature examples and `test` blocks? |
| ---------------------------------------------- | ------------------------------------------ |
| `tjs check`, `tjs test`                        | yes; a failure exits 1                     |
| `tjs emit`                                     | yes; it refuses to write a failing file    |
| `tjs run`                                      | no                                         |
| `bun` with the TJS plugin                      | no, unless `TJS_RUN_TESTS=1` is set        |
| `Bun.build` with `tjsPlugin`                   | no, unless you pass `runTests: true`       |

So `bun app.tjs` will run a file whose worked example is wrong without a word. Run
`tjs check` before you run or ship; [Testing](/testing/#running-tests) has the details.

Now split the module across two files. `mymath.tjs` exports `add`, and `app.tjs` uses it:

<!-- tjs-doc: fragment -->

```tjs:static
// mymath.tjs
export function add(a: 0, b: 0): 0 { return a + b }

// app.tjs
import { isMonadicError } from 'tjs-lang/runtime'
import { add } from './mymath.tjs'

console.log(add(2, 3))                    // 5
console.log(isMonadicError(add('2', 3)))  // true: add checks its own inputs
```

`app.tjs` wrote no validation code, yet `add('2', 3)` is refused. The check is compiled into
`add` itself, inside `mymath.tjs`, so no caller in any file can skip it. That is the
difference from a type system that exists only at compile time: there is no "untyped caller"
that gets around the contract.

### Where `isMonadicError` comes from

The first example called `isMonadicError` with no import, and `app.tjs` imports it. The
reason is the **inline runtime**: each compiled `.tjs` file carries a small runtime of its
own. A file that declares a typed function gets the base runtime, and the base runtime also
defines a few ambient names, `isMonadicError` among them, that the file can use as if they
were globals. They are not globals: they exist only inside that file.

`app.tjs` declares no typed function, so it gets no runtime and no `isMonadicError`. It must
import it from `tjs-lang/runtime`, or compiling and running it fails with
`ReferenceError: isMonadicError is not defined`.

The rule of thumb:

- in a file with no typed function, import `isMonadicError` from `tjs-lang/runtime`;
- in a file that declares one, use the ambient name and do not import it.

Importing it into a file that has typed functions works when the file runs, but it breaks
the file's tests. Tests run without the file's imports (see
[Tests run one file at a time](#tests-run-one-file-at-a-time)), and an imported name hides
the ambient one, so in the test run `isMonadicError` is undefined. `tjs check` reports that
as inconclusive and passes; `tjs emit` refuses the file.

## The extension is the dialect

The module system does not care what language a file was written in, which is what lets one
graph mix them. The file extension decides how a file is read:

| Extension             | Read as    | What it means                                                       |
| --------------------- | ---------- | ------------------------------------------------------------------- |
| `.tjs`                | native TJS | every TJS rule applies                                              |
| `.js`, `.mjs`, `.cjs` | JavaScript | JavaScript, exactly: nothing changes                                |
| `.ts`                 | TypeScript | imported in a graph, its types are erased and nothing is checked    |

So a `.tjs` file can import plain JavaScript, and the JavaScript keeps its own rules. Here
are two files a TJS module will import:

```javascript
// legacy.js
export function looseEquals(a, b) { return a == b }
export const typeOfNull = typeof null
```

```typescript
// units.ts
export function cm(inches: number): number { return inches * 2.54 }
```

Run under Bun, with the TJS plugin set up as in [Under Bun](#under-bun):

<!-- tjs-doc: fragment -->

```tjs:static
// mixed.tjs — run with: bun mixed.tjs
import { looseEquals, typeOfNull } from './legacy.js'
import { cm } from './units.ts'

console.log(looseEquals('5', 5), typeOfNull)  // true object: legacy.js is JavaScript
console.log('5' == 5, typeof null)            // false null: this file is TJS
console.log(cm(10))                           // 25.4
console.log(cm('ten'))                        // NaN: units.ts checks nothing
```

The first `console.log` shows JavaScript's `==` and `typeof`, because that code lives in a
`.js` file. The second shows TJS's, because it lives in a `.tjs` file. The rules belong to
the file the code is written in, not to the file that calls it. What changes in a `.tjs`
file, and why, is the subject of [Equality and the Footguns TJS Removes](/equality/).

The last line is `NaN` because the TJS plugin compiles only `.tjs` files. `units.ts` goes
through Bun's own TypeScript loader, which erases the types and checks nothing at runtime.
A `.ts` file becomes checked TJS only when you convert it on purpose, with `tjs convert` or
the `fromTS` function (the TypeScript-to-TJS converter, from `tjs-lang/lang/from-ts`).
`tjs run units.ts` does not convert it. Turning TypeScript into TJS is the subject of the
TypeScript book, starting with [Converting a Project](/ts-converting-a-project/).

Mixing dialects is the migration path. Rename one `.js` file to `.tjs`, change the files
that import it to say `./foo.tjs` instead of `./foo.js` (the one edit outside the renamed
file), fix what the stricter rules turn up, and add examples to its functions. Every other
file stays as it was. Each renamed file starts checking its own functions immediately, for
every caller.

If you are writing a tool that accepts all three kinds of file, `dialectForFilename` and
`sourceKindForFilename` from `tjs-lang/lang` encode this table, so your tool and TJS agree
on what an extension means.

## Local modules

[Local Module Imports](/local-module-imports/) is a worked two-file example of everything in
this section, with the tests kept in the module that defines the functions.

### Write the extension

Import a local `.tjs` module by its relative path, extension included:

```javascript
import { add } from './mymath.tjs'   // works
import { add } from './mymath'       // Cannot find module './mymath'
```

This holds everywhere TJS code runs: under Bun, in output from `tjs emit`, and in a browser.
None of them tries `.tjs` when the extension is missing. Bare names (`from 'mymath'`) are for
packages; a project imports its own files by path.

### Compiled output imports `.js`

`tjs emit src/ -o dist/` compiles a directory to JavaScript and rewrites each relative
`./foo.tjs` import to `./foo.js`. Compiling the two files above gives an `app.js` that
begins:

```javascript
import { isMonadicError } from 'tjs-lang/runtime'
import { add } from './mymath.js'
```

The output needs no TJS compiler, and `mymath.js`, which carries its own inline runtime,
needs nothing at all. `app.js` still imports `tjs-lang/runtime`, so it needs the `tjs-lang`
package installed, and in a browser it needs that bare name resolved by a bundler or an
import map. [Running TJS](/running-tjs/#tjs-emit-compile-to-files) has the command and its
options.

### What does not cross a module boundary

Checks travel with a function. Two things are deliberately local to the file that writes them.

**`extend` blocks.** An `extend` block adds methods to literals in its own file, by rewriting
those calls when the file is compiled; it never patches a prototype. A module that imports
from that file gets the values, but not the extension:

<!-- tjs-doc: fragment -->

```tjs:static
// shout.tjs
extend String {
  shout() { return this.toUpperCase() + '!' }
}
export const greeting = 'hello'.shout()

// main.tjs
import { greeting } from './shout.tjs'
console.log(greeting)            // HELLO!
console.log(typeof 'hi'.shout)   // undefined: the extension stayed in shout.tjs
```

To share a helper between files, export an ordinary function.

**The `safety` directive.** `safety none` is a file-level directive: two bare words at the
top of the file, before any code (comments may come first), which the compiler reads and
removes. It turns off validation for the functions that file declares, and only those. It
cannot reach into a module it imports:

<!-- tjs-doc: fragment -->

```tjs:static
// loose.tjs
safety none
import { add } from './mymath.tjs'

function double(n: 0): 0 { return n * 2 }

console.log(double('7'))            // 14: double is not checked
console.log(add('2', 3).message)    // Expected integer for 'mymath.tjs:1:add.a', got string
```

The path in the message reads file, line, function, parameter: parameter `a` of `add`,
declared on line 1 of `mymath.tjs`. Whoever wrote `add` decided it is checked, and no
importer can undo that. [Safety and Validation](/safety-markers/#one-file-safety-none)
covers the directive and its other values.

### Tests run one file at a time

When a tool runs a file's signature examples and `test` blocks, it runs that file by itself,
without loading its imports. So a test or a signature example that calls an imported
function cannot run. It is reported as **inconclusive**, which is neither a pass nor a
failure, and `tjs check` accepts the file.

`tjs emit` is stricter: today it counts an inconclusive test as a failure and does not write
the file. So a module with a typed function that calls an imported helper cannot be emitted
without `--jfdi` ("just do it"). Until that changes, gate on `check` and emit with the flag:

```text
tjs check src/ && tjs emit src/ -o dist/ --jfdi
```

Put the tests for a function in the file that defines it. [Testing](/testing/) explains
inconclusive results and how to test code that depends on imports, and
[Running TJS](/running-tjs/#tjs-emit-compile-to-files) covers the emit behaviour.

### WebAssembly across files

A `wasm function` declared at module scope can be imported by another file and composed into
that file's WebAssembly module, so the two compile to one module and call each other
directly. This is the one place where compiling a file loads another file's code, and today
it happens only when the caller of `tjs()` passes a `ModuleLoader` option. `tjs run`,
`tjs emit` and the Bun plugins do not pass one yet. [Inline WebAssembly](/inline-wasm/)
covers it.

## Running a graph of modules

A single `.tjs` file can be compiled and run on its own. A graph needs something that compiles
each `.tjs` file as it is imported, or a build step that compiles them all first.

### Under Bun

Bun runs a `.tjs` graph directly once it is told how to load `.tjs` files. Put a
`bunfig.toml` beside your code:

```toml
preload = ["tjs-lang/bun-plugin"]

[test]
preload = ["tjs-lang/bun-plugin"]
```

The first `preload` covers `bun` and the imports of a file run with `tjs run`; the `[test]`
one covers `bun test`, which reads only its own section. Then either command runs the
program:

```text
$ bun app.tjs
5
true
$ bunx tjs run app.tjs
5
true
```

Without the preload, Bun reads `mymath.tjs` as if it were JavaScript, finds no exports it can
see, and stops with a message that sends you looking in the wrong place:

```text
SyntaxError: Export named 'add' not found in module '…/mymath.tjs'.
```

The export is there. Add the preload.

As the table at the top of the chapter says, the plugin compiles modules but does not run
their tests, because importing a module should not run its tests. Set `TJS_RUN_TESTS=1` to
make a wrong signature example fail at import time.

### Bundling

`Bun.build` ignores the preload, which is a runtime registration. To bundle a `.tjs` graph,
pass the build plugin from `tjs-lang/bun-build-plugin`:

```javascript
// build.ts — run with: bun build.ts
import { tjsPlugin } from 'tjs-lang/bun-build-plugin'

// With runTests, a failing example makes Bun.build throw, which fails the script.
const result = await Bun.build({
  entrypoints: ['./app.tjs'],
  outdir: './bundle',
  plugins: [tjsPlugin({ runTests: true })],
})
if (!result.success) {
  console.error(result.logs)
  process.exit(1)
}
```

`runTests: true` runs each file's signature examples and tests as it is bundled, so a wrong
example fails the build; inconclusive tests do not. The other option, `sharedPrelude: true`,
gives every module one shared copy of the inline runtime (called the **prelude**) to import,
instead of each carrying its own; [The Runtime](/runtime-configuration/#the-shared-prelude)
explains when that pays off.

Vite, webpack, esbuild and Rollup have no TJS plugin. Compile first with `tjs emit` and give
them the `.js` output, which is ordinary JavaScript with ordinary relative imports.

## npm packages in the browser, with no bundler

In a project, `import { tosi } from 'tosijs'` works because a package manager put `tosijs`
in `node_modules` and a bundler or runtime knows to look there. A browser has neither: it
loads a module only from a URL, and a bare name like `'tosijs'` is not one. That matters for
pages that run code with no build step, such as a playground, a documentation site with live
examples, or a quick prototype.

First, a distinction. Resolving imports and compiling TJS are separate jobs, and a page may
need either, both or neither. `tjs-lang/browser` is the TJS compiler as one self-contained
module, for pages that turn TJS source into JavaScript while they run (see
[Running TJS](/running-tjs/#in-the-browser)). It does not make `import 'tosijs'` work.
`tjs-lang/import-resolver` does, and it knows nothing about TJS: it rewrites and serves
JavaScript modules. A live TJS editor uses both: compile with `tjs-lang/browser`, rewrite the
output's imports, then run it.

### How the resolver works

It has two halves.

**`rewriteImports(source, prefix)`** rewrites each bare specifier to a path on your own
origin. Relative paths, absolute paths and full `http://` or `https://` URLs are left alone:

```javascript
import { rewriteImports } from 'tjs-lang/import-resolver'

rewriteImports(
  `import { tosi } from 'tosijs'
import { add } from './mymath.js'`,
  '/lib/'
)
// import { tosi } from '/lib/tosijs'
// import { add } from './mymath.js'
```

**A service worker** intercepts requests under that prefix, fetches the module from a public
CDN (jsDelivr by default, esm.sh for React), caches it, and serves it back as if it came from
your site. The browser's own module loader does the rest. Which CDN serves which package,
and the `jsdelivr/`, `esmsh/`, `unpkg/` and `github/` hints that override it, are listed in
[Playground Imports](/playground-imports/).

`rewriteImports` works on the text with a pattern, not a parser, which gives it these limits:

- it rewrites static `import` and `export … from` statements, not dynamic `import('pkg')`;
- an `import … from '…'` written inside a string or a comment is rewritten too;
- an import that names a binding containing `$`, such as `import { $x } from 'pkg'`, is
  silently left unrewritten;
- URL schemes other than `http:` and `https:`, such as `data:`, are rewritten as if they
  were package names.

### A security note

The resolver downloads code from public CDNs and runs it in your page, with your origin's
privileges. That is its purpose: it is a tool for playgrounds and documentation systems,
where readers run examples that import packages. Do not install it on an origin where running
unvetted npm code is unacceptable. For an application you ship, install packages and bundle
them, or compile ahead of time and serve the files.

### Setting it up

A service worker is origin-scoped: the browser will not register one from a CDN. Copy
`node_modules/tjs-lang/dist/import-resolver-worker.js` (exported as
`tjs-lang/import-resolver/worker`) to the root of your site.

On a page's first visit no service worker controls it yet, so nothing would be intercepted.
`registerImportResolver` therefore installs the worker, reloads the page once, and resolves
to `false`. It also resolves to `false` when service workers are unavailable or registration
fails, and to `true` once the worker is in control. Run nothing until it says `true`:

```javascript
import {
  registerImportResolver,
  rewriteImports,
} from 'tjs-lang/import-resolver'

const ready = await registerImportResolver({ prefix: '/lib/' })
if (ready) {
  const script = document.createElement('script')
  script.type = 'module'
  script.textContent = rewriteImports(exampleSource, '/lib/')
  document.body.append(script)
}
```

Use the same prefix on both sides; both default to `'/tfs/'`. The configuration reaches the
worker as a query string on its URL, so the worker always routes the prefix your page
rewrites to.

The rewritten code runs as an inline `<script type="module">`, whose base URL is the page,
so `/lib/tosijs` resolves against your origin and the worker sees the request. A `blob:` URL
does not work: `/lib/…` cannot be resolved against it.

The [Unbundled](/tjs-unbundled/) gallery shows bare imports used this way:
[React Todo (Comparison)](/react-todo-comparison/), [tosijs Todo App](/tosijs-todo/) and
[CDN Hints](/cdn-hints/).

## One runtime across modules

Every compiled file carries its own inline runtime, so every file works alone. Two questions
follow: do errors still work across files, and how does one setting reach every module?

### Errors already work across files

`isMonadicError` recognises an error returned by any TJS module, compiled by any copy of
tjs-lang. The inline runtimes share one error class through a global slot, so an error made
in `mymath.tjs` is recognised in `app.tjs`. Nothing needs installing for that; the design is
in [Runtime fusion](/runtime-fusion/).

### Settings need the shared runtime, installed first

What the inline runtimes do not give you is one place for settings. For a single
`configure()` that every module obeys, and one **error history** (the list of recent type
errors that `__tjs.errors()` returns, for the whole program), install the shared runtime
with `installRuntime()` from `tjs-lang/runtime`.

The settings reach every module whenever it loaded, so `configure()` can go anywhere. One
thing does depend on order: a module evaluated before the shared runtime is installed uses
its inline helpers, which cannot attach a call stack. So install the runtime in a module of
its own and import it first:

```javascript
// setup-tjs.js
import { installRuntime, configure } from 'tjs-lang/runtime'
installRuntime()
configure({ logTypeErrors: true })
```

```javascript
// main.js
import './setup-tjs.js' // first, so it runs before mymath.tjs is evaluated
import { add } from './mymath.tjs'

add('2', 3)                        // logs: [TJS TypeError] Expected integer for 'mymath.tjs:1:add.a', got string
console.log(__tjs.errors().length) // 1
```

Installed in `main.js` itself, after the imports, the runtime still receives `mymath.tjs`'s
errors and its `logTypeErrors` setting applies, but `callStacks` does not reach
`mymath.tjs`, which was evaluated first. `tjs run` and the Bun preload install the runtime
for you, but not your settings. [The Runtime](/runtime-configuration/#when-settings-reach-a-module)
has the details.

## Summary

- A `.tjs` file is an ES module. An exported function keeps its checks and its `__tjs`
  metadata, so no caller in another file can skip them.
- `tjs check`, `tjs test` and `tjs emit` run signature examples; `tjs run` and the Bun plugin
  do not unless asked.
- A file with a typed function has `isMonadicError` ambiently; a file without one imports it
  from `tjs-lang/runtime`.
- The extension picks the language: `.tjs` is TJS, `.js` is JavaScript exactly, `.ts` is
  TypeScript, erased and unchecked unless you convert it. One graph can mix them, which is
  how a project moves over a file at a time.
- Write `.tjs` in relative imports. Compiled with `tjs emit`, they become `.js`.
- `extend` blocks and `safety` stay in the file that writes them. Tests run per file, so a
  test that needs an import is inconclusive, and `tjs emit` needs `--jfdi` for that file.
- Bun runs a graph with the `tjs-lang/bun-plugin` preload; `Bun.build` uses `tjsPlugin`;
  other bundlers take `tjs emit` output.
- In a page with no bundler, `tjs-lang/import-resolver` resolves bare npm imports through a
  service worker and public CDNs. It runs CDN code, so keep it to playgrounds and docs.
- Errors work across modules with no setup. For one configuration and one error history,
  install the shared runtime in a module imported first.
