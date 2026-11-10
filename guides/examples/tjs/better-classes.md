<!--{"section": "tjs", "type": "example", "group": "basics", "order": 20, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Better Classes

A TJS class is a JavaScript class with three changes: you call it like a function, `new` on
it is an error, and its typed parameters are checked. A class may also declare more than one
constructor (see [Polymorphic Constructors](/polymorphic-constructors/)). Everything else
(methods, `extends`, `super`, private fields, getters and setters, static members) works as
it does in JavaScript.

## The problem

In JavaScript a class must be constructed with `new`. Forget it and you get an exception:

```javascript
class Point {
  constructor(x, y) {
    this.x = x
    this.y = y
  }
}

const p = Point(1, 2) // TypeError: Class constructor Point cannot be invoked without 'new'
```

Nor does JavaScript check what a constructor is given. `new Point('one', 'two')` builds a
`Point` whose coordinates are strings, and the mistake surfaces later, somewhere else.

## Calling a class constructs it

```tjs:inline
class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }

  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  toString() {
    return `(${this.x}, ${this.y})`
  }
}

const p = Point(3, 4)
console.log('point:', p.toString())
console.log('magnitude:', p.magnitude())
console.log('instanceof Point?', p instanceof Point)

test 'callable without new' {
  const q = Point(3, 4)
  expect(q instanceof Point).toBe(true)
  expect(q.x).toBe(3)
  expect(q.magnitude()).toBe(5)
}
```

`x: 0.0` means "a number, for example 0.0". The colon value is an example, not a literal
type, and the `.0` makes it a float, so any number is accepted. Writing `0` instead would
mean an integer.

`Point(3, 4)` returns a real `Point`: `instanceof` is true and the methods are on the
prototype, exactly as if it had been built with `new`. `Point` is still a class, with the
same prototype and static members, so `extends Point` and `instanceof Point` work as usual,
including from plain JavaScript. Every class declared in a `.tjs` file can be called this
way.

The `test` block is a TJS inline test. It runs when the file is checked or transpiled, and a
failing `expect` is reported as an error. See
[Inline Tests](/inline-tests-test-private-functions/).

## `new` is an error

On a class declared in the same file, `new Point(3, 4)` does not compile. The call already
constructs, so `new` would be decoration. If both spellings were allowed, every reader would
have to wonder whether `Point(…)` and `new Point(…)` differ, and code would mix them.

<!-- tjs-doc: expect-error -->

```tjs:static
class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }
}

const p = new Point(1, 2) // compile error: drop the `new`
```

The compiler says what to do: "`new Point` is not allowed in TJS — a class is CALLED, so
`Point(…)` does exactly what `new Point(…)` does and returns the same object. Drop the
keyword."

The rule is checked per file, against the classes that file declares. A TJS class imported
from another module accepts `new` and behaves the same either way, and plain JavaScript code
that imports a TJS class can use `new Point(3, 4)` or `Point(3, 4)`.

Built-ins are untouched. `new Set()`, `new Map()` and `new Float32Array(4)` still need their
`new`, because JavaScript requires it.

## Constructors and methods check their parameters

A typed parameter on a constructor, a method, a static method or a private method is checked
exactly as it would be on a function (see [Safety and Validation](/safety-validation/)). A
wrong argument returns a `MonadicError` and the body does not run, so you never get an object
in a half-built state. A `MonadicError` is an error value that TJS returns instead of
throwing (it is an `Error`, so `instanceof Error` is also true); test for it with
`isMonadicError`. [Error Handling](/error-handling/) explains why errors are returned.

```tjs:inline
class Box {
  constructor(width: 0, height: 0) {
    this.width = width
    this.height = height
  }

  scale(by: 0) {
    return Box(this.width * by, this.height * by)
  }

  area() {
    return this.width * this.height
  }
}

console.log('Box(2, 3).area():', Box(2, 3).area())
console.log('scaled:', Box(2, 3).scale(2).area())

const bad = Box('two', 3)
console.log('Box("two", 3) is a Box?', bad instanceof Box)
console.log('is an error?', isMonadicError(bad))
console.log('error:', bad.message)

console.log('scale(1.5):', Box(2, 3).scale(1.5).message)
```

`width: 0` means "an integer, for example 0", so `'two'` and `1.5` are both refused. The
error names the source location, the class, the member and the parameter, for example
`Expected integer for 'better-classes.tjs:2:Box.constructor.width', got string` (the file
name depends on where the code runs).

## Defaults, subclasses and chaining

A parameter can have a type and a separate default. `by: 0 = 1` means "an integer, 1 if
omitted". Subclasses are called the same way as their parents:

```tjs:inline
class Counter {
  constructor(start: 0 = 0) {
    this.count = start
  }

  add(by: 0 = 1) {
    this.count += by
    return this
  }
}

class NamedCounter extends Counter {
  constructor(name: 'clicks', start: 0 = 0) {
    super(start)
    this.name = name
  }

  toString() {
    return `${this.name}: ${this.count}`
  }
}

const c = Counter().add().add(5)
console.log('Counter().add().add(5):', c.count)

const n = NamedCounter('visits', 10).add()
console.log(n.toString(), '| instanceof Counter?', n instanceof Counter)

const oops = Counter().add(1.5)
console.log('add(1.5):', isMonadicError(oops) ? oops.message : oops)
```

`name: 'clicks'` has no `=`, so `name` is required: `'clicks'` is an example of a string,
not a default. `NamedCounter('visits', 10)` constructs the subclass, `super(start)` runs `Counter`'s
constructor, and `add(1.5)` is refused because `by` is an integer. Because `add` returns
`this`, calls chain.

## Private fields, getters, setters and statics

These are JavaScript's own features and behave the same in TJS. A `#name` field or method is
reachable only from inside the class body. A `get` runs when the property is read, and a
`set` runs when it is assigned.

```tjs:inline
class Temperature {
  #celsius = 0

  constructor(celsius: 0.0) {
    this.#celsius = celsius
  }

  get celsius() {
    return this.#celsius
  }

  set celsius(value: 0.0) {
    this.#celsius = value
  }

  get fahrenheit() {
    return (this.#celsius * 9) / 5 + 32
  }

  static fromFahrenheit(f: 0.0) {
    return Temperature(((f - 32) * 5) / 9)
  }
}

const t = Temperature(100)
console.log('100°C in °F:', t.fahrenheit)
console.log('own keys:', JSON.stringify(Object.keys(t)))

console.log('212°F in °C:', Temperature.fromFahrenheit(212).celsius)

t.celsius = 'hot'
console.log('after t.celsius = "hot":', t.celsius)
```

`Object.keys(t)` is empty because `#celsius` is private. `fromFahrenheit` is a static method,
and its `f: 0.0` parameter is checked like any other.

The last two lines show the one exception to parameter checking: **setters are not
validated.** TJS reports a bad argument by returning an error value, but an assignment
discards whatever the setter returns, so a refusal would silently drop the write rather than
report it. The `: 0.0` on the setter's parameter documents intent and checks nothing.

If a setter must refuse bad values, test them in its body, or use a method such as
`setCelsius(value: 0.0)` whose result the caller can inspect.

## Classes as callbacks

Since a class is callable, it can go wherever a function goes:

```tjs:inline
class Counter {
  constructor(start: 0 = 0) {
    this.count = start
  }
}

const counters = [1, 2, 3].map(Counter)
console.log('map(Counter):', counters.map((c) => c.count).join(', '))

class Rect {
  constructor(width: 0, height: 0 = 1) {
    this.width = width
    this.height = height
  }
}

const direct = [4, 5].map(Rect)
console.log('map(Rect) heights:', direct.map((r) => r.height).join(', '))

const wrapped = [4, 5].map((w) => Rect(w))
console.log('map((w) => Rect(w)) heights:', wrapped.map((r) => r.height).join(', '))
```

Watch the arguments. `map` calls its callback with three: the item, its index and the whole
array. With one constructor, arguments beyond its parameters are ignored, so `Counter`, which
has one parameter, works.

`Rect` has two. `map` fills `height` with the index, which is a valid integer, so
`[4, 5].map(Rect)` builds `Rect(4, 0)` and `Rect(5, 1)`: wrong heights, and no error. A class
with several constructors is chosen by the number and types of its arguments, so there the
extra index and array can make no constructor match, and every element comes back as an
error (see [Polymorphic Constructors](/polymorphic-constructors/)).

When the arguments a caller passes are not the ones you mean, wrap the class in an arrow
function that passes exactly the arguments you want.

## Gotchas

- **Only classes declared in `.tjs` are wrapped.** A class imported from a plain JavaScript
  module, an old-style `function` + `prototype` constructor, or a built-in keeps
  JavaScript's rules, so those still need `new`. Classes in TypeScript converted to TJS
  (with `fromTS`) keep JavaScript's `new` rules too, unless the file opts into full TJS with
  a `/* @tjs TjsStrict */` comment. See [TJS for TypeScript developers](/TJS-FOR-TS/).
- **A failed construction is a value.** `Box('two', 3)` returns a `MonadicError`, not a
  `Box`. Reading a property of it gives `undefined`, and calling a method that the error
  does not have throws a `TypeError`. Check the result with `isMonadicError(box)`, or pass
  it to a function with typed parameters, which passes the error along. An untyped
  parameter does not: the body runs with the error as its argument. See
  [Error Handling](/error-handling/).
- **Validation covers parameters, not fields.** The checks run when a constructor or method
  is called. Assigning `box.width = 'oops'` afterwards is ordinary JavaScript and is not
  checked, and neither is a setter (see above).
