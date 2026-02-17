<!--{"section":"ajs","type":"example","group":"basics","order":3}-->

# Loop & Filter

Process arrays with array methods

```ajs
function processNumbers({ numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }) {
  let evens = numbers.filter((x) => x % 2 == 0)
  let doubled = evens.map((x) => x * 2)
  let total = doubled.reduce((acc, x) => acc + x, 0)
  return { evens, doubled, total }
}
```
