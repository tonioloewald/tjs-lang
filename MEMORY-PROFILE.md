# TJS Memory Profile

Measured: 2026-07-14
Platform: MacBookPro18,2 (M1 Pro), 32GB, darwin arm64
Runtimes: Bun 1.3.14, Node v22.22.1
TypeScript: 5.8.2
Corpus: `tosijs-ui/src` — 122 `.ts` files, 36,685 lines (icons/data excluded)

## Why this exists

Prompted by a machine-killing OOM (three runaway `bun` processes, ~210GB of
footprint, force power-off) and the follow-on question: _tjs leans on the
TypeScript compiler — does it inherit tsserver's memory profile?_

Short answer: **no.** tjs's memory is bounded, it plateaus, and over a whole
project it lands at roughly **half** of `tsc`'s footprint. Nothing here argues
against a resident tjs language server.

The longer answer includes a methodology trap that produced exactly the wrong
conclusion on the first pass — see [Measuring this correctly](#measuring-this-correctly).

## What tjs actually calls

`src/lang/emitters/from-ts.ts` imports `typescript` and uses **`ts.createSourceFile`**
and **`ts.transpileModule`** — the parser and the emitter. It never calls
`ts.createProgram` and never instantiates a type checker.

That is the whole reason the numbers below look the way they do. `tsc --noEmit`
and `tsserver` are heavy because `createProgram` + the checker load every file in
the program _plus every `.d.ts` in `node_modules`_, then materialise a symbol and
type graph over all of it and hold it resident — memory grows with the size of the
program. `transpileModule` is single-file and syntax-only, so tjs's memory is
governed by the largest file it has seen, not by the size of the project.

## Results

### Whole corpus, one process (the language-server question)

`fromTS()` over all 122 files, forced GC between each, RSS sampled every 40 files.

| runtime  | baseline | after 40 | after 80 | after 122  | growth     |
| -------- | -------- | -------- | -------- | ---------- | ---------- |
| **bun**  | 97 MB    | 195 MB   | 215 MB   | **222 MB** | +125 MB    |
| **node** | 144 MB   | 170 MB   | 179 MB   | **185 MB** | **+41 MB** |

Both converge (bun's last-40 delta: +7MB; node's: +7MB, on a much lower base).
122/122 files converted OK under both runtimes.

For comparison, on the same corpus:

|                                                   | peak RSS   |
| ------------------------------------------------- | ---------- |
| `tsc --noEmit`, whole project, full type checking | **397 MB** |
| tjs `fromTS()`, whole project, under bun          | 222 MB     |
| tjs `fromTS()`, whole project, under node         | 185 MB     |

**tjs holding the entire project costs about half of what `tsc` costs to check it
once** — while doing less analysis, which is the expected trade, not a surprise.

### The bun-vs-node allocator difference

Control: the **real TypeScript compiler only, no tjs code at all**. 100 identical
`createSourceFile` + `transpileModule` calls on one 1,930-line file, forced GC each
round.

| runtime  | baseline | after 20 | after 40 | after 60 | after 100 | settles at   |
| -------- | -------- | -------- | -------- | -------- | --------- | ------------ |
| **node** | 117 MB   | 164 MB   | 165 MB   | 166 MB   | 167 MB    | ~40 calls    |
| **bun**  | 89 MB    | 210 MB   | 226 MB   | 230 MB   | 233 MB    | ~60–80 calls |

Both **plateau** — this is not an unbounded leak. But bun's steady state is ~40%
higher than node's for identical work, and it takes roughly twice as many
iterations to settle. The same ratio shows up in the whole-corpus run above
(bun retains 3× node's incremental memory).

Bun starts lower (89MB vs 117MB) and ends higher (233MB vs 167MB). If you only
watch the floor, bun looks leaner; under sustained allocator churn it isn't.

This is consistent with — though **not the same bug as** — [oven-sh/bun#34053](https://github.com/oven-sh/bun/issues/34053)
(`Bun.build` strands native memory; freed but never purged back to the OS by
mimalloc). That one is unbounded and monotonic; this is bounded. What makes the
control interesting is that it is a **pure-JS workload** — no `Bun.build`, no
`Bun.Transpiler`, no bundler — reproducing a bun-vs-node watermark difference in
~15 lines. If upstream disputes the scope of the fix, this is a hard artifact to
argue with.

## Speed (bun vs node)

The usual model — _bun is bigger because it does more natively and runs faster_ —
broadly holds, but the magnitudes on this workload are modest. Note that the
TypeScript compiler is **pure JavaScript**, so this is really JSC vs V8; it does not
exercise the native APIs (file I/O, HTTP, bundler) where bun's advantage is largest.
This is the slice least favourable to bun's design, and it still wins.

JIT warmed, no forced GC:

| workload                                               | node                             | bun                              |                                         |
| ------------------------------------------------------ | -------------------------------- | -------------------------------- | --------------------------------------- |
| TS compiler, 100× parse+transpile of a 1,930-line file | 14.5 ms/call, 285 MB             | 13.4 ms/call, 371 MB             | bun **8% faster**, **30% more** memory  |
| tjs `fromTS()` over 122 files / 36,500 lines           | 559 ms — 65.2k lines/sec, 256 MB | 461 ms — 79.2k lines/sec, 292 MB | bun **21% faster**, **14% more** memory |

So the trade is real and it is in bun's favour, but it is 8–21% of speed for
14–40% of memory — not a rout in either direction.

### Startup is where bun actually wins — and we are throwing it away

|                           | ms/launch (empty script, 10 runs) |
| ------------------------- | --------------------------------- |
| node, any cwd             | 27 ms                             |
| bun, neutral cwd          | **11 ms**                         |
| **bun, inside this repo** | **33 ms**                         |

Bun starts **2.5× faster than node** — and inside `tjs-lang` it starts _slower than
node_, because `bunfig.toml` sets:

```toml
preload = ["./src/bun-plugin/tjs-plugin.ts"]
```

That preload cost ~22ms on **every `bun` invocation in this repo** — every `bun
test`, every CLI run, every agent-spawned build. It converted bun's single biggest
structural advantage into a deficit.

This matters more than it looks: the OOM incident that prompted this document
involved five concurrent agent sessions spawning bun processes continuously. At that
volume, 22ms of avoidable startup on every process is not a rounding error.

**Now fixed — see [the preload tax](#startup-the-preload-tax-fixed-and-it-was-half-the-launch-cost) below.**

## `transpileModule` is called per _statement_, not per file (verified)

The earlier hypothesis is now a **finding**. Instrumented by aliasing the compiler
(see the corrected gotcha below), `fromTS()` makes one `createSourceFile` call per
file — and then one `ts.transpileModule` call **per top-level statement and per class
member**:

| file                 | lines | `createSourceFile` | `transpileModule` |
| -------------------- | ----- | ------------------ | ----------------- |
| `markdown-viewer.ts` | 197   | 1                  | 14                |
| `babylon-3d.ts`      | 469   | 1                  | 15                |
| `rich-text.ts`       | 495   | 1                  | 38                |
| `data-table.ts`      | 1,930 | 1                  | **89**            |

The call sites are `for (const member of node.members)` in `transformClassToTJS`
(`from-ts.ts:1745`) and `for (const statement of sourceFile.statements)` (`:2503`),
plus one whole-file call at `:2867`.

**It costs about 2× on wall clock.** `transpileModule` has a ~0.2 ms floor _per call,
regardless of input_ — an empty string costs the same as a ten-line method body,
because each call constructs a fresh compiler host, source file and emit pipeline:

| input to `transpileModule` | cost     |
| -------------------------- | -------- |
| `''` (empty string)        | 0.208 ms |
| `const x = 1`              | 0.170 ms |
| a 10-line method body      | 0.199 ms |
| a 100-line method body     | 0.591 ms |

So on `data-table.ts`, 89 calls spend **~18 ms of pure fixed overhead** before
transpiling a character. Measured end to end:

|                                             | `data-table.ts` (1,930 lines) |
| ------------------------------------------- | ----------------------------- |
| `fromTS()` total                            | 60.0 ms                       |
| …of which inside `transpileModule`          | 42.8 ms (**71%**)             |
| one `transpileModule` over the _whole file_ | 13.9 ms                       |

Across five corpus files, **70–81% of `fromTS` wall time is inside
`transpileModule`**, and the fragmented calls cost **~3× what a single whole-file
call costs**. That is the headroom: fixing the fragmentation should roughly halve
`fromTS`, moving it from ~79k lines/sec to ~150k under bun. The memory shape follows
the same curve — 89 compiler contexts per file is where the ~130–150 KB/line of
transient peak is going.

Not urgent (it is transient and reclaimed, and does not threaten a resident server),
but it is the single biggest lever on transpile speed, and it is entirely ours.

## Startup: the preload tax (fixed), and it was half the launch cost

Confirming the measurement above (34 ms in-repo vs 11 ms neutral), the cause is that
`src/bun-plugin/tjs-plugin.ts` does `import { tjs } from '../lang'` at module scope —
eagerly loading the **entire transpiler** (parser, emitters, linter, wasm, acorn)
on every `bun` invocation in this repo, purely to register an `onLoad` hook that most
invocations never fire. (It does _not_ drag in the TypeScript compiler — `src/lang/index.ts`
deliberately withholds `fromTS` — so this is the transpiler's own weight.)

**Fixed.** The import now happens inside the `onLoad` callback
(`const { tjs } = await import('../lang')`), which recovers half the startup:

|                                    | ms/launch (empty script, 10 runs) |
| ---------------------------------- | --------------------------------- |
| old plugin (eager `../lang`)       | 34 ms                             |
| **lazy `../lang` inside `onLoad`** | **18 ms**                         |
| no preload at all (floor)          | 12 ms                             |

This is a saving _per invocation_, on every `bun` command run in this repo. It defers
the transpiler rather than adding work: a run that does import a `.tjs` file pays the
same total, just later.

The residual 6 ms is `installRuntime()` + the runtime module, which must stay eager:
emitted `.js` captures `globalThis.__tjs` at top level, so it has to exist before any
emitted module evaluates.

## Measuring this correctly

**Peak RSS of a short-lived, one-file-per-process CLI run is a bad proxy for what a
long-lived process retains.** It measures runtime startup plus the allocator's
high-water mark, not accumulation.

The first pass at this measured `tjs convert <file>` per-process peak RSS and
concluded tjs was _15–20× heavier per line than tsc_ and would need ~5GB to hold a
37k-line project resident. **Both conclusions were wrong.** The fixed floor was
doing almost all the work:

|                                                | peak RSS |
| ---------------------------------------------- | -------- |
| bun, empty script                              | 23 MB    |
| bun + TypeScript compiler loaded, nothing else | 91 MB    |
| `tjs convert`, a **1-line** file               | 118 MB   |
| `tjs convert`, one 1,929-line file             | 337 MB   |

That 337MB looks alarming until you notice 118MB of it is present before any real
work happens, and that none of it is _retained_ — the in-process run above shows
the whole 36,685-line corpus adding only 125MB (bun) / 41MB (node) on top of the
same floor.

To measure retention, do what the `Bun.build` investigation did: **call it
repeatedly in one process, force GC, and watch whether RSS plateaus.** And run it
long enough — at 20 iterations bun's curve still looked monotonic; the plateau only
became visible around 60–80.

## Reproducing

Retention, whole corpus, one process (swap `bun` for `node` after bundling
`from-ts` with `--target=node --external typescript`):

```ts
import { fromTS } from './src/lang/emitters/from-ts.ts'
const rss = () => process.memoryUsage().rss / 1e6
Bun.gc(true)
const base = rss()
for (const file of files) {                    // 122 .ts files
  fromTS(readFileSync(file, 'utf8'), { filename: file })
  Bun.gc(true)                                 // prove it is not GC slack
}
console.log(`growth: +${(rss() - base).toFixed(0)} MB`)
```

The bun-vs-node control (no tjs code — pure TypeScript compiler):

```js
const ts = require('typescript/lib/typescript.js')   // NB: bypass the CDN shim
const src = readFileSync('some-2k-line-file.ts', 'utf8')
for (let i = 0; i < 100; i++) {
  const sf = ts.createSourceFile('x.ts', src, ts.ScriptTarget.ESNext, true)
  ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ESNext } })
  void sf.statements.length
  gc()
}
```

Run under both runtimes and compare final RSS.

**Gotcha (corrected).** An earlier draft of this document blamed the zero-call
instrumentation result on the CDN shim, claiming `bunfig.toml` aliases `typescript`
to `src/lang/ts-cdn-shim.ts`. **It does not.** `bunfig.toml` aliases only `tjs-lang`;
the shim is applied by an _esbuild_ alias in `scripts/build.ts:124`, and only for the
`tjs-browser-from-ts` target. In-repo under bun, `from-ts.ts` gets the real compiler.

The real reason a monkey-patch records zero calls is upstream of any of that:
**TypeScript 5 defines its exports as getter-only, non-configurable properties.**

```js
Object.getOwnPropertyDescriptor(require('typescript'), 'transpileModule')
// { get: [Function], enumerable: true, configurable: false }
```

So `ts.transpileModule = wrapper` cannot work — in _any_ runtime, via `import` or
`require`. In sloppy-mode CJS the assignment **silently no-ops** (→ zero counts); in
an ES module it throws `TypeError: Attempted to assign to readonly property`.
`Object.defineProperty` fails too — the property is non-configurable.

To instrument the compiler, you must **alias the module**, not patch the object:
point `from-ts`'s `import ts from 'typescript'` at a Proxy that wraps
`typescript/lib/typescript.js` and counts on the way through. (A Bun _runtime_
plugin's `onResolve` does not fire for this; the cheapest thing that works is a
copy of `from-ts.ts` with its one import line rewritten.)

## Open questions

- ~~**tjs under node is unexplored.**~~ **Settled: node works, and the penalty is
  small.** 122/122 files convert from a `bun build --target=node --external typescript`
  bundle, at 65.2k lines/sec vs bun's 79.2k (bun 21% faster) — while using a third of
  the incremental memory (+41 MB vs +125 MB over the corpus). Node is a viable escape
  hatch, and on a long-lived server its memory profile is the _better_ one. What
  remains untested is whether the rest of the toolchain (CLI, plugin, VM, test runner)
  runs under node — the transpiler itself is no longer in question.
- **A resident tjs server has not been built or measured.** These numbers say the
  ceiling is not in the way (~220MB for a whole project under bun, ~185MB under
  node, both plateauing). They do not say the server is free.
