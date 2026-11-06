<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 9, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Types at Runtime

TypeScript's types are gone by the time the code runs. TJS types are not: every function
keeps a description of its signature as data, every declared `Type` is a value you can call,
and both can be written out as JSON Schema for tools that have never heard of TJS. This
chapter shows what that description holds and how to use it.

## A function carries its own signature

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
console.log('amount:', JSON.stringify(transfer.__tjs.params.amount))
console.log('memo:  ', JSON.stringify(transfer.__tjs.params.memo))
console.log('returns:', JSON.stringify(transfer.__tjs.returns))
```

There is no schema library here, and nothing is written twice. The parameter examples _are_
the schema: `age: +0` documents the parameter and also makes
`createUser('Alice', 'alice@test.com', -1)` return a `MonadicError`, because `+0` means a
non-negative integer.

The same facts are attached to the function as `fn.__tjs`:

- `params` maps each parameter name to `{ type, required, default }`. `required` is `true`
  for a colon parameter (`age: +0`) and `false` for a defaulted one (`memo = ''`), whose
  `default` holds the value.
- `returns` holds the return type, when the function declares one.
- `type` is a _type descriptor_. Its `kind` is one of `string`, `number`, `integer`,
  `non-negative-integer`, `boolean`, `null`, `undefined`, `bigint`, `array` (with `items`),
  `object` (with `shape`), `union`, `literal-union`, `function`, `declared` (a `Type` named
  in the signature) or `any`.

The generated docs and `.d.ts` output are built from this description, and your code can
read it too, as the second test does.

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

function ship(to: Address, weightKg: 0.5): '0.5kg to Springfield' {
  return `${weightKg}kg to ${to.city}`
}

// The declared type is a predicate you can call...
console.log('Address(good):', Address({ street: '9 Elm', city: 'Shelbyville', zip: '54321' }))
console.log('Address(bad): ', Address({ street: '9 Elm' }))

// ...the function checks its argument against it...
console.log(ship({ street: '9 Elm', city: 'Shelbyville', zip: '54321' }, 2))
console.log(String(ship({ city: 'Nowhere' }, 2)))

// ...and the same declaration becomes a JSON Schema for other tools
console.log(JSON.stringify(Address.toJSONSchema(), null, 2))
```

`Address(value)` and `Address.check(value)` are the same test, returning `true` or `false`.
`ship` runs the test on its argument and returns a `MonadicError` naming the parameter when
it fails. The full set of declarations (`Type`, `Enum`, `Union`, `Generic`,
`FunctionPredicate`) and predicates for rules an example cannot express are covered in
_Declarations_.

## Removing extra fields with `strip`

A value that has more keys than the example still satisfies the type: an example lists the
keys that must be present, not the only keys allowed. When you do want only the declared
keys, for example before storing a request body or sending a record to a client, ask for it
with `strip`:

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

`strip` returns a new object holding only the example's keys; the input is not changed. It
does not check anything, so a value missing `street` comes out still missing `street`. Check
first (or check the stripped result) when the shape matters.

## A whole function as JSON Schema

`functionMetaToJSONSchema` from `tjs-lang/lang` turns a function's `__tjs` into an `input`
schema (the parameters as one object) and an `output` schema (the return type). It is a host
API, so this example is for a module that imports it rather than a live one:

```javascript
import { functionMetaToJSONSchema } from 'tjs-lang/lang'

// createUser as defined at the top of this chapter
const { input, output } = functionMetaToJSONSchema(createUser.__tjs)
// input:
//   { type: 'object',
//     properties: {
//       name: { type: 'string' },
//       email: { type: 'string' },
//       age: { type: 'integer', minimum: 0 } },
//     required: ['name', 'email', 'age'] }
// output:
//   { type: 'object',
//     properties: { name: …, email: …, age: { type: 'integer' } },
//     required: ['name', 'email', 'age'],
//     additionalProperties: false }
```

A defaulted parameter appears in `properties` but not in `required`. This is the shape a
tool-calling LLM or an RPC layer wants: one object describing what the function accepts.

## Gotchas

- **An example is a value, so pick a representative one.** `'user@example.com'` makes the
  parameter a string; it does not make it an email. When the rule matters, declare a `Type`
  with a `predicate` (see _Declarations_ and _Predicate Types_).
- **The exported schema is stricter than the type about extra keys.** `Address(...)` accepts
  a value with keys the example does not name; that is a language decision, because
  TypeScript has no exact object types and TJS does not invent one. `toJSONSchema()` writes
  the example's shape exactly, with `additionalProperties: false`, the same closed form
  `strip` works from. So a JSON Schema validator fed that schema rejects extras the TJS
  predicate accepts. If the consumer should accept them, set `additionalProperties` to `true`
  on the schema before handing it over.
- **`strip` is shallow.** It removes extra keys at the top level only. An extra key inside a
  nested object (`{ customer: { name, password } }`) or inside array items is kept.
