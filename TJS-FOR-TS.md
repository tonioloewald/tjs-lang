<!--{"section": "tjs-for-ts", "group": "docs", "order": 30, "navTitle": "TJS for TS Devs", "pin": "top", "book": ["default", "ts"]}-->
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

The rest of the book goes deeper:
[TypeScript: The Good, the Bad, and the Ugly](guides/sections/typescript-good-bad-ugly.md)
makes the case, [Converting a TypeScript Project](guides/sections/ts-converting-a-project.md)
is the how-to for `tjs convert` and graduation,
[Validating JSON at the Boundary](guides/sections/ts-json-boundary.md) covers the place
TypeScript's types are most often wrong, and [TJS vs TypeScript](docs/tjs-vs-typescript.md)
is a comparison table in which every row is executed against `tsc --strict` and TJS.

---

## In this section

<!-- prettier-ignore-start -->

<!-- toc -->
- [TypeScript Examples](/ts-examples/)
- [Converting a TypeScript Project](/ts-converting-a-project/)
- [Validating JSON at the Boundary](/ts-json-boundary/)
<!-- /toc -->

<!-- prettier-ignore-end -->

# Part 1: Using TJS from TypeScript

You don't have to rewrite anything. Everything in this part works from a TypeScript
codebase.

## Call a TJS function from TypeScript

A TJS function checks its arguments on every call. A bad argument does not throw: the
function returns a `MonadicError` (a subclass of `Error`) and its body never runs. The
caller tests the result with `isMonadicError`.

This example is TypeScript. The `TjsStrict` comment converts it to full TJS, so `greet`
checks its `User` argument and the TypeScript caller handles the error as a value:

```ts:inline
/* @tjs TjsStrict */

// In a project you would import it: import { isMonadicError } from 'tjs-lang/runtime'
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
console.log(handle('{"name": "Ada", "age": "36"}'))
console.log(handle('null'))
```

`tsc` accepts all of this: as far as it knows, `greet` returns a `string`. The second and
third calls are rejected at run time, where the data actually arrives.

In a project the TJS function usually lives in its own `.tjs` file and TypeScript imports
it. With Bun, preload the plugin in `bunfig.toml`:

```text
# bunfig.toml
preload = ["tjs-lang/bun-plugin"]
```

and `.tjs` files import like any other module:

<!-- tjs-doc: fragment -->

```typescript
// main.ts
import { isMonadicError } from 'tjs-lang/runtime'
import { greet } from './greet.tjs' // export function greet(name: 'World'): 'Hello, World!'

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
(`tjs emit src/ -o dist/`; the CLI itself runs on Bun). The emitted JavaScript needs no
runtime package: each file carries the small runtime it uses. `--dts` adds a declaration
file: `tjs emit --dts greet.tjs -o dist/greet.js` writes `dist/greet.d.ts`
(`export declare function greet(name: string): string`), which types an import of the
emitted `greet.js`. `tsc` knows nothing about a direct `./greet.tjs` import through the Bun
plugin, so that needs a `declare module '*.tjs'` shim, and the import is then untyped.

## Turn on checks for one TypeScript file

You do not have to write TJS to get runtime checks. Mark a `.ts` file
`/* @tjs TjsStrict */` and its interfaces become validators. This is TypeScript, converted
and run on the page:

```ts:inline
/* @tjs TjsStrict */

interface Order {
  items: { id: number; qty: number }[]
  total: number
}

function processOrder(order: Order): { status: string } {
  return { status: `ok, ${order.items.length} items` }
}

console.log(processOrder({ items: [{ id: 1, qty: 2 }], total: 9.5 }))
console.log(processOrder(JSON.parse('{"items": [{"id": 1, "qty": "two"}], "total": 9.5}')))
```

`TjsStrict` gives the whole file TJS semantics at once, including honest `==`. For a file
you are migrating, [Converting a TypeScript Project](guides/sections/ts-converting-a-project.md)
describes the safer route, which changes nothing until you choose to. For checking API data
specifically, see [Validating JSON at the Boundary](guides/sections/ts-json-boundary.md).

## Run untrusted code: `Eval` and `SafeFunction`

`tjs-lang/eval` runs code you did not write (a user's formula, a model's output) in a
fuel-metered sandbox, without `eval()` or `new Function`:

```typescript
import { Eval, SafeFunction } from 'tjs-lang/eval'

// Run code once, with a fuel budget and only the values you pass in
const { result, fuelUsed } = await Eval({
  code: 'const cheap = items.filter(x => x.price < threshold)\nreturn cheap.length',
  context: { items: [{ price: 5 }, { price: 50 }], threshold: 10 },
  fuel: 1000,
})
// result: 1

// Or compile a reusable function
const underBudget = await SafeFunction({
  body: 'return items.filter(x => x.price < budget)',
  params: ['items', 'budget'],
  fuel: 500,
})
const { result: cheap } = await underBudget([{ price: 5 }, { price: 500 }], 100)
// cheap: [{ price: 5 }]
```

The code has no IO. It can reach the network or a store only through capabilities you pass
in (`capabilities: { fetch }`), and it stops when its fuel runs out. Errors come back as an
`error` field, not as exceptions. [Safe Eval](guides/safe-eval.md) covers the options.

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
```

Atoms such as `llmPredict` take named inputs and refuse any they do not declare
(`llmPredict` takes `prompt` and `options`). The [AJS guide](DOCS-AJS.md) lists the atoms,
the capabilities each one reads, and the budgets a run accepts.

## Build agents in TypeScript: the builder

`Agent` builds the same kind of AST with a fluent API, without writing AJS source:

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

`s` is tosijs-schema, re-exported by `tjs-lang/schema`. The builder writes a version-1 AST;
see [Builder API](DOCS-AJS.md) for how that differs from what the transpiler writes.

## Entry points

The package is split so you import only what you use:

<!-- tjs-doc: fragment -->

```typescript
import { Agent, AgentVM, ajs, tjs } from 'tjs-lang' // everything
import { Eval, SafeFunction } from 'tjs-lang/eval' // safe eval only
import { tjs, transpile } from 'tjs-lang/lang' // language tools
import { fromTS } from 'tjs-lang/lang/from-ts' // TS -> TJS converter (loads TypeScript)
import { AgentVM } from 'tjs-lang/vm-ast' // the agent VM, no parser
import { isMonadicError, TEmail } from 'tjs-lang/runtime' // runtime helpers and types
import { s, validate } from 'tjs-lang/schema' // tosijs-schema
```

Only `tjs-lang/lang/from-ts` needs the `typescript` package installed.

## Tooling

| Concern              | TypeScript                       | TJS                                                                                                         |
| -------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Type checking**    | `tsc`, at compile time           | Checks emitted into the code, at run time; `tjs check` runs signature examples and tests                    |
| **Runtime schemas**  | Zod / io-ts / Ajv, kept in sync  | The type is the schema; `Type(…).toJSONSchema()` exports JSON Schema                                        |
| **Linting**          | ESLint and plugins               | Built-in checks (unused variables, unreachable code, `new` on your own class) in `tjs check`                |
| **Testing**          | Vitest / Jest, separate files    | Inline `test` blocks and worked return examples, run by `tjs check` / `tjs test`                            |
| **Build**            | `tsc` plus a bundler             | `tjs` CLI (runs on Bun), the Bun runtime plugin, the `Bun.build` plugin                                     |
| **Declarations**     | `.d.ts` from `tsc`               | `tjs emit --dts`                                                                                            |
| **Documentation**    | JSDoc / TypeDoc                  | `tjs emit` writes Markdown docs from signatures and doc comments                                            |
| **Editor support**   | Full language service            | Syntax highlighting for VS Code / Cursor (`npx ajs-install-vscode`), plus Monaco, CodeMirror and Ace modes   |

The editor support is highlighting only: there is no TJS language server, so you get no
type-aware completion or go-to-definition in `.tjs` files yet.

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
**worked example**: when the file is built, TJS calls `greet('World')` and compares the
result with `'Hello, World!'`. A wrong body fails the build. To state a return type without
running anything, write `:!`. [Examples as contracts](guides/sections/typescript-good-bad-ugly.md#examples-as-contracts)
explains all four jobs an example does.

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

| You write      | TJS type             | Runtime check                   |
| -------------- | -------------------- | ------------------------------- |
| `3.14`, `0.0`  | number (float)       | any number                      |
| `42`, `0`      | integer              | `Number.isInteger(x)`           |
| `+20`, `+0`    | non-negative integer | `Number.isInteger(x) && x >= 0` |

The converter maps TypeScript's `number` to `0.0`, the widest of the three, so converted
code accepts what it accepted before. Narrow to `0` or `+0` by hand where that is what you
mean.

**TypeScript's type names work too.** `name: string`, `count: number`, `flag: boolean` and
`items: string[]` are valid TJS and real runtime checks: `s: string` means exactly what
`s: ''` means. `int`, `float` and `unsigned` name the three numeric types. The example form
is the native spelling because it also gives a value to document and test with.

## Optional parameters

<!-- tjs-doc: fragment -->

```typescript
// TypeScript                    // TJS
function f(x?: string) {}        function f(x = '') {}
function f(x: string = 'hi') {}  function f(x = 'hi') {}
```

`= value` makes a parameter optional, with that default, and the default is also its
example: `x = 'hi'` accepts any string or nothing.

## Object shapes

```tjs:inline
function createUser(opts: { name: '', age: 0.0, email: '' | undefined }) {
  return opts.email ? `${opts.name} <${opts.email}>` : opts.name
}

console.log(createUser({ name: 'Ada', age: 36 }))
console.log(createUser({ name: 'Ada', age: 36, email: 'ada@example.com' }))
console.log(createUser({ name: 'Ada' }).message)
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
  expect(area(null) instanceof Error).toBe(true)
}
```

The members carry their examples directly. The TypeScript spelling, a pattern followed by
`: Shape`, is accepted and checked too. Use it when the pattern cannot hold the type: a
named type (`({ x, y }: Point)`), a rename (`({ w: width }: Size)`, since in a pattern a
colon followed by a name IS a rename), or a default inside the pattern. Either way the
argument is checked as one value: `null`, a string or an `Error` you made is a type error
whose `received` is what was passed, and a monadic error passes through unchanged.

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
| `: 5`    | worked example: `add(2, 3)` is called at build time and must equal `5`      |
| `:! T`   | the return type only; nothing runs, results are not checked                 |
| `:? 5`   | the worked example, and every result is also checked at run time            |

`fromTS` writes `:!` for every TypeScript return type, and it is what you want for a
function with side effects or one that needs setup (`getUser` above). An `async` function
is annotated with what it resolves to, not with `Promise<…>`. `function add(a: 2, b: 3): 0`
fails the build, because `add(2, 3)` is `5`.

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
console.log(register({ name: 'Ada', age: 36, email: 42 }, 'active').message)
console.log(register({ name: 'Ada', age: 36 }, 'deleted').message)
console.log(User.check({ name: 'Ada' }))
```

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

console.log(Color.Red, Color.Red === 'red', Dir.Up, Dir[0])
console.log(paint(Color.Green))
console.log(paint('purple').message)

// Extras a TypeScript enum does not have
console.log(Color.check('red'), Color.values, Color.names['red'])
```

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

console.log(Color.Red, Dir.Up, Dir[0])
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
console.log(p.distanceTo(Point(3, 4)))
console.log(Point('a', 0) instanceof Error)
```

- TypeScript's `private` exists only at compile time. Conversion strips it; in `.tjs` (and
  in a `.ts` file marked `TjsStrict`) use, or get, a real `#private` field.
- Constructor and method parameters are checked like any function's.
- A TJS class is called: `Point(0, 0)` does what `new Point(0, 0)` does. `new` on a class
  declared in the same file is a compile error in `.tjs`, because it adds nothing. Built-in
  classes still need it: `new Map()`, `new Float32Array(4)`.

## Generics

TypeScript's type parameters (`<T>`) vanish at run time. TJS has no function-level
generics; it has `Generic` declarations, which produce runtime-checkable type constructors:

```tjs:inline
Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
}

// Box(0) is the type "a Box of integers"
const IntBox = Box(0)
console.log(IntBox.check({ value: 42 }), IntBox.check({ value: 'nope' }))
```

When the example already says where the parameter goes, the predicate is optional, and a
parameterized type can be applied in an annotation:

```tjs:inline
Type Box<T> {
  example: { value: T }
}

function unbox(b: Box<int>) {
  return b.value
}

test 'Box<int> checks the value slot' {
  expect(unbox({ value: 1 })).toBe(1)
  expect(unbox({ value: 1.5 }) instanceof Error).toBe(true)
}
```

A generic function such as `identity<T>` or `first<T>` needs no type parameter at all.
TJS checks the concrete values a function receives, not the relationship between type
parameters: `function first(arr: [0]) { return arr[0] }` accepts an array of integers.

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

TJS distinguishes `null` from `undefined`, as their `typeof`s do (in TJS, `typeof null` is
`'null'`). `| null` means the base type or `null`, but not `undefined`. A parameter with a
default (`=`) accepts `undefined`, because that is what an omitted argument is.

## Discriminated unions

A discriminated union is a set of types that differ in one literal member.
`Exactly('circle')` makes that member exact (a plain `'circle'` example would mean "any
string"), and same-name functions dispatch on the type:

```tjs:inline
Type Circle { example: { kind: Exactly('circle'), r: 1.0 } }
Type Rect { example: { kind: Exactly('rect'), w: 1.0, h: 1.0 } }

function area(s: Circle) { return Math.PI * s.r ** 2 }
function area(s: Rect) { return s.w * s.h }

test 'dispatch on the discriminant' {
  expect(area({ kind: 'rect', w: 2, h: 3 })).toBe(6)
  expect(area({ kind: 'triangle', b: 2, h: 3 }) instanceof Error).toBe(true)
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

console.log(contact('ada@example.com', 2))
console.log(contact(null, 1))
console.log(contact('ada@example', 1).message)
console.log(contact('ada@example.com', 0).message)
```

(A predicate written with string methods, as here, can be verified as pure and bounded. A
regex literal works too, but `tjs check` warns that it cannot verify it.)

| What you want       | TypeScript                                             | TJS                                    |
| ------------------- | ------------------------------------------------------ | -------------------------------------- |
| String with format  | branded type, type guard, validation function          | `Type Email { predicate(v) {…} }`      |
| Number in range     | branded type, manual check                             | `Type Age { predicate(v) {…} }`        |
| Nullable variant    | `T \| null` (compile time only)                        | `x: MyType \| null` (checked)          |
| Union of literals   | `'a' \| 'b' \| 'c'` (compile time only)                | `Union Status 'a' \| 'b' \| 'c'`       |
| Discriminated union | `{ kind: 'circle' } \| …` plus narrowing               | `kind: Exactly('circle')`, overloads   |
| Generic container   | `interface Box<T>` (compile time only)                 | `Generic Box<T> { predicate(…) }`      |

TJS also ships common types: `TString`, `TNumber`, `TBoolean`, `TInteger`, `TPositiveInt`,
`TNonEmptyString`, `TEmail`, `TUrl`, `TUuid`, `Timestamp`, `LegalDate`, and the combinators
`Nullable` and `Optional`, all exported by `tjs-lang/runtime`.

## What TypeScript has that TJS doesn't

| TypeScript feature          | In TJS                                                          |
| --------------------------- | --------------------------------------------------------------- |
| `interface`                 | `Type` with an example                                          |
| `type` aliases              | `Type`, `Union` or `Enum`                                       |
| Conditional, mapped types   | kept verbatim for `.d.ts` output; nothing is checked at run time |
| `keyof`, `typeof` in types  | runtime `Object.keys()`, `typeof`                               |
| `Partial<T>`, `Pick<T>`     | write the shape you need                                        |
| `.d.ts` files               | generated by `tjs emit --dts`                                   |
| `as` type assertions        | not needed: values are checked                                  |
| `any` escape hatch          | `!` on a function, or `safety none` for a module                |
| Decorators                  | not supported                                                   |
| `namespace`                 | use modules                                                     |

## Where TJS behaves differently

A `.tjs` file fixes a few JavaScript behaviours that TypeScript inherits. Converted
TypeScript keeps JavaScript's behaviour until you graduate it or mark it `TjsStrict`.

### Equality

```tjs:inline
// == is honest: no coercion, boxed primitives unwrapped
console.log(0 == '')                     // false (JavaScript: true)
console.log(new String('foo') == 'foo')  // true
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
console.log(new String('foo') === 'foo')            // false
```

`==` drops coercion without the cost of a deep comparison. `===` keeps exactly JavaScript's
meaning, so `NaN === NaN` is still `false` and a boxed string is not `===` its value; use
`==` when you want those to be equal. Prefer the call form `Is(a, b)`: the infix spelling
`a Is b` is accepted only with simple operands in a statement of its own (see
[Equality Operators](TJS-SYNTAX.md#equality-operators)). If converted code relies on `==`
coercion, conversion writes `DangerousLegacyEquals(a, b)` for it, so nothing changes
silently.

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

console.log(double(divide(9, 3)))

const bad = divide(10, 0)
const passed = double(bad) // returns bad; the body does not run
console.log(isMonadicError(passed), passed === bad, passed.message)
```

There is no `try`/`catch`, and a caller that forgets to check does not crash: the error
travels on as a value until something tests it with `isMonadicError`. (`MonadicError` is a
built-in class, so it takes `new`.) If you have used Rust's `Result` or Haskell's `Either`,
the idea is familiar.
[Runtime Validation](guides/examples/ts/ts-runtime-validation.md) shows the same thing from
converted TypeScript.

### Safety controls

<!-- tjs-doc: fragment -->

```typescript
safety none       // this module: no validation
safety inputs     // this module: validate inputs (the default)
safety all        // this module: currently the same as inputs

function hot(! x: 0) {}   // this function: skip validation
```

`safety all` validates the same as `safety inputs` today. To check a function's results at
run time, give it a `:?` return annotation. Skip validation with `!` only where the data is
already trusted and the call is hot: on trivial bodies, checked calls measure about 1.5x
the cost of unchecked ones ([benchmarks](benchmarks.md)), which is noise next to most real
work.

### Other rules of `.tjs`

- `var` is a syntax error; use `const` or `let`. `const!` is compile-time immutability,
  with no runtime cost.
- Raw `Date` is not allowed; `Timestamp` and `LegalDate` replace it (`LegacyDate(x)` when
  you need the original).
- To make type errors loud while debugging:
  `configure({ logTypeErrors: true })` logs each one, and
  `configure({ throwTypeErrors: true })` throws instead of returning (both from
  `tjs-lang/lang`).

[TJS Syntax](TJS-SYNTAX.md#the-rules-of-tjs-there-are-no-mode-directives) lists every rule
and its named escape.

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

In TJS:

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
  expect(calculateTotal([{ product: items[0].product, quantity: -1 }]) instanceof Error).toBe(true)
}

test 'discount codes' {
  expect(applyDiscount(100, null)).toEqual({ final: 100, discount: 0 })
  expect(applyDiscount(100, 'INVALID')).toEqual({ final: 100, discount: 0 })
}
```

It is about the same length. The types exist at run time (a negative quantity is
rejected), `applyDiscount`'s signature is a worked example that runs at build time, and the
tests live beside the code.

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
`TjsStrict` skips both steps. [Converting a TypeScript Project](guides/sections/ts-converting-a-project.md)
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
`tjs emit --unsafe` strips the metadata for production builds.

## FAQ

### How do I use TJS with existing npm packages?

TJS is a superset of JavaScript, so you import packages as usual:

```javascript
import lodash from 'https://esm.sh/lodash@4.17.21'
import { z } from 'zod' // works, though you may not need it
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

- Primitive annotations (`string`, `number`, `boolean`) become checks; `number` becomes `0.0`
- Interfaces become `Type` declarations
- Generic interfaces become `Generic` declarations, with a declaration block for `.d.ts`
- String literal unions become `Union`; enums become `Enum`
- Function type aliases become `FunctionPredicate` declarations
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

### `.d.ts` generation

`tjs emit --dts file.tjs -o out/file.js` writes `out/file.d.ts` beside the JavaScript:
functions, classes (as callable functions plus a class declaration), constants, and the
TypeScript bodies kept in declaration blocks, so TypeScript consumers of a converted
library still see conditional and mapped types.

---

## Learn more

- [TJS Language Reference](DOCS-TJS.md): full syntax and features
- [TJS Syntax](TJS-SYNTAX.md): the reference for every construct on this page
- [TJS for JavaScript Programmers](TJS-FOR-JS.md): coming from plain JavaScript
- [AJS Agent Language](DOCS-AJS.md): the sandboxed agent VM
