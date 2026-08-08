<!--{"section": "home", "order": 6, "navTitle": "TJS vs TypeScript"}-->

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

**"rejected" means the compiler refused it.** A value means it compiled and that is what
it printed.

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
const input = unsafe new Input()
input.value = 42
console.log(input.value)
```

| | TypeScript | TJS |
| --- | --- | --- |
| result | **rejected** | `42` |

The DOM spec coerces to a string on assignment. TypeScript models `value` as a plain `string` property, so it rejects code the platform is specified to accept.

---

### `typeof null`

```js
console.log(typeof null)
```

| | TypeScript | TJS |
| --- | --- | --- |
| result | `object` | `null` |

A 1995 bug JavaScript cannot fix without breaking the web. TypeScript inherits it; TJS reports what the value actually is.

---

### `==` between a string and a number

```js
console.log('5' == 5)
```

| | TypeScript | TJS |
| --- | --- | --- |
| result | **rejected** | `false` |

TypeScript CATCHES this one — TS2367, "no overlap" — whenever it can see both types statically. TJS makes it `false` at runtime instead, which also covers the case where TypeScript cannot see them (next row).

---

### `==` when the type is not statically known

```js
const a = JSON.parse('"5"')
console.log(a == 5)
```

| | TypeScript | TJS |
| --- | --- | --- |
| result | `true` | `false` |

The honest version of the previous row. Once a value is `any` — which is what arrives from JSON, the DOM or a network — TypeScript has nothing to compare and the coercion is back. TJS never coerces, because the check happens where the value is.

---

### `var`

```js
var x = 1
console.log(x)
```

| | TypeScript | TJS |
| --- | --- | --- |
| result | `1` | **rejected** |

Function-scoped hoisting is a hazard with no remaining use. `unsafe var x = 1` keeps it at a single site when a port needs it.

---

### `new Date()`

```js
const d = new Date(0)
console.log(d.getTime())
```

| | TypeScript | TJS |
| --- | --- | --- |
| result | `0` | **rejected** |

`Date` is mutable and timezone-dependent. `Timestamp` is epoch milliseconds and pure; `unsafe new Date(x)` is the per-site escape.

---

### Distinguishing an integer from a float

```js
function f(n: int) { return n }
console.log(String(f(2.5)).slice(0, 22))
```

| | TypeScript | TJS |
| --- | --- | --- |
| result | — | `MonadicError: Expected` |

TypeScript has one numeric type, so "this is a count/index/id" is inexpressible and ends up policed by comments. `int`, `unsigned` and `float` name the distinction.

---

### A type that survives to runtime

```js
function greet(name: '') { return 'hi ' + name }
console.log(String(greet(42)).slice(0, 22))
```

| | TypeScript | TJS |
| --- | --- | --- |
| result | — | `MonadicError: Expected` |

TypeScript erases annotations before the program runs, so a value arriving from JSON, the DOM or a network is unchecked. TJS checks at the boundary and returns a `MonadicError` rather than throwing.

---

### The annotation IS a test

```js
function add(a: 2, b: 3): 5 { return a + b }
console.log('ok')
```

| | TypeScript | TJS |
| --- | --- | --- |
| result | — | `ok` |

A return example is a worked example, compared by deep equality at build time. `add(2, 3)` must be 5 — change the body to `a - b` and the build fails, with no test file and no runner.

---

### A wrong worked example fails the build

```js
function add(a: 2, b: 3): 6 { return a + b }
```

| | TypeScript | TJS |
| --- | --- | --- |
| result | — | **rejected** |

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

| | TypeScript | TJS |
| --- | --- | --- |
| result | — | `MonadicError: Expected` |

An index signature forces one type across all keys and a mapped type needs them enumerated in advance, so TypeScript cannot express a convention over an OPEN key set. A predicate reads the name and decides.

---

## Adding a row

Edit `src/lang/differences.ts`, then run `bun run docs:differences`. If
`differences.test.ts` disagrees with your row, it is reporting the language as it is —
which is the point. A row that cannot be executed does not belong on this page.
