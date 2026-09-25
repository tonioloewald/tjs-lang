<!--{"section": "ts", "type": "example", "group": "validation", "order": 3, "parent": "ts-validation.md"}-->

# Object Validation

Object types are validated at runtime

```ts
// Object types become runtime checks

interface User {
  name: string
  age: number
}

function greetUser(user: User): string {
  return `Hello, ${user.name}! You are ${user.age} years old.`
}

// Valid object works
const alice = { name: 'Alice', age: 30 }
console.log(greetUser(alice))

// Non-object fails validation
const badInput = greetUser('not an object' as any)
console.log('String input:', badInput)

// Note: Current validation checks type (object vs primitive)
// Deep property validation is a future enhancement
```
