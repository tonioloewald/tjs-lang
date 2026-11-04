<!--{"section": "ts", "type": "example", "group": "validation", "order": 2, "parent": "ts-validation.md"}-->

# Runtime Validation

TypeScript types work at RUNTIME, not just compile time

<!-- TODO review -->

In TypeScript, `divide(a: number, b: number)` is a promise the compiler checks against the
calls it can see. A call with a string from a form, or a value cast with `as any`, compiles
fine, and JavaScript then does whatever its coercion rules say: `'ten' / 2` is `NaN`, and
`NaN` travels on. Under TJS the annotation is checked on every call, so the bad argument is
caught where it enters.

```ts:inline
// Converted TypeScript keeps JavaScript's behaviour until you opt in. This one
// line opts in to full TJS, which turns the types into runtime checks:
/* @tjs TjsStrict */

// The key insight: TS types become runtime checks

function divide(a: number, b: number): number {
  if (b === 0) return NaN
  return a / b
}

// Valid calls work normally
console.log('10 / 2 =', divide(10, 2))
console.log('10 / 0 =', divide(10, 0))

// Invalid calls return error objects (not crashes!)
const badResult = divide('ten' as any, 2)
console.log('divide("ten", 2) =', badResult)

if (badResult instanceof Error) {
  console.log('  ^ This is a MonadicError, not a crash!')
  console.log('  message:', badResult.message)
}
```

<!-- TODO review -->

## What to notice

- **The error is a value you can test.** `badResult instanceof Error` is `true`, because
  `MonadicError` extends `Error`. It was returned, not thrown, so no `try`/`catch` was
  needed and the next line ran normally. `isMonadicError(x)` asks the same question more
  precisely.
- **The message says where.** It names the function, the parameter (`divide.a`), the type
  expected and the type received. That is usually enough to find the caller that sent the
  bad value.
- **`10 / 0` is not an error.** The types are right, so the check passes, and the
  function's own logic decides what to return. Runtime checks validate types, not
  business rules; those are still yours to write.

<!-- TODO review -->

## The gotcha

An error passed on is still an error. If `badResult` were handed to another TJS function
(`format(divide('ten', 2))`), that function would return the same `MonadicError` without
running its body. That is the point: errors cannot be silently consumed. But code that is
not TJS, such as a plain JavaScript library or a template, sees an ordinary object. Check
results at the edges of your TJS code, where they leave for code that does not know about
monadic errors.
