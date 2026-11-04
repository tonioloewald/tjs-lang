<!--{"section": "tjs", "order": 21, "parent": "tjs-basics.md"}-->

# Local Class Extensions

Add methods to built-in types without polluting prototypes

`extend TypeName { ... }` adds methods to existing types like String,
Array, and Number. Methods are rewritten to `.call()` at transpile time
for known types — zero runtime overhead, no prototype pollution.

Think jQuery-like convenience that feels native but can't break anything.

```tjs:static
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

<!-- TODO review -->
## What to notice

The usual way to give strings a `capitalize()` is to assign to `String.prototype`. That works,
and it changes `String` for every piece of code in the page: your libraries, their libraries,
and any future version of JavaScript that adds a `capitalize` of its own with different
behaviour. (This is how `Array.prototype.flatten` became `flat`: a popular library had already
patched in an incompatible `flatten`.)

An `extend` block gets the convenience without the global change. The methods are collected
into a plain object belonging to this file, and a call such as `'hello'.capitalize()` is
rewritten at transpile time to an ordinary function call with the string as `this`. Nothing is
added to any prototype, which is what the last test checks.

- **Methods use `this`**, exactly as they would on a class. That is why they must be written
  with method syntax (`last() { … }`), never as arrow functions, which have no `this` of their
  own. (An arrow-function member is not reported as an error; it is silently left out.)
- **Parameter examples are documentation here, not checks.** Unlike a function or a class
  method, an extension method does not validate its arguments today: `7.clamp('a', 5)` returns
  `NaN`, not an error. Validate inside the method if it matters.
- **Several `extend` blocks for the same type merge**, so you can group extensions by topic.
- **Extensions are file-local.** Another module, including one you import, never sees them.

<!-- TODO review -->
## Try it

```tjs:inline
extend String {
  shout() {
    return this.toUpperCase() + '!'
  }
}

extend String {
  initials() {
    return this.split(' ').map((w) => w[0]).join('')
  }
}

extend Array {
  last() {
    return this[this.length - 1]
  }
}

console.log('hello'.shout())
console.log('Ada Lovelace'.initials())
console.log([3, 1, 4, 1, 5].last())
console.log('String.prototype touched?', typeof String.prototype.shout != 'undefined')
```

<!-- TODO review -->
## The limit you will hit: only literal receivers are rewritten

Today the rewrite is a source transform, and it recognises the receiver's type only when the
receiver is a **literal**: a quoted string or template literal, an array literal, or a number
literal. A call on a variable is left exactly as written:

<!-- tjs-doc: fragment -->

```tjs:static
const xs = [1, 2, 3]
xs.last() // TypeError at runtime: xs.last is not a function
```

Because no prototype was changed, `xs.last` really does not exist, and the call fails when it
runs (not when it compiles). Until receivers are resolved from their types, use extensions on
literals, or wrap the value in one (`[...xs].last()`, `` `${name}`.shout() ``) and accept the
copy. For values you pass around, an ordinary function (`last(xs)`) is the honest choice.
