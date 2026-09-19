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
| TypeScript       | describes another language         | **no** — erased      | yes                    |
| ESM              | **yes**                            | **yes**              | no — one problem       |
| **TJS**          | **yes**                            | **yes**              | **yes**                |

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
