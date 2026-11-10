<!--{"section": "tjs", "order": 18, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Polymorphic Constructors

A class with more than one way to be built: write one `constructor` per way, and TJS picks
the right one from the arguments.

JavaScript allows one `constructor` per class. A class that can be built "from two numbers
or from an object" usually starts with a hand-written type test at the top of that one
constructor, or grows static factories such as `Point.fromObject()`. In TJS each way of
building the object is its own constructor, with its own typed parameters.

Two things to know before reading the example. First, `x: 0.0` is not a TypeScript
annotation and not a default: it is an _example value_, and it means "`x` is a number"
(`0.0` is a float, and an integer is a valid float too). The `: 0.0` after `distanceTo(…)`
says the same about the return value. [TJS Syntax](/TJS-SYNTAX/) has the full rules.
Second, TJS classes are called without `new`: `Point(0, 0)` constructs a `Point`.

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
console.log('passed on?', a.distanceTo(bad) === bad)
```

It prints a distance of `5`, then `true true`, `true` and `true`. Both calls produce a real
`Point`, the method works on both, and arguments that fit neither constructor produce an
error value instead of a half-built object. Handing that error to `distanceTo` returns the
same error rather than running the method.

In a `.tjs` file, writing `new Point(3, 4)` is a compile error, because `Point(3, 4)`
already constructs. (`new` is still required for built-ins such as `new Set()`.)
[Better Classes](/better-classes/) covers callable classes in general; this page is about
having more than one constructor.

## How it works

- **The first constructor is the real one.** It stays the class's JavaScript constructor.
- **The others become factory functions.** Each one creates an object with
  `Object.create(Point.prototype)` and runs that constructor's body on it. Because the
  object has the class's prototype, `instanceof Point` is true whichever constructor built
  it, and every method is available. But it is not a real construction: class field
  initialisers and `super()` do not run (see Gotchas).
- **A dispatcher chooses, then the chosen constructor validates.** These are two separate
  steps. When you call `Point(…)`, the dispatcher looks for a constructor whose parameter
  count equals the number of arguments and whose parameters accept the arguments' basic
  kinds: number, string, boolean or object. Constructors are tried in the order you wrote
  them, and the first that fits runs. That constructor then checks its parameters in full,
  as a function does: `coords: { x: 0.0, y: 0.0 }` requires `x` and `y` to be numbers.
- **When nothing fits**, the call returns an error instead of throwing. It is a
  `MonadicError`, the `Error` subclass TJS returns for a bad argument, so check the result
  with `instanceof Error` or pass it on, as above. [Error Handling](/error-handling/) covers
  errors as values.
- **JavaScript callers get the same dispatch.** The exported class is wrapped so that both
  `Point(…)` and `new Point(…)` from a plain `.js` file go through the dispatcher:
  `new Point({ x: 3, y: 4 })` builds the point from the object.

## A second example: units at the boundary

A constructor is a natural place to normalise input. Here a temperature is stored in Celsius
however it arrives, and a value that fits neither constructor is refused:

```tjs:inline
class Temperature {
  constructor(celsius: 0.0) {
    this.celsius = celsius
  }

  constructor(reading: { value: 0.0, unit: 'C' | 'F' }) {
    this.celsius =
      reading.unit === 'F' ? ((reading.value - 32) * 5) / 9 : reading.value
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

const kelvin = Temperature({ value: 300, unit: 'K' })
console.log('unit K is an error?', kelvin instanceof Error)
const warm = Temperature('warm')
console.log('"warm" is an error?', warm instanceof Error)
```

It prints `21.5°C`, `37.0°C`, `true true`, `true` and `true`.

`'C' | 'F'` is a literal union: the unit must be one of those two strings, so `'K'` is
refused. A bare `unit: 'C'` would be an _example_, meaning only "a string", and `'K'` would
then be accepted and silently treated as Celsius.

The two refusals come from different steps. `'warm'` is a string, and no constructor takes
a string, so the dispatcher finds no match. `{ value: 300, unit: 'K' }` is an object, so the
dispatcher picks the second constructor, and that constructor's own check refuses the unit.

## Gotchas

Constructor dispatch is simpler than [polymorphic function](/polymorphic-functions/)
dispatch. Polymorphic functions are several same-name function declarations, which TJS
dispatches in a similar way but checks more strictly. The differences matter when you design
the signatures.

- **No ambiguity check.** Two _functions_ with the same parameter types at every position
  are a compile error. Two _constructors_ like that are accepted, and the first always wins;
  the second can never run.
- **Objects are told apart only by being objects.** The dispatcher checks that an argument
  is an object, not what keys it has. So `constructor(p: { x: 0.0, y: 0.0 })` followed by
  `constructor(p: { r: 0.0, theta: 0.0 })` never reaches the second: `{ r: 1, theta: 0 }`
  goes to the first, whose own check rejects it for having no `x`. Distinguish constructors
  by argument count or by primitive type (number, string, boolean), or take one object and
  branch inside the constructor, as `Temperature` does on `unit`.
- **Order matters, and the argument count must match exactly.** For this class:

  ```javascript
  class X {
    constructor(n: 0.0) { this.kind = 'float' }
    constructor(n: 0) { this.kind = 'integer' }
  }
  ```

  `X(2).kind` is `'float'`: an integer is also a valid float, so the first constructor
  takes it and the second never runs. Put the narrower signature first. And a parameter
  with a default does not make a shorter call match: with `constructor(a: 0, b = 1)`, a
  one-argument call returns the "no matching constructor" error. Write the shorter form as
  its own constructor instead.
- **Rest parameters are refused** in a class with several constructors (a compile error).
- **Only the first constructor is a real constructor.** The factories built from the others
  do not run class field initialisers (`label = 'default'` at the top of the class body
  comes out `undefined`), and in a subclass they do not call `super()`, so fields the parent
  constructor sets are missing. Assign every field in each constructor body, or call a
  shared setup method from each one.
