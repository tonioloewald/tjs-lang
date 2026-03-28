<!--{"section":"tjs","type":"example","group":"basics","order":18}-->

# Safer Code

Ban var, enforce immutability. Zero runtime cost.

```tjs
TjsNoVar

/*#
## var Is Dead

JavaScript's `var` is a footgun:
- Hoists to function scope (not block scope)
- Allows accidental redeclaration
- Leaks out of `for` loops

`TjsNoVar` (or `TjsStrict`) makes `var` a compile error.
`const` and `let` work normally.

## const! — Compile-Time Immutability

`const!` declares a binding whose properties can't be mutated.
Unlike `Object.freeze()`, there's **zero runtime cost** —
the check happens at transpile time. The output is plain `const`.

    const! config = { debug: false, port: 8080 }
    console.log(config.port)  // OK — reads are fine
    config.debug = true       // ERROR at transpile time

    const! items = [1, 2, 3]
    items.map(x => x * 2)    // OK — non-mutating methods
    items.push(4)             // ERROR — mutating method

When runtimes support records/tuples, `const!` can emit those.
Until then, the semantics are locked in with zero overhead.
*/

// --- const and let work fine ---
const greeting = 'Hello'
let count = 0
count += 1

// --- const! prevents mutation ---
const! config = { debug: false, port: 8080, host: 'localhost' }

// Reads are fine
console.log('port:', config.port)
console.log('host:', config.host)

// --- const! arrays ---
const! colors = ['red', 'green', 'blue']

// Non-mutating methods work
const upper = colors.map(c => c.toUpperCase())
console.log('uppercase:', upper)

const found = colors.find(c => c === 'green')
console.log('found:', found)

// --- Multiple bindings ---
const! settings = { theme: 'dark', fontSize: 14 }
const mutable = { x: 1 }
mutable.x = 2  // Fine — not const!

console.log('settings.theme:', settings.theme)
console.log('mutable.x:', mutable.x)

test 'const! emits as plain const' {
  // The output JS has no freeze/seal — zero runtime cost
  expect(typeof config).toBe('object')
  expect(config.port).toBe(8080)
}

test 'non-mutating methods work on const!' {
  expect(colors.map(c => c[0])).toEqual(['r', 'g', 'b'])
  expect(colors.filter(c => c !== 'red')).toEqual(['green', 'blue'])
}
```
