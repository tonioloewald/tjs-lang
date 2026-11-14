<!--{"section": "tjs-for-ts", "group": "docs", "order": 30, "navTitle": "TJS for TS Devs", "pin": "top", "book": ["default", "ts"], "placement": {"language": {"parent": "for-programmers.md", "order": 30}}}-->
<!-- TODO review -->

# TJS for TypeScript Programmers

_What if your types didn't disappear at runtime?_

---

TypeScript checks your code against its types when it compiles, and then erases them. At
run time a `User` parameter accepts whatever arrives: a `JSON.parse` result, a value cast
with `as any`, a field the API renamed last week.

TJS keeps the types. A TJS type is an **example value**, and the example survives to run
time, where it is a check, documentation and test data. This page is the reference for a
TypeScript developer:

- **[Part 1: Using TJS from TypeScript](#part-1-using-tjs-from-typescript)**. Keep your
  codebase. Import `.tjs` modules, turn on checks for one `.ts` file, run untrusted code
  and agents in a sandbox.
- **[Part 2: TypeScript to TJS, a syntax reference](#part-2-typescript-to-tjs-a-syntax-reference)**.
  What each TypeScript construct becomes in TJS, and the few places where TJS behaves
  differently.

[TypeScript: The Good, the Bad, and the Ugly](guides/sections/typescript-good-bad-ugly.md)
makes the case for runtime types, and
[TJS vs TypeScript](docs/tjs-vs-typescript.md) is a comparison table in which every row is
executed against `tsc --strict` and TJS. The chapters below this page go deeper:
[TypeScript Examples](guides/sections/ts-examples.md) to run in the page,
[Converting a TypeScript Project](guides/sections/ts-converting-a-project.md) (the how-to
for `tjs convert` and graduation),
[Validating JSON at the Boundary](guides/sections/ts-json-boundary.md) (where TypeScript's
types are most often wrong),
[Publishing a TJS Library to TypeScript](guides/sections/ts-publishing-a-library.md),
[Replacing Zod, io-ts and Ajv](guides/sections/ts-from-zod.md), and
[Build, CI and Editors](guides/sections/ts-build-and-tooling.md).

---

## In this section

<!-- prettier-ignore-start -->

<!-- toc -->
- [TypeScript Examples](/ts-examples/)
- [Converting a TypeScript Project](/ts-converting-a-project/)
- [Validating JSON at the Boundary](/ts-json-boundary/)
- [Publishing a TJS Library to TypeScript](/ts-publishing-a-library/)
- [Replacing Zod, io-ts and Ajv](/ts-from-zod/)
- [Build, CI and Editors](/ts-build-and-tooling/)
<!-- /toc -->

<!-- prettier-ignore-end -->

# Part 1: Using TJS from TypeScript

You don't have to rewrite anything. Everything in this part works from a TypeScript
codebase.

## Install

```bash
npm install tjs-lang      # or: bun add tjs-lang
bunx tjs check src/       # the tjs CLI, from the installed package
```

The library runs anywhere JavaScript does. The `tjs` command line tool runs on
[Bun](https://bun.sh), so it needs Bun installed even if your project ships for Node.
[Build, CI and Editors](guides/sections/ts-build-and-tooling.md) covers the setup.

## Three ways to adopt TJS

This page mentions three routes, and they differ in what they change:

- **Convert** (`tjs convert`): TypeScript becomes TJS source that keeps JavaScript's
  behaviour exactly. Where the code relied on a JavaScript quirk that TJS fixes, the
  converter writes a named escape such as `DangerousLegacyEquals(a, b)`. Converted code
  does not validate inputs by default.
- **Graduate**: a converted file becomes native TJS, still with the same behaviour, and you
  retire the escapes one at a time.
- **`TjsStrict`**: a comment at the top of a `.ts` file gives it full TJS at once:
  arguments are checked, `==` stops coercing, `typeof null` is `'null'`, `new` on a class
  declared in the file is an error, `new Date` is refused, and `private` becomes
  `#private`. [Where TJS behaves differently](#where-tjs-behaves-differently) lists these
  rules.

Convert and graduate change nothing until you choose to, which is why they are the safer
route for a large codebase. `TjsStrict` is quicker for a file you are writing or that takes
outside input.

## Call a TJS function from TypeScript

A TJS function checks its arguments on every call. A bad argument does not throw: the
function returns an error value, a `MonadicError` (a subclass of `Error`), and its body
never runs. If you have used Rust's `Result` or Haskell's `Either`, this is the same idea:
the error is a value the caller tests, here with `isMonadicError`.

The TypeScript return type does not include the error. `tsc` sees `greet` return a
`string`, so code that calls TJS from TypeScript at a boundary has to check the result.
That is a deliberate trade: the declared type stays the one you wrote, and the check
happens where bad data actually arrives.

This example is TypeScript. The `TjsStrict` comment converts it to full TJS, so `greet`
checks its `User` argument and the TypeScript caller handles the error as a value.
`isMonadicError` is built into TJS code, so the `declare` line only tells `tsc` about it;
in a project you would `import { isMonadicError } from 'tjs-lang/runtime'` instead:

```ts:inline
/* @tjs TjsStrict */

declare function isMonadicError(value: unknown): value is Error

interface User {
  name: string
  age: number
}

function greet(user: User): string {
  return `Hello, ${user.name}`
}

// The caller: ordinary TypeScript, handling the error as a value
function handle(body: string): string {
  const result = greet(JSON.parse(body))
  if (isMonadicError(result)) return `rejected: ${result.message}`
  return result
}

console.log(handle('{"name": "Ada", "age": 36}'))
// Hello, Ada
console.log(handle('{"name": "Ada", "age": "36"}'))
// rejected: Expected User for '…greet.user': age: no alternative matched, got string
console.log(handle('null'))
// rejected: Expected User for '…greet.user', got null
```

`tsc` accepts all of this. The second and third calls are rejected at run time, and the
message names the function, the parameter and the member that was wrong.

## Import `.tjs` files from TypeScript

In a project the TJS function usually lives in its own `.tjs` file and TypeScript imports
it. How the `.tjs` file is compiled decides whether `tsc` sees its types:

| Workflow               | How `.tjs` is compiled                         | Does TypeScript see the types?            |
| ---------------------- | ---------------------------------------------- | ----------------------------------------- |
| Bun, at run time       | the `tjs-lang/bun-plugin` preload, on import   | no: needs a `declare module '*.tjs'` shim |
| `Bun.build`            | the `tjs-lang/bun-build-plugin` plugin         | no: needs the same shim                   |
| Node, or other bundler | `tjs emit --dts` ahead of time, to `.js`       | yes: import the emitted `.js` and `.d.ts` |

So `tjs emit --dts` is the way to get typed imports. With Bun, preload the plugin in
`bunfig.toml`:

```text
# bunfig.toml
preload = ["tjs-lang/bun-plugin"]
```

and `.tjs` files import like any other module:

<!-- tjs-doc: fragment -->

```typescript
// main.ts
import { isMonadicError } from 'tjs-lang/runtime'
// greet.tjs contains: export function greet(name: string):! string { … }
import { greet } from './greet.tjs'

const result = greet(42 as any)
if (isMonadicError(result)) console.log(result.message)
// Expected string for 'greet.tjs:1:greet.name', got number
```

The preload is a runtime registration, and `Bun.build` ignores it. To bundle, pass the
build plugin:

```typescript
import { tjsPlugin } from 'tjs-lang/bun-build-plugin'

await Bun.build({
  entrypoints: ['src/main.ts'],
  outdir: 'dist',
  plugins: [tjsPlugin()],
})
```

For Node or another bundler, compile `.tjs` to `.js` ahead of time with the `tjs` CLI
(`tjs emit src/ -o dist/`). The emitted JavaScript needs no runtime package: each file
carries the small runtime it uses. `--dts` adds a declaration file:
`tjs emit --dts greet.tjs -o dist/greet.js` writes `dist/greet.d.ts`
(`export declare function greet(name: string): string`), which types an import of the
emitted `greet.js`. [Build, CI and Editors](guides/sections/ts-build-and-tooling.md) covers
the build setups, and
[Publishing a TJS Library to TypeScript](guides/sections/ts-publishing-a-library.md) covers
shipping `.d.ts` files to TypeScript users.

## Turn on checks for one TypeScript file

You do not have to write TJS to get runtime checks. Mark a `.ts` file
`/* @tjs TjsStrict */` and its interfaces become validators. This is TypeScript, converted
and run on the page:

```ts:inline
/* @tjs TjsStrict */

declare function isMonadicError(value: unknown): value is Error

interface Order {
  items: { id: number; qty: number }[]
  total: number
}

function processOrder(order: Order): { status: string } {
  return { status: `ok, ${order.items.length} items` }
}

function handle(body: string): string {
  const result = processOrder(JSON.parse(body))
  return isMonadicError(result) ? `rejected: ${result.message}` : result.status
}

console.log(handle('{"items": [{"id": 1, "qty": 2}], "total": 9.5}'))
// ok, 1 items
console.log(handle('{"items": [{"id": 1, "qty": "two"}], "total": 9.5}'))
// rejected: Expected Order for '…processOrder.order': items[0].qty: no alternative matched, got string
```

As with `greet`, `processOrder` is declared to return `{ status: string }` and returns an
error value instead when its argument is wrong, so the caller checks. Check where the result
first arrives: an error value passed on to another checked function comes straight back out
of it without running its body (see [Errors are values](#errors-are-values)).

`TjsStrict` gives the whole file every TJS rule at once (the list is in
[Three ways to adopt TJS](#three-ways-to-adopt-tjs)), not only the checks. For a file you
are migrating, [Converting a TypeScript Project](guides/sections/ts-converting-a-project.md)
describes the route that changes nothing until you choose to. For checking API data
specifically, see [Validating JSON at the Boundary](guides/sections/ts-json-boundary.md).

## Run untrusted code: `Eval` and `SafeFunction`

`tjs-lang/eval` runs code you did not write (a user's formula, a model's output) in a
fuel-metered sandbox, without `eval()` or `new Function`:

```typescript
import { Eval, SafeFunction } from 'tjs-lang/eval'

// Run code once, with a fuel budget and only the values you pass in
const { result, error, fuelUsed } = await Eval({
  code: 'const cheap = items.filter(x => x.price < threshold)\nreturn cheap.length',
  context: { items: [{ price: 5 }, { price: 50 }], threshold: 10 },
  fuel: 1000,
})
if (error) console.log(error.message)
// result: 1, fuelUsed: about 2

// A runaway loop stops when the fuel is gone, and the failure is a value
const runaway = await Eval({ code: 'let n = 0\nwhile (true) { n = n + 1 }\nreturn n', fuel: 1000 })
// runaway.error.message: 'Out of Fuel'

// Or compile a reusable function
const underBudget = await SafeFunction({
  body: 'return items.filter(x => x.price < budget)',
  params: ['items', 'budget'],
  fuel: 500,
})
const { result: cheap } = await underBudget([{ price: 5 }, { price: 500 }], 100)
// cheap: [{ price: 5 }]
```

The code is AJS, a JavaScript subset (next section), so it reads as you expect, with a few
rules of its own (no `for` loops, for one). Fuel is a budget of work: every operation the
sandbox performs costs some (a loop iteration costs 0.1), so the snippet above used about
2 of its 1000, and the loop ran out after roughly 10,000 iterations. The code has no IO. It
can reach the network or a store only through capabilities you pass in
(`capabilities: { fetch }`). Errors come back as the `error` field, not as exceptions.
[Safe Eval](guides/safe-eval.md) covers the options.

## Run agents: AJS

AJS is a JavaScript subset that compiles to a JSON AST, which a VM runs with a fuel limit
and only the capabilities you inject. The AST is data: you can store it, send it, diff it
and audit it. This agent runs on the page:

```ajs:inline
function shortlist({
  products = [
    { name: 'kettle', price: 40, rating: 4.6 },
    { name: 'toaster', price: 25, rating: 3.9 },
    { name: 'blender', price: 90, rating: 4.8 },
  ],
  budget = 50,
}) {
  let affordable = products.filter((p) => p.price <= budget)
  let names = affordable.map((p) => p.name)
  return { count: affordable.length, names }
}
```

It returns `{ count: 2, names: ['kettle', 'toaster'] }`. From TypeScript, you transpile the
source to an AST and run the AST. Transpiling is a separate step, so it can run where you
choose (at build time, in a worker), and `tjs-lang/vm-ast` is the VM with no parser in it:

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const { ast } = transpile(`
function summarize({ data, query }) {
  let relevant = data.filter((x) => x.score > 0.5)
  let summary = llmPredict({
    prompt: 'Summarize for ' + query + ': ' + JSON.stringify(relevant),
  })
  return { query, summary, count: relevant.length }
}
`)

const vm = new AgentVM()
const { result, error } = await vm.run(
  ast,
  { data: [{ text: 'a', score: 0.9 }, { text: 'b', score: 0.2 }], query: 'q' },
  {
    fuel: 1000,
    timeoutMs: 5000,
    // llmPredict reads capabilities.llm.predict(prompt)
    capabilities: { llm: { predict: async (prompt) => callMyModel(prompt) } },
  }
)
// result: { query: 'q', summary: <whatever callMyModel returned>, count: 1 }
```

`llmPredict` is an **atom**: one of the built-in operations the VM provides. An agent calls
atoms like functions, with no import. Some atoms work only on data inside the VM; others,
like `llmPredict`, reach the outside world through a capability you inject (here
`capabilities.llm.predict`), and without that capability they fail. Atoms take named inputs
and refuse any they do not declare (`llmPredict` takes `prompt` and `options`). The
[AJS guide](DOCS-AJS.md) lists the atoms, the capabilities each one reads, and the budgets a
run accepts.

## Build agents in TypeScript: the builder

`Agent` builds the same kind of AST with a fluent API, without writing AJS source. It is
lower level and more verbose than AJS, and nothing checks atom calls for you, so reach for
it when a program generates agents (from a UI, a config file, another agent) rather than
when a person writes one:

```typescript
import { Agent, AgentVM } from 'tjs-lang'
import { s } from 'tjs-lang/schema'

const pipeline = Agent.take(s.object({ url: s.string }))
  .httpFetch({ url: { $kind: 'arg', path: 'url' } })
  .as('response')
  .varSet({
    key: 'results',
    value: {
      $expr: 'member',
      object: { $expr: 'ident', name: 'response' },
      property: 'items',
    },
  })
  .return(s.object({ results: s.array(s.any) }))

const vm = new AgentVM()
const { result } = await vm.run(
  pipeline.toJSON(),
  { url: 'https://api.example.com/search?q=kettle' },
  {
    fuel: 500,
    // a fetch capability returns DATA (parsed JSON), not a Response
    capabilities: { fetch: async (url) => ({ items: ['kettle', 'teapot'] }) },
  }
)
// result: { results: ['kettle', 'teapot'] }
```

`s` is tosijs-schema, re-exported by `tjs-lang/schema`. The builder writes a version-1 AST,
the format ASTs were first stored in. It is not deprecated: the VM keeps running it so that
stored agents keep working. The difference from the version 2 that the transpiler writes is
how a bare string is read (in version 1, a string that names a variable in scope is that
variable); [Builder API](DOCS-AJS.md#builder-api) has the details.

## Entry points

The package is split so you import only what you use:

<!-- tjs-doc: fragment -->

```typescript
import { Agent, AgentVM, ajs, tjs } from 'tjs-lang' // most things (not fromTS)
import { Eval, SafeFunction } from 'tjs-lang/eval' // safe eval only
import { tjs, transpile } from 'tjs-lang/lang' // language tools
import { fromTS } from 'tjs-lang/lang/from-ts' // TS -> TJS converter (loads TypeScript)
import { AgentVM } from 'tjs-lang/vm-ast' // the agent VM, no parser
import { isMonadicError, TEmail } from 'tjs-lang/runtime' // runtime helpers and types
import { s, validate } from 'tjs-lang/schema' // tosijs-schema
```

Only `tjs-lang/lang/from-ts` needs the `typescript` package installed. The two `AgentVM`s
are the same VM: the main entry's also accepts AJS source and parses it, while
`tjs-lang/vm-ast` takes only an AST and has no parser in it, which is why it is the
recommended one for running agents.

## Tooling

| Concern             | TypeScript                      | TJS                                                                                         |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| **Type checking**   | `tsc`, at compile time          | Checks emitted into the code, at run time; `tjs check` compiles and runs examples and tests  |
| **Runtime schemas** | Zod / io-ts / Ajv, kept in sync | The type is the schema; `Type(…).toJSONSchema()` exports JSON Schema                        |
| **Linting**         | ESLint and plugins              | Built-in checks (unused variables, unreachable code, `new` on your own class) in `tjs check` |
| **Testing**         | Vitest / Jest, separate files   | Inline `test` blocks and worked return examples, run by `tjs check` / `tjs test`            |
| **Build**           | `tsc` plus a bundler            | `tjs` CLI (runs on Bun), the Bun runtime plugin, the `Bun.build` plugin                     |
| **Declarations**    | `.d.ts` from `tsc`              | `tjs emit --dts`                                                                            |
| **Documentation**   | JSDoc / TypeDoc                 | `tjs emit` writes Markdown docs from signatures and doc comments                            |
| **Editor support**  | Full language service           | Highlighting for `.tjs` and `.ajs`: VS Code (`npx ajs-install-vscode`), Cursor (`npx ajs-install-cursor`), Monaco, CodeMirror, Ace |

`tjs check` is the gate: it compiles a file (or every file in a directory), lints it, and
runs its signature examples and `test` blocks, exiting non-zero on any failure. `tjs test`
runs the `test` blocks of a file or of `.test.tjs` files, reports each one, and can filter
by name (`-t`). `tjs emit` also runs them and refuses to write output when one fails.

The editor support is highlighting only: there is no TJS language server, so you get no
type-aware completion or go-to-definition in `.tjs` files yet. If you are replacing a
runtime schema library, see [Replacing Zod, io-ts and Ajv](guides/sections/ts-from-zod.md).

## When to stay in TypeScript

If your codebase is TypeScript and you are happy with it, you may only need TJS for:

- running user-provided or model-generated code safely (`Eval`, AJS)
- agents that travel over the network as data
- runtime checks at system boundaries (`TjsStrict` on the files that take input)

None of that requires migrating anything.

---

# Part 2: TypeScript to TJS, a syntax reference

## The core idea: types as examples

TypeScript describes a type abstractly. TJS shows an example of it:

<!-- tjs-doc: fragment -->

```typescript
// TypeScript: what TYPE is this?
function greet(name: string): string { ... }

// TJS: what is an EXAMPLE of this?
function greet(name: 'World'): 'Hello, World!' { ... }
```

`name: 'World'` means "a required string; here is a valid one". It does **not** mean the
argument must be `'World'`: any string passes. The example documents the parameter and
gives TJS a value to test with.

The return annotation is different, and the difference matters. `: 'Hello, World!'` is a
**worked example**: TJS calls `greet('World')` and compares the result with
`'Hello, World!'`, and a wrong body is a failure. This happens when the file is checked or
compiled: `tjs check`, `tjs test` and `tjs emit` run every worked example (and `emit`
refuses to write output if one fails), and so does the live runner on these pages. The Bun
plugin runs them on import only if you set `TJS_RUN_TESTS=1`.

Because the function really is called, a function with side effects (one that writes a
file, sends a request or reads state that is not there yet) should not have a worked
example. Write `:!` instead: it states the return type and runs nothing.
[Examples as contracts](guides/sections/typescript-good-bad-ugly.md#examples-as-contracts)
explains everything else an example does.

## Primitives

<!-- tjs-doc: fragment -->

```typescript
// TypeScript                    // TJS
name: string                     name: ''
count: number                    count: 0.0       // any number
index: number                    index: 0         // integer
age: number                      age: +0          // non-negative integer
flag: boolean                    flag: true
items: string[]                  items: ['']
nested: number[][]               nested: [[0]]
```

TJS distinguishes three numeric types, using spellings that are already legal JavaScript:

| You write      | Type name  | Runtime check                   |
| -------------- | ---------- | ------------------------------- |
| `3.14`, `0.0`  | `float`    | any number, integers included   |
| `42`, `0`      | `int`      | `Number.isInteger(x)`           |
| `+20`, `+0`    | `unsigned` | `Number.isInteger(x) && x >= 0` |

`x: float`, `x: int` and `x: unsigned` are the same three checks written as type names, and
`x: number` means the same as `x: float`.

The converter maps TypeScript's `number` to `0.0`, the widest of the three, so converted
code accepts what it accepted before. Narrow to `0` or `+0` by hand where that is what you
mean.

**TypeScript's type names work too.** `name: string`, `count: number`, `flag: boolean` and
`items: string[]` are valid TJS and real runtime checks: `s: string` means exactly what
`s: ''` means. The example form is the native spelling because it also gives a value to
document and test with.

An array example such as `items: ['']` checks every element, and an empty array passes. The
check is a loop over the array, so it costs time in proportion to its length (well under a
millisecond for 100,000 strings), and a failure names the bad element:
`Expected string for '…items[99999]', got number`.

## Optional parameters

<!-- tjs-doc: fragment -->

```typescript
// TypeScript                    // TJS
function f(x?: string) {}        function f(x: '' | undefined) {}
function f(x: string = 'hi') {}  function f(x = 'hi') {}
```

`x: '' | undefined` keeps TypeScript's meaning: the argument may be left out, and then `x`
is `undefined` inside the body. It is what the converter writes for `x?: string`.

`= value` makes a parameter optional with a default, and the default is also its example:
`x = 'hi'` accepts any string or nothing. That is a different function from `x?: string`,
because an omitted `x` is now `'hi'`, so code that tests `x === undefined` stops seeing
`undefined`. Use a default only where you want one.

## Object shapes

```tjs:inline
function createUser(opts: { name: '', age: 0.0, email: '' | undefined }) {
  return opts.email ? `${opts.name} <${opts.email}>` : opts.name
}

console.log(createUser({ name: 'Ada', age: 36 }))                             // Ada
console.log(createUser({ name: 'Ada', age: 36, email: 'ada@example.com' }))   // Ada <ada@example.com>
console.log(createUser({ name: 'Ada' }).message)
// Expected number for '…createUser.opts.age', got undefined
```

That is TypeScript's `opts: { name: string; age: number; email?: string }`. Every member of
a shape is required unless its type admits `undefined`: `email: '' | undefined` means "may
be absent; if present, a string". Writing `email = ''` inside a shape is a syntax error,
because `=` gives defaults to parameters, not to members of a parameter's type. For
per-member defaults, make the whole parameter a dictionary: `opts = { name: '', age: 0 }`
fills in whatever the caller leaves out (see [Dictionary Defaults](docs/dictionary-defaults.md)).

## Destructured parameters

TypeScript's `function area({ width, height }: { width: number; height: number })` is, in
TJS:

```tjs:inline
function area({ width: 0.0, height: 0.0 }) {
  return width * height
}

test 'the argument is checked as one thing' {
  expect(area({ width: 2, height: 3 })).toBe(6)
  const notASize = { width: 'two', height: 3 }
  expect(area(notASize).received).toBe(notASize)
  expect(isMonadicError(area(null))).toBe(true)
}
```

The members carry their examples directly. The TypeScript spelling, a pattern followed by
`: Shape`, is accepted and checked too. Use it when the pattern cannot hold the type: a
named type (`({ x, y }: Point)`), a rename (`({ w: width }: Size)`, since in a pattern a
colon followed by a name IS a rename), or a default inside the pattern
(`({ x = 0, y = 0 }: Point)`). Either way the argument is checked as one value: `null`, a
string or an `Error` you made is a type error, and an error value from an earlier call
passes through unchanged.

A type error carries what you need to report it: `message` (the readable text), `path`
(file, line, function and parameter, such as `'…:1:area.width'`), `expected` and `actual`
(the expected type and the `typeof` of what arrived), and `received` (the value that was
passed). The tests here use `isMonadicError(x)`; `x instanceof Error` is also true of a type
error, but it is true of any other `Error` too.

## Return types

<!-- tjs-doc: fragment -->

```typescript
// TypeScript                                 // TJS
function add(a: number, b: number): number    function add(a: 2, b: 3): 5
function getUser(): { name: string }          function getUser():! { name: '' }
function fetchData(): Promise<string[]>       async function fetchData():! ['']
```

| Spelling | Meaning                                                                    |
| -------- | -------------------------------------------------------------------------- |
| `: 5`    | worked example: `add(2, 3)` is called when the file is checked; must be `5` |
| `:! T`   | the return type only; nothing runs, results are not checked                 |
| `:? 5`   | the worked example, and every result is also checked at run time            |

`fromTS` writes `:!` for every TypeScript return type. Write it yourself for a function
whose result depends on IO or on state that a check-time call would not have: `getUser()`
above presumably reads a session or a database, so calling it while checking the file would
fail or do harm. An `async` function is annotated with what it resolves to, not with
`Promise<…>`. `function add(a: 2, b: 3): 0` fails `tjs check`, because `add(2, 3)` is `5`.

## Interfaces and type aliases

<!-- tjs-doc: fragment -->

```typescript
interface User {
  name: string
  age: number
  email?: string
}

type Status = 'active' | 'inactive' | 'banned'
```

becomes a `Type` and a `Union`, both of which are runtime values with a `check`:

```tjs:inline
Type User {
  description: 'a registered user'
  example: { name: '', age: 0.0, email: '' | undefined }
}

Union Status 'account status' 'active' | 'inactive' | 'banned'

function register(user: User, status: Status) {
  return `${user.name}: ${status}`
}

console.log(register({ name: 'Ada', age: 36.5 }, 'active'))
// Ada: active
console.log(register({ name: 'Ada', age: 36, email: 42 }, 'active').message)
// Expected User for '…register.user', got object
console.log(register({ name: 'Ada', age: 36 }, 'deleted').message)
// Expected Status for '…register.status', got string
console.log(User.check({ name: 'Ada' }))
// false: check answers true or false, it does not return an error
```

The string after a `Union` or `Enum` name (`'account status'`) is its description, the
same thing `description:` is in a `Type` block. It is optional.

`age: 0.0` and `email: '' | undefined` are exactly what the converter writes for
`age: number` and `email?: string`.

## Enums

<!-- tjs-doc: fragment -->

```typescript
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}

enum Dir {
  Up,
  Down,
}
```

become `Enum` declarations, and member access works as it does in TypeScript:
`Color.Red` is `'red'`, and a numeric enum maps back from value to name (`Dir[0]` is
`'Up'`). An `Enum` is also a type, so a parameter declared `c: Color` rejects anything that
is not one of its values:

```tjs:inline
Enum Color 'CSS color' {
  Red = 'red'
  Green = 'green'
  Blue = 'blue'
}

Enum Dir 'direction' {
  Up
  Down
}

function paint(c: Color) {
  return `painting ${c}`
}

console.log(Color.Red, Color.Red === 'red', Dir.Up, Dir[0])  // red true 0 Up
console.log(paint(Color.Green))                               // painting green
console.log(paint('purple').message)
// Expected Color for '…paint.c', got string

// Extras a TypeScript enum does not have
console.log(Color.check('red'), Color.values, Color.names['red'])
// true ['red', 'green', 'blue'] Red
```

`Color.check(v)` answers whether `v` is a member's value, `Color.values` lists the values,
and `Color.names` maps each value back to its member's name.

The members are non-enumerable, so `Object.keys(Color)` does not list them; `Color.values`
and `Color.members` (`{ Red: 'red', … }`) do. Converted TypeScript enums work the same way:

```ts:inline
/* @tjs TjsStrict */

enum Color {
  Red = 'red',
  Green = 'green',
}

enum Dir {
  Up,
  Down,
}

console.log(Color.Red, Dir.Up, Dir[0])  // red 0 Up

// The Enum's extras are there too; tsc does not know about them, hence the cast
console.log((Color as any).check('red'), (Color as any).check('purple'))  // true false
```

One gap: in converted TypeScript, a parameter typed with an enum (`c: Color`) is not checked
yet. The converter marks it with a `TODO: TS types degraded` comment. Write the function in
TJS, as above, or check explicitly with `Color.check(c)`.

## Classes

<!-- tjs-doc: fragment -->

```typescript
class Point {
  private x: number
  private y: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  distanceTo(other: Point): number {
    return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2)
  }
}

const p = new Point(10, 20)
```

In TJS:

```tjs:inline
class Point {
  #x
  #y

  constructor(x: 0.0, y: 0.0) {
    this.#x = x
    this.#y = y
  }

  distanceTo(other: Point):! 0.0 {
    return Math.sqrt((this.#x - other.#x) ** 2 + (this.#y - other.#y) ** 2)
  }
}

const p = Point(0, 0) // a class is called, not constructed
console.log(p.distanceTo(Point(3, 4)))      // 5
console.log(isMonadicError(Point('a', 0)))  // true
```

- TypeScript's `private` exists only at compile time. Conversion drops it. Under
  `TjsStrict` it becomes a real `#private` field; in `.tjs`, write `#x` yourself. Fields are
  plain JavaScript fields and carry no example; the constructor's parameters are where the
  checks go.
- Constructor and method parameters are checked like any function's.
- A TJS class is called: `Point(0, 0)` does what `new Point(0, 0)` does. `new` on a class
  declared in the same file is a compile error in `.tjs`, because it adds nothing. `new` on
  a class imported from another module is left alone, so a TypeScript caller that writes
  `new Point(0, 0)` gets the same object. Built-in classes still need it: `new Map()`,
  `new Float32Array(4)`.

## Generics

TypeScript's type parameters (`<T>`) vanish at run time. TJS has no function-level
generics; it has `Generic` declarations, which produce runtime-checkable type constructors.
Inside the predicate, each type parameter arrives as a check function: `T(v)` is true when
`v` is a valid `T`.

```tjs:inline
Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
}

// Box(0) is the type "a Box of integers"
const IntBox = Box(0)
console.log(IntBox.check({ value: 42 }), IntBox.check({ value: 'nope' }))  // true false
```

When the type is a shape with the parameter in it, `Type Box<T>` with an example is
shorter: the example says where `T` goes, and TJS builds the predicate. Use `Generic` when
the check is more than a shape (a condition across members, say). Either can be applied in
an annotation:

```tjs:inline
Type Box<T> {
  example: { value: T }
}

function unbox(b: Box<int>) {
  return b.value
}

test 'Box<int> checks the value slot' {
  expect(unbox({ value: 1 })).toBe(1)
  expect(isMonadicError(unbox({ value: 1.5 }))).toBe(true)
}
```

A generic function such as `identity<T>` or `first<T>` has no TJS equivalent that keeps
the relationship between its types. TJS checks the values a function receives, not that
the result has the same type as the input, so write the loosest parameter that is right:
`function first(arr: [any]) { return arr[0] }` accepts an array of anything, which is what
TypeScript's `first<T>(arr: T[])` accepts. (`arr: [0]` would accept only arrays of
integers.) What you lose is the static link from argument to result type.

When converting, a constrained generic (`<T extends { id: number }>`) uses its constraint
as the example, and a default (`<T = string>`) uses the default. An unconstrained `<T>`
becomes `any`, which checks nothing; the converter warns about each one.

## Nullability

<!-- tjs-doc: fragment -->

```typescript
// TypeScript
function find(id: number): User | null { ... }

// TJS
function find(id: 0):! { name: '', age: 0 } | null { ... }
```

TJS distinguishes `null` from `undefined`. `| null` means the base type or `null`, but not
`undefined`. (TJS also changes `typeof null` to `'null'`; see
[Equality and `typeof`](#equality-and-typeof).) A parameter with a
default (`=`) accepts `undefined`, because that is what an omitted argument is.

## Discriminated unions

A discriminated union is a set of types that differ in one literal member.
`Exactly('circle')` makes that member exact (a plain `'circle'` example would mean "any
string").

TJS handles the dispatch with **polymorphic functions**: several declarations with the same
name merge into one function that picks a variant by its arguments. It chooses by number of
arguments first, then by how specific the types are, then by declaration order, and two
variants with the same types at the same arity are a compile error. See
[Polymorphic functions](TJS-SYNTAX.md#polymorphic-functions).

```tjs:inline
Type Circle { example: { kind: Exactly('circle'), r: 1.0 } }
Type Rect { example: { kind: Exactly('rect'), w: 1.0, h: 1.0 } }

function shapeArea(s: Circle) { return Math.PI * s.r ** 2 }
function shapeArea(s: Rect) { return s.w * s.h }

test 'dispatch on the discriminant' {
  expect(shapeArea({ kind: 'rect', w: 2, h: 3 })).toBe(6)
  expect(shapeArea({ kind: 'circle', r: 1 })).toBe(Math.PI)
  expect(isMonadicError(shapeArea({ kind: 'triangle', b: 2, h: 3 }))).toBe(true)
}
```

There is no `switch` on `kind` and no exhaustiveness check to remember: a value that
matches no variant is an error value, not a fall-through.

## Predicates instead of type-level programming

TypeScript's type system can express constraints like
`Pick<Omit<T, K>, Extract<keyof T, string>>`, but such types are often harder to read than
the code they describe, and they cannot check data at run time. In TJS, a type with a
`predicate` is a boolean function. If you can write the test, you can define the type:

<!-- tjs-doc: fragment -->

```typescript
// TypeScript: a branded type, a type guard, and a validator to keep in step
type Email = string & { __brand: 'email' }
function isEmail(s: string): s is Email {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}
```

The TJS version below checks the address with string methods instead of the regex. That
is a choice, not a limitation: TJS verifies a predicate written this way as pure (no side
effects) and bounded (it always finishes, whatever string it is given), which it cannot
prove of a regex literal. So a verified predicate is safe to run on any input, however
hostile, without a slow or runaway case. A regex works too; `tjs check` only warns that it
cannot verify it.

```tjs:inline
Type Email {
  description: 'email address'
  example: 'user@example.com'
  predicate(v) {
    if (typeof v !== 'string' || v.includes(' ')) return false
    const at = v.indexOf('@')
    return at > 0 && v.indexOf('.', at) > at + 1 && !v.endsWith('.')
  }
}

Type PositiveInt {
  description: 'a positive integer'
  example: 1
  predicate(v) { return Number.isInteger(v) && v > 0 }
}

function contact(email: Email | null, seats: PositiveInt) {
  return `${email ?? 'no email'}, ${seats} seats`
}

console.log(contact('ada@example.com', 2))           // ada@example.com, 2 seats
console.log(contact(null, 1))                        // no email, 1 seats
console.log(contact('ada@example', 1).message)       // Expected Email for '…contact.email', got string
console.log(contact('ada@example.com', 0).message)   // Expected PositiveInt for '…contact.seats', got number
```

| What you want       | TypeScript                                             | TJS                                    |
| ------------------- | ------------------------------------------------------ | -------------------------------------- |
| String with format  | branded type, type guard, validation function          | `Type Email { predicate(v) {…} }`      |
| Number in range     | branded type, manual check                             | `Type PositiveInt { predicate(v) {…} }` |
| Nullable variant    | `T \| null` (compile time only)                        | `x: MyType \| null` (checked)          |
| Union of literals   | `'a' \| 'b' \| 'c'` (compile time only)                | `Union Status 'a' \| 'b' \| 'c'`       |
| Discriminated union | `{ kind: 'circle' } \| …` plus narrowing               | `kind: Exactly('circle')`, overloads   |
| Generic container   | `interface Box<T>` (compile time only)                 | `Generic Box<T> { predicate(…) }`      |

TJS also ships common types: `TString`, `TNumber`, `TBoolean`, `TInteger`, `TPositiveInt`,
`TNonEmptyString`, `TEmail`, `TUrl`, `TUuid`, and the combinators `Nullable` and
`Optional`, all exported by `tjs-lang/runtime`, which also exports the date modules
`Timestamp` and `LegalDate` (see [Other rules](#other-rules-of-tjs)).

## TypeScript features and their TJS equivalents

| TypeScript feature          | In TJS                                                          |
| --------------------------- | --------------------------------------------------------------- |
| `interface`                 | `Type` with an example                                          |
| `type` aliases              | `Type`, `Union` or `Enum`                                       |
| Conditional, mapped types   | kept verbatim for `.d.ts` output; nothing is checked at run time |
| `keyof`, `typeof` in types  | runtime `Object.keys()`, `typeof`                               |
| `Partial<T>`, `Pick<T>`     | write the shape you need                                        |
| `.d.ts` files               | generated by `tjs emit --dts`                                   |
| `as` type assertions        | not needed: values are checked                                  |
| `any` escape hatch          | `x: any` for one parameter; `!` or `safety none` turn checks off ([Safety controls](#safety-controls)) |
| Decorators                  | not supported; conversion stops with an error                   |
| `namespace`                 | use modules                                                     |

Decorators are the one gap here that blocks code outright: `tjs convert` refuses a file
that uses them (legacy `experimentalDecorators` or the standard kind) and names the site,
rather than dropping them silently. A codebase built on a decorator framework such as
Angular, NestJS or TypeORM stays in TypeScript; it can still call TJS modules, as Part 1
shows.

## Where TJS behaves differently

A `.tjs` file fixes a few JavaScript behaviours that TypeScript inherits. Converted
TypeScript keeps JavaScript's behaviour until you graduate it or mark it `TjsStrict`.

### Equality and `typeof`

```tjs:inline
// == is honest: no coercion, boxed primitives unwrapped
console.log(0 == '')                     // false (JavaScript: true)
console.log(Object('foo') == 'foo')      // true
console.log(null == undefined)           // true (kept: it is useful)
console.log(typeof null)                 // 'null' (JavaScript: 'object')

// == is not structural: objects and arrays compare by reference
const a = { x: 1 }
console.log(a == { x: 1 })               // false

// Is / IsNot compare structure, explicitly
console.log(Is({ a: 1 }, { a: 1 }))                // true
console.log(Is([1, 2, 3], [1, 2, 3]))              // true
console.log(Is(new Set([1, 2]), new Set([2, 1])))  // true (sets ignore order)

// === is JavaScript's, unchanged
const n = NaN
console.log(a === a, n === n)                       // true false
console.log(Object('foo') === 'foo')                // false
```

`==` drops coercion without the cost of a deep comparison. `===` keeps exactly JavaScript's
meaning, so `NaN === NaN` is still `false` and a boxed string is not `===` its value; use
`==` when you want those to be equal. `a Is b` also works as an infix operator, but the call
form `Is(a, b)` is the recommended spelling, because it reads the same wherever it appears.

`typeof` is unchanged except for `null`, which is `'null'` rather than `'object'`. Code that
tested `typeof x === 'object'` to find objects no longer needs a separate `x !== null`.
`LegacyTypeOf(x)` gives JavaScript's answer.

If converted code relies on `==` coercion or on `typeof null` being `'object'`, conversion
writes `DangerousLegacyEquals(a, b)` or `LegacyTypeOf(x)` for it, so nothing changes
silently. [Equality, `typeof` and truthiness](TJS-SYNTAX.md#equality-typeof-and-truthiness)
has the full table.

### Errors are values

A TJS function does not throw for a bad argument; it returns a `MonadicError`, and a
`MonadicError` passed to another TJS function comes straight back out without the body
running:

```tjs:inline
function divide(a: 6.0, b: 3.0): 2.0 {
  if (b === 0) return new MonadicError('Division by zero')
  return a / b
}

function double(x: 1.0): 2.0 {
  return x * 2
}

console.log(double(divide(9, 3)))  // 6

const bad = divide(10, 0)
const passed = double(bad) // returns bad; the body does not run
console.log(isMonadicError(passed), passed === bad, passed.message)
// true true Division by zero
```

There is no `try`/`catch`, and a caller that forgets to check does not crash: the error
travels on as a value until something tests it with `isMonadicError`. (`MonadicError` is a
built-in class, so it takes `new`.)

The cost is the obvious one: an error nobody checks can travel a long way and end up
stored, or printed as text, far from where it happened. TJS gives you two ways to notice.
The runtime keeps a record of recent type errors, which `__tjs.errors()` returns (handy in
a test: run the code, then expect the list to be empty). And while debugging,
`configure({ logTypeErrors: true })` logs each one as it happens, and
`configure({ throwTypeErrors: true })` makes them throw instead (both from
`tjs-lang/runtime`).

[Runtime Validation](guides/examples/ts/ts-runtime-validation.md) shows errors as values from
converted TypeScript.

### Safety controls

<!-- tjs-doc: fragment -->

```typescript
safety none       // this module: no validation
safety inputs     // this module: validate inputs (the default in a .tjs file)
safety all        // this module: currently the same as inputs

function hot(! x: 0, y: 0) {}   // this function: skip validation of all its parameters
```

The default depends on the kind of file: a `.tjs` file validates inputs, while converted
TypeScript starts at `safety none` until you graduate it or mark it `TjsStrict`. The `!`
goes at the start of the parameter list and turns off every check in that function; there
is no per-parameter `!`, so to relax one parameter give it a looser type (`x: any`).

`safety all` validates the same as `safety inputs` today. To check a function's results at
run time, give it a `:?` return annotation. Skip validation with `!` only where the data is
already trusted and the call is hot: on trivial bodies, checked calls measure about 1.5 to
2 times the cost of unchecked ones ([benchmarks](benchmarks.md)), which is noise next to
most real work.

### Other rules of `.tjs`

These apply to `.tjs` files and to `.ts` files marked `TjsStrict`. Converted TypeScript
does not get them: the converter writes a named escape wherever the code depended on the
old behaviour, so it keeps running as before.

- `var` is a syntax error; use `const` or `let`. `const!` is compile-time immutability,
  with no runtime cost.
- `new Date(…)` is not allowed. A `Date` is mutable (`d.setMonth(…)` changes it for
  everyone holding it) and mixes a moment with a calendar date and the zone of whatever
  machine runs the code. TJS uses two plain values instead: a timestamp (milliseconds since
  1970 UTC, the number `Date.now()` returns, which is still allowed) and a legal date (a
  `'YYYY-MM-DD'` string), with the `Timestamp` and `LegalDate` modules of functions for
  each. `LegacyDate(x)` gives you a real `Date` where you need one, and conversion writes it
  for every `new Date(x)`. See [Built-in Types](guides/examples/tjs/built-in-types.md).
- `eval()` is not allowed; `Eval()` is the sandboxed form (Part 1). `new Function` is a
  warning.
- A line that starts with `(`, `[` or a backtick starts a new statement. JavaScript would
  join it to the line before, which is the classic missing-semicolon bug; TJS warns. A
  line still continues after a trailing operator, opening bracket or comma, and a line
  starting with `.` continues the one before, so chained calls formatted the Prettier way
  are unaffected.
- A boxed `false` (`Object(false)`) is falsy, and `new Boolean(…)`, `new String(…)` and
  `new Number(…)` are refused: use `Boolean(x)` and friends, or `Object(x)` for a deliberate wrapper.

[TJS Syntax](TJS-SYNTAX.md#the-rules-of-tjs) lists every rule and its named escape.

## Side by side: a complete example

<!-- tjs-doc: fragment -->

```typescript
interface Product {
  id: string
  name: string
  price: number
  tags: string[]
}

interface CartItem {
  product: Product
  quantity: number
}

function calculateTotal(items: CartItem[], taxRate: number = 0.1): number {
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )
  return Math.round(subtotal * (1 + taxRate) * 100) / 100
}

function applyDiscount(
  total: number,
  code: string | null
): { final: number; discount: number } {
  const discounts: Record<string, number> = { SAVE10: 0.1, SAVE20: 0.2 }
  const rate = code ? discounts[code] ?? 0 : 0
  return {
    final: Math.round(total * (1 - rate) * 100) / 100,
    discount: rate,
  }
}
```

In TJS, translated by hand (the converter's output would keep `quantity` as any number).
Three things to read in it: `quantity: +0` narrows the quantity to a non-negative integer,
which TypeScript's `number` cannot say; `code: 'SAVE10' | null` means "any string, or
`null`", with `'SAVE10'` as the example; and `applyDiscount`'s return annotation is a worked
example, so checking the file calls `applyDiscount(100, 'SAVE10')` and expects
`{ final: 90, discount: 0.1 }`:

```tjs:inline
Type Product {
  description: 'a product in the catalog'
  example: { id: '', name: '', price: 0.0, tags: [''] }
}

Type CartItem {
  description: 'a product with quantity'
  example: { product: Product, quantity: +0 }
}

function calculateTotal(items: [CartItem], taxRate = 0.1):! 0.0 {
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )
  return Math.round(subtotal * (1 + taxRate) * 100) / 100
}

function applyDiscount(total: 100.0, code: 'SAVE10' | null): { final: 90.0, discount: 0.1 } {
  const discounts = { SAVE10: 0.1, SAVE20: 0.2 }
  const rate = code ? discounts[code] ?? 0 : 0
  return {
    final: Math.round(total * (1 - rate) * 100) / 100,
    discount: rate,
  }
}

test 'cart calculation' {
  const items = [
    { product: { id: '1', name: 'Widget', price: 10, tags: [] }, quantity: 3 }
  ]
  expect(calculateTotal(items, 0)).toBe(30)
  expect(calculateTotal(items, 0.1)).toBe(33)
  expect(isMonadicError(calculateTotal([{ product: items[0].product, quantity: -1 }]))).toBe(true)
}

test 'discount codes' {
  expect(applyDiscount(100, null)).toEqual({ final: 100, discount: 0 })
  expect(applyDiscount(100, 'INVALID')).toEqual({ final: 100, discount: 0 })
}
```

It is about the same length. The types exist at run time (a negative quantity is
rejected), the signature of `applyDiscount` is tested, and the tests live beside the code.

## Converting a codebase

`tjs convert` turns TypeScript into TJS (or straight into JavaScript):

```bash
tjs convert src/label.ts --emit-tjs     # one file, TJS on stdout
tjs convert --emit-tjs src/ -o tjs/     # a directory, to .tjs files
tjs convert src/ -o js/                 # a directory, to .js
```

Conversion does not change behaviour: the output keeps JavaScript's semantics, and where
the TypeScript relied on a JavaScript behaviour that TJS fixes, it writes a named escape
(`DangerousLegacyEquals(a, b)`, `LegacyTypeOf(x)`). **Graduation** then makes the file
native TJS, still with the same behaviour, and you retire the escapes one at a time.
`TjsStrict` skips both steps (see [Three ways to adopt TJS](#three-ways-to-adopt-tjs)). [Converting a TypeScript Project](guides/sections/ts-converting-a-project.md)
walks through it; the appendix below lists what the converter does with each TypeScript
construct. From code, `fromTS(source, { emitTJS: true }).code` (from
`tjs-lang/lang/from-ts`) is the TJS source.

## Error locations instead of source maps

Every TJS function carries metadata, including where it was declared:
`add.__tjs.source` is `'mymodule.tjs:3'`, the file and line of the declaration. Type errors
use it: a rejected argument reads `Expected string for 'greet.tjs:1:greet.name', got
number`, which names the file, line, function and parameter without a source map.

That covers type errors, which are the ones a runtime-checked language adds. It does not
replace source maps for everything: a stack trace from a thrown exception, or a breakpoint
in a debugger, points at the emitted JavaScript. That JavaScript keeps your function bodies
as written, so it is readable, but a bundler will still move it around.

## FAQ

### How do I use TJS with existing npm packages?

As usual. JavaScript is valid TJS when it is compiled as JavaScript (a `.js` file, or the
`dialect: 'js'` option), and a `.tjs` file adds the rules above on top of it. Those rules
apply to your file, not to the packages it imports, which are ordinary JavaScript:

```javascript
import lodash from 'lodash'
import { z } from 'zod' // works, though you may not need it

// in the browser without a bundler, a CDN URL works too
import dayjs from 'https://esm.sh/dayjs@1.11.13'
```

A plain JavaScript library has no TJS metadata, so nothing checks what it returns. Wrap it
at your boundary:

```tjs:inline
// Stands in for an untyped library: import { rawGeocode } from 'legacy-geo-pkg'
function rawGeocode(addr) {
  return addr.includes('nowhere') ? { lat: 'unknown' } : { lat: 51.5, lon: -0.12 }
}

Type Coords {
  example: { lat: 0.0, lon: 0.0 }
}

function geocode(addr: 'London') {
  const result = rawGeocode(addr)
  return Coords.check(result)
    ? result
    : new MonadicError(`geocoder returned ${JSON.stringify(result)}`)
}

console.log(geocode('London'))
console.log(geocode('nowhere').message)
```

The library code runs freely, and the wrapper checks its result before it enters your typed
code. Why not `function geocode(addr: ''): { lat: 0.0, lon: 0.0 }`? A plain return
annotation is a worked example, so TJS would call `geocode('')`, and with it the library,
at build time. `:!` documents a return type without checking it; an explicit `check`, as
here, is the way to validate a value from code you do not control.

### Do Proxies, WeakMaps and other advanced patterns work?

Yes. TJS adds checks at function entry and a `__tjs` metadata property on functions; it
does not wrap or intercept JavaScript objects.

- **Proxies** behave as in plain JavaScript. For custom equality, implement the
  `[tjsEquals]` symbol (`Symbol.for('tjs.equals')`).
- **WeakMap / WeakSet** are unaffected.
- **`Object.defineProperty`**, getters and setters work as expected. A check reads values,
  not property descriptors.
- **Prototype chains** are preserved, and `instanceof` works with TJS classes.

### Does `Is` handle circular references?

Yes. `Is` and `IsNot` detect cycles, so two structures that refer to themselves in the same
way compare equal, and the comparison terminates. `==` never recurses at all: it compares
objects by reference.

### What happens to TypeScript's `strict` checks?

TJS has no `strictNullChecks` or `noImplicitAny`, because it checks values instead:

- **Null safety:** a parameter accepts `null` only if its type says `| null`.
- **Implicit any:** every checked parameter has an example or a type name. An unannotated
  parameter accepts anything, as in JavaScript.
- **Property access:** a missing required property is a type error at the call, with its
  location, rather than an `undefined` later.

---

## Appendix: what `fromTS` does with TypeScript

### Constructs it converts

- Primitive annotations (`string`, `number`, `boolean`) become checks. `number` becomes a
  float check, written `0.0` in some places and `number` in others (the same check)
- Interfaces become `Type` declarations
- Generic interfaces become `Generic` declarations, with a `declaration { … }` block: the
  TypeScript body, copied into the generated `.d.ts` and removed from the JavaScript
- String literal unions become `Union`; enums become `Enum`
- Function type aliases become `FunctionPredicate` declarations, which check that a value
  is a function and record its parameters and return type for docs and `.d.ts` (see
  [Declarations](TJS-SYNTAX.md#declarations))
- `T | null` becomes a nullable check
- Optional parameters and defaults are kept
- Rest parameters (`...args: number[]`) keep their `...`
- `private` is stripped (or becomes `#private` under `TjsStrict`)
- `Promise<T>` return types are unwrapped to `T`
- DOM types become `{}`, an opaque object, so the parameter stays annotated
- Constrained generics use the constraint as the example; `<T = string>` uses the default

### `@tjs` annotations

Comments of the form `/* @tjs … */` in a `.ts` file enrich the TJS output. `tsc` ignores
them.

<!-- tjs-doc: fragment -->

```typescript
/* @tjs TjsStrict */ // the whole file as full TJS

/* @tjs-skip */ // leave this declaration out
export type Unboxed<T> = T extends { value: infer U } ? U : T

/* @tjs predicate(x, T) { return typeof x === 'object' && T(x.value) } */
export interface Box<T> {
  value: T
}

/* @tjs example: { name: 'Alice', age: 30 } */
export interface User {
  name: string
  age: number
}
```

An `example:` annotation is taken literally, so `age: 30` here makes `age` an integer.

### What it can't fully express

| TypeScript pattern                          | What happens                                                         |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Conditional types (`T extends U ? X : Y`)   | kept verbatim in a declaration block; checks nothing                 |
| Mapped types (`{ [K in keyof T]: … }`)      | kept verbatim in a declaration block; checks nothing                 |
| Intersection types (`A & B`)                | kept as a comment in an empty `Type`; checks nothing                 |
| `Partial<T>`, `ReturnType<T>` and other utility types | `any`, with a warning                                      |
| Template literal types (`` `user-${string}` ``) | `any`                                                            |
| `readonly string[]`                         | `any` (use `const!` for compile-time immutability)                   |
| Unconstrained generics (`<T>`)              | `any`, with a warning                                                |
| Enum-typed parameters (`c: Color`)          | `any` (the `Enum` itself converts)                                   |

Every parameter that ends up as `any` gets a `TODO: TS types degraded` comment in the
converted output. Search for it: each one is a check you can add by hand.

A `namespace` converts to the `var NS; (function (NS) { … })(NS || (NS = {}))` code
TypeScript itself emits. It runs, but `var` is not allowed in native TJS, so rewrite the
namespace as a module before you graduate the file.

### What it refuses

Some constructs cannot be converted without changing what the code does. For those,
conversion stops with a `FromTSRefusal` error that names the construct and its file, line
and column, rather than dropping it:

- decorators, of either kind (`@Component`, `@Injectable`, …)
- auto-accessor fields (`accessor x = 1`); write the field and its get/set pair instead
- any class modifier or member kind the converter has no rule for yet, named in the error

### `.d.ts` generation

`tjs emit --dts file.tjs -o out/file.js` writes `out/file.d.ts` beside the JavaScript:
functions, classes (as callable functions plus a class declaration), constants, and the
TypeScript bodies kept in declaration blocks, so TypeScript consumers of a converted
library still see conditional and mapped types.

---

## Learn more

- [TJS Language Reference](DOCS-TJS.md): the language guide, feature by feature, with
  explanations
- [TJS Syntax](TJS-SYNTAX.md): the compact lookup table for every construct and rule
- [TJS for JavaScript Programmers](TJS-FOR-JS.md): coming from plain JavaScript
- [AJS Agent Language](DOCS-AJS.md): the sandboxed agent VM
