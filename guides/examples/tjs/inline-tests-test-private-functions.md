<!--{"section": "tjs", "type": "example", "group": "advanced", "order": 16, "parent": "tjs-advanced.md"}-->

# Inline Tests: Test Private Functions

Test internals without exporting them - the killer feature

```tjs:inline
/#
## Testing Private Functions

This is the killer feature of inline tests:
You can test functions WITHOUT exporting them.

Traditional testing requires you to either:
- Export internal helpers (pollutes your API)
- Test only through public interface (incomplete coverage)
- Use hacks like rewire/proxyquire (brittle)

TJS inline tests have full access to the module scope.
Test everything. Export only what you need.
#/

// ============================================================
// PRIVATE HELPERS (not exported, but fully testable!)
// ============================================================

// Private: Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Private: Validate email format
function isValidEmail(email: ''): false {
  return EMAIL_REGEX.test(email)
}

// Private: Sanitize user input
function sanitize(input: ''): '' {
  return input.trim().toLowerCase()
}

// Private: Generate a unique ID
function generateId(prefix: 'user'):! '' {
  return prefix + '_' + Math.random().toString(36).slice(2, 10)
}

// Private: Hash password (simplified for demo)
function hashPassword(password: ''): 'hashed_0' {
  let hash = 0
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash) + password.charCodeAt(i)
    hash = hash & hash
  }
  return 'hashed_' + Math.abs(hash).toString(16)
}

// Private: Check password strength
function isStrongPassword(password: ''):! { strong: true, issues: [''] } {
  const issues = []
  if (password.length < 8) issues.push('Must be at least 8 characters')
  if (!/[A-Z]/.test(password)) issues.push('Must contain uppercase letter')
  if (!/[a-z]/.test(password)) issues.push('Must contain lowercase letter')
  if (!/[0-9]/.test(password)) issues.push('Must contain a number')
  return { strong: issues.length === 0, issues }
}

// ============================================================
// PUBLIC API (this is all that gets exported)
// ============================================================

export function createUser(input: { email: '', password: '' }):! { id: '', email: '', passwordHash: '' } | { error: '', code: 0 } {

  // Validate email (using private helper)
  const cleanEmail = sanitize(input.email)
  if (!isValidEmail(cleanEmail)) {
    return { error: 'Invalid email format', code: 400 }
  }

  // Validate password (using private helper)
  const strength = isStrongPassword(input.password)
  if (!strength.strong) {
    return { error: strength.issues.join(', '), code: 400 }
  }

  // Create user (using private helpers)
  return {
    id: generateId('user'),
    email: cleanEmail,
    passwordHash: hashPassword(input.password)
  }
}

// ============================================================
// TESTS - Full access to private functions!
// ============================================================

// --- Test private email validation ---
test 'isValidEmail accepts valid emails' {
  expect(isValidEmail('test@example.com')).toBe(true)
  expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true)
}

test 'isValidEmail rejects invalid emails' {
  expect(isValidEmail('not-an-email')).toBe(false)
  expect(isValidEmail('@nodomain.com')).toBe(false)
  expect(isValidEmail('spaces in@email.com')).toBe(false)
}

// --- Test private sanitization ---
test 'sanitize trims and lowercases' {
  expect(sanitize('  HELLO  ')).toBe('hello')
  expect(sanitize('  Test@Email.COM  ')).toBe('test@email.com')
}

// --- Test private ID generation ---
test 'generateId creates prefixed unique IDs' {
  const id1 = generateId('user')
  const id2 = generateId('user')
  expect(id1.startsWith('user_')).toBe(true)
  expect(id1 !== id2).toBe(true) // unique each time
}

test 'generateId respects prefix' {
  expect(generateId('post').startsWith('post_')).toBe(true)
  expect(generateId('comment').startsWith('comment_')).toBe(true)
}

// --- Test private password hashing ---
test 'hashPassword is deterministic' {
  const hash1 = hashPassword('secret123')
  const hash2 = hashPassword('secret123')
  expect(hash1).toBe(hash2)
}

test 'hashPassword produces different hashes for different inputs' {
  const hash1 = hashPassword('password1')
  const hash2 = hashPassword('password2')
  expect(hash1 !== hash2).toBe(true)
}

// --- Test private password strength checker ---
test 'isStrongPassword rejects weak passwords' {
  const result = isStrongPassword('weak')
  expect(result.strong).toBe(false)
  expect(result.issues.length).toBeGreaterThan(0)
}

test 'isStrongPassword accepts strong passwords' {
  const result = isStrongPassword('MyStr0ngP@ss!')
  expect(result.strong).toBe(true)
  expect(result.issues.length).toBe(0)
}

test 'isStrongPassword lists specific issues' {
  const noUpper = isStrongPassword('lowercase123')
  expect(noUpper.issues).toContain('Must contain uppercase letter')

  const noLower = isStrongPassword('UPPERCASE123')
  expect(noLower.issues).toContain('Must contain lowercase letter')

  const noNumber = isStrongPassword('NoNumbers!')
  expect(noNumber.issues).toContain('Must contain a number')

  const tooShort = isStrongPassword('Ab1!')
  expect(tooShort.issues).toContain('Must be at least 8 characters')
}

// --- Test the public API (integration) ---
test 'createUser validates email' {
  const result = createUser({ email: 'invalid', password: 'StrongPass1!' })
  expect(result.error).toBe('Invalid email format')
}

test 'createUser validates password strength' {
  const result = createUser({ email: 'test@test.com', password: 'weak' })
  expect(result.error).toBeTruthy()
}

test 'createUser succeeds with valid input' {
  const result = createUser({
    email: '  Test@Example.COM  ',
    password: 'MyStr0ngPass!'
  })
  expect(result.id).toBeTruthy()
  expect(result.email).toBe('test@example.com') // sanitized
  expect(result.passwordHash.startsWith('hashed_')).toBe(true)
}

// ============================================================
// DEMO OUTPUT
// ============================================================

console.log('=== Testing Private Functions Demo ===\n')
console.log('The functions isValidEmail, sanitize, generateId,')
console.log('hashPassword, and isStrongPassword are all PRIVATE.')
console.log('They are NOT exported. But we tested them all!\n')

console.log("Try this in Jest/Vitest without exporting them. You can't.")
console.log("You'd have to either pollute your API or leave them untested.\n")

console.log('TJS inline tests: Full coverage. Clean exports.\n')

// Show the public API working
const user = createUser({ email: 'demo@example.com', password: 'SecurePass123!' })
console.log('Created user:', user)
```

<!-- TODO review -->
## What to notice

- **The tests sit beside the code they test, in the same scope.** `isValidEmail`,
  `sanitize` and `isStrongPassword` are never exported, yet every `test '…' { }` block can call
  them directly. The module's public surface is exactly `createUser`, and nothing had to be
  exported "for testing".
- **There are two kinds of test here.** The `test` blocks are the obvious ones. The less
  obvious ones are the signatures: `sanitize(input: ''): ''` is itself a test. The transpiler
  calls `sanitize('')` and checks the result deep-equals `''`. A return annotation in TJS is a
  *worked example*, run as a test, not a type.
- **`:!` opts a function out of its signature test.** `generateId` returns a random string, so
  no fixed example can match it; `isStrongPassword` returns a list whose contents depend on
  the input. Both are written `:!`, which keeps the return as documentation without running
  it. Use `:!` when the result is not a fixed function of the example inputs.
- **Tests do not ship.** They run when the file is transpiled and are stripped from the
  emitted JavaScript, so a thorough suite costs the production bundle nothing.

<!-- TODO review -->
## When a test fails

A failing test fails the *build*, not just a test report. Take a helper with a bug:

<!-- tjs-doc: expect-error -->

```tjs:static
function slugify(title: 'Hello World'): 'hello-world' {
  return title.toLowerCase().split(' ').join('-')
}

test 'slugify ignores surrounding spaces' {
  expect(slugify('  Hi there ')).toBe('hi-there')
}
```

The signature example passes (`'Hello World'` has no stray spaces), and the test block
catches what it misses. From the command line:

- `tjs check file.tjs` exits 1 and prints
  `Expected "hi-there" but got "--hi-there-"`.
- `tjs emit file.tjs` refuses to write output until the tests pass (`--jfdi` overrides it).
- `tjs test file.tjs` lists every signature test and test block with a pass or fail mark.
- `tjs run file.tjs` still executes the file. It is the one command that does not gate on
  tests, so do not treat a clean `run` as proof that a file is correct.

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

console.log(slugify('  Test the Helpers, Ship the API  '))
```

<!-- TODO review -->
## Limits

- **A test needs the module to execute.** Tests run against the module's own top-level code.
  If that code cannot run at transpile time (it imports a package the transpiler cannot
  resolve, or touches the DOM), the tests are reported as *inconclusive*, not failed. An
  inconclusive test does not break the build, so check for that word in the output rather
  than assuming silence means green.
- **Top-level side effects run during testing.** The `console.log` calls at the bottom of
  this example execute when the tests do. Keep expensive or effectful top-level work behind a
  function call.
- **Tests are per file.** They see one module's scope. Cross-module behaviour belongs in an
  ordinary test runner that imports the public API.
