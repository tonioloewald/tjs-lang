<!--{"section":"ajs","type":"example","group":"basics","order":1}-->

# Math Operations

Basic arithmetic and Math built-ins

```ajs
function calculate({ a = 10, b = 5 }) {
  let sum = a + b
  let product = a * b
  let power = a ** b
  let sqrt = Math.sqrt(a)
  let max = Math.max(a, b)
  let rounded = Math.floor(a / b)
  return { sum, product, power, sqrt, max, rounded }
}
```
