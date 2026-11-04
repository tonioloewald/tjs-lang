<!--{"section": "tjs", "type": "example", "group": "basics", "order": 22, "parent": "tjs-basics.md"}-->

# Safer Code

Ban var, enforce immutability. Zero runtime cost.

```tjs:inline
/#
## var Is Dead

JavaScript's `var` is a footgun:
- Hoists to function scope (not block scope)
- Allows accidental redeclaration
- Leaks out of `for` loops

In native TJS, `var` is a compile error by default — no directive needed.
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
#/

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

<!-- TODO review -->
## What to notice

Everything in this example is checked **when the file is transpiled**, and none of it costs
anything when the program runs: `const!` emits plain `const`, and the rules below are refusals,
not runtime guards. The output is the JavaScript you would have written by hand.

`const!` protects the *binding's contents* from the code in this file. These are all refused
at transpile time, with the line that did it:

<!-- tjs-doc: expect-error -->

```tjs:static
const! limits = { max: 10, retries: 3 }
limits.max = 20 // assignment
```

<!-- tjs-doc: expect-error -->

```tjs:static
const! limits = { max: 10, retries: 3 }
limits.retries += 1 // compound assignment, ++ and -- too
```

<!-- tjs-doc: expect-error -->

```tjs:static
const! queue = [3, 1, 2]
queue.sort() // a mutating method: push, pop, shift, unshift, splice, sort, reverse, fill
```

`delete` is refused as well. Non-mutating methods (`map`, `filter`, `find`, `slice`, `concat`)
are fine, because they return new values; to sort a `const!` array, sort a copy:
`[...queue].sort()`.

<!-- TODO review -->
## Things `.tjs` refuses outright

`const!` is something you opt into. A few things are refused in every `.tjs` file, with an
error that names the replacement:

| Refused | Why | Instead |
|---------|-----|---------|
| `var` | function-scoped, hoisted, redeclarable | `const` or `let` |
| `eval(…)` | runs arbitrary code with your privileges | `Eval()`, the sandboxed form |
| `new Date(…)` | mutable and timezone-dependent | `LegacyDate(x)` when you really need one |
| `new` on a class declared in the file | the class is called, not `new`ed | `Point(1, 2)` |

<!-- tjs-doc: expect-error -->

```tjs:static
var total = 0 // compile error: use const or let
```

`var` and `eval` have no escape hatch: like `with` in strict mode, they are gone. `Date` has
one, `LegacyDate(x)`, because some code (a date library, say) genuinely needs the real thing;
spelling it out makes that choice visible in review.

<!-- TODO review -->
## Gotchas

- **`const!` is shallow and follows the name.** It checks writes made *through the binding*:
  `limits.max = 20` is refused. A write one level down (`config.db.port = 1`) is not caught
  today, nor is a write through another name (`const alias = limits; alias.max = 20`), nor a
  function you pass the object to that mutates it. Treat `const!` as a guard against slips in
  this file, not as `Object.freeze`.
- **The check happens at transpile time only.** Nothing stops other modules, or the
  runtime, from mutating the object. If you need a value that cannot change at runtime, freeze
  it and pay for the freeze.
