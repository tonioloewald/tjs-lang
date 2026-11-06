<!--{"order": 1, "parent": "the-tjs-language.md"}-->
<!-- TODO review -->

# Why TJS

## Everyone has tried to fix JavaScript. This is what they left on the table.

> This chapter is for readers who already write JavaScript and know some of its history. New
> to programming? Start with [Learn to Program](/learn-to-program/) instead; you can come back
> here later.

JavaScript has been getting fixed for twenty years. The attempts were good, most of them
worked, and every one of them stopped somewhere short. TJS is an attempt to finish the job in
the space they left.

Two words carry the argument, so here is what they mean. A fix is **inside the language**
when it changes what the code actually does when it runs, and you choose it per file, the way
`'use strict'` changes how a file behaves. A fix is **outside the language** when it lives in
a separate tool (a linter, a type checker) and the running program never hears about it. A
fix is **rationed** when it is a fixed list that nobody can extend.

The short version: **the fixes that worked were the ones inside the language, and they were
rationed.** The fixes that could grow without limit were the ones outside it, and being
outside is what cost them.

---

## What each attempt got right, and where it stopped

### The doctrine: _JavaScript: The Good Parts_ (2008)

Douglas Crockford's book made the foundational point, and it still holds: **there is a good
language inside JavaScript, and you get to it by subtraction.** He named the parts that
produce bugs and said: use the rest. His list included:

- `==`, which converts its operands before comparing, so `'5' == 5` is true;
- `with`, which makes it impossible to tell which variable a name refers to;
- implied globals: assigning to a name you never declared silently creates a global variable;
- constructors called without `new`, which quietly write to the global object instead of
  building a new one;
- automatic semicolon insertion, which guesses where your statements end and sometimes
  guesses wrong;
- `typeof null`, which answers `'object'`.

That was a radical claim. Not "JavaScript is bad" and not "JavaScript is fine", but that the
language contains a smaller, coherent, better language, and that a disciplined programmer
can decline the rest. Every attempt since, including this one, is a variation on that
sentence.

**What it could not do is be anywhere except in your head.** A doctrine is enforced by memory
and code review, and it has to be taught again to every newcomer on every team, forever. The
book sold well, and the bad parts stayed in the language, stayed legal, and stayed what you
got by default.

### The enforcement: JSLint (2002)

Crockford had already made the doctrine executable, six years before the book explained it.
JSLint, his linter, checked code against rules that had not yet been written down in prose.
Its own warning label was "JSLint will hurt your feelings", and that sums up the whole
category: a tool that can object to your code but cannot explain the rule in your editor, and
cannot fix the language.

That is the structural limit: **a linter can only scold.** It cannot change what `==` does; it
can only object, every time, forever. So the rules became a config file, the config file
became a per-project argument, and the knowledge ended up in `.eslintrc` files and team
convention rather than in the language. Turn a rule off and the hazard (a *footgun*, a feature
that makes it easy to shoot yourself in the foot) is back.

**Left on the table:** the bad parts themselves. Being told `==` is wrong, in every project,
by a tool that cannot fix it, is worse than `==` being right.

### `use strict` (ES5, 2009)

The proof that **the language could fix itself.** Writing `'use strict'` at the top of a file
opts that file into stricter rules, and the rules are enforced by the JavaScript engine
itself, so it removed things JSLint could only complain about: assigning to an undeclared
name became an error instead of creating a global, `with` was gone, duplicate parameter names
were gone, and assignments that used to fail without a word (writing to a read-only property,
for example) started throwing errors.

It worked. It is the single most successful "fix JavaScript" project, and almost nobody
thinks about it any more, which is what success looks like.

And then it stopped. The list is short and it never grew. `==` survived. `typeof null`
survived. `NaN !== NaN` survived. There was no mechanism for "the next twenty things",
because each one would have needed its own standards-committee cycle and its own
compatibility argument.

**Left on the table:** everything after the first list. The mechanism was right and was used
once.

### TypeScript (2012) and Flow (2014)

Both understood that **types are the missing information**, and TypeScript in particular
understood what Flow did not: adoption has to be gradual, and tooling has to be excellent.
TypeScript won, deservedly, and it is better than what came before.

But look at what they are. Both are static checkers: they read your code before it runs,
report problems, and then **erase the types**, so the program that actually runs has never
heard of them. TypeScript describes a different language, a static one, and treats
JavaScript as the compile target it lowers to.

That makes TypeScript a checking layer, not a new runtime meaning. Its value is real, and it
is developer-experience value: editor intelligence, safe refactoring, errors caught before
you run. What it does not do is change anything about how the program behaves. Its escape
routes (`any`, `as`, `@ts-ignore`, `.d.ts` files that drift from the code they describe) are
places where the checking stops, and nothing at run time takes over.

That would be a reasonable trade if JavaScript had no types of its own at run time. It has,
and this is the part that gets missed.

JavaScript is often called weakly typed, because it **converts** values freely: `'5' * 2` is
`10`, and `'5' == 5` is true. That is a real problem, and TJS fixes it. But it is a different
property from **type safety** in the strict sense: a value can never be read as something it
is not. In that sense:

> **JavaScript is type-safe. TypeScript is not.**

Every JavaScript value carries its type at run time, and nothing lets you reinterpret a
string's bits as a number. The conversions are rules applied to values whose types are always
known. That is real, enforced, and always present. A TypeScript type is a _claim_, unsound by
design and erased before execution: `as` lets you assert something false, and nothing at
compile time or run time will contradict you. One of these systems can be lied to, and it is
not the one without a type checker.

So JavaScript already has the thing TypeScript is emulating. Its problem is not the absence
of runtime types; it is that **a few of them behave bizarrely**:

<!-- prettier-ignore -->
```javascript
typeof null           // 'object'  — a bug from 1995, never fixed
new Boolean(false)    // truthy!   — wraps false in an object, and objects are truthy
new String('')        // truthy!   — likewise
```

`new Boolean(false)` takes the primitive value `false` and wraps ("boxes") it in an object.
Every object is truthy, so `if (new Boolean(false))` takes the branch.

The set of types is also thin: `number` covers integers, floats and `NaN` (a value that
`typeof` reports as `'number'`) alike, and there is no way to say "a non-negative integer" or
"a valid CSS colour".

Which reframes the whole problem. The job is not to bolt a second, static, erasable type
system on top. It is to **fix the handful of broken runtime types and widen the vocabulary**,
staying in the system that actually enforces something. Run this in a `.tjs` file:

```tjs
console.log(typeof null)                     // null (the string 'null')
console.log(new Boolean(false) == false)     // true: the boxed value is unwrapped
console.log(new Boolean(false) ? 'yes' : 'no') // no: a boxed false is falsy
console.log('5' == 5)                        // false: no type conversion
console.log(null == undefined)               // true: both mean "nothing"
console.log(NaN == NaN)                      // true
console.log(typeof NaN)                      // number: unchanged
```

`==` in TJS is `===` with the traps removed (boxed primitives, `null` versus `undefined`, and
`NaN` never equalling itself), not JavaScript's converting `==`. `typeof NaN` is still
`'number'`: `NaN` is a number value, and TJS leaves that alone. The plain-JavaScript
behaviour of each fix is still there when you need it, under a name that says what it is;
see the third commitment below.

Widening the vocabulary looks like this. A parameter's example says what it accepts, and
`+0` means "a non-negative integer". A `Type` can carry a predicate for anything the examples
cannot say:

```tjs
function at(index: +0) { return ['a', 'b', 'c'][index] }

Type HexColor {
  example: '#ff8800'
  predicate(x) {
    return x.length === 7 && x.startsWith('#') &&
      x.slice(1).split('').every((c) => '0123456789abcdef'.includes(c))
  }
}

function paint(color: HexColor) { return `painting ${color}` }

console.log(at(1))                          // b
console.log(isMonadicError(at(-1)))         // true: -1 is not a non-negative integer
console.log(paint('#336699'))               // painting #336699
console.log(isMonadicError(paint('blue')))  // true: not a hex colour
```

Full CSS colours (names, `rgb()`, `hsl()` and the rest) are in `tjs-lang/css`; see
[Predicate types](/predicate-types/).

**Left on the table:** the runtime, and the recognition that the runtime already had a type
system worth repairing.

### ESM (ES6, 2015)

The other great inside-the-language success, and the closest precedent for what TJS is doing.
Modules had been a community problem with community answers (AMD, CommonJS, UMD, bundler
conventions), and the fix was not a better convention. It was **new syntax with different
semantics**, living beside the old one.

`import` is not `require` with nicer spelling. Imports are resolved before any code runs,
they always see the exporting module's current value of a binding rather than a copy, and a
module is strict by default. The old form still works; nobody's code broke; the new form is
better, and it won by being better.

**That is the model.** Not a lint rule, not a superset that erases, not a committee-sized
list of removals: a real alternative inside the language, chosen file by file.

#### And `.mjs` is the mechanism we borrowed outright

Node had to run two incompatible module systems in one toolchain, and the answer was not a
pragma. It was **the file extension**: `.mjs` means ESM, `.cjs` means CommonJS, and
`"type": "module"` in `package.json` flips what a bare `.js` means. The unit of choice is the
file, and the switch lives in its name.

That looks like a packaging detail and is actually a deep constraint. **You cannot put "this
is a module" inside the file, because you have to know it before you can parse the file.**
How imports resolve and whether the whole body is strict are all decided before the first
token is read. A directive like `'use strict'` can sit in the source because it changes so
little; module-ness changes too much to be announced from within.

TJS has the same constraint, for the same reason: the dialect changes what the parser does,
so it cannot be discovered inside the parse. Hence `.tjs`. (TJS once had in-file mode
directives; they were removed in favour of the extension, arriving later and the hard way at
the answer Node had already found.)

---

## Where that leaves the gap

The table below asks three questions of each attempt:

- **Inside JS?** Does it change what the running code does, rather than living in a separate
  tool?
- **Survives to runtime?** Is anything it knows still present while the program runs?
- **Unlimited scope?** Can it keep growing, or is it a fixed list?

|                  | inside JS?                         | survives to runtime? | unlimited scope?        |
| ---------------- | ---------------------------------- | -------------------- | ----------------------- |
| _The Good Parts_ | no — a doctrine in your head       | no                   | yes, but unenforced     |
| JSLint           | no — a separate tool that scolds   | no                   | yes, but advisory       |
| `use strict`     | **yes**                            | **yes**              | no — one fixed list     |
| Flow             | no — a checker, types erased       | no                   | yes                     |
| TypeScript       | no — a checker, types erased       | no                   | yes                     |
| ESM              | **yes**                            | **yes**              | no — one problem        |
| **TJS**          | **yes** — repairs JS's own types   | **yes**              | **yes**                 |

The obvious objection: TJS is also a separate file type compiled by a transpiler, exactly like
TypeScript. The difference is what comes out. TypeScript's compiler deletes the types, so the
JavaScript it emits behaves as if they were never written. TJS's transpiler turns them into
code: the emitted JavaScript checks arguments, keeps the type information as data you can
inspect, and runs `==` and `typeof` with the fixed meanings. The fixes are in the program
that runs, not in a report that came before it.

Nobody has occupied the bottom row, and not because it is a bad idea. Each project had a good
reason to stop: a committee cannot ship twenty semantic changes, a type checker that runs
costs time on every call, and a linter that changes your program is frightening.

TJS's bet is that each of those reasons has weakened:

- **The committee.** TJS does not need one. The fixes ship in a transpiler, so the list can
  grow without waiting on the language standard, and the `.tjs` extension keeps every new rule
  away from code that did not ask for it.
- **Performance.** Validation runs on each call, checking the arguments and the result, and
  its cost is proportional to the shape being checked: about one and a half to two times the
  cost of the bare call for a trivial function, and invisible when the function does real
  work. A function that
  is trivial and hot can be marked `!` to skip validation. The numbers and the guidance are
  in the [performance guide](/performance/). Validation at a boundary is also something
  people already do anyway, by hand, and worse.
- **A linter that changes your program.** TJS is not one. It is a different file type you
  choose on purpose, its changes are documented rules rather than a tool's guesses, and every
  change has a named way back to JavaScript's behaviour (the third commitment below).

And the number of footguns that have been a lint rule for fifteen years (flagged, argued
about, never removed) is the size of the opportunity.

---

## What "inside JavaScript" actually means here

Three commitments, and they are testable rather than aspirational.

**1. TJS accepts all of JavaScript.** Every JavaScript program is accepted by the TJS
toolchain. As a `.js` file it keeps JavaScript's meaning exactly. Renamed to `.tjs`, it still
parses unchanged, but `==`, `typeof` and the other fixes take effect. **The extension is the
gate**, borrowed from `.mjs`, and nothing inside the file has to be remembered or configured.
This is guarded rather than promised:
[a test in the TJS repository](https://github.com/tonioloewald/tjs-lang/blob/main/src/lang/subset-invariant.test.ts)
fails if TJS ever rejects code that plain JavaScript accepts.

**2. Types are examples that survive.** Instead of a separate type language that is erased,
a type is a **value**:

```tjs
function greet(name: 'Alice'): 'Hello, Alice!' {
  return `Hello, ${name}!`
}

const result = greet(42)
console.log(greet('Bob'))           // Hello, Bob!
console.log(isMonadicError(result)) // true
console.log(result.message)         // Expected string for '…greet.name', got number
```

`'Alice'` is not a string-literal type. It is an example, and it widens to "a string", so
`greet('Bob')` is fine and `greet(42)` is refused at run time.

The refusal is **returned, not thrown**: `greet(42)` hands back an error value instead of
raising an exception. A bad argument then cannot unwind through code that was never written
to expect it; you check for it with `isMonadicError(x)` where you care, and the runtime also
keeps a log of recent type errors so an ignored one is not lost.

The return annotation is a worked example: when the file is transpiled, TJS calls
`greet('Alice')` and checks that the answer really is `'Hello, Alice!'`. Change the template
to `Hi, ${name}!` and the transpile (on this page, through `tjs()`, or with `tjs check`) stops
with "Function signature example is inconsistent": the file fails its own test before any of
it runs. (The `tjs run` command reports the failure but still runs the file; that gap is
known.) Because the example really is called, a function whose example call should not
happen at build time, one that writes files or calls a server, declares its return type with
`:!` instead, which states the type without running anything.

Because the example stays a real value, the one annotation serves as documentation, a
runtime contract, a test, and the source of a JSON Schema, the standard format that other
tools (API validators, form builders, LLM tool definitions) read to know what a function
accepts. One artifact rather than four that drift.

**3. The escape hatches are named and ugly.** Every fix can be opted out of, one place at a
time, through something greppable and deliberately unattractive:

- `LegacyTypeOf(x)`: JavaScript's `typeof`, where `null` is `'object'`.
- `DangerousLegacyEquals(a, b)`: JavaScript's converting `==`.
- `LegacyDate(x)`: a real `Date`. A `.tjs` file refuses `new Date(…)`, because a `Date` is a
  mutable object with a time zone hidden inside it; TJS offers `Timestamp` instead, and
  `LegacyDate` when you need the real thing.
- `LegacyDefault({ … })`: JavaScript's all-or-nothing parameter default. In a `.tjs` file an
  object-literal default fills in each missing member, so `f({ x: 5 })` with a default of
  `{ x: 0, y: 0 }` gets `{ x: 5, y: 0 }`; `LegacyDefault` gives you `{ x: 5 }` back.

A confession, not a suppression:

```tjs
console.log(typeof null)                     // null
console.log(LegacyTypeOf(null))              // object, JavaScript's answer
console.log(DangerousLegacyEquals('5', 5))   // true, JavaScript's converting ==
```

Search a codebase for `Legacy` and `Dangerous` and you have the complete list of places that
still depend on the old behaviour. You can adopt TJS one file at a time and opt out one
construct at a time, but there is deliberately no quiet project-wide switch that turns the
fixes off.

---

## Standing on their shoulders

The previous attempts are why this is possible, not competition for it. Crockford's list is
still the list. `use strict` and ESM proved the inside-the-language route works and is
survivable. TypeScript did the adoption research the hard way and established that a superset
with gradual typing is something working programmers will accept.

TJS is what you get by taking those lessons seriously at the same time: fix the bad parts
rather than flagging them, keep the fixes in the language rather than in a config file, and
let the types live long enough to be useful.

The rest of this book takes those fixes one at a time. Three pages elsewhere on the site
cover the same ground from other directions:

- **[TJS for JavaScript Programmers](/TJS-FOR-JS/)** (a standalone guide, outside this
  book) is the practical tour of what is fixed and how.
- **[TJS for TypeScript Programmers](/TJS-FOR-TS/)** (in the TypeScript book) covers
  migration and interop.
- **[The difference table](/tjs-vs-typescript/)** (in the TypeScript book) lists every
  divergence. It is generated from executable rows, so each claim on it is run against
  `tsc --strict` and TJS on every build rather than asserted here.
