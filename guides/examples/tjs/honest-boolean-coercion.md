<!--{"section":"tjs","type":"example","group":"basics","order":16}-->

# Honest Boolean Coercion

`Boolean(new Boolean(false))` returns `true` in raw JavaScript. TJS fixes
that — and every other place where boxed primitives leak the wrong truthiness.

```tjs
/*#
## The Problem

In JavaScript, a boxed primitive (`new Boolean(...)`, `new Number(...)`,
`new String(...)`) is an Object. The spec's `ToBoolean` operation declares
**any** Object truthy — so `new Boolean(false)` is truthy, even though
the value inside the wrapper is `false`.

There's no fix in plain JS: `Symbol.toPrimitive` doesn't fire for boolean
coercion, so library authors can't override it.

## The Fix

Native TJS rewrites every truthiness context (`if`, `while`, `for`, `do`,
`!`, `&&`, `||`, ternary, and `Boolean(x)` calls) to call `__tjs.toBool(x)`,
which unwraps boxed primitives before applying `ToBoolean`. Always-on under
TjsStandard (the default for native TJS files).

`&&` and `||` keep JavaScript's value-returning semantics — `a && b` still
returns `a` when `a` is falsy, `b` otherwise. Side effects fire exactly as
in raw JS. `??` is intentionally not touched (it checks null/undefined,
not truthiness).
*/

const boxedFalse = new Boolean(false)
const boxedTrue = new Boolean(true)

// --- Boolean() function call ---
console.log('Boolean() unwraps:')
console.log('  Boolean(new Boolean(false)):', Boolean(boxedFalse))
console.log('  Boolean(new Boolean(true)):', Boolean(boxedTrue))
//   Raw JS would return true for BOTH (object → truthy)
//   TJS: false, true ✓

// --- if statement ---
console.log('')
console.log('if statement unwraps:')
const ifResult = boxedFalse ? 'truthy branch' : 'falsy branch'
console.log('  new Boolean(false) ? .. : ..:', ifResult)
//   Raw JS: 'truthy branch' (wrong!)
//   TJS:    'falsy branch' ✓

// --- ! operator ---
console.log('')
console.log('! unwraps:')
console.log('  !new Boolean(false):', !boxedFalse)
console.log('  !new Boolean(true):', !boxedTrue)
//   Raw JS: false, false (both wrong!)
//   TJS:    true,  false ✓

// --- || returns the original value ---
console.log('')
console.log('|| picks the right operand when LHS is "falsy":')
console.log('  new Boolean(false) || "fallback":', boxedFalse || 'fallback')
//   Raw JS: Boolean { false } (wrapper, since "truthy" in JS)
//   TJS:    'fallback' ✓
console.log('  new Boolean(true) || "fallback":', boxedTrue || 'fallback')
//   TJS: returns the wrapper (truthy LHS wins, value-returning semantics preserved)

// --- && short-circuits on falsy LHS ---
console.log('')
console.log('&& short-circuits on falsy LHS:')
console.log('  new Boolean(false) && "right":', boxedFalse && 'right')
//   TJS: returns the wrapper (falsy LHS, short-circuit)
console.log('  new Boolean(true) && "right":', boxedTrue && 'right')
//   TJS: 'right' (truthy LHS, evaluates RHS)

// --- Side effects fire exactly as in raw JS ---
console.log('')
console.log('Side effects: no double-evaluation:')
let n = 0
const inc = () => {
  n++
  return new Boolean(false)
}
const result = inc() || inc()
console.log('  inc() || inc() called inc this many times:', n) // 2

// --- ?? unchanged: nullish, not truthy ---
console.log('')
console.log('?? is unchanged (it checks null/undefined, not truthiness):')
console.log('  new Boolean(false) ?? "fallback":', boxedFalse ?? 'fallback')
//   Returns the wrapper (it's not null/undefined)
console.log('  null ?? "fallback":', null ?? 'fallback')
//   Returns 'fallback'

// --- Compose: nested coercions still correct ---
console.log('')
console.log('Nested: if (a && b) where a is boxed false:')
const a = new Boolean(false)
const b = true
const nested = a && b ? 'enters' : 'skips'
console.log('  if (a && b) ...:', nested)
//   Raw JS: 'enters' (a is truthy object, b is truthy)
//   TJS:    'skips'  ✓

test 'Boolean() unwraps boxed primitives' {
  expect(Boolean(new Boolean(false))).toBe(false)
  expect(Boolean(new Boolean(true))).toBe(true)
}

test 'if/ternary unwraps' {
  const r = new Boolean(false) ? 'yes' : 'no'
  expect(r).toBe('no')
}

test '! unwraps' {
  expect(!new Boolean(false)).toBe(true)
  expect(!new Boolean(true)).toBe(false)
}

test '&& and || preserve value-returning semantics' {
  // falsy LHS: short-circuits, returns LHS
  const a = (new Boolean(false)) && 'right'
  expect(a instanceof Boolean).toBe(true)
  expect(a.valueOf()).toBe(false)

  // truthy LHS for ||: returns LHS
  const b = (new Boolean(true)) || 'right'
  expect(b instanceof Boolean).toBe(true)

  // falsy LHS for ||: returns RHS
  const c = (new Boolean(false)) || 'right'
  expect(c).toBe('right')
}

test 'side effects fire exactly once per evaluation' {
  let n = 0
  const inc = () => { n++; return new Boolean(false) }
  inc() || inc()
  expect(n).toBe(2)
}

test '?? is unchanged' {
  // ?? only fires for null/undefined, not for "falsy"
  expect((new Boolean(false)) ?? 'fb' instanceof Boolean).toBe(true)
  expect(null ?? 'fb').toBe('fb')
}

test 'nested if (a && b) where a is boxed false' {
  const a = new Boolean(false)
  const b = true
  const r = a && b ? 'in' : 'out'
  expect(r).toBe('out')
}
```
