<!--{"section":"tjs","type":"example","group":"patterns","order":7}-->

# Error Handling

Type-safe error handling patterns

```tjs
/*#
## Monadic Error Handling

TJS uses the Result pattern — errors are values, not exceptions.
This makes error handling explicit and type-safe.
*/
test 'divide handles zero' {
  const result = divide(10, 0)
  expect(result.error).toBe('Division by zero')
}

test 'divide works normally' {
  const result = divide(10, 2)
  expect(result.value).toBe(5)
}

function divide(a: 10, b: 2) -> { value: 0, error = '' } {
  if (b === 0) {
    return { value: NaN, error: 'Division by zero' }
  }
  return { value: a / b }
}

function safeParse(json: '{"x":1}') -> { data: null, error = '' } {
  try {
    return { data: JSON.parse(json) }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

// Usage — errors are values you can inspect
const result = divide(10, 0)
if (!result.error) {
  console.log('Result:', result.value)
} else {
  console.log('Error:', result.error)
}
```
