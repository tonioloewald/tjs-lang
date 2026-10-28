<!--{"section": "home", "order": 1, "navTitle": "TJS vs TypeScript", "parent": "typescript-good-bad-ugly.md"}-->

# TJS vs TypeScript vs JavaScript

<!-- GENERATED FILE — do not edit.
     Source: src/lang/differences.ts
     Regenerate: bun run docs:differences
     Every row below is executed against `tsc --strict` and TJS by
     src/lang/differences.test.ts, which fails if a documented result is not the
     observed one. -->

Every difference on this page is **executed**, not asserted. Each snippet is run through
`tsc --strict` and through TJS on every test run, and the table below reports what those
compilers actually did — not what someone believed when they wrote the page.

That matters more than it sounds. One review cycle of this project turned up six
documented behaviours that did not exist: an arrow return syntax that was never
implemented, a `predicate =>` form that parsed and validated nothing, `.d.ts` stubs that
were never emitted, annotations documented as checked that resolved to `any`, an editor
completion suggesting a form the compiler rejects, and a playground page teaching nine
abolished directives. Not one was caught by reading.

For each snippet you see what each compiler actually did: what the program printed, or the
compile error it reported, quoted as the compiler wrote it.

### Assigning a number to a DOM string property

```ts
declare const input: HTMLInputElement
input.value = 42
```

The same program in TJS (the snippet above is TypeScript-only syntax):

```js
class Input {
  constructor() { this._v = "" }
  get value() { return this._v }
  set value(x) { this._v = String(x) }
}
const input = Input()
input.value = 42
console.log(input.value)
```

**TypeScript (`tsc --strict`)**: compile error

```text
TS2322: Type 'number' is not assignable to type 'string'.
```

**TJS**: compiles and prints `42`

The DOM spec coerces to a string on assignment. TypeScript models `value` as a plain `string` property, so it rejects code the platform is specified to accept.

---

### `typeof null`

```js
console.log(typeof null)
```

**TypeScript (`tsc --strict`)**: compiles and prints `object`

**TJS**: compiles and prints `null`

A 1995 bug JavaScript cannot fix without breaking the web. TypeScript inherits it; TJS reports what the value actually is.

---

### `==` between a string and a number

```js
console.log('5' == 5)
```

**TypeScript (`tsc --strict`)**: compile error

```text
TS2367: This comparison appears to be unintentional because the types 'string' and 'number' have no overlap.
```

**TJS**: compiles and prints `false`

TJS `==` compares the actual values when the line runs and never converts one type to another, so a string is never equal to a number. TypeScript refuses to compile this line (TS2367, "no overlap") because it can see both types here; the next row is what happens when it cannot.

---

### `==` when the type is not statically known

```js
const a = JSON.parse('"5"')
console.log(a == 5)
```

**TypeScript (`tsc --strict`)**: compiles and prints `true`

**TJS**: compiles and prints `false`

The same comparison, with the string coming from `JSON.parse`. TypeScript only checks what it can see at compile time, so it says nothing here, and JavaScript `==` converts `'5'` to `5`. TJS does not depend on compile-time knowledge: it compares the values when the line runs, and `'5'` is still a string.

---

### `var`

```js
var x = 1
console.log(x)
```

**TypeScript (`tsc --strict`)**: compiles and prints `1`

**TJS**: compile error

```text
`var` is not allowed in TJS — use `const` or `let`.
```

`var` is banned outright: a `.tjs` file may not contain it, whatever the code does with it, and there is no escape. `let` and `const` cover every use. The reason for the ban is what `var` CAN do (function-scoped hoisting, silent redeclaration), not anything this line does.

---

### `new Date()`

```js
const d = new Date(0)
console.log(d.getTime())
```

**TypeScript (`tsc --strict`)**: compiles and prints `0`

**TJS**: compile error

```text
`new Date()` is not allowed in TJS — the Date object is mutable and timezone-dependent.
```

`Date` is mutable and timezone-dependent. `Timestamp` is epoch milliseconds and pure; `LegacyDate(x)` is the per-site escape when you need a real `Date`.

---

### Distinguishing an integer from a float

```js
function f(n: int) { return n }
console.log(String(f(2.5)).slice(0, 22))
```

**TypeScript (`tsc --strict`)**: not comparable — the snippet is not valid input here.

**TJS**: compiles and prints `MonadicError: Expected`

TypeScript has one numeric type, so "this is a count/index/id" is inexpressible and ends up policed by comments. `int`, `unsigned` and `float` name the distinction.

---

### A type that survives to runtime

```js
function greet(name: '') { return 'hi ' + name }
console.log(String(greet(42)).slice(0, 22))
```

**TypeScript (`tsc --strict`)**: not comparable — the snippet is not valid input here.

**TJS**: compiles and prints `MonadicError: Expected`

TypeScript erases annotations before the program runs, so a value arriving from JSON, the DOM or a network is unchecked. TJS checks at the boundary and returns a `MonadicError` rather than throwing.

---

### The annotation IS a test

```js
function add(a: 2, b: 3): 5 { return a + b }
console.log('ok')
```

**TypeScript (`tsc --strict`)**: not comparable — the snippet is not valid input here.

**TJS**: compiles and prints `ok`

A return example is a worked example, compared by deep equality at build time. `add(2, 3)` must be 5 — change the body to `a - b` and the build fails, with no test file and no runner.

---

### A wrong worked example fails the build

```js
function add(a: 2, b: 3): 6 { return a + b }
```

**TypeScript (`tsc --strict`)**: not comparable — the snippet is not valid input here.

**TJS**: compile error

```text
Function signature example is inconsistent:
    Expected 6 at 'add', got 5
```

The other half of the previous row: the example is checked, not decoration. TypeScript has no equivalent — a return type cannot be wrong about a value.

---

### Property names that declare their own types

```js
Type Prefixed {
  example: {}
  predicate(o) {
    return Object.entries(o).every(([k, v]) =>
      k.startsWith('is') ? typeof v === 'boolean' : true
    )
  }
}
function render(p: Prefixed) { return 1 }
console.log(String(render({ isOpen: 'yes' })).slice(0, 22))
```

**TypeScript (`tsc --strict`)**: not comparable — the snippet is not valid input here.

**TJS**: compiles and prints `MonadicError: Expected`

An index signature forces one type across all keys and a mapped type needs them enumerated in advance, so TypeScript cannot express a convention over an OPEN key set. A predicate reads the name and decides.

---

### A predicate that reads as a definition: `predicate { return expr }`

```js
Type Even {
  example: 2
  predicate { return Even % 2 === 0 }
}
console.log(Even.check(4), Even.check(3))
```

**TypeScript (`tsc --strict`)**: not comparable — the snippet is not valid input here.

**TJS**: compiles and prints `true false`

Inside a `Type` block the type NAME is the value under test, so `Even % 2 === 0` reads as "an Even is a value where …". The body is an ordinary block, so `return` is required, exactly as in JavaScript: nothing new to learn. (`predicate(x) { … }` names the value explicitly instead.)

---

### A parameterized type needs no predicate to check its parameter

```js
Type Box<T> {
  example: { value: T }
}
console.log(Box(0).check({ value: 7 }), Box(0).check({ value: 's' }))
```

**TypeScript (`tsc --strict`)**: not comparable — the snippet is not valid input here.

**TJS**: compiles and prints `true false`

The example already says WHERE the parameter goes, so `T` applied at that slot is derivable and writing `predicate(x, T) { return T(x.value) }` restates it. Until this was built, omitting the predicate emitted `Generic([...], () => true)` — a parameterized type that accepted every value while looking like it checked one.

---

### Type arguments in an annotation: `b: Box<int>`

```js
Type Box<T> {
  predicate(x, T) { return T(x.value) }
}
function unbox(b: Box<int>) { return b.value }
console.log(String(unbox({ value: 1.5 })).slice(0, 22))
```

**TypeScript (`tsc --strict`)**: not comparable — the snippet is not valid input here.

**TJS**: compiles and prints `MonadicError: Expected`

A parameterized type applied to arguments is a CALL at run time, and a primitive argument has no runtime binding — so it becomes a PREDICATE, the only representation available for a type that is not a value. The applied type is hoisted to a module-level `const` named after the annotation, so it is built once rather than per call and the emitter's existing declared-type path handles it unchanged. Composes: `Box<Box<int>>` works because a parameterized type is itself a valid type argument.

---

### Two functions with the same name

```js
function area(w: number) { return w * w }
function area(w: number, h: number) { return w * h }
console.log(area(3), area(3, 4))
```

The same program in TJS (the snippet above is TypeScript-only syntax):

```js
function area(w: 0.0) { return w * w }
function area(w: 0.0, h: 0.0) { return w * h }
console.log(area(3.0), area(3.0, 4.0))
```

**TypeScript (`tsc --strict`)**: compile error

```text
TS2393: Duplicate function implementation.
```

**TJS**: compiles and prints `9 12`

TypeScript HAS overloads, but they are signature declarations over ONE implementation — TS2393 for a second body — and they are erased entirely, so you write the dispatch by hand. TJS merges same-name declarations into a real arity/type dispatcher, so each case is its own function.

---

### `new` on a user class

```js
class P { constructor(x: 0) { this.x = x } }
const p = new P(1)
```

**TypeScript (`tsc --strict`)**: not comparable — the snippet is not valid input here.

**TJS**: compile error

```text
`new P` is not allowed in TJS — a class is CALLED, so `P(…)` does exactly what `new P(…)` does and returns the same object. Drop the keyword.
```

`P(1)` and `new P(2)` produce identical objects — a TJS class is CALLED — so `new` was decoration with the look of significance. Scoped to classes declared in the file: for a built-in `new` is MANDATORY (`new Float32Array(4)` throws without it), a limit found by shipping the general rule and watching eight examples break within a minute.

---

### Calling a class without `new`

```js
class P { constructor(x: 0) { this.x = x } }
const p = P(1)
console.log(p.x)
```

**TypeScript (`tsc --strict`)**: not comparable — the snippet is not valid input here.

**TJS**: compiles and prints `1`

A TJS class is called, not constructed — `new` adds nothing. In JavaScript (and TypeScript) calling a class without `new` is a TypeError, so the ceremony is mandatory even though it carries no information.

---

## Adding a row

Edit `src/lang/differences.ts`, then run `bun run docs:differences`. If
`differences.test.ts` disagrees with your row, it is reporting the language as it is —
which is the point. A row that cannot be executed does not belong on this page.
