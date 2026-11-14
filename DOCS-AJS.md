<!--{"section": "ajs", "group": "docs", "order": 20, "navTitle": "The Language", "parent": "ajs.md"}-->
<!-- TODO review -->

# The AJS Language

_Code as data. Safe. Async. Sandboxed._

This chapter is the language guide and reference for people (and models) who **write** AJS
agents. Running agents in your own application (budgets, timeouts, capabilities, tracing) is
covered in [Embedding the AJS VM](/ajs-host/); giving agents new powers is in
[Capabilities and Custom Atoms](/ajs-capabilities/); every atom's inputs and outputs are in the
[Atom Reference](/ajs-atoms/).

---

## What is AJS?

AJS (AsyncJS) is a JavaScript subset that compiles to a **JSON AST**. It is designed for code you
do not trust: user scripts, LLM-generated agents, logic sent from somewhere else.

```ajs
function repoSummary({ owner = 'tonioloewald', repo = 'tjs-lang' }) {
  let r = httpFetch({ url: `https://api.github.com/repos/${owner}/${repo}` })
  return { name: r.full_name, stars: r.stargazers_count, language: r.language }
}
```

The compiled form is plain JSON, so it can be:

- stored in a database,
- sent over the network,
- audited before it runs,
- executed in a sandboxed VM that has no I/O except what the host grants, and that stops every
  program within a fuel budget.

Three words recur on every page of this book:

- The **host** is the application that runs the VM: your server, your page, your worker.
- A **capability** is a function the host hands the VM for one run, such as `fetch` or a model
  client. With no capabilities, an agent cannot touch the outside world at all.
- **Fuel** is the run's budget for work. Every step costs some, and the run stops when it is
  spent, so no program runs forever.

`httpFetch` above is an **atom**: a built-in operation the VM provides. Every effect an agent
has on the world goes through an atom, and every atom that touches the world needs a capability
the host chose to grant.

### How the pieces fit

Source goes to the transpiler, which writes the JSON AST. The host gives the AST, the arguments
and a budget to the VM, and gets back a value, never an exception:

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const { ast } = transpile(`
  function add({ a: 0, b: 0 }) {
    return { sum: a + b }
  }
`)
const vm = new AgentVM()
const run = await vm.run(ast, { a: 2, b: 3 }, { fuel: 100 })
// run.result: { sum: 5 }, run.error: undefined, run.fuelUsed: about 0.5
```

Transpiling and running can happen in different places: the AST is data, so it can be compiled
once, stored, and run later or elsewhere. Capabilities are passed as `vm.run(ast, args, {
capabilities })`. Everything about the host side is in [Embedding the AJS VM](/ajs-host/).

## Use cases

### AI agents

Fetch, think, answer. The model call needs an LLM capability. Without one, `llmPredict` fails
with `Capability 'llm.predict' missing` (an ordinary error a `try` can catch), so run this with
a model configured (see [Embedding the AJS VM](/ajs-host/)). On the doc site, where no model is
available, the live example says so.

```ajs
function researchAgent({ topic = 'sandboxing' }) {
  let search = httpFetch({
    url: `https://api.github.com/search/repositories?q=${encodeURIComponent(topic)}&per_page=5`,
  })
  let names = search.items.map((repo) => repo.full_name)
  let summary = llmPredict({
    prompt: `In two sentences, what do these projects about ${topic} have in common? ${names.join(', ')}`,
  })
  return { topic, names, summary }
}
```

### Rule engines

Business rules that change more often than the application, stored as data and run safely.

```ajs
function applyDiscounts({ cart = { total: 120 }, userTier = 'gold' }) {
  let discount = 0

  if (userTier === 'gold') {
    discount = 0.2
  } else if (userTier === 'silver') {
    discount = 0.1
  }

  if (cart.total > 100) {
    discount = discount + 0.05
  }

  return {
    originalTotal: cart.total,
    discount,
    finalTotal: cart.total * (1 - discount),
  }
}
```

Returns `{ originalTotal: 120, discount: 0.25, finalTotal: 90 }`.

### Smart configuration

Configuration that decides, rather than configuration that lists.

```ajs
function routeRequest({
  request = { path: '/api/users/42' },
  config = {
    rules: [
      { prefix: '/api/', backend: 'api-pool', timeout: 5000 },
      { prefix: '/static/', backend: 'cdn', timeout: 1000 },
    ],
    defaultBackend: 'web-pool',
  },
}) {
  for (let rule of config.rules) {
    if (request.path.startsWith(rule.prefix)) {
      return { backend: rule.backend, timeout: rule.timeout }
    }
  }
  return { backend: config.defaultBackend, timeout: 30000 }
}
```

Returns `{ backend: 'api-pool', timeout: 5000 }`.

### Remote jobs

Send the code to the data instead of the data to the code. The client transpiles the agent and
sends its AST to the service that holds the data; the service runs it there with its own
capabilities and budget, and only the result travels back. The agent itself is ordinary AJS:

```ajs
function applyTransform(item, transform) {
  if (transform == 'double') {
    return item * 2
  }
  return item
}

function processDataBatch({ items = [1, 2, 3], transform = 'double' }) {
  let results = []
  for (let item of items) {
    let processed = applyTransform(item, transform)
    results.push(processed)
  }
  return { processed: results.length, results }
}
```

Returns `{ processed: 3, results: [2, 4, 6] }`. `applyTransform` is a helper, and helpers take
ordinary positional arguments; only the last function, the entry point, takes one object of
named arguments (see [Local helper functions](#local-helper-functions)).

---

## Syntax

AJS is a JavaScript subset: familiar syntax, fewer features. It is deliberately small, small
enough that small local models write it well; the project measures this with a pinned small model
(see [Maintaining this prompt](/ajs-llm-prompt/#maintaining-this-prompt)).

### What's Allowed

One agent that uses most of the language:

```ajs
function tour({ name = 'Ada', items = [{ name: 'a', qty: 2 }, { name: 'b', qty: 0 }], limit = 3 }) {
  // Variables
  let count = 0
  const greeting = `Hello, ${name}!`

  // Conditionals, ternary, logical operators
  const size = items.length > limit ? 'big' : 'small'
  const label = name || 'anonymous'
  const note = items[0].note ?? 'none' // member reads are already null-safe; no ?. needed

  // for...of and while (there is no C-style for)
  let names = []
  for (const item of items) {
    if (item.qty > 0) {
      names.push(item.name)
    }
  }
  while (count < limit) {
    count += 1
  }

  // Object and array literals, spread. To change a member, build a new object.
  const defaults = { color: 'red', size }
  const merged = { ...defaults, size: 'medium' }
  const all = [...names, 'z']

  // Arrow functions, passed straight to map / filter / find / reduce
  const total = items.reduce((sum, item) => sum + item.qty, 0)

  // try / catch (see Errors)
  let parsed = null
  try {
    parsed = JSON.parse('{ not json')
  } catch (err) {
    parsed = { failed: true }
  }

  return { greeting, size, label, note, names, count, merged, all, total, parsed }
}
```

It returns:

```javascript
{
  greeting: 'Hello, Ada!',
  size: 'small',
  label: 'Ada',
  note: 'none',
  names: ['a'],
  count: 3,
  merged: { color: 'red', size: 'medium' },
  all: ['a', 'z'],
  total: 2,
  parsed: { failed: true },
}
```

Also allowed: every compound assignment (`+=`, `-=`, `*=`, …), `++` and `--` as statements,
assignment to an outer variable from inside a loop body, `typeof`, `%` and `**`.

`console.log`, `console.warn` and `console.error` are accepted and do nothing: no output, and
nothing in the trace. To see a value, return it.

### Loop idioms

There is no C-style `for`, no `break` and no `continue`. These three shapes cover what they did:

```ajs
function loops({ xs = [1, 5, 9, 2] }) {
  // Walk indices: while with a counter
  let i = 0
  let labelled = []
  while (i < xs.length) {
    labelled.push(`${i}:${xs[i]}`)
    i += 1
  }

  // Stop early: put the stop condition in the while
  let j = 0
  let found = null
  while (found == null && j < xs.length) {
    if (xs[j] > 4) {
      found = xs[j]
    }
    j += 1
  }

  // Skip an item: an if around the body
  let small = []
  for (const x of xs) {
    if (x < 5) {
      small.push(x)
    }
  }

  return { labelled, found, small }
}
```

Returns `{ labelled: ['0:1', '1:5', '2:9', '3:2'], found: 5, small: [1, 2] }`. A `return` inside a
loop also ends it, and the whole function. More shapes are in [Patterns](/patterns/).

### Calling atoms

**Atoms take named arguments.** Call an atom with one object literal, `storeSet({ key, value })`,
or with nothing, `random()`. The transpiler refuses a positional call, a spread, an input the
atom does not declare, and a missing required input:

- `storeSet('k', v)` (refused) gets `'storeSet' takes named arguments: write
  storeSet({ name: value, … })`, plus a reminder that positional arguments are for local
  functions.
- `storeSet({ key: 'k' })` is refused with `'storeSet' needs 'value'. It takes storeSet({ key,
  value })`.

The transpiler checks input **names**. It does not check value types (`httpFetch({ url: 5 })`
transpiles, and fails when it runs), and it does not know atoms the host adds unless the host
passes them in; a call to a name that is not an atom at all fails at run time with `Unknown Atom:
<name>`. These checks help the author. They are not the safety boundary: the VM is, and it is
safe whatever AST it is given.

Like a helper call, an atom call stands on its own: `let id = uuid()`, then use `id`. An atom call
inside a larger expression (`return { id: uuid() }`) is refused when the agent is transpiled. See
[Where calls may appear](/patterns/#where-calls-may-appear).

Your own functions (helpers, below) and builtins (`Math.max(a, b)`, `encodeURIComponent(s)`) take
positional arguments as usual. `Error('message')` looks like a builtin but raises an error; see
[Errors](#errors).

Every atom call is awaited for you. There is no `await` (it is a transpile error), and an `async`
marker on a function is ignored.

The atoms an author reaches for most:

| Atom                                                           | Returns                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `httpFetch({ url, method?, headers?, body?, responseType? })`  | the response body: parsed JSON for a JSON response, else text; a `data:` URL for `responseType: 'dataUrl'` |
| `llmPredict({ prompt, options? })`                             | the model's completion, as a string                                                      |
| `storeGet({ key })`                                            | the stored value, or `undefined`                                                         |
| `storeSet({ key, value })`                                     | nothing                                                                                  |
| `agentRun({ agentId, input })`                                 | the other agent's result object                                                          |
| `random()`, `uuid()`                                           | a number from 0 up to 1; a UUID string (from the host's random source)                   |
| `hash({ value, algorithm? })`                                  | a hex digest string, SHA-256 unless `algorithm` says otherwise                           |

`httpFetch` goes through the host's `fetch` capability, `llmPredict` through its model, and the
store atoms through its store. An `agentId` is an AST (for example one passed in as an argument),
a token from `storeProcedure`, or a name the host's agent capability knows. The full list, with
inputs, outputs, costs and the capability each needs, is the [Atom Reference](/ajs-atoms/).

### Local helper functions

A source file contains only function declarations. The **last** one is the entry point; the ones
before it are **helpers** that the entry (or other helpers) call by name:

```ajs
function double(x) {
  return x * 2
}

function addOne(x) {
  const d = double(x) // helpers can call earlier helpers
  return d + 1
}

function main({ n = 3 }) {
  const a = double(n)
  const b = addOne(n)
  return { a, b } // only the entry must return an object
}
```

Returns `{ a: 6, b: 7 }`. Helpers behave like ordinary functions, with a few deliberate rules:

- **Top-level siblings, not closures.** A helper sees only its own parameters, never the
  caller's locals. (An arrow function passed to `map` and friends is different: it is part of the
  caller's body, so it may read the caller's variables.)
- **Nothing else at top level.** Only the functions run, so a top-level `const`, `let` or
  statement is refused where it is written (`A top-level variable is never run`); put constants
  inside the entry or pass them as arguments.
  Functions cannot nest: a function declared inside another is a transpile error.
- **They may return any value** (number, string, array, object). Only the entry function must
  return an object (see [Input/Output Contract](#inputoutput-contract)).
- **Recursion is allowed.** Runaway recursion is bounded by fuel, with a call-depth cap (256)
  that ends in an ordinary error, never a host crash.
- **A helper call stands on its own.** It may be the whole right-hand side of a declaration or
  assignment (`const d = double(n)`, `d = double(n)`), a statement by itself, the value of a
  `return` (`return double(n)`), or the body of an arrow (`xs.map((x) => double(x))`). Anywhere
  else, such as `double(n) + 1` or `if (double(n) > 1)`, is a transpile error that says to assign
  the result first:

  ```javascript
  // Fails at transpile time:
  return { v: double(n) + 1 }

  // Do this instead:
  const d = double(n)
  return { v: d + 1 }
  ```

Helper bodies are compiled once and dispatched by name, so calling a helper many times (or in a
loop) does not grow the agent's AST.

### What's Forbidden

Each of these is refused, most when the agent is transpiled. The rows marked _run time_ transpile
and fail when they run.

| Feature                                            | Instead                                                  |
| -------------------------------------------------- | -------------------------------------------------------- |
| C-style `for (;;)`, `for...in`, `do...while`       | `for...of`, or `while`; see [Loop idioms](#loop-idioms)  |
| `break`, `continue`                                | see [Loop idioms](#loop-idioms)                          |
| `switch`                                           | `if` / `else if`                                         |
| `throw`                                            | `Error('message')`; see [Errors](#errors)                |
| a computed object key, `{ [k]: v }`                | `Object.fromEntries([[k, v]])` (a literal key, `['a b']`, works) |
| Writing a member or index (`o.a = 1`, `xs[0] = v`) | build a new value, `o = { ...o, a: 1 }`, or `xs.push(v)` |
| Destructuring declarations (`let { a } = o`)       | `const a = o.a`; destructured **parameters** are fine    |
| Destructuring a loop variable (`for (const [k, v] of …)`) | `for (const e of …)`, then `e[0]`, `e[1]`         |
| `class`, `new`, `this`                             | plain objects; `Date()` and `Set()` without `new`        |
| A builtin or method as a value (_run time_)        | call it; see [below](#functions-and-namespaces-are-not-values) |
| `await`                                            | nothing: the VM awaits every atom call                   |
| `eval`, `Function`                                 | nothing: no string runs as code                          |
| `import` / `export`                                | an agent is self-contained; the host chooses the atoms   |
| `__proto__`, `constructor`, `prototype` (_run time_ for reads) | other property names                         |
| `++` / `--` used as a value                        | `x++` as its own statement, or `x = x + 1`               |

Some messages name the fix ("use for...of, or map/filter/find/reduce"); others are terse, such
as `Unsupported statement type: BreakStatement` or `Only simple variable assignment is
supported`. This table is the translation.

A name must be declared before it is read or assigned: a parameter, a `let`/`const`/`var`, a
loop or callback variable, or the `catch` binding. Reading anything else (a typo, a helper or
atom used as a value, `let g = double`) is refused when the agent is transpiled, with the name,
and so is assigning to it: `totl = 5`, meant for `total`, would otherwise create a new variable
and leave `total` unchanged.

### Differences from JavaScript

**Null-safe member access.** Agents work on data from outside (API responses, model output) that
is often missing a field, and a crash on the first absent field would make every agent a pile of
checks. So every member access behaves like optional chaining: reading a property of `null` or
`undefined` gives `undefined` instead of throwing.

```ajs
function f({ x = null }) {
  let y = x.foo.bar // undefined, not a TypeError
  return { missing: y === undefined }
}
```

Returns `{ missing: true }`. The cost: a typo such as `user.nmae` also reads as `undefined`
instead of failing. Declared parameter types and a declared result (see
[Input/Output Contract](#inputoutput-contract)) catch some of these at the edges.

**Computed member access** works with literals and variables: `items[0]`, `user['name']`,
`items[i]` and `user[key]` are all member reads, with the same null-safety. The key must be a
string, number, boolean or null.

**Equality.** `==` is `===`, with two exceptions: `null == undefined` is true, and `NaN == NaN`
is true. Nothing is coerced (`'1' == 1` is false), and objects and arrays compare by identity, not
contents. `===` and `!==` are strict identity.

```ajs
function equality() {
  return {
    noCoercion: '1' == 1, // false
    nullish: null == undefined, // true
    notStructural: [1, 2] == [1, 2], // false: distinct arrays
    nan: NaN == NaN, // true
  }
}
```

**Comparing contents.** Since `==` on objects compares identity, compare the fields you care
about, or compare `JSON.stringify(a) == JSON.stringify(b)` when key order is the same on both
sides. (TJS's structural `Is` does not exist in AJS.)

**`Object.assign` returns a new object.** It never changes its first argument:
`Object.assign(o, extra)` leaves `o` as it was. Write `o = Object.assign(o, extra)`, or
`o = { ...o, ...extra }`.

**Functions and namespaces are not values.** Call them; don't hold them. `Math.max(a, b)` and
`s.trim()` work; `const m = Math`, `const f = parseInt`, `items.map(parseInt)` and
`Object.values(Math)` are refused. A value in AJS is data: numbers, strings, booleans, null,
arrays and objects. Sets and dates are data too (an array, and a plain object of fields; see
[Set](#set) and [Date](#date)), so reading one of their methods as a value (`const f = tags.add`)
is refused as well.

### Operators

Arithmetic and ordering operators (`+`, `-`, `*`, `/`, `<`, `>`, `<=`, `>=`, …), template
interpolation and computed keys take **primitives**: strings, numbers, booleans or null. Mixing
primitives works as in JavaScript (`'a' + 1` is `'a1'`, `'a' < 'b'` is true). An object or array
operand is an error, not a silent conversion to its string form. It is an ordinary error, which a
`try` can catch:

```ajs
function operators({ tags = ['a', 'b'] }) {
  // 'tags: ' + tags would be an error: '+' needs a string, number, boolean or null, not an array.
  return { joined: 'tags: ' + tags.join(','), json: JSON.stringify({ tags }) }
}
```

Say what you mean: `arr.join(',')`, `JSON.stringify(obj)`. JavaScript's implicit conversion of an
array to a string is an allocation the VM cannot budget, so AJS refuses it rather than guessing.

`==`, `!=`, `===` and `!==` accept any values; on objects they compare identity.

### Methods

These are the methods a guest may call. Anything else is refused, and the error names it.

| Receiver        | Methods                                                                                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| string          | `at` `charAt` `charCodeAt` `codePointAt` `concat` `endsWith` `startsWith` `includes` `indexOf` `lastIndexOf` `localeCompare` `normalize` `padStart` `padEnd` `repeat` `slice` `substring` `substr` `split` `replace` `replaceAll` `match` `search` `toLowerCase` `toUpperCase` `trim` `trimStart` `trimEnd` `toString` |
| number          | `toFixed` `toExponential` `toPrecision` `toString`                                                                                                                                                                                                                              |
| array           | `map` `filter` `find` `reduce` (with an arrow), `at` `concat` `copyWithin` `fill` `includes` `indexOf` `lastIndexOf` `join` `pop` `shift` `reverse` `push` `unshift` `slice` `sort` `toSorted` `toReversed` `splice` `toSpliced` `with` `flat` `toString`                         |
| object          | `hasOwnProperty` `propertyIsEnumerable` `toString`                                                                                                                                                                                                                              |
| set, date       | see [Set](#set) and [Date](#date)                                                                                                                                                                                                                                               |

The namespaces (`Math`, `JSON`, `Array`, `Object`, `String`, `Number`, `Date`, `Schema`) are
under [Expression Builtins](#expression-builtins). Three rules apply to every call:

- **Exactly the arguments the method takes, with the types it reads.** `'x'.repeat('3')` is an
  error (a count is a number), and so is `s.slice(0, 1, 2)` (one argument too many).
- **Arguments are primitives**, unless the method uses an argument as a value:
  `arr.includes(obj)`, `arr.concat(other)` and `Object.keys(obj)` take objects;
  `'s'.includes(arr)` and `Math.max(arr)` do not.
- **Callbacks on four methods only.** `map`, `filter` and `find` take `(item) => …`; `reduce`
  takes `(acc, item) => …` and an initial value. There is no index argument (`(x, i) => i` is a
  transpile error, `'i' is not defined`), and a destructured callback parameter is refused the
  same way (`({ qty }) => qty`); use `for...of` with a counter. `some`, `every`, `findIndex`, `flatMap` and a `sort` comparator are
  not available; use `for...of`, or `filter(...).length`. `sort()` with no comparator works.

Why the list is closed (every method has a declared bound on what it may allocate):
[VM budgets](/vm-budgets/).

### Regular expressions

Regex is **deprecated in AJS 0.14**. Its planned replacement, `Pattern` (a grammar built as data;
see [Pattern](/pattern/)), is not in the VM yet, so regex is what you use today. It works within
the limits below, and is planned to leave the core VM no earlier than 0.15.

Regex literals work as search patterns in `replace`, `replaceAll`, `split`, `match` and
`search`, and as the `pattern` of the `regexMatch` atom:

```ajs
function regexes({ text = 'order 10-20, ref 7' }) {
  let dashed = text.replace(/\d+/g, '#')
  let parts = text.split(/,\s*/)
  let found = text.match(/(?<lo>\d+)-(?<hi>\d+)/)
  let hasRef = regexMatch({ pattern: /ref \d/, value: text })
  return { dashed, parts, lo: found.groups.lo, hasRef }
}
```

Returns `dashed: 'order #-#, ref #'`, `parts: ['order 10-20', 'ref 7']`, `lo: '10'` and
`hasRef: true`. Regex objects have no methods of their own: `re.test(s)` is refused, so use
`regexMatch`, or `s.search(re) != -1`.

Guest regexes run on the VM's own linear-time engine, never the host's, so no pattern can hang a
run; the work is charged as fuel. The engine supports classes, `.`, anchors, `\b`, groups
(capturing, non-capturing, named), alternation and every quantifier, greedy and lazy, with flags
`g i m s u y`.

It does **not** support backreferences (`\1`, `\k<n>`), lookahead or lookbehind, `\p{…}`, or the
`d` and `v` flags; a regex literal using one is a transpile error at its location. Very large
patterns are refused too. As a rule of thumb, keep repeat counts in the low thousands:
`{10000}` is the hard limit for a fixed count, and an optional range is refused well before it
(`\w{0,5000}` is too big).

---

## Input/Output Contract

An agent is called with **one object of named arguments**, and it returns **one object**. That
is what makes agents composable: one agent's output is the next one's input.

```ajs
function add({ a = 2, b = 3 }) {
  return { sum: a + b }
}
```

- **The entry function must return a plain object:** `return { sum }`. A non-object return
  (`return a + b`) ends the run with `Agent must return an object, got number`.
- **A bare `return`** is allowed, and the result is `{}`. With no `return` at all, the run
  currently succeeds with `result` undefined (card #4102).
- **Entry parameters are always named arguments.** Write them destructured,
  `function add({ a, b })`, which reads as what the caller actually passes. Positional
  parameters on the entry, `function add(a: 2, b: 3)`, compile to the same contract and still
  read named arguments (`{ a: 1, b: 1 }`); destructured is the recommended convention. Helper
  parameters, by contrast, are positional.

> **A colon in a parameter is not JavaScript renaming.** In JavaScript, `{ a: x }` in a
> parameter renames `a` to `x`, and `{ a: 0 }` is a syntax error. In AJS, `{ a: 0 }` means
> "required argument `a`, and `0` is an example of it": an integer.

### Parameters are the input contract

The VM checks the arguments against the parameters **before** the agent runs. A mismatch never
reaches the agent: the host gets back a run whose `error` is `Input validation failed: args do
not match expected schema` (the message does not name the field), and no fuel is spent.

- `name: example` is a **required** argument whose type is the example's. The colon value is an
  example, not a TypeScript literal type.
- `name = value` is **optional**, with a default of that type: `{ n = 5 }`.
- An untyped parameter, `{ input }`, is required and accepts any value.
- An argument the agent does not declare is refused, when the agent declares any parameters. An
  entry with no parameters at all, `function f()`, accepts any arguments and ignores them.

What an example accepts:

| Example                  | Accepts                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `0`                      | an integer                                                   |
| `0.0`                    | any number                                                   |
| `+0`                     | an integer, 0 or more                                        |
| `''`                     | a string                                                     |
| `true`                   | a boolean                                                    |
| `['']`                   | an array of strings                                          |
| `{ k: 0 }`               | an object with exactly a required integer `k`                |
| `'low' \| 'high'`        | one of these exact strings                                   |
| `null`                   | any value                                                    |

So `function f({ a: 0, b = 'x' })` accepts `{ a: 1 }` and `{ a: 1, b: 'y' }`, and refuses `{}`,
`{ a: 'one' }` and `{ a: 1, z: 2 }`.

### A declared result is the output contract

A declared result is held to the same standard: the run ends in an error if the agent returns
something else.

```ajs
function score({ n = 12 }): { score: 0, label: 'low' | 'high' } {
  return { score: n, label: n > 10 ? 'high' : 'low' }
}
```

A lone example widens to its type (`score: 0` means any integer). A union of string literals,
`'low' | 'high'`, is an exact list of allowed values, like an enum.

- Every declared member must be present, with the declared type, and no undeclared member may
  appear. Each of these ends the run with `Result does not match the declared result type`:
  `{ score: 1.5, label: 'low' }` (not an integer), `{ score: 3, label: 'mid' }` (not one of the
  values), `{ score: 3 }` (no `label`), and `{ score: 3, label: 'low', debug: 1 }` (an extra key).
- A member that may be absent says so: `note: '' | undefined`.
- Returning nothing at all, when a result is declared, is an error.
- If the agent fails before it returns, the run reports that failure, not a contract error.
- The check is paid from the fuel the run has left, so a run that cannot afford it ends
  `Out of Fuel`.
- An agent returns an object, so a declared result that is not one (`): 0`, `): ''`) can never be
  met. It is refused when the agent is transpiled.
- No declared result, no check.

Both contracts travel in the AST, as `inputSchema` and `outputSchema`, so any VM that runs the
AST enforces them. A helper's declared return is enforced too: a value that does not match
raises an error naming the helper.

---

## Expression Builtins

Expressions have these builtin namespaces and constructors. All are called, never held as values.

### Math

All of JavaScript's `Math`, including `Math.PI`. `Math.random()` reads the random source the host
grants (see [Time and randomness](#time-and-randomness)):

```ajs
function maths() {
  return {
    abs: Math.abs(-5), // 5
    floor: Math.floor(3.7), // 3
    sqrt: Math.sqrt(16), // 4
    max: Math.max(1, 2, 3), // 3
    round: Math.round(2.5), // 3
    roll: Math.floor(Math.random() * 6) + 1, // 1 to 6
  }
}
```

### JSON, Array, Object, String, Number

```ajs
function statics() {
  return {
    parsed: JSON.parse('{"a": 1}'), // { a: 1 }
    text: JSON.stringify({ a: 1 }), // '{"a":1}'
    isArray: Array.isArray([1, 2]), // true
    chars: Array.from('abc'), // ['a', 'b', 'c']
    of: Array.of(1, 2, 3), // [1, 2, 3]
    keys: Object.keys({ a: 1 }), // ['a']
    values: Object.values({ a: 1 }), // [1]
    entries: Object.entries({ a: 1 }), // [['a', 1]]
    fromEntries: Object.fromEntries([['a', 1]]), // { a: 1 }
    assigned: Object.assign({}, { a: 1 }, { b: 2 }), // a new object: { a: 1, b: 2 }
    letter: String.fromCharCode(65), // 'A'
    isNaN: Number.isNaN(NaN), // true
    finite: Number.isFinite(100), // true
    int: Number.parseInt('42'), // 42
    float: Number.parseFloat('3.14'), // 3.14
  }
}
```

`parseInt`, `parseFloat` and `encodeURIComponent` are available as plain functions too. To turn a
number into a string, use a template: `` `${n}` ``. `String(n)` and `Number(s)` are not functions
in AJS. As a statement (`let s = String(5)`) the transpiler says `'String' takes named
arguments`; inside an expression the run fails with `Unknown function: String`. Both mean
`String` is not available.

### Set

`Set(items)` makes a set of unique items. A set **is an array** of its items: `JSON.stringify`, a
store or a capability sees a plain array. The VM remembers which arrays are sets for the length
of the run and supplies their methods to those, and only those.

- **Unlike JavaScript:** `remove`, not `delete`; `diff`, not `difference`; `size` is the length.
- Change a set with its own methods: `push` is refused on a set (`'push' is not a function`);
  use `add`.
- A set that comes back from a store, `JSON.parse` or a capability is a plain array again. Call
  `Set(x)` on it to get set methods back.

```ajs
function sets() {
  const tags = Set(['a', 'b', 'b']) // ['a', 'b']
  tags.add('c') // in place
  tags.remove('a')
  return {
    tags, // ['b', 'c']
    has: tags.has('b'), // true
    size: tags.size, // 2
    union: tags.union(['d']), // a new set: ['b', 'c', 'd']
    both: tags.intersection(['b', 'x']), // ['b']
    diff: tags.diff(['b']), // ['c']
  }
}
```

Sets also have `clear()` and `toArray()`.

### Time and randomness

An agent has no clock and no random number generator of its own. `Date()` with no argument,
`Date.now()`, `Math.random()`, and the `random` and `uuid` atoms read two capabilities the host
grants: `clock` (`now()`, milliseconds since the epoch) and `random` (`next()`, a number from 0
up to 1). Without them, those calls are refused, as `httpFetch` is without a fetch. `Eval`,
`SafeFunction`, the batteries and this site grant the real ones (`systemClock`, `systemRandom`);
a host can grant a fixed clock or a seeded source to replay a run, or withhold either. `Date(x)`
with an argument and date arithmetic need neither. See
[The Sandbox](/ajs-sandbox/#time-and-randomness-are-capabilities).

### Date

`Date(x)` (or `Date()` for now, read from the host's clock) makes a date. `x` is an ISO string, a number of milliseconds,
another date, or a **stored** date: an object with a numeric `timestamp`, which is what a date
becomes after JSON, a store or a capability. `Date(stored)` turns it back into a date; until you
do, it is a plain object without date methods. `Date.parse(text)` is the same as `Date(text)`.

A date is a **data object** with the fields `value` (ISO string), `timestamp` (ms), `year`,
`month`, `day`, `hours`, `minutes`, `seconds` and `dayOfWeek`. Every field is in **UTC**, so a
program gives the same result on every host. You cannot change a field (AJS has no member
assignment); `d.add(…)` makes a new date. A date has one form everywhere: `JSON.stringify(d)`, a
capability's input and the run's result all see this object. For the ISO string, write
`d.value`.

> **`month` runs from 1 to 12**, unlike JavaScript's 0 to 11. January is `1`.

```ajs
function dates() {
  const d = Date('2024-01-15T10:00:00Z')
  const next = d.add({ days: 1 }) // a new date; also years, months, hours, minutes, seconds, ms
  return {
    year: d.year, // 2024
    month: d.month, // 1
    days: next.diff(d, 'days'), // 1 (also 'seconds', 'minutes', 'hours'; default ms)
    before: d.isBefore(next), // true (also isAfter)
    day: d.format('YYYY-MM-DD'), // '2024-01-15', in UTC
    iso: d.value, // '2024-01-15T10:00:00.000Z'
    now: Date.now(), // a timestamp
  }
}
```

`format` takes either a keyword, `'ISO'`, `'date'` (`2024-01-15`) or `'time'` (`10:00:00`), or a
template using the tokens `YYYY`, `MM`, `DD`, `HH`, `mm` and `ss`, each replaced once. Other
letters are left as they are.

### Schema

Build JSON schemas for structured model output and for validation. In AJS a schema is plain
**data**: `Schema.string`, `Schema.email`, … are JSON schemas, and `Schema.object(…)`, `array`,
`record`, `union`, `tuple`, `enum`, `const`, `fromExample`, `response` and `isValid` build or
check plain JSON. There is no builder chaining (`.min()`, `.optional`): write the keyword.

Wherever a schema is expected, you may pass an **example** instead, and it is read the way a
parameter example is: `{ name: '', age: 0 }` means an object with a string `name` and an integer
`age`. An object whose `type` is a JSON type name (`'string'`, `'object'`, …) or a list of them is
read as a schema, not an example, so an example cannot have a field called `type`. One
exception: `0.0` in an agent body is read as an integer, because the float spelling does not
survive into the AST. Write `Schema.number` for a float field.

```ajs
function validate({ input = { email: 'a@b.co', age: 30, role: 'user' } }) {
  let user = Schema.object({
    email: Schema.email,
    age: { type: 'integer', minimum: 0, maximum: 150 }, // constraints are plain keywords
    nickname: { type: ['string', 'null'] },
    role: Schema.enum(['admin', 'user', 'guest']),
  })
  let ok = Schema.isValid(input, user)

  // For a model's structured output, from an example
  let format = Schema.response('person', { name: '', age: 0 })
  return { ok, format }
}
```

`ok` is `true` for the default input. In `Schema.object`, every field is required except one whose
type includes `'null'`, as `nickname` does here.

`Schema.response(name, schema)` wraps a schema in the shape a model's `responseFormat` takes,
`{ type: 'json_schema', json_schema: { name, strict, schema } }`. Pass it as
`llmPredict({ prompt, options: { responseFormat: format } })`.

**A guest schema is a closed dialect.** It may use only these keywords, each with exactly its
JSON value type:

- **Structure:** `type`, `properties`, `items`, `additionalProperties`, `anyOf`, `oneOf`,
  `required`, `enum`, `const`.
- **Bounds:** `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`,
  `minLength`, `maxLength`, `minItems`, `maxItems`, `minProperties`, `maxProperties`.
- **Formats:** `format`, one of `email`, `uuid`, `uri`, `ipv4`, `date`, `date-time`, `emoji`.
- **Annotations:** `title`, `description`, `default`, `examples`.
- **Size:** at most 10,000 nodes and 64 levels deep.

`pattern` is refused. To check a field's shape, validate first and match the field afterwards:

```ajs
function checkCode({ input = { code: 'AB-12' } }) {
  let ok = Schema.isValid(input, { code: '' })
  let shaped = regexMatch({ pattern: /^[A-Z]{2}-\d{2}$/, value: input.code })
  return { ok: ok && shaped }
}
```

Returns `{ ok: true }`. Validation costs fuel in proportion to schema size times data size.

`filter(data, schemaOrExample)` returns `data` with only the fields the schema names:
`filter({ a: 1, b: 2 }, { a: 0 })` gives `{ a: 1 }`.

---

## Errors

### Raising and catching

There is no `throw`. Calling `Error('message')`, without `new`, puts the program into its error
state: the steps after it do not run until a `catch` takes the error.

```ajs
function safeDivide({ a = 10, b = 0 }) {
  try {
    if (b == 0) {
      Error('Division by zero')
    }
    return { result: a / b }
  } catch (err) {
    return { error: err }
  }
}
```

Returns `{ error: 'Division by zero' }`.

- **`err` is a string**, the error's message. `err.message` is `undefined`.
- **The message is a string.** It can be computed: `Error('bad: ' + x)`, `Error(msg)` or a
  template. A number or boolean becomes its text; an object or array in a variable is refused
  by name (an object literal, `Error({ a: 1 })`, currently arrives as just `'Error'`; #4098),
  so build the text you want (`JSON.stringify(data)`), or return the data from the `catch` (as
  `parseAll` below does).
- **Re-raising** is calling `Error(…)` again inside the `catch`; that error goes to the next
  `try` out, or ends the run.
- **`finally` always runs**, after the `try` and any `catch`, whatever happened in them. A
  `return` or error from the `try` waits until it finishes; a `return` or error inside the
  `finally` replaces it, as in JavaScript.
- **Errors propagate through helpers.** An `Error(...)` in a helper skips the rest of the helper
  and reaches the caller's `try`.
- **An uncaught error ends the run as a value.** That includes an `Error(...)` outside any `try`.
  The host receives it as the run's `error`, with the fuel spent so far. Nothing is thrown into
  the host's code.

Collect failures and carry on, the pattern for batch work where one bad item should not sink the
rest:

```ajs
function parseAll({ items = ['1', 'x', '3', '{"a":4}'] }) {
  let results = []
  let errors = []
  for (const item of items) {
    try {
      let value = JSON.parse(item)
      results.push(value)
    } catch (err) {
      errors.push({ item, error: err })
    }
  }
  return { results, errors, ok: errors.length == 0 }
}
```

Returns `results: [1, 3, { a: 4 }]`, `ok: false`, and one entry in `errors` whose `item` is
`'x'` and whose `error` is the parser's message.

### Catchable, and run-ending

The rule: **if the world did it, you can catch it; if your program or the host broke a contract,
the run ends.**

`try`/`catch` catches **failures of the world**: a fetch that fails or is not allowed, a model
that is down, bad JSON, a store that throws, a capability's answer that is too large or does not
have the shape the atom declares. It also catches the live-heap ceiling (`Heap limit exceeded`):
the program can drop what it holds and go on. It also catches ordinary mistakes inside the program, such as an
operator given an array. Every one of these is something a program might reasonably retry or work
around.

```ajs
function blocked() {
  try {
    httpFetch({ url: 'https://example.com/' })
  } catch (err) {
    return { caught: err } // 'Fetch blocked: …'
  }
  return { fetched: true }
}
```

`httpFetch` reaches only the domains the host allows (or whatever its own `fetch` capability
permits), and the message says which rule refused it; see
[Fetch policy](/ajs-host/#fetch-policy).

Some errors **end the run**, even inside a `try`. Nothing after them runs: no `catch` block, no
later step, no step of a parent agent.

- **Out of fuel.** The budget is spent; the run stops with `Out of Fuel`.
- **A bug at the capability boundary.** An atom called with input that does not match what it
  declares, or a value that cannot be copied out to a capability (too large, too deep, not plain
  data). The program built that value, so it is the program's bug. ("Too large" is catchable
  coming in and run-ending going out for this reason: the world sent the first, the program built
  the second.)
- **A broken host contract.** A capability that hands back something JSON cannot express (a
  function, a getter, a class instance).

```ajs
function badInput({ port = 8080 }) {
  try {
    httpFetch({ url: port }) // url must be a string; port is a number
  } catch (err) {
    return { caught: err } // never reached
  }
  return { after: true } // never reached either
}
```

This run ends with `'httpFetch': its input does not have the shape the atom declares`. A bug is
not something to retry, and a program that could catch these could loop on them. The transpiler
checks atom input names, not their types, so this is found only when the call runs.

One exception: when `agentRun` hands a sub-agent to the host, the host runs it as a separate run.
A refusal ends **that** run, and the parent sees an ordinary failure it can catch.

---

## What a run costs

Every step costs fuel. The host sets the budget per run; if it sets none, the budget is 1000.
The base costs:

| Operation                                    | Fuel |
| -------------------------------------------- | ---- |
| Expression node                              | 0.01 |
| Variable set (`let`, `const`, assignment)    | 0.1  |
| Control flow (if, while, a block of steps)   | 0.1  |
| `httpFetch`                                  | 5    |
| `llmPredict`                                 | 100  |
| `storeVectorize` (battery, if the host adds it) | 20 |
| `llmVision` (battery, if the host adds it)   | 150  |

Most agents are cheap except for their model calls: the `applyDiscounts` rule engine above costs
about 2 fuel, and `repoSummary` about 7, most of it the fetch. A budget of 1000 buys fewer than ten
`llmPredict` calls.

Work that grows with its input (copying, string building, a regex, a validation) is charged on top,
in proportion to the work. A `while (true)` loop simply runs out. Hosts also set a wall-clock
timeout, a live-memory ceiling and per-atom call quotas; see [Embedding the AJS VM](/ajs-host/).

---

## JSON AST Format

AJS compiles to a JSON AST. You read it to audit what an agent will do before it runs (every
atom call is a named step), to debug the transpiler, or to build agents in code. This is the
version-2 format the transpiler writes (`"$ajs": 2`).

### An agent

`function greet({ name: 'Ada' }) { let r = httpFetch({ url: 'https://example.com/' + name }); return { r } }`
compiles to:

```json
{
  "$ajs": 2,
  "op": "seq",
  "steps": [
    { "op": "varsImport", "keys": ["name"] },
    {
      "op": "httpFetch",
      "url": {
        "$expr": "binary",
        "op": "+",
        "left": { "$expr": "literal", "value": "https://example.com/" },
        "right": { "$expr": "ident", "name": "name" }
      },
      "result": "r"
    },
    {
      "op": "return",
      "value": { "r": { "$expr": "ident", "name": "r" } }
    }
  ],
  "inputSchema": {
    "type": "object",
    "properties": { "name": { "type": "string" } },
    "required": ["name"],
    "additionalProperties": false
  }
}
```

- Each statement is a **step** with an `op`. An atom call is a step named after the atom, with
  its inputs as fields and `result` naming the variable it writes.
- Parameters become a `varsImport` step and the `inputSchema` the VM checks the arguments
  against. A default becomes an `if` that assigns it; a declared result becomes `outputSchema`.
- **Values.** A constant that is the whole value of a step field is written bare (`"value": 10`
  in `{ "op": "varSet", "key": "x", "value": 10 }`). Inside an expression, a constant is a
  `{ "$expr": "literal" }` node. A bare string is always a string; a variable is always an
  explicit `{ "$expr": "ident" }` node.

### Expressions

```text
// Literal
{ "$expr": "literal", "value": 42 }

// Identifier
{ "$expr": "ident", "name": "varName" }

// Binary operation
{ "$expr": "binary", "op": "+", "left": {...}, "right": {...} }

// Member access
{ "$expr": "member", "object": {...}, "property": "foo" }

// Template literal: `Hello, ${name}!` compiles to string concatenation
{ "$expr": "binary", "op": "+",
  "left": { "$expr": "binary", "op": "+",
            "left": { "$expr": "literal", "value": "Hello, " },
            "right": { "$expr": "ident", "name": "name" } },
  "right": { "$expr": "literal", "value": "!" } }

// Method call (only the methods listed under Methods)
{ "$expr": "methodCall", "object": {...}, "method": "split", "arguments": [...] }
```

### Conditionals

```text
{
  "op": "if",
  "condition": {
    "$expr": "binary", "op": ">",
    "left": { "$expr": "ident", "name": "x" },
    "right": { "$expr": "literal", "value": 0 }
  },
  "then": [ ... ],
  "else": [ ... ]
}
```

### Loops, assignment and try

```json
{
  "op": "while",
  "condition": {
    "$expr": "binary",
    "op": ">",
    "left": { "$expr": "ident", "name": "x" },
    "right": { "$expr": "literal", "value": 0 }
  },
  "body": [
    {
      "op": "varAssign",
      "key": "x",
      "value": {
        "$expr": "binary",
        "op": "-",
        "left": { "$expr": "ident", "name": "x" },
        "right": { "$expr": "literal", "value": 1 }
      }
    }
  ]
}
```

`varSet` declares a variable in the current scope; `varAssign` writes an existing one in the
scope that owns it, which is how a loop body updates a variable declared outside it.

`for (const x of xs) { … }` becomes a `map` step with `"loop": true`, and `try`/`catch` a `try`
step:

```text
{ "op": "map", "items": { "$expr": "ident", "name": "xs" }, "as": "x",
  "steps": [ ... ], "loop": true }

{ "op": "try", "try": [ ... ], "catch": [ ... ], "catchParam": "err" }
```

ASTs without `"$ajs"` (or with `"$ajs": 1`), which the builder and older transpilers write, still
run, under the version-1 rule: a bare string that names a variable in scope is read as that
variable.

### Builder API

The AST can also be built in code, without the transpiler:

```typescript
import { Agent, AgentVM } from 'tjs-lang'

const agent = Agent.take()
  .varsImport(['price', 'taxRate'])
  .varSet({
    key: 'total',
    // price * (1 + taxRate), as expression nodes
    value: {
      $expr: 'binary',
      op: '*',
      left: { $expr: 'ident', name: 'price' },
      right: {
        $expr: 'binary',
        op: '+',
        left: { $expr: 'literal', value: 1 },
        right: { $expr: 'ident', name: 'taxRate' },
      },
    },
  })
  .return({ properties: { total: {} } })

const ast = agent.toJSON() // JSON-serializable AST
const { result } = await new AgentVM().run(ast, { price: 100, taxRate: 0.2 })
// result: { total: 120 }
```

`.return` takes the shape of the result: a schema whose `properties` name the variables to
return (`total`, of any type, here). The builder writes a version-1 AST, the format ASTs were
first persisted in, which the VM keeps running so stored agents keep working. It is lower-level
than the transpiler: nothing checks atom calls or parameters for you, and the VM runs the AST as
written. That costs convenience, not safety: the VM's guarantees do not depend on the
transpiler's checks.

---

## Limitations

What AJS leaves out is listed under [What's Forbidden](#whats-forbidden). The reasons, in short:

- **Routes out of the sandbox.** `eval`, `Function`, `import`, `this`, `class` and prototype
  access would each give a guest a way to reach the host.
- **Syntax models get wrong.** `switch` fall-through, `break` and `continue` in nested loops and
  C-style `for` bounds are frequent sources of bugs in generated code; `for...of`, `while` and
  `if` say the same things more plainly.
- **Code that is hard to audit.** No function values means every call in the AST names what it
  calls.

AJS is interpreted from its JSON AST, so it is much slower than native JavaScript for
computation. Execution is predictable and bounded, and I/O dominates most agent workloads. For
compute-heavy work, do it in the host, in TJS (with `wasm {}` blocks where it matters), and expose
it as an atom ([Capabilities and Custom Atoms](/ajs-capabilities/)).

---

## Learn more

- [AJS Examples](/ajs-examples/): runnable agents, from first steps to multi-agent pipelines.
- [Patterns](/patterns/): idioms for real agents.
- [AJS LLM System Prompt](/ajs-llm-prompt/): a prompt for models that write AJS.
- [Embedding the AJS VM](/ajs-host/): budgets, timeouts, capabilities, quotas and tracing.
- [Capabilities and Custom Atoms](/ajs-capabilities/): giving agents new powers, and the battery
  setup for local models.
- [Atom Reference](/ajs-atoms/): every atom's inputs, outputs, cost and capability.
- [Safe Eval](/safe-eval/): AJS as a safe `eval` inside an application.
- [VM budgets](/vm-budgets/): why the VM refuses what it refuses.
