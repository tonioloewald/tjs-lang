<!--{"section": "tjs", "order": 18, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Polymorphic Constructors

A class with more than one way to be built: write one `constructor` per way, and TJS picks
the right one from the arguments.

JavaScript allows one `constructor` per class. A class that can be built "from two numbers
or from an object" usually starts with a hand-written type test at the top of that one
constructor, or grows static factories such as `Point.fromObject()`. In TJS each way of
building the object is its own constructor, with its own typed parameters:

```tjs:inline
class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }

  constructor(coords: { x: 0.0, y: 0.0 }) {
    this.x = coords.x
    this.y = coords.y
  }

  distanceTo(other: { x: 0.0, y: 0.0 }): 0.0 {
    const dx = this.x - other.x
    const dy = this.y - other.y
    return Math.sqrt(dx * dx + dy * dy)
  }
}

const a = Point(0, 0)
const b = Point({ x: 3, y: 4 })
console.log('distance:', a.distanceTo(b))
console.log('both Points?', a instanceof Point, b instanceof Point)

const bad = Point('3', 4)
console.log('Point("3", 4) is an error?', bad instanceof Error)
```

It prints a distance of `5`, `true true`, and `true`. Both calls produce a real `Point`, the
method works on both, and arguments that fit neither constructor produce an error value
instead of a half-built object.

There is no `new`. A class declared in a `.tjs` file is called like a function, and writing
`new Point(3, 4)` on it is a compile error, because `Point(3, 4)` already constructs. (`new`
is still required for built-ins such as `new Set()`.) [Better Classes](/better-classes/)
covers callable classes in general; this page is about having more than one constructor.

## How it works

- **The first constructor is the real one.** It stays the class's JavaScript constructor.
- **The others become factory functions.** Each one creates an object with
  `Object.create(Point.prototype)` and runs that constructor's body on it. Because the
  object has the class's prototype, `instanceof Point` is true whichever constructor built
  it, and every method is available.
- **A dispatcher chooses between them.** When you call `Point(…)`, it looks for a
  constructor whose parameter count equals the number of arguments, and whose parameters
  accept the arguments' types. Constructors are tried in the order you wrote them, and the
  first that fits runs.
- **Each constructor validates its parameters**, as a function does: the examples
  (`x: 0.0`, `coords: { x: 0.0, y: 0.0 }`) are contracts, not just hints.
- **When nothing fits**, the call returns a `MonadicError` whose message says "no matching
  constructor". It is returned, not thrown, so check the result (`bad instanceof Error`) or
  pass it on: a function with typed parameters that receives an error returns that same
  error rather than running.

## A second example: units at the boundary

A constructor is a natural place to normalise input. Here a temperature is stored in Celsius
however it arrives, and a value that fits neither constructor is refused:

```tjs:inline
class Temperature {
  constructor(celsius: 0.0) {
    this.celsius = celsius
  }

  constructor(reading: { value: 0.0, unit: 'C' }) {
    this.celsius =
      reading.unit == 'F' ? ((reading.value - 32) * 5) / 9 : reading.value
  }

  toString() {
    return `${this.celsius.toFixed(1)}°C`
  }
}

const a = Temperature(21.5)
const b = Temperature({ value: 98.6, unit: 'F' })
console.log('from a number: ', a.toString())
console.log('from a reading:', b.toString())
console.log('same class?', a instanceof Temperature, b instanceof Temperature)

const bad = Temperature('warm')
console.log('Temperature("warm") ->', bad instanceof Error ? bad.message : bad)
```

Note that `unit: 'C'` is an _example_: it says "a string", not "the string `'C'`", which is
why `'F'` is accepted. To restrict it to a set of values, write a literal union,
`unit: 'C' | 'F'`; then `{ value: 1, unit: 'K' }` is refused.

## Gotchas

Constructor dispatch is simpler than [polymorphic function](/polymorphic-functions/)
dispatch, and the differences matter when you design the signatures.

- **No ambiguity check.** Two _functions_ with the same parameter types at every position
  are a compile error. Two _constructors_ like that are accepted, and the first always wins;
  the second can never run.
- **Objects are told apart only by being objects.** The dispatcher checks that an argument
  is an object, not what keys it has. So `constructor(p: { x: 0.0, y: 0.0 })` followed by
  `constructor(p: { r: 0.0, theta: 0.0 })` never reaches the second: `{ r: 1, theta: 0 }`
  goes to the first, which rejects it for having no `x`. Distinguish constructors by
  argument count or by primitive type (number, string, boolean), or take one object and
  branch inside the constructor, as `Temperature` does on `unit`.
- **Order matters.** An integer is also a valid float, so with `constructor(n: 0.0)` written
  before `constructor(n: 0)`, `X(2)` runs the float one. Put the narrower signature
  first.
- **The argument count must match exactly.** A parameter with a default
  (`constructor(a: 0, b = 1)`) does not make a one-argument call match; `X(1)` returns
  "no matching constructor". Write the shorter form as its own constructor instead.
- **Rest parameters are refused** in a class with several constructors (a compile error).
- **Only the first constructor is a real constructor.** The factories built from the others
  do not run class field initialisers (`label = 'default'` at the top of the class body),
  and in a subclass they do not call `super()`, so fields the parent constructor sets are
  missing. Assign every field in each constructor body, or call a shared setup method from
  each one.
