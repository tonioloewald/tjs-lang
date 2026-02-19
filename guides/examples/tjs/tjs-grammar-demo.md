<!--{"section":"tjs","type":"example","group":"featured","order":0}-->

# TJS Grammar Reference

Comprehensive reference covering all major TJS syntax features.

**Type declarations** (require full `tjs-lang` runtime — shown here for reference):

    Type Name = 'Alice'

    Type Age 'a non-negative age' {
      example: 25
      predicate(x) { return typeof x === 'number' && x >= 0 }
    }

    Generic Pair<A, B> {
      description: 'a pair of values'
      predicate(obj, A, B) { ... }
    }

    Enum Direction 'cardinal direction' { North, East, South, West }
    Enum Color 'CSS color' { Red = 'red', Green = 'green', Blue = 'blue' }
    Union Status 'task status' 'pending' | 'active' | 'done'

All other features are exercised in the runnable code below:

```tjs
// ═══════════════════════════════════════════════════════════
// 1. SAFETY DIRECTIVE & TJS MODES
// These must appear before any other code.
// ═══════════════════════════════════════════════════════════

safety inputs

TjsEquals
TjsClass

/*#
# TJS Grammar Reference

A runnable reference for TJS syntax. Each section demonstrates a
feature with a test proving it works.

## Quick Index
| Feature | Section |
|---------|---------|
| Safety & modes | `safety`, `TjsEquals`, `TjsClass` |
| Parameters | Colon `:`, optional `=`, destructured `{}` |
| Numeric narrowing | `42` int, `3.14` float, `+0` non-negative |
| Return types | `->`, `-?`, `-!` |
| Safety markers | `(! ...)` unsafe, `(? ...)` safe |
| Type/Generic/Enum/Union | See above (requires full runtime) |
| Bare assignments | `Uppercase = ...` |
| Classes | Callable without `new` |
| Polymorphic functions | Same name, different signatures |
| Polymorphic constructors | Multiple `constructor()` |
| Local extensions | `extend String { ... }` |
| Equality | `==` structural, `===` identity, `Is`/`IsNot` |
| Try without catch | Monadic error conversion |
| Inline tests | Test blocks |
| TDoc comments | Slash-star-hash markdown blocks |
*/

// ═══════════════════════════════════════════════════════════
// 2. PARAMETER SYNTAX
// ═══════════════════════════════════════════════════════════

/*#
## Parameters

Colon `:` = required (example value infers type).
Equals `=` = optional (default value).
Question mark `?:` = optional (TS-style).
*/

// Required params (colon shorthand)
function greet(name: 'Alice') -> 'Hello, Alice' {
  return 'Hello, ' + name
}

// Optional params (equals = default)
function greetOpt(name = 'World') -> 'Hello, World' {
  return 'Hello, ' + name
}

// Destructured object params (colon = required, equals = optional)
function createUser({ name: 'Anon', role = 'user' }) -> { name: '', role: '' } {
  return { name, role }
}

// Numeric type narrowing: 42 = integer, 3.14 = float, +0 = non-negative int
function calc(count: 42, rate: 3.14, index: +0) -> 0.0 {
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

/*#
## Return Types

`->` signature test at transpile time.
`-?` signature test + runtime output validation.
`-!` skip signature test entirely.
*/

// -> : transpile-time check (double(5) must equal 10)
function double(x: 5) -> 10 {
  return x * 2
}

// -! : skip test (useful when return shape varies)
function safeDivide(a: 10, b: 2) -! 5 {
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

/*#
## Safety Markers

`!` = unsafe (skip input validation). Fast path for trusted callers.
`?` = safe (force validation even inside `unsafe` blocks).
*/

function fastAdd(! a: 0, b: 0) -> 0 {
  return a + b
}

function safeAdd(? a: 0, b: 0) -> 0 {
  return a + b
}

test 'safety markers' {
  expect(fastAdd(3, 4)).toBe(7)
  expect(safeAdd(3, 4)).toBe(7)
}

// ═══════════════════════════════════════════════════════════
// 5. BARE ASSIGNMENTS
// ═══════════════════════════════════════════════════════════

/*#
## Bare Assignments

Uppercase identifiers auto-get `const`.
*/

Greeting = 'Hello'
MaxRetries = 3

test 'bare assignments' {
  expect(Greeting).toBe('Hello')
  expect(MaxRetries).toBe(3)
}

// ═══════════════════════════════════════════════════════════
// 7. CLASSES (callable without new)
// ═══════════════════════════════════════════════════════════

/*#
## Classes

With `TjsClass` enabled, classes are callable without `new`.
*/

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

/*#
## Polymorphic Functions

Same name, different signatures. Dispatched by arity/type.
See the **Polymorphic Functions** example for more.
*/

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

/*#
## Polymorphic Constructors

Multiple `constructor()` declarations in a class.
See the **Polymorphic Constructors** example for more.
*/

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

/*#
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
*/

// ═══════════════════════════════════════════════════════════
// 11. EQUALITY OPERATORS
// ═══════════════════════════════════════════════════════════

/*#
## Equality

With `TjsEquals` enabled (at the top of this file):
- `==` / `!=` use structural comparison (deep value equality)
- `===` / `!==` are identity checks (same reference)
- `Is` / `IsNot` are explicit structural operators (any mode)

    const a = { x: 1, y: [2, 3] }
    const b = { x: 1, y: [2, 3] }
    a == b       // true  (structural: same shape)
    a === b      // false (identity: different objects)
    a Is b       // true  (explicit structural)
    a IsNot b    // false
*/

// ═══════════════════════════════════════════════════════════
// 12. TRY WITHOUT CATCH
// ═══════════════════════════════════════════════════════════

/*#
## Try Without Catch

A bare `try` block auto-converts exceptions to monadic errors.
*/

function parseJSON(s: '{"a":1}') -! { a: 1 } {
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

/*#
## Inline Tests

Test blocks run at transpile time and are stripped from
output. They have full access to the module scope, so you
can test private functions without exporting them.
*/

function _private(x: 0) -> 0 {
  return x * x
}

test 'inline tests can reach private functions' {
  expect(_private(5)).toBe(25)
}

// ═══════════════════════════════════════════════════════════
// 14. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════

/*#
## Module Exports

Standard ES module syntax works. Functions and values
can be exported for use by other modules.
*/

export function publicHelper(x: 0) -> 0 {
  return x + 1
}

// ═══════════════════════════════════════════════════════════
// 15. TDOC COMMENTS
// ═══════════════════════════════════════════════════════════

/*#
## TDoc Comments

These comment blocks (opened with slash-star-hash) contain
markdown that becomes rich documentation in the playground
and API docs. Every such block you've seen above is a TDoc.
*/

// ═══════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════

console.log('TJS Grammar Reference — all tests passed!')
console.log('Features demonstrated:', [
  'safety directive', 'TJS modes', 'colon params', 'optional params',
  'destructured params', 'numeric narrowing',
  'return types (-> -? -!)', 'safety markers (! ?)',
  'Type', 'Generic', 'Enum', 'Union', 'bare assignments',
  'classes', 'polymorphic functions', 'polymorphic constructors',
  'local extensions', 'structural equality', 'Is/IsNot',
  'try without catch', 'inline tests', 'module exports', 'TDoc'
].join(', '))
```
