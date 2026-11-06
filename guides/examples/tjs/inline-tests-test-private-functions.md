<!--{"section": "tjs", "type": "example", "group": "advanced", "order": 16, "parent": "tjs-advanced.md"}-->
<!-- TODO review -->

# Inline Tests: Test Private Functions

A TJS file can test its own helpers without exporting them or adding a test-only export.

A `test '…' { }` block runs inside the module it is written in, so it can call anything that
module declares: exported or not. In most JavaScript setups a test file imports the module
under test, which means it can only reach what the module exports, and internal helpers end up
exported "for testing" or tested only through the public API.

Tests run when the file is transpiled, not in a separate test step. The transpiler executes
the module's own top-level code, runs the tests against it, and leaves the tests out of the
JavaScript it emits.

The example below is a small sign-up module. Five helpers are private; only `createUser` is
exported. Every helper is tested directly. Two pieces of TJS syntax carry most of it:

- **A parameter's colon value is an example, not a type.** `email: ''` says `email` is a
  string, and `''` is the input the signature test calls the function with.
- **A return annotation is the expected output for those inputs.**
  `isValidEmail(email: ''): false` means "`isValidEmail('')` returns `false`", and the
  transpiler checks it. Writing `:!` in place of the `:` keeps the return as documentation
  and runs nothing.

[The syntax reference](/TJS-SYNTAX/) covers both. Inside a `test` block, `expect` is built in,
with Jest-style matchers (`toBe`, `toEqual`, `toContain` and others; the full list is in the
reference under "Test blocks").

```tjs:inline
// ============================================================
// Private helpers (not exported)
// ============================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The return annotation is a worked example, and it is tested:
// the transpiler calls isValidEmail('') and checks the result is false.
// An empty string is not a valid address, so false is the right answer.
function isValidEmail(email: ''): false {
  return EMAIL_REGEX.test(email)
}

// Tested the same way: sanitize('') must return ''.
function sanitize(input: ''): '' {
  return input.trim().toLowerCase()
}

// The result is random, so no fixed example can match it.
// `:!` keeps the return as documentation without testing it.
function generateId(prefix: 'user'):! '' {
  return prefix + '_' + Math.random().toString(36).slice(2, 10)
}

// A toy hash, for the demo only. Never hash real passwords like this.
// The worked example is exact: the empty string never enters the
// loop, so the hash stays 0 and the result is 'hashed_0'.
function hashPassword(password: ''): 'hashed_0' {
  let hash = 0
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash) + password.charCodeAt(i)
    hash = hash & hash // force to a 32-bit integer
  }
  return 'hashed_' + Math.abs(hash).toString(16)
}

// The return shows the SHAPE (a flag plus a list of messages), not the
// answer for '' (which is strong: false with four messages), so `:!`
// keeps it as documentation instead of testing it.
function isStrongPassword(password: ''):! { strong: true, issues: [''] } {
  const issues = []
  if (password.length < 8) issues.push('Must be at least 8 characters')
  if (!/[A-Z]/.test(password)) issues.push('Must contain uppercase letter')
  if (!/[a-z]/.test(password)) issues.push('Must contain lowercase letter')
  if (!/[0-9]/.test(password)) issues.push('Must contain a number')
  return { strong: issues.length === 0, issues }
}

// ============================================================
// Public API (the only export)
// ============================================================

// `Type` declares a named type from an example. Examples widen:
// `code: 400` means "an integer", not "exactly 400".
Type NewUser = { id: '', email: '', passwordHash: '' }
Type Failure = { error: '', code: 400 }

// The annotation names two possible shapes, not one result, so it is
// `:!`: createUser({ email: '', password: '' }) returns a Failure.
export function createUser(input: { email: '', password: '' }):! NewUser | Failure {
  const cleanEmail = sanitize(input.email)
  if (!isValidEmail(cleanEmail)) {
    return { error: 'Invalid email format', code: 400 }
  }

  const strength = isStrongPassword(input.password)
  if (!strength.strong) {
    return { error: strength.issues.join(', '), code: 400 }
  }

  return {
    id: generateId('user'),
    email: cleanEmail,
    passwordHash: hashPassword(input.password)
  }
}

// ============================================================
// Tests: they call the private helpers directly
// ============================================================

test 'isValidEmail accepts valid emails' {
  expect(isValidEmail('test@example.com')).toBe(true)
  expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true)
}

test 'isValidEmail rejects invalid emails' {
  expect(isValidEmail('not-an-email')).toBe(false)
  expect(isValidEmail('@nodomain.com')).toBe(false)
  expect(isValidEmail('spaces in@email.com')).toBe(false)
}

test 'sanitize trims and lowercases' {
  expect(sanitize('  HELLO  ')).toBe('hello')
  expect(sanitize('  Test@Email.COM  ')).toBe('test@email.com')
}

test 'generateId creates prefixed, distinct IDs' {
  const id1 = generateId('user')
  const id2 = generateId('user')
  expect(id1.startsWith('user_')).toBe(true)
  expect(id1 !== id2).toBe(true)
  expect(generateId('post').startsWith('post_')).toBe(true)
}

test 'hashPassword is deterministic' {
  expect(hashPassword('secret123')).toBe(hashPassword('secret123'))
}

test 'hashPassword gives different inputs different hashes' {
  expect(hashPassword('password1') !== hashPassword('password2')).toBe(true)
}

test 'isStrongPassword accepts a strong password' {
  const result = isStrongPassword('MyStr0ngP@ss!')
  expect(result.strong).toBe(true)
  expect(result.issues.length).toBe(0)
}

test 'isStrongPassword names each problem' {
  expect(isStrongPassword('lowercase123').issues).toContain('Must contain uppercase letter')
  expect(isStrongPassword('UPPERCASE123').issues).toContain('Must contain lowercase letter')
  expect(isStrongPassword('NoNumbers!').issues).toContain('Must contain a number')
  expect(isStrongPassword('Ab1!').issues).toContain('Must be at least 8 characters')
}

// The public function is tested too, end to end.
test 'createUser rejects a bad email' {
  const result = createUser({ email: 'invalid', password: 'StrongPass1!' })
  expect(result.error).toBe('Invalid email format')
}

test 'createUser rejects a weak password' {
  const result = createUser({ email: 'test@test.com', password: 'weak' })
  expect(result.code).toBe(400)
}

test 'createUser cleans the email and hashes the password' {
  const result = createUser({ email: '  Test@Example.COM  ', password: 'MyStr0ngPass!' })
  expect(result.email).toBe('test@example.com')
  expect(result.passwordHash.startsWith('hashed_')).toBe(true)
}

// ============================================================
// Demo (top-level code, so it also runs when the tests do; harmless
// here, and it gives the live example some output)
// ============================================================

console.log(createUser({ email: 'demo@example.com', password: 'SecurePass123!' }))
// { id: 'user_…' (random), email: 'demo@example.com', passwordHash: 'hashed_…' }
console.log(createUser({ email: 'demo@example.com', password: 'short' }))
// { error: 'Must be at least 8 characters, Must contain uppercase letter, Must contain a number', code: 400 }
```

## What to notice

- **The tests share the module's scope.** None of the five helpers is exported, yet every
  `test` block calls them directly. The module's public surface is exactly `createUser`.
- **There are two kinds of test here.** The `test` blocks are the obvious ones. The signatures
  are the others: `isValidEmail(email: ''): false` tells the transpiler to call
  `isValidEmail('')` and check that the result deep-equals `false`. A return annotation in TJS
  is a worked example that is run, not a type.
- **`:!` opts a function out of its signature test.** `generateId` returns a random string, so
  no example can match it. `isStrongPassword` and `createUser` do return a fixed result for
  their example inputs, but the annotation describes the general shape rather than that one
  result. `:!` keeps the return as documentation without running it. Use it when the result is
  not a fixed function of the example inputs, or when you want the annotation to show a shape
  rather than the answer for the example.
- **Pick worked examples you can check by hand.** `hashPassword(password: ''): 'hashed_0'`
  works because the empty string skips the loop entirely. When an exact answer for the example
  input is easy to reason about, prefer it to `:!`: it is a free test.
- **Tests do not ship.** They are left out of the emitted JavaScript, so a thorough suite adds
  nothing to the production bundle, and there is no build setting to strip them. (Vitest's
  in-source testing is the closest equivalent: tests go inside an `if (import.meta.vitest)`
  block, and the build needs a `define` setting to remove them.)

## When a test fails

A failing test stops the transpile: the file does not compile, so on this page the example
shows the error instead of running. Here is a helper with a bug:

<!-- tjs-doc: expect-error -->

```tjs:static
function slugify(title: 'Hello World'): 'hello-world' {
  return title.toLowerCase().split(' ').join('-')
}

test 'slugify ignores surrounding spaces' {
  expect(slugify('  Hi there ')).toBe('hi-there')
}
```

The signature example passes, because `'Hello World'` has no stray spaces. The test block
catches what the example misses:

```text
Expected "hi-there" but got "--hi-there-"
```

From the command line, a failing test fails `tjs check` (exit 1) and blocks `tjs emit` (unless
you pass `--jfdi`), but `tjs run` does not run tests at all, so a clean `run` is not proof that
a file is correct. [Running TJS](/running-tjs/) has the details for each command.

Fix the helper and both kinds of test pass:

```tjs:inline
function slugify(title: 'Hello World'): 'hello-world' {
  return title.trim().toLowerCase().split(/\s+/).join('-')
}

test 'slugify ignores surrounding spaces' {
  expect(slugify('  Hi there ')).toBe('hi-there')
}

test 'slugify collapses runs of whitespace' {
  expect(slugify('Inline   tests')).toBe('inline-tests')
}

console.log(slugify('  Test the Helpers   Ship the API  ')) // test-the-helpers-ship-the-api
```

## Limits

- **A test needs the module to execute.** If the module's top-level code cannot run at
  transpile time (it touches `document` or another browser-only global, say), its tests are
  reported as *inconclusive*, not failed. `tjs check` and `tjs test` accept an inconclusive
  test, and `check` prints a plain ✓, so a quiet check does not mean the tests passed;
  `tjs emit` currently refuses the file. [Running TJS](/running-tjs/) covers how each command
  treats them.
- **Top-level side effects run whenever the file is checked, tested or emitted.** The demo
  `console.log` calls in the first example run every time the tests do. Keep expensive or
  effectful top-level work behind a function call.
- **Tests are per file.** They see one module's scope. Behaviour that spans modules belongs in
  an ordinary test runner that imports the public API.
