<!--{"section": "home", "order": 7, "navTitle": "Case study: switch"}-->

# Case study: fixing `switch`

A record of one language decision, start to unfinished, including the measurements that
misled us and the ones that held. Written down because the *process* turned out to be more
interesting than the conclusion, and because several of the wrong turns are the kind nobody
writes up.

Outcome: **`given` shipped, `switch` reverted to C semantics with a warning.** The keyword was
chosen on structural argument, because the measurement that appeared to rank the candidates
turned out to be noise — which is the most useful thing in this document.

---

## 1. The defect

`switch` in JavaScript is C's, and it carries four problems that have nothing to do with each
other except a common origin:

1. `case` compares with `===`, so in a language where `==` means something better, `switch`
   silently disagrees with the rest of the file.
2. Multiple values sharing one block is only expressible **as** fallthrough.
3. Fallthrough is the **default**, so correctness requires `break` on every arm.
4. All arms share **one scope**, so `let` leaks and `const` collides.

Two of these ship as errors in `eslint:recommended` (`no-fallthrough`, `no-case-declarations`).
The ecosystem decided the defaults were wrong long ago and has been hand-patching ever since,
because the language cannot change. That is the observation the whole project rests on: *a
pattern that needs a heavy-handed lint rule is a language defect, not a user error.*

## 2. What we built first — and later reversed

Swift's answer: make `break` implicit, and 2/3/4 collapse into one decision. Add `Eq` for 1.

That shipped ([#43]) — multi-value `case 'a', 'b':`, opt-in `fallthrough`, per-arm scope, and
a discriminant keyed the same way `==` compares. It also needed `Exactly(…)` underneath,
because a discriminant is a literal and the example rule widens `kind: 'circle'` to "a string",
which is why `Circle` and `Rect` looked identical to the dispatcher.

Three implementation traps, each worth remembering:

- **Rewriting to an if-chain is wrong.** `break` inside a `switch` breaks the switch; inside
  an `if` it breaks the enclosing *loop*. That rewrite silently changes control flow.
- **Per-arm scope cannot be done post-parse.** A switch body is one block scope in JS, so
  duplicate `const` is a spec early error — acorn is right to refuse, and the source has to be
  braced *before* the strict parse.
- **Fixing the runtime changed nothing that ships.** Emitted code uses inline stubs, so the
  real `Type()` fix was invisible until the inline `__match` learned the same rule. Fourth
  time that asymmetry cost a fix in one week.

## 3. The measurement that changed the plan

We showed a model the same program twice, varying only the file extension, and asked what it
returned. `switch-probe.ts`:

| | correct | **wrong** |
| --- | --- | --- |
| explicit `break`, as `.js` | 5/5 | 0 |
| no `break`, as `.js` | 5/5 | 0 |
| no `break`, as **`.tjs`** | **0/5** | **5** |

Not "poorly" — the **worst possible result**, and not from uncertainty: both controls are
100%. Shown identical text as `.tjs`, it applied C fallthrough five times out of five,
confidently.

Its own reasoning, verbatim: *"…maybe has 'case' with comma to group multiple cases? There is
a language 'TJS'…"* There is no prior for the extension. Our out-of-band mode marker — the
thing that lets TJS fix `==` where `"use strict"` could not — carries **nothing** to a reader.

A one-line comment took it to 5/5. So the affordance has to be in the code.

## 4. The reframe: if it behaves differently, it should look different

The comment fixes the file that carries it. It does not reach a snippet in chat, a diff hunk,
a stack frame, or a search result. [#48] proposed the alternative: **stop changing what
`switch` means, and give the fixed construct a different name.**

Then a stronger form of the idea — change the *shape* too, not just the word:

```js
given x {
  'a', 'b' { … }
} else { … }
```

No `case`. No colons. No implicit blocks. `else` for the remaining arm. Every difference
visible.

Measured:

| | correct | **wrong** | no-answer |
| --- | --- | --- | --- |
| `switch`, C syntax | 0/5 | **5** | 0 |
| `switch`, NEW syntax | 0/5 | 0 | **5** |
| new keyword, NEW syntax | 4/5 | 0 | 1 |

**Two findings, and the second was a surprise.** Changing the shape eliminated every
confident wrong answer — 5 to 0 — which is the failure mode that ships bugs. But keeping the
*name* while changing the shape produced five **no-answers**: the model cannot reconcile "this
is `switch`" with "this does not look like `switch`", and stalls. The keyword and the shape
have to move together.

## 5. Syntax details that earned themselves

**No parentheses.** `match (x) { }` is *already valid JavaScript* — a call followed by a
block. Without parens it is unambiguous. The choice that looked like taste turned out to be
what makes detection possible.

**`else`, not `otherwise`.** Already reserved, so unlike the keyword itself it cannot collide
with a user identifier; shorter; and it already means "the remaining case".

**Detection is the hard part**, because no candidate keyword is reserved. A first prototype
mangled `const match = 1; if (y) { … }` into `switch (= 1; if (y))`. Fixed by requiring the
discriminant to look like an expression — no `;`, no leading operator — and by excluding
declarators and member access. Six false-positive shapes now pass, including the keyword
inside a string literal.

## 6. Rewriting existing code, which is the actual job

Adding a better alternative is not fixing the language. `switchToMatch` rewrites a C `switch`
**only where it provably means the same thing**: every non-empty arm leaves
(`return`/`throw`/`break`/`continue`), so implicit-versus-explicit break is unobservable.
Stacked empty arms become multi-value; trailing `break` is dropped as dead code; `default`
becomes `else`.

Where an arm genuinely runs into the next, it is **not** rewritten and says why at the site.
A converter that is occasionally wrong is worse than one that is honest.

## 7. The keyword, and how the data failed us

Candidates measured cold, same program, only the word varying:

| keyword | correct | **wrong** | no-answer |
| --- | --- | --- | --- |
| `match` | 4/5 | 0 | 1 |
| `when` | 3/5 | 0 | 2 |
| `given` | 1/5 | 0 | 4 |

That looked like a ranking, and it was written up as one. **Then the identical `given` arm
was re-run and scored 4/5.** A swing of three in a sample of five, same model, same prompt.

So the ranking was noise. What the re-run establishes is a property of the *instrument*:

> **Correctness is stable; willingness to commit is not.** Every new keyword produced zero
> wrong answers in every run. The thing that varied wildly was whether the model answered at
> all.

This matters beyond the keyword, because it means a probe scored on "correct out of N"
silently mixes a stable signal with a noisy one. The two should be read separately, and the
no-answer column is the one that needs a much larger N.

**What survives.** Replicated across eleven arms and several runs:

- the C shape in `.tjs` produces **confident wrong answers**, reliably;
- **any** new shape produces **zero** wrong answers, reliably;
- an inline hint takes comprehension to 5/5.

**What does not survive:** any ranking among `match` / `when` / `given`.

## 8. Where that leaves the decision

The measurement does not choose the keyword, so the structural arguments do. Both favour
`given`:

**Collision risk**, counted in our own source:

| keyword | occurrences | as a **method call** |
| --- | --- | --- |
| `match` | 417 | **33** (`.match(…)`) |
| `when` | 423 | 0 |
| `given` | 21 | 0 |

None are reserved, so detection must exclude every other use. `match` is worst, in the
dangerous way.

**Semantics.** This construct compares **values** with `Eq`. It does not destructure, bind, or
guard. `match` names what Rust, Python and Scala do — *pattern matching* — so it over-promises
to precisely the reader whose prior it was meant to recruit. `given x` reads in English as
"given this value, these are the cases", which is what the code does.

There are also advantages a comprehension probe structurally cannot see: a rarer word is
easier to search for, and documentation about `given` is not competing with a decade of
`String.prototype.match` results. A cold-reading probe measures recognition, not
findability — and recognition is the one thing a novel keyword is guaranteed to lose at.

That is worth stating carefully rather than as a rationalisation. The risk of reasoning this
way is obvious: it can excuse any result. The check is that the argument was made *before*
the re-run collapsed the ranking, and that the ranking collapsed on its own evidence rather
than being argued away.

## 9. The fallback block: a measurement that legitimately abstains

Three spellings, same program, asking what an unmatched value returns:

| | correct | wrong |
| --- | --- | --- |
| `given x { … } else { … }` | 5/5 | 0 |
| `given x { … default { … } }` | 5/5 | 0 |
| `given x { … } otherwise { … }` | 5/5 | 0 |

**All three, perfectly.** Unlike the keyword ranking this is not noise — it is a real
negative result, and the reason is structural: the fallback block's meaning is carried by its
POSITION, not its name. A reader who has understood the arms understands the leftover block
whatever it is called.

So the choice is design, and the argument that decides it is the same one that drove the
rename:

- **`default` re-imports the prior we just escaped.** A reader who sees `default` inside
  `given` has been handed a piece of `switch`, and may reasonably reach for the rest of it —
  `case`, `break`, fallthrough. Renaming to shed a prior and then keeping one of its keywords
  gives back part of what the rename bought.
- **`otherwise` is not a reserved word**, so it carries the same collision problem `given`
  does, for no gain over a word that is.
- **`else` is reserved, and already means exactly this.** It parallels `if`/`else`, which
  every JavaScript reader knows, and it sits outside the arm list where it visually separates
  "the cases" from "everything else".

`else` it is. Worth recording that this was decided on argument with the measurement
explicitly abstaining, rather than the measurement being ignored.

**A possible extension, not taken:** if `else` reads as `if`/`else`, then `else if (cond) { }`
is the obvious next step. That would mix value dispatch with condition dispatch in one
construct, which is a bigger change than it looks and is not needed for anything today.

## 10. Open

- **The keyword.** Undecided. The data abstains; the structural case favours `given`.
- **`switch` in `.tjs`.** Currently ships with implicit `break` (#43) — which is the one
  construct the probe reads wrong 5/5. If a new keyword lands, `switch` should revert to C
  semantics so nothing is silently changed. Converted code is already unaffected
  (`dialect: 'js'` keeps C semantics; verified).
- **Re-measure with a cheat sheet.** The no-answer mode is exactly what guidance fixes
  (measured elsewhere: none 0% → cheatsheet 67%), and cold reading is the worst case for a
  novel word and the best case for a familiar one.

[#43]: https://github.com/tonioloewald/tjs-lang/issues/43
[#48]: https://github.com/tonioloewald/tjs-lang/issues/48
