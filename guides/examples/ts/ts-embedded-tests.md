<!--{"section": "ts", "type": "example", "group": "validation", "order": 1, "parent": "ts-validation.md"}-->

# Embedded Tests

Write tests in comments that survive TypeScript compilation

```ts
// Embedded tests live inside /*test ... */ comments
// These survive TypeScript compilation and are extracted by TJS!

function add(a: number, b: number): number {
  return a + b
}

/*test 'adds positive numbers' {
  expect(add(2, 3)).toBe(5)
}*/

/*test 'adds negative numbers' {
  expect(add(-1, -2)).toBe(-3)
}*/

/*test 'handles zero' {
  expect(add(0, 5)).toBe(5)
  expect(add(5, 0)).toBe(5)
}*/

function multiply(a: number, b: number): number {
  return a * b
}

/*test 'multiplies numbers' {
  expect(multiply(3, 4)).toBe(12)
  expect(multiply(-2, 3)).toBe(-6)
}*/

// Try it: Check the "Tests" tab to see results!
// These tests run at transpile time, giving you immediate feedback.

console.log('add(10, 20) =', add(10, 20))
console.log('multiply(5, 6) =', multiply(5, 6))
```
