<!--{"section": "ts", "type": "example", "group": "advanced", "order": 3, "parent": "ts-advanced.md"}-->

# Classes

Classes are supported with metadata

<!-- TODO review -->

Classes are where TypeScript's compile-time-only features cluster: `private` that any
JavaScript caller can read anyway, parameter types on methods that nothing checks, `new`
that is mandatory in JavaScript and carries no information. The converter keeps the class
and its methods as they are, and the method parameters keep their types. This example has
no `TjsStrict` line, so it shows the faithful conversion: the class behaves exactly as it
would after `tsc`.

```ts:inline
// Classes with typed methods. Method parameters keep their types, and
// method return types (this, number) convert like function return types.

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

<!-- TODO review -->

## What to notice

- **`private` is a TypeScript-only word.** In the faithful conversion it is dropped, and
  `value` becomes an ordinary field, which is all it ever was at run time. With
  `/* @tjs TjsStrict */` the converter goes further and writes a real JavaScript private
  field, `#value`, which code outside the class cannot read at all.
- **`new Calculator()` is kept.** In converted code the conversion marker means JavaScript
  semantics, and JavaScript requires `new` for a class.
- **Method chaining works unchanged.** `add` returns `this`, and so does the converted
  method.

<!-- TODO review -->

## The gotcha

In native TJS a class is _called_, not constructed: `Calculator()` does what
`new Calculator()` does, and writing `new` on a class declared in the same file is a
compile error. The same is true of a `.ts` file marked `TjsStrict`. So adding the
`TjsStrict` line to this example is not enough by itself: you must also change
`new Calculator()` to `Calculator()`. Graduating a converted file does that for you (see
[Converting a TypeScript Project](../../sections/ts-converting-a-project.md)). For built-in
classes nothing changes: `new Map()` and `new Float32Array(4)` still need `new`.
