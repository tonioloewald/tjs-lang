<!--{"section":"tjs","group":"docs","order":-10,"navTitle":"Why TJS"}-->

# Why TJS

## Everyone has tried to fix JavaScript. This is what they left on the table.

JavaScript has been getting fixed for twenty years. The attempts were good, most of them
worked, and every one of them stopped somewhere short — usually at the same place, for the
same reason. TJS is an attempt to finish the job in the space they left.

The short version: **the fixes that worked were the ones inside the language, and they were
rationed.** The fixes that were unlimited were the ones outside it, and being outside is what
cost them.

---

## What each attempt got right, and where it stopped

### Crockford — _JavaScript: The Good Parts_ and JSLint (2001–2008)

The foundational insight, and it still holds: **a language can have a good language inside
it**, and you get there by subtraction. Crockford identified the parts that produce bugs —
`==`, `with`, implied globals, `new` without `new`, semicolon insertion — and said: don't use
them.

JSLint made the advice executable, which was the real contribution. But a linter can only
**scold**. The bad parts remained in the language, remained legal, remained what you got by
default. Every project re-litigated which rules to enable. The knowledge lived in a
configuration file and a community argument, not in the language, so it had to be re-acquired
by every team and every newcomer.

**Left on the table:** the bad parts themselves. Being told `==` is wrong, forever, is worse
than `==` being right.

### `use strict` (ES5, 2009)

The proof that **the language could fix itself.** Opt-in, file-scoped, and it removed things
JSLint could only complain about: implied globals became errors, `with` was gone, duplicate
parameters were gone, silent assignment failures started throwing.

It worked. It is the single most successful "fix JavaScript" project, and almost nobody
thinks about it any more — which is what success looks like.

And then it stopped. The list is short and it never grew. `==` survived. `typeof null` survived.
`NaN !== NaN` survived. There was no mechanism for "the next twenty things", because each
one would have needed its own committee cycle and its own compatibility argument.

**Left on the table:** everything after the first list. The mechanism was right and was used
once.

### Flow (2014) and TypeScript (2012)

Both understood that **types are the missing information**, and TypeScript in particular
understood the thing Flow did not: adoption has to be gradual, and tooling has to be
excellent. TypeScript won, deservedly, and it is genuinely better than what came before.

But look at what they are. Flow was written in OCaml — a type system from a different
tradition, bolted to a language that does not share its assumptions. TypeScript is written in
JavaScript, but it **describes a different language**: a static one, which is erased before
anything runs.

That erasure is the crux. A TypeScript type is a claim checked at compile time and gone at
runtime. It cannot validate the JSON that just arrived. It cannot document itself to a caller
who has only the built artifact. It cannot be a test. And because it is only a claim, the
compiler can be argued with — `any`, `as`, `@ts-ignore` — and the argument leaves no trace in
the running program.

**Left on the table:** the runtime. The types describe a program that does not exist by the
time the program runs.

### ESM (ES6, 2015)

The other great inside-the-language success, and the closest precedent for what TJS is doing.
Modules had been a community problem with community answers — AMD, CommonJS, UMD, bundler
conventions — and the fix was not a better convention. It was **new syntax with different
semantics**, living beside the old one.

`import` is not `require` with nicer spelling. It is static, hoisted, live-bound, and
strict-by-default. The old form still works; nobody's code broke; the new form is simply
better, and it won by being better.

**That is the model.** Not a lint rule, not a superset that erases, not a committee-sized
list of removals — a real alternative inside the language, chosen file by file.

---

## Where that leaves the gap

Line them up and the pattern is hard to miss:

|              | inside JS?                  | survives to runtime? | unlimited scope?       |
| ------------ | --------------------------- | -------------------- | ---------------------- |
| JSLint       | no — a scold                | n/a                  | yes, but advisory only |
| `use strict` | **yes**                     | **yes**              | no — one fixed list    |
| Flow         | no — OCaml, other tradition | no                   | yes                    |
| TypeScript   | describes another language  | **no** — erased      | yes                    |
| ESM          | **yes**                     | **yes**              | no — one problem       |
| **TJS**      | **yes**                     | **yes**              | **yes**                |

Nobody has occupied the bottom row, and it is not because it is a bad idea. It is because
each project had a good reason to stop: a committee cannot ship twenty semantic changes, a
type checker that runs is a performance argument, and a linter that changes your program is
frightening.

TJS's bet is that those reasons have weakened. Transpilation is universal and boring.
Validation at the boundary turned out to be something people do anyway, by hand, worse. And
the number of footguns that have been a lint rule for fifteen years — flagged, argued about,
never removed — is the size of the opportunity.

---

## What "inside JavaScript" actually means here

Three commitments, and they are testable rather than aspirational.

**1. TJS ⊇ JS.** Any JavaScript file is a legal TJS file with plain JavaScript semantics. The
extension is the gate: a `.js` file gets JS semantics, a `.tjs` file opts into the better
language. This is a guarded invariant, not a promise — `src/lang/subset-invariant.test.ts`
fails if a richer layer ever makes subset-legal code illegal.

**2. Types are examples that survive.** Instead of a separate type language that is erased,
a type is a **value**:

    function greet(name: 'Alice') { … }

`'Alice'` is not a string-literal type. It is an example, and it widens to "a string" — while
staying a real value, so it can be documentation, a runtime contract, a test fixture, and a
JSON Schema at the same time. One artifact rather than four that drift.

**3. The escape hatches are named and ugly.** Every fix can be opted out of — but through
something greppable and deliberately unattractive: `LegacyDate(x)`, `DangerousLegacyEquals(a, b)`,
`LegacyDefault(…)`. A confession, not a suppression. There is an on-ramp and an off-ramp, and
deliberately no comfortable middle.

---

## The honest part

The previous attempts are why this is possible, not competition for it. Crockford's list is
still the list. `use strict` and ESM proved the inside-the-language route works and is
survivable. TypeScript did the adoption research the hard way and established that a superset
with gradual typing is something working programmers will accept.

TJS is what you get by taking those lessons seriously at the same time: fix the bad parts
rather than flagging them, keep the fixes in the language rather than in a config file, and
let the types live long enough to be useful.

If you want the specifics of what is fixed and how, **[TJS for JavaScript
Programmers](../TJS-FOR-JS.md)** is the practical tour, **[TJS for TypeScript
Programmers](../TJS-FOR-TS.md)** covers migration and interop, and
**[the difference table](../docs/tjs-vs-typescript.md)** lists every divergence — generated
from executable rows, so each claim on it is run against `tsc --strict` and TJS on every
build rather than asserted here.
