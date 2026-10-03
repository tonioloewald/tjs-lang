<!--{"section": "home", "order": 6, "navTitle": "Review lenses", "hidden": true}-->

# Project-specific review lenses

The standard nine-lens pre-release review (correctness, efficiency, DRYness, docs, coverage,
DX, ecosystem health, practices) is generic. These five are **this repo's** failure modes,
each derived from a defect that actually shipped here — not from a checklist.

Run them **in addition** to the nine.

---

## 0. What tjs-lang IS — the standing obligations

Lens 0 in the shared practices asks what *kind* of thing a project is, because the answer
tunes every other lens. tjs-lang is three kinds at once, and the obligations compose:

**A language.** Everything written in TJS inherits its bugs. A codegen defect ships into
every consumer's output without them changing a line — which is why emitted-code correctness
outranks almost everything, and why `examples.test.ts` (which RUNS its files) and the
dogfood corpus (which compiles its files) exist.

**Its semantics are a contract.** Quietly changing what `==` means rewrites programs that
already work. This is the whole reason an escape must exist *before* a rule tightens —
`unsafe`, the `Legacy*` bridges, `LegacyDefault` — and why "make stupid stuff stand out"
is a principle rather than a preference.

**A sandbox VM.** Adversarial input is the normal case, not an edge case. "Would a hostile
caller…" belongs in every pass, not only the security one.

**It compiles itself.** A defect can hide behind itself, which is why the dogfood corpus is
enforced rather than treated as a dashboard. The two stages are enforced _differently_, and
the difference is the point: **stage 2 (converted output compiles) is pinned at 100%** — it
is the floor the whole TS on-ramp rests on, and every point of slack there is a file
somebody cannot convert. **Stage 3 (graduation) is a RATCHET** with a floor that may only
rise, currently 97, because pinning an aspiration as a gate means any language change that
outpaces the converter blocks every release until it is chased down, which is how a gate
stops being read.

Either way, remember what those stages prove: that the converted code **builds**, not that
it still behaves the same. (Ten out of ten semantics-breaking mutations pass them.)
`examples.test.ts` is the one that runs its files.

**A published library.** A breaking change multiplies by its consumers — and the ones who
notice last are the ones who trusted us most.

## 1. "Where else?" — the sibling-site lens

**The dominant defect class in this codebase.** A fix lands in one copy and its structural
twin keeps the bug.

Instances in a single day (2026-08-02/03): comment stripping, embedded-test extraction,
paren matching, declaration scanning, the mode validators, and — twice — the capability
membrane, where the object branch was fixed in the morning and the **array branch** was
still executing accessors that afternoon.

> **For every behavioural fix in the diff, enumerate every other site that does the same
> kind of thing, and state explicitly whether each was checked.** "Fixed in X" is not an
> answer; "fixed in X, and Y/Z do not have this shape because…" is.

Highest-value single lens here. It has never come up empty.

## 2. Comment-vs-code — is the claim a property or a wish?

This repo is full of load-bearing prose, and prose does not execute.

`validateNoVar` carried the comment *"Match var declarations at statement level (not inside
strings/comments)"*. The regex did no such thing, so `var` inside a template literal made a
legal file unbuildable. The claim was in the comment, not in the code.

> **Find comments asserting a property — "not inside", "always", "never", "only" — and
> verify the code actually has it.** Where it does not, either fix the code or delete the
> claim. A false comment is worse than none: it stops the next reader from checking.

## 3. Generated-artifact freshness

Several build outputs are **committed**, so a source fix does not reach users until they are
regenerated — and nothing fails in the meantime.

`demo/docs.json` was still teaching all nine abolished mode directives in the live
playground, days after the source markdown was rewritten.

> **For every committed generated artifact (`demo/docs.json`, `editors/**/*.js`, `dist/`),
> confirm it was regenerated if its sources changed in this diff.**

## 4. Adversarial — what attacks have we NOT thought of?

Distinct from correctness: correctness asks whether the code does what it says, this asks
what an adversary does with what it says.

Asking it directly found, within minutes, that the per-atom quota shipped the same afternoon
was **bypassable via re-entrancy** — a capability calling back into `vm.run` got a fresh
counter, so a cap of one permitted two.

Enumerate rather than free-associate. Known classes to walk:

- **Accessors** at every traversal site — object keys, array indices, `Map`/`Set` entries,
  `Symbol`-keyed properties
- **Coercion hooks** — `Symbol.toPrimitive`, `valueOf`, `toString` reached during expression
  evaluation
- **Re-entrancy** — a capability calling back into the VM: shared or fresh fuel, state,
  quota counters
- **Proxies** returned by a capability
- **Error paths** built from guest-supplied data (the shape of vm2's `Error.prepareStackTrace`
  kill)

> **AJS is an AST interpreter, not a sandboxed realm — most published escapes have no direct
> analogue, because there is no `Function` to reach. The value is in the TRANSLATION:
> "what is the AJS equivalent of this?" is the question that surfaces undefended classes.**

## 5. "Prove it" — which claims are enforced, and which are merely true today?

This repo has a strong habit of turning claims into tests — bundle sizes, the assumptions
ledger, dogfood conversion, remedy compilability. The lens asks where that habit lapsed.

> **For each behavioural claim in the diff, ask: what test fails if this stops being true?
> If the answer is "none", either add one or move the claim to a place that does not read as
> a guarantee.**

Particularly for invariants that are currently held by *remembering*, e.g. "the membrane
never reads a value directly". That one could be mechanised — a test asserting the membrane
walk contains no `v[k]`-style reads would convert a habit into a property, and would have
caught the array-index case before it was written.

Two prompts from the 0.14.0 admission cycle, where five re-reviews blocked on one class:

> **Any list of names that decides what gets checked: is it closed by the TYPE SYSTEM, or by
> memory?** A `Record<keyof Options, Kind>` fails to compile when an option is missing; a
> list of budget names silently omits the next one (`quotaUsed`, re-review 13).
>
> **Does the check walk the same set the read resolves?** `Object.entries` sees own
> enumerable keys; `table[op]` also sees inherited ones, non-enumerable ones and getters, and
> sees the value at the time of the READ, not the check (re-review 14). Snapshot what you
> checked, or check at the read.

---

## 6. Every resource dimension — "by construction" in which dimension?

When a change claims a budget holds "by construction", check it in **every** dimension, not the
one the change was about:

- **work per step** (fuel),
- **retained bytes** (what outlives the step, and whether the heap walk can see it),
- **setup cost per source** (compile/verify/transpile work before any run has a budget),
- **transient → retained moves** (an optimisation that caches per-call state on a long-lived
  object turns temporary memory into held memory).

The regex engine blocked three review rounds in a row this way (0.14.0-rc.2 rereviews 7–9):
each fix metered one dimension and the next review found another. Round 8 charged every step;
its cache of the matching table on the compiled regex then retained ~690MB for 1000 regexes
under an 8MB ceiling, and compiling literals before any run had a budget cost seconds per few
KB. The design answer is to make cost a function of a few quantities you charge once — for a
regex, its program size (at creation) and its input (per match) — so there is no fourth
dimension to find. `docs/pattern.md` takes that further: one engine step is one charge.

## 7. Where is the class PRODUCED? — enforcing an invariant

A fix that states an invariant for a class ("a method is never a value", "a guest schema cannot
reach the host's regex engine") must be enforced where values of that class are PRODUCED, not at
the read site where one instance was observed. Before accepting "closes the general class", list
every producer of the value and check each one. In 0.14.0-rc.2, rounds 9 and 10 each closed one
read site of a general claim and the next review found its siblings (idents, namespace copies,
`toJSON`, dot-paths, method shadowing); round 11 moved the check to `evaluateExpr`, the one place
every expression's value comes from. This is lens 1 (sibling sites) applied to invariants.

## 8. Same value, every egress — when a value's representation changes

When a change gives a value a new shape or a special serialization, list every place that value
LEAVES: the guest's own builtins, every host serializer (`jsonOf`, `stringifyInput`), capability
inputs, `structuredClone` at a worker boundary, and the run result. Then check that they agree. In
0.14.0-rc.2 round 13, a guest Date became data, with a special ISO form in guest
`JSON.stringify` only. Every other egress wrote the object, in the host's local time, so the same
program returned different bytes on a UTC server and a laptop. The structural answer was not to
fix each serializer. It was to remove the special form, so there is nothing to keep in sync. Also
run a test under a non-UTC `TZ` whenever dates are involved.

## 9. A refusal must not catch the empty case — and one rule has one definition

When a change adds a refusal, test the empty input, the all-defaults input and the zero-argument
call, not only the shape it targets. In rc.2 round 14 the positional-call refusal also caught
`random()`, because the emitter writes `args: []` for every call with no arguments. When a rule
is enforced at more than one door, it must have one definition that every door calls. In the
same round, the method table admitted a guest Date that the `Date()` factory then rejected,
because each decided separately what a date is (`timestampOf` is now the single definition).

## 10. A new choke point states its cost — and is metered before it works

A gate added for safety is also a door: if it does work proportional to guest data, it is an
amplifier until it is charged. Ask of every new membrane, check or copy: what does one crossing
cost, who pays, and is it charged BEFORE the work, including when it refuses? In rc.2 round 30
the outbound membrane deep-copied every IO atom's input before the base cost and charged
nothing, so a `storeSet` loop over a large value ran 100× the CPU for the same fuel, and a
refused call (caught and retried) was free. The review that found it had approved the gate for
WHAT it checked; nobody had asked what it cost. The rule the VM already had applies: size it
against what the run can pay, charge it, then do it (`egressValue`, `vm.run`'s argument
admission).

## Why "anything you'd like to double-check?" works

Recorded because it has been repeatedly productive, and it is not obvious why.

Executing a plan and auditing a plan use different frames. While executing you are asking
"what is next?"; the question flips you to "what did the plan not cover?" — which is exactly
where the misses live, because a plan cannot contain its own blind spots.

It is most productive when there is nothing obvious left to do. That is the signal the
obvious work is finished, and the remaining defects are the ones no task named.
