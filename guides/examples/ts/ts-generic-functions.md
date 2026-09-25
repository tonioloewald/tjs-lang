<!--{"section": "ts", "type": "example", "group": "advanced", "order": 1, "parent": "ts-advanced.md"}-->

# Generic Functions

Generics transpile with warnings (best-effort)

```ts
// Generic functions: TJS handles them best-effort
// Generic type params become 'any' with a warning

function identity<T>(value: T): T {
  return value
}

function first<T>(items: T[]): T | undefined {
  return items[0]
}

function wrap<T>(value: T): { value: T } {
  return { value }
}

// These work at runtime
console.log('identity(42):', identity(42))
console.log('identity("hello"):', identity('hello'))
console.log('first([1,2,3]):', first([1, 2, 3]))
console.log('wrap({ x: 1 }):', wrap({ x: 1 }))

// Check the TJS output - you'll see warnings about generic params
```
