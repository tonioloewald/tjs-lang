<!--{"section":"tjs","type":"example","group":"patterns","order":5}-->

# Higher-Order Functions

Functions that take or return functions

```tjs
// TJS handles higher-order functions
// Note: Function type annotations use simple syntax

function mapStrings(arr: [''], fn = (x) => x) -> [''] {
  return arr.map(fn)
}

function filterNumbers(arr: [0], predicate = (x) => true) -> [0] {
  return arr.filter(predicate)
}

function compose(f = (x) => x, g = (x) => x) -> 0 {
  // Returns a composed function, demo returns result
  const composed = (x) => f(g(x))
  return composed(5)
}

// Usage examples
const double = (x) => x * 2
const addOne = (x) => x + 1

// Map strings to uppercase
const words = mapStrings(['hello', 'world'], s => s.toUpperCase())

// Filter even numbers
const evens = filterNumbers([1, 2, 3, 4, 5, 6], x => x % 2 === 0)

// Compose functions: (5 * 2) + 1 = 11
const result = compose(addOne, double)

console.log('Mapped:', words)
console.log('Filtered:', evens)
console.log('Composed result:', result)

result
```
