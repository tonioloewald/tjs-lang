<!--{"section":"tjs","type":"example","group":"basics","order":16}-->

# Safety & Validation

Three levels of runtime validation. Choose per-file or per-function.

```tjs
safety inputs

/*#
## The Problem

JavaScript functions silently accept wrong types:

    function greet(name) { return `Hello, ${name}!` }
    greet(42)  // "Hello, 42!" — no error, just wrong

TypeScript catches this at compile time but the checks
vanish at runtime. Production gets no protection.

## TJS Safety Levels

The `safety` directive sets the default for the whole file:

| Directive | Validates | Use case |
|-----------|-----------|----------|
| `safety none` | Nothing | Metadata only, zero overhead |
| `safety inputs` | Function inputs | Default — catches bad callers |
| `safety all` | Inputs + outputs | Debug mode, catches internal bugs |

Per-function overrides:
- `!` = unsafe (skip validation): `function fast(! x: 0) { }`
- `?` = safe (force validation): `function careful(? x: 0) { }`
*/

// --- Input validation catches bad callers ---

function sayHello(name: 'World') -> 'Hello, World!' {
  return `Hello, ${name}!`
}

test 'valid input works normally' {
  expect(sayHello('Alice')).toBe('Hello, Alice!')
}

test 'wrong type returns an error, not garbage' {
  const result = sayHello(42)
  // Not "Hello, 42!" — an actual error value
  expect(result instanceof Error).toBe(true)
}

test 'null returns an error' {
  const result = sayHello(null)
  expect(result instanceof Error).toBe(true)
}

// --- Numeric narrowing catches subtle bugs ---

function setAge(age: +0) -> +0 {
  return age
}

test 'positive integer accepted' {
  expect(setAge(25)).toBe(25)
}

test 'negative rejected' {
  expect(setAge(-1) instanceof Error).toBe(true)
}

test 'float rejected (age must be integer)' {
  expect(setAge(25.5) instanceof Error).toBe(true)
}

// --- Unsafe functions skip validation (fast path) ---

function fastAdd(! a: 0, b: 0) -> 0 {
  return a + b
}

test 'unsafe function skips checks (trusted callers only)' {
  expect(fastAdd(3, 4)).toBe(7)
  // No type error even with wrong type — validation skipped
  expect(fastAdd('a', 'b')).toBe('ab')
}

// --- Errors propagate through function chains ---

function cleanName(name: '') -> '' {
  return name.trim()
}

function upperCase(name: '') -> '' {
  return name.toUpperCase()
}

test 'errors propagate automatically' {
  // cleanName(42) returns error -> upperCase receives error -> returns error
  const result = upperCase(cleanName(42))
  expect(result instanceof Error).toBe(true)
}

test 'valid input flows through the chain' {
  expect(upperCase(cleanName('alice'))).toBe('ALICE')
}

// --- Try without catch: convert exceptions to errors ---

function parseJSON(s: '{}') -! {} {
  try {
    return JSON.parse(s)
  }
}

test 'valid JSON parses normally' {
  const result = parseJSON('{"ok":true}')
  expect(result.ok).toBe(true)
}

test 'invalid JSON returns error instead of throwing' {
  const result = parseJSON('not json')
  expect(result instanceof Error).toBe(true)
  // No try/catch needed by the caller!
}

console.log('Valid:', sayHello('World'))
console.log('Invalid:', sayHello(42))
console.log('Parse ok:', parseJSON('{"x":1}'))
console.log('Parse bad:', parseJSON('nope'))
```
