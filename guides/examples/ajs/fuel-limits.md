<!--{"section":"ajs","type":"example","group":"featured","order":16}-->

# Fuel Limits

Demonstrates safe termination - try different fuel amounts!

```javascript
function infiniteLoop({ limit = 1000000 }) {
  // This will run out of fuel before completing
  let counter = 0
  let i = 0
  while (i < limit) {
    counter = counter + 1
    i = i + 1
  }
  return { counter }
}
```
