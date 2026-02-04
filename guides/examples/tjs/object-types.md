<!--{"section":"tjs","type":"example","group":"basics","order":3}-->

# Object Types

Typed object parameters and returns

```tjs
/*#
## Object Types

Object shapes are defined by example:
`{ first: '', last: '' }` means an object with string properties.

The return type `-> { x: 0, y: 0 }` is tested at transpile time!
*/
test 'createPoint returns correct structure' {
  const p = createPoint(5, 10)
  expect(p.x).toBe(5)
  expect(p.y).toBe(10)
}

function getFullName(person: { first: '', last: '' }) -> 'Jane Doe' {
  return person.first + ' ' + person.last
}

function createPoint(x: 0, y: 0) -> { x: 0, y: 0 } {
  return { x, y }
}

function distance(p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }) -> 5 {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Usage - signature tests verify these at transpile time
const name = getFullName({ first: 'Jane', last: 'Doe' })  // -> 'Jane Doe'
const dist = distance({ x: 0, y: 0 }, { x: 3, y: 4 })     // -> 5

console.log('Name:', name)
console.log('Distance:', dist)
```
