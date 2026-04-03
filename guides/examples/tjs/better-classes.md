<!--{"section":"tjs","type":"example","group":"basics","order":17}-->

# Better Classes

Classes you can call like functions. Multiple constructors.

```tjs
/*#
## The Problem

JavaScript requires `new` for classes, but it's easy to forget:

    class Point { constructor(x, y) { this.x = x; this.y = y } }
    const p = Point(1, 2)  // undefined! No error, just broken.

And you can't have multiple constructors:

    // Want Point(1, 2) AND Point({x: 1, y: 2})? Too bad.

## TJS Classes (on by default)

In native TJS, classes are callable without `new` by default — no directive needed.
Multiple `constructor()` declarations dispatch by signature.
*/

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
