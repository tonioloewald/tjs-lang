<!--{"section": "tjs", "order": 18, "parent": "tjs-basics.md"}-->

# Polymorphic Constructors

Classes with multiple constructor signatures, dispatched automatically

Classes can have multiple constructor declarations. The first becomes the
real JS constructor; the rest become factory functions that produce
correct `instanceof` results.

Classes are callable without `new` by default in native TJS, giving you
clean, expressive object creation with no directive needed.

```tjs:static
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

test 'construct with two numbers' {
  const p = Point(3, 4)
  expect(p.x).toBe(3)
  expect(p.y).toBe(4)
}

test 'construct with object' {
  const p = Point({ x: 10, y: 20 })
  expect(p.x).toBe(10)
  expect(p.y).toBe(20)
}

test 'methods work on both variants' {
  const a = Point(0, 0)
  const b = Point({ x: 3, y: 4 })
  expect(a.distanceTo(b)).toBe(5)
}
```

<!-- TODO review -->
## What to notice

JavaScript allows one `constructor` per class, so a class that can be built from "two numbers
or an object" usually starts with a hand-written type test, or grows static factories like
`Point.fromObject()`. In TJS you write each way of building the object as its own
constructor, with its own typed parameters, and the class dispatches between them the way a
[polymorphic function](/polymorphic-functions/) does: by argument count first, then by type.

- **The first constructor is the real one.** It becomes the class's JavaScript constructor.
  The others compile to factory functions that create the object with the class's prototype,
  which is why `instanceof Point` is true whichever constructor built it, and why methods such
  as `distanceTo` work on both.
- **Every constructor validates its parameters.** The examples are contracts, as they are on a
  function: `Point('3', 4)` is not a `Point` with a string inside, it is a `MonadicError`.
- **There is no `new`.** A class declared in a `.tjs` file is called like a function. Writing
  `new Point(3, 4)` on it is a compile error, because `Point(3, 4)` already constructs. (`new`
  stays mandatory, and allowed, for built-ins such as `new Set()` and `new Float32Array(4)`.)

<!-- TODO review -->
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

Note that `unit: 'C'` is an *example*: it says "a string", not "the string `'C'`", which is
why `'F'` is accepted. To restrict it to a set of values, write a literal union,
`unit: 'C' | 'F'`.

<!-- TODO review -->
## Gotchas

- **Keep the signatures distinct.** For functions, two variants with the same types at every
  position are a compile error. For constructors that check is not made today: the first
  matching constructor silently wins, and the second can never run. Make each constructor
  differ in arity or in the type of some parameter.
- **When nothing matches**, the call returns a `MonadicError` ("no matching constructor")
  instead of a half-built object, so check the result, or let it propagate into a function
  with typed parameters, which will pass the error along.
- **Shared setup goes in a method.** Each constructor is a separate body; if they all need
  the same initialisation, put it in a method and call it from each one.
