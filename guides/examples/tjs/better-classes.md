<!--{"section": "tjs", "type": "example", "group": "basics", "order": 20, "parent": "tjs-basics.md"}-->

# Better Classes

Classes you can call like functions. Multiple constructors.

```tjs:inline
/#
## The Problem

JavaScript requires `new` for classes, but it's easy to forget:

    class Point { constructor(x, y) { this.x = x; this.y = y } }
    const p = Point(1, 2)  // undefined! No error, just broken.

And you can't have multiple constructors:

    // Want Point(1, 2) AND Point({x: 1, y: 2})? Too bad.

## TJS Classes (on by default)

In native TJS, classes are callable without `new` by default — no directive needed.
Multiple `constructor()` declarations dispatch by signature.
#/

// --- Classes are callable without new ---

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

test 'callable without new' {
  const p = Point(3, 4)
  expect(p instanceof Point).toBe(true)
  expect(p.x).toBe(3)
  expect(p.y).toBe(4)
}

test 'methods work normally' {
  expect(Point(3, 4).magnitude()).toBe(5)
}

// --- Multiple constructors ---

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

  toString() {
    return `rgb(${this.r}, ${this.g}, ${this.b})`
  }
}

test 'construct from RGB' {
  const c = Color(255, 128, 0)
  expect(c.r).toBe(255)
  expect(c.g).toBe(128)
  expect(c instanceof Color).toBe(true)
}

test 'construct from hex' {
  const c = Color('#ff8000')
  expect(c.r).toBe(255)
  expect(c.g).toBe(128)
  expect(c.b).toBe(0)
  expect(c instanceof Color).toBe(true)
}

test 'both forms produce same result' {
  const a = Color(255, 0, 0)
  const b = Color('#ff0000')
  expect(a.r).toBe(b.r)
  expect(a.g).toBe(b.g)
  expect(a.b).toBe(b.b)
}

console.log('Point:', Point(3, 4).toString(), '  magnitude:', Point(3, 4).magnitude())
console.log('RGB:', Color(255, 128, 0).toString())
console.log('Hex:', Color('#ff8000').toString())
```

<!-- TODO review -->
## What to notice

**Calling a class constructs it.** `Point(3, 4)` returns a real `Point`: `instanceof` is true,
methods are on the prototype, and `toString()` works. Every class declared in a `.tjs` file
is wrapped this way, so a class can be used anywhere a function can, including as a callback
(`[1, 2, 3].map(Point)` style code works).

**`new` is an error, not an option.** On a class declared in the same file, `new Point(3, 4)`
does not compile. Since the call already constructs, `new` would only be decoration, and
having two spellings for one thing invites the old mistake in reverse. Built-ins are
untouched: `new Set()`, `new Map()` and `new Float32Array(4)` still need their `new`.

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

**Constructors and methods validate their parameters.** `Color(r: +0, g: +0, b: +0)` refuses
a negative or fractional channel, and a method with typed parameters checks them on every
call. A bad call returns a `MonadicError` rather than an object in a broken state.

**Several constructors, one class.** `Color` can be built from three numbers or from a hex
string. Each constructor is written separately and the class dispatches on the arguments; see
[Polymorphic Constructors](/polymorphic-constructors/) for the rules.

<!-- TODO review -->
## Defaults, subclasses and chaining

A parameter can have both a type and a default (`by: 0 = 1`: an integer, 1 if omitted), and
subclasses are called the same way as their parents:

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

const items = [1, 2, 3].map(Counter)
console.log('as a callback:', items.map((x) => x.count).join(', '))
```

`NamedCounter('visits', 10)` constructs the subclass, `super(start)` runs `Counter`'s
constructor, and `add(1.5)` is refused because `by` is an integer.

<!-- TODO review -->
## Gotchas

- **Only classes declared in `.tjs` are wrapped.** A class imported from a plain JavaScript
  module, an old-style `function` + `prototype` constructor, or a built-in keeps JavaScript's
  rules, so those still need `new`. TypeScript converted with `fromTS` keeps them too, unless
  the file opts into full TJS with `TjsStrict`.
- **A failed construction is a value.** `Color(-1, 0, 0)` returns a `MonadicError`, not a
  `Color`. If you go on to call a method on it, you call it on the error. Check the result, or
  pass it to a function with typed parameters, which passes the error along.
- **Validation covers parameters, not fields.** The checks run when a constructor or method is
  called. Assigning `point.x = 'oops'` afterwards is ordinary JavaScript and is not checked.
