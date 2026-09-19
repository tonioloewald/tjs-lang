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

### The doctrine: _JavaScript: The Good Parts_ (2008)

The foundational insight, and it still holds: **there is a good language inside JavaScript,
and you get to it by subtraction.** Crockford named the parts that produce bugs — `==`, `with`,
implied globals, `new` without `new`, semicolon insertion, `typeof null` — and said: use the
rest.

That was a genuinely radical claim. Not "JavaScript is bad" and not "JavaScript is fine", but
that the language contains a smaller, coherent, better language, and that a disciplined
programmer can simply decline the rest. Every attempt since, including this one, is a variation
on that sentence.

**What it could not do is be anywhere except in your head.** A doctrine is enforced by memory
and code review, and it has to be re-transmitted to every newcomer on every team, forever. The
book sold well and the bad parts remained in the language, remained legal, and remained what
you got by default.

### The enforcement: JSLint (2002)

Making the doctrine executable was the real contribution — and note the date, because it is
the more interesting fact: **the enforcer shipped six years before the book explained it.**
JSLint encoded a doctrine that had not yet been written down, which is part of why it landed
as it did. Crockford's own framing — "JSLint will hurt your feelings" — is the tell. It was
right, and it had no room to say why.

That is the structural limit of the whole category: **a linter can only scold.** It cannot
change what `==` does; it can only object, every time, forever, in a tone nobody enjoys. So
the rules became a config file, the config file became a per-project argument, and the
knowledge ended up living in `.eslintrc` and team convention rather than in the language. Turn
a rule off and the footgun is simply back.

**Left on the table:** the bad parts themselves. Being told `==` is wrong, forever, in every
project, by a tool that cannot fix it, is worse than `==` being right.

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
JavaScript, but it **describes a different language**: a static one, erased before anything
runs.

**TypeScript treats JavaScript as a dumb CPU.** The types are the real program; JavaScript is
the target it compiles down to, and the relationship is the one a compiler has with assembly.
It is a superset of JavaScript in exactly the sense that **C is a superset of assembler** —
which is to say, only because it supports the inline form. You _can_ drop to the underlying
thing, and when you do, the abstraction stops helping and mostly stops watching.

Push that comparison one step further and it stops flattering. **Ask what C buys for its
leakiness:**

|                      | C over assembler                | TypeScript over JavaScript                                                |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| more **expressive**? | yes — structured control, types | no — the runtime semantics are identical, because they _are_ JavaScript's |
| more **portable**?   | yes — one source, many targets  | no — it targets JavaScript, which is where you already were               |
| more **compact**?    | yes — dramatically              | **no — strictly longer.** Annotations are added text                      |

C earns its leaks. It abstracts over a real machine and hands back expressiveness,
portability and concision so large that inline assembly is a rare escape most programmers
never write. TypeScript leaks in the same places — `any`, `as`, `@ts-ignore`, ambient
declarations, `.d.ts` files that drift from the code they describe — and the ledger on the
other side is comparatively thin, because it is not abstracting over anything. **It is
annotating.**

(The one portability claim TypeScript can make — downlevelling to older JavaScript — belongs
to the transpiler, not to the type system. Babel does it without types.)

None of which makes TypeScript a bad tool. Its value is real and it is **developer-experience**
value: editor intelligence, safe refactoring, errors caught before you run. What it is not is
an _abstraction layer_, and calling it one invites the comparison above, which it cannot win.

That would all be a reasonable trade if JavaScript were a dumb CPU. It is not, and here is the
part that gets missed:

> **JavaScript is genuinely type-safe. TypeScript is not.**

Every JavaScript value carries its type at runtime, operations check it, and nothing lets you
reinterpret a string's bits as a number. That is real, enforced, and always present. A
TypeScript type is a _claim_, unsound by design and erased before execution — `as` lets you
assert something false, and nothing at compile time or runtime will contradict you. One of
these systems can be lied to. It is not the one without a type checker.

So JavaScript already has the thing TypeScript is emulating. Its problem is not the absence
of runtime types, it is that **a few of them behave bizarrely**:

    typeof null                 // 'object'          — a bug from 1995, never fixed
    typeof NaN                  // 'number'          — a Number that is Not a Number
    new Boolean(false)          // truthy!           — an object, and objects are truthy
    new String('')              // truthy!           — likewise

The set is also thin: `number` covers integers, floats and `NaN` alike, and there is no way to
say "a non-negative integer" or "a valid CSS colour" in it.

Which reframes the whole problem. The job is not to bolt a second, static, erasable type
system on top. It is to **fix the handful of broken runtime types and widen the vocabulary** —
staying in the system that actually enforces something. In TJS, `TypeOf(null)` is `'null'`,
and `new Boolean(false) == false` is `true`.

**Left on the table:** the runtime — and the recognition that the runtime already had a type
system worth repairing.

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

#### And `.mjs` is the mechanism we borrowed outright

Node had to run two incompatible module systems in one toolchain, and the answer was not a
pragma. It was **the file extension**: `.mjs` means ESM, `.cjs` means CommonJS, and
`"type": "module"` flips what a bare `.js` means. The unit of choice is the file, and the
switch lives in its name.

That looks like a packaging detail and is actually a deep constraint. **You cannot put "this
is a module" inside the file, because you have to know it before you can parse the file.**
`import` hoists, bindings are live, the whole body is strict — all decided before the first
token is read. A directive like `'use strict'` can sit in the source precisely because it
changes so little; module-ness changes too much to be announced from within.

TJS has exactly that constraint, for exactly that reason: the dialect changes what the parser
does, so it cannot be discovered inside the parse. Hence `.tjs`, and hence the fact that this
project **abolished all nine of its mode directives** in favour of the extension. That was not
a style preference — it was arriving, later and the hard way, at the answer Node had already
found. Per-construct opt-outs (`LegacyDate`, `DangerousLegacyEquals`) remain, because those
are local and do not change how the file is read.

---

## Where that leaves the gap

Line them up and the pattern is hard to miss:

|                  | inside JS?                         | survives to runtime? | unlimited scope?       |
| ---------------- | ---------------------------------- | -------------------- | ---------------------- |
| _The Good Parts_ | doctrine only — lives in your head | n/a                  | yes, but unenforced    |
| JSLint           | no — a scold                       | n/a                  | yes, but advisory only |
| `use strict`     | **yes**                            | **yes**              | no — one fixed list    |
| Flow             | no — OCaml, other tradition        | no                   | yes                    |
| TypeScript       | treats JS as a compile target      | **no** — erased      | yes                    |
| ESM              | **yes**                            | **yes**              | no — one problem       |
| **TJS**          | **yes** — repairs JS's own types   | **yes**              | **yes**                |

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

**1. TJS ⊇ JS.** Any JavaScript file is a legal TJS file with plain JavaScript semantics.
**The extension is the gate**, borrowed from `.mjs`: a `.js` file gets JS semantics, a `.tjs`
file opts into the better language, and nothing inside the file has to be remembered or
configured. This is a guarded invariant rather than a promise —
`src/lang/subset-invariant.test.ts` fails if a richer layer ever makes subset-legal code
illegal.

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
