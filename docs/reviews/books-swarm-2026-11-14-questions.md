# Book swarm, 2026-11-14: verified defects and owner questions

The book swarm (plan on Virta #3128) wrote 19 chapters: Parts II and III of the TJS book, the AJS
book's Writing Agents tutorial and Sandbox chapter, and Going Back. Its writers and critics
reported about 200 defects and 78 questions. Four verification agents deduplicated them and
reproduced each one against `6e601469`. This file records the outcome; the cards hold the
details.

## Defects filed

Security: #4099 (a guest can put an own `__proto__` key into the result through
`Object.fromEntries` or `JSON.parse`).

Correctness, AJS: #4100 (a string-union member accepts `undefined`), #4101 (an unknown type
name drops the contract), #4102 (an entry that falls off the end returns `undefined`), #4103
(assigning to an undeclared name declares it), #4104 (`responseType: 'text'` still parses
JSON), #4105 (`new Error('x')` is a no-op), #4106 (`| undefined` on a parameter is ignored).
Diagnostics: #4107.

Correctness, TJS: #4108 (a plain array passed to a typed-array wasm parameter corrupts memory),
#4109 (wasm function names collide across files), #4110 (`Is({a: undefined}, {b: undefined})`
is true), #4111, #4112, #4113, #4114, #4115, #4116, #4117 (wasm gaps), #4118 (configuration
depends on load order), #4119, #4120. Diagnostics: #4121.

Tooling: #4122 (the import resolver's `rewriteImports` is literal-blind), #4123 (`.d.ts` for a
polymorphic function), #4125 (no tool passes a `ModuleLoader`), #4126.

Already tracked, with new detail added: #3992 (`tjs emit --unsafe` is also literal-blind),
#4098 (`Error()` has two implementations; one listed case did not reproduce). Closed as fixed:
#3836. Site examples outside the books: #4124.

## Owner questions

Each needs a decision. The first group touches 0.14's language or VM surface.

1. **`extend` on an integer literal.** `7.double()` works, but it is not valid JavaScript.
   Support and document it, or remove it so TJS stays a JavaScript superset? (TJS-SYNTAX's
   extend section waits on this.)
2. **AJS assignment to an undeclared name** (#4103): refuse it, as a read is refused? And a
   top-level `const`: refuse it where it is declared, not where it is read?
3. **AJS entry with no `return`** (#4102): return `{}` as a bare `return` does, end with an
   error, or keep `undefined`?
4. **AJS helper return annotations.** `h(x): ''` is silently ignored. Enforce it or refuse it?
5. **AJS object defaults.** A partial object against `opts = { x: 0, y: 0 }` is refused where
   JavaScript accepts it. Intended?
6. **AJS values the native VM must keep.** `let x` starts as `null`, an `undefined` result field
   is dropped, `undefined` in an array becomes `null`: promises, or current behaviour only?
7. **`MonadicError` as a user constructor.** It is in scope in every `.tjs` file and one guide
   uses `new MonadicError(…)`. Support it, or stop exposing it?
8. **`e: Error` and `d: Date` as parameter types.** Make them runtime types, or keep the warning
   and stop teaching them?
9. **Dispatch.** Refuse a plain-object variant beside a named-Type variant of the same arity
   (#4111)? Give constructor overloads the same ambiguity checks as functions? Warn on
   `#private` or `super()` in multi-constructor classes?
10. **Dictionary defaults.** Should object-literal methods merge them, as declarations do?
11. **Testing.** Should `tjs check` report an inconclusive count, and fail on a ReferenceError in
    a test body (#4120)? Should async signature examples be reported skipped rather than passed
    (#3826)? Should the CLI runner support `await` (#3828)? Share `mock` state across tests (the
    CLI) or rebuild it per test (the doc site)?
12. **The linter in the CLI.** Should `tjs check` run `lint()` (`safe-assign-*`,
    `dict-default-excess-key`), and should `TjsStrict` raise them to errors?
13. **Runtime configuration** (#4118): one behaviour whatever the load order? Fix `callStacks`
    (the pop sits after the `return`)? Remove the unused `requireReturnTypes` and deprecate
    `debug`?
14. **WASM.** Refuse a non-typed-array argument at run time (#4108)? Warn on a non-type
    annotation in a `wasm function`? Wire composition into `tjs emit` and the Bun plugins
    (#4125), or keep it API-only? Export `ModuleLoader` from `tjs-lang/lang`?
15. **Converted files.** Should `tjs emit`, `check`, `run` and `types` honour the
    `/* tjs <- … */` marker, as the Bun plugin does (#3842)? It changes CLI output for every
    converted tree.
16. **Bun plugin.** Should a `.ts` import from a `.tjs` file go through `fromTS`? Today Bun erases
    its types unchecked.
17. **httpFetch in browsers.** `redirect` and `location` are always 0 and null there: drop that
    result in browsers, or document it as server-only?
18. **AJS gaps.** A `sort` comparator or numeric sort? Input-validation errors that name the
    field?
19. **Types.** Should `Union` and `Enum` unwrap boxed primitives as parameters do (#4119)? Should
    `:?` hint at integer versus float?
20. **Book presentation.** Teach one `Type Name = example` spelling and fold Declarations into
    Types by Example? May public pages cite Virta card numbers? Should the site's `ajs` fences
    accept more run options (timeoutMs, quotas, maxHeapBytes)?
21. **Import resolver docs.** Retire guides/playground-imports.md, or rewrite it as the
    `tjs-lang/import-resolver` reference?
22. **Ledger.** Add an ASSUMPTIONS row: "a native TJS project can leave by `tjs emit` with its
    behaviour intact" (tested on two modules only)?
