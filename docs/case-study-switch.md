<!--{"parent": "the-tjs-language.md", "order": 10}-->
<!-- TODO review -->

# Case study: fixing `switch`

A record of one language decision, start to unfinished, including the measurements that
misled us and the ones that held. Written down because the *process* turned out to be more
interesting than the conclusion, and because several of the wrong turns are the kind nobody
writes up.

Outcome: **`given` shipped, `switch` reverted to C semantics with a warning, and existing
code is upgraded automatically where that is provably safe.** The keyword was chosen on
structural argument, because the measurement that appeared to rank the candidates turned out
to be noise — which is the most useful thing in this document.

`given` is TJS's replacement for `switch`. Each arm can list several values, no arm runs into
the next, and values compare the way TJS's `==` does:

```tjs
function shape(kind: 'circle'): 'round' {
  given kind {
    'circle', 'ellipse' { return 'round' }
    'square' { return 'square' }
  } else {
    return 'unknown'
  }
}

console.log(shape('ellipse'), shape('square'), shape('blob'))
// round square unknown
```

This page is a design record: why the construct exists and why it looks the way it does. For
how to use it, see [Control Flow: given](/given-dispatch/).

Much of the evidence below comes from asking an AI language model what a program returns.
Models now read and write a large share of code, and they are a cheap stand-in for a reader
meeting TJS for the first time, so "can a model read this correctly?" was the test. The
model-reading test turned out not to separate the keyword candidates, so the keyword was
chosen on design grounds (collision risk and meaning) instead.

---

## 1. The defect

`switch` in JavaScript is C's, and it carries four problems that have nothing to do with each
other except a common origin:

1. `case` compares with `===`. In TJS, `==` is a comparison without the footguns (no type
   coercion, `null` equals `undefined`; see [Honest Equality](/honest-equality/)), so
   `switch` silently disagrees with the rest of the file: `case null:` does not match
   `undefined`, though `undefined == null` is true.
2. Multiple values sharing one block is only expressible **as** fallthrough.
3. Fallthrough is the **default**, so correctness requires `break` on every arm.
4. All arms share **one scope**, so `let` leaks and `const` collides.

```javascript
switch (x) {
  case 'a':            // problem 2: 'a' reaches the shared block only by falling through
  case 'b':
    const n = 1
    log(n)             // problem 3: no break, so 'a' and 'b' also run the next arm
  case 'c':
    const n = 2        // problem 4: SyntaxError, `n` is already declared in this scope
    break
}
```

Two of these ship as errors in `eslint:recommended` (`no-fallthrough`, `no-case-declarations`).
The ecosystem decided the defaults were wrong long ago and has been hand-patching ever since,
because the language cannot change. That is the observation the whole project rests on: *a
pattern that needs a heavy-handed lint rule is a language defect, not a user error.*

## 2. What we built first — and later reversed

Swift's answer is to end every arm on its own (an implicit `break`). That one decision fixes
problems 2, 3 and 4 together: arms can list several values, fallthrough becomes something you
ask for, and each arm gets its own scope. For problem 1, compare with `Eq`, the function
behind TJS's `==`.

That shipped ([#43]) — multi-value `case 'a', 'b':`, opt-in `fallthrough`, per-arm scope, and
the switched-on value compared the same way `==` compares. It also needed `Exactly(…)`
underneath. In TJS a colon value is an example that widens to its type, so a field written
`kind: 'circle'` means "any string", and two types that differ only in that field (a
`Circle` and a `Rect`) looked identical when the switch dispatched on them. `Exactly('circle')`
keeps the literal.

Three implementation traps, each worth remembering:

- **Rewriting to an if-chain is wrong.** `break` inside a `switch` breaks the switch; inside
  an `if` it breaks the enclosing *loop*. That rewrite silently changes control flow.
- **Per-arm scope cannot be added after parsing.** A switch body is one block scope in JS,
  so two `const`s with the same name are a syntax error, and the parser (acorn) is right to
  reject them. Each arm has to be wrapped in braces in the source text before it is parsed.
- **Fixing the runtime changed nothing that ships.** Each compiled file carries its own small
  copy of the runtime, so a fix to the main runtime's `Type()` did not reach compiled code
  until the copy (its `__match` helper) learned the same rule.

All of this made `switch` mean something different in a `.tjs` file than in a `.js` one.
Section 3 shows why that was a problem; section 4 is where it was reversed.

## 3. The measurement that changed the plan

We showed a model a short `switch`, varied only the file extension, and asked what `f('a')`
returned. Without `break`, JavaScript's arms fall through and the answer is `1,2`; under the
reworked TJS `switch` they did not, and the answer is `1`. "Correct" means the answer the
file's own rules give: `1,2` for the `.js` file without `break`, `1` for the `.tjs` one. Each
condition was asked five times. The probe is `experiments/agent-legibility/switch-probe.ts`;
the numbers below are from qwen3.8-27b, a 27-billion-parameter model (the full series is in
`switch-probe-results.md` beside it):

| condition | correct | **wrong** |
| --- | --- | --- |
| explicit `break`, as `.js` | 5/5 | 0 |
| no `break`, as `.js` | 5/5 | 0 |
| no `break`, as **`.tjs`** | **0/5** | **5** |

Not "poorly" — the **worst possible result**, and not from uncertainty: both controls are
100%. Shown identical text as `.tjs`, it applied C fallthrough five times out of five,
confidently.

Its own reasoning, verbatim: *"…maybe has 'case' with comma to group multiple cases? There is
a language 'TJS'…"* The model has no prior knowledge of the extension. The `.tjs` extension
is the only thing that tells a reader this file follows TJS rules: it is an *out-of-band* marker, outside the
code itself. It is what lets TJS change `==` for a whole file, which an in-code directive
like `"use strict"` never could, and it carries **nothing** to a reader.

A one-line comment in the file stating the rule (that arms do not fall through) took the 27B
model to 5/5. A much smaller model (gemma-4-e4b, about 4 billion parameters) was unmoved by
anything in the file: it scored 0/5 on every TJS condition, comment or not. So the
affordance has to be in the code, and even there it only reaches a reader capable of acting
on it.

## 4. The reframe: if it behaves differently, it should look different

The comment fixes the file that carries it. It does not reach the places where only a few lines
of the file are visible: a snippet in chat, a diff, a stack trace, a search result. [#48]
proposed the alternative: **stop changing what `switch` means, and give the fixed construct a
different name.**

Then a stronger form of the idea — change the *shape* too, not just the word:

```text
given x {
  'a', 'b' { … }
} else { … }
```

No `case`. No colons. No implicit blocks. `else` for the remaining arm. Every difference
visible.

Measured on qwen3.8-27b, five samples each. The keyword was not yet decided, and in this run
it was `match`; sections 7 and 8 are how it became `given`. "NEW syntax" is the brace-and-comma
form above, every condition is a `.tjs` file, and "no-answer" means the model did not commit
to a return value:

| condition | correct | **wrong** | no-answer |
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

These were worked out while the keyword was `match`; they apply unchanged to `given`.

**No parentheses.** This is already valid JavaScript:

```javascript
match (x)
{ … }
```

JavaScript inserts a semicolon at the line break, so it reads as a call, `match(x);`,
followed by an ordinary block. Without parentheses, `match x {` is never valid JavaScript, so
the transpiler can tell the construct apart from ordinary code. The choice that looked like
taste is what makes detection possible.

**Detection is the hard part.** Detection means the transpiler finding the construct in source
text, and it is hard because no candidate keyword is reserved: any of them can also be a
variable, a property or a word in a string. A first prototype mangled
`const match = 1; if (y) { … }` into `switch (= 1; if (y))`. It was fixed by requiring the
value after the keyword to look like an expression (no `;`, no leading operator) and by
skipping declarations (`const given = …`) and property access (`obj.given`). The
false-positive shapes we found, including the keyword inside a string literal, are now left
untouched.

The fallback block is `else`; section 9 says why.

## 6. Rewriting existing code, which is the actual job

Adding a better alternative is not fixing the language. `switchToGiven` rewrites a C `switch`
**only where it provably means the same thing**: every non-empty arm leaves
(`return`/`throw`/`break`/`continue`), so implicit-versus-explicit break is unobservable.
Stacked empty arms become multi-value; trailing `break` is dropped as dead code; `default`
becomes `else`. Where an arm genuinely runs into the next, the switch is **not** rewritten,
and a note naming its line says why. A converter that is occasionally wrong is worse than one
that is honest.

Two terms matter here. **Conversion** (`fromTS`) turns a TypeScript file into TJS that still
behaves like JavaScript; its output carries a `/* tjs <- source */` comment, which means "JS
semantics". **Graduation** removes that comment, which turns on every TJS rule. The rewrite
runs at graduation, not conversion, and the distinction is load-bearing: `given` is lowered
only for native TJS, so emitting it at conversion time would produce files that do not parse.
That is exactly the shape of [#37], where dropping `new` at conversion time shipped modules
that could not be imported. Graduation strips the annotation, applies both rewrites, then
checks that the result still compiles as native TJS, returning the input unchanged (and
saying why) if it does not. It is one function, `graduate.ts`.

On our own source: **44 switches upgraded across 19 files, 0 declined**, which is consistent
with `no-fallthrough` being an error in our lint. The dogfood check, which converts and then
graduates each of our own source files, went from 104 of 105 files to all **105**.

### Three defects the rewrite found, none of them in the rewrite

Worth recording because all three were **silent**, and two predate this work entirely:

1. **It deleted every comment.** Arm text is sliced from the first statement to the last, so
   anything sitting *between* arms simply vanished — including a twenty-line rationale block in
   our own converter. Every test stayed green, because no test asserted that comments survive.
   The comments are usually the part of a file you cannot reconstruct; a converter that drops
   them is worse than one that declines.
2. **`given` did not nest.** Lowering slices an arm's body as *text* rather than re-scanning
   it, so one pass reached only the outermost construct and the inner one arrived at the parser
   as `given b {`, which is not JavaScript. The transform now runs to a fixpoint. This shipped
   with `given` and no test had nested one.
3. **The JS-semantics check was blind to string literals.** The annotation that means "JS
   semantics" was detected by scanning **raw** source text, so any file that merely *mentioned* `/* tjs <- … */` in a string was
   read as TS-originated and silently lost the entire language — `==` stopped being `Eq`,
   dictionary defaults went atomic, `given` never lowered. `from-ts.ts` emits that annotation
   from a template, so **the converter's own source was the first casualty**, and had been for
   as long as the check existed.

The pattern is the same one this whole document keeps running into: the failures that matter
here do not throw. They produce plausible output. The third is the most common defect in this
codebase, a pass that misreads code merely *mentioning* what it scans for, appearing in the one
place nobody had thought to look: the check that decides *which language the file is written
in*.

## 7. The keyword, and how the data failed us

Candidates measured cold (no explanation or cheat sheet), same program, only the word
varying. The `match` row is the same run as section 4's last row. These tables, and the
re-run below, are in `experiments/agent-legibility/FINDINGS.md` (the "`match` vs `switch`" and
"Keyword candidates" sections, 2026-08-29):

| keyword | correct | **wrong** | no-answer |
| --- | --- | --- | --- |
| `match` | 4/5 | 0 | 1 |
| `when` | 3/5 | 0 | 2 |
| `given` | 1/5 | 0 | 4 |

That looked like a ranking, and it was written up as one. **Then the identical `given`
condition was re-run and scored 4/5.** A swing of three in a sample of five, same model, same prompt.

So the ranking was noise. What the re-run establishes is a property of the *instrument*:

> **Correctness is stable; willingness to commit is not.** Every new keyword produced zero
> wrong answers in every run. The thing that varied wildly was whether the model answered at
> all.

This matters beyond the keyword, because it means a probe scored on "correct out of N"
silently mixes a stable signal with a noisy one. The two should be read separately, and the
no-answer column is the one that needs a much larger N.

**What survives.** The bare `.tjs` `switch` scored 0/5 in every run, on both models, and on
the 27B model every condition that used the new shape gave zero wrong answers, whatever the
keyword. Only the first finding below was also checked on the 4B model:

- the C shape in `.tjs` produces **confident wrong answers**, reliably;
- **any** new shape produces **zero** wrong answers, reliably;
- an inline comment stating the rule takes comprehension to 5/5, on a model large enough to
  use it.

**What does not survive:** any ranking among `match` / `when` / `given`.

## 8. Where that leaves the decision

The measurement does not choose the keyword, so the structural arguments do. Both favour
`given`:

**Collision risk**, counted in our own source on 2026-08-29:

| keyword | occurrences | as a **method call** |
| --- | --- | --- |
| `match` | 417 | **33** (`.match(…)`) |
| `when` | 423 | 0 |
| `given` | 21 | 0 |

None are reserved, so detection must exclude every one of those other uses, which is why
`when`'s 423 still count against it. `match` is worst, in the dangerous way: a method call is
the shape most easily mistaken for the construct.

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
the re-run collapsed the ranking (in `FINDINGS.md` the collision and semantics arguments
precede the retraction), and that the ranking collapsed on its own evidence rather than
being argued away.

## 9. The fallback block: a measurement that legitimately abstains

Three spellings, same program, asking what an unmatched value returns. This was a one-off
run, recorded only in the message of commit `1906d626`:

| spelling | correct | wrong |
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

## 10. Where it landed, and what is still open

**Decided and shipped.** `given` is the construct; `else` is the fallback; `switch` keeps C
semantics exactly and gets a warning pointing at the replacement, so nothing silently changes
meaning. Existing code is upgraded at graduation where that is provably safe.

**Still open** (as of 2026-11-06):

- **Re-measure with a cheat sheet.** The no-answer mode is exactly what guidance fixes: in an
  earlier experiment, a small model writing AJS succeeded 0% of the time with no guidance and
  67% with a short cheat sheet (`FINDINGS.md`, "Guidance A/B"). and cold reading is the worst case for a
  novel word and the best case for a familiar one. The keyword ranking should be re-taken under
  those conditions, with a much larger N on the no-answer column specifically.
- **`else if (cond) { }`, considered and not taken.** If `else` reads as `if`/`else`, that is
  the obvious next step. It would mix value dispatch with condition dispatch in one construct,
  which is a bigger change than it looks, and nothing needs it today.

## 11. What generalises

Three things, none of them about `switch`:

1. **A pattern that needs a heavy-handed lint rule is a language defect.** That is what
   started this, and it held up.
2. **Correctness is stable; willingness to commit is not.** A probe scored "correct out of N"
   silently mixes a stable signal with a noisy one. Read the columns separately, and treat a
   ranking built on the noisy one as unmeasured until it replicates. We wrote one up as a
   finding before it did.
3. **If it behaves differently, it should look different.** The out-of-band signal — the file
   extension — carries nothing to a reader. This is the single most transferable result here,
   and it applies to every remaining place TJS changes a JavaScript meaning in place.

[#43]: https://github.com/tonioloewald/tjs-lang/issues/43
[#48]: https://github.com/tonioloewald/tjs-lang/issues/48
[#37]: https://github.com/tonioloewald/tjs-lang/issues/37
