<!--{"section": "tjs", "order": 21, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Local Class Extensions

`extend TypeName { ... }` lets you write `'hello world'.capitalize()` or `[1, 2, 3].last()`
without adding anything to `String.prototype` or `Array.prototype`. It works at compile time:
the transpiler rewrites each such call into a plain function call, in the current file only.

> **The limit:** a call is rewritten only when the receiver is written out as a literal, such
> as `'hello'` or `[1, 2, 3]`. `xs.last()` on a variable is not rewritten and fails when it
> runs. The section "The limit you will hit" below explains why and what to do instead.

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

`extend` is useful for `String`, `Array` and `Number`, the types whose values you can write as
literals. You may write `extend Map`, `extend Date` or `extend` one of your own classes, and it
compiles, but no call is ever rewritten for them: `new Map().size2()` fails at runtime with a
`TypeError`.

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

The methods are collected into a plain object belonging to this file, and each call on a
literal is rewritten to an ordinary function call with the literal as `this`:

```javascript
// You write
'hello world'.capitalize();
[1, 2, 3].last();

// TJS emits
__ext_String.capitalize.call('hello world');
__ext_Array.last.call([1, 2, 3]);
```

Nothing is added to any prototype, and the call costs the same as calling a function.

## Rules for extension methods

- **Methods use `this`**, as they would in a class, so write them with method syntax:

  ```javascript
  extend Array {
    last() { return this[this.length - 1] }  // correct
    last() => this[0]                        // compile error: arrow functions are not allowed
    last = () => this[0]                     // compiles, but defines nothing
  }
  ```

  The last form is not reported. `[1].last()` is then not rewritten and throws
  `TypeError: [1].last is not a function` when it runs.

- **Parameter examples become defaults, not checks.** In an ordinary TJS function,
  `min: 0.0` means "required, must be a number" (see [parameters](/TJS-SYNTAX/)). Inside
  `extend`, the same `min: 0.0` means "defaults to 0, not checked". So `7.5.clamp()` uses
  `min = 0` and `max = 1` and returns `1`, and `7.5.clamp('a', 5)` returns `NaN`, not an
  error. If the arguments matter, check them inside the method, or write an ordinary function,
  where the checks do apply.
- **A method with the same name as a built-in one replaces it, on literals only.** With
  `extend Array { map(f) { … } }`, `[1].map(f)` calls your `map`, while `xs.map(f)` still calls
  `Array.prototype.map`. The same call then behaves differently depending on how the receiver
  is written, so choose names the built-in types do not use.
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

## The limit you will hit: only literal receivers are rewritten

The rewrite is a source transform: it runs on the text of the file, before the file is parsed
and before any type information exists. It sees `xs.last()` as a name followed by `.last()`,
with no way to know what `xs` holds, and a variable can be reassigned to something else
anyway. So it acts only where the text itself shows the type:

| Receiver                                                 | Rewritten?                 |
| -------------------------------------------------------- | -------------------------- |
| `'text'`, `"text"`, `` `text ${x}` ``                    | yes                        |
| an array literal, including one built by spread: `[1, 2]`, `[...xs]` | yes            |
| a number written as plain digits: `7`, `7.5`, `12.0`     | yes                        |
| a negative number: `-7.5.clamp(0, 5)`                    | yes, but the minus applies last: `-5` |
| `(7).clamp()`, `7..clamp()`                              | no                         |
| a variable: `xs`, `name`                                 | no                         |
| a call result: `'a'.shout().shout()`                     | only the first call        |
| an indexed element `rows[1].last()`, or a name ending in a digit `v2.clamp()` | wrongly rewritten (see below) |

**Chaining extension methods does not work.** In `'a'.shout().shout()` the second call is not
rewritten and throws a `TypeError`.

As in JavaScript, `-7.5.clamp(0, 5)` means `-(7.5.clamp(0, 5))`, so it returns `-5`, not `0`.
Writing `(-7.5).clamp(0, 5)` does not help, because parenthesised numbers are not rewritten. For
a negative value, use an ordinary function.

When the call is not rewritten it runs exactly as written. No prototype was changed, so the
method really does not exist, and the call fails with a `TypeError` when it runs, not when it
compiles:

```tjs:inline
extend Array {
  last() {
    return this[this.length - 1]
  }
}

// `xs: [0]` means: an array of numbers, for example [0].
function lastOf(xs: [0]) {
  return xs[xs.length - 1]
}

const xs = [3, 1, 4]

try {
  xs.last()
} catch (e) {
  console.log('xs.last() failed:', e instanceof TypeError) // true
}

// Wrapping the value in a literal works, at the cost of a copy.
console.log([...xs].last()) // 4

// For values you pass around, an ordinary function is the honest choice.
console.log(lastOf(xs)) // 4
```

The string form of the same workaround is a template literal: `` `${name}`.capitalize() ``.

**Two receivers are rewritten wrongly instead of being left alone.** Because the rewrite matches
text, it mistakes `[1]` in `rows[1].last()` for an array literal, producing
`rows__ext_Array.last.call([1])`, and the `2` in `v2.clamp()` for a number, producing
`v__ext_Number.clamp.call(2)`. Both fail at runtime with a `ReferenceError` naming a variable
you never wrote (`rows__ext_Array is not defined`). This is a bug in the transform; until it is
fixed, avoid calling extension methods on indexed elements and on names that end in a digit.

## When to use it

`extend` is a limited feature. It pays off where the receivers really are written in place:
string and array constants in tests, configuration tables, or small scripts, where
a `toDate()` extension lets you write `'2026-11-06'.toDate()` instead of `toDate('2026-11-06')`. For anything you store in a
variable or pass around, which is most code, an ordinary function does the same job and works
on every value.
