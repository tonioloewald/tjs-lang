<!--{"parent": "ajs.md", "order": 7}-->
<!-- TODO review -->

# Atom Reference

An **atom** is one operation the AJS VM can perform: a loop, a variable write, an HTTP request, a
model call. A compiled agent is a tree of atom steps, and every step is charged fuel, checked
against the atom's declared inputs, and run under the atom's timeout.

This page lists every atom the VM registers: 54 core atoms, plus 6 battery atoms when the host
passes `batteryAtoms`. A host can list what its own VM has:

```javascript
import { AgentVM, batteryAtoms } from 'tjs-lang/vm-ast'

Object.keys(new AgentVM().atoms).length // 54
Object.keys(new AgentVM(batteryAtoms).atoms).length // 60
```

`AgentVM` and `batteryAtoms` come from `tjs-lang/vm-ast`, the VM without a parser (they are also
exported by `tjs-lang/vm` and `tjs-lang`). The transpiler is `transpile` from `tjs-lang/lang`, the
model-server connection is `getBatteries` from `tjs-lang/batteries`, and the fluent builder `Agent`
comes from the main `tjs-lang` entry.

Hosts can add atoms of their own; [Capabilities and Custom Atoms](/ajs-capabilities/) covers that.
How to give a run its budgets and capabilities is in [Hosting the VM](/ajs-host/).

### Terms used on this page

- **Fuel** is the run's work budget. Every step costs some, and the run stops when it runs out. A
  run gets 1000 unless the host sets `fuel`. For scale: a variable write costs 0.1, a callback
  method such as `map` 1 plus its steps, a store call 5, a model call 100. Time is limited
  separately: a run's overall timeout is twice the slowest registered atom's (240 s with the core
  atoms, because `llmPredict` allows 120 s) unless the host sets `timeoutMs`.
- **A capability** is an object the host passes in `vm.run(ast, args, { capabilities })`, such as
  `fetch`, `store` or `llm`. The VM has no IO of its own; an atom that reaches outside calls one.
- **The membrane** is the boundary between capabilities and the agent. A value crossing it, either
  way, is a checked copy of plain JSON data (plus `Date`), never the host's object.
- **A run option** is a field of that third `vm.run` argument: `fuel`, `capabilities`,
  `costOverrides`, `timeoutOverrides`, `quotas` (a cap on how many times an op may run, as in
  `quotas: { llmPredict: 3 }`), and `context`, which carries the host's policy lists such as
  `allowedFetchDomains`. [Hosting the VM](/ajs-host/) lists them all.
- **An AST** is the JSON tree the transpiler produces and the VM runs. The transpiler writes
  format version 2. **The fluent builder** (`Agent.take()…toJSON()`, from the main `tjs-lang`
  entry) and older stored ASTs use version 1; a few atoms exist only for those.
- **A guest schema** is a JSON Schema an agent builds with `Schema`, limited to the keywords the VM
  accepts (see Schema in [The AJS Language](/DOCS-AJS/)).

### Find an atom

Alphabetically, with the section each is in:
`agentRun` (Code and agents), `cache` (Utilities), `callLocal` (Flow control),
`clearExpiredProcedures` (Stored procedures), `consoleError`, `consoleLog`, `consoleWarn`
(Console), `constSet` (State), `Error`, `evaluate` (Flow control), `filter`, `find` (Arrays and
objects), `hash` (Utilities), `httpFetch` (Network), `if` (Flow control), `join` (Arrays and
objects), `jsonParse`, `jsonStringify` (Text, JSON and XML), `keys`, `len` (Arrays and objects),
`llmPredict` (AI: llmPredict), `llmPredictBattery`, `llmVision` (AI: battery atoms), `map` (Arrays
and objects), `memoize` (Utilities), `merge`, `omit`, `pick`, `push` (Arrays and objects),
`random` (Utilities), `reduce` (Arrays and objects), `regexMatch` (Text, JSON and XML),
`releaseProcedure` (Stored procedures), `return` (Flow control), `runCode` (Code and agents),
`scope`, `seq` (Flow control), `split` (Arrays and objects), `storeCreateCollection` (AI: battery
atoms), `storeGet` (Store), `storeProcedure` (Stored procedures), `storeQuery`, `storeQueryWhere`
(Store), `storeSearch` (AI: battery atoms), `storeSet` (Store), `storeVectorAdd`,
`storeVectorize` (AI: battery atoms), `storeVectorSearch` (Store), `template` (Text, JSON and
XML), `transpileCode` (Code and agents), `try` (Flow control), `uuid` (Utilities), `varAssign`,
`varGet`, `varSet`, `varsExport`, `varsImport`, `varsLet` (State), `while` (Flow control),
`xmlParse` (Text, JSON and XML).

<!--
  Owner note: the tables below were produced from the VM's own data (each atom's inputSchema,
  outputSchema, cost, timeoutMs and effects, read from `new AgentVM(batteryAtoms).atoms` on
  2026-11-06). Nothing checks them yet. The brief asked for a generated page with a freshness
  test, like docs/tjs-vs-typescript.md; that needs a script and a test outside this file.
-->

---

## Calling an atom from AJS

An atom takes **one object of named inputs**, or nothing:

```ajs
function stamp({ name = 'Ada' }) {
  let id = uuid()
  let digest = hash({ value: name })
  let n = random({ min: 1, max: 7, format: 'integer' })
  return { id, digest, n }
}
```

Returns a fresh UUID, the SHA-256 hex digest of `'Ada'`, and an integer from 1 to 6 (`max` is
exclusive; see Utilities).

The entry function's parameters are the run's arguments. A default such as `name = 'Ada'` applies
when the caller leaves that argument out; `vm.run(ast, { name: 'Bo' })` uses `'Bo'`.

These rules apply to every call:

- **Inputs are named and checked when the source is transpiled.** A positional call such as
  `storeGet('k')` (refused) fails with `'storeGet' takes named arguments: write storeGet({ name:
  value, … }), not storeGet(a, b).` An input the atom does not declare, as in
  `storeGet({ k: 1 })`, fails with `'storeGet' has no input 'k'. It takes storeGet({ key }).` A
  spread or a missing required input is refused the same way.
- **An atom call is a statement, and so is a callback method.** Write `let x = atom({ … })`,
  `x = atom({ … })`, or a bare `atom({ … })`, and bind `let ys = xs.filter((x) => …)` before
  using `ys`. Both mistakes are refused when the agent is transpiled: a callback method inside a
  larger expression (`xs.filter(…).length`), and an atom call inside one
  (`return { id: uuid() }`, `if (regexMatch({ … }))`), which says
  `Atom 'uuid' cannot be called inside an expression`.
- **There is no `await`.** Every atom call is awaited for you.
- **`console.log`, `console.warn` and `console.error` do nothing.** They are accepted and record
  nothing, and `console.error` does not stop the run. Use the `consoleLog`, `consoleWarn` and
  `consoleError` atoms (see Console), or put what the caller needs in the object you return.

Two names look like atoms but follow other rules. `Error('message')` is an atom called
positionally: the transpiler puts the message in its `args` input. `filter(data, shape)` with two
arguments is a builtin, not the `filter` atom (see Arrays and objects). Your own helper functions
and the other builtins (`Math.max(a, b)`, `JSON.parse(s)`) take positional arguments as usual.

### How to read the tables

| Column       | Meaning                                                                                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inputs**   | The input names the atom declares. `?` marks an optional one. Every core atom's input object is closed (except `return` and `varsLet`): any other name is an error.                                                                                                                      |
| **Returns**  | The declared output. "nothing" means the atom returns no value; "message" is an OpenAI-style chat message, `{ role, content, tool_calls }`.                                                                                                              |
| **Fuel**     | The base cost, charged before the atom runs. Work that grows with the input (copying, building strings, a regex, validating against a schema, the steps a loop runs) is charged on top. A host can change the base with `costOverrides: { op: n }`. |
| **Timeout**  | The per-call wall-clock limit. "none" means the atom has no limit of its own; the run's overall timeout still applies. A host can change it with `timeoutOverrides: { op: ms }`.                                                                        |
| **Effects**  | `pure`: deterministic, touches no capability, no side effects. `io`: anything else, which includes nondeterministic atoms (`random`, `uuid`) and atoms with a side effect inside the VM (`memoize`, `storeProcedure`, `consoleLog`) as well as those that call a capability. An `io` atom's inputs and result cross the membrane as checked copies, and a verified predicate (a pure function the toolchain certifies) cannot call it. |
| **Needs**    | The capability the atom calls. `store.get` means the `store` capability's `get` method; a bare name such as `llmBattery` means the atom uses that capability's methods. "—" means none.                                                                 |
| **From AJS** | How source reaches the atom. **call**: call it by name. **syntax**: the transpiler emits it for a language construct, and you never name it. **builder**: only a hand-built or fluent-builder (version 1) AST uses it; in source, use the construct the notes name. |

Most atoms that run other steps (`seq`, `if`, `while`, `try`, `map`, …) have no timeout of their
own. Four keep the 1 s default: `agentRun`, `runCode`, `memoize` and `cache`. That limit is on time
spent waiting, such as a sub-agent's slow fetch; computation inside a sub-agent is bounded by fuel,
not by this timeout. See Code and agents.

The `ajs` examples on this page run in the doc site as they stand. An example that needs a
capability the site does not have (a model, a custom store, a host) is fenced as plain JavaScript,
and its first line says which side it runs on: `// In the agent` or `// On the host`.

---

## Flow control

| Atom        | Inputs                      | Returns | Fuel | Timeout | Effects | Needs | From AJS                              |
| ----------- | --------------------------- | ------- | ---- | ------- | ------- | ----- | ------------------------------------- |
| `seq`       | `steps`                     | nothing | 0.1  | none    | pure    | —     | syntax: a function body               |
| `if`        | `condition, then, else?`    | nothing | 0.1  | none    | pure    | —     | syntax: `if` / `else`                 |
| `while`     | `condition, body`           | nothing | 0.1  | none    | pure    | —     | syntax: `while`                       |
| `return`    | any fields                  | any     | 0.1  | 1 s     | pure    | —     | syntax: `return`                      |
| `try`       | `try, catch?, catchParam?`  | nothing | 0.1  | none    | pure    | —     | syntax: `try` / `catch`               |
| `Error`     | `args?`                     | nothing | 0.1  | 1 s     | pure    | —     | call: `Error('message')`, positional  |
| `evaluate`  | `value`                     | nothing | 0.1  | 1 s     | pure    | —     | syntax: an expression statement       |
| `scope`     | `steps`                     | nothing | 0.1  | none    | pure    | —     | syntax: a `{ }` block                 |
| `callLocal` | `name, args`                | nothing | 0.1  | none    | pure    | —     | syntax: a call to a helper function   |

You write these as ordinary JavaScript. `while` also charges 0.1 fuel per iteration, so
`while (true)` runs out of fuel instead of hanging.

`callLocal` declares no output, but a helper's return value still reaches the caller:
`let y = double(x)` binds what `double` returns, as in JavaScript. `evaluate` runs an expression
for its effect and discards the value; a statement such as `xs.push(2)` compiles to it.

AJS has no `throw`. `Error('message')` is how an agent fails on purpose: it sets the run's error,
and the steps after it are skipped until a `catch` takes it. Inside the `catch` block the
parameter (`e` below) is the error's message as a string, not an Error object, so there is no
`e.message`. The variable `errorOp` is bound in the same block, and only there, to the name of the
atom that failed:

```ajs
function safeDivide({ a = 10, b = 0 }) {
  try {
    if (b == 0) {
      Error('division by zero')
    }
    return { value: a / b }
  } catch (e) {
    return { failed: e, at: errorOp }
  }
}
```

Returns `{ failed: 'division by zero', at: 'Error' }`. Which failures can be caught and which end
the run is covered in [The AJS Language](/DOCS-AJS/).

## State

| Atom         | Inputs       | Returns | Fuel | Timeout | Effects | Needs | From AJS               |
| ------------ | ------------ | ------- | ---- | ------- | ------- | ----- | ---------------------- |
| `varSet`     | `key, value` | nothing | 0.1  | 1 s     | pure    | —     | syntax: `let`          |
| `varAssign`  | `key, value` | nothing | 0.1  | 1 s     | pure    | —     | syntax: `x = …`        |
| `constSet`   | `key, value` | nothing | 0.1  | 1 s     | pure    | —     | syntax: `const`        |
| `varGet`     | `key`        | any     | 0.1  | 1 s     | pure    | —     | builder                |
| `varsImport` | `keys`       | nothing | 0.2  | 1 s     | pure    | —     | syntax: the parameters |
| `varsLet`    | any fields   | nothing | 0.1  | 1 s     | pure    | —     | builder                |
| `varsExport` | `keys`       | object  | 0.2  | 1 s     | pure    | —     | builder                |

`varSet` declares a variable in the current scope. `varAssign` writes the scope that already owns
the name, which is how `total = total + x` inside a loop body updates the outer `total`.
`constSet` declares a binding that cannot be reassigned. `varsImport` copies the run's arguments
into scope; the transpiler emits it from the entry function's parameters.

`varGet`, `varsLet` and `varsExport` exist for builder ASTs. In AJS source a variable is read by
naming it.

## Arrays and objects

| Atom     | Inputs                                   | Returns  | Fuel | Timeout | Effects | Needs | From AJS                                    |
| -------- | ---------------------------------------- | -------- | ---- | ------- | ------- | ----- | ------------------------------------------- |
| `map`    | `items, as, steps, loop?`                | any[]    | 1    | none    | pure    | —     | syntax: `let ys = xs.map(x => …)`, `for...of` |
| `filter` | `items, as, condition`                   | any[]    | 1    | none    | pure    | —     | syntax: `let ys = xs.filter(x => …)`        |
| `reduce` | `items, as, accumulator, initial, steps` | any      | 1    | none    | pure    | —     | syntax: `let s = xs.reduce((a, x) => …, i)` |
| `find`   | `items, as, condition`                   | any      | 1    | none    | pure    | —     | syntax: `let y = xs.find(x => …)`           |
| `push`   | `list, item`                             | any[]    | 1    | 1 s     | pure    | —     | call (v1 data atom)                         |
| `len`    | `list`                                   | number   | 1    | 1 s     | pure    | —     | call (v1 data atom)                         |
| `split`  | `str, sep`                               | string[] | 1    | 1 s     | pure    | —     | call (v1 data atom)                         |
| `join`   | `list, sep`                              | string   | 1    | 1 s     | pure    | —     | call (v1 data atom)                         |
| `pick`   | `obj, keys`                              | object   | 1    | 1 s     | pure    | —     | call (v1 data atom)                         |
| `omit`   | `obj, keys`                              | object   | 1    | 1 s     | pure    | —     | call (v1 data atom)                         |
| `merge`  | `a, b`                                   | object   | 1    | 1 s     | pure    | —     | call (v1 data atom)                         |
| `keys`   | `obj`                                    | string[] | 1    | 1 s     | pure    | —     | call (v1 data atom)                         |

**The callback atoms** (`map`, `filter`, `reduce`, `find`) are what the transpiler emits for the
array methods that take an arrow function, and `map` is also what a `for...of` loop compiles to.
Each charges 1 fuel, plus whatever its steps cost for every item:

```ajs
function totals({ prices = [12, 5, 30] }) {
  let big = prices.filter((p) => p > 10)
  let doubled = prices.map((p) => p * 2)
  let sum = prices.reduce((acc, p) => acc + p, 0)
  let first = prices.find((p) => p > 20)
  return { big, doubled, sum, first }
}
```

Returns `{ big: [12, 30], doubled: [24, 10, 60], sum: 47, first: 30 }`. A callback method must
be bound to a variable, as above; `xs.filter(…).length` or `return { big: xs.filter(…) }` is a
transpile error. The message does not say so: it reads `Unsupported expression type in
condition: ArrowFunctionExpression`.

**The v1 data atoms** (`push` to `keys`) date from version 1 ASTs and the fluent builder. New
code should not call them. In AJS source, use the
method or builtin instead: `xs.push(x)`, `xs.length`, `s.split(',')`, `xs.join('-')`,
`Object.keys(o)`, `{ ...a, ...b }` or `Object.assign({}, a, b)` for `merge`, and an object literal
(`{ name: o.name }`) for `pick`. The method is what the transpiler emits for those, has JavaScript's
semantics, and goes through the same budget checks. The atoms differ in small ways: `push`
returns the array where `xs.push(x)` returns the new length. They remain callable by name, and a
host's `costOverrides` or `quotas` entry keyed on `split` or `push` applies only to those atom
calls, not to the methods.

**`filter(data, shape)` with two arguments is something else**: a builtin that returns a copy of
`data` holding only the fields `shape` declares, and fails if the data does not match. `shape` is
a schema, or an example value such as `{ name: '', age: 0 }` whose field values give the types (a
string and a number here). `filter({ name: 'Ann', age: 3, secret: 'x' }, { name: '', age: 0 })` is
`{ name: 'Ann', age: 3 }`. Use it to strip what a capability returned down to what you mean to
keep.

## Text, JSON and XML

| Atom            | Inputs           | Returns | Fuel | Timeout | Effects | Needs       | From AJS            |
| --------------- | ---------------- | ------- | ---- | ------- | ------- | ----------- | ------------------- |
| `template`      | `tmpl, vars`     | string  | 1    | 1 s     | pure    | —           | call (v1 data atom) |
| `regexMatch`    | `pattern, value` | boolean | 2    | 1 s     | pure    | —           | call                |
| `jsonParse`     | `str`            | any     | 1    | 1 s     | pure    | —           | call (v1 data atom) |
| `jsonStringify` | `value`          | string  | 1    | 1 s     | pure    | —           | call (v1 data atom) |
| `xmlParse`      | `str`            | any     | 1    | 1 s     | io      | `xml.parse` | call                |

`template` fills `{{name}}` placeholders from `vars`, reading only `vars`' own keys. In AJS source a
template literal does the same job and is what you should write; it compiles to string
concatenation. `template` is useful when the template text itself is data, such as a prompt
stored by the host:

```ajs
function greet({ name = 'Ann', tmpl = 'Hi {{name}}, welcome back, {{name}}!' }) {
  let fromData = template({ tmpl, vars: { name } })
  let literal = `Hi ${name}`
  return { fromData, literal }
}
```

Returns `{ fromData: 'Hi Ann, welcome back, Ann!', literal: 'Hi Ann' }`.

`regexMatch` returns `true` if `value` contains a match for `pattern`, a string or a regex
literal. It runs on the VM's own linear-time regex engine, so no pattern can hang a run; the
price is that backreferences (`\1`) and lookaround (`(?=…)`, `(?<=…)`) are refused with an error. The
string methods (`replace`, `split`, `match`, `search`) take the same patterns; use them when you
need the matched text, and `regexMatch` when you need a yes or no:

```ajs
function check({ code = 'abc123' }) {
  let endsInDigits = regexMatch({ pattern: '\\d+$', value: code })
  let lettersOnly = regexMatch({ pattern: /^[a-z]+$/, value: code })
  return { endsInDigits, lettersOnly }
}
```

Returns `{ endsInDigits: true, lettersOnly: false }`. A pattern given as a string is a JavaScript
string first, so a backslash is doubled (`'\\d+$'`); a regex literal (`/\d+$/`) needs no
doubling. What the engine supports is listed under
Regular expressions in [The AJS Language](/DOCS-AJS/).

`jsonParse` and `jsonStringify` are v1 data atoms; write `JSON.parse(s)` and `JSON.stringify(v)`.

`xmlParse` hands the string to the host's `xml.parse` capability and returns whatever it produces,
copied through the membrane. The VM has no XML parser of its own, so without that capability the
call fails with `Capability 'xml.parse' missing`.

## Store

| Atom                | Inputs                         | Returns | Fuel                   | Timeout | Effects | Needs                   | From AJS |
| ------------------- | ------------------------------ | ------- | ---------------------- | ------- | ------- | ----------------------- | -------- |
| `storeGet`          | `key`                          | any     | 5                      | 1 s     | io      | `store.get`             | call     |
| `storeSet`          | `key, value`                   | nothing | 5                      | 1 s     | io      | `store.set`             | call     |
| `storeQuery`        | `query`                        | any[]   | 5                      | 1 s     | io      | `store.query`           | call     |
| `storeQueryWhere`   | `predicate, collection?, limit?` | any[] | 5                      | 1 s     | io      | `store.queryPredicate`  | call     |
| `storeVectorSearch` | `collection?, vector, k?`      | any[]   | 5 + `k` (`k` default 5) | 1 s     | io      | `store.vectorSearch`    | call     |

With no `store` capability, a run gets its own in-memory store that holds `get` and `set` only,
lives for that one run, and adds the warning `Using default in-memory store (not suitable for
production)` to the run's `warnings`:

```ajs
function remember() {
  storeSet({ key: 'user:1', value: { name: 'Ann' } })
  let user = storeGet({ key: 'user:1' })
  let missing = storeGet({ key: 'user:2' })
  return { user, missing }
}
```

Returns `{ user: { name: 'Ann' } }`; `missing` is `undefined`, so it is left out of the result.

`storeQuery` passes `query` to the store's `query` method, in whatever form your store
understands. `storeVectorSearch` calls `store.vectorSearch(collection, vector, k)`. Both return
`[]` when the store has no such method, which includes the default store.

`storeQueryWhere` sends a **canonical verified predicate** to the store instead of fetching rows
and filtering them in the agent. The host builds the predicate outside the VM with
`canonicalizePredicate()` from `tjs-lang/lang`, which turns a pure function's source into a
plain object (`{ key, canonical, ast, entry }`), and passes it in as data, here as an argument:

```javascript
// On the host
import { canonicalizePredicate } from 'tjs-lang/lang'

const adult = canonicalizePredicate('function isAdult(p) { return p.age >= 18 }')
const run = await vm.run(ast, { adult }, { capabilities: { store: myStore } })
```

```javascript
// In the agent
function adults({ adult }) {
  let rows = storeQueryWhere({ predicate: adult, collection: 'users', limit: 10 })
  return { rows }
}
```

The store's `queryPredicate({ collection, predicate, limit })` receives the predicate object and
decides how to apply it; `predicate.key` does not change when the function is reformatted or its names are changed, so a
store can cache on it.
Unlike `storeQuery` and `storeVectorSearch`, `storeQueryWhere` fails rather than returning
everything when the store has no `queryPredicate`, because a filter that silently does not filter
is a data-exposure bug.

**`storeVectorSearch` or `storeSearch`.** Both call the store's `vectorSearch`. `storeVectorSearch`
is a core atom: its input is `vector`, `collection` is optional, and it returns `[]` when the store
cannot search. `storeSearch` is a battery atom: its input is `queryVector`, `collection` is
required, it can pass a `filter`, and it fails when the store cannot search. Use `storeSearch` with
the battery store, and `storeVectorSearch` with a store of your own that may lack the method.

## Network

| Atom        | Inputs                                         | Returns | Fuel | Timeout | Effects | Needs                                   | From AJS |
| ----------- | ---------------------------------------------- | ------- | ---- | ------- | ------- | --------------------------------------- | -------- |
| `httpFetch` | `url, method?, headers?, body?, responseType?` | any     | 5    | 30 s    | io      | `fetch` (optional, see below) | call   |

With no `fetch` capability, `httpFetch` uses a built-in client that fetches only from hosts the
run option `context.allowedFetchDomains` lists. The doc site lists `api.github.com`, so this runs
here; in your own VM, pass `context: { allowedFetchDomains: ['api.github.com'] }`:

```ajs
function repo({ owner = 'tonioloewald', name = 'tjs-lang' }) {
  let r = httpFetch({ url: `https://api.github.com/repos/${owner}/${name}` })
  return { name: r.full_name, language: r.language }
}
```

Returns `{ name: 'tonioloewald/tjs-lang', language: 'TypeScript' }`.

`httpFetch` returns the response body as data: parsed JSON when the response is JSON or
`responseType` is `'json'`, a string otherwise, or a `data:` URL with `responseType: 'dataUrl'`.
The built-in client returns the body of a 404 or a 500 the same way, without the status, so check
the body. It does not follow redirects: a 3xx comes back as `{ redirect: true, status, location }`,
and fetching `location` is a new request. A network failure is an error the agent can catch, with
the failure's message as `e`. A host's own `fetch` capability decides these things itself, and must
return plain data, not a `Response`.

Methods other than `GET` and `HEAD`, and request headers not on the VM's default list, are
refused unless the host allows them. The policy, including the header list, is in
[Hosting the VM](/ajs-host/) under Fetch policy.

## AI: llmPredict

| Atom         | Inputs             | Returns | Fuel | Timeout | Effects | Needs         | From AJS |
| ------------ | ------------------ | ------- | ---- | ------- | ------- | ------------- | -------- |
| `llmPredict` | `prompt, options?` | string  | 100  | 120 s   | io      | `llm.predict` | call     |

`llmPredict` is the core model atom: a prompt in, a string out. The host supplies
`llm.predict(prompt, options)` and decides which model answers.

```javascript
// In the agent
let answer = llmPredict({
  prompt: 'Name the capital of France in one word.',
  options: { temperature: 0, maxTokens: 10 },
})
```

`options` takes these keys only: `model`, `temperature`, `maxTokens` (or `max_tokens`), `topP` (or
`top_p`), `stop`, `seed`, `responseFormat` and `tools`. Any other key is refused. A
`responseFormat` is `{ type: 'json_schema', json_schema: { name, schema } }` (`Schema.response`
builds it), `{ type: 'json_object' }` or `{ type: 'text' }`. A tool is
`{ type: 'function', function: { name, description?, parameters?, strict? } }`. Every schema in
them must be a guest schema (see Schema in [The AJS Language](/DOCS-AJS/)).

For structured output, build the format with `Schema.response(name, shape)`, where `shape` is an
example value or a schema, and parse the reply, which is still a string:

```javascript
// In the agent
let format = Schema.response('capital', { city: '' })
let raw = llmPredict({ prompt: 'What is the capital of France?', options: { responseFormat: format } })
let answer = JSON.parse(raw) // { city: 'Paris' }
```

`Schema.response('capital', { city: '' })` is `{ type: 'json_schema', json_schema: { name:
'capital', strict: true, schema: { type: 'object', properties: { city: { type: 'string' } },
required: ['city'] } } }`. Whether the model keeps to it is up to the model server.

## AI: battery atoms

| Atom                    | Inputs                                     | Returns  | Fuel                   | Timeout | Effects | Needs                    | From AJS |
| ----------------------- | ------------------------------------------ | -------- | ---------------------- | ------- | ------- | ------------------------ | -------- |
| `llmPredictBattery`     | `system?, user, tools?, responseFormat?`   | message  | 100                    | 120 s   | io      | `llmBattery`             | call     |
| `llmVision`             | `system?, prompt, images, responseFormat?` | message  | 150                    | 120 s   | io      | `llmBattery`             | call     |
| `storeVectorize`        | `text, model?`                             | number[] | 20                     | 60 s    | io      | `vector`                 | call     |
| `storeCreateCollection` | `collection, dimension?`                   | nothing  | 5                      | 1 s     | io      | `store.createCollection` | call     |
| `storeVectorAdd`        | `collection, doc`                          | nothing  | 5                      | 60 s    | io      | `store.vectorAdd`        | call     |
| `storeSearch`           | `collection, queryVector, k?, filter?`     | any[]    | 5 + `k` (`k` default 5) | 1 s     | io      | `store.vectorSearch`     | call     |

The battery atoms are not in the core set. The host registers them and passes capabilities that
match, usually from `getBatteries()`, which connects to a local OpenAI-compatible model server:

```javascript
// On the host
import { AgentVM, batteryAtoms } from 'tjs-lang/vm-ast'
import { getBatteries } from 'tjs-lang/batteries'
import { transpile } from 'tjs-lang/lang'

const vm = new AgentVM(batteryAtoms)
const batteries = await getBatteries()
const { ast } = transpile(source, { atoms: vm.atoms })
const run = await vm.run(ast, args, { fuel: 1000, capabilities: batteries })
```

Passing `atoms` to `transpile` makes it check calls to the battery atoms' inputs too. What
`getBatteries()` returns, and how to supply the same keys from your own backends, is in
[Capabilities and Custom Atoms](/ajs-capabilities/). With no model server, `llmBattery` and
`vector` are empty, and these atoms fail with a "missing" error the agent can catch.

### llmPredict or llmPredictBattery

|                    | `llmPredict`                       | `llmPredictBattery`                                          |
| ------------------ | ---------------------------------- | ------------------------------------------------------------ |
| Input              | `{ prompt, options? }`             | `{ system?, user, tools?, responseFormat? }`                 |
| Output             | the reply as a string              | the reply as a message: `{ role, content, tool_calls }`      |
| Capability         | `llm.predict(prompt, options)`     | `llmBattery.predict(system, user, tools, responseFormat)`    |
| Registered         | always (core)                      | only with `batteryAtoms`                                     |

Use `llmPredict` for a prompt and a string answer. Use `llmPredictBattery` when you need a
system prompt, a multi-turn conversation, tool calls, or the whole message back.

### llmPredictBattery

| Input            | Required | Description                                                                                                                         |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `system`         | no       | The system prompt. Defaults to `'You are a helpful agent.'`                                                                       |
| `user`           | yes      | A string, or an array of `{ role, content }` messages. `content` is a string or an array of `{ type: 'text', text }` and `{ type: 'image_url', image_url }` parts. |
| `tools`          | no       | Tool definitions, in the same form as `llmPredict`'s `tools`.                                                                      |
| `responseFormat` | no       | Structured output, in the same form as `llmPredict`'s `responseFormat`.                                                            |

It returns the model's message. `content` is the text (or `null` when the model called tools)
and `tool_calls` lists the calls. The message is an open object: fields a provider adds, such as
`reasoning_content`, come through.

```javascript
// In the agent
let reply = llmPredictBattery({
  system: 'Answer in one word.',
  user: 'What is the capital of France?',
})
let answer = reply.content // 'Paris'
```

### llmVision

| Input            | Required | Description                                                                 |
| ---------------- | -------- | --------------------------------------------------------------------------- |
| `system`         | no       | The system prompt. Defaults to `'You analyze images accurately and concisely.'` |
| `prompt`         | yes      | What to look for in the images.                                             |
| `images`         | yes      | An array of image URLs or base64 data URLs (`data:image/png;base64,…`).     |
| `responseFormat` | no       | Structured output, as for `llmPredict`.                                     |

It returns a message, like `llmPredictBattery`. An `http(s)` image URL is a request the model
server makes for the agent, so it gets the fetch rule: it is refused unless the run's
`context.allowedFetchDomains` lists its host. Inline base64 image data always passes. To analyze a
remote image without letting the model server reach it, fetch it with
`httpFetch({ url, responseType: 'dataUrl' })` and pass the result.

```javascript
// In the agent
let page = httpFetch({ url: imageUrl, responseType: 'dataUrl' })
let seen = llmVision({
  prompt: 'Transcribe the text in this image.',
  images: [page],
})
let text = seen.content
```

### Embeddings and vector search

`storeVectorize({ text })` returns the embedding of `text` from the `vector` capability, as an
array of numbers. Its `model` input is accepted but not passed on: the capability's own model is
used.

`storeCreateCollection({ collection, dimension? })` creates a collection in the store.
`storeVectorAdd({ collection, doc })` adds a document to it. The battery store does not embed for
you: it needs the document's vector in an `embedding` field, so call `storeVectorize` first.
`storeSearch({ collection, queryVector, k?, filter? })` returns the `k` documents nearest to
`queryVector`, best first, and costs 5 fuel plus `k`; the battery store ignores `filter`, which is
for stores that support one. Unlike `storeVectorSearch`, these three fail when the store lacks the
method rather than returning nothing.

```javascript
// In the agent
storeCreateCollection({ collection: 'articles' })
let text = 'TJS types are examples.'
let embedding = storeVectorize({ text })
storeVectorAdd({ collection: 'articles', doc: { title: 'Types', text, embedding } })
let query = storeVectorize({ text: 'How do types work?' })
let hits = storeSearch({ collection: 'articles', queryVector: query, k: 3 })
```

## Code and agents

| Atom            | Inputs           | Returns | Fuel | Timeout | Effects | Needs                         | From AJS |
| --------------- | ---------------- | ------- | ---- | ------- | ------- | ----------------------------- | -------- |
| `agentRun`      | `agentId, input` | any     | 1    | 1 s     | io      | `agent.run`, for a string ID  | call     |
| `transpileCode` | `code`           | any     | 1    | 1 s     | io      | `code.transpile`              | call     |
| `runCode`       | `code, args?`    | any     | 1    | 1 s     | io      | `code.transpile`              | call     |

`agentRun` runs another agent with `input` as its arguments and returns its result. `agentId` is
one of three things:

- **a procedure token** from `storeProcedure` (below): the stored AST runs inside this VM;
- **an AST object**, such as one passed in the arguments: it runs inside this VM;
- **any other string**: the host's `agent.run(agentId, input)` capability decides what runs, as
  a separate run with its own budget.

Inside this VM the sub-agent gets a fresh scope that sees only `input`, and shares the run's fuel,
heap ceiling and capabilities. If it fails, `agentRun` fails with its message, which the caller
can catch.

`transpileCode({ code })` turns AJS source into an AST, and `runCode({ code, args })` transpiles
and runs it, returning its result. Both need the host's `code.transpile` capability, so an agent
can generate and run code only if the host allows it. Generated code runs as its own program: it
sees only `args`, not the caller's variables or helpers, and shares the run's fuel and
capabilities. `runCode` calls may nest 10 deep.

Before the source reaches `code.transpile`, the VM refuses it if it is over 8 KB (the run's
`maxSourceBytes` option can lower that, never raise it) and charges fuel for its size. The cap
matters more than the fuel: parsing happens before fuel can stop it, and a parser's worst case
grows faster than the source does. Give the capability's own `transpile` a cap as well, so it is
safe whoever calls it.

`agentRun` and `runCode`, like `memoize` and `cache`, keep the 1 s default timeout. It
fires only while the atom is waiting, as on a sub-agent's slow fetch, which then fails with
`Atom 'agentRun' timed out`; computation inside a sub-agent is bounded by fuel instead. A host
whose sub-agents call slow services raises it.

A host that allows generated code:

```javascript
// On the host
import { transpile } from 'tjs-lang/lang'

const run = await vm.run(ast, args, {
  fuel: 1000,
  capabilities: {
    code: { transpile: (source) => transpile(source, { maxSourceBytes: 8192 }).ast },
  },
  timeoutOverrides: { runCode: 10_000, agentRun: 30_000 },
})
```

And the agent:

```javascript
// In the agent
let code = 'function double({ n = 1 }) { return { d: n * 2 } }'
let out = runCode({ code, args: { n: 21 } }) // { d: 42 }
```

[Hosting the VM](/ajs-host/) explains where to transpile untrusted source.

## Stored procedures

| Atom                     | Inputs                | Returns | Fuel | Timeout | Effects | Needs | From AJS |
| ------------------------ | --------------------- | ------- | ---- | ------- | ------- | ----- | -------- |
| `storeProcedure`         | `ast, ttl?, maxSize?` | string  | 1    | 1 s     | io      | —     | call     |
| `releaseProcedure`       | `token`               | boolean | 0.1  | 1 s     | io      | —     | call     |
| `clearExpiredProcedures` | none                  | number  | 0.5  | 1 s     | io      | —     | call     |

`storeProcedure({ ast })` saves an AST and returns a token (`proc_…`) that `agentRun` or the
host's `vm.run(token, args)` can run later. The token expires after `ttl` milliseconds (default
one hour), and an AST larger than `maxSize` bytes (default 100KB) is refused. The AST's format
version (1 or 2, see Terms) is checked when it is stored, so an AST this VM cannot run is refused
then rather than failing later for whoever runs the token. `releaseProcedure({ token })` deletes
one and returns whether it existed; `clearExpiredProcedures()` deletes the expired ones and returns
how many.

The procedure store belongs to the process, not the run: a token stays valid across runs until it
expires or is released. For a host running untrusted agents, that has consequences:

- The store is one map shared by every VM in the process. It is not scoped per run or per tenant:
  any run that holds a token can run it. Tokens are random UUIDs, so they cannot be guessed, but
  one that leaks to another tenant works there too.
- An agent needs no capability to store a procedure, and nothing limits how many it stores beyond
  its fuel and the per-AST size limit. Each stays in memory until it is released, or until it has
expired and is cleared (by an attempt to run it, or by `clearExpiredProcedures`).
- A host that does not want agents to store procedures can refuse the atom with
  `quotas: { storeProcedure: 0 }`, which fails the call with `Quota exceeded for
  'storeProcedure': 0 calls allowed`.

```javascript
// In the agent; `child` is an AST the host passed in the arguments
let token = storeProcedure({ ast: child, ttl: 60000 })
let result = agentRun({ agentId: token, input: { n: 3 } })
let released = releaseProcedure({ token }) // true
```

## Utilities

| Atom     | Inputs                         | Returns | Fuel | Timeout | Effects | Needs                    | From AJS |
| -------- | ------------------------------ | ------- | ---- | ------- | ------- | ------------------------ | -------- |
| `memoize` | `key, steps`                  | any     | 1    | 1 s     | io      | —                        | builder  |
| `cache`   | `key, steps, ttlMs?`          | any     | 5    | 1 s     | io      | `store.get`, `store.set` (default store if none) | builder  |
| `random`  | `min?, max?, format?, length?` | any    | 1    | 1 s     | io      | —                        | call     |
| `uuid`    | none                          | string  | 1    | 1 s     | io      | —                        | call     |
| `hash`    | `value, algorithm?`           | string  | 1    | 1 s     | pure    | —                        | call     |

`random()` returns a float in `[min, max)`, from 0 to 1 by default. `format: 'integer'` rounds it
down, and `format: 'base36'` returns a random string of `length` characters (default 10)
instead. `uuid()` returns a version 4 UUID. Both use the platform's secure random source when it
has one.

`hash({ value })` returns a hex digest, SHA-256 unless `algorithm` names another one the platform
supports (`'SHA-1'`, `'SHA-384'`, `'SHA-512'`). A value that is not a string is hashed as its
JSON. Hashing charges fuel for the size of the input.

```ajs
function ids() {
  let id = uuid()
  let code = random({ format: 'base36', length: 6 })
  let die = random({ min: 1, max: 7, format: 'integer' })
  let sha1 = hash({ value: 'abc', algorithm: 'SHA-1' })
  return { id, code, die, sha1 }
}
```

`sha1` is `'a9993e364706816aba3e25717850c26c9cd0d89d'`; the others change on every run.

`memoize` and `cache` take steps, which AJS source cannot express, so only builder ASTs use them.
`memoize` runs its steps once per `key` within a run and returns the saved result after that.
`cache` saves the result in the store under `cache:<key>` for `ttlMs` (default 24 hours), so with
a real store it survives across runs. Both require a key, and neither saves a result whose steps
failed. The value saved is what the steps return or, if they return nothing, the variable named
`result` that they set.
In the builder the arguments are positional, steps first:

```javascript
// On the host
import { Agent } from 'tjs-lang'
import { s } from 'tosijs-schema'

const ast = Agent.take()
  .cache(
    (b) => b.httpFetch({ url: 'https://api.example.com/rates' }).as('result'), // steps
    'rates-today', // key
    3_600_000 // ttlMs: one hour
  )
  .as('rates')
  .return(s.object({ rates: s.any }))
  .toJSON()
// a second run within the hour returns the stored rates without fetching
```

## Console

| Atom           | Inputs    | Returns | Fuel | Timeout | Effects | Needs | From AJS |
| -------------- | --------- | ------- | ---- | ------- | ------- | ----- | -------- |
| `consoleLog`   | `message` | nothing | 0.1  | 1 s     | io      | —     | call     |
| `consoleWarn`  | `message` | nothing | 0.1  | 1 s     | io      | —     | call     |
| `consoleError` | `message` | nothing | 0.1  | 1 s     | io      | —     | call     |

`consoleLog({ message })` records the message in the trace, when the run has `trace: true`.
`consoleWarn({ message })` adds it to the run's `warnings` as well. `consoleError({ message })`
sets the run's error, like `Error(message)`, and the steps after it are skipped unless a `catch`
takes it.

Call these atoms by name. As the rules at the top say, `console.log(…)`, `console.warn(…)` and
`console.error(…)` in AJS source are accepted but do nothing: they compile to calls on a builtin that records
nothing, and `console.error` does not stop the run. An agent should put what its caller needs in
the object it returns.

```javascript
// In the agent
consoleWarn({ message: 'rate limit nearly reached' })
// run.warnings includes 'rate limit nearly reached'
```
