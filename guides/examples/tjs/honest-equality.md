<!--{"section":"tjs","type":"example","group":"basics","order":15}-->

# Honest Equality

JavaScript `==` is broken. TJS fixes it without breaking anything.

```tjs
TjsEquals

/*#
## The Problem with JavaScript ==

JavaScript's `==` does type coercion, producing surprises:

    0 == ''          // true in JS (!)
    false == []      // true in JS (!)
    '' == false      // true in JS (!)
    null == 0        // false in JS (but null == undefined is true)

JavaScript's `===` fixes coercion but can't compare values:

    new String('hi') === 'hi'    // false in JS (different types)
    new Boolean(false) === false // false in JS (object vs primitive)

## TJS Equality (TjsEquals)

`==` becomes **honest equality**: no coercion, but unwraps
boxed primitives. Fast O(1) — no deep comparison.

`Is` / `IsNot` are **structural equality**: deep comparison
for when you explicitly need it. O(n) cost is visible.
*/

// --- Honest equality (==) fixes coercion ---
console.log('== fixes JS coercion:')
console.log('  0 == "":', 0 == '')             // false (JS: true)
console.log('  false == []:', false == [])      // false (JS: true)
console.log('  false == "":', false == '')      // false (JS: true)
console.log('  1 == "1":', 1 == '1')           // false (JS: true)

// --- Boxed primitives unwrap ---
console.log('')
console.log('== unwraps boxed primitives:')
console.log('  new String("hi") == "hi":', new String('hi') == 'hi')   // true
console.log('  new Boolean(false) == false:', new Boolean(false) == false)  // true
console.log('  new Number(42) == 42:', new Number(42) == 42)           // true

// --- Nullish equality preserved ---
console.log('')
console.log('Nullish equality (useful pattern preserved):')
console.log('  null == undefined:', null == undefined)   // true
console.log('  null == 0:', null == 0)                   // false
console.log('  null == "":', null == '')                  // false

// --- Objects/arrays: reference equality (fast, O(1)) ---
console.log('')
console.log('== on objects/arrays is reference equality (fast):')
const obj = {x: 1}
console.log('  obj == obj:', obj == obj)                   // true (same ref)
console.log('  {x:1} == {x:1}:', {x: 1} == {x: 1})       // false (different refs)
console.log('  [1,2] == [1,2]:', [1, 2] == [1, 2])        // false (different refs)

// --- Is/IsNot: explicit deep structural comparison ---
console.log('')
console.log('Is/IsNot for deep structural comparison (explicit):')
console.log('  {x:1} Is {x:1}:', Is({x: 1}, {x: 1}))          // true
console.log('  [1,2,3] Is [1,2,3]:', Is([1,2,3], [1,2,3]))    // true
console.log('  [1,2] Is [2,1]:', Is([1,2], [2,1]))             // false (order matters)

// Sets compare by membership, not order
console.log('  Set([1,2]) Is Set([2,1]):', Is(new Set([1,2]), new Set([2,1])))  // true

// --- === unchanged: identity comparison ---
console.log('')
console.log('=== is unchanged (identity):')
console.log('  obj === obj:', obj === obj)               // true
console.log('  {x:1} === {x:1}:', {x: 1} === {x: 1})   // false

test 'Eq fixes coercion' {
  expect(Eq(0, '')).toBe(false)
  expect(Eq(false, [])).toBe(false)
  expect(Eq('', false)).toBe(false)
}

test 'Eq unwraps boxed primitives' {
  expect(Eq(new String('hi'), 'hi')).toBe(true)
  expect(Eq(new Boolean(false), false)).toBe(true)
  expect(Eq(new Number(42), 42)).toBe(true)
}

test 'Eq preserves nullish equality' {
  expect(Eq(null, undefined)).toBe(true)
  expect(Eq(null, 0)).toBe(false)
}

test 'Is does deep structural comparison' {
  expect(Is({a: 1, b: 2}, {a: 1, b: 2})).toBe(true)
  expect(Is([1, 2, 3], [1, 2, 3])).toBe(true)
  expect(Is([1, 2], [2, 1])).toBe(false)
}
```
