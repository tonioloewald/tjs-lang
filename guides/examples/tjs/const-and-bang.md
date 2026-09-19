<!--{"section":"tjs","type":"example","group":"basics","order":7}-->

# `const!` and Bang Access

Two small pieces of syntax for the two ways JavaScript surprises you: something mutated that
shouldn't have been, and something `null` you didn't check.

```tjs
/#
## `const!` — immutability that costs nothing

JavaScript's `const` binds the NAME, not the value:

    const LIMITS = { max: 10 }
    LIMITS.max = 99          // perfectly legal. const stops rebinding, not mutation.

The usual fix is `Object.freeze`, which costs an allocation, only goes one
level deep, and fails SILENTLY in sloppy mode.

`const!` is checked by the compiler instead:

    const! LIMITS = { max: 10 }
    LIMITS.max = 99          // Cannot mutate immutable binding 'LIMITS'

The error arrives when you compile, not when a test happens to exercise that
line. And because the check is entirely at compile time, the emitted
JavaScript is **exactly** what you would have written by hand:

    const LIMITS = { max: 10 }

No `Object.freeze`, no guard, no wrapper. Zero runtime cost is not a slogan
here — there is nothing to run.

## Bang access — `null` that reports instead of exploding

    const name = cache.miss.name
    // TypeError: Cannot read properties of null — and your program is over

`!` on a member access asks the question instead of assuming the answer:

    const name = cache.miss!.name
    // MonadicError: Expected non-null for 'bang.name', got null

The program keeps running and you have a value that says what went wrong and
where. **Chains propagate** — `a!.b!.c` fails at the first missing link and
carries the error the rest of the way, so you check once at the end rather
than at every hop.

### How this differs from `?.`

`?.` gives you `undefined`, which is a value that has forgotten there was a
problem. Three lines later you are debugging `undefined` with no idea which
hop produced it. A `MonadicError` remembers — and `__tjs.errors()` has it
even if you ignore the return.
#/

// --- `const!` is read-only at compile time ---
const! LIMITS = { max: 10, min: 1 }

console.log('const! reads normally:')
console.log('  LIMITS.max ->', LIMITS.max)
// Uncomment to see the compile-time error, before this line ever runs:
// LIMITS.max = 99
//   → Cannot mutate immutable binding 'LIMITS'. const! bindings are read-only at compile time.

// --- Bang access turns a crash into a value ---
function lookup() {
  const cache = { hit: { name: 'Ada' }, miss: null }

  const found = cache.hit!.name
  const absent = cache.miss!.name // plain JS: TypeError, program over

  return { found, absent }
}

const result = lookup()
console.log('\nbang access:')
console.log('  hit  ->', result.found)
console.log(
  '  miss ->',
  isMonadicError(result.absent)
    ? 'MonadicError: ' + result.absent.message
    : String(result.absent)
)

// --- Chains fail at the first missing link and carry the error onward ---
function deep(root) {
  return root.a!.b!.c
}

console.log('\nchains propagate:')
console.log('  {a:{b:{c:7}}} ->', deep({ a: { b: { c: 7 } } }))
console.log(
  '  {a:null}      ->',
  isMonadicError(deep({ a: null })) ? 'MonadicError' : 'no error'
)

test 'const! bindings read normally' {
  expect(LIMITS.max).toBe(10)
  expect(LIMITS.min).toBe(1)
}

test 'bang access passes a present value straight through' {
  expect(lookup().found).toBe('Ada')
}

test 'bang access on null yields a MonadicError, not a crash' {
  const absent = lookup().absent
  expect(isMonadicError(absent)).toBe(true)
  // The message names the access that failed — errors are a curriculum, not a shrug.
  expect(absent.message).toContain('non-null')
}

test 'a chain fails at the first missing link' {
  expect(deep({ a: { b: { c: 7 } } })).toBe(7)
  expect(isMonadicError(deep({ a: null }))).toBe(true)
}
```
