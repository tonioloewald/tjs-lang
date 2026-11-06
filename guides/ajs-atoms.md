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

Hosts can add atoms of their own; [Capabilities and Custom Atoms](/ajs-capabilities/) covers that.
How to give a run its budgets and capabilities is in [Hosting the VM](/ajs-host/).

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

Returns a fresh UUID, the SHA-256 hex digest of `'Ada'`, and an integer from 1 to 6.

Three rules apply to every call:

- **Inputs are named and checked when the source is transpiled.** A positional call
  (`storeGet('k')`), a spread, an input the atom does not declare, or a missing required input is
  a transpile error that names what the atom takes: `'storeGet' has no input 'k'. It takes
  storeGet({ key }).`
- **An atom call is a statement.** Write `let x = atom({ … })`, `x = atom({ … })`, or a bare
  `atom({ … })`. An atom call inside a larger expression, such as `return { id: uuid() }` or
  `if (regexMatch({ … }))`, transpiles but fails when it runs, with `Atom calls in expressions not
  yet supported`. Bind the result to a variable first.
- **There is no `await`.** Every atom call is awaited for you.

Your own helper functions and the builtins (`Math.max(a, b)`, `Error('message')`,
`JSON.parse(s)`) take positional arguments as usual.

### How to read the tables

| Column       | Meaning                                                                                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inputs**   | The input names the atom declares. `?` marks an optional one. Every core atom's input object is closed (except `return` and `varsLet`): any other name is an error.                                                                                                                      |
| **Returns**  | The declared output. "nothing" means the atom returns no value; "message" is an OpenAI-style chat message, `{ role, content, tool_calls }`.                                                                                                              |
| **Fuel**     | The base cost, charged before the atom runs. Work that grows with the input (copying, building strings, a regex, validating against a schema, the steps a loop runs) is charged on top. A host can change the base with `costOverrides: { op: n }`. |
| **Timeout**  | The per-call wall-clock limit. "none" means the atom has no limit of its own; the run's overall timeout still applies. A host can change it with `timeoutOverrides: { op: ms }`.                                                                        |
| **Effects**  | `pure`: deterministic, touches no capability, no side effects. `io`: anything else. An `io` atom is treated as reaching outside the VM: its result enters as a checked copy (the capability membrane), and a verified predicate cannot call it.                                           |
| **Needs**    | The capability key the atom calls. "—" means none.                                                                                                                                                                                                       |
| **From AJS** | How source reaches the atom. **call**: call it by name. **syntax**: the transpiler emits it for a language construct, and you never name it. **builder**: only a hand-built or fluent-builder AST uses it.                                                |

A default timeout of 1 s applies to atoms that run other steps, too. A sub-agent started with
`agentRun`, or `runCode` running generated code, that takes longer than a second fails with
`Atom 'agentRun' timed out` unless the host raises it: `timeoutOverrides: { agentRun: 30_000 }`.

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

AJS has no `throw`. `Error('message')` is how an agent fails on purpose: it sets the run's error,
and the steps after it are skipped until a `catch` takes it. In the `catch` block the parameter is
the error's message and `errorOp` names the atom that failed:

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
transpile error.

**The v1 data atoms** (`push` to `keys`) date from the fluent builder. In AJS source, use the
method or builtin instead: `xs.push(x)`, `xs.length`, `s.split(',')`, `xs.join('-')`,
`Object.keys(o)`, `{ ...a, ...b }` or `Object.assign({}, a, b)` for `merge`, and an object literal
(`{ name: o.name }`) for `pick`. The method is what the transpiler emits for those, has JavaScript's
semantics, and goes through the same budget checks. The atoms differ in small ways: `push`
returns the array where `xs.push(x)` returns the new length. They remain callable by name, and a
`costOverrides` or `quotas` entry keyed on `split` or `push` applies only to those atom calls, not
to the methods.

**`filter(data, shape)` with two arguments is something else**: a builtin that returns a copy of
`data` holding only the fields `shape` declares (a schema or an example), and fails if the data
does not match. `filter({ name: 'Ann', age: 3, secret: 'x' }, { name: '', age: 0 })` is
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
literal. It runs on the VM's own linear-time regex engine, so no pattern can hang a run. The
string methods (`replace`, `split`, `match`, `search`) take the same patterns; use them when you
need the matched text, and `regexMatch` when you need a yes or no:

```ajs
function check({ code = 'abc123' }) {
  let endsInDigits = regexMatch({ pattern: '\\d+$', value: code })
  let lettersOnly = regexMatch({ pattern: /^[a-z]+$/, value: code })
  return { endsInDigits, lettersOnly }
}
```

Returns `{ endsInDigits: true, lettersOnly: false }`. What the engine supports is listed under
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
and filtering them in the agent. The predicate is built outside the VM with
`canonicalizePredicate()` from `tjs-lang/lang` and passed in as data. Unlike the other two, it
fails rather than returning everything when the store has no `queryPredicate`, because a filter
that silently does not filter is a data-exposure bug.

## Network

| Atom        | Inputs                                         | Returns | Fuel | Timeout | Effects | Needs                                   | From AJS |
| ----------- | ---------------------------------------------- | ------- | ---- | ------- | ------- | --------------------------------------- | -------- |
| `httpFetch` | `url, method?, headers?, body?, responseType?` | any     | 5    | 30 s    | io      | `fetch`, or `context.allowedFetchDomains` | call   |

```ajs
function repo({ owner = 'tonioloewald', name = 'tjs-lang' }) {
  let r = httpFetch({ url: `https://api.github.com/repos/${owner}/${name}` })
  return { name: r.full_name, language: r.language }
}
```

`httpFetch` returns the response body as data: parsed JSON when the response is JSON or
`responseType` is `'json'`, a string otherwise, or a `data:` URL with `responseType: 'dataUrl'`.
Methods other than `GET` and `HEAD`, and headers not on the default list, are refused unless the
host allows them. With no `fetch` capability, the built-in client fetches nothing unless the run's
`context.allowedFetchDomains` names the host. The whole policy is in
[Hosting the VM](/ajs-host/).

## AI: llmPredict

| Atom         | Inputs             | Returns | Fuel | Timeout | Effects | Needs         | From AJS |
| ------------ | ------------------ | ------- | ---- | ------- | ------- | ------------- | -------- |
| `llmPredict` | `prompt, options?` | string  | 100  | 120 s   | io      | `llm.predict` | call     |

`llmPredict` is the core model atom: a prompt in, a string out. The host supplies
`llm.predict(prompt, options)` and decides which model answers.

```javascript
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
capabilities. `runCode` calls may nest 10 deep. The source is charged by size before it is
parsed.

A host that allows it:

```javascript
import { transpile } from 'tjs-lang/lang'

const run = await vm.run(ast, args, {
  fuel: 1000,
  capabilities: { code: { transpile: (source) => transpile(source).ast } },
  timeoutOverrides: { runCode: 10_000 },
})
```

And the agent:

```javascript
let code = 'function double({ n = 1 }) { return { d: n * 2 } }'
let out = runCode({ code, args: { n: 21 } }) // { d: 42 }
```

Parsing is the one step whose cost the agent controls before any budget applies, so the
transpiler in this capability should cap its input (`transpile(source, { maxSourceBytes })`).
[Hosting the VM](/ajs-host/) explains why.

## Stored procedures

| Atom                     | Inputs                | Returns | Fuel | Timeout | Effects | Needs | From AJS |
| ------------------------ | --------------------- | ------- | ---- | ------- | ------- | ----- | -------- |
| `storeProcedure`         | `ast, ttl?, maxSize?` | string  | 1    | 1 s     | io      | —     | call     |
| `releaseProcedure`       | `token`               | boolean | 0.1  | 1 s     | io      | —     | call     |
| `clearExpiredProcedures` | none                  | number  | 0.5  | 1 s     | io      | —     | call     |

`storeProcedure({ ast })` saves an AST and returns a token (`proc_…`) that `agentRun` or the
host's `vm.run(token, args)` can run later. The token expires after `ttl` milliseconds (default
one hour), and an AST larger than `maxSize` bytes (default 100KB) is refused. The AST's format
version is checked when it is stored, not when it is run. `releaseProcedure({ token })` deletes
one and returns whether it existed; `clearExpiredProcedures()` deletes the expired ones and returns
how many.

The procedure store belongs to the process, not the run: a token stays valid across runs until it
expires or is released.

```javascript
// `child` is an AST the host passed in the arguments
let token = storeProcedure({ ast: child, ttl: 60000 })
let result = agentRun({ agentId: token, input: { n: 3 } })
let released = releaseProcedure({ token }) // true
```

## Utilities

| Atom     | Inputs                         | Returns | Fuel | Timeout | Effects | Needs                    | From AJS |
| -------- | ------------------------------ | ------- | ---- | ------- | ------- | ------------------------ | -------- |
| `memoize` | `key, steps`                  | any     | 1    | 1 s     | io      | —                        | builder  |
| `cache`   | `key, steps, ttlMs?`          | any     | 5    | 1 s     | io      | `store`                  | builder  |
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
failed. The value saved is whatever the steps bind to `result` (or `return`):

```javascript
import { Agent } from 'tjs-lang'
import { s } from 'tosijs-schema'

const ast = Agent.take()
  .cache(
    (b) => b.httpFetch({ url: 'https://api.example.com/rates' }).as('result'),
    'rates-today',
    3_600_000
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

Call these atoms by name. In AJS source, `console.log(…)`, `console.warn(…)` and
`console.error(…)` are accepted but do nothing: they compile to calls on a builtin that records
nothing, and `console.error` does not stop the run. An agent should put what its caller needs in
the object it returns.

```javascript
consoleWarn({ message: 'rate limit nearly reached' })
// run.warnings includes 'rate limit nearly reached'
```
