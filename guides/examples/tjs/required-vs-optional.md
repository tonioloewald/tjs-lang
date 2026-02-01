<!--{"section":"tjs","type":"example","group":"basics","order":2}-->

# Required vs Optional

Difference between : and = in parameters

```tjs
/*#
## Required vs Optional Parameters

In TJS, the punctuation tells you everything:

| Syntax | Meaning |
|--------|---------|
| \`param: 'value'\` | **Required** - must be provided |
| \`param = 'value'\` | **Optional** - defaults to value |

The example value after \`:\` or \`=\` defines the type.
*/
test 'requires name and email' {
  const user = createUser('Alice', 'alice@test.com')
  expect(user.name).toBe('Alice')
  expect(user.age).toBe(0) // default
}

function createUser(
  name: 'anonymous',
  email: 'user@example.com',
  age = 0,
  admin = false
) -> { name: '', email: '', age: 0, admin: false } {
  return { name, email, age, admin }
}

// Check the metadata
console.log('Params:', createUser.__tjs.params)
createUser('Alice', 'alice@example.com')
```
