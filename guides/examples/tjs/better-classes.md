<!--{"section": "tjs", "type": "example", "group": "basics", "order": 20, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Better Classes

A TJS class is a JavaScript class with three changes: you call it like a function, `new` on
it is an error, and its typed parameters are checked. Everything else (methods, `extends`,
`super`, private fields, getters and setters, static members) works as it does in
JavaScript.

## The problem

In JavaScript a class must be constructed with `new`. Forget it and you get an exception,
while the older `function` constructors gave you something worse, a silent `undefined`:

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

`Point(3, 4)` returns a real `Point`: `instanceof` is true and the methods are on the
prototype, exactly as if it had been built with `new`. Every class declared in a `.tjs` file
is wrapped this way.

## `new` is an error

On a class declared in the same file, `new Point(3, 4)` does not compile. The call already
constructs, so `new` would be decoration, and two spellings for one thing invite the old
mistake in reverse.

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

Built-ins are untouched. `new Set()`, `new Map()` and `new Float32Array(4)` still need their
`new`, because JavaScript requires it.

## Constructors and methods check their parameters

A typed parameter on a constructor, a method, a static method or a private method is checked
exactly as it would be on a function (see [Safety and Validation](/safety-validation/)). A
wrong argument returns a `MonadicError` and the body does not run, so you never get an object
in a half-built state.

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
console.log('error:', bad.message)

console.log('scale(1.5):', Box(2, 3).scale(1.5).message)
```

`width: 0` means "an integer, for example 0" (the colon value is an example, not a literal
type), so `'two'` and `1.5` are both refused. The error names the class, the member and the
parameter.

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
console.log('add(1.5):', oops instanceof Error ? oops.message : oops)
```

`NamedCounter('visits', 10)` constructs the subclass, `super(start)` runs `Counter`'s
constructor, and `add(1.5)` is refused because `by` is an integer. Because `add` returns
`this`, calls chain.

## Private fields, getters and setters

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

`Object.keys(t)` is empty because `#celsius` is private. The last two lines show the one
exception to parameter checking: **setters are not validated.** A setter's return value is
thrown away by the assignment, so a refusal would silently drop the write rather than report
it. The `: 0.0` on the setter's parameter documents intent and checks nothing. If a setter
must refuse bad values, test them in its body, or use a method such as `setCelsius(value:
0.0)` whose result the caller can inspect.

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

class Color {
  constructor(r: +0, g: +0, b: +0) {
    this.r = r
    this.g = g
    this.b = b
  }

  constructor(hex: '#000000') {
    const n = parseInt(hex.slice(1), 16)
    this.r = (n >> 16) & 255
    this.g = (n >> 8) & 255
    this.b = n & 255
  }
}

const direct = ['#ff0000', '#00ff00'].map(Color)
console.log('map(Color):', direct[0].message)

const wrapped = ['#ff0000', '#00ff00'].map((hex) => Color(hex))
console.log('map((hex) => Color(hex)):', wrapped.map((c) => c.r + ',' + c.g).join(' | '))
```

Watch the arguments. `map` calls its callback with three: the item, its index and the whole
array. `Counter` has one parameter, and extra arguments are ignored, so `map(Counter)` works.
`Color` has two constructors, one taking three numbers and one taking a hex string, and it
picks between them by the arguments it receives. Called as `Color('#ff0000', 0, [...])` it
matches neither, so every element is an error. When the arguments a caller passes are not
the ones you mean, wrap the class in an arrow function that passes exactly the arguments you
want.

Multiple constructors are covered in [Polymorphic Constructors](/polymorphic-constructors/).

## Gotchas

- **Only classes declared in `.tjs` are wrapped.** A class imported from a plain JavaScript
  module, an old-style `function` + `prototype` constructor, or a built-in keeps
  JavaScript's rules, so those still need `new`. TypeScript converted with `fromTS` keeps
  them too, unless the file opts into full TJS with `TjsStrict`.
- **A failed construction is a value.** `Box('two', 3)` returns a `MonadicError`, not a
  `Box`. Reading a property of it gives `undefined`, and calling a method that the error
  does not have throws a `TypeError`. Check the result with `isMonadicError(box)`, or pass
  it to a function with typed parameters, which passes the error along. See [Error Handling](/error-handling/).
- **Validation covers parameters, not fields.** The checks run when a constructor or method
  is called. Assigning `box.width = 'oops'` afterwards is ordinary JavaScript and is not
  checked, and neither is a setter (see above).
