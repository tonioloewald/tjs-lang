<!--{"section": "home", "order": 6, "navTitle": "Review lenses"}-->

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
outranks almost everything, and why `examples.test.ts` and the dogfood corpus exist.

**Its semantics are a contract.** Quietly changing what `==` means rewrites programs that
already work. This is the whole reason an escape must exist *before* a rule tightens —
`unsafe`, the `Legacy*` bridges, `LegacyDefault` — and why "make stupid stuff stand out"
is a principle rather than a preference.

**A sandbox VM.** Adversarial input is the normal case, not an edge case. "Would a hostile
caller…" belongs in every pass, not only the security one.

**It compiles itself.** A defect can hide behind itself, which is why the dogfood corpus is
pinned at 100% on both stages rather than treated as a dashboard.

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

---

## Why "anything you'd like to double-check?" works

Recorded because it has been repeatedly productive, and it is not obvious why.

Executing a plan and auditing a plan use different frames. While executing you are asking
"what is next?"; the question flips you to "what did the plan not cover?" — which is exactly
where the misses live, because a plan cannot contain its own blind spots.

It is most productive when there is nothing obvious left to do. That is the signal the
obvious work is finished, and the remaining defects are the ones no task named.
