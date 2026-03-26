<!--{"section":"tjs","type":"example","group":"patterns","order":20}-->

# Type Declarations

Named types with runtime validation. Type, Generic, FunctionPredicate, Enum, Union.

```tjs
/*#
## Runtime Types

TypeScript types vanish at runtime. TJS types survive as
callable validators with `.check()`, `.description`, and a
default example value.

| Declaration | Creates | Use case |
|-------------|---------|----------|
| `Type` | Value shape validator | Simple types with examples |
| `Generic` | Parameterized validator factory | Container types |
| `FunctionPredicate` | Function signature type | Callback contracts |
| `Enum` | String/number enum | Finite value sets |
| `Union` | Literal union | Status codes, directions |
*/

// --- Type: runtime type from example value ---

Type Email {
  description: 'a valid email address'
  example: 'user@example.com'
  predicate(x) { return typeof x === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) }
}

test 'Email validates at runtime' {
  expect(Email.check('alice@test.com')).toBe(true)
  expect(Email.check('not-an-email')).toBe(false)
  expect(Email.check(42)).toBe(false)
}

// --- Generic: parameterized type factory ---

Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
}

test 'Generic Box is a factory' {
  const AnyBox = Box(() => true)
  expect(AnyBox.check({ value: 'hello' })).toBe(true)
  expect(AnyBox.check(null)).toBe(false)
  expect(AnyBox.check('not an object')).toBe(false)
}

// --- FunctionPredicate: function signature type ---

FunctionPredicate Formatter {
  params: { input: '' }
  returns: ''
}

test 'FunctionPredicate validates callables' {
  expect(Formatter.check(x => x.toUpperCase())).toBe(true)
  expect(Formatter.check('not a function')).toBe(false)
  expect(Formatter.check(42)).toBe(false)
}

// --- Generic FunctionPredicate ---

FunctionPredicate Mapper<T, U> {
  params: { input: T }
  returns: U
}

test 'Generic FunctionPredicate is a factory' {
  const StringToNum = Mapper('', 0)
  expect(StringToNum.check(x => x.length)).toBe(true)
  expect(StringToNum.check(42)).toBe(false)
}

// --- Enum: named value sets ---

Enum Status 'request status' {
  Pending = 'pending'
  Active = 'active'
  Done = 'done'
}

test 'Enum validates membership' {
  expect(Status.check('pending')).toBe(true)
  expect(Status.check('active')).toBe(true)
  expect(Status.check('invalid')).toBe(false)
}

// --- Union: literal union types ---

Union Direction 'cardinal' 'north' | 'south' | 'east' | 'west'

test 'Union validates literals' {
  expect(Direction.check('north')).toBe(true)
  expect(Direction.check('northeast')).toBe(false)
}

console.log('Email valid:', Email.check('test@test.com'))
console.log('Email invalid:', Email.check('nope'))
console.log('Box valid:', Box(() => true).check({ value: 42 }))
console.log('Status:', Status.check('pending'), Status.check('bogus'))
console.log('Direction:', Direction.check('north'), Direction.check('up'))
```
