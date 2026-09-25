<!--{"section": "ajs", "type": "example", "group": "basics", "order": 6, "parent": "ajs-basics.md"}-->

# Error Handling

Try/catch with Error()

```ajs
function safeDivide({ a = 10, b = 0 }) {
  try {
    if (b == 0) {
      Error('Division by zero!')
    }
    let result = a / b
    return { result }
  } catch (err) {
    return { error: err }
  }
}
```
