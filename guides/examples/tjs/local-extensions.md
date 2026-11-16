<!--{"section": "tjs", "order": 21, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Local Class Extensions

`extend TypeName { ... }` lets you write `'hello world'.capitalize()` or `xs.last()` without
adding anything to `String.prototype` or `Array.prototype`. The transpiler rewrites each call to
one of the block's methods, in the current file only, so it runs the extension whenever the
receiver is of the extended type.

```tjs:inline
extend String {
  capitalize() {
    return this.charAt(0).toUpperCase() + this.slice(1)
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
  clamp(min: 0.0, max: 1.0) {
    return Math.min(Math.max(this, min), max)
  }
}

console.log('hello world'.capitalize()) // Hello world
console.log([10, 20, 30].sum()) // 60
console.log(7.5.clamp(0, 5)) // 5

test 'string extensions' {
  expect('hello world'.capitalize()).toBe('Hello world')
  expect(''.capitalize()).toBe('')
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

The `test '…' { }` blocks are TJS inline tests: they run with the example, and a failing one is
reported alongside the output. See [inline tests](/inline-tests-test-private-functions/).

Any type can be extended: `String`, `Array` and `Number`, and also `Map`, `Date` or one of your
own classes. A call on a value of that type, however you got the value, runs the extension.

## Why not assign to the prototype?

The usual way to give strings a `capitalize()` is `String.prototype.capitalize = …`. That
works, and it changes `String` for every piece of code in the page: your libraries, their
libraries, and any future version of JavaScript that adds a `capitalize` of its own with
different behaviour. This has happened. The array method now called `flat` was going to be
called `flatten`, but MooTools, a popular library, had already patched an incompatible
`Array.prototype.flatten` into enough websites that the standard had to pick another name.

An `extend` block gets the method-call style without the global change, which is what the
"no prototype pollution" test above checks. An ordinary function such as `capitalize(s)` avoids
the global change too; what `extend` adds is only the `value.method()` way of writing it.

## What the transpiler does

The methods are collected into a plain object belonging to this file, and each call to one of
them is rewritten to a small dispatcher that checks the receiver's type:

```javascript
// You write
xs.last()

// TJS emits, roughly
__tjs_ext_last(xs)
// where
function __tjs_ext_last(r, ...a) {
  if (Array.isArray(r)) return __ext_Array.last.apply(r, a)
  return r.last(...a)
}
```

Nothing is added to any prototype. A value that is not of the extended type gets the call as
written, so an object with its own `last` method keeps it, and `r?.last()` still returns
`undefined` for `null` without evaluating its arguments.

## Rules for extension methods

- **Methods use `this`**, as they would in a class, so write them with method syntax:

  <!-- tjs-doc: expect-error -->
  ```javascript
  extend Array {
    last() { return this[this.length - 1] }  // correct
    last() => this[0]                        // compile error: arrow functions are not allowed
    last = () => this[0]                     // compile error: not a method
  }
  ```

  An extend block holds only methods: a field, an arrow-function member or a getter is refused
  when the file compiles, with the form to write instead.

- **Parameter examples are defaults, and a value you pass is checked.** Inside `extend`,
  `min: 0.0` means "defaults to 0, and must be a number when given". So `7.5.clamp()` uses
  `min = 0` and `max = 1` and returns `1`, while `7.5.clamp('a', 5)` returns a type error.
- **A method with the same name as a built-in one replaces it in this file.** With
  `extend Array { map(f) { … } }`, every `.map(…)` on an array in the file calls your `map`,
  including any inside your own extension methods, so a `map` that calls `this.map` calls
  itself. Choose names the built-in types do not use.
- **`async` methods work** and return a promise like any async function:
  `extend String { async fetchJSON() { return (await fetch(this)).json() } }` lets you write
  `await 'https://example.com/data.json'.fetchJSON()`.
- **Several `extend` blocks for the same type merge**, so you can group extensions by topic.
- **Extensions are file-local.** Calls in another module, including one you import, are never
  rewritten to use them, and there is no supported way to share an `extend` block. For helpers
  you need in several files, export ordinary functions.

```tjs:inline
extend String {
  shout() {
    return this.toUpperCase() + '!'
  }
}

// A second block for String adds to the first.
extend String {
  initials() {
    return this.split(' ').map((w) => w[0]).join('')
  }
}

console.log('hello'.shout()) // HELLO!
console.log('Ada Lovelace'.initials()) // AL
console.log(typeof String.prototype.shout) // undefined: nothing was patched
```

## Which receivers work

Any expression whose value is of the extended type: a literal, a variable, a parameter, an
indexed element such as `rows[1].last()`, a parenthesised value such as `(7).clamp(0, 5)`, or
the result of another call, so `'a'.shout().shout()` chains. The type is checked when the call
runs, which is why a value passed around works as well as one written in place:

```tjs:inline
extend Array {
  last() {
    return this[this.length - 1]
  }
}

// `xs: [0]` means: an array of numbers, for example [0].
function lastOf(xs: [0]) {
  return xs.last()
}

const xs = [3, 1, 4]
console.log(xs.last()) // 4
console.log(lastOf([5, 9])) // 9

// Something that is not an array gets the call as written.
const playlist = { last() { return 'the final track' } }
console.log(playlist.last()) // the final track
```

One reading follows JavaScript and can surprise: `-7.5.clamp(0, 5)` means
`-(7.5.clamp(0, 5))`, so it returns `-5`, not `0`. Write `(-7.5).clamp(0, 5)` for the clamped
negative. A number literal also needs its decimal point or parentheses, `7.0.clamp()` or
`(7).clamp()`, because `7.clamp()` is not valid JavaScript.

## When to use it

`extend` gives the `value.method()` style for helpers that belong to one file, such as a
`toDate()` that lets you write `'2026-11-06'.toDate()` instead of `toDate('2026-11-06')`.
Extensions are file-local, so for helpers several files share, export ordinary functions.
