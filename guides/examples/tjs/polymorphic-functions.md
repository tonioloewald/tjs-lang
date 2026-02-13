<!--{"section":"tjs","type":"example","group":"basics","order":15}-->

# Polymorphic Functions

Multiple function declarations with the same name, automatically dispatched by argument types

```tjs
/*#
## Polymorphic Functions

Define multiple versions of a function with the same name but different
parameter signatures. TJS automatically dispatches to the right one based
on the number and types of arguments.

Like Swift/Obj-C method overloading, but at the source level.
*/

// Same name, different arities
function describe(value: 0) {
  return 'number: ' + value
}

function describe(value: '') {
  return 'string: ' + value
}

function describe(value: true) {
  return 'boolean: ' + value
}

test 'dispatch by type' {
  expect(describe(42)).toBe('number: 42')
  expect(describe('hello')).toBe('string: hello')
  expect(describe(true)).toBe('boolean: true')
}

// Different arities
function area(radius: 3.14) {
  return Math.PI * radius * radius
}

function area(width: 0.0, height: 0.0) {
  return width * height
}

test 'dispatch by arity' {
  expect(Math.round(area(1))).toBe(3)
  expect(area(3, 4)).toBe(12)
}
```
