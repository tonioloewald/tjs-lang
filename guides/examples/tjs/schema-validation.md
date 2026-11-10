<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 9, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Types at Runtime

TypeScript's types are gone by the time the code runs. TJS types are not: every function
keeps a description of its signature as data, every declared `Type` is a value you can call,
and both can be written out as JSON Schema for tools that have never heard of TJS. This page
covers three things: reading that description, checking values against a type, and exporting
a type as JSON Schema.

## A function carries its own signature

A quick key to the examples below. In TJS a colon parameter's value is an example, and the
example sets the type: `''` is a string, `0` an integer, `0.0` any number, `+0` a
non-negative integer.

```tjs:inline
function createUser(
  name: 'anonymous',
  email: 'user@example.com',
  age: +0
): { name: 'anonymous', email: 'user@example.com', age: 0 } {
  return { name, email, age }
}

function transfer(from: '', to: '', amount: 0.0, memo = ''): { from: '', to: '', amount: 0.0 } {
  return { from, to, amount }
}

test 'functions validate at runtime' {
  const user = createUser('Alice', 'alice@test.com', 30)
  expect(user.name).toBe('Alice')

  // -1 is not a non-negative integer: an error comes back, nothing is thrown
  const err = createUser('Alice', 'alice@test.com', -1)
  expect(isMonadicError(err)).toBe(true)
}

test 'metadata is introspectable' {
  const meta = createUser.__tjs
  expect(meta.params.name.type.kind).toBe('string')
  expect(meta.params.age.type.kind).toBe('non-negative-integer')
  expect(meta.returns.type.kind).toBe('object')
  expect(transfer.__tjs.params.memo.required).toBe(false)
}

console.log('age:   ', JSON.stringify(createUser.__tjs.params.age))
// {"type":{"kind":"non-negative-integer"},"required":true,"default":null}
console.log('amount:', JSON.stringify(transfer.__tjs.params.amount))
// {"type":{"kind":"number"},"required":true,"default":null}
console.log('memo:  ', JSON.stringify(transfer.__tjs.params.memo))
// {"type":{"kind":"string"},"required":false,"default":""}
console.log('returns:', JSON.stringify(transfer.__tjs.returns))
// {"type":{"kind":"object","shape":{"from":{"kind":"string"},"to":{"kind":"string"},"amount":{"kind":"number"}}}}
```

The return annotation is a _worked example_, not a type: calling the function with its
parameter examples must return exactly that value, and TJS checks that it does. That is why
`createUser`'s return repeats its parameter examples: `createUser('anonymous',
'user@example.com', 0)` returns `{ name: 'anonymous', email: 'user@example.com', age: 0 }`.
When you want a return type without the test, write `:!` instead of `:`.

The `test '…' { }` blocks are TJS inline tests, and `expect` is their assertion API. They run
when the file is checked or transpiled; see [Inline Tests](/inline-tests-test-private-functions/).

There is no schema library here, and nothing is written twice. The parameter examples _are_
the schema: `age: +0` documents the parameter and also makes
`createUser('Alice', 'alice@test.com', -1)` return a `MonadicError`. A `MonadicError` is an
error returned in place of the result rather than thrown; `isMonadicError(value)` tells it
apart from a normal result. [Error Handling](/error-handling/) explains why TJS works this
way.

The same facts are attached to the function as `fn.__tjs`, which is what the four
`console.log` lines print:

- `params` maps each parameter name to `{ type, required, default }`. `required` is `true`
  for a colon parameter (`age: +0`) and `false` for a defaulted one (`memo = ''`), whose
  `default` holds the value.
- `returns` holds the return's type descriptor, when the function declares one.
- `type` is a _type descriptor_. Its `kind` is one of `string`, `number` (from `0.0`),
  `integer` (from `0`), `non-negative-integer` (from `+0`), `boolean`, `null`, `undefined`,
  `bigint`, `array` (with `items`), `object` (with `shape`), `union`, `literal-union`,
  `function`, `declared` (a named `Type`, covered in the next section), `declared-import` (a
  `Type` imported from another module) or `any`.

The toolchain reads this description too: `tjs check` prints each function's signature from
it (`createUser(name: string, email: string, age: non-negative-integer) -> object`), `tjs
types` writes it out as JSON, and the `.d.ts` generator builds declarations from it. Your
code can read it as well, as the second test does.

In TypeScript this is the job of a separate runtime schema (zod and friends), kept in step
with the static types by hand or by inference. TJS starts from the other end: the runtime
description is the primary artefact, so it cannot drift from the code that uses it.

## A named type is a value

When a shape is used in more than one place, give it a name with `Type`. A declared type is a
predicate you can call, a type you can use in a signature, and a source of JSON Schema for
tools outside TJS (an API gateway, a form library, an LLM's structured output):

```tjs:inline
Type Address {
  description: 'a postal address'
  example: { street: '1 Main St', city: 'Springfield', zip: '12345' }
}

// 0.5 is a float example, so weightKg accepts any number, 2 included
function ship(to: Address, weightKg: 0.5): '0.5kg to Springfield' {
  return `${weightKg}kg to ${to.city}`
}

// The declared type is a predicate you can call...
console.log('Address(good):', Address({ street: '9 Elm', city: 'Shelbyville', zip: '54321' }))
console.log('Address.check(bad):', Address.check({ street: '9 Elm' }))

// ...the function checks its argument against it...
console.log(ship({ street: '9 Elm', city: 'Shelbyville', zip: '54321' }, 2))
// The result here is a MonadicError; String() prints its message:
// MonadicError: Expected Address for '…ship.to', got object
console.log(String(ship({ city: 'Nowhere' }, 2)))

// ...and the same declaration becomes a JSON Schema for other tools
console.log(JSON.stringify(Address.toJSONSchema(), null, 2))
```

In the block form, `example` gives the shape: every key in it is required, and each value's
kind becomes that key's type, so `street`, `city` and `zip` must all be strings.
`description` is documentation for readers and generated docs; it is not written into the
JSON Schema. A `predicate` adds rules an example cannot express (see
[Declarations](/declarations/)).

`Address(value)` and `Address.check(value)` are the same test, returning `true` or `false`;
`.check` reads better when the type is passed around as a value. `ship` runs the test on its
argument and, when it fails, returns a `MonadicError` naming the parameter. `ship`'s return
example is again a worked example: `ship` called with the `Address` example and `0.5` returns
`'0.5kg to Springfield'`.

The last line prints the schema with `type: 'object'`, the three keys under `properties`,
all three in `required`, and `additionalProperties: false`. That last field is explained
below, under _Extra keys and the exported schema_.

The full set of declarations (`Type`, `Enum`, `Union`, `Generic`, `FunctionPredicate`) is
covered in [Declarations](/declarations/).

## Removing extra fields with `strip`

A value that has more keys than the example still satisfies the type: an example lists the
keys that must be present, not the only keys allowed. TypeScript has no exact object types,
and TJS does not invent one. When you do want only the declared keys, for example before
storing a request body or sending a record to a client, ask for it with `strip`:

```tjs:inline
Type Address {
  example: { street: '1 Main St', city: 'Springfield', zip: '12345' }
}

const body = { street: '9 Elm', city: 'Shelbyville', zip: '54321', isAdmin: true }

console.log('passes check:', Address(body))
console.log('stripped:', JSON.stringify(Address.strip(body)))

// strip removes keys; it does not validate
const partial = Address.strip({ city: 'Nowhere', isAdmin: true })
console.log('stripped partial:', JSON.stringify(partial), Address(partial))
```

`strip` returns a new object holding only the example's keys; the input is not changed. A
value that is not an object is returned as it is. `strip` does not check anything, so a value
missing `street` comes out still missing `street`. Check first (or check the stripped result)
when the shape matters.

## A whole function as JSON Schema

`functionMetaToJSONSchema` turns a function's `__tjs` into an `input` schema (the parameters
as one object) and an `output` schema (the return type). It is part of the toolchain
(`tjs-lang/lang`), not of the language, so this example is code for a module of your own that
imports it, not a live example:

```javascript
import { functionMetaToJSONSchema } from 'tjs-lang/lang'

// transfer as defined at the top of this page
const { input, output } = functionMetaToJSONSchema(transfer.__tjs)
// input:
//   { type: 'object',
//     properties: {
//       from: { type: 'string' },
//       to: { type: 'string' },
//       amount: { type: 'number' },
//       memo: { type: 'string' } },
//     required: ['from', 'to', 'amount'] }
// output:
//   { type: 'object',
//     properties: {
//       from: { type: 'string' },
//       to: { type: 'string' },
//       amount: { type: 'number' } },
//     required: ['from', 'to', 'amount'],
//     additionalProperties: false }
```

The defaulted `memo` is in `properties` but not in `required`. This is the shape a
tool-calling LLM or an RPC layer wants: one object describing what the function accepts.

The `input` schema says nothing about extra keys, so JSON Schema's default applies and they
are allowed. The `output` schema closes the return shape with `additionalProperties: false`,
the same way `toJSONSchema()` does.

## Extra keys and the exported schema

The exported schema is stricter than the type. `Address(...)` accepts a value with keys the
example does not name, but in a `.tjs` file `Address.toJSONSchema()` writes
`additionalProperties: false`, on the top-level object and on every object nested inside it,
array items included. A JSON Schema validator fed that schema rejects extras the TJS check
accepts.

This is a known inconsistency, not a rule of the language. Emitted `.tjs` code uses TJS's
small inline runtime, whose `toJSONSchema()` still closes object shapes; the library's
`Type(...)` (imported from `tjs-lang`) re-opens them and writes `additionalProperties: true`.
See [Type Identity](/type-identity/) for the details.

Until the two agree, open the schema yourself when the tool receiving it should accept extra
keys. Setting the flag at the top level is not enough, because nested objects are closed
too, so walk the whole tree:

```tjs:inline
Type Order {
  example: { id: 'A1', customer: { name: 'Ada' }, items: [{ sku: 'X' }] }
}

// Set additionalProperties: true on every object schema in the tree.
// The parameter is untyped because a schema node can be any JSON value.
function openSchema(schema) {
  if (Array.isArray(schema)) return schema.map(openSchema)
  if (!schema || typeof schema !== 'object') return schema
  const out = {}
  for (const key of Object.keys(schema)) out[key] = openSchema(schema[key])
  if (out.type === 'object') out.additionalProperties = true
  return out
}

console.log(JSON.stringify(Order.toJSONSchema()))
console.log(JSON.stringify(openSchema(Order.toJSONSchema())))
```

The first line shows `additionalProperties: false` three times (the order, `customer`, and
each item); the second shows `true` in the same three places.

## Gotchas

- **An example is a value, so pick a representative one.** `'user@example.com'` makes the
  parameter a string; it does not make it an email. When the rule matters, declare a `Type`
  with a `predicate`, such as `predicate(x) { return x.includes('@') }`. The `Email` type in
  [Declarations](/declarations/) is a fuller version, and
  [Predicate Types](/predicate-types/) covers predicates in depth.
- **The exported schema rejects extra keys the type accepts.** See _Extra keys
  and the exported schema_ above.
- **`strip` is shallow.** It removes extra keys at the top level only. An extra key inside a
  nested object (`{ customer: { name, password } }`) or inside array items is kept.
