<!--{"section": "ajs", "type": "example", "group": "llm", "order": 12, "requiresApi": true, "parent": "ajs-llm.md"}-->
<!-- TODO review -->

# LLM Structured Output

Free text is hard for a program to use. Ask the model for JSON in a declared shape instead, and
an agent can pull fields out of prose, classify a message, or fill in a form.

The VM has no model of its own. The **host**, the JavaScript program that runs the VM, passes in
an `llm` capability with a `predict` function, and every `llmPredict` call goes to it. This site's
host provides no model, so the examples that call one show "This example needs an LLM, which the
static site does not provide. Run it locally with tjs-lang and LM Studio (see the AJS guide)."
instead of a result. [LLM Chat](/llm-chat/) has a ready-made host to run them locally.

The examples use three AJS built-ins: `llmPredict({ prompt, options })` sends a prompt to the
model and returns its reply as a string; `Schema` builds and checks JSON schemas; `JSON.parse`
works as in JavaScript. `llmPredict`'s `options` may contain `responseFormat` (below),
`temperature`, `maxTokens`, `topP`, `stop`, `seed`, `model` and `tools` (`max_tokens` and `top_p` are accepted as spellings too); any
other key is refused. `temperature: 0` asks the model for its most likely answer every time, which suits
extraction.

```ajs:inline
function extractInfo({
  text = 'John Smith is a 35-year-old software engineer from San Francisco who loves hiking and photography.',
}) {
  let schema = Schema.response('person_info', {
    name: '',
    age: 0,
    occupation: '',
    location: '',
    hobbies: [''],
  })
  let prompt = 'Extract the person described in this text: ' + text
  let reply = llmPredict({ prompt, options: { responseFormat: schema } })
  let person = JSON.parse(reply)
  return { person }
}
```

With a model that follows the schema, the result is:

```javascript
{
  person: {
    name: 'John Smith',
    age: 35,
    occupation: 'software engineer',
    location: 'San Francisco',
    hobbies: ['hiking', 'photography'],
  },
}
```

## What to notice

- **The schema is built from an example.** `Schema.response(name, example)` returns plain JSON,
  the OpenAI-style response format:
  `{ type: 'json_schema', json_schema: { name, strict: true, schema } }`. From the example above,
  `schema` says `name` is a string, `age` an integer, `hobbies` an array of strings, and every
  field is required.
- **`responseFormat` is passed through to the host.** `llmPredict` hands `options` to the host's
  `predict` unchanged; the host from [LLM Chat](/llm-chat/) sends it to the server as
  `response_format`. The VM checks its shape first: only the `json_schema` form above,
  `{ type: 'json_object' }` and `{ type: 'text' }` are accepted. Anything else fails the call
  with `responseFormat is not available in AsyncJS: use { type: 'json_schema', json_schema: { name, schema } } (Schema.response builds it)`
  (AsyncJS is AJS's full name). The refusal is an ordinary error: a `try` around the call
  catches it.
- **The reply is still a string.** `llmPredict` returns text, and `JSON.parse` turns it into data.
  If the reply is not JSON, `JSON.parse` fails, and with no `try` around it the agent stops
  there. `vm.run` does not throw: it resolves with `run.error` set to the parse error (for
  example `JSON Parse error: Unexpected identifier "Sure"`) and no `person`. See
  [Error Handling](/ajs-error-handling/).

## Checking the reply

The schema is a request, not a guarantee. A server that supports structured output constrains
the model to it; another may treat it as a hint or ignore it, and the model can still answer
with prose. So an agent that other code depends on parses inside `try` and validates what
it got.

`Schema.response` wraps the JSON Schema in the response format, so the schema itself is at
`schema.json_schema.schema`. `Schema.isValid(value, schema)` takes that inner schema, not the
wrapper. And unlike JavaScript, a caught error in AJS is a string (its message), which is why the
`catch` can write `'reply is not JSON: ' + e`.

```ajs:inline
function extractChecked({ text = 'Ada Lovelace, 36, mathematician, London.' }) {
  let schema = Schema.response('person', { name: '', age: 0, occupation: '' })
  let reply = llmPredict({
    prompt: 'Extract the person described in this text: ' + text,
    options: { responseFormat: schema, temperature: 0 },
  })
  try {
    let person = JSON.parse(reply)
    // the inner JSON Schema, not the response-format wrapper
    if (!Schema.isValid(person, schema.json_schema.schema)) {
      return { error: 'reply does not match the schema', person }
    }
    return { person }
  } catch (e) {
    return { error: 'reply is not JSON: ' + e, reply }
  }
}
```

The three outcomes, for three replies:

| The model replies                                                  | The agent returns                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| `{"name":"Ada Lovelace","age":36,"occupation":"mathematician"}`    | `{ person: { … } }`                                   |
| `{"name":"Ada Lovelace","age":"36","occupation":"mathematician"}` | `{ error: 'reply does not match the schema', person }` |
| `Sure! Here is the JSON`                                           | `{ error: 'reply is not JSON: …', reply }`            |

The second reply differs from the first only in `"36"`: the age is a string, and the schema says
integer.

Validation costs **fuel**, the VM's work budget: the host sets it for each run, every step
spends some, and the run stops with `Out of Fuel` when it is gone. Validation costs in proportion
to the size of the schema times the size of the data, which is small next to the `llmPredict`
call itself (about 100 fuel). [Fuel Limits](/fuel-limits/) shows a run hitting its budget.

A schema built from an example lists every field as required but does not forbid extra ones: a
reply with an added `notes` field passes `isValid`. To refuse extra fields, build the object with
`Schema.object`, which takes the same kind of example and adds `additionalProperties: false`,
and pass the result to `Schema.response`:

```ajs:inline
function strictPerson({}) {
  let schema = Schema.response(
    'person',
    Schema.object({ name: '', age: 0, occupation: '' })
  )
  let reply = { name: 'Ada Lovelace', age: 36, occupation: 'mathematician', notes: 'x' }
  return { ok: Schema.isValid(reply, schema.json_schema.schema) }
}
```

This returns `{ ok: false }`; without the `notes` field it would be `{ ok: true }`.

## Classifying

A fixed set of answers is an `enum`. An example value cannot say "one of these four strings", so
put a schema value in the example at that spot, and fall back to a safe default when the reply
does not fit:

```ajs:inline
function classify({ ticket = 'The app crashes every time I open the settings page.' }) {
  let schema = Schema.response('triage', {
    category: Schema.enum(['bug', 'billing', 'feature', 'other']),
    urgent: false,
    summary: '',
  })
  let reply = llmPredict({
    prompt:
      'Triage this support ticket. Summarize it in one sentence.\n\n' + ticket,
    options: { responseFormat: schema, temperature: 0 },
  })
  try {
    let triage = JSON.parse(reply)
    if (Schema.isValid(triage, schema.json_schema.schema)) {
      return { triage }
    }
  } catch (e) {}
  return { triage: { category: 'other', urgent: false, summary: ticket } }
}
```

`Schema.enum([...])` becomes `{ type: 'string', enum: [...] }`, so a reply with
`"category": "crash"` fails validation and the agent returns the fallback instead of an
unexpected category. The fallback puts the whole ticket in `summary` on purpose: when the model's
answer is unusable, the raw text is kept for a person to read, so nothing is lost.

### Schema values you can put in an example

Anywhere an example takes a value, a schema value can stand in for it:

- **Ready-made schemas, used without a call:** `Schema.string`, `Schema.number`,
  `Schema.integer`, `Schema.boolean`, `Schema.email` and the other named formats. Each is
  already a plain JSON schema: `Schema.number` is `{ type: 'number' }`, `Schema.email` is
  `{ type: 'string', format: 'email' }`.
- **Builders, called with arguments:** `Schema.enum([...])`, `Schema.const(value)`,
  `Schema.object({ ... })`, `Schema.array(item)` and a few more.
- **A plain JSON Schema object**, for constraints no builder covers:
  `{ type: 'integer', minimum: 0, maximum: 150 }`.

The full list is under Schema in the [AJS guide](/DOCS-AJS/).

## Fractional numbers: use `Schema.number`

`price: 0.0` in a `Schema.response` example gives an **integer** schema, so a model held to it
cannot answer `19.99`. For a field that may hold a fraction (a price, a score, a confidence),
write `Schema.number`.

The reason: in an agent's own parameters, `0.0` means "a number that may be fractional" and `0`
means "an integer", because the transpiler reads the example from the source text, where the two
are written differently. `Schema.response` runs inside the VM and receives a value, not source
text, and `0.0` and `0` are the same number, so both mean integer there.

```ajs:inline
// An agent always takes one object of named inputs; this one needs none.
function priceSchemas({}) {
  let fromExample = Schema.response('item', { name: '', price: 0.0 })
  let explicit = Schema.response('item', { name: '', price: Schema.number })
  return {
    fromExample: fromExample.json_schema.schema.properties.price,
    explicit: explicit.json_schema.schema.properties.price,
  }
}
```

This returns `{ fromExample: { type: 'integer' }, explicit: { type: 'number' } }`. A
non-integer example, such as `0.5`, also gives `{ type: 'number' }`.

With the integer schema, a server that enforces it will not let the model write `19.99`, and
`Schema.isValid` refuses a `19.99` that gets through anyway.

## Which schema keywords are allowed

A schema the agent builds is **guest** data: it comes from the agent, which may be untrusted, so
the VM checks it before using it. It admits only keywords it can check while metering the work:
`type`, `properties`, `required`, `items`, `additionalProperties`, `enum`, `const`, `anyOf`,
`oneOf`, the numeric and length bounds (`minimum`, `maxLength`, and so on), `format` with one of
`email`, `uuid`, `uri`, `ipv4`, `date`, `date-time` or `emoji`, and the annotation keywords
`title`, `description`, `default` and `examples`. The full list is under Schema in the
[AJS guide](/DOCS-AJS/).

`pattern` is refused. Checking it would run the host's regex engine, which the VM does not meter,
so a hostile pattern could hang the host. The message says so and names the replacement:

```text
This schema is not available in AsyncJS (.properties.z.pattern: a 'pattern' is compiled by the host's regex engine). Guest schemas may use only the validation keywords the VM admits; for a pattern, use regexMatch (it runs on the VM's regex engine).
```

Like the `responseFormat` refusal, this is an ordinary error, and a `try` around the call that
used the schema (`Schema.isValid` here) catches it.

To check a field against a pattern, parse the reply and test the field with
`regexMatch({ pattern, value })`, which runs on the VM's own regex engine and returns `true` or
`false`:

```javascript
let order = JSON.parse(reply)
let codeOk = regexMatch({ pattern: /^[A-Z]{2}-\d{4}$/, value: order.code }) // true for 'AB-1234'
```

## Testing an agent without a model

Capabilities are the only way an agent reaches the outside world, and the VM calls
`capabilities.llm.predict(prompt, options)` for every `llmPredict({ prompt, options })`: the
agent's one object becomes two positional arguments. So a host can stand in for the model with a
`predict` that returns a canned reply. That makes the checking code above testable without a
server, and shows exactly what the agent sent:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const sent = []
const llm = {
  async predict(prompt, options) {
    sent.push({ prompt, options })
    return '{"name":"Ada Lovelace","age":"36","occupation":"mathematician"}'
  },
}

const source = `
function extractChecked({ text = 'Ada Lovelace, 36, mathematician, London.' }) {
  let schema = Schema.response('person', { name: '', age: 0, occupation: '' })
  let reply = llmPredict({
    prompt: 'Extract the person described in this text: ' + text,
    options: { responseFormat: schema, temperature: 0 },
  })
  try {
    let person = JSON.parse(reply)
    if (!Schema.isValid(person, schema.json_schema.schema)) {
      return { error: 'reply does not match the schema', person }
    }
    return { person }
  } catch (e) {
    return { error: 'reply is not JSON: ' + e, reply }
  }
}
`

const { ast } = transpile(source)
// {} passes no inputs, so the agent uses its default `text`
const run = await new AgentVM().run(ast, {}, { fuel: 1000, capabilities: { llm } })
console.log(run.result) // { error: 'reply does not match the schema', person: { … } }
console.log(sent[0].options.responseFormat.json_schema.schema.properties.age) // { type: 'integer' }
```

If the run itself fails (out of fuel, a missing capability, an error nothing caught), `run.error`
holds the failure. Each `llmPredict` call costs about 100 fuel and this run uses about 101, so
1000 is generous for one call; budget for the number of model calls an agent makes, or a run
with 50 fuel stops with `Out of Fuel` at its first `llmPredict`.
