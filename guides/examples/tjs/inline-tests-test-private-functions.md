<!--{"section":"tjs","type":"example","group":"advanced","order":16}-->

# Inline Tests: Test Private Functions

Test internals without exporting them - the killer feature

```tjs
/**
 * # Testing Private Functions
 *
 * This is the killer feature of inline tests:
 * You can test functions WITHOUT exporting them.
 *
 * Traditional testing requires you to either:
 * - Export internal helpers (pollutes your API)
 * - Test only through public interface (incomplete coverage)
 * - Use hacks like rewire/proxyquire (brittle)
 *
 * TJS inline tests have full access to the module scope.
 * Test everything. Export only what you need.
 */

// ============================================================
// PRIVATE HELPERS (not exported, but fully testable!)
// ============================================================

// Private: Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Private: Validate email format
function isValidEmail(email: '') -> true {
  return EMAIL_REGEX.test(email)
}

// Private: Sanitize user input
function sanitize(input: '') -> '' {
  return input.trim().toLowerCase()
}

// Private: Generate a unique ID
function generateId(prefix: 'user') -> '' {
  return prefix + '_' + Math.random().toString(36).slice(2, 10)
}

// Private: Hash password (simplified for demo)
function hashPassword(password: '') -> '' {
  let hash = 0
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash) + password.charCodeAt(i)
    hash = hash & hash
  }
  return 'hashed_' + Math.abs(hash).toString(16)
}

// Private: Check password strength
function isStrongPassword(password: '') -> { strong: true, issues: [''] } {
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

export function createUser(input: { email: '', password: '' })
  -> { id: '', email: '', passwordHash: '' } | { error: '', code: 0 } {

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
