<!--{"section": "tjs", "type": "example", "group": "featured", "order": 1, "parent": "tjs-featured.md"}-->

# TJS Grammar Reference

Comprehensive reference covering all major TJS syntax features. Each section is exercised by
a test in the runnable code below; the type declarations have their own example after it.

```tjs:inline
// ═══════════════════════════════════════════════════════════
// 1. SAFETY DIRECTIVE
// Must appear before any other code.
// ═══════════════════════════════════════════════════════════

safety inputs

// Honest equality, callable-without-new classes and the `var` ban are simply how
// `.tjs` behaves — there are no mode directives to enable them.

/#
# TJS Grammar Reference

A runnable reference for TJS syntax. Each section demonstrates a
feature with a test proving it works.

## Quick Index
| Feature | Section |
|---------|---------|
| Safety directive | `safety` |
| Parameters | Colon `:`, optional `=`, destructured `{}` |
| Numeric narrowing | `42` int, `3.14` float, `+0` non-negative |
| Return types | `:`, `:?`, `:!` |
| Safety markers | `(! ...)` unsafe, `(? ...)` safe |
| Type/Generic/Enum/Union | The declarations example below |
| Bare assignments | `Uppercase = ...` |
| Classes | Callable without `new` |
| Polymorphic functions | Same name, different signatures |
| Polymorphic constructors | Multiple `constructor()` |
| Local extensions | `extend String { ... }` |
| Equality | `==` honest, `===` identity, `Is`/`IsNot` |
| Try without catch | Monadic error conversion |
| Inline tests | Test blocks |
| Doc comments | Slash-hash markdown blocks |
#/

// ═══════════════════════════════════════════════════════════
// 2. PARAMETER SYNTAX
// ═══════════════════════════════════════════════════════════

/#
## Parameters

Colon `:` = required (example value infers type).
Equals `=` = optional (default value).
Question mark `?:` = optional (TS-style).
#/

// Required params (colon shorthand)
function greet(name: 'Alice'): 'Hello, Alice' {
  return 'Hello, ' + name
}

// Optional params (equals = default)
function greetOpt(name = 'World'): 'Hello, World' {
  return 'Hello, ' + name
}

// Destructured object params (colon = required, equals = optional)
function createUser({ name: 'Anon', role = 'user' }): { name: 'Anon', role: 'user' } {
  return { name, role }
}

// Numeric type narrowing: 42 = integer, 3.14 = float, +0 = non-negative int
function calc(count: 42, rate: 3.14, index: +0): 131.88 {
  return (count + index) * rate
}

test 'parameter syntax' {
  expect(greet('Bob')).toBe('Hello, Bob')
  expect(greetOpt()).toBe('Hello, World')
  expect(createUser({ name: 'Eve' })).toEqual({ name: 'Eve', role: 'user' })
  expect(calc(10, 1.5, 2)).toBe(18)
}

// ═══════════════════════════════════════════════════════════
// 3. RETURN TYPES
// ═══════════════════════════════════════════════════════════

/#
## Return Types

`:` signature test at transpile time.
`:?` signature test + runtime output validation.
`:!` skip signature test entirely.
#/

// : transpile-time check (double(5) must equal 10)
function double(x: 5): 10 {
  return x * 2
}

// :! skip test (useful when return shape varies)
function safeDivide(a: 10, b: 2):! 5 {
  if (b === 0) return { error: 'div by zero' }
  return a / b
}

test 'return types' {
  expect(double(7)).toBe(14)
  expect(safeDivide(10, 0)).toEqual({ error: 'div by zero' })
}

// ═══════════════════════════════════════════════════════════
// 4. SAFETY MARKERS
// ═══════════════════════════════════════════════════════════

/#
## Safety Markers

`!` = unsafe (skip input validation). Fast path for trusted callers.
`?` = safe (states that inputs are validated, which under the default
`safety inputs` every function already does).
#/

function fastAdd(! a: 0, b: 0): 0 {
  return a + b
}

function safeAdd(? a: 0, b: 0): 0 {
  return a + b
}

test 'safety markers' {
  expect(fastAdd(3, 4)).toBe(7)
  expect(safeAdd(3, 4)).toBe(7)
}

// ═══════════════════════════════════════════════════════════
// 5. BARE ASSIGNMENTS
// ═══════════════════════════════════════════════════════════

/#
## Bare Assignments

Uppercase identifiers auto-get `const` — a native-TJS convenience (off for plain
JS / TS / VM). It fires only on the **first** assignment of an undeclared name;
a reassignment of an already-declared binding (`let B = null; B = 2`) is left
alone. Since the first assignment becomes `const`, use `let` if you need it to
change later.
#/

Greeting = 'Hello'
MaxRetries = 3

test 'bare assignments' {
  expect(Greeting).toBe('Hello')
  expect(MaxRetries).toBe(3)
}

// ═══════════════════════════════════════════════════════════
// 7. CLASSES (callable without new)
// ═══════════════════════════════════════════════════════════

/#
## Classes

Classes are callable without `new` by default in native TJS.
#/

class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }

  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }
}

test 'classes callable without new' {
  const p = Point(3, 4)
  expect(p instanceof Point).toBe(true)
  expect(p.magnitude()).toBe(5)
}

// ═══════════════════════════════════════════════════════════
// 8. POLYMORPHIC FUNCTIONS
// ═══════════════════════════════════════════════════════════

/#
## Polymorphic Functions

Same name, different signatures. Dispatched by arity/type.
See the **Polymorphic Functions** example for more.
#/

function describe(value: 0) {
  return 'number: ' + value
}

function describe(first: '', last: '') {
  return first + ' ' + last
}

test 'polymorphic dispatch by arity' {
  expect(describe(42)).toBe('number: 42')
  expect(describe('Jane', 'Doe')).toBe('Jane Doe')
}

// ═══════════════════════════════════════════════════════════
// 9. POLYMORPHIC CONSTRUCTORS
// ═══════════════════════════════════════════════════════════

/#
## Polymorphic Constructors

Multiple `constructor()` declarations in a class.
See the **Polymorphic Constructors** example for more.
#/

class Vec2 {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }

  constructor(obj: { x: 0.0, y: 0.0 }) {
    this.x = obj.x
    this.y = obj.y
  }
}

test 'polymorphic constructors' {
  const a = Vec2(1, 2)
  const b = Vec2({ x: 1, y: 2 })
  expect(a.x).toBe(b.x)
  expect(a.y).toBe(b.y)
}

// ═══════════════════════════════════════════════════════════
// 10. LOCAL EXTENSIONS
// ═══════════════════════════════════════════════════════════

/#
## Local Extensions

Add methods to built-in types without prototype pollution.
Rewritten to `.call()` at transpile time for known types.
See the **Local Extensions** example for a runnable demo.

    extend String {
      capitalize() { return this[0].toUpperCase() + this.slice(1) }
    }

    extend Array {
      last() { return this[this.length - 1] }
    }

    'hello'.capitalize()  // 'Hello'
    [1, 2, 3].last()      // 3
#/

// ═══════════════════════════════════════════════════════════
// 11. EQUALITY OPERATORS
// ═══════════════════════════════════════════════════════════

/#
## Equality

Honest equality is on by default in native TJS:
- `==` / `!=` use honest equality (no coercion, unwraps boxed primitives)
- `===` / `!==` are identity checks (same reference)
- `Is` / `IsNot` are explicit structural operators (deep comparison)

    const a = { x: 1, y: [2, 3] }
    const b = { x: 1, y: [2, 3] }
    a == b       // false (objects compare by reference; == is NOT structural)
    a === b      // false (identity: different objects)
    a Is b       // true  (explicit structural)
    a IsNot b    // false
#/

// ═══════════════════════════════════════════════════════════
// 12. TRY WITHOUT CATCH
// ═══════════════════════════════════════════════════════════

/#
## Try Without Catch

A bare `try` block auto-converts exceptions to monadic errors.
#/

function parseJSON(s: '{"a":1}'):! { a: 1 } {
  try {
    return JSON.parse(s)
  }
}

test 'try without catch' {
  expect(parseJSON('{"ok":true}')).toEqual({ ok: true })
  const bad = parseJSON('not json')
  expect(bad instanceof Error).toBe(true)
}

// ═══════════════════════════════════════════════════════════
// 13. INLINE TESTS
// ═══════════════════════════════════════════════════════════

/#
## Inline Tests

Test blocks run at transpile time and are stripped from
output. They have full access to the module scope, so you
can test private functions without exporting them.
#/

function _private(x: 0): 0 {
  return x * x
}

test 'inline tests can reach private functions' {
  expect(_private(5)).toBe(25)
}

// ═══════════════════════════════════════════════════════════
// 14. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════

/#
## Module Exports

Standard ES module syntax works. Functions and values
can be exported for use by other modules.
#/

export function publicHelper(x: 0): 1 {
  return x + 1
}

// ═══════════════════════════════════════════════════════════
// 15. TDOC COMMENTS
// ═══════════════════════════════════════════════════════════

/#
## Doc Comments

These comment blocks (opened with slash-hash on a line of its
own, closed with hash-slash) contain markdown that becomes rich
documentation in the playground and API docs. They nest, so a
doc comment can quote any syntax. Every such block you've seen
above is one.
#/

// ═══════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════

console.log('TJS Grammar Reference — all tests passed!')
console.log('Features demonstrated:', [
  'safety directive', 'colon params', 'optional params',
  'destructured params', 'numeric narrowing',
  'return types (: :? :!)', 'safety markers (! ?)',
  'bare assignments',
  'classes', 'polymorphic functions', 'polymorphic constructors',
  'local extensions', 'honest equality', 'Is/IsNot',
  'try without catch', 'inline tests', 'module exports', 'doc comments'
].join(', '))
```

<!-- TODO review -->
## Declarations: types that exist at run time

`Type`, `Generic`, `Enum` and `Union` declare values you can call at run time, not
annotations that disappear. They need nothing beyond the inline runtime every emitted file
carries:

```tjs:inline
Type Name 'Alice'

Type Age {
  description: 'a non-negative age'
  example: 25
  predicate(x) { return typeof x === 'number' && x >= 0 }
}

Generic Pair<A, B> {
  description: 'a pair of values'
  predicate(obj, A, B) { return A(obj.first) && B(obj.second) }
}

Enum Color 'CSS color' {
  Red = 'red'
  Green = 'green'
  Blue = 'blue'
}

Union Status 'task status' 'pending' | 'active' | 'done'

console.log('Name:   ', Name.check('Bob'), Name.check(3))
console.log('Age:    ', Age.check(30), Age.check(-1))
console.log('Pair:   ', Pair(Name, Age).check({ first: 'Ann', second: 41 }))
console.log('Color:  ', Color('red'), Color.members.Blue, Color.names['green'])
console.log('Status: ', Status('done'), Status('lost'))

// A declared type is a parameter type like any other.
function birthday(age: Age): 26 {
  return age + 1
}
console.log('birthday(25) ->', birthday(25))
console.log('birthday(-3) ->', birthday(-3) instanceof Error ? 'MonadicError' : '?')
```

The [Declarations](/declarations/) chapter covers each form in detail.

<!-- TODO review -->
## How to read this reference

Treat the big example as a checklist rather than a tutorial. Each numbered section shows the
shortest form of one feature, and the `test` beneath it is the proof that the feature behaves
as the comment says; if you change a line and a test goes red, you have found the edge of
that feature. The [Basics](/tjs-basics/) chapters explain each one at a slower pace.

Three things trip people up most often, and every one of them is in the example:

- **The colon value is an example, not a literal type.** `greet(name: 'Alice')` accepts any
  string. `'Alice'` is what a reader (and the signature test) uses as a sample input.
- **A return annotation is a worked example.** `double(x: 5): 10` is a test: the transpiler
  calls `double(5)` and requires exactly `10`. When the result is not a fixed function of the
  example inputs, write `:!` (type-only, no test).
- **`==` is honest, not structural.** It never coerces (`0 == ''` is false) and treats
  `null` and `undefined` as equal, but two distinct objects are never `==`. Use `Is` / `IsNot`
  for deep comparison.

<!-- TODO review -->
## Limits

- **`safety inputs` is the default**, so the directive at the top of the example only makes
  it explicit. `safety none` keeps metadata but skips validation; `safety all`
  validates everything (a debugging setting).
- **The local-extensions section is shown, not run**, inside a doc comment. The
  [Local Class Extensions](/local-extensions/) chapter runs it.
- **Bare assignment only declares on first use.** `Greeting = 'Hello'` becomes a `const`, so
  a later `Greeting = 'Hi'` in the same file throws. Declare with `let` if it must change.
