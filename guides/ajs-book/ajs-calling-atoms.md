<!--{"parent": "writing-agents.md", "order": 3}-->
<!-- TODO review -->

# Calling Atoms

An agent computes with the values it already has: arithmetic, strings, arrays, the builtins
such as `Math` and `JSON`. Everything else it does, it does by calling an **atom**. An atom is an
operation the VM provides: fetch a URL, read the store, ask a model, make an ID. Atoms are the
agent's only way to act on the world, and the way it reaches a few services the VM itself offers.

This chapter shows how to call one, which ones need something from the host, and how to read
what comes back. The [Atom Reference](/ajs-atoms/) lists every atom with its inputs, cost and
requirements; this chapter teaches the habits and links there for the details.

On the documentation site, each example marked AJS runs live in the page, which shows the value
the agent returns and the fuel it used ([A First Agent](/ajs-first-agent/#running-it-in-the-page)
explains how to edit and re-run one). That page host lets agents fetch from three domains,
`api.github.com`, `api.open-meteo.com` and `itunes.apple.com`, and has no model. Read anywhere
else, the examples are agent source a host would run.

## A first call

`hash({ value })` returns the SHA-256 digest of a value as hex (a string is hashed as its text,
any other value as its JSON), and needs nothing from the host. `uuid()` makes a random ID from the
random source the host grants ([time and randomness](/ajs-values/#time-and-randomness)); the
examples on this site run with one:

```ajs
function stamp({ name = 'Ada' }) {
  let id = uuid()
  let digest = hash({ value: name })
  return { name, id, digest }
}
```

This returns `name: 'Ada'`, a fresh UUID such as `'41cd7bfa-8577-433c-a26a-3cfa445ce42a'`, and
`digest: '99a563ab2f6e21e96998f9fddd2a2bab82b70ac019579502b8d7fc0032ff62bb'`. Run it again and
the `id` changes while the `digest` does not: `uuid` draws on the system's random number
generator, and `hash` is a pure function of its input.

The store atoms work with no setup either. A host can give a run a store of its own (see
[Atoms that need the host](#atoms-that-need-the-host)); a run without one gets a small in-memory
store that lasts for that run:

```ajs
function remember() {
  storeSet({ key: 'user:1', value: { name: 'Ann' } })
  let user = storeGet({ key: 'user:1' })
  let missing = storeGet({ key: 'user:2' })
  return { user, missing }
}
```

This returns `{ user: { name: 'Ann' } }`. Nothing was stored under `'user:2'`, so `missing` is
`undefined`, and an `undefined` field is left out of the returned object. More on reading results
[below](#reading-what-comes-back). Alongside the result, the host also gets a warning that the
default store is not suitable for production; the page does not show warnings.

### No `await`

An atom call reads like a function call: the next line sees its result. Many atoms do
asynchronous work, a fetch for example, but every call is awaited for you, and calls run one
after another. Writing `await` is a transpile error, usually
`Cannot use keyword 'await' outside an async function`. An agent cannot start two calls at once;
running work in parallel is the host's job ([Parallel Execution](/patterns/#parallel-execution)
in Patterns).

## Named inputs

An atom takes **one object literal of named inputs**, or nothing at all, with one exception,
`Error` (see [Two exceptions](#two-exceptions)). `storeSet({ key, value })` is shorthand for
`storeSet({ key: key, value: value })`, as in JavaScript, and `uuid()` takes no input.

The transpiler checks every call against the atom's declared inputs, and refuses a call that
does not fit with a message that names the fix.

`storeSet('k', 1)` is refused with:

```text
'storeSet' takes named arguments: write storeSet({ name: value, … }), not storeSet(a, b).
Positional arguments are for local functions.
```

`storeSet(opts)`, where `opts` is a variable holding an object, gets the same message. Anything
other than an object literal written in the call counts as a positional argument, a variable
included: the inputs must be spelled out where the call is.

`storeSet({ ...opts })` is refused with:

```text
A spread is not supported in an atom call: name each input, e.g. foo({ a: opts.a, b: opts.b })
```

`storeGet({ k: 1 })` is refused with:

```text
'storeGet' has no input 'k'. It takes storeGet({ key }).
```

`storeSet({ key: 'k' })` is refused with:

```text
'storeSet' needs 'value'. It takes storeSet({ key, value }).
```

Each message ends with the line and column, such as `at <source>:1:15`.

Why so strict, when JavaScript would take any of these? Because an atom's inputs are a declared
contract, checked by name. That is what lets the transpiler explain a mistake instead of leaving
the agent to fail halfway through a run. It also keeps a call readable after it is compiled:
each atom call becomes one step in the agent's JSON AST, with the atom's name and a named field
for each input, so a host can audit what an agent will do by reading the AST, without running
it.

The transpiler checks names, not value types, so some mistakes reach the VM. At the boundary
with the host, the VM sorts failures into two kinds. A call the agent got wrong ends the run,
even inside a `try`. A failure the world caused, such as a server that is down or a capability
the host did not give, is an ordinary error the agent can catch. `httpFetch({ url: 5 })` is the
first kind: it transpiles, then ends the run with
`'httpFetch': its input does not have the shape the atom declares`.
[When Things Fail](/ajs-errors/) explains both kinds and how to catch the second.

Your own helper functions and the builtins (`Math.max(a, b)`, `encodeURIComponent(s)`) are not
atoms, and take positional arguments as usual.

## A call stands on its own

An atom call is a statement of its own. It may be the whole value of a declaration or an
assignment, or a bare statement:

```javascript
let id = uuid()                         // a declaration
id = uuid()                             // an assignment
storeSet({ key: 'last', value: id })    // a bare statement
```

It may not sit inside a larger expression. Each of these is refused:

```javascript
return { id: uuid() }                                 // (refused)
if (regexMatch({ pattern: /a/, value: s })) { … }     // (refused)
let x = ready ? uuid() : 'none'                       // (refused)
```

with `Atom 'uuid' cannot be called inside an expression. Assign its result to a variable first: …`
(naming `regexMatch` for the second).

The reason is that every atom call is a **step**, the unit the VM meters. Each step is charged
**fuel**, the run's budget of work: every step costs some, and the run stops when the budget is
spent. The VM also checks each step's inputs and enforces its time limit. A call buried inside
an expression would be work done between steps, with nothing to charge it to.

The transpiler does not lift the call out for you, because where it lands changes what runs. In
`ready ? uuid() : 'none'` the call happens only when `ready` is true, and in `a && f({ … })` only
when `a` is truthy; moved in front of the expression, it would run every time. You decide where
it goes. [Where Calls May Appear](/patterns/#where-calls-may-appear) has the full rule, which
also covers helper calls and callbacks. Lifting the call out is always the fix:

```ajs
function pick({ s = 'abc123' }) {
  let hasDigits = regexMatch({ pattern: /\d/, value: s })
  let id = uuid()
  if (hasDigits) {
    return { s, id, kind: 'code' }
  }
  return { s, id, kind: 'word' }
}
```

This returns `kind: 'code'` with a fresh `id`. `regexMatch` reports whether `value` matches
`pattern`, which may be a regex literal, as here, or a string such as `'\\d'`.

## Atoms that need the host

Every atom on this page is a **core atom**: it comes with the VM. The VM has no IO of its own,
though, so some core atoms work only through a **capability**, an object the host passes for the
run. `uuid`, `hash` and `regexMatch` need none. These do:

| Atom                      | Needs                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `httpFetch`               | the host's `fetch`, or else a built-in client that only fetches from domains the host allows              |
| `storeGet`, `storeSet`, … | the host's `store`, or else an in-memory store that lasts one run, with a warning in the run's result     |
| `llmPredict`              | the host's `llm.predict`                                                                                  |

The **Needs** column of each table in the [Atom Reference](/ajs-atoms/#how-to-read-the-tables)
is the authority on which capability an atom calls; it also covers the atoms this chapter leaves
out, such as `agentRun`, which runs another agent.

What an agent sends to a capability, and what it gets back, cross a boundary called the
membrane as checked copies of plain data, never the host's live objects. You do not have to do
anything about it as an author, except to expect data back: objects, arrays, strings, numbers.
[Capabilities and Custom Atoms](/ajs-capabilities/#what-a-capability-may-return) has the
details.

## Fetching

`httpFetch({ url })` makes an HTTP request and returns the response body. GitHub is one of the
domains this page's host allows, so this runs here:

```ajs
function repo({ owner = 'tonioloewald', name = 'tjs-lang' }) {
  let r = httpFetch({ url: `https://api.github.com/repos/${owner}/${name}` })
  if (r.full_name == null) {
    return { error: r.message ?? 'unexpected response' }
  }
  return { name: r.full_name, language: r.language, stars: r.stargazers_count }
}
```

It returns `{ name: 'tonioloewald/tjs-lang', language: 'TypeScript', stars: … }`.

When the repository is missing, this agent returns `{ error: … }`, an ordinary object. That is a
choice: the run succeeds, and the caller gets data it can read and decide about. Calling
`Error('message')` instead would fail the run, skipping the rest of the agent unless a `catch`
takes it. The host gives `error` no special meaning; it is only a field name.
[When Things Fail](/ajs-errors/) covers failing on purpose.

What comes back is the body, as data:

- **A JSON body is parsed** into objects and arrays when the response's `Content-Type` says
  `application/json`. Any other body arrives as a string. A body that claims to be JSON and does
  not parse is an error the agent can catch.
- **There is no status code.** A 404 or a 500 comes back as its body, so check the body before
  you use it. That is what the `if` above is for: with `name: 'no-such-repo'`, GitHub answers 404
  with `{ "message": "Not Found", … }` and the agent returns `{ error: 'Not Found' }`.
- **A request that gets no answer fails.** A host name that does not resolve, a refused
  connection, or a server slower than `httpFetch`'s 30-second limit raises an ordinary error the
  agent can catch.
- **A redirect is not followed.** It comes back as `{ redirect: true, status, location }`, and
  fetching `location` is a new request the agent makes itself.

The redirect marker is an ordinary object, so a JSON body that itself held `redirect: true`
would look the same; check `location` before you use it. On a server, `location` is an absolute
URL, resolved against the one you fetched. In a browser it is `null` and `status` is `0`: a
browser does not let a page see where an unfollowed redirect points. GitHub redirects requests
for a renamed repository (`xinjs` was renamed `tosijs`, and at the time of writing the old name
answers with a 301), so this agent shows both cases:

```ajs
function follow({ owner = 'tonioloewald', name = 'xinjs' }) {
  let r = httpFetch({ url: `https://api.github.com/repos/${owner}/${name}` })
  if (r.redirect != true) {
    return { redirected: false, name: r.full_name }
  }
  if (r.location == null) {
    return { redirected: true, followed: false, status: r.status }
  }
  let moved = httpFetch({ url: r.location })
  return { redirected: true, followed: true, name: moved.full_name }
}
```

On a server host this returns `{ redirected: true, followed: true, name: 'tonioloewald/tosijs' }`.
In this page, which runs in your browser, it returns
`{ redirected: true, followed: false, status: 0 }`. The second request goes to `api.github.com`
as well; a `location` on a domain the host does not allow would be refused.

Requests are `GET` unless you pass `method`, and `httpFetch` also takes `headers`, `body` and
`responseType`. `responseType: 'json'` parses the body whatever its `Content-Type` says, and
`'dataUrl'` returns it as a `data:` URL, for images; the [Network](/ajs-atoms/#network) table has
the details. Methods other than `GET` and `HEAD`, and request headers not on the VM's default
list, are refused unless the host allows them: `httpFetch({ url, method: 'POST' })` fails with
`httpFetch: method 'POST' is not allowed (use GET, HEAD; …)`, an error the agent can catch. The
host's side of this is [Fetch policy](/ajs-host/#fetch-policy).

Two gallery pages build complete agents this way: [Weather API](/weather-api/) (Open-Meteo, with
a bad-request check) and [GitHub Repos](/github-repos/) (a search, mapped down to three fields
per result).

## Asking a model

`llmPredict({ prompt, options? })` sends a prompt to the host's model and returns the reply as a
**string**. This page's host has no model, so the examples are agent code to read rather than
run:

```javascript
// In the agent
function capitalOf({ country = 'France' }) {
  let answer = llmPredict({
    prompt: `Name the capital of ${country} in one word.`,
    options: { temperature: 0, maxTokens: 10 },
  })
  return { answer }
}
```

For structured output, describe the shape you want and pass it as `responseFormat`. `Schema` is
a builtin that builds JSON schemas from example values, and `Schema.response(name, shape)` wraps
one in the form a model server expects, with `name` as the label the server sees. The reply is
still a string, so parse it, and check what you parsed:

```javascript
// In the agent
function capital({ country = 'France' }) {
  let format = Schema.response('capital', { city: '' })
  let raw = llmPredict({
    prompt: `What is the capital of ${country}?`,
    options: { responseFormat: format, temperature: 0 },
  })
  try {
    let answer = JSON.parse(raw)
    if (typeof answer?.city != 'string') {
      return { error: 'no city in the reply' }
    }
    return { city: answer.city }
  } catch {
    return { error: 'the reply was not JSON' }
  }
}
```

With a model that keeps to the format, this returns `{ city: 'Paris' }`. `{ city: '' }` is an
example value: it asks for an object with a string field `city`. Whether the model honours the
format is up to the model server. If the reply is not JSON, `JSON.parse` raises an error the
agent can catch, as here; if it is JSON of the wrong shape, the `typeof` check notices.
[AI: llmPredict](/ajs-atoms/#ai-llmpredict) lists the options `llmPredict` accepts, and the
gallery has complete agents: [LLM Chat](/llm-chat/) and
[LLM Structured Output](/llm-structured-output/).

The **battery atoms** are an optional set for local model servers. Hosts that register them get
a few more model atoms, such as `llmPredictBattery` (which returns a whole chat message) and
`llmVision`; see [AI: battery atoms](/ajs-atoms/#ai-battery-atoms).

## When a capability is missing

Calling an atom whose capability the host did not provide is an ordinary failure. With no `llm`
capability, `llmPredict` fails with:

```text
Capability 'llm.predict' missing
```

The built-in fetch client refuses a domain the host did not allow. This page allows three, so
this agent's call is refused, and since nothing catches the error, it ends the run:

```ajs
function elsewhere() {
  let page = httpFetch({ url: 'https://example.com/' })
  return { page }
}
```

The run's error is
`Fetch blocked: domain not in allowlist. Allowed: api.github.com, itunes.apple.com, api.open-meteo.com`.
On a host that set no allowlist and no `fetch` of its own, the message starts
`Fetch blocked: no allowedFetchDomains configured`.

"Ordinary" matters: these failures are the world's doing, not a mistake in the agent, so an agent
can catch one and carry on without the capability, for example by returning a fallback answer.
How to catch it is in [When Things Fail](/ajs-errors/).

## Quotas

A host can cap how many times a particular atom runs in one agent run, whatever the fuel. To the
agent, a call past the cap is one more ordinary failure, such as
`Quota exceeded for 'llmPredict': 3 calls allowed`, which it can catch. An agent cannot read its
quota, so write agents that make few calls rather than ones that count down to a limit.

This is the host's side, for context:

```javascript
// On the host
const run = await vm.run(ast, args, {
  capabilities: { llm },
  quotas: { llmPredict: 3 },
})
```

The fourth `llmPredict` call in that run fails with the message above. A quota is separate from
fuel: an `httpFetch` costs 5 fuel and a model call 100, but a quota counts calls.
[Limits](/ajs-limits/) covers the budgets a run is held to, and
[Quotas across nested runs](/ajs-host/#quotas-across-nested-runs) covers setting them from the
host.

## Reading what comes back

An atom's result is a value like any other: bind it, read its fields, return it. A few results
surprise people:

- **`storeGet` of a missing key is `undefined`**, and a field whose value is `undefined` is left
  out of the object the agent returns. The `remember` agent above returns `{ user }`, not
  `{ user, missing: undefined }`. Use `?? default` when you need a value.
- **`llmPredict` returns a string**, not a message object. (The battery atom `llmPredictBattery`
  returns a message, whose text is `reply.content`.)
- **`httpFetch` returns a body, not a response**, as described above.

### Debug output

`console.log(...)` transpiles, because `console` is one of the VM's builtins, but its methods have
no effect: they print nothing and add nothing to the result or the warnings. To see something
during a run, call the console atoms:

```ajs
function steps({ n = 41 }) {
  let x = n + 1
  consoleLog({ message: `x is ${x}` })
  if (x > 40) {
    consoleWarn({ message: 'x is large' })
  }
  return { x }
}
```

This returns `{ x: 42 }`. Neither message appears on this page, which shows only the result and
the fuel used; they are for the host. `consoleLog` records its message, `'x is 42'`, in the run's
trace when the host runs with `trace: true`. `consoleWarn` adds its message to the run's warnings
as well, which the host gets with the result. `consoleError({ message })` raises an ordinary
error, like `Error(message)`: the steps after it are skipped unless a `catch` takes it (see
[When Things Fail](/ajs-errors/)). See [Console](/ajs-atoms/#console).

None of these reach the agent's caller unless the host looks. Anything the caller needs belongs
in the object the agent returns.

## Two exceptions

- **`Error('message')`** is an atom called positionally, the one exception to named inputs. It is
  how an agent fails on purpose. [When Things Fail](/ajs-errors/) covers it.
- **`filter(data, shape)`** with two arguments is a builtin, not an atom. It returns a copy of
  `data` holding only the fields `shape` declares. [Contracts](/ajs-contracts/) covers it.

## The host's own atoms

The atoms on this page come with the VM. A host can add its own, and an agent calls them the same
way, with named inputs.

A call with one object literal or no arguments, to a name that is not a local function or a
builtin, is taken as an atom call. If no atom has that name, the run fails with
`Unknown Atom: <name>`. That happens at run time, so a misspelled atom name, `storeGt({ key })`
for example, is not caught by the transpiler. (A misspelled helper called with positional arguments is caught, by the
named-arguments message above.)

The input checks need the transpiler to know the atoms. It knows the core atoms; for a host's
own, the host transpiles with its VM's atom table:

```javascript
// On the host
const { ast } = transpile(source, { atoms: vm.atoms })
```

With it, a call to a host atom is checked like a core atom: given an atom `echo({ v })`,
`echo({ w: 'a' })` is refused with `'echo' has no input 'w'. It takes echo({ v }).` Without it, a
wrong input name on a host atom transpiles and runs, and the atom quietly receives `undefined`
for the input it expected. Writing atoms and capabilities is in
[Capabilities and Custom Atoms](/ajs-capabilities/).
