/**
 * TJS Type System
 *
 * Runtime types with descriptions and validation.
 */

export {
  Type,
  isRuntimeType,
  type RuntimeType,
  // Built-in types
  TString,
  TNumber,
  TBoolean,
  TInteger,
  TPositiveInt,
  TNonEmptyString,
  TEmail,
  TUrl,
  TUuid,
  Timestamp as TimestampType,
  LegalDate as LegalDateType,
  // Portable predicate helpers
  isValidUrl,
  isValidTimestamp,
  isValidLegalDate,
  // Combinators
  Nullable,
  Optional,
  Union,
  TArray,
  // Enum
  Enum,
  type EnumType,
  // Generics
  Generic,
  TPair,
  TRecord,
  type GenericType,
  type TypeParam,
  // Function predicates
  FunctionPredicate,
  type FunctionPredicateType,
  type FunctionPredicateSpec,
  type ReturnContract,
} from './Type'

// Timestamp and LegalDate utilities (pure functions)
export { Timestamp, type TimestampString } from './Timestamp'
export { LegalDate, type LegalDateString } from './LegalDate'
