<!--{"section":"tjs","type":"example","group":"basics","order":4}-->

# Array Types

Working with typed arrays

```tjs
/*#
## Array Types

Array types use a single-element example:
- `[0]` = array of numbers
- `['']` = array of strings
- `[{ x: 0 }]` = array of objects with shape { x: number }
*/
test 'sum adds numbers' {
  expect(sum([1, 2, 3, 4])).toBe(10)
}

test 'stats calculates correctly' {
  const s = stats([10, 20, 30])
  expect(s.min).toBe(10)
  expect(s.max).toBe(30)
  expect(s.avg).toBe(20)
}

function sum(numbers: [0]) -> 10 {
  return numbers.reduce((a, b) => a + b, 0)
}

function average(numbers: [0]) -> 20 {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}

function stats(data: [0]) -> { min: 10, max: 30, avg: 20 } {
  if (data.length === 0) {
    return { min: 0, max: 0, avg: 0 }
  }
  return {
    min: Math.min(...data),
    max: Math.max(...data),
    avg: average(data)
  }
}

// Signature test: stats([10, 20, 30]) -> { min: 10, max: 30, avg: 20 }
stats([10, 20, 30])
```
