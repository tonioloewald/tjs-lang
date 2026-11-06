<!--{"section": "tjs", "type": "example", "group": "basics", "order": 15, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Honest Equality

This page is for readers who already know JavaScript. If you are learning to program, start
with [Decisions](/decisions/), which introduces `==` from scratch.

JavaScript's `==` converts between types before it compares, so `0 == ''` is `true`. Its
`===` doesn't convert, but it says a boxed `new String('hi')` is not `'hi'` and that `NaN`
is not `NaN`. In a `.tjs` file, `==` and `!=` are fixed, `typeof null` is `'null'`, and
deep comparison has its own name, `Is`. This page covers all of it, including the escapes
back to JavaScript's behaviour.

All of this applies to `.tjs` files only. A `.js` file, and TypeScript run through the
converter, keep JavaScript's rules; the last section says why.

## `==` does not convert types

In JavaScript, `==` converts its operands to a common type first, with surprising results:

```text
0 == ''          // true in JavaScript
false == []      // true in JavaScript
'' == false      // true in JavaScript
1 == '1'         // true in JavaScript
```

In TJS, values of different types are never equal:

```tjs:inline
console.log(0 == '')         // false
console.log(false == [])     // false
console.log(false == '')     // false
console.log(1 == '1')        // false
console.log(1 != '1')        // true
```

## Boxed primitives unwrap

A _boxed primitive_ is the object that `new String('hi')` makes, as opposed to the plain
string `'hi'`. JavaScript's `===` compares the box, not what is in it, so
`new String('hi') === 'hi'` is `false`. TJS's `==` looks inside:

```tjs:inline
console.log(new String('hi') == 'hi')       // true
console.log(new Boolean(false) == false)    // true
console.log(new Number(42) == 42)           // true
```

## `null`, `undefined` and `NaN`

`null` still equals `undefined`, so the familiar `x == null` check catches both. Neither
equals anything else. And `NaN` equals `NaN`, which in JavaScript it does not, under either
operator:

```tjs:inline
console.log(null == undefined)   // true
console.log(null == 0)           // false
console.log(null == '')          // false
console.log(NaN == NaN)          // true (JavaScript: false)
```

## Objects compare by reference

For objects and arrays, `==` asks whether both sides are the very same object. It does not
look at what is inside them, so the answer takes the same tiny amount of time however large
the objects are:

```tjs:inline
const obj = { x: 1 }
console.log(obj == obj)              // true: same object
console.log({ x: 1 } == { x: 1 })    // false: two objects
console.log([1, 2] == [1, 2])        // false: two arrays
```

## `typeof null` is `'null'`

In JavaScript, `typeof null` is `'object'`, a bug kept for compatibility. So the obvious
check for "is this an object?" lets `null` through:

```text
if (typeof x === 'object') x.name   // throws in JavaScript when x is null
```

In TJS, `typeof null` is `'null'`, and every other answer is unchanged:

```tjs:inline
console.log(typeof null)        // null
console.log(typeof undefined)   // undefined
console.log(typeof {})          // object
console.log(typeof 42)          // number
```

## Three questions, three spellings

TJS gives each kind of comparison its own spelling, so the code says which question it is
asking:

| you want to know…                        | write                     | cost                 |
| ---------------------------------------- | ------------------------- | -------------------- |
| are these the same value?                | `a == b`, `a != b`        | constant             |
| are these the very same object?          | `a === b`, `a !== b`      | constant             |
| do these have the same contents, deeply? | `Is(a, b)`, `IsNot(a, b)` | grows with the data  |

For objects, `==` and `===` agree (both check identity) unless the class defines
`asCompared()`, covered under "Your own types" below. They differ on boxed primitives, on
`null` against `undefined`, and on `NaN`.

`==` is the one you will use almost everywhere. It is JavaScript's `===` with these changes:

- a boxed primitive equals its plain value: `new String('hi') == 'hi'`
- `null` equals `undefined`, so `x == null` still checks for both
- `NaN` equals `NaN`
- an object with an `asCompared()` method compares as the value that method returns

It never converts between types, so `1 == '1'` is `false`. And it is deliberately **not**
structural (it does not compare contents): two separate arrays with the same items are two
different arrays, and finding that out costs nothing. If `==` compared contents, every
comparison of two large objects would quietly walk both of them.

`===` and `!==` keep exactly JavaScript's meaning. Reach for them when you mean identity,
"is this the same object?", and know that `NaN === NaN` is still `false` there:

```tjs:inline
const obj = { x: 1 }
console.log(obj === obj)                  // true
console.log(new String('a') === 'a')      // false: the box is not the string
console.log(NaN === NaN)                  // false, as in JavaScript
```

## What `Is` compares

`Is(a, b)` is **structural equality**: a deep comparison you ask for by name, so the cost
is visible. It walks both values. It compares plain objects key by key, arrays element by
element in order, `Set`s by membership regardless of order, `Map`s by entries, and dates
(`LegacyDate`) and regular expressions by value. It uses `==`'s rules at the leaves, so
`Is(5, '5')` is `false` and `Is([null], [undefined])` is `true`. A key that is present
with the value `undefined` still counts as a key: `Is({ a: 1, b: undefined }, { a: 1 })`
is `false`.

`IsNot(a, b)` is `!Is(a, b)`.

```tjs:inline
const people = [{ name: 'Ada' }, { name: 'Alan' }]
const wanted = { name: 'Ada' }

console.log(people.includes(wanted))               // false: no such object
console.log(people.some(p => Is(p, wanted)))       // true: same contents

console.log(Is([1, [2, 3]], [1, [2, 3]]))          // true: nested
console.log(Is([1, 2], [2, 1]))                    // false: order matters in arrays
console.log(Is(new Set([1, 2]), new Set([2, 1])))  // true: not in sets
console.log(Is(new Map([['a', 1]]), new Map([['a', 1]])))  // true
console.log(Is({ a: 1, b: undefined }, { a: 1 }))  // false: different keys
console.log(Is(5, '5'))                            // false: no conversion
console.log(IsNot([1, 2], [2, 1]))                 // true

test 'Is compares contents' {
  expect(Is({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
  expect(Is([1, 2], [2, 1])).toBe(false)
}
```

The `test` block at the end runs as an inline check when the page loads; see
[Inline Tests](/inline-tests-test-private-functions/).

Three limits are worth knowing:

- **Prototypes are not compared.** Only own enumerable string keys are walked, so a class
  instance and a plain object with the same keys are `Is`-equal. Define `Equals` (below)
  if the class matters.
- **Set members and Map keys are matched the way JavaScript's `has` matches them**, which
  for objects means by identity. Only Map _values_ are compared with `Is`. So
  `Is(new Set([{ a: 1 }]), new Set([{ a: 1 }]))` is `false`.
- **In a `.tjs` file, dates are made with `LegacyDate` or `Timestamp`**, because
  `new Date()` is refused there.

```tjs:inline
class Point {
  constructor(x: 0) {
    this.x = x
  }
}
console.log(Is(Point(1), { x: 1 }))                      // true: prototype ignored
console.log(Is(new Set([{ a: 1 }]), new Set([{ a: 1 }])))  // false: two objects
console.log(Is(LegacyDate(5), LegacyDate(5)))            // true
console.log(Is(/a/g, /a/i))                              // false: different flags
```

(`Point(1)` without `new` is how TJS constructs a class; see
[Better Classes](/better-classes/). `x: 0` in the constructor declares an _example_ value,
not a type; see [Hello TJS](/hello-tjs/).)

You can also write `a Is b` and `a IsNot b`. The operands can be names, property paths,
calls, indexes or literals, and the form works inside an argument list, as in
`console.log(a Is b)`. When another operator touches an operand, as in `a + 1 Is b`, TJS
refuses with a syntax error that asks for `Is(a + 1, b)` rather than guessing the
precedence. The call form is never ambiguous.

## Your own types

A class has three ways to say what equality means for it. They answer different questions.

**`asCompared()` changes what `==` sees.** It returns a primitive (a number, string,
boolean, `null` or `undefined`) that stands for the object whenever it is compared. `==`,
`!=` and `Is` use it, and so does truthiness: an object whose `asCompared()` returns `0`
is falsy, so `if (price)` agrees with `price == 0`. A method that returns anything else,
or throws, is ignored, and the object compares by reference as usual.

**`Equals(other)` changes what `Is` decides.** `Is` calls it instead of walking the object.
Use it when two objects with different fields should still count as the same, for example
because one holds a cache. When a class defines both, `Is` uses `Equals`.

`==` never calls `Equals`. Apart from `asCompared()`, whose errors it ignores, `==` runs
none of your code, so it stays fast and cannot throw.

**`[tjsEquals](other)`** is the same hook as `Equals`, keyed by the symbol
`Symbol.for('tjs.equals')` instead of a name. Use it when an object might have a real
data property called `Equals`, such as a record whose fields come from outside your code.
When both are present, the symbol wins. `Is` checks both operands, so the hook works on
either side.

A `.tjs` file that calls `Is` or `IsNot` has `tjsEquals` in scope. A file that does not
must name the symbol itself, `const tjsEquals = Symbol.for('tjs.equals')`, and outside a
`.tjs` file you can import it: `import { tjsEquals } from 'tjs-lang/runtime'`.

```tjs:inline
class Cents {
  constructor(n: 0) {
    this.n = n
  }
  asCompared() {
    return this.n
  }
}

console.log(Cents(500) == Cents(500))       // true: both compare as 500
console.log(Cents(500) == 500)              // true
console.log(Cents(500) === Cents(500))      // false: still two objects
console.log(Cents(0) ? 'truthy' : 'falsy')  // falsy: compares as 0

class Money {
  constructor(cents: 0, currency: 'USD') {
    this.cents = cents
    this.currency = currency
    this.formatted = null
  }
  Equals(other) {
    return other instanceof Money &&
      other.cents == this.cents && other.currency == this.currency
  }
}

const a = Money(500, 'USD')
const b = Money(500, 'USD')
b.formatted = '$5.00'
console.log(Is(a, b))   // true: Equals ignores the cached string
console.log(a == b)     // false: == never calls Equals

// An object that compares as some other value
const canonical = { x: 1, y: 2 }
const view = {
  [tjsEquals](other) { return Is(canonical, other) }
}
console.log(Is(view, { x: 1, y: 2 }))   // true
console.log(Is({ x: 1, y: 2 }, view))   // true: the hook works on either side
console.log(IsNot(view, { x: 9 }))      // true
```

## The way back to JavaScript

When you genuinely need JavaScript's old operators, each has a long, deliberately awkward
name, so the exception is visible in review and easy to search for:

| JavaScript            | TJS escape                                                 |
| --------------------- | ---------------------------------------------------------- |
| `a == b` / `a != b`   | `DangerousLegacyEquals(a, b)` / `DangerousLegacyNot(a, b)` |
| `a === b` / `a !== b` | `LegacyExactly(a, b)` / `LegacyNotExactly(a, b)`           |
| `typeof x`            | `LegacyTypeOf(x)`                                          |

```tjs:inline
console.log(DangerousLegacyEquals(0, ''))       // true: conversion and all
console.log(DangerousLegacyEquals('5', 5))      // true
console.log(DangerousLegacyNot(0, ''))          // false
console.log(LegacyExactly(NaN, NaN))            // false
console.log(LegacyNotExactly(new String('a'), 'a'))  // true
console.log(LegacyTypeOf(null))                 // object
```

The `==` pair is called _Dangerous_ because JavaScript's conversion calls `valueOf()` or
`toString()` on any object operand, implicitly, so a comparison can run arbitrary code that
nobody wrote for that purpose. TJS's `asCompared()` is different: a class opts in by
defining it, and its errors are ignored. The `===` pair cannot run your code; its warts are
only wrong answers, so it is merely _Legacy_. There are no short aliases, on purpose.

You never need `LegacyExactly` or `LegacyNotExactly` in hand-written TJS: `===` and `!==`
already mean exactly that. They exist so the set of escapes is complete.

## Things that trip people up

### Library methods still use JavaScript's rules

`==` is rewritten in your code, but `includes`, `indexOf`, `Set`, `Map` and every other
built-in compare the way JavaScript does, and not even consistently with each other. When
it matters, compare with `==` or `Is` yourself.

```tjs:inline
const list = [1, 2, 3]
const boxed = new Number(1)

console.log(boxed == 1)                    // true: your code, TJS rules
console.log(list.includes(boxed))          // false: JavaScript's method
console.log(list.some(x => x == boxed))    // true

console.log([NaN].includes(NaN))           // true
console.log([NaN].indexOf(NaN))            // -1: two methods, two rules
```

### `switch` compares with `===`

`switch` keeps JavaScript's semantics exactly, so `switch (new String('cat'))` never
reaches `case 'cat':`, and the transpiler warns when it sees a `switch` in a `.tjs` file.
Use [`given`](/given-dispatch/), which compares with `==` and has no fallthrough:

```tjs:inline
function label(kind) {
  given kind {
    'cat', 'dog' { return 'pet' }
  } else {
    return 'other'
  }
}
console.log(label(new String('cat')))      // pet
```

### `Is` is not free

It walks both values. Use it where you mean "same contents", such as in tests and change
detection, not as a habit in hot loops.

### Only `.tjs` files get this

A `.js` file keeps JavaScript's `==` and `typeof`, because TJS must run every JavaScript
program unchanged. So does TypeScript converted to TJS with `fromTS`: it is marked as
carrying JavaScript semantics until you graduate it to native TJS.

The rules belong to the file where the comparison is written, not to where the values came
from. A `.tjs` function that compares an object from a `.js` module uses TJS's `==`,
including that object's `asCompared()`. A `.js` module comparing objects from a `.tjs`
module uses JavaScript's `==`, and `asCompared()` means nothing there.
