<!--{"parent": "writing-agents.md", "order": 6}-->
<!-- TODO review -->

# Contracts

An agent is called by a program that did not write it, often with arguments a model made up.
So an agent states two things: what it accepts and what it returns. Its parameters are the first
promise and a declared result is the second. The VM checks the parameters on every run, and
checks the result whenever the agent declares one. The host does not have to trust the agent to
check its inputs, and the agent does not have to trust the host to send the right ones.

This chapter shows how to write both contracts, how a host reads them, and how to use `Schema`
inside an agent to check data that arrives while it runs. The full rules are in
[the language guide](/DOCS-AJS/#inputoutput-contract).

## The parameters are the input contract

An agent's source is a list of function declarations, and the **last** one is the **entry
function**: the one the VM calls with the run's arguments. Any functions before it are helpers
([Decisions, Loops and Helpers](/ajs-control-flow/#helper-functions)). The entry's parameters
are the agent's input contract.

Here is an agent that prices a line on an order. Each example on this page runs with the
arguments given in the text beside it, and an example with no arguments listed runs with none.
How a program passes arguments to an agent is covered in
[Embedding the VM](/embedding-the-vm/).

```ajs:inline {"args": {"item": "mug", "price": 8.5, "qty": 2}}
function quote({ item: 'kettle', price: 40.0, qty = 1 }) {
  return { line: item + ' x' + qty, total: price * qty }
}
```

With `{ item: 'mug', price: 8.5, qty: 2 }` this returns `{ line: 'mug x2', total: 17 }`.

Now call the same agent with a price that is not a number, `{ item: 'mug', price: 'cheap' }`:

```ajs:inline {"args": {"item": "mug", "price": "cheap"}}
function quote({ item: 'kettle', price: 40.0, qty = 1 }) {
  return { line: item + ' x' + qty, total: price * qty }
}
```

The page shows the run's error, `Input validation failed: args do not match expected schema`,
followed by the first argument that failed and why, in parentheses (for example
`(price: Expected number)`).
The VM compared the arguments with the parameters **before** the agent ran, and the agent's
first line never executed, and no fuel was spent, because no step ran. The same refusal comes back for a missing `item`, for no arguments at all, and for
an argument the agent does not declare.

The message does not say which field was wrong. If your host needs to tell its caller, it can
check the arguments against the agent's input schema itself; see
[How a host reads the contract](#how-a-host-reads-the-contract).

## Example or default

Each parameter takes one of three forms:

| Parameter        | Meaning                                                 |
| ---------------- | ------------------------------------------------------- |
| `item: 'kettle'` | required; the value must be a string, like the example  |
| `qty = 1`        | optional; defaults to `1`, and must be an integer       |
| `input`          | required; any value                                     |

The colon form gives an **example**: `item: 'kettle'` means "a string, for instance `'kettle'`".
The `=` form gives a **default**, and the default's type is the type the parameter accepts:
`quote` above refuses `{ item: 'mug', price: 3, qty: 'two' }` just as it refuses a bad price.
A default is read the same way an example is, so `rate = 25.0` accepts any number, as
`rate: 25.0` does. A bare name such as `input` (written `function checkUser({ input })`) must be
present but accepts any JSON value, `null` included. Unlike JavaScript, leaving it out is not
allowed.

There is no way yet to declare an optional parameter that has a type but no default.
`note: '' | undefined` in a parameter list is read as a **required** string, and the
`| undefined` is ignored. The nearest you can write is `note = null`: optional, but it accepts
any value, so check it yourself.

The entry function's parameters are always named arguments. You may write them positionally,
`function add(a: 2, b: 3)`, and the agent still reads `{ a, b }` from one object, but
destructured is the convention because it reads as what the caller actually passes.

> **A colon in a parameter is not JavaScript renaming.** In JavaScript, `{ a: x }` in a
> parameter renames `a` to `x`, and `{ a: 0 }` is a syntax error. In AJS, `{ a: 0 }` means
> "required argument `a`, and `0` is an example of it": an integer. Nor is the example a
> TypeScript literal type: `item: 'kettle'` accepts any string, not only `'kettle'`.

The language guide has the full table of
[what an example accepts](/DOCS-AJS/#parameters-are-the-input-contract). Three of its rows
catch people out.

**A whole number is an integer.** `40` declares an integer, so a fraction is refused:

```ajs:inline {"args": {"hours": 8.5, "rate": 20}}
function pay({ hours: 40, rate: 25.0 }) {
  return { wage: hours * rate }
}
```

Called with `{ hours: 8.5, rate: 20 }`, this run is refused, because `8.5` is not an integer.
Write the example as `40.0` and the same arguments return `{ wage: 170 }`. `rate: 25.0` accepts
any number, whole or not, so `20` was never the problem.

**`+0` is a non-negative integer**, and **a union of string literals is an exact list**:

```ajs:inline {"args": {"attempts": 3, "level": "high"}}
function retry({ attempts: +0, level: 'low' | 'high' }) {
  return { attempts, level }
}
```

This returns `{ attempts: 3, level: 'high' }`. `attempts: -1` is refused, and so is
`level: 'mid'`: `'low' | 'high'` allows those two strings and nothing else, like an enum.

That rule needs two or more string literals joined with `|`. A single example keeps its "any
value of this type" meaning, even when it is joined with `| undefined`: `note: '' | undefined`
in a declared result (below) is any string, or absent. Likewise `true` or `false` as an example
means any boolean, not that exact value.

### Type names

If you come from TypeScript, you may write a type name instead of an example. The names AJS knows
are `string`, `number` (any number, like `0.0`), `boolean`, `object`, `any`, and three numeric
names TypeScript lacks: `int` (an integer, like `0`), `unsigned` or `uint` (a non-negative
integer, like `+0`) and `float` (the same as `number`):

```ajs:inline {"args": {"n": 2.5}}
function half({ n: number }) {
  return { half: n / 2 }
}
```

This returns `{ half: 1.25 }`. The example form is the idiom, because the example also documents
the parameter and shows up in the agent's signature.

A name AJS does not know, such as `integer` or `array`, is not read as a type, and the parameter
is dropped from the contract altogether. So `function f({ a: integer }) { return { a } }` fails
to transpile with `'a' is not defined`: the message names the parameter, not the type, because
`a` is no longer a parameter. The fix is `int`, or an example such as `0`.

### Undeclared arguments

When an agent declares any parameter, an argument it does not declare is refused:
`{ item: 'mug', price: 3, colour: 'red' }` does not reach `quote`. An agent with no parameters
at all accepts any arguments and ignores them:

```ajs:inline {"args": {"anything": 1, "at": "all"}}
function hello() {
  return { message: 'hello' }
}
```

Called with `{ anything: 1, at: 'all' }`, this returns `{ message: 'hello' }`.

## The entry returns an object

An agent's result is one object, so a host can always read fields from it and one agent's
output can be the next one's input. Returning anything else ends the run:

```ajs:inline
function five() {
  return 5
}
```

The page shows `Agent must return an object, got number`. Return `{ value: 5 }` instead.

There are two exceptions, both for an agent that returns no value. A bare `return` gives `{}`.
Falling off the end of the function, with no `return` at all, succeeds with no result: the host
receives nothing, not even `{}`. So end every agent with a `return` of the object you mean.
When the agent declares a result (next section), both of these fail the check, because neither
has the declared members.

## The declared result is the output contract

Write the shape of the result after the parameters, the way you write a parameter's example:

```ajs:inline
function score({ n = 12 }): { score: 0, label: 'low' | 'high' } {
  return { score: n, label: n > 10 ? 'high' : 'low' }
}
```

This returns `{ score: 12, label: 'high' }`. Each member reads like a parameter: `score: 0` is
any integer, and `label` is one of two strings. Now make a mistake in the agent:

```ajs:inline {"args": {"n": 4}}
function score({ n = 12 }): { score: 0, label: 'low' | 'high' } {
  return { score: n, label: n > 10 ? 'high' : 'medium' }
}
```

The run ends with `Result does not match the declared result type`, because `'medium'` is not
one of the declared labels. The agent did all its work, but the host gets an error instead of a
result it was not promised.

The rules:

- **Every declared member must be present**, with its declared type, and **no other member may
  appear**. `{ score: 3 }` fails (no `label`), and so does `{ score: 3, label: 'low', debug: 1 }`.
- **A member that may be absent says so** with `| undefined`; there is an example below.
- **Returning nothing** when a result is declared fails, whether by a bare `return` or by falling
  off the end.
- **A failed run reports its own failure.** If the agent fails before it returns, the host gets
  that error, not a contract error.
- **The check costs fuel**, paid from what the run has left, in proportion to the size of the
  result and the declared shape. A run with too little left ends `Out of Fuel`.
- **The declared result must be an object.** An agent returns an object, so `): 0` could never
  be met, and the transpiler refuses it: `Declared result: an agent returns an object, so a
  declared integer result can never be met. Declare the object it returns, e.g.
  ): { value: 0 }`.
- **No declared result, no check.**

Here `note` is declared as `'' | undefined`, so the agent may leave it out:

```ajs:inline {"args": {"text": "hi"}}
function check({ text = 'hello' }): { ok: true, note: '' | undefined } {
  if (text.length > 3) {
    return { ok: true }
  }
  return { ok: false, note: 'too short' }
}
```

With `text: 'hi'` this returns `{ ok: false, note: 'too short' }`. With the default, `'hello'`, it
returns `{ ok: true }`. Both meet the contract.

`ok: true` is any boolean, so `ok: false` meets it too.

One gap in the "every declared member must be present" rule today: a member declared as a union
of strings (`label: 'low' | 'high'` above) that the agent sets to `undefined` passes the check,
and the key is missing from the result. Members of other types are caught.

### Only the entry is checked

A helper function may declare a return too, but it is **not enforced yet**:

```ajs:inline
function shout(text): '' {
  return 5
}

function main() {
  let got = shout('hi')
  return { got }
}
```

This returns `{ got: 5 }`, although `shout` says it returns a string. Do not rely on a helper's
declared return; check the value yourself, or let the entry's declared result catch it on the
way out. (In TJS a return annotation is a tested example. AJS reads it and does nothing with it
for now.)

## How a host reads the contract

Both contracts travel in the AST, as JSON Schema. `transpile` returns them on `ast`, along with
a `signature` built from the same source:

```typescript
import { transpile } from 'tjs-lang/lang'

const { ast, signature } = transpile(`
/**
 * Label a sensor reading as low or high.
 * @param sensor - which sensor took the reading
 * @param n - the reading
 */
function score({ sensor: 'kitchen', n = 12 }): { sensor: '', score: 0, label: 'low' | 'high' } {
  return { sensor, score: n, label: n > 10 ? 'high' : 'low' }
}`)

console.log(ast.inputSchema)
// { type: 'object',
//   properties: { sensor: { type: 'string' }, n: { type: 'integer' } },
//   required: ['sensor'],
//   additionalProperties: false }

console.log(ast.outputSchema)
// { type: 'object',
//   properties: { sensor: { type: 'string' }, score: { type: 'integer' },
//                 label: { enum: ['low', 'high'] } },
//   required: ['sensor', 'score', 'label'],
//   additionalProperties: false }

console.log(signature.description) // 'Label a sensor reading as low or high.'
console.log(signature.parameters.sensor)
// { name: 'sensor', type: { kind: 'string' }, required: true,
//   default: null, example: 'kitchen', description: 'which sensor took the reading' }
console.log(signature.parameters.n)
// { name: 'n', type: { kind: 'integer' }, required: false,
//   default: 12, example: 12, description: 'the reading' }
```

`required` lists only the colon parameters, and `additionalProperties: false` is the "no
undeclared arguments" rule. In `signature`, the colon parameter `sensor` is required and its
example is `'kitchen'`; the defaulted `n` is optional, and its default is reported as its
example too. The JSDoc summary and each `@param` description land there as well. This is what a
host turns into a tool a model can call; see [Agents as tools](/ajs-host/#agents-as-tools).

Because the contract is part of the AST, it is enforced by whatever VM runs the AST, wherever it
was transpiled. The contract is where the
agent's author hands over to the host: the author writes it, and the host can read it before
deciding whether to run the agent.

## Schema as data inside an agent

The parameters check what arrives at the start of a run. Data that arrives during the run, from
`httpFetch` or a model, needs checking too. `Schema` builds JSON schemas for that, and in an
agent a schema is plain data you can pass around, return and inspect:

```ajs:inline {"args": {"input": {"email": "ada@example.com", "age": 36, "role": "admin"}}}
function checkUser({ input }) {
  let user = Schema.object({
    email: Schema.email,
    age: { type: 'integer', minimum: 0, maximum: 150 },
    nickname: { type: ['string', 'null'] },
    role: Schema.enum(['admin', 'user', 'guest']),
  })
  return { ok: Schema.isValid(input, user) }
}
```

Called with `input: { email: 'ada@example.com', age: 36, role: 'admin' }`, this returns
`{ ok: true }`; with `email: 'not-an-email'` it returns `{ ok: false }`.

The example mixes three ways of writing a schema, and they are interchangeable, because a schema
is plain data:

- **A ready-made schema**, a value you use without calling it: `Schema.email`, and likewise
  `Schema.string`, `Schema.number` and the rest.
- **A function that builds one**: `Schema.object({…})`, `Schema.enum([…])`, and also `array`,
  `record`, `union`, `tuple`, `const`, `fromExample` and `response`.
- **A JSON Schema written out**, such as `{ type: 'integer', minimum: 0, maximum: 150 }`.

[Schema](/DOCS-AJS/#schema) in the language guide lists them all. `Schema.object` makes every
field required and refuses fields it does not list. A guest schema has no `.optional`, so a
field whose type includes `'null'`, as `nickname` does, is how `Schema.object` marks a field the
data may leave out (or set to `null`).

**An example works wherever a schema is expected**, read the way a parameter example is, with
one exception for numbers.

> **`0.0` in an agent's body is an integer.** Inside the body an example is an ordinary value,
> and `0.0` is the number 0, so `{ price: 0.0 }` in a schema position means an **integer** price
> and silently refuses `1.5`. For any number, write `Schema.number` or `{ type: 'number' }`.

`Schema.fromExample` shows the schema an example stands for:

```ajs:inline {"args": {"input": {"name": "Ada", "age": 36}}}
function checkPerson({ input }) {
  return {
    ok: Schema.isValid(input, { name: '', age: 0 }),
    shape: Schema.fromExample({ name: '', age: 0 }),
  }
}
```

Called with `input: { name: 'Ada', age: 36 }`, this returns `ok: true` and
`shape: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'integer' } },
required: ['name', 'age'] }`.

Unlike `Schema.object`, an example schema has no `additionalProperties: false`, so it allows
extra keys: `Schema.isValid({ name: 'Ada', age: 36, x: 1 }, { name: '', age: 0 })` is `true`.
To drop the extra keys rather than allow them, use `filter` (below).

**There is no builder chaining.** `Schema.string.min(3)` ends the run with `'min' is not a
function`. Write the keyword: `{ type: 'string', minLength: 3 }`.

**A guest schema is a closed dialect.** It may use only the keywords listed under
[Schema](/DOCS-AJS/#schema) in the language guide, and `pattern` is not one of them. A schema
library checks `pattern` with JavaScript's own regex engine, outside the VM, where a badly
shaped pattern can take seconds or hang on a long string and none of that time is charged as
fuel. Instead, validate the structure first, then match the field with the atom `regexMatch`
(called with named inputs, as in [Calling Atoms](/ajs-calling-atoms/)), which runs on the VM's
own regex engine and is metered:

```ajs:inline {"args": {"input": {"code": "AB-12"}}}
function checkCode({ input }) {
  let ok = Schema.isValid(input, { code: '' })
  if (!ok) return { ok: false }
  let shaped = regexMatch({ pattern: /^[A-Z]{2}-\d{2}$/, value: input.code })
  return { ok: shaped }
}
```

With `input: { code: 'AB-12' }` this returns `{ ok: true }`; `{ code: 'ab12' }` and `{}` give
`{ ok: false }`.

Validation costs fuel in proportion to the size of the schema times the size of the data, so a
large schema over a large response is a real cost. [Limits](/ajs-limits/) covers budgets.

### Cleaning a response with `filter`

An API or a model often returns more than you asked for. The builtin `filter`, called with two
arguments, keeps only the keys of an example and checks their types as it goes. (This is not the
array method `items.filter((x) => …)`, which takes one callback.)

```ajs:inline {"args": {"reply": {"name": "Ada", "age": 36, "debug": true, "_raw": "x"}}}
function clean({ reply }) {
  let person = filter(reply, { name: '', age: 0 })
  return { person }
}
```

Called with `reply: { name: 'Ada', age: 36, debug: true, _raw: 'x' }`, this returns
`{ person: { name: 'Ada', age: 36 } }`. Nested objects and arrays are filtered the
same way. When the data does not fit the example, the step fails with a message that names the
field. Each message starts with the path to the object or field that has the problem, and
`root` is the top level: `age: Expected integer` for `age: 'thirty-six'`, and
`root: Missing age` when `age` is absent, because the top-level object is the one missing it.
(For an example `{ p: { age: 0 } }`, a missing `age` is reported as `p: Missing age`.) That
failure can be caught, which suits data from outside:

```ajs:inline {"args": {"reply": {"name": "Ada"}}}
function clean({ reply }) {
  try {
    let person = filter(reply, { name: '', age: 0 })
    return { person }
  } catch (e) {
    return { person: null, problem: e }
  }
}
```

Called with `reply: { name: 'Ada' }`, this returns
`{ person: null, problem: 'root: Missing age' }`. In AJS the value a `catch` receives is the
error's message, a string, not an `Error` object; [When Things Fail](/ajs-errors/) covers
catching.

### Structured output from a model

`Schema.response(name, shape)` wraps a schema in the format a model's `responseFormat` option
takes:

```ajs:inline
function format() {
  return { format: Schema.response('person', { name: '', age: 0 }) }
}
```

This returns
`{ format: { type: 'json_schema', json_schema: { name: 'person', strict: true, schema: … } } }`,
where `schema` is the same object schema `fromExample` built above.
[Calling Atoms](/ajs-calling-atoms/#asking-a-model) shows how to pass it to `llmPredict`, and
[LLM Structured Output](/llm-structured-output/) is a worked example. A model can still return
something else, so check the parsed reply with `filter` or `Schema.isValid` before you use it.

## Contracts at the edges

Inside an agent, member access is null-safe: a typo such as `forecast.sumary` reads as
`undefined` instead of failing ([Values and Expressions](/ajs-values/#member-access-is-null-safe)).
A declared result notices what that hides:

```ajs:inline
function report({ city = 'Oslo' }): { city: '', summary: '' } {
  let forecast = { city, summary: 'Cold and clear' }
  return { city, summary: forecast.sumary }
}
```

Without the declared result this agent would return `{ city: 'Oslo' }` and the host would find
out later, if at all. With it, the run ends with `Result does not match the declared result
type`. The parameters do the same at the other end, refusing bad arguments before any work is
done.

A note if a model writes your agents: the [LLM system prompt](/ajs-llm-prompt/) tells it **not**
to declare a result, on purpose. A small model tends to write TypeScript's `): number`, which is
refused, or to declare a result and then return one extra key, which fails the run. The prompt's
advice is to keep the output contract on your side: state the shape in the task, and attach the
result schema yourself. The contract travels in the AST as `outputSchema`, so a host can set it
on the transpiled agent before running it, and the VM then checks the result as if the agent had
declared it:

```javascript
const { ast } = transpile(modelSource)
ast.outputSchema = {
  type: 'object',
  properties: { city: { type: 'string' }, tempC: { type: 'number' } },
  required: ['city', 'tempC'],
  additionalProperties: false,
}
```

[Embedding the VM](/embedding-the-vm/) covers transpiling and running on the host side.
