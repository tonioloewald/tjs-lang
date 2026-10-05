<!--{"hidden": true}-->

# Upstream issues

Bugs and gaps in tjs-lang's dependencies (Bun, tosijs, tosijs-ui, …) that we've
**filed upstream and worked around locally**. We keep the workaround; this file is
the paper trail so the workaround can be removed once upstream lands, and so a future
reader knows the odd-looking local code is compensating for a known external issue —
not a mistake.

Convention: file the issue on the upstream repo, add a row here with the URL, and
leave a comment at the workaround site pointing back. **Never fix it by editing the
upstream repo from here** — file, don't fix.

Every open entry also has a card on the [Virta board](https://virta.tosijs.net/host/#?virta.scope=tjs-lang)
(`virta ls "project:tjs-lang kind:upstream"`), named on the entry. When upstream resolves one, close
the card, remove the workaround, and reduce the entry here to one line under **Resolved**; the full
history stays in git.

| Upstream issue                                                                             | What                                                                                                                                                                                                                                                                                                                                                     | Local workaround                                                                                                                                                                                                                                                            | Remove when                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tonioloewald/tosijs-schema#12](https://github.com/tonioloewald/tosijs-schema/issues/12) · Virta #3065 | `validate()` compiles a schema's `pattern` with the host's backtracking `RegExp` and runs it on the value; with an untrusted value and a catastrophic pattern it hangs, and the caller cannot interrupt it. Requested: `setPatternEngine((source, flags) => matcher)`, the same shape as `setPredicateEvaluator`, allowed to throw to refuse a pattern. | `admitIoInputSchema` (`src/vm/runtime.ts`) REFUSES `pattern`/`patternProperties` in an IO atom's input schema at `defineAtom`, since the outbound membrane validates every call against it on guest-chosen strings. | The slot ships: fill it with the VM's linear engine (`src/vm/regex.ts`, charged to the run), lift the ban, and later fill it with Pattern (`docs/pattern.md`). |
| [oven-sh/bun#34397](https://github.com/oven-sh/bun/issues/34397) · Virta #2390                           | `fetch()` connection-refused error shape differs from Node: Bun uses top-level `e.code === 'ConnectionRefused'`, Node uses `e.cause.code === 'ECONNREFUSED'`. Code checking only the Node shape silently never matches under Bun.                                                                                                                        | `isConnectionRefused()` in `src/batteries/llm.ts` checks **both** shapes, so the friendly "start LM Studio" message fires under either runtime.                                                                                                                             | Bun aligns its fetch error shape with Node/undici (or documents the divergence and we standardize on checking both permanently).                                                                           |
| [acornjs/acorn#1461](https://github.com/acornjs/acorn/issues/1461) · Virta #2391                         | `currentVarScope`/`currentThisScope` walk the scope stack from the top on every statement, so N nested blocks that each hold a statement parse in O(N²) (8.18.0, Node 22: 3.5 → 13.7 → 31.2 ms at depth 1K/2K/3K; nested _empty_ blocks stay ~0.2 ms). Filed as a performance note, not a security report — the maintainer closed #1457 on that framing. | The 8KB default source cap on every AJS entry (`src/vm/admission.ts`, `DEFAULT_MAX_SOURCE_BYTES`) bounds how deep a caller can nest; the structural answer is not parsing untrusted source in the VM host at all (`tjs-lang/vm-ast`).                                       | acorn keeps a stack of var/this-scope indices (O(1) lookup). The cap stays regardless — it bounds the other super-linear shapes too.                                                                       |
| [madroidmaq/mlx-omni-server#130](https://github.com/madroidmaq/mlx-omni-server/issues/130) · Virta #2392 | `/v1/models` returns `{"data": []}` — the server loads on demand, so it has nothing resident to enumerate. Model discovery finds nothing and every call fails with "No LLM available" **while the server works perfectly**.                                                                                                                              | `TJS_LLM_MODEL` / `TJS_EMBEDDING_MODEL` name the models explicitly and skip the audit (`src/batteries/config.ts`). A declared model is trusted, not probed — so its embedding `dimension` is unknown until first use, which is expected. Documented in `docs/mlx-setup.md`. | `/v1/models` enumerates servable (cached) models, or returns something a client can distinguish from "no models". The env-var override stays useful regardless; what goes away is its being **mandatory**. |
| [madroidmaq/mlx-omni-server#128](https://github.com/madroidmaq/mlx-omni-server/issues/128) · Virta #2393 | `/v1/chat/completions` types `content` as `list[dict[str, str]]`, so it **rejects the standard OpenAI image block** (`image_url` is a nested object) before any model is consulted. A flattened `{type:'image_url', image_url:'<data-uri>'}` does get through.                                                                                           | **None — deliberately not worked around.** Emitting a server-specific request shape from portable battery code is the wrong trade; vision on this backend is documented as blocked instead (`docs/mlx-setup.md`). Vision tests self-skip.                                   | The content-part union is typed structurally (or the flattened form is documented as a supported alias). Then `llmVision` can target this backend.                                                         |
| [madroidmaq/mlx-omni-server#129](https://github.com/madroidmaq/mlx-omni-server/issues/129) · Virta #2394 | `MLX_VLM_ONLY_MODELS = {"gemma4"}` gates vision to **one architecture**; every other VLM falls through to `mlx_lm` and fails with `Model type <arch> not supported` — naming the model, not the routing decision that caused it.                                                                                                                         | None. Recorded in `docs/mlx-setup.md` as gate 2 of 3, with the full 4-combination matrix so nobody re-runs the investigation.                                                                                                                                               | Routing derives from `mlx_vlm`'s own registry, or the error names the gate. Until then, VLM choice on this backend is not free.                                                                            |
| [cubist38/mlx-openai-server#320](https://github.com/cubist38/mlx-openai-server/issues/320) · Virta #2395 | `--model-type multimodal` starts, lists the model, then fails at generation with `BatchGenerator.__init__() got an unexpected keyword argument 'kv_bits'` — dependency skew, surfacing only after everything says the setup is correct.                                                                                                                  | None. This server otherwise got **furthest**: it accepts the standard OpenAI image block and its `/v1/models` actually lists the model, so it is the one to re-test first when this lands.                                                                                  | `kv_bits` skew resolved upstream. Then re-evaluate it as the vision backend ahead of mlx-omni-server.                                                                                                      |

## tosijs-coding-practices — one canonical safe-port-reclaim

**Virta:** #2397

**Filed:** [tosijs-coding-practices#5](https://github.com/tonioloewald/tosijs-coding-practices/issues/5)
(the rule) · [tosijs-ui#77](https://github.com/tonioloewald/tosijs-ui/issues/77) (a real bug
there) · [haltija#34](https://github.com/tonioloewald/haltija/issues/34) (no change asked —
it is the reference implementation).

`src/cli/port.ts` is the **third** independent implementation of "find the process LISTENING
on a port, decide whether it is ours, terminate it politely, then forcibly". All three got
the hard-won `-sTCP:LISTEN` half right; the identity half is the one that keeps getting
written loose, and it is the half that can reach a stranger's machine.

| repo                                          | identity check                                                           | filters own pid          |
| --------------------------------------------- | ------------------------------------------------------------------------ | ------------------------ |
| `haltija/src/port-pid.ts`                     | `ps -o command=` matched `/haltija\|tosijs-dev/i` — **the command line** | yes                      |
| `tosijs-ui/src/doc-system/site/dev-server.ts` | `ps -o comm=` matched `/\b(bun\|node\|deno)\b/`                          | yes                      |
| `tjs-lang/src/cli/port.ts`                    | was `ps -o comm=` matched `/^(bun\|node\|deno)$/`                        | **no**, until 2026-08-16 |

**Read directly, not taken on report.** The review characterised this as three copies of one
idea; the checkouts say something sharper. haltija is _correct_ — it matches the command line
AND filters its own pid. tosijs-ui carries the same over-loose identity check this repo had,
and calls `killStrayServer` unconditionally at startup with no `--force` gate, while its own
warning text says "which is not a **dev server**" for a condition that tests "is not a JS
**runtime**". tjs-lang's was the worst of the three: loose identity _and_ no self-pid filter.

`/^(bun|node|deno)$/` is not an identity, it is an ecosystem. Since `tjs-playground` is a
published bin, `tjs-playground --port 3000 --force` would SIGTERM→SIGKILL a consumer's Vite
or bun dev server and report it as reclaiming its own — reproduced live in review against a
plain `node` server. The missing self-pid filter was worse than it sounds: running the new
tests against the unfixed code SIGTERMed **the test runner**, mid-suite.

**Fixed locally (2026-08-16, `6596ae3`):** identity is the full argv matched against
`OUR_SERVERS` — the entry points this package actually ships — plus an explicit refusal to
signal `process.pid`. `portListeners` still reports the caller honestly; `reclaimPort`
refuses to act on it. Tests cover both directions: a positive control that runs a real
process at a matching path (without it, defining `ours` as "never" passes everything else
and silently disables reclaiming), and a stranger `node` server that must survive `--force`.

**The rule, filed upstream:** _a process's executable name is never an identity; match the
command line._ What makes it a rule rather than a preference is the asymmetry —
**over-matching kills somebody else's work, under-matching prints "choose another port"** —
so there is no trade-off to weigh and strictness is simply correct.

### Two more rules learned after filing (2026-08-19) — NOT yet written back

`tosijs-coding-practices#5` is still open and currently carries only the first rule. Two
more came out of hardening `port.ts` here, and both have the same asymmetry that makes the
first one a rule rather than a preference:

1. **A generic entry path is not an identity either — anchor it to YOUR installation.**
   `bin/dev.ts` is about the least distinctive path in web tooling. Reproduced: a listener
   at a stranger's `bin/dev.ts` under `/tmp` was identified as ours, SIGTERMed, and
   announced as our own server. Matching the command line is necessary and not sufficient;
   the argv must also reference the package root. (A published BIN NAME can stand alone —
   `tjs-playground` — and must, since a global or `npx` install shows no repo path at all.
   The two branches rest on different guarantees and the docstring should say which.)

2. **Re-verify identity before escalating to SIGKILL.** Between SIGTERM and SIGKILL the
   process can exit and the PID be reused. The polite signal is the one you can afford to
   get wrong; the forcible one is not, so it must re-read the command line rather than
   trust the PortHolder it was handed.

Both are implemented in `src/cli/port.ts`. Neither is upstream. **Owed to
`tosijs-coding-practices#5`.**

## Bun — `bun build --define:` silently does not substitute

**Virta:** #2398

**Filed:** [oven-sh/bun#40558](https://github.com/oven-sh/bun/issues/40558) (2026-08-26).
Reproduced on 1.4.0 with a two-line file, with and without `--target=node`, and with the
value quoted both ways.

```console
$ echo 'export const x = { v: __FOO__ }' > a.js
$ bun build a.js --outfile=b.js --define:__FOO__='"1.2.3"'
$ cat b.js
var x = { v: __FOO__ };     # unchanged
```

**The failure mode is the point, not the flag.** The build exits 0 with no warning, so the
placeholder ships looking exactly like a value that was substituted. We hit it stamping the
tjs-lang version into `functions/lib/index.js` so `/health` could report which VM a running
deployment actually has — a field whose entire job is to be trustworthy, which would have
answered `"tjsLang": "__TJS_LANG_VERSION__"`. Caught only because the guard asserts the
stamp MATCHES a version rather than merely existing.

**Workaround, in place:** a generated `functions/src/version.js`
(`export const TJS_LANG_VERSION = "…"`), written by the `build:version` script and imported
normally. Boring, and it bundles correctly everywhere.

**Remove the workaround when:** `--define` substitutes, _or_ an unresolved key becomes a
warning — the issue argues for the latter regardless, since a build flag that quietly does
nothing is worse than one that is unsupported.

## tosijs-ui — an existing `firebase.json` is never checked against `outputDir`

**Virta:** #3066

**Filed:** [tosijs-ui#134](https://github.com/tonioloewald/tosijs-ui/issues/134) (2026-09-04).
**Blocks:** nothing. **Workaround:** verify by hand, once, at migration time.

tjs-lang keeps its Cloud Functions on Firebase — hosting and functions are coupled by a
`/run` rewrite — so hosting stays there too, and `host: 'firebase'` is the target. That
already works, and its `!existsSync('firebase.json')` guard is right: it scaffolds for a
fresh project and leaves an existing config alone (ours carries the function rewrite plus
three `headers` blocks a minimal scaffold would not reproduce).

The gap is what happens NEXT. When `firebase.json` exists, nothing compares its
`hosting.public` with the site's `outputDir`. Ours says `.demo`; `outputDir` defaults to
`docs`. `buildSite` would write one directory and `firebase deploy` would serve the other,
both reporting success — the build is not what goes live, silently.

That is the same shape as the defect that put our Cloud Functions eight releases behind for
months: publishing and deploying are separate acts and nothing compared them. Our fix was to
read `/health` back every time. Upstream the check is cheaper than the symptom.

Also asked for in the same issue: a `cloudflare` preset (`SiteHost` is
`'github-pages' | 'firebase' | 'static'`), since Cloudflare Pages needs `_headers`/`_redirects`
in the same place the other two write their preset files.

**When this lands:** delete the manual check from the Phase B migration notes in `TODO.md`.

## tosijs-ui — `ajs` is not a built-in live-example dialect (tosijs-ui#209)

**Virta:** #3078

**Filed 2026-10-05.** Every site that wants runnable ```ajs fences has to register the dialect
itself, and has to rediscover the safety defaults: fetch off unless domains are allowed, no LLM
capability, a source cap, transpile outside the VM and run on `tjs-lang/vm-ast`. **Worked around
here:** `site/entry.ts` registers `ajs` through `registerDialect` (tosijs-ui 1.16.1, #184), plus
`dialects: ['ajs']` in the site config. **Waiting for:** a built-in `ajs` dialect, lazily
importing tjs-lang like the built-in `tjs`. Then delete the registration and the config entry.

## tosijs-ui — docs are identified by bare filename (tosijs-ui#190)

**Virta:** #2403

**Filed 2026-09-25.** Two docs with the same basename in different directories collide as
identities in the nav tree: one is shown twice, the other not at all, silently (reproduced
against 1.15.0's `buildNavTree`). **Worked around here:** every visible doc has a unique
basename, guarded by `src/doc-site-structure.test.ts`. **Waiting for:** the path as identity,
or at least a failing build. When it lands, the guard can relax to "unique within a directory".

## tosijs-ui — what retiring the playground needs from it (tosijs-ui#184, #185, #186)

**Virta:** #2404

**Update 2026-09-29:** #184 parts 1 and 2 **shipped in tosijs-ui 1.16.1** (`registerDialect`, fence
options) and are ADOPTED: `site/entry.ts` runs every ```` ```ajs ```` example on tjs.tosijs.net. Still
open: a console panel for examples that `console.log` (asked on #184), part 3 (the Docs tab), #185
and #186.

**Filed 2026-09-25**, as tjs-lang moves its docs onto a tosijs-ui hosted site and retires the
bespoke playground (`demo/`). The agreed bar for 0.14 is that live-example RUNS every example
and SHOWS ITS OUTPUT; the rest waits for an IDE.

- [tosijs-ui#184](https://github.com/tonioloewald/tosijs-ui/issues/184) — live-example gaps:
  **AJS** (`Dialect` is closed at `js|tjs|ts`; asked for a pluggable dialect registry), a
  **build-options channel** (the transform takes only a fixed `transforms` list and loads
  tjs-lang itself from a pinned CDN, so no compiler option can be set per example), and a
  **Docs tab**. Until AJS lands, tjs-lang hosts each AJS example inside a JS example
  (`import { AgentVM, ajs } from 'tjs-lang'`), which works today.
- [tosijs-ui#185](https://github.com/tonioloewald/tosijs-ui/issues/185) — a documentation
  SURFACE for tjs-lang's generated doc output: per example (#184's tab) and per module
  (generated reference pages from `tjs(…).types` / `fromTS(…).classes`).
- [tosijs-ui#186](https://github.com/tonioloewald/tosijs-ui/issues/186) — `<tosi-ide>`: a true
  client-side unbundled IDE on tjs-lang's import-resolver (external libraries such as Mapbox in
  demos without baking them into the bundle), a virtual file system for multi-file projects,
  and persistence on a service-compris endpoint. **Where it lives is tosijs-ui's decision** — a
  component there, or a project of its own.

**Not fixed here** — file don't fix. **What we're waiting for:** #184's AJS item decides whether
the AJS examples keep the JS-host wrapper; the rest is post-0.14.

## `@codemirror/state` duplicates when adopting `tosijs-ui/site` (tosijs-ui#131) — ✅ FIXED UPSTREAM, workaround still in place

**Virta:** #3067

**Filed:** [tosijs-ui#131](https://github.com/tonioloewald/tosijs-ui/issues/131) — reported by
tosijs, reproduced here 2026-09-06 while attempting the B1 site migration.

Upgrading `tosijs-ui` 1.5.23 → 1.13.0 (needed for the `./site` export) nests a second copy:
`tosijs-ui` declares `@codemirror/state: ^6.7.1` as a hard dependency, our tree had 6.5.4, and
`bun add` silently installed 6.7.4 under `node_modules/tosijs-ui/node_modules/`. CodeMirror
keys facets and gutters by object IDENTITY, so two copies mean extensions built from one are
silently ignored by an editor built from the other.

Measured in our demo bundle: **1 copy before the bump, 2 after.** `overrides` forcing a single
physical copy got the disk to one and the bundle from four to two — **not to one**, because
`splitting: true` can still emit a shared module into more than one chunk.

**Worked around by NOT bumping.** `tosijs-ui` stays at 1.5.23 and B1 is parked; see `TODO.md`.

**The real fix is upstream and already shipped**: import `@codemirror/*` from their
`tosijs-ui/codemirror` re-export rather than directly, so there is only ever one instance and
it is the one the editor uses. Applying it here touches `demo/src/*`, which is B2, and B2 is
blocked on them moving off `tjs-lang@0.13.4` (#135).

**What we're waiting for:** #135 to unblock B2, at which point the demo's CodeMirror imports
move to `tosijs-ui/codemirror` and the bump becomes safe.

**Delete this entry when** the demo imports CodeMirror through `tosijs-ui/codemirror` and
`bun run build:demo` reports one copy with `tosijs-ui` ≥ 1.13.0.

**Also worth keeping:** neither mechanism reported the duplication. Peer ranges do not warn
(their measurement, bun 1.4.0) and `bun add` nested a copy of a package we already had without
a word. The only thing that caught it was `src/demo-bundle.test.ts` counting copies in the
built artifact — and that guard was itself blind until 2026-09-06, because it read
`.demo/index.js` while the bundle is split.

---

## `tosijs-ui/site` — three findings from the B1 adoption (tosijs-ui#153, #154, #155) — ✅ FIXED UPSTREAM, workarounds still in place

**Virta:** #2407

**Filed 2026-09-09** while adopting the doc system. All three are theirs to fix; worked around
here so B1 can proceed.

**[#153] `SiteConfig` has no `ignore` for `docPaths`.** Listing `'docs'` published **13
pre-release review reports** as public pages — including BLOCK verdicts naming an adopter.
`extractDocs` already takes an `ignore`; the config does not surface it.
_Worked around:_ `tjs-site.config.ts` enumerates `docs/*.md` and filters, reason attached.
_Delete the workaround when:_ `SiteConfig.ignore` exists.

**[#154] Two containment problems.** `outputDir` does not contain the build — pointing it at a
scratch dir still overwrote `llms.txt` and `demo/docs.json`, because `docsJson` defaults to
`demo/docs.json`, the path our playground reads. And `checkExamples` falls back to parsing TJS
as raw JavaScript when it cannot resolve `tjs-lang/browser` from inside `node_modules`,
reporting ~30 syntax errors **in our documents** for code that is correct.
_Worked around:_ self-link in `prepare` (`ln -sfn .. node_modules/tjs-lang`), because a
self-documenting library must be resolvable as a PACKAGE from inside `node_modules` and
`bunfig`'s `[resolve]` alias does not cover that direction.
_Delete the workaround when:_ they skip un-transpilable dialects instead of falling back.

**[#155] TJS support for Prism — announced, and a design ask.** Prism is being wired in and
will bake into printed/ePub output. **238 of our fences are tagged `typescript`**, and in
`TJS-SYNTAX.md` 12 of 31 of those contain a TJS colon-example — which TypeScript's token
model would colour as a TYPE, visually asserting the exact confusion that document exists to
correct, permanently, in print. Asked that **display-only be orthogonal to language**, so a
block can be `tjs` for highlighting without being executed.

**[#156] `extractDocs` matches `<!--{ … }-->` anywhere in the file.** A document that DOCUMENTS
the frontmatter format gets classified by its own illustration: `CLAUDE.md` shows the format on
line 815 and was filed into the playground's TJS examples nav, in "basics", at order 16, with a
`bash` block as its code. Our own `bin/docs.js` already carried the anchored match and a comment
naming CLAUDE.md specifically — the literal-blindness class, in a doc system, where it is
structurally most likely.
_Worked around:_ `bin/site.ts` strips `section`/`type`/`group`/`order`/`pin` from any doc whose
first non-blank line is not a metadata block.
_Delete the workaround when:_ the match is anchored to the first non-blank line.

> **`bad metadata in doc UPSTREAM.md` on every `bun run docs` is THIS BUG, and is expected.**
> The unanchored scan reaches the inline code span two paragraphs above and extracts the
> literal `{ … }`, which is not JSON. Nothing is wrong: no metadata was declared, and the
> fallback to `{}` is correct. The file documenting the misreading is misread by it.
>
> The warning is left alone rather than silenced, because silencing it here would mean
> teaching the build to ignore a diagnostic that is load-bearing elsewhere. Instead
> `bin/site.ts` adds its own **anchored** check and _fails_ the build when a doc's real
> frontmatter does not parse — the case where upstream's warn-and-continue is genuinely
> dangerous, since the page then loses its `section`/`group`/`order` silently and lands in
> the wrong nav with the build reporting success. A false alarm and a real failure that look
> identical train you to ignore both; now only one of them can reach you.

## Resolved

Kept as one line each; the full write-ups are in git history.

- tosijs-schema — no way to declare an OPEN object — ✅ RESOLVED 2026-09-28 (adopted `.open` with `^1.12.0`; the `s.record(s.any)` workaround is gone)
- Bun — a directory's listing is cached on first module resolution — ✅ RESOLVED 2026-09-26 (oven-sh/bun#40105 closed; no workaround here)
- tosijs-ui — `live-example` pins tjs-lang 0.13.4 (deprecated) — ✅ RESOLVED 2026-09-26 (tosijs-ui#135 closed)
- tosijs-ui — peer range `tjs-lang: ^0.12.0` cannot reach 0.13.x — ✅ RESOLVED 2026-09-26 (tosijs-ui#98 closed)
- tosijs-ui — peer range `tjs-lang: ^0.13.1` cannot reach 0.14.x (tosijs-ui#182) — ✅ RESOLVED 2026-09-26 (1.15.4 declares `^0.13.1 || ^0.14.0`; nothing to remove here)
