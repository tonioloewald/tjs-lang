<!--{"section": "ajs", "type": "example", "group": "basics", "order": 5, "parent": "ajs-basics.md"}-->

# JSON Processing

Parse and stringify JSON

<!-- TODO review -->
JSON is the agent's native format: APIs return it, models are asked to produce it, and an
agent's result is JSON data. `JSON.parse` and `JSON.stringify` work as in JavaScript.

```ajs:inline
function jsonRoundTrip({ data = { name: 'Alice', age: 30 } }) {
  let jsonStr = JSON.stringify(data)
  let parsed = JSON.parse(jsonStr)
  let name = parsed.name
  return { jsonStr, parsed, name }
}
```

<!-- TODO review -->
## What to notice

- **`JSON.stringify` is how an object becomes text.** `'data: ' + data` is an error in AJS;
  `'data: ' + JSON.stringify(data)` says what you mean. The two-argument and indented forms,
  `JSON.stringify(data, null, 2)`, work too.
- **Reading a missing field is safe.** Member access is null-safe: `parsed.address.city` is
  `undefined` when there is no `address`, where JavaScript would throw.

<!-- TODO review -->
## A variation

Text from outside (a model's answer, a form field) may not be JSON at all. A failed
`JSON.parse` is an error value you can catch:

```ajs:inline
function readConfig({ raw = '{"user":{"name":"Ann","roles":["admin","dev"]}}' }) {
  try {
    let config = JSON.parse(raw)
    let roles = config.user.roles ?? []
    return { name: config.user.name, isAdmin: roles.includes('admin') }
  } catch (err) {
    return { error: 'not JSON: ' + err }
  }
}
```

Change `raw` to `'{oops'` and run it again: you get the parser's message instead of a result.

<!-- TODO review -->
## The gotcha

In a `catch`, `err` is the error's **message**, a string. It is not an `Error` object, so
`err.message` is `undefined`. Use `err` itself.
