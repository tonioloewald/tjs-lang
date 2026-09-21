/**
 * TJS Type System
 *
 * Runtime types with descriptions and validation.
 */

export {
  // The Predicate brand. Omitted from this list until 0.14.0, which meant it reached NO
  // published entry point — `import { Predicate } from 'tjs-lang'` was a hard SyntaxError
  // while the CHANGELOG shipped `Age instanceof Predicate` as a copyable example.
  Predicate,
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
  TimestampISO,
  LegalDate as LegalDateType,
  // Portable predicate helpers
  isValidUrl,
  isValidTimestamp,
  isValidISOTimestamp,
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
  type GenericFunctionPredicateType,
  type FunctionPredicateSpec,
  type ReturnContract,
} from './Type'

// Timestamp and LegalDate utilities (pure functions)
export { Timestamp, type TimestampString } from './Timestamp'
export { LegalDate, type LegalDateString } from './LegalDate'
