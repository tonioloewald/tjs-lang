<!--{"section": "home", "order": 8, "navTitle": "Post-mortem: the borrowed emitter"}-->

# Post-mortem: we spent seven months testing TypeScript's compiler

For most of this project's life, the lane described as **"the most honest evidence the
converter works that this repo has"** was, in the main, evidence that `tsc` works. So was the
test named **"True self-hosting"**. Neither was lying; both were pointed at the wrong program.

Nothing was broken in a way anyone could see. That is the point of writing it down.

---

## 1. What happened

`fromTS` had two branches:

```ts
if (emitTJS) { tjsFunctions.push(transformFunctionToTJS(...)) }   // TS -> TJS
else         { metadata[funcName] = extractFunctionMetadata(...) } // TS -> JS, via tsc
```

The `else` side produced JavaScript with **`ts.transpileModule`** — TypeScript's own emitter,
sitting beside ours — and stapled `fn.__tjs = {…}` onto the result.

Two JavaScript emitters is a maintenance smell. That was the small half. The large half is
that **two of the three lanes we cited as evidence called the borrowed one.**

## 2. Timeline

| | date | duration |
| --- | --- | --- |
| `ts.transpileModule` enters the JS output path | 2026-01-09, `from-ts.ts`'s first commit | — |
| compat lane created, `--full` (the real path) defaulting **off** | 2026-03-30 | 2.7 months later |
| dogfood ratchet created — the first honest end-to-end lane | 2026-08-01 | 6.7 months later |
| found | 2026-08-30 | **7.7 months** |

It was there from the file's first commit, and the flag that would have exercised the real
path defaulted off from the compat lane's first commit. Nothing ever passed it: `compat-all.ts`
spawns every script with no arguments, and three of the six scripts never had the flag at all.

## 3. Why it survived

**Because the dead branch was load-bearing.** It was the only side that collected type
metadata — the TJS side returned no `types` at all. So anything that wanted types *and* a
transpile was forced through TypeScript's emitter. Deleting it was impossible without first
noticing that the two branches were not two renderings of one analysis but **two separate
programs that never both ran.**

That is the generalizable shape: *a redundant path that has one capability the good path
lacks is not redundant. It is a dependency.*

**And a comment said otherwise.** The Bootstrap Canary read:

```ts
// Transpile with TJS
const result = fromTS(source)   // -> ts.transpileModule
```

## 4. What it cost

Forcing every lane onto our own emitter turned 52 tests red. They collapsed to **four**
defects, all previously invisible:

- **TJS could not parse an annotated generator** (`function* f():! 0.0`) — the function matcher
  did not admit the `*`, and once it did, the `*` was dropped while rebuilding the header, so
  every `yield` became a reserved word.
- **TJS could not parse a destructured parameter with an inline type**
  (`function f({ a, b }: { a: 0, b: 0 })`) — it matched as one pattern, so the colon-shorthand
  rewrite ran *inside the type*.
- **An optional parameter converted to a required one.** `excited?: boolean` became
  `excited: boolean | undefined`, which preserves the type but is required — and the emitted
  `__tjs` said `required: true` while `fromTS`'s own metadata said `required: false`.
- **Interface members of unresolvable type emitted `any`**, which is not a clonable literal, so
  any optional object parameter built from one was rejected at graduation.

**The converter was producing TJS that TJS could not read**, and no lane could see it, because
the lane that exercised the converter's output never fed it to our parser.

Re-baselining the TS corpus on the real path: **15 transpile failures across five real
codebases**, in two classes (declaration-merging name collisions; TS overloads our polymorphic
dispatch reads as ambiguous). The old numbers — ts-pattern 453/453, kysely 303/303, effect
363/363 — measured `tsc`.

## 5. Why the drift was still small

It was, and the reason is worth keeping:

1. **Only half the pipeline had a bypass.** TS → TJS was never shortcut — the CLI `convert` and
   the playground always used it. Only TJS → JS had the shortcut.
2. **The dogfood ratchet applied real pressure** for its four weeks of life, driving our whole
   source through TS → TJS → JS, with its floor ratcheted 95 → 106.

But the sharp version:

```
                                    our source   compat corpora
destructured param w/ inline type        0             6
annotated generators                    ~2             1
```

**The honest lane had a narrow corpus; the broad corpus was on the dishonest lane.** The
dogfood ratchet could never have found the destructuring bug — our own code does not contain
the shape. radash and effect do. Coverage and honesty were inversely distributed, which is
worse than either gap alone and invisible from inside either one.

## 6. Lessons

Ordered by how transferable they are.

1. **Name the program under test.** A lane that runs someone else's implementation measures
   theirs. "Does the converter work?" and "does `tsc` work?" have different answers and looked
   identical for seven months.
2. **A redundant path with a unique capability is a dependency.** The dead branch survived
   because it was the only source of type metadata. Look for what the "obsolete" path can do
   that the good one cannot; that is what is keeping it alive.
3. **The default is the only configuration that matters.** `--full` existed, worked, and was
   never once passed. An option that must be remembered will be forgotten; make the honest
   path the only path.
4. **A comment is not a control.** `// Transpile with TJS` sat directly above a call to `tsc`
   and was read by everyone who touched that file.
5. **Green that cannot go red is not a signal.** Even after the fix, `compat-all` printed
   `5 passed, 0 failed` while superstruct ran *zero* tests and ts-pattern failed on source that
   never transpiled. The scripts exit 0 regardless. Before quoting a number, check what would
   have to happen for it to fall.
6. **Ask what the honest lane's corpus contains.** Full marks on a corpus that lacks the shape
   is not evidence about the shape.
7. **When you cannot tell a converter defect from a language defect, you will blame the
   language.** During the fix its author claimed a language bug three times — "optional object
   parameters are not writable in TJS" — when `docs/dictionary-defaults.md` §5.1 had resolved
   it a month earlier and the language was correct every time. Every failure was the converter
   emitting something the spec already forbade. *Read the spec before diagnosing, not after
   someone points at it.*

## 7. What now enforces this

- **`src/no-ts-emitter.test.ts`** — `fromTS` must refuse to emit JavaScript (with a control
  proving the composed path works); only `from-ts.ts` may call `ts.transpileModule` at all; and
  the remaining sites — where `tsc` still strips types from function *bodies* — are a **ratchet
  that may only go down**, with a promote-check. That dependency is real and shrinking it means
  writing our own TypeScript statement stripper.
- **One path.** `fromTS` does TS → TJS; `tjs` does TJS → JS; callers compose them, so the route
  is visible at the call site. `emitTJS: false` throws and names the replacement.
- **All six compat scripts** run the real path, with no flag to get it wrong.
- The Bootstrap Canary genuinely self-hosts, and its comment is true.

## 8. Still open

- The lane verdict (lesson 5) — `compat-all` cannot currently fail.
- The two compat failure classes, and the `superstruct src/utils.ts:188` parse error.
- The `ts.transpileModule` body-stripper ratchet, down to zero.
