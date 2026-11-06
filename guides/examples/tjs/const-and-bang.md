<!--{"section": "tjs", "type": "example", "group": "basics", "order": 7, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# `const!` and Bang Access

Two small pieces of syntax for two ways JavaScript surprises you: something changed that
shouldn't have, and something was `null` when you didn't check.

- `const!` is a **compile-time** promise about a name: code that writes through it is refused
  before the program runs, and the emitted JavaScript is a plain `const`.
- `x!.y` is a **runtime** check on a value: if `x` is `null` or `undefined`, the expression
  becomes a `MonadicError` instead of throwing a `TypeError`.

```tjs:inline
/#
## `const!` and `!.` at a glance

`const!` makes the compiler refuse writes through a name. Bang access
(`x!.y`) turns a read through `null` into an error value instead of a crash.
#/

// --- `const!` reads like any other binding ---
const! LIMITS = { max: 10, min: 1 }

console.log('const! reads normally:')
console.log('  LIMITS.max ->', LIMITS.max)
// Uncomment the next line and the file no longer compiles:
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
console.log('  {a:null}      ->', deep({ a: null }).message)

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
  // The message names the member that could not be read.
  expect(absent.message).toBe("Expected non-null for 'bang.name', got null")
}

test 'a chain fails at the first missing link' {
  expect(deep({ a: { b: { c: 7 } } })).toBe(7)
  expect(isMonadicError(deep({ a: null }))).toBe(true)
}
```

The output:

```text
const! reads normally:
  LIMITS.max -> 10

bang access:
  hit  -> Ada
  miss -> MonadicError: Expected non-null for 'bang.name', got null

chains propagate:
  {a:{b:{c:7}}} -> 7
  {a:null}      -> Expected non-null for 'bang.b', got null
```

## `const!`: immutability checked by the compiler

JavaScript's `const` fixes the _name_, not the value:

```javascript
const LIMITS = { max: 10 }
LIMITS.max = 99 // legal: const stops rebinding, not mutation
```

The usual fix is `Object.freeze`. It is a runtime call, it only goes one level deep, and in
sloppy-mode code a write to a frozen object fails silently instead of throwing.

`const!` moves the check to compile time. Each of these is refused when the file is
transpiled, so the mistake surfaces before any test has to reach that line:

<!-- tjs-doc: expect-error -->

```tjs:static
const! limits = { max: 10, retries: 3 }
limits.max = 20 // Cannot mutate immutable binding 'limits'
```

<!-- tjs-doc: expect-error -->

```tjs:static
const! limits = { max: 10, retries: 3 }
limits.retries += 1 // compound assignment; ++, -- and delete are refused too
```

<!-- tjs-doc: expect-error -->

```tjs:static
const! queue = [3, 1, 2]
queue.sort() // Cannot call mutating method on immutable binding 'queue'
```

The full list of refusals: assignment to a member (`limits.max = …`, `queue[0] = …`), every
compound assignment (`+=`, `??=`, `<<=` and the rest), `++` and `--`, `delete`, and calls to
the mutating methods `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`,
`copyWithin` and `set`. Rebinding the name (`limits = {}`) throws a `TypeError` when it runs,
as it does for any `const`.

Reading is unrestricted, and so are methods that return a new value instead of changing the
old one. To sort a `const!` array, sort a copy:

```tjs:inline
const! queue = [3, 1, 2]

console.log('sorted copy:', [...queue].sort())
console.log('toSorted:   ', queue.toSorted())
console.log('doubled:    ', queue.map((n) => n * 2))
console.log('unchanged:  ', queue)
```

```text
sorted copy: [ 1, 2, 3 ]
toSorted:    [ 1, 2, 3 ]
doubled:     [ 6, 2, 4 ]
unchanged:   [ 3, 1, 2 ]
```

### It costs nothing at runtime

The check runs entirely in the compiler, so the output is the JavaScript you would have
written by hand. `const! LIMITS = { max: 10 }` emits:

```javascript
const LIMITS = { max: 10 }
```

There is no `Object.freeze`, no guard and no wrapper, because there is nothing left to check
once the file has compiled.

### Only on objects and arrays

`const!` protects the contents of a value, and a number, string or boolean has no contents to
protect. `const! n = 5` is a compile error that tells you to write `const n = 5`:

<!-- tjs-doc: expect-error -->

```tjs:static
const! retries = 3 // redundant: a primitive cannot be mutated
```

`const!` also declares one name at a time. A destructuring form such as
`const! { a, b } = settings` is a syntax error.

## Bang access: `null` that reports instead of exploding

In JavaScript, reading a member of `null` ends the program:

```javascript
const name = cache.miss.name
// TypeError: Cannot read properties of null (reading 'name')
```

Put `!` before the dot and the read checks first:

```javascript
const name = cache.miss!.name
// a MonadicError: Expected non-null for 'bang.name', got null
```

`x!.y` means: if `x` is `null` or `undefined`, the result is a `MonadicError`; otherwise it is
exactly `x.y`, with no wrapper and no copy. Only `null` and `undefined` count as missing. `0`,
`''` and `false` are values, and `''!.length` is `0`.

**Chains propagate.** If the left side of a `!.` is already a `MonadicError`, the error passes
through unchanged. `a!.b!.c` therefore stops at the first missing link and carries that
error to the end, so you check once, at the end, rather than at every hop. The error you get
names the hop that failed: in the first example, `deep({ a: null })` reports `'bang.b'`.

### How this differs from `?.`

`a?.b?.c` gives you `undefined` when any link is missing. That is a normal value: it does not
say which hop was missing, or that anything was. Three calls later you are debugging an
`undefined` with no idea where it came from.

A `MonadicError` says what failed. `isMonadicError(x)` tells it apart from a real value, and
when the TJS runtime is installed (it is in the CLI and on this site) it is also logged in
the flight recorder, `__tjs.errors()`, even if nothing checks the return value. See
[Error History](/error-history/) for the recorder.

## Bang access in practice

Bang access is most useful at the edge of a program, where data arrives with holes in it.
Reach into the data with `!.`, then check once:

```tjs:inline
function cityOf(user: { name: '', profile: { address: { city: '' } } | null }) {
  const city = user.profile!.address!.city
  return isMonadicError(city) ? `${user.name}: no address on file` : `${user.name}: ${city}`
}

console.log(cityOf({ name: 'Ada', profile: { address: { city: 'London' } } }))
console.log(cityOf({ name: 'Bob', profile: null }))

// Optional chaining on the same data: the failure has become a bare undefined
const bob = { name: 'Bob', profile: null }
console.log(bob.profile?.address?.city)

// The runtime records the bang failure even though nobody checks the result
__tjs.clearErrors()
const ignored = bob.profile!.address
console.log('errors recorded:', __tjs.errors().length)
console.log('first error:', __tjs.errors()[0].message)
```

```text
Ada: London
Bob: no address on file
undefined
errors recorded: 1
first error: Expected non-null for 'bang.address', got null
```

### Where the check stops

Every hop that might be missing needs its own `!.`. A plain `.` after a bang reads a member
_of the error_, which is usually `undefined`, and you are back to the problem `?.` has:

```tjs:inline
const nobody = null

const checked = nobody!.name!.length
const unchecked = nobody!.name.length // `.length` of a MonadicError

console.log('checked:  ', isMonadicError(checked) ? checked.message : checked)
console.log('unchecked:', unchecked)
```

```text
checked:   Expected non-null for 'bang.name', got null
unchecked: undefined
```

## Things that trip people up

- **`const!` is shallow.** It guards the members of the binding itself. `LIMITS.max = 99` is
  an error, but a write one level further down (`SETTINGS.theme.color = 'red'`, or
  `SETTINGS.tags.push('x')`) is not caught, and neither is a write through another name
  (`const alias = SETTINGS; alias.theme = null`) or inside a function you pass it to. Treat
  `const!` as a guard against the obvious slip, not as a frozen value.
- **`const!` follows the name across the whole file.** The check matches the name, not the
  scope, so once `const! config` exists, `function f(config) { config.port = 1 }` elsewhere in
  the same file is refused too, even though that `config` is a different variable. Rename
  the parameter.
- **It is a compile-time check only.** Nothing stops another module from mutating the object
  at runtime. If a value must not change at runtime, freeze it and pay for the freeze.
- **`!.` checks the left side only.** `user.profile!.address` checks `user.profile`. If `user`
  itself might be missing, write `user!.profile!.address`.
- **Calling a method through `!.` loses `this`.** `obj!.method()` checks `obj`, then calls
  the method with no receiver, so a method that uses `this` fails. Check the object first and
  call the method normally: `if (obj != null) obj.method()`.
- **`!.` is for reading dotted members.** There is no computed form (`list![0]` is a syntax
  error), it cannot be the target of an assignment (`a!.b = 1` is a syntax error), and it
  does not combine with `?.`.
- **The error's path is generic.** The message says `Expected non-null for 'bang.address'`:
  it names the member you tried to read, not the variable it was read from.
- **`!` on a parameter is something else.** In a parameter list, a leading `!`
  (`function f(! x: 0)`) marks the function as unchecked; see
  [Safety & Validation](/safety-validation/). Only `!.`, a bang directly before a dot, is
  bang access.
