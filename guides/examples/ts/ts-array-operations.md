<!--{"section": "ts", "type": "example", "group": "patterns", "order": 1, "parent": "ts-patterns.md"}-->

# Array Operations

Array types flow through the pipeline

```ts
// Array types are preserved

function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0)
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}

function filterPositive(numbers: number[]): number[] {
  return numbers.filter(n => n > 0)
}

const data = [-1, 2, -3, 4, 5, -6, 7]
console.log('Data:', data)
console.log('Sum:', sum(data))
console.log('Average:', average(data))
console.log('Positive only:', filterPositive(data))
```
