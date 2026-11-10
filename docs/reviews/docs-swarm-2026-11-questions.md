# Docs swarm 2026-11: the owner's questions, triaged

The docs swarm (run `wf_715fcf4e-edc`, record in `docs-swarm-2026-11.json`) left 765 questions
for the owner across 134 chapters. This file merges the duplicates, sorts them into four kinds,
and tests the ones that claim the code is wrong. Triaged 2026-11-10 against `a477e222`.

## Summary

| Class | Questions | Items after merging |
| ----- | --------: | ------------------: |
| A. Bug or inconsistency in the language, VM or tooling | 256 | 59, plus the A6 message table and the A7 false-docs list |
| B. Design decision for the owner | 131 | 60 |
| C. Editorial choice for the edit pass | 307 | grouped by book |
| D. Noise: already answered, or fixed by a later revision | 63 | 22 lines |
| Left out: already filed as #3982, #3983, #3984 | 8 | 3 |
| **Total** | **765** | |

The `failing` list in the input has five entries: three are the filed cards, and the other two
are closed (see D).

All 59 numbered A items were reproduced, wholly or in part, except where an item says
otherwise. Four claims did not reproduce, and two were not tried (A8). Every row in A6 and
every claim in A7 was checked against the code. Most A items came up in only one or two
chapters, so a fix usually means changing one or two pages afterwards.

How the repros were run: bun scripts in the session scratchpad, importing `transpile` from
`src/lang/core`, `AgentVM` from `src/vm/ast`, `tjs` from `src/lang/index` and `fromTS` from
`src/lang/emitters/from-ts`, plus `bun src/cli/tjs.ts check|run|emit|test|convert`. In the AJS
repros, "run" means `transpile(src).ast` followed by `vm.run(ast, args, { fuel: 10000 })`.

---

## A. Bugs and inconsistencies (most severe first)

### A1. Sandbox and VM correctness

**A1.1 A helper can read the agent's run arguments by name.** REPRODUCED. Chapter: ajs-llm-prompt.
`function g(x) { return x + n }` plus `function f({ n = 3 }) { const d = g(1); return { d } }`,
run with `{ n: 10 }`, returns `{ d: 11 }`. If the free name is not an argument, it reads `null`
without complaint. Docs promise that helpers see only their own parameters. The fix is either
for the transpiler to refuse free identifiers in helpers, or for the VM to stop resolving run
arguments inside `callLocal`.

**A1.2 `agentRun` checks neither the sub-agent's input schema nor its declared result.**
REPRODUCED. Chapter: CONTEXT. With sub = `function double({ n: 0 }): { n: 0 } { return { n: n + n } }`,
`agentRun({ agentId: sub, input: { n: 'x' } })` returns `{ n: 'xx' }`. The same AST run directly
by `vm.run(sub, { n: 'x' })` gives `Input validation failed`. This is a sibling of #3834.

**A1.3 With an allowlist set, the built-in fetch reaches loopback and private addresses.**
REPRODUCED. Chapter: safe-eval. A `Bun.serve` on `127.0.0.1:<port>` and
`context: { allowedFetchDomains: ['127.0.0.1:<port>'] }`: `httpFetch({ url })` returns the
server's body. Private ranges are refused only when there is no allowlist at all. Decide whether
the private-range screen should apply whatever the allowlist says, or whether listing a private
host is a deliberate opt-in. If it is an opt-in, the docs should say so.

**A1.4 `timeoutMs` does not stop a run that only computes.** REPRODUCED. Chapter: fuel-limits.
`while (n < 3000000) { n = n + 1 }` with `{ fuel: 1e9, timeoutMs: 200 }` runs to completion in
2.5 s and returns `{ n: 3000000 }`. The timer cannot fire while only microtasks run. Either
check the clock at the step funnel, or document that fuel is the compute budget and the timeout
covers IO only. The chapter now says the latter.

**A1.5 A `pure` custom atom's return value skips the membrane.** REPRODUCED. Chapter:
ajs-capabilities. `defineAtom('mkMap', s.object({}), s.any, async () => new Map(), { effects: 'pure' })`:
the live `Map` lands in guest state and in `run.result` (`result.m instanceof Map` is true). The
guest value domain is supposed to be closed (`guest-values.test.ts`). A mis-tagged host atom
opens it.

**A1.6 An AJS computed key is silently renamed.** REPRODUCED. Chapter: patterns.
`const o = { [k]: 1 }` with `k = 'z'` gives `{ o: { k: 1 } }`. This is silent wrong output, not
a refusal.

**A1.7 A computed key in a TJS dictionary default uses the identifier's name.** REPRODUCED.
Chapter: dictionary-defaults. `const k = 'z'; function cc(opts = { [k]: 1, b: 2 })` makes
`cc({ b: 3 })` return `{"b":3,"k":1}`. A call inside an array member passes `tjs check` and
fills in `null`: `opts = { at: [tick()], by: '' }` gives `{"by":"x","at":[null]}`.

### A2. TJS and TypeScript: silent wrong behaviour

**A2.1 A subclass that calls itself in a static initializer builds the parent class.** REPRODUCED.
Chapter: ts-classes. Under TjsStrict, `class Circle extends Shape { … static unit = Circle(1) }`
makes `Circle.unit` a MonadicError, `Expected string for '…Shape.constructor.name', got number`.
The emitted `Circle.__tjs_callable` is inherited from Shape through static inheritance.

**A2.2 `extend` rewrites the wrong receiver.** REPRODUCED. Chapter: local-extensions.
`rows[1].last()` becomes `rows__ext_Array.last.call([1])` (ReferenceError
`rows__ext_Array is not defined`). `v2.clamp()` becomes `v__ext_Number.clamp.call(2)`. The
array scan does not look at what comes before `[`, and the number pattern has no left word
boundary (`transformExtensionCalls` in parser-transforms.ts).

**A2.3 Polymorphic dispatch picks the wrong variant.** REPRODUCED. Chapter: polymorphic-functions.
Declared as `g(n: 0.0)`, `g(a: 0, b: 0)`, `g(n: 0)`, the call `g(42)` returns `'float'`. The sort
comparator returns 0 across different arities, so the order it produces is not consistent.

**A2.4 `const!` misses `**=` and `Object.assign`.** REPRODUCED. Chapter: const-and-bang.
`const! L = { m: 2 }; L.m **= 2; Object.assign(L, { m: 9 })` compiles. `assignRe` in
`transformConstBang` lists every compound operator except `**=`. On a Map or Set it refuses
`set` but not `delete`, `clear` or `add` (reported, not re-run). Nested writes and `push`
compiling is the documented shallowness, not this bug.

**A2.5 `const!` matches the name across the file, not the scope.** REPRODUCED. Chapter:
const-and-bang. `const! config = {…}` plus `function f(config) { config.port = 1 }` is refused:
"Cannot mutate immutable binding 'config'". That is a false rejection of a different binding.

**A2.6 `tjs emit --unsafe` writes JavaScript that does not parse and does not drop validation.**
REPRODUCED. Chapters: TJS-FOR-TS, running-tjs, ts-build-and-tooling, ts-publishing-a-library.
For `export function greet(name: 'x'): 'Hi x'`, both `-o greet.js` and stdout end with a
fragment of the metadata JSON (`},\n "required": true …`). Importing it in node gives
`SyntaxError: Unexpected token ','`. `--help` says both "Strip __tjs metadata" and "Emit
without validation (production)". The book now leaves the flag out.

**A2.7 Signature examples that are never run, but report green.** REPRODUCED. Chapters:
declarations, higher-order-functions, things-that-take-time, ts-async-functions,
ts-json-boundary, ts-the-full-picture. These all pass `tjs check` while wrong:
`async function slowDouble(n: 21): 99` (and `tjs test` prints `✓ slowDouble signature example`),
`function dist(a: Point, b: Point): 999.0` (no test runs when a parameter is a declared Type),
and `function ap(f = (x) => x, n: 5): 0` (a function-valued example drops the test). The
comment at js-tests.ts:686 says this failure "will be reported", and it is not. The async case
is the worst of the three, because it is reported as passing.

**A2.8 Converted TypeScript types that are checked by nothing, even under TjsStrict.** REPRODUCED.
Chapters: TJS-FOR-TS, generic-dts-design, ts-advanced, ts-converting-a-project,
ts-generic-functions, ts-patterns, ts-publishing-a-library, ts-type-transformation,
ts-union-types. All of these were run through `fromTS` then `tjs`, with `/* @tjs TjsStrict */`:
- an enum-typed parameter becomes a bare `c` with a TODO comment, so `label(42)` returns 42
- a discriminated union becomes an empty `Type`, so `area('nope')` returns 1
- an inline literal union `mode: 'on' | 'off'` is dropped, so `setMode('sideways')` returns 'sideways'
- a tuple `[number, string]` becomes `[0.0, '']`, so `t([1, 2])` passes
- `interface Box<T>` with `unbox(b: Box<number>)` loses the type argument, and the emitted
  `Box.check` call throws `Box.check is not a function`
- `d: Date` becomes `d: new Date()`, which `graduate` then refuses
- a JSDoc comment before a top-level function is dropped, though TJS-FOR-TS still says
  doc comments carry over

The converted `Generic` declaration also loses `T` (`value: any`).

**A2.9 `p: TEmail | null` on a parameter drops the `| null`.** REPRODUCED. Chapter:
built-in-types. `f(null)` returns `Expected TEmail … got null`. Inside a Type example the same
union works.

**A2.10 An imported module used as a type checks nothing, with no warning.** REPRODUCED.
Chapters: built-in-types, ts-json-boundary, TJS-FOR-TS. `import { Timestamp } from 'tjs-lang'`
and `function when(t: Timestamp)` make `when('nonsense')` return 'ran'. `TimestampType` works
(NOT REPRODUCED: TJS-FOR-TS's claim that it does not resolve). Two related reports were not
re-run: an undefined name as a Type member is accepted as `{}`, and `placedAt: Timestamp` puts
~45 namespace functions into the JSON Schema.

**A2.11 `LegalDateType` accepts impossible dates.** REPRODUCED. Chapter: built-in-types.
`LegalDateType.check('2024-02-30')` is true, while `LegalDate.isValid('2024-02-30')` is false.
It uses `Date.parse`, so the result also depends on the JS engine. This is a one-line fix:
delegate to `LegalDate.isValid`.

**A2.12 The inline runtime and the real `Type` disagree on schema and strip.** REPRODUCED.
Chapters: schema-validation, type-identity, ts-from-zod, ts-json-boundary. For
`Type Pt { example: { x: 0, y: 0 } }`, the inline `toJSONSchema()` writes
`additionalProperties: false`, while `.check` accepts extra keys and the real `Type()` writes
`true`. The inline `strip` is shallow (`{customer:{name:'a',pw:'x'}}` keeps `pw`), and the real
one is deep. In a Type example, `'a' | null` accepts `'zzz'`. Live pages run the inline copy.
`docs/type-identity.md` says the inline stub is the contract, so decide which side moves.

**A2.13 `.toJSONSchema()` and `.strip()` exist only if the declaring file mentions them.**
REPRODUCED. Chapters: schema-validation, type-identity. With no `.toJSONSchema(` in the source,
`typeof Pt.toJSONSchema` is `'undefined'`, so an importer gets "is not a function" (js.ts ~2544).

**A2.14 A predicate Type exports no schema at all.** REPRODUCED. Chapters: predicate-types,
ts-from-zod. `Type Even { example: 2, predicate … }.toJSONSchema()` is `{}`, not even
`{ type: 'integer' }`. With a description, an object example and a predicate, `toJSONSchema()`
is `{}` and `strip` passes every key through. A comment at parser-transforms.ts:1966 promises
"the $predicate schema path for free".

**A2.15 `functionMetaToJSONSchema` misdescribes parameters.** REPRODUCED. Chapter: ts-from-zod.
A parameter typed with a declared Type comes out as `{}`. A dictionary default
`opts = { notify: false }` comes out with `required: ['notify']` and
`additionalProperties: false`, which is stricter than the function, since merge-on-partial
accepts `{}` and passes extra keys through.

**A2.16 `.d.ts` output that TypeScript rejects or misreads.** REPRODUCED (four of five).
Chapters: ts-from-zod, ts-publishing-a-library, function-predicate-design, generic-dts-design.
- `{ email: '' | undefined }` becomes `email: string | undefined`, a required key, not `email?`
- `Union Dir …` plus `go(d: Dir)` declares `go(d: Dir)` and never declares `Dir`
- `FunctionPredicate Mapper<T = 0>` becomes `type Mapper<T = 0>`, a literal-type default
- a `Generic` with a `declaration` block emits only the interface, with no value for its
  factory, so a TS caller gets TS2693

The fifth, Enum members not declared, was not run.

**A2.17 `FunctionPredicate` checks almost nothing.** REPRODUCED. Chapters: type-system-north-star,
function-predicate-design, TJS-SYNTAX, declarations, higher-order-functions.
- `Formatter.check(Age)` is true: any callable passes, including a Type.
- In the function form, the inline stub keeps no metadata: `FunctionPredicate H(shape, 'desc')`
  gives `H.params` = `{}`, and `H.check` accepts a 3-argument function. The real runtime in
  `src/types/Type.ts` reads `fn.__tjs`. It also maps `meta.unsafe` where it means
  `meta.unsafeReturn` (reported, not re-run).
- `fn: Unary` (a FunctionPredicate name) used as a parameter warns and checks nothing, so
  `apply(5)` returns 'ran'. declarations.md says a declared name can stand wherever an example
  can.
- `format: shout`, where `shout` is a declared function, IS shape-checked, but `tjs check`
  warns that it "could not be resolved", and suggests an object predicate that would reject
  functions.

**A2.18 Extra constructors skip field initializers and `super()`.** REPRODUCED. Chapter:
polymorphic-constructors. A class with `label = 'default'` and a second constructor: `P('abc').label`
is `undefined`.

**A2.19 A defaulted parameter does not let a variant match fewer arguments.** REPRODUCED.
Chapters: polymorphic-functions, polymorphic-constructors. With `opt(a: 0, b = 1)` and
`opt(s: '')`, the call `opt(1)` returns `no matching overload`, although the metadata lists
`b?` as optional. The dispatcher requires an exact `__args.length`.

**A2.20 A bare Capitalised assignment inside a function declares a local const.** REPRODUCED.
Chapter: js-footgun-fixes. `Limit = 3`, then `function bump() { Limit = 4 }`, then `bump()`: `Limit`
is still 3, with no warning. TJS-FOR-JS and TJS-SYNTAX say a later `Foo = …` throws, which
matches neither the top-level case (a compile error) nor this one.

**A2.21 `obj!.method()` loses `this`.** REPRODUCED. Chapter: const-and-bang. `obj!.get()`, where
`get` reads `this.n`, throws `undefined is not an object (evaluating 'this.n')`. It is emitted
as `__tjs.bang(obj,'method')()`.

### A3. AJS: wrong results and misleading failures

**A3.1 Callback index argument.** REPRODUCED. Chapters: ajs-llm-prompt, loop-filter, DOCS-AJS.
`items.map((x, i) => i)` returns `[null, null]`, and `items.map((x, i) => x + i)` fails at run
time with `Output validation failed for 'map'`. DOCS-AJS says `i` "gives `undefined`".
Recommendation: refuse a second callback parameter at transpile time.

**A3.2 `let g = helper` is silently undefined.** REPRODUCED. Chapter: DOCS-AJS.
`let g = h; return { g }` returns `{}`. It should be a transpile error, like other functions
used as values.

**A3.3 An empty-object default closes the parameter.** REPRODUCED. Chapter: multi-agent-pipeline.
`function f({ writer = {} })` refuses `{ writer: { a: 1 } }` with
`Input validation failed: args do not match expected schema`, not only an AST argument.

**A3.4 `vm.run` reports every warning twice.** REPRODUCED. Chapters: ajs-atoms, ajs-host.
`consoleWarn({ message: 'W' })` gives `warnings: ["W","W"]`. `ctx.warnings` is the same array
(vm.ts:579) and is merged again at vm.ts:715.

**A3.5 `console.log/warn/error` in AJS source do nothing.** REPRODUCED. Chapters: ajs-atoms,
ajs-llm-prompt, safe-eval. `console.error('bad')` does not stop the run. No warning appears,
and no trace entry, though the runtime doc comment (~8173) says they do. Only the
`consoleWarn`/`consoleError` atoms work, and `SafeCapabilities.console` looks unused. Options:
lower `console.*` to those atoms, or refuse it.

**A3.6 `getToolDefinitions` drops integer types.** REPRODUCED. Chapters: ajs-host, ajs.
`maxPrice = 50` comes out as `maxPrice: {}`, because `typeDescriptorToJsonSchema` (core.ts) has
no `integer` case. This affects the tool definitions a model sees.

**A3.7 Atoms that run whole programs keep a 1 s per-call timeout.** REPRODUCED. Chapter: ajs-atoms.
A sub-agent whose IO atom waits 1.5 s (with its own `timeoutMs: 5000`) fails under `agentRun`
with `Atom 'agentRun' timed out`. The same applies to `runCode`, `memoize` and `cache`.
Recommendation: give these no timeout of their own, as `seq`/`if`/`while` have none.

**A3.8 `Schema.response` contradicts the rest of AJS.** REPRODUCED. Chapters: llm-structured-output,
json-processing. `Schema.response('p', { price: 0.0 })` gives `{ type: 'integer' }`, while the
parameter `{ x = 0.0 }` means float. It sets `strict: true` without
`additionalProperties: false`, so `Schema.isValid` accepts `{ a: 'x', extra: 1 }`, and OpenAI
strict mode would reject the schema.

**A3.9 `interpretRuleResult` misreports a rule that did not finish.** REPRODUCED. Chapter:
universal-endpoint. A rule agent out of fuel yields the reason "rule returned an object whose
`allow` is not a boolean — denying". The denial is correct and the reason is wrong. The
function's own docstring says it tells these cases apart.

**A3.10 The transpiler blames a "condition" that is not there.** REPRODUCED. Chapters: ajs-atoms,
ajs-host, loop-filter, math-operations, TJS-FOR-TS.
`items.filter((x) => x > 1).map(…)`, `items.filter(…).length`, a sort comparator and
`Math.max(...xs)` all fail with `Unsupported expression type in condition: ArrowFunctionExpression`
(or `SpreadElement`). Through `Eval`, the same failure reports `fuelUsed` equal to the whole
budget. DOCS-AJS line 517 still recommends `filter(...).length`, which is this refused shape.

**A3.11 `String(5)` and `Number(s)` point to a fix that does not exist.** REPRODUCED. Chapters:
DOCS-AJS, math-operations. The message is "'Number' takes named arguments: write
Number({ name: value, … })". Following it gives `Unknown Atom: Number`.

**A3.12 Smaller AJS diagnostics.** REPRODUCED. Chapters: safe-eval, vm-budgets, TJS-FOR-TS, patterns.
- Eval error positions are one line too high: `return )` on line 1 reports `<source>:2:7`.
- Forgetting `return` gives "The keyword 'let' is reserved".
- A transpile failure reports `fuelUsed` equal to the budget.
- The `argsMaxBytes` refusal names "the 4194304-byte membrane budget", and raising
  `membraneMaxBytes` does not help.
- The heap refusal says "holds ~183MB" when it means "would hold".
- `x instanceof Array` fails at run time with "A function or builtin namespace is not a value".

### A4. Tooling and CLI

**A4.1 `check` and `emit` disagree about the same tests.** REPRODUCED. Chapters:
local-module-imports, running-tjs, ts-publishing-a-library, async-functions.
- A return example that calls a missing import: `check` exits 0, while `emit` reports
  `1 test(s) failed — Signature: one is not defined` and refuses without `--jfdi`.
- A sync function with a return example, plus a top-level `const x = await …`: `check` passes,
  and `emit` reports a failure ("x is not defined").

PRINCIPLES.md says an un-runnable test is inconclusive, so `emit` should use
`tallyTestResults`.

**A4.2 `tjs run` does not load the TJS Bun plugin.** REPRODUCED. Chapter: local-module-imports.
In a directory with no bunfig, `tjs run main.tjs` importing `./mymath.tjs` fails with
"Syntax error … Export named 'add' not found".

**A4.3 `tjs emit` to stdout includes the test run's console output.** REPRODUCED. Chapter:
inline-tests-test-private-functions. The first line of `tjs emit f.tjs` is `TOP-LEVEL-OUTPUT`,
then `const __tjs_rt = …`. So `tjs emit f.tjs > f.js` writes a bad file.

**A4.4 The CLI on `.ts` files.** REPRODUCED. Chapters: ts-embedded-tests, ts-hello-typescript.
- `tjs test x.ts` parses TS as TJS: `private items: number[] = []` gives `Unexpected token`.
- `tjs convert` exits 0 on a failed embedded test.
- `tjs convert` reports the wrong line: `:8` for a `/*test` on line 5, while `tjs test` says `:5`.

NOT REPRODUCED: the report that `tjs run`/`tjs test` on a `.ts` file exit 0. Both exit 1 now.

**A4.5 `graduate`.** REPRODUCED. Chapters: ts-converting-a-project, case-study-switch.
- With a leading `TjsCompat` line, `graduate` returns the code unchanged, still carrying its
  `/* tjs <- … */` marker, with no notes.
- Its notes give line numbers one too low: a `switch` on line 5 is reported as "line 4".

**A4.6 A test containing `await` cannot run from the CLI.** REPRODUCED. Chapters:
things-that-take-time, ts-embedded-tests. `test 'awaits' { const v = await d(2) … }` is reported
by `tjs test` as inconclusive ("Module could not be executed for testing: Unexpected identifier
'd'"), and `check` exits 0. Per the chapter, the page's own runner handles it.

**A4.7 Syntax that does not parse.** REPRODUCED. Chapters: parser-primitives, ts-generic-functions,
inline-tests-test-private-functions.
- `Generic Box<T = () => 0> {…}` is a syntax error (only the fromTS route was fixed).
- `b: Box<[0]>` is `Unexpected token`.
- The return type `:! { id: '' } | { error: '' }` gives "Could not parse return type" and
  falls back to `any`.

**A4.8 The test harness.** REPRODUCED. Chapters: error-handling, lists, when-things-go-wrong.
- There is no `.not`: `expect(1).not.toBe(2)` throws.
- `toBe` is deep equality: `expect([1,2]).toBe([1,2])` passes, unlike Jest and the
  learn-chapter prose.

NOT REPRODUCED: "toEqual ignores asCompared". With a class defining `asCompared`,
`expect(Ts(1,0)).toEqual(Ts(0,1000))` passes. The original case may have used another route.

**A4.9 The two runners disagree about `mock { }`.** Partly reproduced. Chapter: TJS-SYNTAX.
Under `tjs test`, the mock body runs once: two tests that each expect `counter == 1` both pass.
The reported per-test behaviour in `generateTestRunner` (tests.ts) was not driven directly.

**A4.10 Emitted standalone modules have no flight recorder.** REPRODUCED. Chapter:
ts-build-and-tooling. Under plain `node`, an emitted module has `typeof __tjs.errors ===
'undefined'`, so doc-site code that calls `__tjs.clearErrors()` crashes once emitted.

**A4.11 `compat-scan` skips a missing clone without saying so.** Confirmed in code. Chapter:
postmortem-ts-emitter. See `scripts/compat-scan.ts:83`, `if (!existsSync(dir)) continue`.
That is the "green that cannot go red" shape the postmortem warns about.

### A5. Runtime helpers and emitted-code details

**A5.1 Ambient helpers exist only when something else pulls in the runtime.** REPRODUCED.
Chapters: TJS-SYNTAX, const-and-bang, function-predicate-design, hello-tjs, ts-json-boundary,
ts-validation. A `.tjs` file whose only line is `console.log(isMonadicError(1))` fails at run
time with "isMonadicError is not defined", while `check` passes. A class using `[tjsEquals]`
fails with "tjsEquals is not defined" unless the file also calls `Is`. That is a hazard for
live doc examples.

**A5.2 `MonadicError('msg')` without `new` throws.** REPRODUCED. Chapter: ts-json-boundary. The
error is "Cannot call a class constructor MonadicErrorImpl without |new|", although .tjs
classes are otherwise called without `new`.

**A5.3 Emitted code puts `__tjs.popStack()` after the `return`.** REPRODUCED. Chapter:
native-engine-integration. `tjs emit` of `function add(a: 0, b: 0): 0 { return a + b }` shows
`return a + b` on line 18 and `__tjs.popStack()` on line 19, so the pop never runs and the
64-slot ring fills with frames that have already returned.

**A5.4 Library types return a truthy reason string.** REPRODUCED. Chapter: declarations.
`TPositiveInt(-1)` and `.check(-1)` both return `"-1 is not positive"`, so
`if (TPositiveInt(n))` passes bad input. Types declared in `.tjs` return `false`.

**A5.5 `Type.name` returns the description.** REPRODUCED. Chapter: declarations.
`Type User { description: 'a user', … }` gives `User.name === 'a user'`.

**A5.6 `LegalDate.diffMonths` does not count complete months.** REPRODUCED. Chapter:
built-in-types. `diffMonths('2024-03-01', '2024-02-29')` is 1, while its docstring says
"complete months".

**A5.7 `configure({ maxErrors })` above 64 is silently capped.** REPRODUCED. Chapter:
error-history. With `maxErrors: 100` and 80 errors, `errors().length` is 64, because the ring
is allocated at the fixed `ERROR_BUF_SIZE`. Either make the option work or drop it.

**A5.8 WASM.** Chapters: wasm-functions, wasm-memory, wasm-simd.
- REPRODUCED: an unrecognised annotation becomes f64 silently. `wasm function half(n: I32)`
  returns 2.5 for 5. DOCS-WASM says such an annotation "would be a type error".
- REPRODUCED: a plain `Uint16Array` is not copied in, so `s(a)` with `a[1] = 9` returns 0.
  `__parseType` knows only four typed-array types.
- REPRODUCED: a plain JS array passed to a `Float32Array` parameter becomes the pointer, so
  `k([1,2])` returns 0, with no error and no record.
- REPRODUCED: `xs[i] = i % 2` inside `wasm {}` emits invalid WebAssembly ("a compiler bug —
  please report it").
- REPRODUCED: copied-array notices go to `globalThis.__tjs`. In a module, `__tjs.records({ source: 'wasm' })`
  returns 0 records where the global has 1. error-history.md says they all land in one ring.
- NOT TRIED: notices name an internal block id (`__tjs_wasm_1anfoz_0`), not the user's function.
- NOT TRIED: the `globalThis.__tjs_wasm_<name>` collision between two files that each declare
  `wasm function dot`.

### A6. Messages that tell the reader the wrong thing (all REPRODUCED)

| Message | Problem | Chapters |
| --- | --- | --- |
| `new Date()` remedy: `Timestamp.from(iso) // parse` | `Timestamp.from('2024-01-15')` is NaN; the parser is `Timestamp.parse` | date-formatting-with-import, safer-code, ts-json-boundary |
| `eval()` refusal: "Use `Eval()` from the TJS runtime" | `Eval` needs `import { Eval } from 'tjs-lang/eval'` | safer-code |
| `TjsClass` tombstone: "`new Point(1, 2)` still works" | `new` on a local class is a compile error | TJS-SYNTAX, js-footgun-fixes |
| `const! x = 3`: "`const!` adds DEEP immutability" | the check is shallow, as the docs say | const-and-bang |
| Dispatcher no-match: "Expected no matching overload for 'scale', got array of string" | reads backwards; same for constructors ("no matching constructor") | better-classes, polymorphic-*, ts-union-types |
| Nested element error names `xs[1]` for `[[1],['x']]` | should name `xs[1][0]`; a nested object names only the outer Type | array-types, ts-nested-objects, ts-patterns |
| `name?: string \| null` refusal: "Expected string \| undefined" | omits `null`, which is accepted | ts-patterns, ts-union-types |
| Array default: "Expected array of object for '…pts', got array of object" | expected equals actual; no member named | dictionary-defaults |
| Dict-default purity error ends "(TjsDictDefaults mode; disable with TjsCompat…)" | names an abolished directive | dictionary-defaults |
| Bang access error path is `bang.name` | no file, line or function | error-handling |
| Imported-type error: `reason: undefined` | TEmail's check returns a reason that never comes through | built-in-types |
| `/** Describe a number */` gives the description `"Describe a number */"` | stray `*/`, on plain functions too; variants lose theirs | polymorphic-functions |
| A call inside a `wasm function`: "Unsupported function call: Identifier." | does not name the callee (NOT TRIED) | wasm-functions |

### A7. Docs and comments that state behaviour the code does not have (verified)

The book chapters are fixed. These are in files the swarm could not edit:

- **CLAUDE.md**
  - The run timeout default "fuel × 10ms" is wrong (also eval.ts:187 and :365, and
    vm.ts:370). `new AgentVM().defaultRunTimeout` is 240000, that is, max(60 s, 2 × the slowest
    atom). Decide whether the code or the comments change: four minutes is long for an
    interactive `Eval`. Raised by 9 chapters.
  - `import { batteryAtoms } from 'tjs-lang/batteries'` and `import { configure } from
    'tjs-lang/lang'` both fail; neither is exported there.
  - "Both `llmBattery` and `vector` can be null if LM Studio isn't available": with no server
    they are objects, so the call fails at connect time. guides/examples/ajs/vision-ocr.md:125
    makes the same claim.
  - The Full Chain example claims `fn('a','b')` returns a type error. Default fromTS output
    gives `'ab'`.
  - vm-ast's size claim ("the transpiler is 75%") is stale: 137 KB against 324 KB.
  - The "isMonadicError needs installRuntime across files" claim is false: it is duck-typed.
  - parser-primitives is still called "(proposed)" here and in llms.txt.
- **DOCS-AJS.md** line 406 ("no string runs as code") contradicts `runCode`, and line 517
  recommends the refused `filter(...).length`.
- **DOCS-WASM.md** line 344 says `break`/`continue` work in a wasm block. Both are refused
  (`Unsupported statement type: BreakStatement`), and so is `&&`/`||`. Line 98 says a bad
  annotation is a type error (see A5.8). `v128_load`/`v128_store` are missing from the
  intrinsics list.
- **TJS-FOR-JS.md** line 388 says the built-in types ship "out of the box". In a .tjs file they
  must be imported. Line 400, `Type OptionalEmail Nullable(Email)`, is a syntax error; use
  `Type OptionalEmail { example: Nullable(Email) }`.
- **Source doc comments** that render in the API docs:
  - `llmPredict` (runtime.ts ~7433) teaches positional calls.
  - `cache` (~7955) caches `undefined`, because it has no `.return`.
  - `transformExtensionCalls` promises a `resolveExtension` fallback that does not exist.
  - The `projections` comment in runtime.ts (~111) is out of date.
  - `LintOptions.dictDefaultExcessKeys` says excess keys are "silently stripped".
  - The `[tjsEquals]` comment (runtime.ts ~94) says it controls `==`; `Eq` never reads it.
  - The type-identity.test.ts header says "~400 bytes" and "bare names".
  - dictionary-defaults section numbers cited in inference.ts, dts.ts, from-ts.ts and two tests
    no longer exist.
- **guides/sections/the-tjs-language.md** still lists parser-primitives as "Proposed, not started".

### A8. Not reproduced or not tried

| Item | Status |
| --- | --- |
| `helper: any` refuses an AST argument (ajs-host) | NOT REPRODUCED: it accepts the AST |
| `TimestampType` does not resolve in a signature (TJS-FOR-TS) | NOT REPRODUCED: it validates |
| `expect().toEqual` ignores `asCompared` (type-system-north-star) | NOT REPRODUCED (A4.8) |
| `Exactly('x').toJSONSchema()` is `{}` (ts-from-zod) | NOT REPRODUCED: gives `{"enum":["x"]}` |
| `tjs check` runs a test of a Type built from unresolved imports and counts it pass or fail, not inconclusive (built-in-types) | NOT TRIED: needs a module whose imports fail only at transpile time |
| `tjs run` reports a type error on a converted file without TjsStrict, while `tjs()` emits no check (ts-async-functions) | NOT TRIED: the reviewer gave no file |

---

## B. Design decisions

Options are given briefly, and a recommendation where the evidence points one way.

### AJS language and VM

1. **`async` and `var` are accepted silently, while `await` is refused** (DOCS-AJS, ajs-llm-prompt).
   Refuse `async`, or document it as tolerated. *Recommend refusing it:* ignoring it is silent,
   and the "VM safe, AJS friendly" rule puts this in the transpiler.
2. **The input contract** (DOCS-AJS). An entry with parameters refuses undeclared arguments
   (`additionalProperties: false`). A parameterless entry accepts anything. Should destructured
   entry parameters be enforced? *Recommend one rule for both:* a closed input either way.
3. **The catch binding is a string** (llm-code-solver, weather-api). `catch (e) { e.message }`
   reads `undefined`. Options: bind `{ message }`, or keep the capped string and have the
   transpiler flag member access on the catch parameter. *Recommend the second.* It keeps
   CLAUDE.md's "errors reach guest scope only as capped strings".
4. **A guest-chosen lookup key ends the run** (conditional-logic). `t[kind] ?? 'general'` with
   `kind = 'toString'` errors with "'toString' is a method". *Recommend own-property semantics*
   for computed reads, so that inherited names read as `undefined`.
5. **`httpFetch` drops the HTTP status** (itunes-search, llm-summarizer). Reproduced: a 404's
   body comes back as an ordinary string. *Recommend a `{ status, body }` response option.*
6. **A heap refusal is catchable** (safe-eval). Reproduced: `try` around a 96 MB build returns
   `caught`. Fuel exhaustion and timeouts end the run. *Recommend ending the run*, for the same
   reason rc.2 made boundary refusals halt: a guest that can catch a refusal can loop on it.
7. **`vm.run` throws for some host mistakes** (CONTEXT). A missing or expired token, an unknown
   AST version, a non-seq root, or a failed transpile throws `Procedure not found`; everything
   else comes back as `error`. Inside `agentRun` the same token is a catchable error. Keep the
   rule ("a mistake about WHAT is run throws"), or return everything.
8. **AgentError has no machine-readable kind** (ajs-host). Hosts branch on
   `message === 'Out of Fuel'`. Add a public `kind`, or declare the messages stable. *Recommend
   a `kind`:* membrane refusals already carry one internally.
9. **Eval/SafeFunction failures** (safe-eval). `result` is the AgentError object itself.
   *Recommend `result: undefined` whenever `error` is set.*
10. **Callbacks** (loop-filter). `map`/`reduce` take block bodies and `filter`/`find` do not.
    Helpers cannot be called inside a callback. There is no sort comparator ("sort on the
    host"?). Choose one rule.
11. **`Number()`/`String()` conversions, and primitive coercion** (`'5' * 2` is 10)
    (math-operations). Support them, or keep refusing them with a correct message (A3.11).
12. **A failed `llmPredict` still costs 100 fuel** (llm-chat). Reproduced. Intended?
13. **`storeVectorize`'s ignored `model` input** (ajs-atoms). Pass it through, or drop it
    (dropping it is breaking).
14. **The procedure store** (ajs-atoms, patterns). It is one process-wide Map, with no tenant
    scope and no count limit, and `procedureStore` is undocumented. Is there a host API for
    tokens, a per-host store, a count limit?
15. **Step-taking custom atoms** (ajs-capabilities) can only be called from the builder (v1
    ASTs). Is that the intended story, or should the docs discourage them?
16. **Export `holdRoot`** for atom authors that run nested steps (vm-budgets), or bless
    "accumulate nothing until the steps finish".
17. **A batteries `llm` capability** (predict returns a string) alongside `llmBattery`
    (lm-studio-setup). **`getBatteries({ baseUrl, llmModel, embeddingModel })`** for browser
    hosts, and preferring a vision-probed model for `llmVision` (mlx-setup, vision-ocr). Should
    `getBatteries` return `null` capabilities when the audit finds no server?
18. **`llmVision` does not check the reply against `responseFormat`** (vision-classification).
    Check it, or document that it does not.
19. **The JSON.parse failure text comes from the host engine** (json-processing). Normalise it?
20. **Helpers for hosts** (llm-code-generator): ship `atomsUsed(ast)`, or an effects summary,
    so embedders do not hand-roll the AST walk.
21. **The doc site's capabilities** (llm-code-solver): grant a `code` capability so `runCode`
    examples run live.
22. **Should models be taught declared results** (ajs-llm-prompt)? This needs a grok task
    first. The "gratuitous backticks" repair in ajs-grokkability.test.ts looks dead: delete it?
23. **An atom reference generator** with a freshness test, like `docs/tjs-vs-typescript.md`
    (ajs-atoms).
24. **Pattern and regex timeline** (pattern, string-processing):
    - Is regex still deprecated in 0.14 final, given that the transpiler warning (#2771) is not
      built?
    - Is 0.15 the target for removing it from the core?
    - Should the docs link to tosijs-pattern before it is on npm?
    - Does the design history stay in this page, or move to tosijs-pattern?
    - Is the builtin's name `Pattern`?
    - Should the guest-schema refusal stop recommending `regexMatch`?
25. **Native VM roadmap** (ajs-native-vm). Each of these is an open question:
    - Is `'wasm-unsafe-eval'` a requirement, or does the JS VM stay as a fallback?
    - Do the 150–300 KB estimates still hold now that tosijs-schema will sit above the VM?
    - Will the native VM read v1 ASTs?
    - What will the host atom API and the boundary encoding be?
    - Is there a threat-model doc to link?

### TJS language

26. **`TjsCompat` still validates parameters** (PRINCIPLES, date-formatting-with-import).
    Reproduced: `f('x')` on `f(n: 0)` returns a MonadicError. TJS-SYNTAX no longer says
    otherwise. Is that the intended meaning? Should the comment form `/* TjsCompat */` also
    work, which today it does not?
27. **The `safety` directive** (TJS-SYNTAX, safety-validation, TJS-FOR-TS, native-engine-integration).
    `safety none` works. `safety all` and the `?` marker are accepted no-ops, and `?` does not
    restore checks under `safety none`. `/* @tjs-unsafe */` emits the deprecated `unsafe` prefix.
    *Recommend deprecating `safety all` and `?`*, and having `@tjs-unsafe` emit the named escape.
    Decide whether `safety` is still taught next to "there are no mode directives".
28. **Should `tjs check` report inconclusive tests** (PRINCIPLES, date-formatting-with-import,
    inline-tests-test-private-functions, responding-to-the-reader)? Today it prints a plain ✓. A
    learn chapter with a broken example passes the documented check-then-run step, because
    `preview` is undefined. *Recommend an "N inconclusive" line.* A `preview` stand-in for
    learn fences is a related, smaller question.
29. **`tjs check` runs no lint rules** (dictionary-defaults-example). Run lint under
    `--max-warnings`, or add `tjs lint`. *Recommend running it in check.*
30. **`tjs check` executes top-level code**, so it makes real network requests (async-functions).
    Intended?
31. **`tjs run` does not enforce signature examples** (why-tjs). This is already in TODO.md.
    Should `check` catch a misspelled name or a `const` reassignment (values-and-names)?
32. **Typed setter parameters check nothing** (better-classes, ts-classes). *Recommend a lint
    warning.* Under TjsStrict too, or is validation planned?
33. **A bare `break` in a `given` arm ends the `given`, not the loop** (given-dispatch).
    *Recommend refusing it or warning on it.* It brings back the switch habit `given` was built
    to remove.
34. **`extend` scope** (local-extensions). Should the property-form arrow (`name = () => …`,
    silently dropped) be a compile error? Should integer receivers (`(7).clamp()`) and chained
    calls be rewritten? Should `export extend` be refused, or made a feature?
35. **Should `Array<number>` be accepted** (array-types)? Today it is `Unexpected token`, which
    pasted TS code will hit. At least suggest `number[]`. Also: should `const! { a, b } = …`
    and `''!.length` be accepted (both are syntax errors today) (const-and-bang)?
36. **A propagating domain error** (error-handling). There is no blessed way to make one. A
    `throw` inside a `try` with no `catch` works, but its path is only `try`. Bless that, or
    add a constructor? Is "TJS recommends returning an Error" the official position?
37. **`asCompared()` as public API** (honest-equality). Should it be taught to readers? A typed
    parameter `kind: ''` rejects `new String('cat')`, while `==` treats it as equal: intended?
38. **`LegacyExactly`/`LegacyNotExactly`** are plain `===`/`!==` (TJS-SYNTAX). Deprecate them?
    Name `DangerousLegacyNot` consistently (ts-converting-a-project)?
39. **Optional** (built-in-types). `Optional(T)` allows `undefined` but requires the key, while
    `T | undefined` lets it be omitted. Intended?
40. **`Timestamp`/`LegalDate`** (declarations). The main entry exports date modules, and
    runtime.ts exports same-named Types. Which does the book teach? Should the namespace work
    as a Type (A2.10)?
41. **Polymorphic constructors** (polymorphic-constructors). Constructor dispatch has no
    ambiguity check, and objects are told apart only by being objects. Should these be compile
    errors? Should the dispatcher's metadata list its variants, not `__args?: array`
    (polymorphic-functions)?
42. **Signature metadata** (required-vs-optional). `__tjs.params` reports `default: null` for a
    required parameter. A required parameter after an optional one is accepted without a
    warning (parser-params has an empty "warn but allow" branch).
43. **A return example for "returns a function"** (higher-order-functions). There is no
    spelling for it.
44. **Predicate fuel exhaustion** (predicate-types). A Type check and `validate` return false,
    while `compilePredicate` and `compilePredicateSchema` throw. Fail closed the same way
    everywhere?
45. **`try` without `catch`** and **`Type.strip`** (schema-validation). Should `strip` validate?
    Today it silently returns partial values.
46. **`'predicate'` in RecordSource** has no writer (error-history). Document it, or remove it.
47. **`__tjs_wasm_enabled = false`** (wasm-basics). Public knob, or internal?
48. **The error path prefix** (lists, ts-classes). `<source>:2:total.prices[1]` in a beginners'
    book, and line numbers from converted TJS rather than the reader's TS. Is a friendlier
    message, or a source map, wanted?
49. **The parser reassessment, step 4** (parser-primitives). Build expression extent, replace
    it with the narrower fixes the page lists, or close it. No decision is recorded.
50. **Observe mode** (PRINCIPLES). It does not exist. Is it planned, and is there a card?

### Tooling, TypeScript and publishing

51. **`tjs convert` exits 0 when an embedded test fails** (ts-build-and-tooling,
    ts-embedded-tests). *Recommend a non-zero exit, matching `emit`.*
52. **TjsStrict leaves converted return types `:!` (unchecked)** (ts-array-operations,
    ts-async-functions). Reproduced: `nums(): number[]` returning `['a']` passes. Should strict
    mode check returns, or emit `:?` for async results?
53. **The `.d.ts` emitter** (ts-build-and-tooling, ts-publishing-a-library).
    - Should checked functions return `T | MonadicError`, so TypeScript forces callers to narrow?
    - Should `tjs emit --dts` write `foo.tjs.d.ts` sidecars, which TypeScript picks up for
      `import './foo.tjs'`?
    - Should Type and Enum descriptions reach the `.d.ts` as JSDoc?
54. **MonadicError's `message` is not enumerable** (ts-the-full-picture). Reproduced:
    `JSON.stringify` gives no message. Add `toJSON`?
55. **`configure({ callStacks: true })`** records only the failing function (ts-runtime-validation).
    Intended?
56. **The CLI ignores the `/* tjs <- … */` marker on .tjs files**, while `tjs()` honours it
    (ts-converting-a-project). *Recommend honouring it.* That removes the "graduate before
    check" gotcha.
57. **`graduate` changes boxed-primitive truthiness** (ts-converting-a-project). Add a note
    when the file contains `new Boolean/Number/String`?
58. **Rewrite `.tjs` import specifiers to `.js` in `tjs emit`** (local-module-imports).
    Reproduced: it does not today. *Recommend doing it:* without it, emitted JS imports `.tjs`.
59. **Run CLI tests with imports resolved from node_modules** (lodash-utilities-with-import), so
    a package import does not make every test inconclusive.
60. **A Node-runnable CLI** (running-tjs). The bin is a Bun script. Requirement, or planned?

(The remaining B questions are duplicates of these, counted under the item they repeat.)

---

## C. Editorial choices for the edit pass

### Every book

- **The `<!-- TODO review -->` marker.** Twelve chapters ask whether to keep it, because the
  critic said strip it and the ground rules said keep it on line 2: hello-world, llm-summarizer,
  ajs-basics, given-dispatch, object-types, learn-to-program, tjs-advanced, tjs-patterns,
  ts-examples, ts-intro, ts-patterns, ts-validation. They kept it; remove it as you finish.
- **Link form and anchors.** Raised by about twenty chapters across all three books. The book
  mixes `/slug/`, `?file.md`, relative `x.md`, `../../../DOCS-AJS.md` and uppercase
  `/TJS-FOR-TS/`. Cross-page `#anchors` are unverified, especially headings with `/`. Pick one
  form, then run `bun scripts/check-site-examples.ts` against `preview:site`.
- **Live-site checks the agents could not make.** Raised by about thirty chapters. These are:
  - whether bare `tjs-lang`, `tjs-lang/eval`, `/lang`, `/schema` and `/css` imports resolve in
    live fences (safer-code, the-universal-endpoint, error-history, ts-from-zod,
    ts-json-boundary, predicate-types)
  - whether top-level `await` runs in a fence
  - what label replaces `<source>` in error paths (most TS chapters, when-things-go-wrong)
  - how a returned MonadicError renders through `preview.append` or `console.log`
  - whether test blocks in fences that import tosijs show as passing (a-calculator)
  - whether readers' edits survive a reload

  One headless pass would settle most of these.
- **Board card links.** There is no per-card URL for Virta, so pages say "card #3836" in plain
  text (ajs-error-handling, ts-union-types).
- **The subtitle line under H1** was removed from some example pages and kept on others
  (hello-world, multi-agent-pipeline, string-processing, ts-classes, ts-runtime-validation).
  Sweep all of them one way. Check whether the docs builder uses the line as the nav
  description.

### AJS book

- **Navigation order.** There are still ties under `ajs.md`:
  - safe-eval and ajs-examples at 2
  - ajs-host and patterns at 5
  - ajs-native-vm and ajs-capabilities at 6
  - pattern and universal-endpoint at 8
  - CONTEXT and ajs-lean-spec at 14

  Several agents used fractional orders (5.5, 6.5, 6.6). Renumber the book's top level in one
  pass, and decide whether an "Internals and roadmap" section page should hold vm-budgets,
  native-vm, lean-spec, pattern and CONTEXT. Also decide CONTEXT's title ("The AJS VM:
  Technical Context") and position.
- **Content with no home yet:**
  - the TTS/voice spike and vision matrix cut from mlx-setup (UPSTREAM.md rows 27–28 still
    point at it)
  - the ajs.md material cut from the landing page: destructured-default semantics, the full
    `.signature` example and the full getToolDefinitions output
  - a "Composing agents" section for multi-agent-pipeline to link to
  - the errors-as-values pointer that ajs-native-vm wants in DOCS-AJS
  - the board reference removed from ajs-lean-spec
- **Duplication.** patterns.md's "Mock Capabilities" now repeats ajs-capabilities, and its
  "Fetch Security" repeats safe-eval. Cut both to links?
- **Section pages.** ajs-llm omits four LLM examples (llm-api-data, llm-code-generator,
  llm-code-solver, llm-with-tool). ajs-advanced has a gap at order 16. Should ajs-featured
  list fuel-limits first? Should Basics be a direct child of ajs.md? Should section pages carry
  a runnable teaser?
- **Live dependencies and sample data:**
  - Live calls to api.github.com (60 requests an hour) and other third-party APIs
    (github-repos, things-that-take-time, async-functions).
  - Dated live numbers in sample output (weather-api).
  - Hand-written model output not captured from a real model (vision-classification,
    vision-ocr, llm-with-tool).
  - The `entity = 'bogus'` default that shows the error path (itunes-search).
  - Whether to add tjs.tosijs.net to the site's fetch allowlist (llm-summarizer).
  - How a reader passes run arguments on the site (itunes-search, weather-api).
  - The 5-star default repository (github-repos).
- **Smaller items:**
  - Windows coverage in lm-studio-setup.
  - The lm-studio-setup page is written for contributors: is a reader-facing "run a local
    model" page wanted?
  - Naming the product in universal-endpoint's "in production we ran…".
  - The `\\n` unescape lines that corrupt generated code (llm-code-generator, llm-code-solver).
  - `javascript` vs `ajs` fences for LLM-only variations (llm-api-data).
  - The left-to-right chain limitation (llm-with-tool).
  - The demo's old collaborativeWriting copy (demo/src/examples.ts ~260).
  - The relative `/photo-2.jpg` default (vision-ocr).
  - The safe-eval diagram (docs/diagrams/safe-eval.svg) says "silently blocked", shows a
    nonexistent `fs.read()`, and shows `console` as blocked.
  - ajs-atoms says "about fifty" atoms; there are 54 core.
  - Recheck ajs-atoms' claim about runCode's timeout: a reviewer measured a generated loop
    ending in Out of Fuel after 36 s.

### Language book (TJS reference and design notes)

- **Where design notes live.** These are filed as chapters of the reader's book:
  parser-primitives (11), native-engine-integration (13), type-identity (6) and
  dictionary-defaults (in the Reference tier). Move them to a design-notes or internals parent,
  or unpublish them? An italic "Internals" label is the only marker today. Should
  function-predicate-design carry its own status header ("declaration shipped; signature
  checking proposed")?
- **Restore removed history as files?** The dictionary-defaults design diary (git `47303274`,
  linked from the page) and the type-system-north-star split (about 500 lines of asCompared
  and Predicate design records could become `docs/as-compared.md` and
  `docs/predicate-umbrella.md`).
- **Single homes still to cut down:**
  - hello-tjs still teaches rest parameters, and repeats the required-vs-optional trip-ups.
  - safety-validation repeats error-handling's "try without catch".
  - js-footgun-fixes and TJS-SYNTAX repeat honest-equality's demo and escape table.
  - TJS-SYNTAX's SIMD list is incomplete; replace it with a link to DOCS-WASM.
  - The WASM memory size, cross-file `wasmBuffer` behaviour and the out-of-memory RangeError
    belong in DOCS-WASM's "Memory discipline".
  - Sibling WASM pages still link the Quick Start through GitHub.
- **PRINCIPLES.md:**
  - Should the AJS loop rationale, the AST-contract section and the three-dialect routing
    recipe move to the AJS book and running-tjs, which now exists?
  - Should PRINCIPLES be added to doc-snippets.test.ts?
  - The pointer to the north star's "(last section)" now lands on "Open questions".
- **Order and naming:**
  - Renumber tjs-basics. The section page describes honest-equality 15, js-footgun-fixes 16,
    polymorphic-functions 17, better-classes 18, polymorphic-constructors 19,
    local-extensions 20, safety-validation 21 and safer-code 22. The metadata still differs.
  - Confirm Better Classes before Polymorphic Constructors.
  - The Universal Endpoint (15) comes first in tjs-advanced although it needs another book.
  - Rename the slugs to match new titles (safer-code to "What .tjs Refuses",
    schema-validation to "Types at Runtime", error-history to "Flight Recorder")? This breaks
    links.
  - array-types lacks `type`/`group` metadata.
  - Should declarations.md move out of `guides/examples/tjs/`?
  - Sweep the unused `section`/`group`/`navTitle` keys (why-tjs, TJS-FOR-JS, TJS-FOR-TS, the
    generated tjs-vs-typescript header).
  - Check that a list starting at item 0 renders (tjs-patterns).
- **Facts to date or recheck:**
  - Re-run `bun run bench` before native-engine-integration cites it.
  - Date or re-measure runtime-fusion's §1 (3,504 / 8,806 bytes).
  - ambient-contracts' 2026-07-03 browser findings, and its retitled anchor.
  - case-study-switch's unsourced fallback-block table, its two "Still open" items, and board
    cards #1792 and #1797, which are still in review.
- **why-tjs:**
  - Should `typeof NaN` stay in the "bizarre types" list? TJS leaves it alone.
  - Restore any of the cut C-versus-assembler digression?
  - Should the JSLint section come before the book section?
- **Smaller items:**
  - Document `test('name') { }` as also legal (lodash-utilities, local-module-imports).
  - The `/# … #/` doc-block form (predicate-types).
  - Mention the default in-memory store (the-universal-endpoint).
  - Keep or rename "The Universal Endpoint".
  - Keep the `__tjs_rt` internals section in running-tjs?
  - Parent running-tjs under the-tjs-language?
  - Link built-in-types from safer-code and date-formatting.
  - Update demo/src/examples.test.ts:88's stale skip reason.
  - Document destructured-default member checks (dictionary-defaults).
  - Make the `.d.ts` example live (dictionary-defaults)?
  - Add `new Function` to the rename table (js-footgun-fixes)?
  - Should the CDN-unreachable text quote the real error (lodash-utilities)?

### Language book (Learn to Program)

- **Cuts in sibling chapters** that the briefs asked for and the one-file rule prevented:
  - the 0.1 + 0.2 passage in values-and-names (still at line 60)
  - the re-explanation of `? :` in when-things-go-wrong
  - the bold **off-by-one error** in when-things-go-wrong, which should point back to Repetition
- **Coverage gaps:**
  - No chapter covers imports, modules or destructuring, yet hello-screen and things-with-parts
    use them.
  - `null` is introduced nowhere.
  - The book first teaches `try`/`catch` in things-that-take-time, not when-things-go-wrong.
  - Is there a learn-track predicate chapter, or does the book send beginners to the
    programmers' predicate-types page?
- **Exercises:** add worked solutions (decisions, and others), perhaps collapsed?
- **Examples:**
  - Should `Point` use `0.0` (things-with-parts)?
  - Live versus static fences (checking-your-work, when-things-go-wrong).
  - A fence that loads red as a stub (checking-your-work).
  - "Change X and watch" where the change turns a test red (decisions).
  - Confirm the removed duplicate exercise (a-calculator).
- **The site and tosijs-ui:**
  - There is no run-on-change (how-this-book-works now says ⌘S).
  - Timers are not cleared on a re-run (things-that-take-time). This is a tosijs-ui card.
  - Does the page show lint warnings (values-and-names)?
  - The REPL keeps a `let` for one input only (values-and-names).
  - happy-dom showed 0 and NaN as blank (a-calculator).

### TypeScript book

- **Structure:**
  - Where TJS-FOR-TS sits in the default book: order 25 next to typescript-good-bad-ugly, or
    as a child of it?
  - Does tjs-vs-typescript appear in the nav?
  - Is "Examples as contracts" in the right place?
  - Does the H1 still give the title when a comment comes before it?
  - Rename the "intro" section ("Converting TypeScript")? This must change ts-intro and
    ts-examples together.
  - ts-intro's opening sentence says checks are off, but its first example turns them on.
  - Should postmortem-ts-emitter drop `section: home`?
- **TJS-FOR-TS** grew from 1,142 to about 1,380 lines against a brief that wanted it shorter.
  Should Part 2 shed what Converting and GBU now cover? Which typed route for importing `.tjs`
  from TS should be documented?
- **New pages:**
  - a `ts-enums` example (ts-advanced)
  - a reader-facing "how TJS emits .d.ts" chapter (generic-dts-design)
  - tosijs-ui showing the TJS step for `ts` examples (ts-examples)
- **House style:**
  - Log `.message` rather than the whole MonadicError (ts-object-validation,
    ts-type-transformation).
  - Cast `(greet as any).__tjs` so the TS on the page compiles under tsc (ts-multiple-functions).
  - The all-caps tagline (ts-runtime-validation).
  - Keep "Classes are supported with metadata" (ts-classes)?
  - Quote error lines with or without line numbers.
  - The `?`-unsafe cost section (ts-nested-objects).
  - Mention the non-promotion case (ts-object-validation).
  - Hedge "a call tsc accepted should still pass" (ts-converting-a-project).
- **Gaps to describe or cut:**
  - Should "Current gaps" ship in ts-publishing-a-library, or be fixed first (A2.16)?
  - Add TjsStrict to the Array Operations and Union Types examples (ts-patterns)?
  - The ts-examples table drifts as examples change: keep it with a test, or reword it?
  - `isMonadicError` without an import in ts:inline examples (ts-publishing-a-library,
    ts-validation).
  - The emit-tjs-then-check gate trips on `new` (ts-embedded-tests).
  - ts-converting-a-project's grep pattern is looser than ts-embedded-tests'.
  - The GitHub Actions snippet, or the shared practices template (ts-build-and-tooling)?
  - guides/tosijs-schema.md is an LLM prompt; is it the right link for readers (ts-from-zod)?
- **postmortem-ts-emitter facts:**
  - Did the August probe cap at 150 files?
  - "Partly open" model selection.
  - The 0-destructured-params count against the dogfood comment.
  - The §5.1 summary.
  - Whether radash's 47 excluded tests fail unconverted.
- **Smaller items:**
  - Should "Generic Functions" join MUST_REJECT?
  - Console output appears twice when tests run at transpile time (ts-hello-typescript).
  - The ts-embedded-tests "every test passing" claim, given that tosijs-ui calls `tjs()` with
    `runTests: false`.
  - The editable-example claim (ts-optional-parameters).
  - Should ts-optional-parameters name TjsStrict as the dictionary switch?

---

## D. Noise: already answered, or fixed by a later revision (63 questions)

- `/ajs-host/`, `/ajs-capabilities/`, `/ajs-atoms/` and `/running-tjs/` did not exist when
  written; all four exist now (13 questions).
- `docs/reviews/0.14.0-docs-review.md` matched a grep for `ajs.md`; it has no metadata and is
  not published.
- `src/docs-ajs-calls.test.ts`, `src/doc-snippets.test.ts` (the TJS-FOR-TS ratio),
  `src/doc-site-structure.test.ts` (ELOOP) and `demo/src/examples.test.ts` (Nested Objects
  MUST_REJECT) all pass now (505 pass and 98 pass).
- DOCS-AJS no longer teaches `catch (e) { e.message }` and no longer says `'tags: ' + tags`
  "would end the run". ajs-error-handling, llm-summarizer and llm-code-solver reported this.
- lm-studio-setup no longer says the base URL is hardcoded.
- safe-eval no longer says httpFetch works "only if you inject a fetch capability".
- TJS-SYNTAX no longer says TjsCompat means "safety none". It no longer claims a
  `resolveExtension` fallback, or that an inconclusive test "does not block the build", and no
  longer says "No imports/exports beyond the function".
- `Color.Red` is the member's value since #3840. TJS-FOR-TS, ts-converting-a-project and
  ts-advanced no longer say otherwise.
- TJS-FOR-TS's old "What fromTS Handles" lists are gone.
- safer-code no longer has its own `const!` section; it links to const-and-bang.
- honest-equality no longer has the stale "switch compares with ===" gotcha.
- functions.md no longer says signature examples run "before anything else".
- The learn-chapter order clash is fixed: when-things-go-wrong 10, things-that-take-time 11,
  a-calculator 12.
- built-in-types.md exists, and the "proposed built-in-types chapter" questions are moot.
- The TS validation group's order clash is fixed (1, 3, 4, 5).
- ts-from-zod.md exists.
- guides/running-tjs.md is tracked.
- The swarm brief's "AJS has no for-loops" was wrong. The chapter says "no C-style for".
- The agents' verification notes (how examples were checked, scratch paths, the model-audit
  cache side effect): 7 questions with nothing to decide.
- "Confirm the old `ctx.capabilities.fetch(url).res.text()` example is not reintroduced": it is
  not.
- DOCS-AJS line 483 now says `'tags: ' + tags` "would be an error". It is catchable; the
  wording holds.
- The swarm's `failing` entries 4 and 5 (researchAgent needs an LLM; Nested Objects
  MUST_REJECT): both closed as above.
