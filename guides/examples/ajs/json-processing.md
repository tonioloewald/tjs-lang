<!--{"section":"ajs","type":"example","group":"basics","order":5}-->

# JSON Processing

Parse and stringify JSON

```ajs
function jsonRoundTrip({ data = { name: 'Alice', age: 30 } }) {
  let jsonStr = JSON.stringify(data)
  let parsed = JSON.parse(jsonStr)
  let name = parsed.name
  return { jsonStr, parsed, name }
}
```
