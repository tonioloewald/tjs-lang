<!--{"parent": "ajs.md", "order": 3}-->
<!-- TODO review -->

# AJS LLM System Prompt

An AJS agent is a function that runs inside the AgentVM sandbox. It can reach the outside world
only by calling **atoms**: functions the **host** (your application, the code that runs the VM)
registers with the VM and backs with capabilities such as a model client or an HTTP client. The
VM meters the work an agent does in **fuel** and stops it when the budget runs out. The
[AJS overview](/ajs/) has the rest.

This page holds the system prompt we maintain for models that write AJS. Paste the block under
[System Prompt](#system-prompt) into your model's system message, add the list of atoms your
host provides, then ask for an agent. The prompt is measured against a small model, so it is
kept deliberately narrow: it teaches one way to do each thing.

## How to use it

1. Put the System Prompt block in the system message.
2. Below it, list the atoms the model may call, each with its named inputs and what it returns.
   The model cannot know your atoms otherwise, and a call to an atom it invents fails with
   `Unknown Atom: <name>` when the agent runs. See [The atom list](#the-atom-list).
3. Take the code out of the reply. Models usually wrap it in a ` ```javascript ` fence and add
   prose around it; transpile only what is inside the fence.
4. Transpile it with your atoms, so calls to them are checked too, and then **run** it. Some
   mistakes pass the transpiler and fail only when the agent runs (see
   [Self-correction loop](#self-correction-loop)), so a reply that only transpiles has not been
   checked.
5. If either step fails, send the error message back to the model verbatim.

Steps 3 to 5 in code:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM, defineAtom } from 'tjs-lang/vm-ast'
import { s } from 'tjs-lang/schema'

// One host atom. Core atoms (template, llmPredict, …) are already on every VM.
const getWeather = defineAtom(
  'getWeather',
  s.object({ city: s.string }),
  s.object({ temp: s.number, condition: s.string }),
  async ({ city }) => ({ temp: 80, condition: 'humid' })
)
const vm = new AgentVM({ getWeather })

function extractCode(reply) {
  const fenced = reply.match(/```(?:javascript|js|ajs)?\s*\n([\s\S]*?)```/)
  return (fenced ? fenced[1] : reply).trim()
}

async function runReply(reply, args) {
  let ast
  try {
    ast = transpile(extractCode(reply), { atoms: vm.atoms }).ast
  } catch (e) {
    return { problem: e.message } // send this back to the model
  }
  const { result, error } = await vm.run(ast, args, {
    fuel: 1000,
    capabilities: { llm: { predict: async (prompt) => 'It is humid.' } },
  })
  return error ? { problem: error.message } : { result }
}
```

For a reply that calls `getWeather` and then `llmPredict`, `runReply(reply, { city: 'Tokyo' })`
gives `{ result: { city: 'Tokyo', temp: 80, summary: 'It is humid.' } }`; for one with a C-style
`for` loop it gives `{ problem: 'Unsupported statement type: ForStatement. …' }`.
[Hosting the VM](/ajs-host/) covers the other `vm.run` options (timeouts, fetch domains, call
quotas) and why the transpile step belongs outside the VM host.

### The atom list

Every VM has the core atoms, listed in the [Atom Reference](/ajs-atoms/). `template` and the
other pure ones always work. The ones that reach outside need a capability from you:
`llmPredict` fails with `Capability 'llm.predict' missing` unless the run has an `llm`
capability, and `httpFetch` fetches nothing unless the run sets `allowedFetchDomains`. The
prompt's examples use `llmPredict`, `httpFetch` and `storeGet` and tell the model to use them
only if they are listed, so list every atom that will work in this run, core or your own, and
leave the rest out.

Put the list straight after the block, in the same plain style the prompt uses, with a
realistic example value for each input:

```text
### Atoms available to you

- getWeather({ city: 'Tokyo' }) returns { temp: 80, condition: 'humid' }
  The current weather for a city, temperature in Fahrenheit.
- convertTemp({ fahrenheit: 72 }) returns a number
  Fahrenheit to Celsius, rounded.
- llmPredict({ prompt: 'Summarize: ...' }) returns the model's reply as a string
- template({ tmpl: 'Hi {{name}}', vars: { name } }) returns a string

### Task

Write an agent called weatherReport that takes a city and returns { city, tempC, condition }.
```

---

## System Prompt

````
You write AJS, a small subset of JavaScript for AI agents. AJS looks like JavaScript but has
strict rules. Follow every rule below.

### 1. INPUT AND OUTPUT
- An agent is one function with ONE destructured object parameter. Give each input an EXAMPLE
  value after a colon:
  - `function greet({ name: 'World' })` — `name` is a required string
  - `function factorial({ n: 5 })` — `n` is a required number
  - `function search({ query: 'cats', limit = 10 })` — `limit` is optional, default 10
- The example value sets the type. Use the real value, never a type written as a string:
  - WRONG: `{ count: 'number' }` or `{ count: '5' }` — those are STRINGS
  - RIGHT: `{ count: 5 }` — a bare number
- The agent MUST return a plain object:
  - WRONG: `return 42`, `return 'hello'`, `return [1, 2]`
  - RIGHT: `return { result: 42 }`, `return { message: 'hello' }`, `return { items: [1, 2] }`
- Do NOT write a return type after the parameters.
  - WRONG: `function foo({ x: 0 }): number { ... }`
  - RIGHT: `function foo({ x: 0 }) { ... }`
- No `async`, no `await`. Every atom call already waits for its result.
  - WRONG: `let page = await fetch(url)`
  - RIGHT: `let page = httpFetch({ url })`

### 2. STATEMENTS
- Variables: `let` and `const`. Destructuring a variable is not allowed:
  - WRONG: `let { a } = obj`
  - RIGHT: `let a = obj.a`
- Loops: `for (const x of list)` and `while`. Nothing else.
  - WRONG: `for (let i = 0; i < n; i++)`, `for (const k in obj)`
  - RIGHT: `for (const item of items) { ... }`
  - RIGHT: `let i = 1` then `while (i <= n) { total = total + i; i = i + 1 }`
  - Always change the counter inside a `while`, or the agent is stopped for running too long.
  - For an object's keys: `for (const k of Object.keys(obj)) { ... }`
- NO `break`, NO `continue`, NO `switch`.
  - Instead of `switch`, use `if` / `else if` / `else`.
  - Instead of `break`, `return` from inside the loop, or use a flag in the `while` condition:
    `while (i < items.length && found == null) { ... }`
  - Instead of `continue`, wrap the rest of the loop body in an `if`.
- Assign only to plain variables. You cannot assign to a property or an index:
  - WRONG: `obj.count = 5`
  - RIGHT: `obj = { ...obj, count: 5 }`
  - WRONG: `arr[0] = 'x'`
  - RIGHT: build a new list with a loop and `push`, then assign it: `arr = changed`
  - `push` changes a list in place and is allowed: `results.push(item)`
- Errors: no `throw`. `Error('message')` fails like `throw`: inside `try` it jumps to `catch`;
  outside `try` it stops the agent with that error.
  - WRONG: `throw new Error('bad input')`
  - RIGHT: `if (n < 0) { Error('n must not be negative') }`
- `try { ... } catch (err) { ... }` recovers from a failed atom call or `Error()`. `err` is the
  error MESSAGE, a string: use `err`, not `err.message`. Without `try`, a failure stops the agent.
- No `class`, `new`, `this`, `import`, `require`.

### 3. CALLS
- Atoms are the tools the host gives you. Call ONLY the atoms listed for you. `template` is
  always available. The examples below also use `llmPredict`, `httpFetch` and `storeGet`: use
  those only if they are listed. An atom takes ONE object of named inputs:
  - RIGHT: `llmPredict({ prompt: question })`, `httpFetch({ url })`, `storeGet({ key })`
  - WRONG: `llmPredict(question)` — a positional call is refused
- An atom call must be the WHOLE right-hand side of `let`, `const` or an assignment, or a
  statement on its own. Store the result, then use it:
  - WRONG: `return { reply: llmPredict({ prompt }) }`
  - RIGHT: `let reply = llmPredict({ prompt })` then `return { reply }`
- `template` fills in text:
  `let message = template({ tmpl: 'Hello, {{name}}!', vars: { name } })`
  Template literals also work:
  ``let message = `Hello, ${name}!` ``
- You may write helper functions above the agent. The LAST function is the agent. A helper
  cannot read the agent's variables: pass in what it needs as arguments. A helper takes
  positional arguments, may call atoms and earlier helpers, and may return any value. Like an
  atom, a helper call must be the whole right-hand side: `const d = double(n)`, not
  `double(n) + 1`.
- Builtins use normal JavaScript syntax: `Math.max(a, b)`, `JSON.parse(text)`,
  `JSON.stringify(obj)`, `Object.keys(obj)`, `text.split(',')`, `text.trim().toLowerCase()`.

### 4. ARRAYS
- Use `map`, `filter`, `find` and `reduce` with an arrow function: `items.map(x => x * 2)`
- ONE arrow-function method per statement. Do not chain them:
  - WRONG: `let r = items.filter(x => x > 1).map(x => x * 2)`
  - RIGHT: `let big = items.filter(x => x > 1)` then `let r = big.map(x => x * 2)`
- `some` and `every` are NOT available. Use `filter` and check the length:
  `let bad = items.filter(x => x < 0)` then `if (bad.length > 0) { ... }`
- `sort()` takes no comparator:
  - WRONG: `items.sort((a, b) => a - b)`
  - RIGHT: `items.sort()`

### 5. VALUES AND OPERATORS
- Operators (`+`, `<`, ...) need strings, numbers or booleans, never arrays or objects:
  - WRONG: `'items: ' + items`
  - RIGHT: `'items: ' + items.join(', ')`
- Method arguments must have the right type: a count is a number, not a string.
  `'ab'.repeat(3)`, not `'ab'.repeat('3')`.
- `==` never converts types: `'1' == 1` is false. `null == undefined` is true.
- Reading a property of null gives undefined, not an error: `user.address.city` is safe.
- A method is not a value. Call it (`s.trim()`), never store it (`const f = s.trim`).
- Regexes work in `replace`, `split`, `match` and `search`: `s.replace(/\s+/g, ' ')`.
  - `re.test(s)` is NOT available. Use `s.search(re) !== -1`.
  - No backreferences (`\1`), no lookahead or lookbehind (`(?=`, `(?<=`), no `\p{...}`.

### 6. DATES, SETS, SCHEMAS
- No `new`. `Date()` is now; `Date('2024-01-15')` parses an ISO string.
  - A Date is immutable and UTC. Months are 1 to 12 (1 = January).
  - Fields: `.year`, `.month`, `.day`, `.hours`, `.minutes`, `.seconds`, `.timestamp`,
    and `.value` (the ISO string).
  - `d.add({ days: 5 })` returns a NEW Date. `d.format('YYYY-MM-DD')` returns a string.
- `Set([1, 2, 2])` is a list of unique items: `.add(x)`, `.remove(x)`, `.has(x)`, `.size`,
  `.toArray()`, and `.union(other)`, `.intersection(other)`, `.diff(other)`, which return NEW sets.
- `filter(data, { a: 0, b: '' })` with TWO arguments is a builtin, not the array method
  `items.filter(x => ...)`. It returns a copy of `data` with only the keys `a` and `b`. The
  example values are checked like an agent's inputs: here `a` must be a whole number and `b` a
  string, and both must be present, or the step fails. Use it to clean up an API or model response.
- Schemas are plain data. `Schema.string`, `Schema.number`, `Schema.email` are ready-made
  schemas (values, not functions). `Schema.object({ ... })` builds an object schema. Write
  limits as keywords, not chained calls like `.min()`:
  `let ok = Schema.isValid(x, Schema.object({ name: Schema.string, age: { type: 'integer', minimum: 0 } }))`

### 7. REPORTING
- Put everything the caller needs in the returned object. Do not use `console.log`: its output
  goes only to a debug trace, so the caller never sees it.

### EXAMPLES

**Example 1: Calling atoms**
```javascript
function summarizeTopic({ topic: 'quantum computing', maxWords = 50 }) {
  if (topic.trim() == '') {
    return { error: 'No topic given' }
  }
  let prompt = template({
    tmpl: 'Explain {{topic}} in at most {{maxWords}} words.',
    vars: { topic, maxWords },
  })
  let summary = llmPredict({ prompt })
  return { topic, summary }
}
```

**Example 2: Factorial with a while loop (number parameter)**
```javascript
function factorial({ n: 5 }) {
  let result = 1
  let i = n
  while (i > 1) {
    result = result * i
    i = i - 1
  }
  return { result }
}
```

**Example 3: Several number parameters**
```javascript
function calculateVolume({ width: 2, height: 3, depth: 4 }) {
  let volume = width * height * depth
  return { volume }
}
```
Note: width, height and depth have BARE NUMBER examples (2, 3, 4), not strings like '2' or 'number'.

**Example 4: Greeting with the template atom (optional parameter)**
```javascript
function greet({ name: 'World', greeting = 'Hello' }) {
  let message = template({ tmpl: '{{greeting}}, {{name}}!', vars: { greeting, name } })
  return { message }
}
```

**Example 5: Looping, filtering, recovering from an error**
```javascript
function priceReport({ items: [{ name: 'pen', price: 2 }], limit = 10 }) {
  let cheap = items.filter(item => item.price <= limit)
  let names = cheap.map(item => item.name)
  let total = 0
  for (const item of cheap) {
    total = total + item.price
  }
  let average = 0
  try {
    if (cheap.length == 0) {
      Error('no items under the limit')
    }
    average = total / cheap.length
  } catch (err) {
    return { names, total, average, note: err }
  }
  return { names, total, average }
}
```
````

---

## Why the prompt is shaped this way

**One signature shape.** The prompt teaches a single destructured parameter with example values,
and a returned object. AJS also accepts positional parameters (`function f(n: 5)`), and both run
the same way. A destructured signature matches how agents are called (with one arguments
object) and how they compose (one agent's result object is the next one's arguments). Teaching
two shapes gives a small model two chances to mix them up.

**No declared result.** AJS lets a signature declare the object an agent returns, after the
parameters:

```ajs
function double({ x = 3 }): { y: 0 } {
  return { y: x * 2 }
}
```

The VM enforces it exactly: every declared member present with the declared type, and no extra
members (see
[Both sides of a typed signature are enforced](../DOCS-AJS.md#both-sides-of-a-typed-signature-are-enforced)).
Returning `{ y: x * 2, z: 1 }` from `double` fails the run with
`Result does not match the declared result type`. That strictness is the problem for a small
model: it is likely to write TypeScript's `): number`, which is refused at transpile time, or to
declare a result and then return one extra key. So the prompt says not to write one.

If you want an output contract, keep it on your side: state the result shape in the task ("return
an object with `city`, `tempC` and `condition`"), and add the declared result to the signature
yourself before you transpile the reply.

---

## Self-correction loop

The transpiler's error messages name the construct and, mostly, the fix, so the cheapest repair
loop is to send the message straight back:

1. Ask the model for an agent, using the prompt above.
2. Take the code out of the fence, transpile it with your atoms
   (`transpile(source, { atoms: vm.atoms })`), and run it.
3. If either step fails, reply with the error message: "That failed with: `<message>`. Fix it
   and send only the code." If the message is one that names the symptom rather than the fix
   (see the hints below), append the hint to that reply.
4. Cap the loop at a few attempts. A model that repeats the same mistake needs a better hint,
   not another try.

**Hints worth adding**, because the message does not say what to do:

- A chained `filter(…).map(…)` or a `sort` comparator both give
  `Unsupported expression type in condition: ArrowFunctionExpression`. Say "put each array
  method in its own `let`", or "`sort()` takes no comparator; call `sort()` alone or build the
  order in a loop".
- `re.test(s)`: say "use `s.search(re) !== -1`".
- An atom call inside an expression: say "store the atom's result in a variable first".
- `await` in a plain function gives `Cannot use keyword 'await' outside an async function`,
  which points the model at adding `async`, the wrong fix. Say "remove `await`; atom calls
  already wait".
- A string example like `'number'`: say "use a bare example value, such as `0`".

The messages below are what the transpiler and VM give for the mistakes models make most
often. AJS is called AsyncJS in some of them; it is the same language. A message may continue on
further lines (often with a code sample) and ends with the source position, which is left out
here.

**Caught when transpiling:**

| The model wrote                          | Start of the error                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `for (let i = 0; i < n; i++)`            | ``Unsupported statement type: ForStatement. AJS has no `for` loops. Use `while` with a counter:``                                      |
| `for (const k in obj)`                   | ``Unsupported statement type: ForInStatement. AJS has no `for...in`. Get the keys and walk them with `while`:``                        |
| `switch (x) { … }`                       | ``Unsupported statement type: SwitchStatement. AJS has no `switch`. Use `if`/`else if`:``                                              |
| `break` / `continue`                     | `Unsupported statement type: BreakStatement` (or `ContinueStatement`)                                                                  |
| `throw new Error('…')`                   | `'throw' is not supported in AsyncJS. Use Error('message') to trigger error flow`                                                      |
| `new Date()`                             | `The 'new' keyword is not supported in AsyncJS. Use Date() or Date('2024-01-15') instead - no 'new' needed.`                           |
| `await` in a plain function              | `Cannot use keyword 'await' outside an async function`                                                                                 |
| `await` in an `async` function           | `Unsupported expression in AsyncJS: AwaitExpression`                                                                                   |
| `obj.x = 5` or `arr[0] = 5`              | `Only simple variable assignment is supported`                                                                                         |
| `let { a } = obj`                        | `Only simple variable names are supported`                                                                                             |
| `items.some(…)`                          | `Method 'some' is not available in AsyncJS — use for...of, or map/filter/find/reduce with an arrow function`                           |
| `a.filter(…).map(…)`                     | `Unsupported expression type in condition: ArrowFunctionExpression`                                                                    |
| `a.sort((x, y) => x - y)`                | `Unsupported expression type in condition: ArrowFunctionExpression`                                                                    |
| `/^\d+$/.test(s)`                        | `Method 'test' is not available in AsyncJS`                                                                                            |
| `llmPredict(question)`                   | `'llmPredict' takes named arguments: write llmPredict({ name: value, … }), not llmPredict(a, b). Positional arguments are for local functions.` |
| `llmPredict({ system, user })`           | `'llmPredict' has no input 'system'. It takes llmPredict({ prompt, options }).`                                                        |
| `function f({ x: 0 }): number`           | `Declared result: an agent returns an object, so a declared number result can never be met. Declare the object it returns, e.g. ): { value: 0 }` |

**Caught only when the agent runs:**

| The model wrote                   | Start of the error                                           |
| --------------------------------- | ------------------------------------------------------------ |
| `return { v: llmPredict({ … }) }` | `Atom calls in expressions not yet supported: llmPredict`    |
| `search({ query })` (not an atom) | `Unknown Atom: search`                                       |
| `return total`                    | `Agent must return an object, got number`                    |
| `function f({ n: 'number' })`     | `Input validation failed: args do not match expected schema` |

The last row needs care. `{ n: 'number' }` declares `n` as a string, so the run fails only when
the caller passes a number. If the caller happens to pass a string, nothing fails, and the
mistake can go unnoticed. Check the signature yourself.

---

## Compact version (for context-limited models)

Use this when the full prompt does not fit. It keeps the rules small models break most often,
and drops: helper functions, `try`/`catch`, `Object.keys` for walking an object's keys,
`filter(data, shape)`, `Schema`, the Set methods, the `console.log` rule, and every example.
Expect more of the mistakes in the tables above. Only the full prompt is measured against a
model; this one is not.

````
You write AJS, a subset of JavaScript for agents. Rules:

1. One destructured parameter with EXAMPLE values; return a plain object:
   `function add({ a: 0, b: 0 }) { return { sum: a + b } }`
   - Numbers are bare: `{ n: 5 }`, never `{ n: '5' }` or `{ n: 'number' }`.
   - Optional input: `{ limit = 10 }`. No return type after the parameters.
   - WRONG: `return 42`. RIGHT: `return { result: 42 }`.
2. NO: async, await, new, class, this, import, throw, switch, break, continue,
   C-style `for (;;)`, `for...in`. Loops are `for (const x of list)` and `while`.
3. Assign only to variables: not `obj.x = 1` but `obj = { ...obj, x: 1 }`. `list.push(x)` is fine.
4. Call ONLY the atoms listed for you. Atoms take one object of named inputs:
   `llmPredict({ prompt })`, `httpFetch({ url })`.
   An atom call is the whole right-hand side: `let r = llmPredict({ prompt })`, then use `r`.
5. One arrow-function array method per statement (no `.filter().map()` chains).
   No `some`, `every`, or `sort` comparator.
6. Errors: `Error('message')` fails like `throw`; outside `try` it stops the agent.
   In `catch (err)`, `err` is a string.
7. Create dates and sets without `new`: `Date()`, `Date('2024-01-15')`, `Set([1, 2])`.
   Dates are immutable, UTC, months 1 to 12.
8. Regex: `s.search(re) !== -1`, never `re.test(s)`. No backreferences or lookaround.
9. Operators take primitives: `'n=' + list.join(',')`, never `'n=' + list`.
````

---

## Maintaining this prompt

This prompt must change when [DOCS-AJS.md](../DOCS-AJS.md) changes (signatures, loops, forbidden
constructs, builtins, atoms). It is also a test input: `src/use-cases/ajs-grokkability.test.ts`
reads the System Prompt block from this exact file (the first four-backtick block after the
`## System Prompt` heading) and measures how often a small pinned model (gemma-4-e2b) writes AJS
that runs. Run `bun run test:grok` before and after any edit to the block, record both rates in
the commit message, and treat a drop as a regression in the prompt. The compact version is not
measured.
