<!--{"section": "ajs", "group": "docs", "order": 1, "navTitle": "The Language", "parent": "ajs.md"}-->
<!-- TODO review -->

# The AJS Language

_Code as data. Safe. Async. Sandboxed._

This chapter is the language guide and reference for people (and models) who **write** AJS
agents. Running agents in your own application (budgets, timeouts, capabilities, tracing) is
covered in [Hosting the VM](/ajs-host/); giving agents new powers is in
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

`httpFetch` above is an **atom**: a built-in operation the VM provides. Every effect an agent
has on the world goes through an atom, and every atom that touches the world needs a capability
the host chose to grant.

## Use cases

### AI agents

Fetch, think, answer. The model call needs an LLM capability, so on this page the example stops
with a message saying so; run it locally with a model (see [Hosting the VM](/ajs-host/)).

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

Send the code to the data instead of the data to the code.

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

Returns `{ processed: 3, results: [2, 4, 6] }`.

---

## Syntax

AJS is a JavaScript subset: familiar syntax, fewer features. It is deliberately small, small
enough for a 4B-parameter model to write correctly.

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
  const note = items[0]?.note ?? 'none'

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

  // Object and array literals, spread
  const defaults = { color: 'red', size }
  const merged = { ...defaults, size: 'medium' }
  const all = [...names, 'z']

  // Arrow functions, passed straight to map / filter / find / reduce
  const total = items.reduce((sum, item) => sum + item.qty, 0)

  // try / catch: the error is a string
  let parsed = null
  try {
    parsed = JSON.parse('{ not json')
  } catch (err) {
    parsed = { failed: true }
  }

  return { greeting, size, label, note, names, count, merged, all, total, parsed }
}
```

It returns `greeting: 'Hello, Ada!'`, `names: ['a']`, `count: 3`, `total: 2`,
`merged: { color: 'red', size: 'medium' }` and `parsed: { failed: true }`.

Also allowed: every compound assignment (`+=`, `-=`, `*=`, …), `++` and `--` as statements,
assignment to an outer variable from inside a loop body, `typeof`, `%` and `**`.

### Calling atoms

**Atoms take named arguments, and the transpiler checks them.** Call an atom with one object
literal, `storeSet({ key, value })`, or with nothing, `random()`. A positional call, a spread, an
input the atom does not declare, or a missing required input fails at transpile time and names
what the atom takes: `storeSet('k', v)` (refused).

Your own functions (helpers, below) and builtins (`Math.max(a, b)`, `Error('message')`,
`encodeURIComponent(s)`) take positional arguments as usual.

Every atom call is awaited for you. There is no `await` (it is a transpile error), and an `async`
marker on a function is ignored.

The atoms an author reaches for most:

| Atom                                             | Does                                                    |
| ------------------------------------------------ | ------------------------------------------------------- |
| `httpFetch({ url, method?, headers?, body? })`   | an HTTP request, through the host's `fetch` capability  |
| `llmPredict({ prompt, options? })`               | a model completion, as a string                         |
| `storeGet({ key })`, `storeSet({ key, value })`  | the key-value store                                     |
| `regexMatch({ pattern, value })`                 | `true` if `value` matches `pattern`                     |
| `agentRun({ agentId, input })`                   | run another agent                                       |
| `random()`, `uuid()`, `hash({ value })`          | utilities                                               |

The full list, with inputs, outputs, costs and the capability each needs, is the
[Atom Reference](/ajs-atoms/). The host can add atoms of its own; calls to them are checked the
same way when the host passes them to the transpiler.

### Local helper functions

A source file may declare several top-level functions. The **last** one is the entry point; the
ones before it are **helpers** that the entry (or other helpers) call by name:

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
  caller's locals.
- **They may return any value** (number, string, array, object). Only the entry function is held
  to the object-return contract.
- **Recursion is allowed.** Runaway recursion is bounded by fuel, with a call-depth cap (256)
  that ends in an ordinary error, never a host crash.
- **Call them at statement level.** A helper call cannot sit inside a larger expression; assign
  it to a variable first:

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

Each of these is a transpile error that says what to write instead.

| Feature                                   | Instead                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C-style `for (;;)`, `for...in`, `do...while` | `for...of`, or `while` with a counter; `Object.keys(obj)` to walk keys                                                     |
| `break`, `continue`                       | an `if` around the loop body, or a `return`                                                                                   |
| `switch`                                  | `if` / `else if`                                                                                                              |
| `throw`                                   | `Error('message')` (see [Errors](#errors))                                                                                    |
| Destructuring _declarations_              | `let { a } = o` and `let [a] = xs` are refused; read members (`const a = o.a`). Destructured **parameters** are fine          |
| `class`, `new`, `this`                    | plain objects; `Date()` and `Set()` without `new`                                                                             |
| Functions as values                       | A function cannot be stored, passed or returned. An arrow function passed straight to `map`, `filter`, `find` or `reduce` may read outer variables |
| `await`                                   | nothing: the VM awaits every atom call                                                                                        |
| `eval`, `Function`                        | nothing: there is no way to run a string as code                                                                              |
| `import` / `export`                       | the host registers atoms; an agent is self-contained                                                                          |
| `__proto__`, `constructor`, `prototype`   | these property names are refused, read or written                                                                             |
| `++` / `--` used as a value               | `x++` as its own statement, or `x = x + 1`                                                                                    |

### Differences from JavaScript

**Null-safe member access.** Every member access behaves like optional chaining. Reading a
property of `null` or `undefined` gives `undefined` instead of throwing:

```ajs
function f({ x = null }) {
  let y = x.foo.bar // undefined, not a TypeError
  return { missing: y === undefined }
}
```

Agents should not crash on missing data. Returns `{ missing: true }`.

**Computed member access** works with literals and variables: `items[0]`, `user['name']`,
`items[i]` and `user[key]` are all member reads, with the same null-safety. The key must be a
string, number, boolean or null.

**Equality is footgun-free `===`.** `==` and `!=` do not coerce types, and they are not
structural. They unwrap boxed primitives and treat `null` and `undefined` (and `NaN`) as equal.
`===` and `!==` are strict identity.

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

**There is no `Is`.** TJS's structural comparison (`a Is b`) is not available in AJS. Compare the
fields you care about, or compare `JSON.stringify(a) == JSON.stringify(b)` when key order is the
same on both sides.

**Functions and namespaces are not values.** Call them; don't hold them. `Math.max(a, b)` and
`s.trim()` work; `const m = Math`, `const f = parseInt`, `items.map(parseInt)` and
`Object.values(Math)` are refused. A value in AJS is data: numbers, strings, booleans, null,
arrays and objects. A `Set` is an array of its items, and a `Date` is a plain object of its
fields; the VM supplies their methods, so reading one as a value (`const f = tags.add`) is
refused too.

### Operators

Arithmetic, comparison and string operators (`+`, `-`, `*`, `<`, …), template interpolation and
computed keys take **primitives**: strings, numbers, booleans or null. An object or array operand
is an error, not a silent conversion to its string form:

```ajs
function operators({ tags = ['a', 'b'] }) {
  // 'tags: ' + tags would end the run: '+' needs a string, not an array.
  return { joined: 'tags: ' + tags.join(','), json: JSON.stringify({ tags }) }
}
```

Say what you mean: `arr.join(',')`, `JSON.stringify(obj)`. JavaScript's implicit conversion of an
array to a string is an allocation the VM cannot budget, so AJS refuses it rather than guessing.

### Methods

Strings and arrays have their JavaScript methods, with three rules:

- **Exactly the documented arguments, with the types they read.** `'x'.repeat('3')` is an error
  (a count is a number), and so is `s.slice(0, 1, 2)` (one argument too many).
- **Arguments are primitives**, unless the method uses an argument as a value:
  `arr.includes(obj)`, `arr.concat(other)` and `Object.keys(obj)` take objects;
  `'s'.includes(arr)` and `Math.max(arr)` do not.
- **Callbacks only where they are listed.** `map`, `filter`, `find` and `reduce` take an arrow
  function. `some`, `every`, `findIndex` and a `sort` comparator are not available; use
  `for...of`, or `filter(...).length`.

A method the VM does not list is not callable, and the error names it. Why the list is closed:
[`docs/vm-budgets.md`](docs/vm-budgets.md).

### Regular expressions

Regex is **deprecated in AJS 0.14** in favour of `Pattern`, a grammar built as data
([`docs/pattern.md`](docs/pattern.md)). It still works, within limits.

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
`d` and `v` flags. A regex literal using one is a transpile error at its location. Counts above
`{10000}` are refused, and so is a pattern that compiles to more than 20,000 instructions. An
optional range costs about four instructions per count, so `\w{0,5000}` is refused too.

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
- **A bare `return`** is allowed, and the result is `{}`.
- **Parameters name the arguments.** Write them destructured, `function add({ a, b })`, which
  reads as what the caller actually passes. Positional parameters, `function add(a: 2, b: 3)`,
  compile to the same contract and read the same named arguments; destructured is the
  recommended convention.

### Parameters are the input contract

The VM checks the arguments against the parameters **before** the agent runs, and refuses a
mismatch with `Input validation failed: args do not match expected schema`:

- `name: example` is a **required** argument whose type is the example's: `{ n: 5 }` requires an
  integer `n`. The colon value is an example, not a TypeScript literal type.
- `name = value` is **optional**, with a default of that type: `{ n = 5 }`.
- An untyped parameter, `{ input }`, is required and accepts any value.
- An argument the agent does not declare is refused.

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

- Every declared member must be present, with the declared type, and no undeclared member may
  appear. Returning `{ score: 1.5 }`, `{ score: 3, label: 'mid' }` or an extra `debug` key ends
  the run with `Result does not match the declared result type`.
- A member that may be absent says so: `note: '' | undefined`.
- Returning nothing at all, when a result is declared, is an error.
- A failed run reports its own error, not the contract's.
- The check is paid from the fuel the run has left, so a run that cannot afford it ends
  `Out of Fuel`.
- An agent returns an object, so a declared result that is not one (`): 0`, `): ''`) can never be
  met. It is refused when the agent is transpiled.
- No declared result, no check.

Both contracts travel in the AST, as `inputSchema` and `outputSchema`, so any VM that runs the
AST enforces them. Only the entry function's result is checked; a helper's declared return is
not yet enforced.

---

## Expression Builtins

Expressions have these builtin namespaces and constructors. All are called, never held as values.

### Math

All of JavaScript's `Math`, including `Math.PI`:

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
    assigned: Object.assign({}, { a: 1 }, { b: 2 }), // { a: 1, b: 2 }
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
in AJS.

### Set

`Set(items)` makes a set of unique items. A set **is an array** of its items, data that JSON and
the capability boundary keep as it is, and the VM supplies its methods. `size` is its length.
Change a set with its own methods: `push` and `Object.assign` are refused on a set.

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

### Date

`Date(x)` (or `Date()` for now) makes a date. `x` is an ISO string, a number of milliseconds,
another date, or a **stored** date: an object with a numeric `timestamp`, which is what a date
becomes after JSON, a store or a capability, so a date round-trips. `Date.parse(text)` is the
same.

A date is a frozen **data object**: `value` (ISO string), `timestamp` (ms), `year`, `month`
(1–12), `day`, `hours`, `minutes`, `seconds` and `dayOfWeek`, every field in **UTC**, so a
program gives the same result on every host. It has one form everywhere: `JSON.stringify(d)`, a
capability's input and the run's result all see this object. For the ISO string, write
`d.value`.

```ajs
function dates() {
  const d = Date('2024-01-15T10:00:00Z')
  const next = d.add({ days: 1 }) // a new date; also years, months, hours, minutes, seconds, ms
  return {
    year: d.year, // 2024
    month: d.month, // 1
    days: next.diff(d, 'days'), // 1 (also 'seconds', 'minutes', 'hours'; default ms)
    before: d.isBefore(next), // true
    day: d.format('YYYY-MM-DD'), // '2024-01-15', in UTC (also 'ISO', 'date', 'time')
    iso: d.value, // '2024-01-15T10:00:00.000Z'
    now: Date.now(), // a timestamp
  }
}
```

### Schema

Build JSON schemas for structured model output and for validation. In AJS a schema is plain
**data**: `Schema.string`, `Schema.email`, … are JSON schemas, and `Schema.object(…)`, `array`,
`record`, `union`, `tuple`, `enum`, `const`, `fromExample`, `response` and `isValid` build or
check plain JSON. There is no builder chaining (`.min()`, `.optional`): write the keyword.

```ajs
function validate({ input = { email: 'a@b.co', age: 30, role: 'user' } }) {
  // From an example
  let person = Schema.response('person', { name: '', age: 0 })

  // With constraints: plain keywords
  let user = Schema.response(
    'user',
    Schema.object({
      email: Schema.email,
      age: { type: 'integer', minimum: 0, maximum: 150 },
      nickname: { type: ['string', 'null'] }, // a nullable field is optional
      role: Schema.enum(['admin', 'user', 'guest']),
    })
  )

  let ok = Schema.isValid(input, user.json_schema.schema)
  return { ok, person }
}
```

`Schema.response(name, schema)` gives the `{ type: 'json_schema', json_schema: { name, strict,
schema } }` shape a model's `responseFormat` takes; `ok` is `true` for the default input.

**A guest schema is a closed dialect.** It may use `type`, `properties`, `items`,
`additionalProperties`, `anyOf`, `oneOf`, `required`, `enum`, `const`, the numeric and size
bounds (`minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`,
`maxLength`, `minItems`, `maxItems`, `minProperties`, `maxProperties`), `format` (`email`, `uuid`,
`uri`, `ipv4`, `date`, `date-time`, `emoji`), `title`, `description`, `default` and `examples`,
and nothing else, each with exactly its JSON value type, at most 10,000 nodes and 64 levels
deep. `pattern` is refused, because it would compile on the host's regex engine; match inside the
program with `regexMatch`. Validation costs fuel in proportion to schema size times data size.

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
- **Errors propagate through helpers.** An `Error(...)` in a helper skips the rest of the helper
  and reaches the caller's `try`.
- **An uncaught error ends the run as a value.** The host receives it as the run's `error`, with
  the fuel spent so far. Nothing is thrown into the host's code.

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

### Catchable, and run-ending

`try`/`catch` catches **failures of the world**: a fetch that fails or is not allowed, a model
that is down, bad JSON, a store that throws, a capability's answer that is too large or does not
have the shape the atom declares. Every one of these is something a program might reasonably
retry or work around.

```ajs
function blocked() {
  try {
    httpFetch({ url: 'https://example.com/' })
  } catch (err) {
    return { caught: err } // 'Fetch blocked: domain not in allowlist. …'
  }
  return { fetched: true }
}
```

Some errors **end the run**, even inside a `try`. Nothing after them runs: no `catch` block, no
later step, no step of a parent agent.

- **Out of fuel.** The budget is spent; the run stops with `Out of Fuel`.
- **A bug at the capability boundary.** An atom called with input that does not match what it
  declares, or a value that cannot be copied out to a capability (too large, too deep, not plain
  data). The program built that value, so it is the program's bug.
- **A broken host contract.** A capability that hands back something JSON cannot express (a
  function, a getter, a class instance).

```ajs
function badInput() {
  try {
    httpFetch({ url: 5 }) // url must be a string
  } catch (err) {
    return { caught: err } // never reached
  }
  return { after: true } // never reached either
}
```

This run ends with `'httpFetch': its input does not have the shape the atom declares`. A bug is
not something to retry, and a program that could catch these could loop on them. The transpiler
reports the ones it can see before the program runs. (An `agentRun` served by the host is a
separate run: a refusal ends **that** run, and the parent sees an ordinary, catchable failure.)

### What a run costs

Every step costs fuel, and the host sets the budget. The base costs:

| Operation                     | Fuel |
| ----------------------------- | ---- |
| Expression node               | 0.01 |
| Variable set/get              | 0.1  |
| Control flow (if, while, seq) | 0.1  |
| `httpFetch`                   | 5    |
| `storeVectorize`              | 20   |
| `llmPredict`                  | 100  |
| `llmVision`                   | 150  |

Work that grows with its input (copying, string building, a regex, a validation) is charged on top,
in proportion to the work. A `while (true)` loop simply runs out. Hosts also set a wall-clock
timeout, a live-memory ceiling and per-atom call quotas; see [Hosting the VM](/ajs-host/).

---

## JSON AST Format

AJS compiles to a JSON AST. This is the version-2 format the transpiler writes (`"$ajs": 2`). In
it a bare string is always a string; a variable is always an explicit `{ "$expr": "ident" }`
node.

### Sequence

`function f() { let x = 10; let y = 20; return { sum: x + y } }` compiles to:

```json
{
  "$ajs": 2,
  "op": "seq",
  "steps": [
    { "op": "varSet", "key": "x", "value": 10 },
    { "op": "varSet", "key": "y", "value": 20 },
    {
      "op": "return",
      "value": {
        "sum": {
          "$expr": "binary",
          "op": "+",
          "left": { "$expr": "ident", "name": "x" },
          "right": { "$expr": "ident", "name": "y" }
        }
      }
    }
  ],
  "inputSchema": { "type": "object", "properties": {} }
}
```

A function's parameters become `varsImport` steps (a default becomes an `if` that assigns it)
and the `inputSchema` the VM checks the arguments against. A declared result becomes
`outputSchema`.

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

// Method call (only methods the VM lists; see docs/vm-budgets.md)
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

### Loops and assignment

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

The builder writes a version-1 AST. It is lower-level than the transpiler: nothing checks atom
calls or parameters for you, and the VM runs the AST as written.

---

## Limitations

### What AJS doesn't do

- **No function values.** A function cannot be stored, passed or returned; arrow functions given
  straight to `map`, `filter`, `find` or `reduce` are the exception.
- **No classes.** Use plain objects.
- **No `break`, `continue` or `switch`.** Use conditions and `return`.
- **No modules.** An agent is self-contained; the host decides which atoms exist.
- **No direct DOM or host access.** Everything goes through capabilities.
- **No structural `Is`.** Compare fields, or JSON.

### What AJS intentionally avoids

- Language features that open routes out of the sandbox.
- Syntax that models frequently get wrong.
- Patterns that make code hard to audit.

AJS is interpreted from its JSON AST, so it is slower than native JavaScript. Execution is
predictable and bounded, and I/O dominates most agent workloads. For compute-heavy work, do it in
the host, in TJS (with `wasm {}` blocks where it matters), and expose it as an atom.

---

## Learn more

- [AJS Examples](/ajs-examples/): runnable agents, from first steps to multi-agent pipelines.
- [Patterns](guides/patterns.md): idioms for real agents.
- [AJS LLM System Prompt](guides/ajs-llm-prompt.md): a prompt for models that write AJS.
- [Hosting the VM](/ajs-host/): budgets, timeouts, capabilities, quotas and tracing.
- [Capabilities and Custom Atoms](/ajs-capabilities/): giving agents new powers, and the battery
  setup for local models.
- [Atom Reference](/ajs-atoms/): every atom's inputs, outputs, cost and capability.
- [Safe Eval](guides/safe-eval.md): AJS as a safe `eval` inside an application.
- [VM budgets](docs/vm-budgets.md): why the VM refuses what it refuses.
