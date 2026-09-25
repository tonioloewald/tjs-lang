<!--{"section": "ts", "type": "example", "group": "validation", "order": 2, "parent": "ts-validation.md"}-->

# Runtime Validation

TypeScript types work at RUNTIME, not just compile time

```ts
// The key insight: TS types become runtime checks

function divide(a: number, b: number): number {
  if (b === 0) return NaN
  return a / b
}

// Valid calls work normally
console.log('10 / 2 =', divide(10, 2))
console.log('10 / 0 =', divide(10, 0))

// Invalid calls return error objects (not crashes!)
const badResult = divide('ten' as any, 2)
console.log('divide("ten", 2) =', badResult)

if (badResult instanceof Error) {
  console.log('  ^ This is a MonadicError, not a crash!')
  console.log('  message:', badResult.message)
}
```
