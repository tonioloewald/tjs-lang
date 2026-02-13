<!--{"section":"tjs","type":"example","group":"basics","order":16}-->

# Polymorphic Constructors

Classes with multiple constructor signatures, dispatched automatically

```tjs
TjsClass

/*#
## Polymorphic Constructors

Classes can have multiple constructor declarations. The first becomes the
real JS constructor; the rest become factory functions that produce
correct `instanceof` results.

Combined with TjsClass (callable without `new`), this gives you
clean, expressive object creation.
*/

class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }

  constructor(coords: { x: 0.0, y: 0.0 }) {
    this.x = coords.x
    this.y = coords.y
  }

  distanceTo(other: { x: 0.0, y: 0.0 }) {
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
