<!--{"section": "ts", "type": "example", "group": "validation", "order": 3, "parent": "ts-validation.md"}-->

# Object Validation

Object types are validated at runtime

```ts
// Converted TypeScript keeps JavaScript's behaviour until you opt in. This one
// line opts in to full TJS, which turns the types into runtime checks:
/* @tjs TjsStrict */

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

// Members are checked too, not just "is it an object"
const wrongAge = greetUser({ name: 'Bob', age: 'thirty' } as any)
console.log('Wrong member type:', wrongAge)
```
