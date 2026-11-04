<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 9, "parent": "tjs-patterns.md"}-->

# Schema Validation

Types persist into runtime — inspect, validate, and document at zero extra cost

```tjs:inline
/#
## Runtime Types

Every TJS function carries `__tjs` metadata with full type information.
This enables runtime validation, auto-generated docs, and introspection
— all from the same type annotations you already write.
#/

function createUser(
  name: 'anonymous',
  email: 'user@example.com',
  age: +0
): { name: 'anonymous', email: 'user@example.com', age: 0 } {
  return { name, email, age }
}

function transfer(
  from: '',
  to: '',
  amount: 0.0
): { from: '', to: '', amount: 0.0 } {
  return { from, to, amount }
}

test 'functions validate at runtime' {
  const user = createUser('Alice', 'alice@test.com', 30)
  expect(user.name).toBe('Alice')

  // Wrong type — returns error, no exception
  const err = createUser('Alice', 'alice@test.com', -1)
  expect(err instanceof Error).toBe(true)
}

test 'metadata is introspectable' {
  const meta = createUser.__tjs
  expect(meta.params.name.type.kind).toBe('string')
  expect(meta.params.age.type.kind).toBe('non-negative-integer')
  expect(meta.returns.type.kind).toBe('object')
}

// Inspect live metadata
console.log('createUser params:', createUser.__tjs.params)
console.log('transfer params:', transfer.__tjs.params)
console.log('transfer returns:', transfer.__tjs.returns)
```

<!-- TODO review -->
## What to notice

There is no schema library in this example, and no schema written twice. The parameter
examples _are_ the schema: `age: +0` both documents the parameter and makes
`createUser('Alice', 'alice@test.com', -1)` return a `MonadicError`, because `+0` means a
non-negative integer.

The same facts are attached to the function as data. `createUser.__tjs.params` lists each
parameter with its type descriptor (`kind: 'non-negative-integer'`), whether it is required,
and its example; `__tjs.returns` describes the result. The generated docs and `.d.ts`
output are built from the same description, and you can read it too: the second test
asserts on it directly.

In TypeScript this is the job of a parallel runtime schema (zod and friends), kept in step
with the static types by hand or by inference. TJS starts from the other end. The runtime
description is the primary artefact, so it cannot drift from the code that uses it.

<!-- TODO review -->
## Named types, and JSON Schema out

When a shape is used in more than one place, give it a name with `Type`. A declared type is
a predicate you can call, a parameter type you can use in a signature, and a source of JSON
Schema for tools outside TJS (an API gateway, a form library, an LLM's structured output):

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

The full set of declarations (`Type`, `Enum`, `Union`, `Generic`, `FunctionPredicate`) is
covered in _Declarations_; for a whole function, `functionMetaToJSONSchema(fn.__tjs)` from
`tjs-lang/lang` produces `{ input, output }` schemas.

<!-- TODO review -->
## Gotchas

- **An example is a value, so pick a representative one.** `'user@example.com'` makes the
  parameter a string; it does not make it an email. When the rule matters, declare a `Type`
  with a `predicate` (see _Declarations_ and _Predicate Types_).
- **Excess keys are accepted.** An object example lists the keys that must be present; a
  value with more keys still passes `Address(...)`. The generated JSON Schema is stricter
  here (`additionalProperties: false`), so a validator fed that schema will reject extras
  that the TJS predicate accepts.
