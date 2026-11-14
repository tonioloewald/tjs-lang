<!--{"parent": "the-tjs-language.md", "order": 70}-->
<!-- TODO review -->

# Testing

In a Jest, Vitest or `bun:test` project, tests live in their own files. A test file imports
the module under test, so it can reach only what that module exports, and it runs when you
run the test command, not when you build.

TJS adds two kinds of test that live in the source file itself:

- **Signature tests.** A function's return annotation is a worked example. TJS calls the
  function with its parameter examples and checks the answer.
- **`test` blocks.** `test 'name' { … }` beside the code, with `expect` built in.

Both run when the file is transpiled by `tjs check`, `tjs test`, `tjs emit` or the `tjs()`
function. `tjs run` and the Bun plugin skip them unless you ask; the table at the start of
[Running tests](#running-tests) lists every tool.

Neither kind costs anything in production. `test` blocks are removed from the emitted
JavaScript, and a signature test leaves only metadata behind. There is no build setting to
strip them and no guard to wrap them in (Vitest's in-source tests need an
`if (import.meta.vitest)` block that the bundler then removes), so a thorough suite adds zero
bytes to the code you ship.

This chapter covers how each kind runs, what it can and cannot see, and where an ordinary
test runner still belongs. [Checking Your Work](/checking-your-work/) in Part I teaches
`expect` from scratch; this chapter assumes you know it.

## Signature tests

### A return annotation is a worked example

Every value after a colon in TJS is an example. A parameter example says what kind of value
the parameter takes. A return example goes further: it is **the answer the function gives
for the parameter examples**. During transpilation TJS makes that call and compares the
result with the annotation.

```tjs:inline
function add(a: 2, b: 3): 5 {
  return a + b
}

function initials(first: 'Ada', last: 'Lovelace'): 'AL' {
  return first[0] + last[0]
}

function area(rect: { w: 2, h: 3 }): 6 {
  return rect.w * rect.h
}

console.log(add(10, 20), initials('Grace', 'Hopper'), area({ w: 4, h: 5 }))
// 30 GH 20
```

Each signature here is checked once, at transpile time: `add(2, 3)` must be `5`,
`initials('Ada', 'Lovelace')` must be `'AL'`, `area({ w: 2, h: 3 })` must be `6`.

The comparison is by deep equality. Objects must have the same keys, in any order, with
equal values; an extra or a missing key fails. Arrays must have the same length and equal
elements in the same order. Numbers that are not integers are compared with a tiny
tolerance, so an example of `0.3` accepts `0.1 + 0.2`.

What the annotations do at runtime is a separate matter. **Parameters are checked on every
call**: `add('2', 3)` returns an error instead of running. **A return annotation is checked
once**, by this test, and not on later calls (unless it is written `:?`, below). The type it
implies, "returns an integer" for `: 5`, also feeds the generated documentation and `.d.ts`
declarations. [Safety and Validation](/safety-markers/) covers the runtime checks.

Change one annotation and the file stops transpiling:

<!-- tjs-doc: expect-error -->

```tjs:static
function add(a: 2, b: 3): 0 {
  return a + b
}
```

```text
Transpile-time test failures:
  Function signature example is inconsistent:
    Expected 0 at 'add', got 5
```

If you know TypeScript, `: 0` looks like "returns a number", and `0` is a number, so it
looks as though it should pass. It does not, on purpose. A return example is compared as a
value, not matched as a type. If it were only a type, `: 0` would be satisfied by any integer,
including the wrong one, and the test would prove nothing. Read it as a sentence: "add(2, 3)
is 0", which is false.

When you want only the type, say so with `:!` (see [The opt-outs](#the-opt-outs) below).

### Top-level code runs too

To run a signature test, TJS has to define the function, so it runs the whole module.
Whenever a file has a test to run, every top-level statement executes: under `tjs check`,
`tjs test`, `tjs emit`, a build with `runTests`, or the Bun plugin with `TJS_RUN_TESTS=1`. A
top-level `console.log` prints during `check`; a top-level `fetch` would fire. Keep effectful
work inside functions that something calls.

The examples in this chapter end with a top-level `console.log` only so that they show some
output when you run them. Real modules should not.

### Choose examples you can check by hand

A signature test is only as good as the example. Pick inputs whose answer you can work out
in your head, so the annotation is obviously right to a reader. The edge case is often the
easiest:

```tjs:inline
// The empty string never enters the loop, so the hash stays 0.
function hashPassword(password: ''): 'hashed_0' {
  let hash = 0
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash) + password.charCodeAt(i)
    hash = hash & hash
  }
  return 'hashed_' + Math.abs(hash).toString(16)
}

console.log(hashPassword(''))         // hashed_0
console.log(hashPassword('secret'))   // hashed_3604b150
```

`hashPassword('secret')` would be a poor example: nobody can check `'hashed_3604b150'` by
eye, so the annotation would record whatever the code happened to return the day you wrote
it. That is a snapshot, not a test. (This hash is a toy, from
[Inline Tests: Test Private Functions](/inline-tests-test-private-functions/); never hash real
passwords this way.)

One signature test checks one case. It is a free sanity check and a line of documentation,
not a test suite. The `test` blocks below are where the rest of the cases go.

## The opt-outs

A plain `:` is right when the function returns the same answer every time for its examples
and that answer is easy to write. Two other spellings cover the rest.

**`:!` declares the return type only.** Nothing runs. Use it when no fixed answer exists
(randomness, the clock), when the call has side effects you do not want at transpile time,
or when the true answer for the examples would be awkward to write out and the annotation
is better read as a shape. Converted TypeScript uses `:!` for every return type.

**`:?` runs the signature test and checks every result at runtime.** It is for a function
whose result you do not fully trust, such as one that reads from a table it does not
control.

A value that fails a runtime check is not thrown. The call returns a `MonadicError` instead,
and `isMonadicError(value)` tells you whether you got one. `isMonadicError` is available in
every TJS file without an import; [Errors as Values](/errors-as-values/) covers what the
error carries.

```tjs:inline
// `:` tested once, at transpile time: celsius(212) must be 100
function celsius(f: 212): 100 {
  return (f - 32) * 5 / 9
}

// `:!` the type only: a random result has no fixed answer to test
function rollDie(sides: 6):! 1 {
  return 1 + Math.floor(Math.random() * sides)
}

// `:?` tested once, and every later result is checked
const PRICES = { apple: 3, pear: 4 }

function price(fruit: 'apple'):? 3 {
  return PRICES[fruit]
}

console.log(celsius(50))                    // 10
console.log(rollDie(6) >= 1)                // true
console.log(price('pear'))                  // 4
console.log(isMonadicError(price('kiwi')))  // true: undefined is not an integer
```

| Annotation | Signature test at transpile time | Each result checked at runtime |
| ---------- | -------------------------------- | ------------------------------ |
| `: 100`    | yes                              | no                             |
| `:! 1`     | no                               | no                             |
| `:? 3`     | yes                              | yes                            |

What the runtime check costs belongs to [Safety and Validation](/safety-markers/).

## Which example is used

**A default is the example.** A parameter with a default is called with that default:

```tjs:inline
function greet(name: 'Alice', times = 2): 'Hi Alice! Hi Alice!' {
  return Array(times).fill(`Hi ${name}!`).join(' ')
}

console.log(greet('Bob', 1))  // Hi Bob!
```

The test calls `greet('Alice', 2)`, which is why the expected answer greets Alice twice.

**A literal union uses its first member.** The test calls `toggle('on')`:

```tjs:inline
function toggle(state: 'on' | 'off'): 'off' {
  return state == 'on' ? 'off' : 'on'
}

console.log(toggle('off'))  // on
```

Annotating it `: 'on'` would fail, because `toggle('on')` is `'off'`.

**A declared type name supplies no example.** TJS reads a signature test's arguments
straight from the signature, and only a literal value there counts. A `Type` name is not a
literal, and TJS does not look up the example inside the `Type` declaration, so a function
with a `Type`-named parameter gets no signature test at all. This is a current limitation,
not a rule you can rely on staying:

```tjs:inline
Type Point = { x: 0, y: 0 }

function manhattan(p: Point):! 0 {
  return Math.abs(p.x) + Math.abs(p.y)
}

console.log(manhattan({ x: 3, y: -4 }))  // 7
```

It is written with `:!` to say honestly that nothing tests it. A plain `:` would not be
tested either, and nothing warns you: `manhattan(p: Point): 999` passes `tjs check` with a ✓,
and `tjs test` reports "no inline tests". Test such a function with a `test` block.

**Some functions get no signature test.**

- An `async` function's return example is not run at transpile time, because TJS does not
  await there. It is reported as inconclusive (`tjs check` warns), and the page's runner runs
  it.
- An arrow function or function expression assigned to a `const` is not tested. Its
  annotation is accepted and still documents the return type, but nothing checks it, at
  transpile time or at runtime.
- A class method is tested only when the class declares a constructor. TJS builds an
  instance by calling the constructor with its own examples, then calls the method.

```tjs:inline
async function double(n: 2): 4 {
  return n * 2
}

// Not tested: the annotation documents the type and nothing more.
const square = (n: 3): 9 => n * n

// Tested: Counter(0).plus(2) must be 2.
class Counter {
  constructor(start: 0) {
    this.n = start
  }

  plus(k: 2): 2 {
    return this.n + k
  }
}

console.log(await double(5), square(4), Counter(1).plus(2))  // 10 16 3
```

For any of these, put the cases you care about in a `test` block.

## `test` blocks

A `test` block holds checks that run against the module, next to the code they check:

```tjs:inline
function parseQuery(query: 'a=1&b=2'): { a: '1', b: '2' } {
  const result = {}
  for (const pair of query.split('&')) {
    if (pair == '') continue
    const [key, value = ''] = pair.split('=')
    result[decodeURIComponent(key)] = decodeURIComponent(value)
  }
  return result
}

test 'parseQuery reads each pair' {
  expect(parseQuery('x=1&y=two')).toEqual({ x: '1', y: 'two' })
}

test 'a key without a value gets an empty string' {
  expect(parseQuery('flag')).toEqual({ flag: '' })
}

test 'an empty query gives an empty object' {
  expect(parseQuery('')).toEqual({})
}

test 'keys and values are decoded' {
  expect(parseQuery('name=Ada%20Lovelace').name).toBe('Ada Lovelace')
  expect(Object.keys(parseQuery('a=1&b=2&c=3'))).toContain('b')
}

test 'a refused argument is a value, not an exception' {
  expect(isMonadicError(parseQuery(42))).toBe(true)
}

test {
  assert(parseQuery('a=1').a == '1', 'values stay strings')
}

console.log(parseQuery('page=2&sort=name'))  // { page: '2', sort: 'name' }
```

The pieces:

- `test 'name' { … }` is a named test. The name is what a failure reports, so write it as the
  claim the test makes.
- `test { … }` is an unnamed test. It is reported by its position among all the tests in the
  file, named or not: the unnamed test above is the sixth, so it is reported as `test 6`.
- `expect(actual)` returns an object with the matchers below.
- `assert(condition, message)` fails the test with `message` when `condition` is falsy.
- `expect` and `assert` exist only inside `test` and `mock` blocks. `isMonadicError`, `Is` and
  `IsNot` are available everywhere in a TJS file. None of them needs an import.
- The body is TJS, with the same rules as the file: `==` inside a test is TJS's `==`.

`parseQuery(42)` is refused because `42` is not a string, and as in the opt-outs example the
refusal comes back as a `MonadicError` value. So that test asserts on the returned value with
`isMonadicError`, rather than expecting an exception.

### Matchers

| Matcher                    | Passes when                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| `toBe(x)`                  | `actual` deep-equals `x`                                          |
| `toEqual(x)`               | `actual` deep-equals `x` (the same comparison as `toBe`)          |
| `toContain(x)`             | a string contains the substring `x`, or an array has an element deep-equal to `x` |
| `toThrow(message?)`        | `actual` is a function that throws when called; if `message` is given, the thrown error's message must contain it |
| `toBeTruthy()`             | `actual` is truthy                                                |
| `toBeFalsy()`              | `actual` is falsy                                                 |
| `toBeNull()`               | `actual` is `null`                                                |
| `toBeUndefined()`          | `actual` is `undefined`                                           |
| `toBeGreaterThan(n)`       | `actual > n`                                                      |
| `toBeLessThan(n)`          | `actual < n`                                                      |
| `toBeNaN()`                | `actual` is the number `NaN`                                      |

Four differences from Jest catch people:

- **`toBe` is deep.** In Jest, `toBe` is `Object.is` and two equal-looking objects fail it. In
  TJS both `toBe` and `toEqual` compare by deep equality, so `expect({ a: [1] }).toBe({ a: [1] })`
  passes. The rules are the signature test's (same keys in any order, arrays in order), with
  two exceptions: numbers are compared exactly, so `expect(0.1 + 0.2).toBe(0.3)` fails, and
  `NaN` is unequal to itself, which is why `toBeNaN` exists.
- **There is no `.not`.** `expect(x).not.toBe(y)` fails with a `TypeError`. Write the negation
  into the value instead. For numbers, strings and booleans, `expect(x == y).toBe(false)`
  works. For objects and arrays it does not: TJS's `==` compares objects by identity, never by
  structure, so `{ a: 1 } == { a: 1 }` is `false` and that negative test would always pass.
  Use `IsNot`, the structural "not equal", instead: `expect(IsNot(x, y)).toBe(true)`.
  [Equality](/equality/) explains `==`, `Is` and `IsNot`.
- **`toContain` on a string needs a string.** `expect('abc').toContain(1)` fails and says the
  needle has the wrong type.
- **`toThrow` needs a function.** Pass `() => code`, not the result of calling it.

```tjs:inline
function divide(a: 6, b: 3): 2 {
  if (b === 0) throw new Error('division by zero')
  return a / b
}

test 'comparisons' {
  expect(divide(9, 3)).toBeGreaterThan(2)
  expect(divide(9, 3)).toBeLessThan(4)
}

test 'toThrow takes a function' {
  expect(() => divide(1, 0)).toThrow('division by zero')
}

test 'truthiness, null, undefined and NaN' {
  expect(divide(4, 2)).toBeTruthy()
  expect(divide(0, 2)).toBeFalsy()
  expect('abc'.match(/z/)).toBeNull()
  expect([1, 2].find((n) => n > 5)).toBeUndefined()
  expect(Number('two')).toBeNaN()
}

test 'toBe compares structure' {
  expect({ list: [1, 2] }).toBe({ list: [1, 2] })
  expect(['a', 'b']).toContain('b')
  expect('division by zero').toContain('zero')
}

test 'negate a primitive with ==, a structure with IsNot' {
  expect(divide(6, 3) == 3).toBe(false)
  expect(IsNot({ list: [1, 2] }, { list: [2, 1] })).toBe(true)
}

console.log(divide(8, 2))  // 4
```

`toThrow` is for code that really throws, like `divide` here. A TJS type error is returned,
so `expect(() => divide('6', 3)).toThrow()` fails: the call hands back a `MonadicError` and
throws nothing.

### Shared setup with `mock`

A `mock { … }` block holds setup code. What it declares is visible in every test, and like a
test it is removed from the output:

```tjs:inline
function total(items: [{ price: 0, qty: 1 }]): 0 {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0)
}

mock {
  const cart = [
    { price: 3, qty: 2 },
    { price: 5, qty: 1 },
  ]
}

test 'total multiplies price by quantity' {
  expect(total(cart)).toBe(11)
}

test 'total of an empty cart is zero' {
  expect(total([])).toBe(0)
}

test 'total ignores the order of items' {
  expect(total([...cart].reverse())).toBe(total(cart))
}

console.log(total([{ price: 2, qty: 3 }]))  // 6
```

Under the command-line tools, a mock runs **once**: after the module's top-level code and
before the first test. Its state is shared, so a change one test makes is seen by the next.

> **Write tests that pass either way.** The runner that executes examples live in the web
> version of this book runs the mock again before each test, so there every test starts with
> a fresh `cart`. A test that depends on another test's changes behaves differently under the
> two. Treat what a mock declares as read-only; the third test copies `cart` before reversing
> it for that reason.

### Async code in a test

A `test` block may `await`. Transpiling cannot wait (it is synchronous), so a file whose tests
await runs them afterwards, the way the page runs them: `tjs test` and `tjs check` do it for you,
and a test that fails there fails the command.

```tjs:static
async function loadUser(id: 1):! { name: '' } {
  return { name: 'Ada' }
}

test 'loads a user' {
  const user = await loadUser(1)
  expect(user.name).toBe('Ada')
}
```

One limit: a file with `import` statements cannot be run that way from the command line (there is
no module loader), so its tests are reported inconclusive there. Test that code in a `*.test.tjs`
file (see [Running tests](#running-tests)).

### In a TypeScript file

TypeScript cannot parse `test 'name' { }`, so in a `.ts` file write the same block inside a
comment that starts `/*test`:

```typescript
export function slugify(title: string): string {
  return title.trim().toLowerCase().split(/\s+/).join('-')
}

/*test 'slugify joins words with dashes' {
  expect(slugify('  Two Words ')).toBe('two-words')
}*/
```

`tsc` sees a comment. TJS runs the test when it converts the file: `tjs test slugify.ts` and
`tjs check slugify.ts` both run it. (`tjs check` on a directory skips `.ts` files; name the
file.)

## Testing private functions

A `test` block runs inside the module it is written in, so it can call anything the module
declares, exported or not:

```tjs:inline
function normalize(email: ' Ada@Example.COM '): 'ada@example.com' {
  return email.trim().toLowerCase()
}

function isValid(email: ''): false {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function register(email: 'ada@example.com'): { ok: true, email: 'ada@example.com' } {
  const clean = normalize(email)
  return isValid(clean) ? { ok: true, email: clean } : { ok: false, email: clean }
}

test 'normalize trims and lowercases' {
  expect(normalize('  X@Y.Z ')).toBe('x@y.z')
}

test 'isValid needs an @ and a dot' {
  expect(isValid('ada@example.com')).toBe(true)
  expect(isValid('ada.example.com')).toBe(false)
}

test 'register cleans before validating' {
  expect(register(' Grace@Navy.MIL ')).toEqual({ ok: true, email: 'grace@navy.mil' })
}

console.log(register('nobody'))  // { ok: false, email: 'nobody' }
```

`register`'s return example is the real answer for `register('ada@example.com')`, so it is a
checked worked example. It also describes the shape of every result: `ok: true` stands for "a
boolean", which is why returning `ok: false` for a bad address is fine.

`normalize` and `isValid` stay private: the module's public surface is `register` alone, and
nothing is exported "for testing". In a separate test file, the helpers could only be tested
through `register`, or by exporting them.
[Inline Tests: Test Private Functions](/inline-tests-test-private-functions/) works through a
larger module the same way.

### Behaviour across modules

The limit is the other side of the same fact: a `test` block sees exactly one module. That
module's imports are **not loaded** when its tests run, so any test, signature or `test`
block, that touches an imported name cannot run and is reported inconclusive. A test of how
two modules work together belongs where imports work:

- a `*.test.tjs` file run by `tjs test`, or
- an ordinary `bun test` suite with the `tjs-lang/bun-plugin` preload, which can import
  `.tjs` modules directly.

[Modules and Imports](/modules-and-imports/) explains how imports resolve and how to set up
the preload.

The division of labour that falls out of this is the usual one, moved closer to the code:
signature tests and `test` blocks for the behaviour of each module's own functions, private
ones included, and a normal test runner for anything that crosses a module boundary.

## Running tests

Several tools run these tests, and they differ in what they report and what stops on a
failure. This section is the concepts; [Running TJS](/running-tjs/) has the commands and
flags in full.

| Tool                          | Runs signature tests and `test` blocks | Fails on a failed test | Fails on an inconclusive test |
| ----------------------------- | -------------------------------------- | ---------------------- | ----------------------------- |
| `tjs check file.tjs`          | yes                                    | yes                    | no                            |
| `tjs test file.tjs`           | yes, and lists each result             | yes                    | no                            |
| `tjs test dir/`               | no; runs `*.test.tjs` under `bun test` | (Bun's own tests)      | (none)                        |
| `tjs emit`                    | yes                                    | yes                    | yes                           |
| `tjs run`                     | no                                     | no                     | no                            |
| `tjs(source)`                 | yes                                    | throws                 | no                            |
| `tjs(source, { runTests: 'report' })` | yes                            | no; reports            | no; reports                   |
| Bun plugin                    | only with `TJS_RUN_TESTS=1`            | yes, when on           | no                            |
| `Bun.build` with `tjsPlugin`  | only with `runTests: true`             | yes, when on           | no                            |

### The example file

The transcripts below come from this file. `slugify` has a bug (it turns surrounding spaces
into dashes), `pageWidth` needs a browser, and one test catches the bug:

```tjs:static
function slugify(title: 'Hello World'): 'hello-world' {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function pageWidth(margin: 10): 0 {
  return document.body.clientWidth - margin * 2
}

test 'slugify ignores surrounding spaces' {
  expect(slugify('  Hi there ')).toBe('hi-there')
}
```

### `tjs check`: the gate

`tjs check file.tjs` runs every signature test and `test` block and exits with status 1 if
any fails. For a passing file it prints ✓ and the file's function signatures; for a failing
one it prints the failures in detail:

```text
$ tjs check slug.tjs
✗ slug.tjs
  Transpile-time test failures:
  Test 'slugify ignores surrounding spaces' (line 9) failed:
    Expected "hi-there" but got "-hi-there-"
```

This is the command for CI and before a commit.

### `tjs test file.tjs`: every result

`tjs test` on a single `.tjs` file runs the same tests and lists each one, passed or not:

```text
$ tjs test slug.tjs
  ✓ Signature: slugify signature example:1
  ? Signature: pageWidth signature example:5 — inconclusive: document is not defined
  ✗ 'slugify ignores surrounding spaces':9 — Expected "hi-there" but got "-hi-there-"

slug.tjs: 1 passed, 1 failed, 1 inconclusive
```

The number after each name is its line. The `?` line is the one `tjs check` did not show.

### `*.test.tjs` files under `bun test`

Given a directory, no argument, or a file whose name ends in `.test.tjs`, `tjs test` does
something different: it runs `*.test.tjs` files with `bun test`. These are ordinary Bun test
files written in TJS. They import `test` and `expect` from `bun:test`, call `test(name, fn)`
with a function, and can import other modules, including `.tjs` ones:

```tjs:static
// math.test.tjs
import { test, expect } from 'bun:test'
import { add } from './math.tjs'

test('adds two numbers', () => {
  expect(add(1, 1)).toBe(2)
})

test('awaits like any Bun test', async () => {
  expect(await Promise.resolve(add(2, 2))).toBe(4)
})
```

The two forms are told apart by their syntax. `test 'name' { … }`, a name followed directly by
a block, is TJS's inline test. `test('name', () => { … })` is an ordinary function call, here
to Bun's `test`. On this route the inline form does not run: a `test '…' { }` block inside a
`*.test.tjs` file is **silently skipped**, so use only `test(name, fn)` there.

### `tjs run` does not test

`tjs run` compiles a file and executes it. **It runs no signature tests and no `test`
blocks**, and it exits 0 on a file whose worked example is wrong. A clean `run` says the code
executed, not that it is correct. Check first:

```bash
tjs check app.tjs && tjs run app.tjs
```

### `tjs emit` refuses failing files

`tjs emit` runs the tests before it writes JavaScript and refuses to write a file whose tests
fail, exiting with status 1. `--jfdi` ("just do it") writes the file anyway.

### From code: `tjs()`

The transpiler takes a `runTests` option:

| `runTests`         | What happens                                                                 |
| ------------------ | ---------------------------------------------------------------------------- |
| `true` (default)   | runs signature tests and `test` blocks; throws if one fails                  |
| `false`            | runs nothing                                                                 |
| `'report'`         | runs them and puts the results in `testResults` without throwing             |

(`'only'` also exists: it runs the tests and emits no code.)

```javascript
import { tjs } from 'tjs-lang/lang'

const source = `
function add(a: 2, b: 3): 5 { return a + b }
test 'adds small numbers' { expect(add(1, 1)).toBe(2) }
`

const { code, testResults } = tjs(source, { runTests: 'report' })
console.log(testResults)
// (undefined fields omitted)
// [
//   { description: 'adds small numbers', passed: true, line: 3 },
//   { description: 'add signature example', passed: true, isSignatureTest: true, line: 2 },
// ]
```

Each result has `description` and `passed`; a failure adds `error`, a signature test has
`isSignatureTest: true`, and one that could not run has `inconclusive: true`. With
`runTests: 'report'`, deciding what a failure means is up to you.

### Under Bun and `Bun.build`

The Bun plugin (`preload = ["tjs-lang/bun-plugin"]`) compiles `.tjs` files as they are
imported, and runs **no** tests on import: importing a module should not run its tests. Set
`TJS_RUN_TESTS=1` to make it run them, so a wrong example fails at import under `bun` or
`bun test`. That costs a test run per file loaded, so it suits CI better than everyday runs.

For bundling, `Bun.build` ignores the preload; pass `tjsPlugin({ runTests: true })` from
`tjs-lang/bun-build-plugin` to run each file's tests as it is bundled, so a failing test fails
the build. [Running TJS](/running-tjs/) shows both setups.

## Inconclusive tests

The command-line tools run your tests inside their own process, which is Bun, not a browser
and not your server. Ordinary JavaScript globals are there (`Math`, `JSON`, `setTimeout`,
even `fetch`); browser globals such as `document`, `window` and `localStorage` are not; and,
as above, the module's imports are not loaded. Some tests cannot run there, and TJS does not
count those as failures.

A test is **inconclusive** when:

- a signature test's call throws, for any reason;
- a `test` block uses a name that is not defined when it runs: a binding from an `import`, a
  browser global such as `document`, or a plain misspelling of a helper's name;
- the module itself cannot run under the test harness, which is what an `await` in a test
  body causes (see [Async code in a test](#async-code-in-a-test)). Then every test in the file
  is inconclusive.

```tjs:static
function pageWidth(margin: 10): 0 {
  return document.body.clientWidth - margin * 2
}
```

There is no `document` when tests run, so this signature test cannot run. It is not failed.
A `test` block whose assertion is wrong, or that throws anything other than a missing name, is
failed as usual.

The reason is a rule TJS keeps: a file that is valid JavaScript never fails to compile just
because TJS could not run its example. A function that is fine JavaScript does not become a
compile error because the transpiler had no `document` to give it. See
[Design Principles & Invariants](/PRINCIPLES/#worked-example-signature-tests).

The price is that "could not run" also covers real bugs. A function whose example crashes,
with a `TypeError` from a typo say, gets an inconclusive signature test, not a failed one, and
a test block that calls `parseQery` instead of `parseQuery` never runs. Neither is caught by
`tjs check`.

What each tool does with an inconclusive test:

| Tool           | An inconclusive test                                             |
| -------------- | ---------------------------------------------------------------- |
| `tjs test`     | listed with `?` and the reason; does not fail                    |
| `tjs check`    | not shown; does not fail. The file gets a plain ✓                |
| `tjs emit`     | counted as a failure: the file is not written                    |
| `tjs()`        | in `testResults` with `inconclusive: true`; never throws         |

**A quiet `tjs check` does not mean every test ran.** It means nothing failed. If a file's
tests matter, look at it once with `tjs test` and count the `?` lines. Expect a `?` for
anything that needs a browser or an import; treat any other `?` as a bug to look at.

## Current limitations

These are gaps in today's tools, not the design. Each is described above where it matters;
this is the list in one place.

- **`await` in a `test` block** runs after transpiling, as on the page; in a file with `import`
  statements the command line cannot run it and reports it inconclusive (`tjs check` warns).
- **`async` functions** get no signature test at transpile time: `tjs()` reports the example as
  inconclusive, and `tjs check` warns that it could not run.
- **Arrow functions and function expressions** assigned to a `const` get no signature test,
  and neither do methods of a class with no constructor.
- **A `Type`-named parameter** supplies no example, so the function gets no signature test,
  with no warning.
- **`tjs emit` treats an inconclusive test as a failure** where `tjs check` does not, so it
  refuses files that `check` accepts; any file whose example needs an import or a browser
  hits this. Until the two agree, let `check` decide and `emit` write:

  ```bash
  tjs check src/ && tjs emit src/ -o dist/ --jfdi
  ```

  `--jfdi` is safe there only because of the `&&`.
- **A mock runs once on the command line** and before each test in the web version of this
  book. Write tests that pass either way.
