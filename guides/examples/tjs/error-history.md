<!--{"section":"tjs","type":"example","group":"patterns","order":8}-->

# Error History

Catch silent type errors with the error history ring buffer

```tjs
/*#
## The Problem with Monadic Errors

Monadic errors don't throw — they return error values. This is great
for safety (your program doesn't crash), but it means errors can
silently vanish if you forget to check a return value:

    const result = createUser(42)  // returns MonadicError
    // oops, nobody checked result — the error is lost

## The Solution: Error History

TJS automatically tracks recent type errors in a ring buffer. You can
check `__tjs.errors()` at any time to see what failed recently.

### Use Cases

1. **Debugging**: "something's wrong" → check `__tjs.errors()`
2. **Testing**: clear errors, run code, check for surprises
3. **Monitoring**: periodically poll for unhandled type errors

Error tracking is on by default with zero cost on the happy path —
it only writes when an error actually occurs (and the error object
is already being allocated anyway).
*/

// --- Basic: detect silent failures ---

function greet(name: 'World') -> 'Hello, World!' {
  return `Hello, ${name}!`
}

function double(x: 0) -> 0 {
  return x * 2
}

// Start clean
__tjs.clearErrors()

// Correct usage — no errors
greet('Alice')
double(5)
console.log('After correct calls:', __tjs.errors().length, 'errors')

// Silent failures — wrong types, return values not checked
greet(42)
double('oops')

// The errors are captured even though nobody checked the return values
const recent = __tjs.errors()
console.log('After bad calls:', recent.length, 'errors')
for (const err of recent) {
  console.log('  -', err.message)
}

// --- Testing pattern: clear / run / check ---

__tjs.clearErrors()

function processOrder(id: 0, name: '') -> { status: 'processed  #0' } {
  return { status: `processed ${name} #${id}` }
}

// Run some operations
processOrder(1, 'Widget')
processOrder(2, 'Gadget')

// Verify no unexpected errors occurred
const testErrors = __tjs.errors()
console.log('\nTest result:', testErrors.length === 0 ? 'PASS' : 'FAIL')

// --- getErrorCount survives buffer wrapping ---

__tjs.clearErrors()
for (let i = 0; i < 100; i++) {
  greet(i)  // 100 type errors
}
console.log('\nTotal errors:', __tjs.getErrorCount())
console.log('Buffered:', __tjs.errors().length, '(ring buffer holds last 64)')
```
