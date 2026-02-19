<!--{"section":"tjs","type":"example","group":"basics","order":1}-->

# Hello TJS

Types-by-example: the value IS the type annotation

```tjs
/*#
## Types by Example

In TJS, the example value after `:` IS the type:

| Syntax | Type |
|--------|------|
| `name: 'Alice'` | string (required) |
| `count: 42` | integer |
| `rate: 3.14` | number (float) |
| `index: +0` | non-negative integer |
| `name = 'default'` | string (optional, defaults to 'default') |
| `data: { x: 0, y: 0 }` | object with shape |
*/

function greet(name: 'World') -> 'Hello, World!' {
  return `Hello, ${name}!`
}

// Numeric type narrowing — all valid JS syntax
function clampIndex(index: +0, max: +0) -> +0 {
  return Math.min(index, max)
}

function mix(a: 0.0, b: 0.0, t: 0.0) -> 0.0 {
  return a + (b - a) * t
}

test 'greet says hello' {
  expect(greet('TJS')).toBe('Hello, TJS!')
}

test 'type errors are values, not exceptions' {
  const err = greet(42)
  expect(err instanceof Error).toBe(true)
}

test 'numeric types are precise' {
  expect(clampIndex(5, 10)).toBe(5)
  // negative fails non-negative integer check
  expect(clampIndex(-1, 10) instanceof Error).toBe(true)
  // float fails integer check
  expect(clampIndex(3.5, 10) instanceof Error).toBe(true)
}

test 'floats accept any number' {
  expect(mix(0, 100, 0.5)).toBe(50)
}
```
