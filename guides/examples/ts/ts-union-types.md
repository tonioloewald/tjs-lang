<!--{"section": "ts", "type": "example", "group": "patterns", "order": 3, "parent": "ts-patterns.md"}-->

# Union Types

Union types and nullable values

```ts
// Union types: T | null, T | undefined

function findUser(id: number): string | null {
  // Simulated lookup
  if (id === 1) return 'Alice'
  if (id === 2) return 'Bob'
  return null
}

function greetOrWarn(name: string | null): string {
  if (name === null) {
    return 'User not found!'
  }
  return `Hello, ${name}!`
}

console.log('Find user 1:', findUser(1))
console.log('Find user 2:', findUser(2))
console.log('Find user 99:', findUser(99))

console.log('\nGreet user 1:', greetOrWarn(findUser(1)))
console.log('Greet user 99:', greetOrWarn(findUser(99)))
```
