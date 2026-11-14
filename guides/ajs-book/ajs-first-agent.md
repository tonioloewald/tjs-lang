<!--{"parent": "writing-agents.md", "order": 1}-->
<!-- TODO review -->

# A First Agent

This chapter writes one agent, runs it in the page, looks at what it compiles to, and then runs
it from a host program in about ten lines. By the end you will have four words that the rest of
the book uses without stopping to explain them: **agent**, **atom**, **capability** and
**fuel**.

You need to know some JavaScript. You do not need to know anything about AJS.

## What an agent is

An **agent** is a function that takes one object of named inputs, destructured in its
parameter list, and returns one plain object. Here is the smallest useful one:

```ajs:inline
function greet({ name = 'World' }) {
  let message = `Hello, ${name}!`
  return { message }
}
```

It reads like JavaScript because it is a subset of JavaScript. It does not run the way
JavaScript does, though. Agents run in the **VM**, a virtual machine that is a sandbox: an
interpreter inside your program that can reach nothing outside the agent unless it is given
access. The program that owns the VM and runs agents in it is the **host**. On this site the
host is the page; in your app it is your server, page or worker. The VM does not read source
code either. A **transpiler** first turns the source into a tree of plain data, and that tree is
what the VM runs. You will see both steps below.

Three things about the agent's shape matter:

- **One object in.** The inputs are named fields of a single object, not positional arguments.
  `name = 'World'` makes `name` optional, with `'World'` used when the caller leaves it out. A
  default also declares the field's type, and only declared fields are accepted, so
  `{ name: 42 }` and `{ name: 'Ada', extra: 1 }` are both refused before the agent runs.
  [Contracts](/ajs-contracts/) explains.
- **One object out.** The agent returns `{ message }`, not the bare string. An object can grow
  a field later without breaking whoever reads it.
- **Objects all the way through.** Because every agent takes an object and returns an object,
  one agent's result can be passed as the next agent's input, when its fields match what the
  next agent declares. [Running it from a host](#running-it-from-a-host) shows a host doing
  that.

A source file may hold several functions. The **last** one is the agent, the entry point the
host calls; any before it are helpers it can call by name. AJS has no `export` (writing one is
an error) and no other way to name the entry point, so position is the rule. Get the order
wrong and the transpiler does not complain: the helper at the bottom becomes the agent, and the
run is usually refused because its inputs do not match. `greet` is alone, so it is the agent.

The site also has an example gallery, with one runnable agent per page; its
[Hello World](/hello-world/) is this agent with two variations. You do not need it to follow
this chapter.

## Running it in the page

The example above is live. Each `ajs` example in this book is a real run, with the page as
host: it transpiles the source, runs the agent with no arguments (so every default applies), and
shows the result, here `{ message: 'Hello, World!' }`, along with `fuelUsed`, a measure of how
much work the run did (more on fuel [below](#running-it-from-a-host)).

Try one edit. Change `'World'` to your own name in the example's code, then press the
**refresh** button in the code panel's tab bar (or ⌘S or ⌘R) to run it again. Editing alone
does not re-run an example. Then try `return message` instead of `return { message }`. The run
ends with an error, `Agent must return an object, got string`, shown where the result would be.
The page did not crash, and neither would a host: what an agent does wrong comes back as a
value.

## An agent that does some work

Here is an agent with more in it: a list of products, a price limit, and three steps over the
list.

```ajs:inline
function shortlist({ items = [
  { name: 'kettle', price: 40 },
  { name: 'toaster', price: 25 },
  { name: 'blender', price: 90 },
], maxPrice = 50 }) {
  let affordable = items.filter((item) => item.price <= maxPrice)
  let names = affordable.map((item) => item.name)
  let total = affordable.reduce((sum, item) => sum + item.price, 0)
  return { names, total }
}
```

It returns `{ names: ['kettle', 'toaster'], total: 65 }`. `filter` keeps the items at or under
`maxPrice`, `map` takes their names, and `reduce` adds up their prices. A caller that passed
`{ maxPrice: 30 }` would get `{ names: ['toaster'], total: 25 }`. Change the default to `30` and
see.

The arrow functions passed to `filter`, `map` and `reduce` are callbacks. They can read any
variable of the function they are written in, as these read `maxPrice`. The rule that most
often catches people out is that a callback call stands alone as the value of its statement:
`items.filter(…).map(…)` on one line is refused, which is why this agent takes three lines.
[Decisions, Loops and Helpers](/ajs-control-flow/) has the rest.

## An agent that reaches outside

Neither agent so far touches the outside world. An agent that fetches a URL, asks a model or
reads a store does it by calling an **atom**, a built-in operation the VM provides. Atoms are
the only way an agent acts on anything outside itself, and they take named inputs:

```ajs:inline
function stars({}) {
  let repo = httpFetch({ url: 'https://api.github.com/repos/tonioloewald/tjs-lang' })
  return { stars: repo.stargazers_count }
}
```

It returns `{ stars: … }`, the repository's current star count. `httpFetch` made a request and
returned the response body, parsed from JSON. The agent did not write `await`: the VM waits for
every atom call itself.

This works here only because the page lets agents fetch from a few public APIs (GitHub is one).
Atoms that touch the world call something the host provides, and with nothing provided they
are refused. The next section shows the host's side. [Calling Atoms](/ajs-calling-atoms/) is the
chapter about atoms.

## What the transpiler produces

The transpiler turns the source into a JSON **AST** (an abstract syntax tree: the program as a
tree of plain objects), and the VM runs that. Here is `greet` as the transpiler writes it, with
the string concatenation in the third step trimmed:

```json
{
  "$ajs": 2,
  "op": "seq",
  "steps": [
    { "op": "varsImport", "keys": ["name"] },
    { "op": "if",
      "condition": { "$expr": "binary", "op": "==",
                     "left": { "$expr": "ident", "name": "name" },
                     "right": { "$expr": "literal", "value": null } },
      "then": [{ "op": "varAssign", "key": "name", "value": "World" }] },
    { "op": "varSet", "key": "message", "value": { "$expr": "binary", "op": "+", … } },
    { "op": "return", "value": { "message": { "$expr": "ident", "name": "message" } } }
  ],
  "inputSchema": { "type": "object", "properties": { "name": { "type": "string" } }, "additionalProperties": false }
}
```

What to notice:

- **`"$ajs": 2`** is the format version. The VM reads it to know how to interpret the rest.
- **`seq`** is a sequence: its `steps` run in order. Each statement became a step, and the
  parameter list became two: `varsImport` copies `name` from the input into the agent's scope,
  and the `if` step applies the default when `name` is missing. The `if` keeps the steps it runs
  in a list under `then`.
- **Declaring and assigning are different steps.** `varSet` declares a new variable (it came
  from `let message`); `varAssign` writes one that already exists (here the default overwriting
  `name`).
- **A variable is an explicit node.** Wherever the agent reads `name` or `message`, the AST
  says `{ "$expr": "ident", "name": … }`. A bare string, like `"World"` in the `varAssign`, is
  always a literal value, never a variable lookup.
- **`inputSchema`** is the input contract, derived from the parameter list: `name` is a string,
  and no other key is accepted. The VM checks the arguments against it before the first step
  runs. A mismatch comes back as an error value like any other failure, with the message
  `Input validation failed: args do not match expected schema`, followed by the first argument
  that failed and why.

### Why code travels as data

An AST is plain JSON, and that changes where and when code can run. It can be stored in a
database and run later. It can be sent to the machine where the data lives, so the data does
not have to travel to the code. It can be read and audited before it runs: every atom call is a
named step, so you can see what an agent will try to do without running it. And it can be run
by a VM that contains no parser at all: a malicious source file cannot exploit a parser that is
not there. This is the idea in the title of the AJS guide,
[AJS: Code That Travels to Data](/ajs/).

The full format is documented in [JSON AST Format](/DOCS-AJS/#json-ast-format). You do not need
it to write agents.

## Running it from a host

In your own program, running an agent takes two calls: `transpile` turns source into an AST,
and `vm.run` runs it.

```typescript
import { transpile } from 'tjs-lang/lang' // source -> AST (can run anywhere)
import { AgentVM } from 'tjs-lang/vm-ast' // runs ASTs only; no parser

const source = `
function greet({ name = 'World' }) {
  let message = \`Hello, \${name}!\`
  return { message }
}
`
const { ast } = transpile(source) // throws a SyntaxError on source it cannot read
const vm = new AgentVM()
const { result, error, fuelUsed } = await vm.run(ast, { name: 'Ada' }, { fuel: 500 })
// result: { message: 'Hello, Ada!' }, error: undefined, fuelUsed: under 1
```

`tjs-lang/vm-ast` is the VM with no parser in it; it accepts only an AST, so transpiling and
running can happen in different places. `transpile` is the step that reads source, so it is the
one that throws: on source it cannot parse, or on a construct AJS leaves out. Once you have an
AST, the VM never throws for what the agent does.

Chaining agents is the host passing one run's `result` as the next run's arguments. With an
agent `summarize({ names = [''], total = 0 })` transpiled as `summarizeAst`:

```javascript
const first = await vm.run(shortlistAst, { maxPrice: 30 })
const second = await vm.run(summarizeAst, first.result)
```

Four facts about `vm.run` shape everything that follows:

- **It returns errors as values.** A failed run comes back with `error` set, and the host
  decides what to do. [When Things Fail](/ajs-errors/) covers errors.
- **Fuel stops every run.** **Fuel** is the run's budget for work: every step costs some (a
  single expression node such as a name or a `+` costs 0.01), and when the budget is spent the
  run ends with `Out of Fuel`, so even `while (true)` stops. `greet` used under 1; the
  `shortlist` agent above uses about 5. [Limits](/ajs-limits/) covers fuel, the default budget
  and the other budgets.
- **The VM has no IO unless the host grants it.** A **capability** is something the host hands
  the VM for one run, such as a `fetch`, a store or a model client. This is how a host gives the
  `stars` agent above its network access:

  ```javascript
  const { result } = await vm.run(starsAst, {}, {
    fuel: 500,
    capabilities: {
      fetch: async (url) => (await fetch(url)).json(), // what httpFetch returns is up to you
    },
  })
  ```

  With no capabilities, `stars` ends with
  `Fetch blocked: no allowedFetchDomains configured. The host lists them in the run options, vm.run(ast, args, { context: { allowedFetchDomains: ['api.example.com'] } }), or passes a fetch capability.`
  There are two built-in fallbacks. `httpFetch` uses the platform's own `fetch` for domains the
  host lists in its run options, which is how this page runs `stars` without passing a
  capability. The store atoms use an in-memory store that lasts one run and add a warning to the
  result. [Calling Atoms](/ajs-calling-atoms/) shows which atom needs which capability, and
  [Capabilities and Custom Atoms](/ajs-capabilities/) shows how to write one.

Everything else about the host side (run options, timeouts, memory ceilings, quotas, custom
atoms) is in Part II, [Embedding the AJS VM](/ajs-host/).

## What is different from JavaScript

AJS looks like JavaScript, and most of what you write will be ordinary JavaScript. A few things
are deliberately different, and each has a chapter:

- **No `await`.** The VM awaits every atom call for you, so writing `await` is a transpile
  error. The message comes from the parser and does not mention AJS:
  `Cannot use keyword 'await' outside an async function`. See
  [Calling Atoms](/ajs-calling-atoms/).
- **Atoms take named inputs.** `storeSet({ key, value })`, never `storeSet(key, value)`; the
  transpiler refuses the positional form. See [Calling Atoms](/ajs-calling-atoms/).
- **No `throw`.** An agent raises an error by calling `Error('message')` as a statement, without
  `new`. The steps after it do not run, unless a `try`/`catch` takes the error; an uncaught one
  ends the run, and the host receives it as the run's `error`. See
  [When Things Fail](/ajs-errors/).

  ```javascript
  if (name == '') {
    Error('name required')
  }
  ```

- **No C-style `for`, `break` or `continue`.** They are frequent sources of bugs in generated
  code, and `for...of`, `while` and `if` say the same things more plainly. Loop with `for...of`
  or `while`, or with `map`, `filter` and `reduce`; to stop early, put the stop condition in the
  `while`. See [Decisions, Loops and Helpers](/ajs-control-flow/).

## The four words

- An **agent** is a function that takes one object and returns one object; in a file of
  several functions, it is the last one.
- An **atom** is a built-in operation the VM provides, called with named inputs. It is the only
  way an agent acts on the outside world.
- A **capability** is what the host grants for one run (a fetch, a store, a model) so that an
  atom can work. Without one, an atom that needs it is refused, apart from the two fallbacks
  above, both of which the host controls.
- **Fuel** is the budget for work. Every step costs some, and a run that spends it all stops.

## The rest of Part I

1. **A First Agent** (this chapter).
2. [Values and Expressions](/ajs-values/): the values an agent works with, operators, methods
   and builtins, and where AJS refuses a JavaScript coercion.
3. [Calling Atoms](/ajs-calling-atoms/): named inputs, what each common atom returns, and the
   capability each one needs.
4. [Decisions, Loops and Helpers](/ajs-control-flow/): `if`, `for...of`, `while`, callbacks and
   helper functions.
5. [When Things Fail](/ajs-errors/): raising, catching, and errors that end a run.
6. [Contracts](/ajs-contracts/): what a parameter's default or example declares, and a declared
   result.
7. [Limits](/ajs-limits/): what a run costs, and the budgets every run is held to.

The language reference is [The AJS Language](/DOCS-AJS/), and every atom is listed in the
[Atom Reference](/ajs-atoms/).
