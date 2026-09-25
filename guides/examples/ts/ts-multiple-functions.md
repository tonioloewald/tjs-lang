<!--{"section": "ts", "type": "example", "group": "intro", "order": 2, "parent": "ts-intro.md"}-->

# Multiple Functions

Multiple functions transpile correctly

```ts
// Multiple functions in one file

function add(a: number, b: number): number {
  return a + b
}

function multiply(a: number, b: number): number {
  return a * b
}

function greet(name: string, excited?: boolean): string {
  return excited ? `Hello, ${name}!` : `Hello, ${name}`
}

// Test them all
console.log('add(2, 3) =', add(2, 3))
console.log('multiply(4, 5) =', multiply(4, 5))
console.log('greet("World") =', greet('World'))
console.log('greet("World", true) =', greet('World', true))
```
