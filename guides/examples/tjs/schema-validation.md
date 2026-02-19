<!--{"section":"tjs","type":"example","group":"patterns","order":8}-->

# Schema Validation

Types persist into runtime — inspect, validate, and document at zero extra cost

```tjs
/*#
## Runtime Types

Every TJS function carries `__tjs` metadata with full type information.
This enables runtime validation, auto-generated docs, and introspection
— all from the same type annotations you already write.
*/

function createUser(
  name: 'anonymous',
  email: 'user@example.com',
  age: +0
) -> { name: '', email: '', age: 0 } {
  return { name, email, age }
}

function transfer(
  from: '',
  to: '',
  amount: 0.0
) -> { from: '', to: '', amount: 0.0 } {
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
