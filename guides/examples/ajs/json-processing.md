<!--{"section": "ajs", "type": "example", "group": "basics", "order": 5, "parent": "ajs-basics.md"}-->
<!-- TODO review -->

# JSON Processing

JSON is what agents mostly handle: APIs return it, models are asked to produce it, and an
agent returns an object of plain data to its host (see
Input/Output Contract in [the AJS reference](/DOCS-AJS/)). `JSON.parse` and
`JSON.stringify` work as in JavaScript.

An agent's inputs are its destructured parameters. The defaults are what the example runs with
on this page; edit them and run it again to try other input.

```ajs:inline
function jsonRoundTrip({ data = { name: 'Alice', age: 30 } }) {
  let jsonStr = JSON.stringify(data)
  let parsed = JSON.parse(jsonStr)
  let name = parsed.name
  let city = parsed.address.city ?? 'unknown'
  return { jsonStr, parsed, name, city }
}
```

The result is
`{ jsonStr: '{"name":"Alice","age":30}', parsed: { name: 'Alice', age: 30 }, name: 'Alice', city: 'unknown' }`.

## What to notice

- **Reading a missing field is safe.** Member access is null-safe: `parsed.address.city` is
  `undefined` when there is no `address`, where JavaScript would throw. That is why `city` comes
  out as `'unknown'` rather than ending the run.
- **`JSON.stringify` is how an object becomes text.** `'data: ' + data` fails when it runs, with
  `'+' needs a string, number, boolean or null, not an object`, and so does the template
  `` `data: ${data}` ``. AJS does not turn an object into text behind your back: that conversion
  can build a string of any size, and the VM only does work it can charge for. Write
  `'data: ' + JSON.stringify(data)` instead. The indented form, `JSON.stringify(data, null, 2)`,
  works too.

## When the text may not be JSON

Text from outside (a model's answer, a form field) may not be JSON at all. A failed
`JSON.parse` is an error you can catch with `try`/`catch`.

In a `catch`, `err` is the error's **message**, a string, not an `Error` object, so
`err.message` is `undefined`; use `err` itself. Errors reach an agent only as plain text, so no
host object (and none of its properties) crosses into the program. The message is all there is
to read.

```ajs:inline
function readConfig({ raw = '{"user":{"name":"Ann","roles":["admin","dev"]}}' }) {
  try {
    let config = JSON.parse(raw)
    let roles = config.user.roles ?? []
    return { name: config.user.name, isAdmin: roles.includes('admin') }
  } catch (err) {
    return { error: err }
  }
}
```

The result is `{ name: 'Ann', isAdmin: true }`. The `?? []` line is the null-safe read at work:
with `raw` set to `'{"user":{"name":"Bo"}}'` there are no roles, and the result is
`{ name: 'Bo', isAdmin: false }`.

Change `raw` to `'{oops'` and you get `{ error: ... }` holding the parser's message. The wording
comes from the JavaScript engine running the VM, so it differs between browsers and runtimes
(Bun says `JSON Parse error: Expected '}'`). Show it, but do not match on its text.

Without the `try`, a failed parse ends the run: nothing after it runs, and `vm.run` hands the
host a result whose `error` holds the message, with the fuel spent so far. Nothing is thrown into
the host's code. [Error Handling](/ajs-error-handling/) covers this in full.

## When it is JSON but not the shape you expected

A model or a remote service can send you more than you asked for, such as a token, a debug field,
or an instruction aimed at the next step. Check the shape of anything they give you before your
agent acts on it or returns it. The shape you checked is then the shape you pass on, and fields
you never asked for do not travel with it.

Parsing proves the text is JSON. It says nothing about what is in it: a field can be missing,
have the wrong type, or carry something extra. The builtin `filter(data, schema)` (a global
function, like `parseInt`; `Schema` builds the schema it takes) checks a value against a shape
and returns a copy that holds only the fields the shape names, at every depth, including objects
nested inside objects and arrays. If the value does not fit, it fails with a message naming the
field.

```ajs:inline
function readUser({ raw = '{"name":"Ann","score":97.5,"token":"s3cret"}' }) {
  let shape = Schema.object({ name: Schema.string, score: Schema.number })
  try {
    let user = filter(JSON.parse(raw), shape)
    return { user }
  } catch (err) {
    return { error: err }
  }
}
```

The result is `{ user: { name: 'Ann', score: 97.5 } }`: `token` is gone. Scalar types are values
(`Schema.string`, `Schema.number`); containers are calls (`Schema.object({...})`,
`Schema.array(...)`). `Schema.string()` ends the run with
`method 'string' is not callable`.

Try these values of `raw`:

| `raw`                             | result                                 |
| --------------------------------- | -------------------------------------- |
| `'{"name":"Ann"}'`                | `{ error: 'root: Missing score' }`     |
| `'{"name":"Ann","score":"high"}'` | `{ error: 'score: Expected number' }`  |
| `'[1,2]'`                         | `{ error: 'root: Expected object' }`   |
| `'nope'`                          | `{ error: ... }`, the parser's message |

The part before the colon is the path to the value that failed. A missing key is reported
against the object that should hold it (`root` is the whole value), and a value of the wrong
type is reported against itself. Deeper down the path grows: a missing `city` inside `address`
reads `address: Missing city`, and a bad `id` in the first element of `tags` reads
`tags.0.id: Expected number`.

One `try` catches both kinds of failure: a parse error and a shape error land in the same
`catch`. A shape error starts with a path and a colon (`score:`, `root:`); a parse error is the
engine's text. If you need to tell them apart, parse and filter in separate `try` blocks.

### Optional fields

Every field `Schema.object` names is required. A field written as a plain JSON-Schema object
with a nullable type is the exception: it may be absent, or `null`. Plain keyword objects mix
freely with `Schema` values:

```ajs:inline
function readProfile({ raw = '{"name":"Ann"}' }) {
  let shape = Schema.object({
    name: Schema.string,
    nick: { type: ['string', 'null'] },
  })
  try {
    return { user: filter(JSON.parse(raw), shape) }
  } catch (err) {
    return { error: err }
  }
}
```

| `raw`                          | result                                  |
| ------------------------------ | --------------------------------------- |
| `'{"name":"Ann"}'`             | `{ user: { name: 'Ann' } }`             |
| `'{"name":"Ann","nick":null}'` | `{ user: { name: 'Ann', nick: null } }` |
| `'{"name":"Ann","nick":"A"}'`  | `{ user: { name: 'Ann', nick: 'A' } }`  |
| `'{"name":"Ann","nick":3}'`    | `{ error: 'nick: Expected string' }`    |

The keywords a schema may use are listed under [Schema](/DOCS-AJS/#schema) in the AJS
reference.

### An example instead of a schema

`filter` also accepts an **example** in place of a schema: `filter(data, { name: '', age: 0 })`.
It strips and requires fields exactly as a schema does, and it is the quick way to write a shape
made of strings, booleans and integers.

The example's values set the types, so `0` means an integer, and `{ "age": 41.5 }` is refused
with `age: Expected integer`. In TJS signatures `0.0` means a float example, but that does not
carry over here: `filter` receives the runtime value 0, which is an integer. When a field may
hold any number, use a schema with `Schema.number`, as in `readUser`.
