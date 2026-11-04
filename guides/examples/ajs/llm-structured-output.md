<!--{"section": "ajs", "type": "example", "group": "llm", "order": 12, "requiresApi": true, "parent": "ajs-llm.md"}-->

# LLM Structured Output

Get structured JSON from LLM (requires llm capability)

<!-- TODO review -->
Free text is hard for a program to use. Ask the model for JSON in a declared shape instead, and
an agent can extract fields from prose, classify, or fill a form. It needs an LLM, so on this site
it prints a message instead of running; run it locally with the host from
[LLM Chat](/llm-chat/).

```ajs:inline
function extractInfo({
  text = 'John Smith is a 35-year-old software engineer from San Francisco who loves hiking and photography.',
}) {
  // Schema.response builds responseFormat from an example
  let schema = Schema.response('person_info', {
    name: '',
    age: 0,
    occupation: '',
    location: '',
    hobbies: [''],
  })

  let prompt = 'Extract person info from this text: ' + text
  let response = llmPredict({ prompt, options: { responseFormat: schema } })
  let person = JSON.parse(response)
  return { person }
}
```

<!-- TODO review -->
## What to notice

- **The schema is built from an example.** `Schema.response('person_info', { name: '', age: 0, … })`
  returns plain JSON: an OpenAI-style `response_format` with a strict JSON Schema inside, with
  `name` a string, `age` an integer and `hobbies` an array of strings.
- **The answer is still a string.** `llmPredict` returns text; `JSON.parse` turns it into data.
- **The schema is a request, not a guarantee.** Servers that support structured output follow it
  closely; others treat it as a hint. Parse inside `try`, and check the result before you rely on
  it.

<!-- TODO review -->
## A variation

Validate what came back, and say so in the result:

```javascript
function extractChecked({ text = 'Ada Lovelace, 36, mathematician, London.' }) {
  let schema = Schema.response('person', { name: '', age: 0, occupation: '' })
  let response = llmPredict({ prompt: 'Extract: ' + text, options: { responseFormat: schema } })
  try {
    let person = JSON.parse(response)
    let valid = Schema.isValid(person, schema.json_schema.schema)
    return { person, valid }
  } catch (err) {
    return { error: 'model did not return JSON', raw: response }
  }
}
```

<!-- TODO review -->
## The gotchas

- **An example value of `0` means integer.** In AJS, `0.0` is the same number as `0`, so it also
  means integer. For a field that may hold a fraction (a price, a score), write the schema
  explicitly: `Schema.object({ price: Schema.number })`.
- **A guest schema is a closed dialect.** It may use `type`, `properties`, `items`, `enum`, the
  numeric and length bounds and a few more keywords, but not `pattern`: a pattern would run on the
  host's regex engine. Check a string's format in the agent with a regex instead.
