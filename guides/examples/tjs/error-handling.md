<!--{"section":"tjs","type":"example","group":"patterns","order":7}-->

# Error Handling

Type-safe error handling patterns

```tjs
/*#
## Monadic Error Handling

TJS uses the Result pattern - errors are values, not exceptions.
This makes error handling explicit and type-safe.

Note: Using `-!` to skip signature test since error paths
return different shapes.
*/
test 'divide handles zero' {
  const result = divide(10, 0)
  expect(result.ok).toBe(false)
  expect(result.error).toBe('Division by zero')
}

test 'divide works normally' {
  const result = divide(10, 2)
  expect(result.ok).toBe(true)
  expect(result.value).toBe(5)
}

function divide(a: 10, b: 2) -! { ok: true, value: 5, error: '' } {
  if (b === 0) {
    return { ok: false, value: 0, error: 'Division by zero' }
  }
  return { ok: true, value: a / b, error: '' }
}

function safeParse(json: '{"x":1}') -! { ok: true, data: null, error: '' } {
  try {
    return { ok: true, data: JSON.parse(json), error: '' }
  } catch (e) {
    return { ok: false, data: null, error: e.message }
  }
}

// Usage - errors are values you can inspect
const result = divide(10, 0)
if (result.ok) {
  console.log('Result:', result.value)
} else {
  console.log('Error:', result.error)
}
```
