<!--{"section":"tjs","type":"example","group":"featured","order":0}-->

# TJS Grammar Demo

Comprehensive example exercising all TJS syntax features

```tjs
/*#
# TJS Grammar Reference

This example exercises **every TJS feature**. Run it to see
tests pass and signature validation in action.

## Parameter Syntax
| Syntax | Meaning |
|--------|---------|
| \`x: 0\` | Required number |
| \`x = 0\` | Optional, defaults to 0 |
| \`(? x: 0)\` | Force input validation |
| \`(! x: 0)\` | Skip input validation |

## Return Type Syntax
| Syntax | Meaning |
|--------|---------|
| \`-> 10\` | Signature test runs at transpile |
| \`-? 10\` | + runtime output validation |
| \`-! 10\` | Skip signature test |
*/

// ─────────────────────────────────────────────────────────
// SIGNATURE TESTS: -> runs at transpile time
// ─────────────────────────────────────────────────────────

/*#
Double a number. The \`-> 10\` means: double(5) must return 10.
This is verified when you save/transpile!
*/
function double(x: 5) -> 10 {
  return x * 2
}

/*#
Concatenate first and last name.
*/
function fullName(first: 'Jane', last: 'Doe') -> 'Jane Doe' {
  return first + ' ' + last
}

// ─────────────────────────────────────────────────────────
// SKIP SIGNATURE TEST: -! when return varies
// ─────────────────────────────────────────────────────────

/*#
Division with error handling. Uses \`-!\` because the error
path returns a different shape than success.
*/
function divide(a: 10, b: 2) -! { ok: true, value: 5 } {
  if (b === 0) {
    return { ok: false, value: 0, error: 'div by zero' }
  }
  return { ok: true, value: a / b }
}

// ─────────────────────────────────────────────────────────
// EXPLICIT TESTS: test 'description' { }
// ─────────────────────────────────────────────────────────

test 'double works' {
  expect(double(7)).toBe(14)
  expect(double(0)).toBe(0)
}

test 'fullName concatenates' {
  expect(fullName('John', 'Smith')).toBe('John Smith')
}

test 'divide handles zero' {
  const result = divide(10, 0)
  expect(result.ok).toBe(false)
}

test 'divide works normally' {
  const result = divide(20, 4)
  expect(result.ok).toBe(true)
  expect(result.value).toBe(5)
}

// ─────────────────────────────────────────────────────────
// UNSAFE FUNCTIONS: (!) skips input validation
// ─────────────────────────────────────────────────────────

/*#
Fast path - no runtime type checks on inputs.
Use when you trust the caller (internal code).
*/
function fastAdd(! a: 0, b: 0) -> 0 {
  return a + b
}

// ─────────────────────────────────────────────────────────
// SAFE FUNCTIONS: (?) forces input validation
// ─────────────────────────────────────────────────────────

/*#
Critical path - always validate inputs even in unsafe blocks.
*/
function safeAdd(? a: 0, b: 0) -> 0 {
  return a + b
}

// ─────────────────────────────────────────────────────────
// COMPLEX TYPES
// ─────────────────────────────────────────────────────────

/*#
Object types are defined by example shape.
*/
function createPoint(x: 3, y: 4) -> { x: 3, y: 4 } {
  return { x, y }
}

/*#
Array types use single-element example.
*/
function sum(nums: [1, 2, 3]) -> 6 {
  return nums.reduce((a, b) => a + b, 0)
}

test 'createPoint returns structure' {
  const p = createPoint(10, 20)
  expect(p.x).toBe(10)
  expect(p.y).toBe(20)
}

test 'sum adds array' {
  expect(sum([1, 2, 3, 4])).toBe(10)
}

// ─────────────────────────────────────────────────────────
// OUTPUT
// ─────────────────────────────────────────────────────────

console.log('All signature tests passed at transpile time!')
console.log('double.__tjs:', double.__tjs)
console.log('Result:', double(21))

```
