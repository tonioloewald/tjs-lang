import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import {
  Type,
  isRuntimeType,
  TString,
  TNumber,
  TBoolean,
  TInteger,
  TPositiveInt,
  TNonEmptyString,
  TEmail,
  TUrl,
  TUuid,
  Nullable,
  Optional,
  Union,
  TArray,
} from './Type'
import { checkType, validateArgs, isError } from '../lang/runtime'

describe('Type()', () => {
  describe('Type(description, predicate)', () => {
    it('creates a type with custom predicate', () => {
      const ZipCode = Type(
        '5-digit US zip code',
        (s) => typeof s === 'string' && /^\d{5}$/.test(s)
      )

      expect(ZipCode.description).toBe('5-digit US zip code')
      expect(ZipCode.check('12345')).toBe(true)
      expect(ZipCode.check('1234')).toBe(false)
      expect(ZipCode.check('123456')).toBe(false)
      expect(ZipCode.check('abcde')).toBe(false)
      expect(ZipCode.check(12345)).toBe(false)
    })

    it('creates a type with complex predicate', () => {
      const EvenNumber = Type(
        'even number',
        (n) => typeof n === 'number' && n % 2 === 0
      )

      expect(EvenNumber.check(2)).toBe(true)
      expect(EvenNumber.check(4)).toBe(true)
      expect(EvenNumber.check(3)).toBe(false)
      expect(EvenNumber.check('2')).toBe(false)
    })
  })

  describe('Type(description, schema)', () => {
    it('creates a type with schema validation', () => {
      const Age = Type('age in years', s.number.min(0).max(150))

      expect(Age.description).toBe('age in years')
      expect(Age.check(25)).toBe(true)
      expect(Age.check(0)).toBe(true)
      expect(Age.check(150)).toBe(true)
      expect(Age.check(-1)).toBe(false)
      expect(Age.check(151)).toBe(false)
      expect(Age.check('25')).toBe(false)
    })

    it('works with object schemas', () => {
      const Person = Type(
        'person with name and age',
        s.object({
          name: s.string,
          age: s.number,
        })
      )

      expect(Person.check({ name: 'Alice', age: 30 })).toBe(true)
      expect(Person.check({ name: 'Bob' })).toBe(false)
      expect(Person.check({ name: 123, age: 30 })).toBe(false)
    })
  })

  describe('Type(schema)', () => {
    it('creates a type from schema with auto-description', () => {
      const StringType = Type(s.string)
      expect(StringType.description).toBe('string')
      expect(StringType.check('hello')).toBe(true)
      expect(StringType.check(123)).toBe(false)
    })

    it('generates description for number with constraints', () => {
      const BoundedNum = Type(s.number.min(0).max(100))
      expect(BoundedNum.description).toBe('number (0-100)')
    })
  })

  describe('isRuntimeType()', () => {
    it('identifies RuntimeType instances', () => {
      const MyType = Type('test', () => true)
      expect(isRuntimeType(MyType)).toBe(true)
    })

    it('rejects non-RuntimeType values', () => {
      expect(isRuntimeType(null)).toBe(false)
      expect(isRuntimeType(undefined)).toBe(false)
      expect(isRuntimeType('string')).toBe(false)
      expect(isRuntimeType(123)).toBe(false)
      expect(isRuntimeType({})).toBe(false)
      expect(isRuntimeType({ description: 'fake', check: () => true })).toBe(
        false
      )
    })
  })
})

describe('Built-in Types', () => {
  it('TString validates strings', () => {
    expect(TString.check('hello')).toBe(true)
    expect(TString.check('')).toBe(true)
    expect(TString.check(123)).toBe(false)
    expect(TString.check(null)).toBe(false)
  })

  it('TNumber validates numbers', () => {
    expect(TNumber.check(123)).toBe(true)
    expect(TNumber.check(0)).toBe(true)
    expect(TNumber.check(-1.5)).toBe(true)
    expect(TNumber.check(NaN)).toBe(true) // NaN is typeof number
    expect(TNumber.check('123')).toBe(false)
  })

  it('TBoolean validates booleans', () => {
    expect(TBoolean.check(true)).toBe(true)
    expect(TBoolean.check(false)).toBe(true)
    expect(TBoolean.check(1)).toBe(false)
    expect(TBoolean.check('true')).toBe(false)
  })

  it('TInteger validates integers', () => {
    expect(TInteger.check(1)).toBe(true)
    expect(TInteger.check(0)).toBe(true)
    expect(TInteger.check(-5)).toBe(true)
    expect(TInteger.check(1.5)).toBe(false)
    expect(TInteger.check('1')).toBe(false)
  })

  it('TPositiveInt validates positive integers', () => {
    expect(TPositiveInt.check(1)).toBe(true)
    expect(TPositiveInt.check(100)).toBe(true)
    expect(TPositiveInt.check(0)).toBe(false)
    expect(TPositiveInt.check(-1)).toBe(false)
    expect(TPositiveInt.check(1.5)).toBe(false)
  })

  it('TNonEmptyString validates non-empty strings', () => {
    expect(TNonEmptyString.check('hello')).toBe(true)
    expect(TNonEmptyString.check('a')).toBe(true)
    expect(TNonEmptyString.check('')).toBe(false)
    expect(TNonEmptyString.check(123)).toBe(false)
  })

  it('TEmail validates email addresses', () => {
    expect(TEmail.check('user@example.com')).toBe(true)
    expect(TEmail.check('a@b.c')).toBe(true)
    expect(TEmail.check('invalid')).toBe(false)
    expect(TEmail.check('no@domain')).toBe(false)
    expect(TEmail.check('@example.com')).toBe(false)
  })

  it('TUrl validates URLs', () => {
    expect(TUrl.check('https://example.com')).toBe(true)
    expect(TUrl.check('http://localhost:3000')).toBe(true)
    expect(TUrl.check('ftp://files.example.com')).toBe(true)
    expect(TUrl.check('not-a-url')).toBe(false)
    expect(TUrl.check('example.com')).toBe(false)
  })

  it('TUuid validates UUIDs', () => {
    expect(TUuid.check('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(TUuid.check('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
    expect(TUuid.check('not-a-uuid')).toBe(false)
    expect(TUuid.check('550e8400-e29b-41d4-a716')).toBe(false)
  })
})

describe('Type Combinators', () => {
  it('Nullable() allows null', () => {
    const NullableString = Nullable(TString)
    expect(NullableString.check('hello')).toBe(true)
    expect(NullableString.check(null)).toBe(true)
    expect(NullableString.check(undefined)).toBe(false)
    expect(NullableString.check(123)).toBe(false)
    expect(NullableString.description).toBe('string or null')
  })

  it('Optional() allows null and undefined', () => {
    const OptionalNumber = Optional(TNumber)
    expect(OptionalNumber.check(123)).toBe(true)
    expect(OptionalNumber.check(null)).toBe(true)
    expect(OptionalNumber.check(undefined)).toBe(true)
    expect(OptionalNumber.check('123')).toBe(false)
    expect(OptionalNumber.description).toBe('number (optional)')
  })

  it('Union() combines types', () => {
    const StringOrNumber = Union(TString, TNumber)
    expect(StringOrNumber.check('hello')).toBe(true)
    expect(StringOrNumber.check(123)).toBe(true)
    expect(StringOrNumber.check(true)).toBe(false)
    expect(StringOrNumber.check(null)).toBe(false)
    expect(StringOrNumber.description).toBe('string | number')
  })

  it('TArray() validates arrays', () => {
    const StringArray = TArray(TString)
    expect(StringArray.check(['a', 'b', 'c'])).toBe(true)
    expect(StringArray.check([])).toBe(true)
    expect(StringArray.check(['a', 1, 'c'])).toBe(false)
    expect(StringArray.check('not array')).toBe(false)
    expect(StringArray.description).toBe('array of string')
  })

  it('combinators can be nested', () => {
    const OptionalStringArray = Optional(TArray(TNonEmptyString))
    expect(OptionalStringArray.check(['hello', 'world'])).toBe(true)
    expect(OptionalStringArray.check(null)).toBe(true)
    expect(OptionalStringArray.check(undefined)).toBe(true)
    expect(OptionalStringArray.check(['hello', ''])).toBe(false)
  })
})

describe('Runtime Integration', () => {
  describe('checkType() with RuntimeType', () => {
    it('validates with RuntimeType', () => {
      const ZipCode = Type(
        '5-digit zip',
        (s) => typeof s === 'string' && /^\d{5}$/.test(s)
      )

      expect(checkType('12345', ZipCode)).toBe(null)
      expect(checkType('1234', ZipCode)).not.toBe(null)
      expect(checkType(12345, ZipCode)).not.toBe(null)
    })

    it('returns descriptive error for RuntimeType', () => {
      const ZipCode = Type(
        '5-digit zip',
        (s) => typeof s === 'string' && /^\d{5}$/.test(s)
      )

      const err = checkType('bad', ZipCode, 'address.zip')
      expect(isError(err)).toBe(true)
      expect(err?.message).toContain('5-digit zip')
      expect(err?.path).toBe('address.zip')
    })

    it('works with built-in types', () => {
      expect(checkType('hello', TString)).toBe(null)
      expect(checkType(123, TString)).not.toBe(null)

      expect(checkType(42, TPositiveInt)).toBe(null)
      expect(checkType(-1, TPositiveInt)).not.toBe(null)
      expect(checkType(1.5, TPositiveInt)).not.toBe(null)
    })
  })

  describe('validateArgs() with RuntimeType', () => {
    it('validates args with RuntimeType params', () => {
      const ZipCode = Type(
        '5-digit zip',
        (s) => typeof s === 'string' && /^\d{5}$/.test(s)
      )

      const meta = {
        params: {
          zip: { type: ZipCode, required: true },
          count: { type: 'number', required: false },
        },
      }

      expect(validateArgs({ zip: '12345' }, meta)).toBe(null)
      expect(validateArgs({ zip: '12345', count: 5 }, meta)).toBe(null)

      const err = validateArgs({ zip: 'bad' }, meta, 'ship')
      expect(isError(err)).toBe(true)
      expect(err?.message).toContain('5-digit zip')
      expect(err?.path).toBe('ship.zip')
    })

    it('reports missing required RuntimeType param', () => {
      const Email = Type(
        'email',
        (s) => typeof s === 'string' && s.includes('@')
      )

      const meta = {
        params: {
          email: { type: Email, required: true },
        },
      }

      const err = validateArgs({}, meta, 'sendEmail')
      expect(isError(err)).toBe(true)
      expect(err?.message).toContain("Missing required parameter 'email'")
      expect(err?.expected).toBe('email')
    })

    it('mixes string types and RuntimeTypes', () => {
      const PositiveAmount = Type(
        'positive amount',
        (n) => typeof n === 'number' && n > 0
      )

      const meta = {
        params: {
          name: { type: 'string', required: true },
          amount: { type: PositiveAmount, required: true },
          note: { type: 'string', required: false },
        },
      }

      expect(validateArgs({ name: 'Test', amount: 100 }, meta)).toBe(null)
      expect(validateArgs({ name: 'Test', amount: -5 }, meta)).not.toBe(null)
      expect(validateArgs({ name: 123, amount: 100 }, meta)).not.toBe(null)
    })
  })
})

describe('Real-world Types', () => {
  it('US Zip Code', () => {
    const ZipCode = Type(
      '5 or 9 digit US zip code',
      (s) => typeof s === 'string' && /^\d{5}(-\d{4})?$/.test(s)
    )

    expect(ZipCode.check('12345')).toBe(true)
    expect(ZipCode.check('12345-6789')).toBe(true)
    expect(ZipCode.check('1234')).toBe(false)
    expect(ZipCode.check('12345-678')).toBe(false)
  })

  it('Phone Number', () => {
    const PhoneNumber = Type(
      'US phone number',
      (s) => typeof s === 'string' && /^\d{3}-\d{3}-\d{4}$/.test(s)
    )

    expect(PhoneNumber.check('555-123-4567')).toBe(true)
    expect(PhoneNumber.check('5551234567')).toBe(false)
  })

  it('Password (with rules)', () => {
    const Password = Type(
      'password (8+ chars, uppercase, lowercase, number)',
      (s) =>
        typeof s === 'string' &&
        s.length >= 8 &&
        /[A-Z]/.test(s) &&
        /[a-z]/.test(s) &&
        /[0-9]/.test(s)
    )

    expect(Password.check('Secret123')).toBe(true)
    expect(Password.check('secret123')).toBe(false) // no uppercase
    expect(Password.check('SECRET123')).toBe(false) // no lowercase
    expect(Password.check('Secretabc')).toBe(false) // no number
    expect(Password.check('Sec1')).toBe(false) // too short
  })
})
