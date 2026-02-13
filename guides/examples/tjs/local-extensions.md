<!--{"section":"tjs","type":"example","group":"basics","order":17}-->

# Local Class Extensions

Add methods to built-in types without polluting prototypes

```tjs
/*#
## Local Class Extensions

`extend TypeName { ... }` adds methods to existing types like String,
Array, and Number. Methods are rewritten to `.call()` at transpile time
for known types — zero runtime overhead, no prototype pollution.

Think jQuery-like convenience that feels native but can't break anything.
*/

extend String {
  capitalize() {
    return this[0].toUpperCase() + this.slice(1)
  }

  words() {
    return this.split(/\s+/)
  }

  reverse() {
    return this.split('').reverse().join('')
  }
}

extend Array {
  last() {
    return this[this.length - 1]
  }

  sum() {
    return this.reduce((a, b) => a + b, 0)
  }
}

extend Number {
  clamp(min: 0.0, max: 0.0) {
    return Math.min(Math.max(this, min), max)
  }
}

test 'string extensions' {
  expect('hello world'.capitalize()).toBe('Hello world')
  expect('foo bar baz'.words()).toEqual(['foo', 'bar', 'baz'])
  expect('abc'.reverse()).toBe('cba')
}

test 'array extensions' {
  expect([1, 2, 3].last()).toBe(3)
  expect([10, 20, 30].sum()).toBe(60)
}

test 'no prototype pollution' {
  expect(typeof String.prototype.capitalize).toBe('undefined')
  expect(typeof Array.prototype.last).toBe('undefined')
}
```
