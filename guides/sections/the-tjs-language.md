<!--{"pin": "top", "order": 40, "book": ["default", "language"]}-->

# The TJS Language

Why TJS exists, the principles it will not bend, its declarations and syntax, and the design notes behind the harder decisions — the reference half of the language, where the TJS section is the practical half.

<!-- TODO review -->

## How to read this part

The chapters fall into three groups, and they are listed in the order to read them.

**The argument** — [Why TJS](/why-tjs/) and [Design Principles & Invariants](/PRINCIPLES/).
Read these first. Why TJS explains what twenty years of attempts to fix JavaScript left on
the table; the principles are the rules every later decision is held to, chiefly that TJS
must accept every legal JavaScript program and every legal AJS program. When a rule
elsewhere in the book looks strange, it is usually one of these invariants at work.

**The language** — [Declarations](/declarations/), the [TJS Syntax Reference](/TJS-SYNTAX/)
and [Dictionary Defaults](/dictionary-defaults/). This is the reference you will come back
to. Declarations covers `Type`, `Generic`, `Enum`, `Union` and `FunctionPredicate`; the
syntax reference covers everything else: parameter examples, return examples, `==`,
`const!`, `!.`, polymorphic functions, `extend`, `wasm`, and the named escapes (`LegacyDate`,
`DangerousLegacyEquals`, `LegacyDefault`, `LegacyTypeOf`) for the places where you really do
want JavaScript's old behaviour. Dictionary defaults gets a chapter of its own because it is
the one place where the same source means something different in TJS and in JavaScript.

**The design notes** — everything from Type identity onwards. These are for readers who want
to know why a decision went the way it did, or who are about to change one: who answers
"does this value satisfy this type", what may be shared between modules, where the type
system is heading, why `given` exists beside `switch`, and how the parser is being rebuilt in small
pieces. None of them is needed to write TJS.

After this part you should be able to read any TJS signature and say exactly what it
accepts, what it returns, and what it checks at runtime; know which JavaScript behaviours
`.tjs` changes and how to get each one back at a single site; and know which document to
open when the answer is not in your head. If you would rather learn by running code, start
with the [Basics](/tjs-basics/) examples and come back here when a question comes up.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Why TJS](/why-tjs/)
- [Design Principles & Invariants](/PRINCIPLES/)
- [Declarations](/declarations/)
- [TJS Syntax Reference](/TJS-SYNTAX/)
- [Dictionary Defaults (Merge-on-Partial Object Arguments)](/dictionary-defaults/)
- [Type identity: who answers "does this value satisfy this type?"](/type-identity/)
- [Runtime fusion: what may be shared between TJS modules, and what may not](/runtime-fusion/)
- [North star: JSON-Schema + predicates as the single source of truth for types](/type-system-north-star/)
- [FunctionPredicate: Design Notes](/function-predicate-design/)
- [Case study: fixing switch](/case-study-switch/)
- [Small scoped parsers, not a rewrite](/parser-primitives/)
- [Ambient Contracts — probe reality, derive verified predicate contracts](/ambient-contracts/)
- [Native Engine Integration: TJS in V8 or JavaScriptCore](/native-engine-integration/)
- [tjs-lang Technical Context](/CONTEXT/)
<!-- /toc -->

<!-- prettier-ignore-end -->
