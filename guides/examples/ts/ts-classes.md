<!--{"section": "ts", "type": "example", "group": "advanced", "order": 3, "parent": "ts-advanced.md"}-->

# Classes

Classes are supported with metadata

```ts
// Classes with typed methods
// Note: return types omitted on methods — TJS infers them

class Calculator {
  private value: number = 0

  add(n: number) {
    this.value += n
    return this
  }

  multiply(n: number) {
    this.value *= n
    return this
  }

  getResult() {
    return this.value
  }

  reset() {
    this.value = 0
  }
}

// Use the class
const calc = new Calculator()
const result = calc.add(5).multiply(3).add(10).getResult()
console.log('5 * 3 + 10 =', result)

// Chain of operations
calc.reset()
console.log('After reset:', calc.getResult())
console.log('(2 + 3) * 4 =', calc.add(2).add(3).multiply(4).getResult())
```
