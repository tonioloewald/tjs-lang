<!--{"parent": "the-tjs-language.md", "order": 100}-->
<!-- TODO review -->

# The Runtime

Every chapter so far has said "TJS checks this at runtime". This one is about what does the
checking: which code is running when a `.tjs` function refuses an argument, where the
refused calls are recorded, and how to change what happens when a check fails.

Four terms, used exactly this way for the rest of the chapter:

- **The inline runtime** is the small set of helpers the compiler writes into every emitted
  file: the error class, the function that builds a type error, and whatever else that file
  needs. It is always there.
- **The full runtime** is the library, `tjs-lang/runtime`. It has everything the inline
  runtime has and more: an error history, settings, and the complete type machinery.
- **The shared runtime** is the full runtime installed on `globalThis.__tjs`, where every
  TJS module in the program can find it. Your program installs it, or does not.
- **The prelude** is the inline runtime's code published as a module you can import, so that
  a bundle can contain one copy instead of one per file. It is a size option, not a
  different runtime.

The chapter takes them in that order and ends with a table of which to use when.

(The AJS virtual machine has a runtime of its own, with fuel, capabilities and timeouts. It
is a different thing entirely and has nothing to do with this chapter; see the
[AJS book](/ajs/) and [Embedding the VM](/embedding-the-vm/).)

## The inline runtime

Save one small function as `greet.tjs`:

```tjs:inline
export function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}
```

The JavaScript that `tjs emit greet.tjs` writes starts like this (lines cut short, and `…`
where lines are left out):

```javascript
const __tjs_rt = (() => {
const MonadicError=(globalThis.__tjs_MonadicError_1??=class MonadicError extends Error{…});
function typeError(p,e,v,r,o){…}
function isMonadicError(v){return v instanceof Error&&v.name==='MonadicError'&&'path' in v};
function pushStack(n){…}function popStack(){…}function getStack(){…};
…
return {MonadicError,typeError,isMonadicError,pushStack,popStack,getStack,__xv,__tv};
})();
…
const __tjs = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? {typeError:__tjs_rt.typeError, …};

export function greet(name) {
  __tjs.pushStack('greet.tjs:1:greet');
  const __cv_name = __tjs_rt.__tv(name);
  if (typeof __cv_name !== 'string') { return __tjs.typeError('greet.tjs:1:greet.name', 'string', __cv_name); }
  return `Hello, ${name}!`
  …
}
```

Reading it from the top:

- **`const __tjs_rt = …`** is the inline runtime: an object holding the helpers this file
  uses and nothing else. The whole file is about 3.6 KB (1.5 KB gzipped), nearly all of it
  this block. A file that declares types or uses `==` gets the helpers for those as well.
  (`__tv` unwraps a value held in tosijs's reactive state, which arrives wrapped in a proxy,
  so the check sees the real value. You can ignore it.)
- **`const __tjs = …`** decides, once, which helpers this module reports errors through. If
  a shared runtime is installed and speaks the interface this compiler expects (`abi` is the
  runtime's interface version), the module asks it for an instance of its own with
  `createRuntime()`. Otherwise it uses the inline helpers.
- **`__tjs.pushStack(…)`** notes that `greet` was entered, for the optional call-stack
  feature described under [`configure()`](#configure). With only the inline runtime it writes
  the name into a fixed 64-slot ring buffer (a list that keeps the last 64 entries and
  overwrites the oldest), which is a single array write that nothing reads. With a shared
  runtime it does nothing unless call stacks are turned on.
- **`__tjs.typeError(…)`** builds the error the function returns. Its first argument is the
  error's **path**, which says where the check is: `file:line:function.parameter`, here line
  1 of `greet.tjs`, function `greet`, parameter `name`.

Because the runtime travels inside the file, the output runs in Node, Bun, a browser or any
bundler with no setup and without tjs-lang installed:

```text
$ node -e "import('./greet.js').then(m => console.log(m.greet(42).message))"
Expected string for 'greet.tjs:1:greet.name', got number
```

[Running TJS](/running-tjs/#what-emitted-javascript-looks-like) walks through the rest of an
emitted file: the checks, and the signature metadata after each function.

### It is not a fallback

Your function reports errors through `__tjs`, which is the shared runtime when one is
installed and the inline helpers otherwise. So it is tempting to think of the inline runtime
as the fallback, used only when the real one is missing.

For error reporting that is right. For **declarations** it is not. A `Type`, `Generic`,
`Enum`, `Union` or `FunctionPredicate` in a `.tjs` file is built by calling the file's own
`__tjs_rt` (`__tjs_rt.Type('Age', …)`), never through `__tjs`. The inline version always
builds it, even on a page that has the full runtime installed. The inline runtime is the
shipped behaviour of every declaration.

You can see which code answers by asking a type for its example. The library's `Type` keeps
it as `.example`; the inline one keeps it under another name:

```tjs:inline
Type Age 30

console.log(Age.check(30), Age.check('thirty'))   // true false
console.log(Age.example)                          // undefined
console.log(globalThis.__tjs !== undefined)       // true: the full runtime is installed
```

This page has the full runtime installed, and `Age` still came from the inline runtime. The
same declaration made with the library gives the example back:

```javascript
import { Type } from 'tjs-lang/runtime'

Type('Age', 30).example // 30
```

Why not let emitted code switch to the library's `Type` when it is available? Because a
type's behaviour would then depend on whether some other module happened to install a
runtime first. Load order must not change what a type does, so the file's own copy always
answers.

That leaves the two implementations to keep in step, and they are not fully there. For a
correctly declared type, both accept the same values. They differ in what a type exposes
(`.example`, as above), in what a failed `FunctionPredicate` check returns (the library gives
a reason, the inline one `false`), and in malformed declarations: `Type('Anything')`, with
no example and no predicate, throws in the library and produces a type that accepts
everything in the inline runtime. These are gaps, not design. The library's behaviour is the
intended one, and bringing the inline runtime into line is tracked on the project board
([#2108](https://virta.tosijs.net/?2108)).
[Declarations](/declarations/#declared-in-the-file-or-imported-from-the-library) shows the
differences you can observe, and [Type identity](/type-identity/) is the full map, kept
honest by a test.

The rule to take away: **a declaration in a `.tjs` file behaves the same whatever else is
loaded.** Nothing in the rest of this chapter changes what a type accepts.

## The shared runtime

A TJS function that refuses an argument returns an error instead of throwing it (see
[Errors as Values](/errors-as-values/)), and a returned error that nobody looks at
disappears. The full runtime's answer is the **flight recorder**: a bounded history of every
type error, kept whether or not the caller looked at the error, that you can read afterwards.

The inline runtime has no flight recorder. A program with no shared runtime returns its
errors as usual, but records them nowhere you can query. Installing a shared runtime gives
the whole program one recorder.

This book's pages install it, so this example runs here as written:

```tjs:inline
const shared = globalThis.__tjs
console.log('shared runtime installed:', shared !== undefined)

function double(n: 0): 0 {
  return n * 2
}

shared.clearErrors()
double('two')   // the result is ignored...
double(1.5)     // ...and so is this one
console.log(shared.errors().map(e => e.expected + ', got ' + e.actual))
```

It prints:

```text
shared runtime installed: true
[ "integer, got string", "integer, got number" ]
```

Both refused calls were ignored by the code that made them, and both are in the record. Each
entry is the `MonadicError` the call returned, which carries the `path` of the failed check,
the type it `expected` and the kind of value it got (`actual`). (`got number` for `1.5`
means a number that is not an integer.)

### Installing it

The examples in the rest of this chapter use one small module, `price.tjs`:

```tjs:inline
Type Price 9.99

export function total(price: Price, qty: 0):! 0.0 {
  return price * qty
}
```

`price` must be a number (a `Price`), `qty` an integer. In your own program, install the
shared runtime with `installRuntime()` from `tjs-lang/runtime`, then load the TJS modules:

```javascript
// main.js
import { installRuntime } from 'tjs-lang/runtime'
installRuntime()

// A dynamic import, so price.js loads after installRuntime(): see "When settings reach a module".
const { total } = await import('./price.js')
total('9.99', 2)
total(9.99, 2.5)
__tjs.errors().map((e) => e.path)
// [ 'price.tjs:3:total.price', 'price.tjs:3:total.qty' ]
```

`installRuntime()` puts the full runtime on `globalThis.__tjs`. It is safe to call twice.
If two copies of tjs-lang are loaded (two dependencies that each bring their own), the newer
version wins, with a console warning when the two versions are incompatible.
`globalThis.__tjs = createRuntime()` also works, but see the note at the end of
[`configure()`](#configure).

`tjs run`, the Bun preload (`tjs-lang/bun-plugin`) and this book's pages install it for you.

### What it adds, and what it does not change

It adds two things:

- **One flight recorder for the process.** Each module that loads after the install still
  gets its own runtime instance from `createRuntime()`, with its own error list and its own
  copy of the settings. One module clearing its errors, or turning on call stacks for
  itself, does not affect another. But every instance copies what it records into the
  shared one, so `globalThis.__tjs.errors()` and `globalThis.__tjs.records()` see the whole
  program. What gets recorded, and how to read it, is in
  [Errors as Values](/errors-as-values/#the-flight-recorder).
- **Settings.** `configure()`, below, changes how type errors are reported. The inline
  runtime has no settings of its own, so without a shared runtime there is nothing to
  configure.

It does not change two things:

- **What declarations accept.** That is the inline runtime's job, as above.
- **`isMonadicError`.** It recognises an error from any TJS module compiled by any copy of
  tjs-lang, with or without a shared runtime:

  ```javascript
  import { isMonadicError } from 'tjs-lang/runtime'
  import { total } from './price.js'

  isMonadicError(total('9.99', 2)) // true, no installRuntime() needed
  ```

  Every module's inline runtime claims the same error class through one global slot (the
  `globalThis.__tjs_MonadicError_1 ??=` in the listing above), so an error from one file is
  an instance of the class every other file checks for.
  [Runtime fusion](/runtime-fusion/) explains what may be shared between modules this way,
  and what may not.

### `configure()`

`configure()` changes how the shared runtime reports type errors. Import it from
`tjs-lang/runtime` (it is not in `tjs-lang/lang`):

```javascript
import { installRuntime, configure } from 'tjs-lang/runtime'

installRuntime()
configure({ logTypeErrors: true })
```

It can run before or after `installRuntime()`; both act on the same settings. What matters is
that both run before your TJS modules load, for the reasons in the next section. Calls merge:
`configure({ callStacks: true })` leaves the other settings as they were. The settings you
will use:

**`logTypeErrors: true`** prints each type error to the console as it happens, with
`console.error`:

```text
[TJS TypeError] Expected Price for 'price.tjs:3:total.price', got string
```

The error is still returned as usual. Use it when you want to see refused calls without
writing code to look for them.

**`throwTypeErrors: true`** throws each type error instead of returning it. The thrown value
is the same `MonadicError`. This exists for a debugger's "pause on exceptions": with it on,
the debugger stops at the call that failed instead of somewhere downstream where the error
was finally noticed. It **changes your program's behaviour**: code that checks the returned
error never sees it, and a refused call now unwinds the stack. Use it while debugging, never
in production.

**`callStacks: true`** adds a `callStack` to every error, listing the TJS functions entered
before it, ending with the one whose check failed. With this `app.tjs`:

```tjs:inline
export function inner(n: 0):! 0 {
  return n
}

export function outer(n: 0):! 0.0 {
  return inner(n + 0.5)
}
```

`outer(1)` passes `1.5` to `inner`, which wants an integer:

```javascript
outer(1).callStack // [ 'app.tjs:5:outer', 'app.tjs:1:inner' ]
```

An error's `path` says where the check failed; `callStack` says how the program got there.
It adds work to every call, not only to failing ones (roughly doubling the cost of a call),
so turn it on while debugging.

Read it as a log of the last 64 functions entered, not as an exact stack. A function that
returns normally is not removed from the list: the emitted code does not wrap each function
in a `try`/`finally` to remove it, which would cost every call, and the fixed-size ring
makes a missed removal harmless. So if `outer(1)` fails, then `inner(2)` and `inner(3)`
succeed, and then `outer(1)` fails again, the second error's `callStack` lists all six
calls, oldest first, not only the last two.

**`trackErrors: false`** turns the flight recorder off. It is on by default and costs nothing
until a check fails, because recording happens only on the error path. The recorder keeps
the latest 64 records; the `maxErrors` setting changes that number. There is rarely a reason
to turn it off.

The settings type lists a few more, none of which you need for compiled `.tjs` code:

- `maxStackSize` is the size of the call-stack ring (default 64). A module's instance reads
  it when the module loads.
- `debug` is an older name with the same effect as `callStacks`.
- `safety` applies only to functions wrapped at runtime with the library's `wrap(fn, meta)`,
  which adds checks to an ordinary function from its signature metadata. Compiled `.tjs`
  code has its checks written into the output when it is compiled; see
  [Safety and Validation](/safety-markers/) for how to control those.
- `requireReturnTypes` is declared but currently has no effect.

### When settings reach a module

This is the part people get wrong. Whether a setting reaches a module depends on when the
module loaded, because of two mechanisms in the listing above:

- The `const __tjs = …` line runs **once, when the module is evaluated**. A module that
  loads after the shared runtime is installed gets an instance from `createRuntime()`, and
  that instance **copies the settings as they are at that moment**. A later `configure()`
  changes the shared runtime's settings, not the copy.
- A module that loaded before any shared runtime existed uses the inline helpers. The inline
  `typeError` looks for `globalThis.__tjs` **each time it reports an error**, records the
  error there if it finds one, and reads `logTypeErrors` and `throwTypeErrors` from it. It
  has no way to attach a call stack, so `callStacks` cannot reach it.

That gives three cases:

| The TJS module loaded… | Errors recorded in the shared runtime | `logTypeErrors`, `throwTypeErrors` | `callStacks` |
| --- | --- | --- | --- |
| before `installRuntime()` | yes | yes: read when each error happens | no |
| after `installRuntime()`, before `configure()` | yes | no: the module kept the settings from before the call | no |
| after both | yes | yes | yes |

The middle row is the surprise: a module loaded before the install picks up a later
`configure()`, and a module loaded after the install does not. Only the last row gets
everything, so install and configure first.

A static `import` is evaluated before any code in the importing file runs, even code written
above it. So this puts `price.js` in the first row, not the last:

```javascript
// Wrong: price.js is evaluated before installRuntime() runs.
import { installRuntime, configure } from 'tjs-lang/runtime'
import { total } from './price.js'

installRuntime()
configure({ callStacks: true })
total('9.99', 2).callStack // undefined
```

There are two correct shapes. Load the TJS modules with `await import()` after installing,
as in `main.js` above, or install and configure in a module of its own and import that
first:

```javascript
// configure-tjs.js
import { installRuntime, configure } from 'tjs-lang/runtime'
installRuntime()
configure({ callStacks: true })
```

```javascript
// main.js
import './configure-tjs.js' // must be the first import
import { total } from './price.js'
```

Imports are evaluated in order, so `configure-tjs.js` finishes before `price.js` starts.

### Configuring too late

When `configure()` runs after a module has already taken its copy of the settings (the
middle row), the runtime says so instead of failing silently:

```text
TJS: configure() was called after a converted module already captured the runtime —
the change will NOT reach modules that already evaluated (their config was snapshotted
at import). Configure before importing converted modules (e.g. an import-order-first
`configure-tjs` module). See https://github.com/tonioloewald/tjs-lang/issues/23
```

"Converted module" here means any module emitted by TJS, including the `.tjs` modules this
chapter is about, and the `configure-tjs` module it suggests is the one shown above. The
warning is printed once per process: a second late `configure()` prints nothing, and
reaches the already-loaded modules no better than the first.

You will see it if you call `__tjs.configure({ … })` on a page that already has the runtime
and its modules loaded, such as this one. Modules loaded after the call get the new
settings; the ones already loaded keep the old.

Prefer the imported `configure` to `__tjs.configure`. After `installRuntime()` they are the
same function. After `globalThis.__tjs = createRuntime()` they are not: `__tjs.configure`
then changes only that one instance, and modules loaded afterwards do not inherit it. The
imported `configure` works with either form.

## The shared prelude

The prelude is about size, not behaviour. Every emitted file carries its inline runtime, so
a bundle of forty `.tjs` modules carries forty copies of nearly the same code. With the
**shared prelude**, the inline runtime is compiled once and every module imports it.

From code, pass `prelude: 'import'` to `tjs()`:

```javascript
import { tjs } from 'tjs-lang/lang'

const { code } = tjs(source, { filename: 'greet.tjs', prelude: 'import' })
```

The output starts with an import instead of the inline block:

```javascript
import { createPrelude as __tjs_createPrelude } from 'tjs-lang/prelude';
const __tjs_rt = __tjs_createPrelude('3d173a14852f9275');
```

The argument is a hash of the exact prelude the compiler built; the value shown is an
example, and it changes whenever a tjs-lang release changes the inline runtime. "What it
costs", below, explains why it is there.

With `Bun.build`, the build plugin does it for every module:

```javascript
import { tjsPlugin } from 'tjs-lang/bun-build-plugin'

await Bun.build({
  entrypoints: ['./src/main.tjs'],
  outdir: './bundle',
  plugins: [tjsPlugin({ sharedPrelude: true })],
})
```

`createPrelude` is a factory, so the bundle contains its code once and each module still calls
it for an instance of its own. Nothing one module does to its runtime state (for example what
its `extend` blocks register) can reach another. `tjs emit` does not offer this option,
because files emitted one at a time are often published, which a prelude-built file must not
be (see below).

### What it costs

- **It usually does not shrink the gzipped bundle.** The shared copy contains every inline
  helper, because it cannot know which ones the modules will need, and compression had
  already folded the near-identical inline copies together. What it buys is a smaller raw
  bundle on projects with many modules (less to parse) and one runtime to step through in a
  debugger. Measure before you turn it on:

  | Project | Shared prelude, against inline |
  | --- | --- |
  | two files ([Running TJS](/running-tjs/#bundling-with-bunbuild)) | larger: about 32 KB against 11 KB |
  | seven modules | raw bundle 30% smaller; gzipped size unchanged |

- **It is locked to the compiler that produced it.** A module compiled by a different
  tjs-lang refuses to load, because its hash does not match the installed prelude:

  ```text
  Error: tjs-lang/prelude: this module was compiled against prelude 0000000000000000,
  but the installed tjs-lang provides 3d173a14852f9275. Rebuild it with the installed
  tjs-lang, or emit it with prelude: "inline".
  ```

  So use it only for a bundle built in one go, by one tjs-lang. Never publish files compiled
  this way in a library: they would only work with the exact tjs-lang version you built
  with.

### It is not the shared runtime

The two are easy to confuse, so to be explicit:

| | Shared prelude | Shared runtime |
| --- | --- | --- |
| What it is | the inline runtime's code, one copy per bundle | the full `tjs-lang/runtime`, on `globalThis.__tjs` |
| Turned on by | `prelude: 'import'` or `sharedPrelude: true`, at build time | `installRuntime()`, at startup |
| Changes behaviour? | no: it is the same code the inline runtime would have been | adds the flight recorder and the `configure()` settings |
| Declarations built by | the prelude | still the inline runtime (or the prelude) |

They are independent. A bundle can use either, both or neither.

One runtime shared by many separately published TJS libraries is a different problem again,
and is not shipped. [Shared runtime](/shared-runtime/) is a proposal for after 1.0: a small
runtime package versioned by its shape and taken as a peer dependency.

## Which to use when

| Situation | Use | Why |
| --- | --- | --- |
| Publishing a library | the inline runtime (the default) | consumers need no setup and no matching tjs-lang version |
| An app or a test suite that wants one error history | `installRuntime()` at startup, before TJS modules load | one `__tjs.errors()` for the whole program |
| A large bundle of many TJS modules | measure `sharedPrelude: true` | smaller raw bundle when there are many modules; larger when there are few |
| Debugging a refused call | `configure({ throwTypeErrors: true })` or `configure({ callStacks: true })` | stop at the failing call, or see how the program got there |
| Seeing refused calls without stopping | `configure({ logTypeErrors: true })` | every type error on the console |
| Production | the defaults, with `trackErrors` left on | recording costs nothing until something fails |

This is the last chapter of the language part. The [TJS Syntax Reference](/TJS-SYNTAX/) has
every construct in one place, for looking things up from here on.
