<!--{"section":"ajs","type":"example","group":"llm","order":12,"requiresApi":true}-->

# LLM Structured Output

Get structured JSON from LLM (requires llm capability)

```ajs
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
